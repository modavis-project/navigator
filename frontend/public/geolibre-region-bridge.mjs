import { Map as MapLibreMap } from "/geolibre/assets/maplibre-gl-B90lU6TM.js";

// This adapter runs only inside Navigator's same-origin GeoLibre iframe.
const origin = location.origin;
const boundarySource = "navigator-region-boundaries";
const focusSource = "navigator-region-focus";
const regionHitLayer = "navigator-region-hit";
const regionBadgeLayer = "navigator-region-count-circle";
const collection = features => ({ type: "FeatureCollection", features });
const empty = collection([]);
const send = (event, fields) => parent.postMessage({ type: "navigator:map-regions", event, ...fields }, origin);
const markerLayer = layer => /^navigator-(?:marker|count)-modavis-/.test(layer.id);

function isSameOriginEmbed() {
  try { return parent !== window && parent.location.origin === origin; }
  catch { return false; }
}

// GeoLibre's pinned scripting channel does not expose pointer events or its
// live map. Capture the map on its first event, then restore the original API.
if (isSameOriginEmbed()) {
  const prototype = MapLibreMap.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(prototype, "fire");
  const original = prototype.fire;
  const stop = () => {
    if (prototype.fire !== capture) return;
    if (descriptor) Object.defineProperty(prototype, "fire", descriptor);
    else delete prototype.fire;
  };
  function capture(...args) {
    const result = original.apply(this, args);
    if (this.getCanvas()?.ownerDocument === document) {
      stop();
      queueMicrotask(() => observe(this));
    }
    return result;
  }
  prototype.fire = capture;
  window.setTimeout(stop, 15000);
  const canvas = document.querySelector(".maplibregl-canvas");
  canvas?.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
}

