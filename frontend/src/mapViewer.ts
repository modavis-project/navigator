import {
  FullscreenControl, GlobeControl, LngLat, Map as MapLibreMap, Marker, NavigationControl,
  ScaleControl, getVersion, setWorkerUrl, type StyleSpecification,
} from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import "maplibre-gl/dist/maplibre-gl.css";
import "./mapViewer.css";

const origin = location.origin;
const projectPath = "/api/map/project.geolibre.json";
const stylePath = "/api/map/marker-style.json";

function send(type: string, details?: object): void {
  if (parent !== window) parent.postMessage({ type, ...details }, origin);
}

function validCenter(value: unknown): value is [number, number] {
  return Array.isArray(value) && value.length === 2 && value.every(Number.isFinite)
    && Math.abs(value[1]) <= 90;
}

function validZoom(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 24;
}

function projectBounds(value: unknown): [[number, number], [number, number]] | undefined {
  if (!Array.isArray(value) || value.length !== 4 || !value.every(Number.isFinite)) return undefined;
  const [west, south, east, north] = value;
  if (west > east || east - west > 360 || south > north || south < -90 || north > 90) return undefined;
  return [[west, south], [east, north]];
}

async function loadProject(projectUrl: URL, signal: AbortSignal) {
  const response = await fetch(projectUrl, {
    credentials: "same-origin",
    redirect: "error",
    signal,
  });
  if (!response.ok) throw new Error("Navigator map project unavailable");
  const project = await response.json();
  const style = new URL(project.basemapStyleUrl, origin);
  if (style.origin !== origin || style.pathname !== stylePath
    || project.metadata?.visibility !== "public" || !Array.isArray(project.layers)
    || !validCenter(project.mapView?.center) || !validZoom(project.mapView?.zoom)) {
    throw new Error("Unsupported Navigator map project");
  }
  style.searchParams.set("source_layout", "combined");
  style.searchParams.set("basemap_detail", "viewport-v1");
  return { project, style };
}

function worldSettings(bounds: ReturnType<typeof projectBounds>) {
  const wide = !!bounds && bounds[1][0] - bounds[0][0] > 180;
  const renderWorldCopies = !wide || bounds[1][0] > 180;
  return {
    renderWorldCopies,
    // Wide selections can be shorter than a phone's canvas. Leave vertical
    // space around the world instead of cropping its east and west edges.
    transformConstrain: wide ? (center: LngLat, zoom: number) => ({
      center: new LngLat(
        renderWorldCopies ? center.lng : Math.max(-180, Math.min(180, center.lng)),
        Math.max(-85, Math.min(85, center.lat)),
      ),
      zoom: Math.max(-2, Math.min(22, zoom)),
    }) : null,
  };
}

function catalogSelection(url: URL): string {
  const selection = new URL(url);
  selection.searchParams.delete("precision");
  return selection.href;
}

