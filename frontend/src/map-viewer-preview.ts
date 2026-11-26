import type { Map as MapLibreMap, Marker } from "maplibre-gl";

type Position = [number, number];

export async function startPreviewMap(MapClass: typeof MapLibreMap, MarkerClass: typeof Marker, params: URLSearchParams) {
  const raw: unknown = JSON.parse(params.get("preview") ?? "null");
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > 12 || !raw.every((value): value is Position => (
    Array.isArray(value) && value.length === 2 && value.every(Number.isFinite)
    && Math.abs(value[0]) <= 180 && Math.abs(value[1]) <= 90
  ))) throw new Error("Preview map coordinates unavailable");

  const longitudes = raw.map(point => point[0]).sort((a, b) => a - b);
  // Cut at the largest empty interval so points on opposite sides of the date line stay together.
  let west = longitudes[0];
  let largestGap = west + 360 - longitudes[longitudes.length - 1];
  for (let index = 1; index < longitudes.length; index++) {
    const gap = longitudes[index] - longitudes[index - 1];
    if (gap > largestGap) {
      largestGap = gap;
      west = longitudes[index];
    }
  }
  const points = raw.map(([lon, lat]): Position => [lon < west ? lon + 360 : lon, Math.max(-85, Math.min(85, lat))]);
  const latitudes = points.map(point => point[1]);
  const bounds: [number, number, number, number] = [
    west, Math.min(...latitudes), Math.max(...points.map(point => point[0])), Math.max(...latitudes),
  ];
  const fit = { padding: 24, maxZoom: 13, duration: 0 };
  const map = new MapClass({
    container: "map", style: "/basemap/assets-v2/style.json", bounds, fitBoundsOptions: fit,
    interactive: false, attributionControl: false,
  });
  document.documentElement.lang = params.get("lang") === "de" ? "de" : "en";
  await new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      map.remove();
      reject(new Error("Preview basemap unavailable"));
    }, 16000);
    map.once("load", () => { window.clearTimeout(timeout); resolve(); });
  });

  let markers: Marker[] = [];
  let selected: number[] = [];
  const renderMarkers = () => {
    markers.forEach(marker => marker.remove());
    const groups: Array<{ center: Position; x: number; y: number; indices: number[] }> = [];
    points.forEach((point, index) => {
      const { x, y } = map.project(point);
      const near = groups.find(group => Math.hypot(group.x - x, group.y - y) < 30);
      if (near) near.indices.push(index);
      else groups.push({ center: point, x, y, indices: [index] });
    });
    const buttons = groups.map(group => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "preview-map-marker";
      const count = group.indices.length;
      button.textContent = count === 1 ? "" : String(count);
      button.setAttribute("aria-label", document.documentElement.lang === "de"
        ? count === 1 ? "Orgeldatensatz anzeigen" : `${count} Orgeldatensätze anzeigen`
        : count === 1 ? "Show organ record" : `Show ${count} organ records`);
      button.setAttribute("aria-pressed", String(group.indices.some(index => selected.includes(index))));
      button.addEventListener("click", () => {
        selected = group.indices;
        buttons.forEach(item => item.setAttribute("aria-pressed", String(item === button)));
        parent.postMessage({ type: "navigator:map-preview-marker", indices: selected }, location.origin);
      });
      return button;
    });
    markers = groups.map((group, index) => new MarkerClass({ element: buttons[index] }).setLngLat(group.center).addTo(map));
  };
  renderMarkers();
  map.on("resize", () => { map.fitBounds(bounds, fit); renderMarkers(); });
  parent.postMessage({ type: "navigator:map-preview-ready" }, location.origin);
}