function observe(map) {
  const originalOpacity = [];
  const counts = new Map();
  let features = new Map();
  let hovered;
  let selected;
  let focusKey;
  let paintedGeometry;
  let frame;
  let pointer;
  let timer;
  let viewport;
  let viewportController;

  function install() {
    const layers = map.getStyle()?.layers;
    if (!layers?.some(markerLayer) || map.getSource(boundarySource)) return;
    const before = layers.find(layer => layer.type === "symbol")?.id;
    const placeLabels = layers.find(layer => layer.type === "symbol" && !markerLayer(layer))?.id;
    map.addSource(boundarySource, { type: "geojson", data: empty, attribution: '<a href="/basemap/assets-v2/region-boundaries-v1.txt" target="_blank" rel="noopener">Boundary credits</a>' });
    map.addSource(focusSource, { type: "geojson", data: empty });
    map.addLayer({ id: regionHitLayer, source: boundarySource, type: "fill", paint: { "fill-opacity": 0 } }, before);
    map.addLayer({ id: "navigator-region-highlight", source: focusSource, type: "fill", paint: {
      "fill-color": "#58a894", "fill-opacity": 0.14,
    } }, layers.find(markerLayer).id);
    map.addLayer({ id: "navigator-region-outline", source: focusSource, type: "line", paint: {
      "line-color": "#176453", "line-width": 2.5, "line-opacity": 0.94,
    } }, before);
    map.addLayer({ id: regionBadgeLayer, source: focusSource, type: "circle", filter: ["==", ["geometry-type"], "Point"], paint: {
      "circle-color": "#225e55", "circle-radius": 17, "circle-stroke-color": "#fffdf6", "circle-stroke-width": 1.8,
      "circle-translate": [0, -20], "circle-translate-anchor": "viewport",
    } }, placeLabels);
    map.addLayer({ id: "navigator-region-count-label", source: focusSource, type: "symbol", filter: ["==", ["geometry-type"], "Point"], layout: {
      "text-field": ["get", "label"], "text-font": ["Noto Sans Bold"], "text-size": 12,
      "text-allow-overlap": true, "text-ignore-placement": true,
    }, paint: { "text-color": "#fffdf6", "text-translate": [0, -20], "text-translate-anchor": "viewport" } }, placeLabels);
    originalOpacity.length = 0;
    for (const layer of layers.filter(markerLayer)) {
      for (const key of layer.type === "circle" ? ["circle-opacity", "circle-stroke-opacity"] : ["text-opacity"]) {
        originalOpacity.push([layer.id, key, map.getPaintProperty(layer.id, key)]);
      }
    }
    focusKey = undefined;
    paintedGeometry = undefined;
    viewport = undefined;
    paintFocus();
    scheduleViewport();
    send("ready");
  }

  function focusedOpacity(value, geometry) {
    // Grid groups are styled by their own map anchor. The separate region
    // badge is the count from documented area membership.
    const visibility = ["case", ["within", geometry], 1, 0.29];
    const scale = part => ["*", part ?? 1, ["var", "regionOpacity"]];
    let expression = scale(value);
    if (Array.isArray(value) && (value[0] === "step" || value[0] === "interpolate")) {
      // Keep the camera expression intact apart from its output stops. The
      // binding avoids putting a copy of the polygon into every stop.
      const first = value[0] === "step" ? 2 : 4;
      expression = value.map((part, index) => index >= first && (index - first) % 2 === 0 ? scale(part) : part);
    }
    return ["let", "regionOpacity", visibility, expression];
  }

  function paintFocus() {
    const source = map.getSource(focusSource);
    if (!source) return;
    const active = hovered ?? selected;
    const id = active?.properties.id;
    const count = counts.get(id);
    const key = id ? id + ":" + (count ?? "") : null;
    const geometry = active?.geometry;
    const geometryChanged = geometry !== paintedGeometry;
    if (key === focusKey && !geometryChanged) return;
    focusKey = key;
    if (geometryChanged) {
      paintedGeometry = geometry;
      for (const [layer, property, value] of originalOpacity) {
        if (map.getLayer(layer)) map.setPaintProperty(layer, property, geometry ? focusedOpacity(value, geometry) : (value ?? null));
      }
    }
    const overlay = active ? [active] : [];
    if (active && count != null) overlay.push({
      type: "Feature", geometry: { type: "Point", coordinates: active.properties.label }, properties: { label: count },
    });
    source.setData(collection(overlay));
  }

  const wrapped = value => ((value + 180) % 360 + 360) % 360 - 180;
  const digits = value => Number(value.toFixed(5));
  function scheduleViewport() {
    window.clearTimeout(timer);
    timer = window.setTimeout(readViewport, 100);
  }
  async function readViewport() {
    if (!map.getSource(boundarySource)) return;
    const bounds = map.getBounds();
    const west = bounds.getWest();
    const east = bounds.getEast();
    const bbox = [
      east - west >= 360 ? -180 : wrapped(west),
      Math.max(-90, bounds.getSouth()),
      east - west >= 360 ? 180 : wrapped(east),
      Math.min(90, bounds.getNorth()),
    ].map(digits).join(",");
    const params = new URLSearchParams({ bbox, zoom: String(digits(map.getZoom())), v: "2" });
    if (params.toString() === viewport) return;
    viewport = params.toString();
    viewportController?.abort();
    const controller = new AbortController();
    viewportController = controller;
    try {
      const response = await fetch("/api/map/regions.geojson?" + params, { credentials: "same-origin", signal: controller.signal });
      if (!response.ok) throw new Error("Boundary request failed");
      const data = await response.json();
      if (controller.signal.aborted || !map.getSource(boundarySource)) return;
      features = new Map(data.features.map(feature => [feature.properties.id, feature]));
      if (selected) selected = features.get(selected.properties.id) ?? selected;
      if (hovered) hovered = features.get(hovered.properties.id) ?? hovered;
      paintFocus();
      map.getSource(boundarySource).setData(data);
      send("available", { areas: data.features.map(feature => feature.properties) });
    } catch {
      if (!controller.signal.aborted) viewport = undefined;
    }
  }

  function at(point) {
    if (!map.getLayer(regionHitLayer)) return null;
    if (hovered && map.queryRenderedFeatures(point, { layers: [regionBadgeLayer] }).length) return hovered;
    let picked;
    for (const hit of map.queryRenderedFeatures(point, { layers: [regionHitLayer] })) {
      const feature = features.get(hit.properties.id);
      if (feature && (!picked || feature.properties.rank > picked.properties.rank)) picked = feature;
    }
    return picked ?? null;
  }
  function hover(feature) {
    if (hovered?.properties.id === feature?.properties.id) return;
    hovered = feature;
    map.getCanvas().style.cursor = feature ? "pointer" : "";
    send("hover", { area: feature?.properties ?? null });
    paintFocus();
  }
  function select(feature) {
    pointer = undefined;
    hovered = undefined;
    selected = feature;
    send("select", { area: feature.properties });
    paintFocus();
    const [west, south, east, north] = feature.properties.bounds;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const padding = Math.min(56, Math.round(map.getCanvas().clientWidth * 0.13));
    map.fitBounds([[west, south], [east < west ? east + 360 : east, north]], { padding, duration: reduced ? 0 : 500, maxZoom: 16 });
  }
  function clickTarget(point) {
    if (!map.getLayer(regionHitLayer)) return null;
    if (hovered && map.queryRenderedFeatures(point, { layers: [regionBadgeLayer] }).length) return hovered;
    const markers = map.getStyle().layers.filter(markerLayer).map(layer => layer.id);
    return map.queryRenderedFeatures(point, { layers: markers }).length ? null : at(point);
  }

  function updateHover() {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      if (pointer && !map.isMoving()) hover(at(pointer));
    });
  }
  map.on("styledata", install);
  map.on("moveend", scheduleViewport);
  map.on("movestart", () => hover(null));
  map.on("sourcedata", event => {
    if (event.sourceId === boundarySource && event.isSourceLoaded) updateHover();
  });
  map.on("mousemove", event => {
    pointer = event.point;
    updateHover();
  });
  map.getCanvas().addEventListener("pointerleave", () => {
    pointer = undefined;
    cancelAnimationFrame(frame);
    hover(null);
  });
  // On a boundary click, let the region handle it before GeoLibre’s generic
  // click bridge. Existing site and cluster clicks keep their own handlers.
  map.getCanvasContainer().addEventListener("click", event => {
    if (event.target !== map.getCanvas() || map.isMoving()) return;
    const rect = map.getCanvas().getBoundingClientRect();
    const feature = clickTarget([event.clientX - rect.left, event.clientY - rect.top]);
    if (!feature) return;
    event.stopImmediatePropagation();
    select(feature);
  }, true);
  window.addEventListener("message", event => {
    if (event.origin !== origin || event.source !== parent || event.data?.type !== "navigator:map-regions") return;
    const { event: action, id, count } = event.data;
    if (action === "count" && typeof id === "string" && typeof count === "string") {
      if (counts.size >= 100) counts.delete(counts.keys().next().value);
      counts.set(id, count);
      paintFocus();
    } else if (action === "choose" && features.has(id)) {
      select(features.get(id));
    } else if (action === "clear") {
      pointer = undefined;
      selected = undefined;
      hover(null);
      paintFocus();
    }
  });
  install();
}