async function startMap(): Promise<void> {
  const URLParameter = new URLSearchParams(location.search).get("url");
  let appliedUrl = new URL(URLParameter ?? "", origin);
  if (appliedUrl.origin !== origin || appliedUrl.pathname !== projectPath) {
    throw new Error("Unsupported Navigator map");
  }
  const initial = await loadProject(appliedUrl, AbortSignal.timeout(15000));
  let project = initial.project;
  let appliedStyle = initial.style.href;

  setWorkerUrl(workerUrl);
  const bounds = projectBounds(project.mapView.bbox);
  const map = new MapLibreMap({
    container: "map",
    style: appliedStyle,
    center: project.mapView.center,
    zoom: project.mapView.zoom,
    bearing: project.mapView.bearing,
    pitch: project.mapView.pitch,
    bounds,
    fitBoundsOptions: bounds ? { padding: 48, maxZoom: 14 } : undefined,
    ...worldSettings(bounds),
  });
  map.addControl(new NavigationControl({ visualizePitch: true }), "top-right");
  if (document.fullscreenEnabled) map.addControl(new FullscreenControl(), "top-right");
  map.addControl(new GlobeControl(), "top-right");
  map.addControl(new ScaleControl({ unit: "metric" }), "bottom-left");

  // Bind the existing Navigator inspection to the native map. The full
  // GeoLibre shell continues to handle legacy and research project types.
  const bridgeUrl = new URL("/geolibre-region-bridge.mjs?v=3", origin);
  const bridge = import(/* @vite-ignore */ bridgeUrl.href).then(({ observeNavigatorMap }) =>
    observeNavigatorMap(map, { projectUrl: appliedUrl.href }) as { clearSelection: (projectUrl: string) => void });
  let timeout: number | undefined;
  const loaded = new Promise<void>((resolve, reject) => {
    timeout = window.setTimeout(() => reject(new Error("Map style unavailable")), 16000);
    map.once("load", () => resolve());
  });
  try {
    await Promise.all([bridge, loaded]);
  } catch (error) {
    map.remove();
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }

  const inspection = await bridge;
  const state = () => send("geolibre:state", { project, projectUrl: appliedUrl.href });
  let pending: AbortController | undefined;
  async function changeProject(url: URL) {
    pending?.abort();
    if (url.href === appliedUrl.href) {
      state();
      return;
    }
    const controller = new AbortController();
    pending = controller;
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]);
    try {
      const next = await loadProject(url, signal);
      const nextBounds = projectBounds(next.project.mapView.bbox);
      const refit = catalogSelection(url) !== catalogSelection(appliedUrl)
        || JSON.stringify(nextBounds) !== JSON.stringify(projectBounds(project.mapView.bbox));
      let nextStyle: StyleSpecification | undefined;
      if (next.style.href !== appliedStyle) {
        const response = await fetch(next.style, { credentials: "same-origin", redirect: "error", signal });
        if (!response.ok) throw new Error("Navigator map style unavailable");
        nextStyle = await response.json();
        if (nextStyle?.version !== 8 || !nextStyle.sources?.["source-modavis-combined-places-v1"]) {
          throw new Error("Unsupported Navigator map style");
        }
      }
      if (signal.aborted) return;
      inspection.clearSelection(url.href);
      if (nextStyle) {
        const current = map.getStyle();
        // MapLibre normalizes the GeoJSON URL internally. Keep live basemap
        // sources so their serialized form does not trigger a data reload.
        for (const id of ["navigator-geography", "openmaptiles"]) {
          if (current.sources[id] && nextStyle.sources[id]) nextStyle.sources[id] = current.sources[id];
        }
        map.setStyle({ ...nextStyle, projection: current.projection }, { diff: true });
      }
      if (refit) {
        const settings = worldSettings(nextBounds);
        map.stop();
        map.setTransformConstrain(settings.transformConstrain);
        map.setRenderWorldCopies(settings.renderWorldCopies);
        if (nextBounds) map.fitBounds(nextBounds, { padding: 48, maxZoom: 14, duration: 0 });
        else map.jumpTo(next.project.mapView);
      }
      project = next.project;
      appliedUrl = url;
      appliedStyle = next.style.href;
      state();
    } catch {
      if (!controller.signal.aborted) {
        send("geolibre:error", { projectUrl: url.href, message: "Navigator map selection unavailable" });
      }
    } finally {
      if (pending === controller) pending = undefined;
    }
  }
  window.addEventListener("message", ({ origin: messageOrigin, source, data }) => {
    if (messageOrigin !== origin || source !== parent || parent === window || !data) return;
    if (data.type === "geolibre:request-state") {
      state();
      return;
    }
    if (data.type === "navigator:map-project" && typeof data.url === "string") {
      const url = new URL(data.url, origin);
      if (url.origin === origin && url.pathname === projectPath) void changeProject(url);
      return;
    }
    if (data.type !== "geolibre:command" || typeof data.requestId !== "string") return;
    const { requestId, method, params } = data;
    if (method === "getView") {
      send("geolibre:result", {
        requestId,
        value: {
          center: map.getCenter().toArray(),
          zoom: map.getZoom(),
          pitch: map.getPitch(),
          bearing: map.getBearing(),
          bbox: map.getBounds().toArray().flat(),
        },
      });
    } else if (method === "flyTo" && validCenter(params?.center) && validZoom(params?.zoom)) {
      const duration = Number.isFinite(params.duration) ? Math.max(0, Math.min(params.duration, 3000)) : undefined;
      map.flyTo({ center: params.center, zoom: params.zoom, duration });
    }
  });
  send("geolibre:ready", { version: getVersion() });
  state();
}

const previewParams = new URLSearchParams(location.hash.slice(1));
const preview = previewParams.has("preview");
if (preview) setWorkerUrl(workerUrl);
void (preview
  ? import("./map-viewer-preview").then(({ startPreviewMap }) => startPreviewMap(MapLibreMap, Marker, previewParams))
  : startMap()).catch(() => {
  document.getElementById("map-error")?.removeAttribute("hidden");
  if (preview) send("navigator:map-preview-error");
  else send("geolibre:error", { message: "Navigator map viewer unavailable" });
});
