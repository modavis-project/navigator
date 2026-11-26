// Keep map inspection in Navigator's same-origin viewer.
const origin = location.origin;
const boundarySource = "navigator-region-boundaries";
const focusSource = "navigator-region-focus";
const markerFocusSource = "navigator-marker-focus";
const regionHitLayer = "navigator-region-hit";
const regionBadgeLayer = "navigator-region-count-circle";
const collection = features => ({ type: "FeatureCollection", features });
const empty = collection([]);
const send = (event, fields) => parent.postMessage({ type: "navigator:map-regions", event, ...fields }, origin);
const markerLayer = layer => /^navigator-marker-modavis-/.test(layer.id);
const densityLayer = layer => /^navigator-density-modavis-/.test(layer.id);
const siteSource = /^source-modavis-(?:reviewed-current|locality-fallback|combined)-places-v1$/;
const activeMaps = new WeakSet();

function isSameOriginEmbed() {
  try { return parent !== window && parent.location.origin === origin; }
  catch { return false; }
}

// GeoLibre's pinned scripting channel does not expose pointer events or its
// live map. Capture the map on its first event, then restore the original API.
async function observeLegacyFrame() {
  const { Map: MapLibreMap } = await import("/geolibre/assets/maplibre-gl-B90lU6TM.js");
  const regionOverlay = new URL(import.meta.url).searchParams.get("areas") !== "0";
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
      queueMicrotask(() => observeNavigatorMap(this, { regionOverlay }));
    }
    return result;
  }
  prototype.fire = capture;
  window.setTimeout(stop, 15000);
  const canvas = document.querySelector(".maplibregl-canvas");
  canvas?.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
}
if (isSameOriginEmbed() && location.pathname === "/geolibre/index.html") {
  void observeLegacyFrame();
}

function attachMarkerInspection(map, regionOverlay) {
  const canvas = map.getCanvas();
  let markerIds = [];
  let visible;
  let available;
  let tracked;
  let pinned;
  let pinnedCamera;
  let readoutKey;
  let currentReadout;
  let timer;
  let touch = false;
  const clusterCounts = new Map();
  function install() {
    if (markerIds.length && markerIds.every(id => map.getLayer(id)) && map.getSource(markerFocusSource)) return;
    const layers = map.getStyle()?.layers ?? [];
    const native = layers.filter(markerLayer);
    // Small area maps can still be drawn from an inline GeoJSON source.
    markerIds = (native.length || regionOverlay
      ? native
      : layers.filter(layer => layer.type === "circle" && siteSource.test(layer.source)))
      .map(layer => layer.id);
    visible = undefined;
    if (!markerIds.length || map.getSource(markerFocusSource)) return;
    map.addSource(markerFocusSource, { type: "geojson", data: empty });
    map.addLayer({
      id: "navigator-marker-inspection",
      source: markerFocusSource,
      type: "circle",
      paint: {
        "circle-radius": ["case", ["get", "aggregate"], 13, 8],
        "circle-color": "#225e55", "circle-opacity": 0,
        "circle-stroke-color": "#225e55", "circle-stroke-width": 2,
      },
    }, layers.find(layer => layer.type === "symbol")?.id);
    if (!native.length) {
      for (const layer of layers) {
        if (layer.type === "symbol" && layer.id.endsWith("-cluster-count") && siteSource.test(layer.source)) {
          map.setLayoutProperty(layer.id, "visibility", "none");
        }
      }
    }
  }

  function markerFrom(feature) {
    const properties = feature.properties;
    const layerId = feature.layer.id.replace(/^navigator-marker-/, "").replace(/-overview$/, "");
    const projectLayer = /^modavis-/.test(layerId) ? layerId : feature.source?.slice(7);
    if (!projectLayer || feature.geometry.type !== "Point") return null;
    const [longitude, latitude] = feature.geometry.coordinates;
    const coordinates = [longitude + Math.round((map.getCenter().lng - longitude) / 360) * 360, latitude];
    const aggregate = [true, "true"].includes(properties.aggregate) || [true, "true"].includes(properties.cluster);
    const siteCount = aggregate ? Number(properties.point_count) : 1;
    const organCount = properties.entityCount == null ? null : Number(properties.entityCount);
    const siteGroupId = typeof properties.siteGroupId === "string" ? properties.siteGroupId : null;
    if ((!aggregate && !siteGroupId) || !Number.isSafeInteger(siteCount) || siteCount < 1) return null;
    return {
      key: projectLayer + ":" + (siteGroupId ?? properties.cluster_id ?? (longitude + "," + latitude)),
      coordinates, source: feature.source, layerId: projectLayer, properties,
      siteGroupId, siteCount, aggregate,
      organCount: Number.isSafeInteger(organCount) && organCount >= 0 ? organCount : null,
      title: typeof properties.title === "string" ? properties.title : null,
      approximate: projectLayer === "modavis-locality-fallback-places-v1"
        || [true, "true", 1].includes(properties.coordinateFallback),
    };
  }

  function query(box) {
    if (!markerIds.length) return [];
    return (box
      ? map.queryRenderedFeatures(box, { layers: markerIds })
      : map.queryRenderedFeatures({ layers: markerIds }))
      .map(markerFrom).filter(Boolean);
  }

  function nearest(point, radius) {
    const [x, y] = Array.isArray(point) ? point : [point.x, point.y];
    let best;
    let bestDistance = Infinity;
    for (const marker of query([[x - radius, y - radius], [x + radius, y + radius]])) {
      const screen = map.project(marker.coordinates);
      const distance = (screen.x - x) ** 2 + (screen.y - y) ** 2;
      if (distance < bestDistance) {
        best = marker;
        bestDistance = distance;
      }
    }
    return best;
  }

  function publish(marker, organCount) {
    const info = marker ? {
      siteCount: marker.siteCount, organCount, aggregate: marker.aggregate,
      siteGroupId: marker.siteGroupId, title: marker.title, approximate: marker.approximate,
    } : null;
    currentReadout = { marker: info, pinned: !!marker && marker.key === pinned?.key };
    send("marker", currentReadout);
  }

  function show(marker) {
    const key = marker ? marker.key + ":" + (marker.key === pinned?.key) : null;
    if (readoutKey === key) return;
    readoutKey = key;
    map.getSource(markerFocusSource)?.setData(marker ? collection([{
      type: "Feature", geometry: { type: "Point", coordinates: marker.coordinates },
      properties: { aggregate: marker.aggregate },
    }]) : empty);
    if (!marker || marker.organCount != null) {
      publish(marker, marker?.organCount);
      return;
    }
    const id = Number(marker.properties.cluster_id);
    const source = map.getSource(marker.source);
    if (!Number.isSafeInteger(id) || !source?.getClusterLeaves) {
      publish(marker, null);
      return;
    }
    // Inline area clusters are built in the map worker. Read their members
    // locally, without another request to the catalogue.
    if (!clusterCounts.has(marker.key)) {
      if (clusterCounts.size >= 40) clusterCounts.delete(clusterCounts.keys().next().value);
      clusterCounts.set(marker.key, source.getClusterLeaves(id, marker.siteCount, 0)
        .then(features => features.reduce((total, leaf) => total + (Number(leaf.properties.entityCount) || 0), 0))
        .catch(() => null));
    }
    publish(marker, null);
    void clusterCounts.get(marker.key).then(total => {
      if (readoutKey === key) publish(marker, total);
    });
  }

  function track(point) {
    const marker = point ? nearest(point, 4) : undefined;
    if (marker?.key === tracked?.key) return marker;
    tracked = marker;
    window.clearTimeout(timer);
    if (!marker) show(pinned);
    else timer = window.setTimeout(() => show(marker), 120);
    return marker;
  }

  function clearPreview() {
    tracked = undefined;
    window.clearTimeout(timer);
    show(pinned);
  }

  // MapLibre also emits movement events when the inspector changes the
  // iframe's dimensions. Keep the selection while the camera is unchanged.
  function cameraKey() {
    const { lng, lat } = map.getCenter();
    return [lng, lat, map.getZoom(), map.getBearing(), map.getPitch()].join(",");
  }

  function pin(marker) {
    pinned = marker;
    pinnedCamera = cameraKey();
    clearPreview();
  }

  function clear() {
    pinned = undefined;
    pinnedCamera = undefined;
    clearPreview();
  }

  function reset() {
    clusterCounts.clear();
    visible = undefined;
    clear();
  }

  function open(marker = pinned) {
    if (!marker) return;
    clear();
    parent.postMessage({ type: "geolibre:event", event: "click", payload: {
      lngLat: marker.coordinates,
      features: [{ layerId: marker.layerId, properties: marker.properties }],
    } }, origin);
  }

  function click(point, event) {
    const tapped = (event.pointerType || (touch ? "touch" : "")) === "touch";
    const marker = nearest(point, tapped ? 13 : 0);
    if (!marker) return false;
    event.stopImmediatePropagation();
    if (tapped && pinned?.key !== marker.key) {
      pin(marker);
    } else {
      open(marker);
    }
    return true;
  }

  function visibleMarkers() {
    if (visible) return visible;
    const entries = new Map();
    for (const marker of query()) {
      const { x, y } = map.project(marker.coordinates);
      if (x >= 0 && y >= 0 && x <= canvas.clientWidth && y <= canvas.clientHeight) {
        entries.set(marker.key, { x, y, marker });
      }
    }
    visible = [...entries.values()].sort((left, right) => left.y - right.y || left.x - right.x);
    return visible;
  }

  function step(direction) {
    if (map.isMoving()) return;
    const entries = visibleMarkers();
    if (!entries.length) return;
    const current = entries.findIndex(entry => entry.marker.key === pinned?.key);
    if (current === -1) {
      const distance = ({ x, y }) => (x - canvas.clientWidth / 2) ** 2 + (y - canvas.clientHeight / 2) ** 2;
      pin(entries.reduce((best, entry) => distance(entry) < distance(best) ? entry : best).marker);
    } else {
      pin(entries[(current + direction + entries.length) % entries.length].marker);
    }
  }

  function refreshAvailability() {
    const next = visibleMarkers().length > 0;
    if (available !== next) {
      available = next;
      send("markers-available", { available });
    }
  }
  function replay() {
    if (available !== undefined) send("markers-available", { available });
    if (currentReadout) send("marker", currentReadout);
  }
  canvas.addEventListener("pointerdown", event => { touch = event.pointerType === "touch"; });
  map.on("styledata", install);
  map.on("moveend", () => {
    visible = undefined;
    if (pinned && pinnedCamera !== cameraKey()) clear();
  });
  map.on("resize", () => { visible = undefined; });
  map.on("sourcedata", event => {
    if (event.sourceDataType === "content" && siteSource.test(event.sourceId)) visible = undefined;
  });
  map.on("idle", refreshAvailability);
  install();
  // The legacy bridge may be attached after the first idle event.
  if (map.loaded()) refreshAvailability();
  return { track, clearPreview, clear, reset, open, click, step, replay };
}

export function observeNavigatorMap(map, { regionOverlay = true, projectUrl } = {}) {
  if (activeMaps.has(map)) return;
  activeMaps.add(map);
  const markers = attachMarkerInspection(map, regionOverlay);
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
    if (!regionOverlay || map.getSource(boundarySource)) return;
    const layers = map.getStyle()?.layers;
    if (!layers?.some(markerLayer)) return;
    const before = layers.find(layer => layer.type === "symbol")?.id;
    const placeLabels = layers.find(layer => layer.type === "symbol" && !markerLayer(layer))?.id;
    map.addSource(boundarySource, { type: "geojson", data: collection([...features.values()]), attribution: '<a href="/basemap/assets-v2/region-boundaries-v1.txt" target="_blank" rel="noopener">Boundary credits</a>' });
    map.addSource(focusSource, { type: "geojson", data: empty });
    map.addLayer({ id: regionHitLayer, source: boundarySource, type: "fill", paint: { "fill-opacity": 0 } }, before);
    map.addLayer({ id: "navigator-region-highlight", source: focusSource, type: "fill", paint: {
      "fill-color": "#58a894", "fill-opacity": 0.14,
    } }, layers.find(layer => densityLayer(layer) || markerLayer(layer)).id);
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
    for (const layer of layers.filter(layer => markerLayer(layer) || densityLayer(layer))) {
      for (const key of densityLayer(layer) ? ["heatmap-weight"] : ["circle-opacity", "circle-stroke-opacity"]) {
        originalOpacity.push([layer.id, key, map.getPaintProperty(layer.id, key)]);
      }
    }
    focusKey = undefined;
    paintedGeometry = undefined;
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
    let picked;
    for (const hit of map.queryRenderedFeatures(point, { layers: [regionHitLayer] })) {
      const feature = features.get(hit.properties.id);
      if (feature && (!picked || feature.properties.rank > picked.properties.rank)) picked = feature;
    }
    return picked ?? null;
  }
  function badgeAt(point) {
    const active = hovered ?? selected;
    return active && map.getLayer(regionBadgeLayer)
      && map.queryRenderedFeatures(point, { layers: [regionBadgeLayer] }).length ? active : null;
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
  function updateHover() {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      if (pointer && !map.isMoving()) {
        const badge = badgeAt(pointer);
        const marker = markers.track(badge ? null : pointer);
        hover(badge ?? (marker ? null : at(pointer)));
        if (marker) map.getCanvas().style.cursor = "pointer";
        else if (!hovered) map.getCanvas().style.cursor = "";
      }
    });
  }
  map.on("styledata", install);
  map.on("moveend", scheduleViewport);
  map.on("movestart", () => {
    pointer = undefined;
    hover(null);
    markers.clearPreview();
  });
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
    markers.track(null);
  });
  // On a boundary click, let the region handle it before GeoLibre’s generic
  // click bridge. Existing site and cluster clicks keep their own handlers.
  map.getCanvasContainer().addEventListener("click", event => {
    if (event.target !== map.getCanvas() || map.isMoving()) return;
    const rect = map.getCanvas().getBoundingClientRect();
    const point = [event.clientX - rect.left, event.clientY - rect.top];
    const badge = badgeAt(point);
    if (!badge && markers.click(point, event)) return;
    const feature = badge ?? at(point);
    if (!feature) return;
    event.stopImmediatePropagation();
    select(feature);
  }, true);
  window.addEventListener("message", event => {
    if (event.origin !== origin || event.source !== parent || event.data?.type !== "navigator:map-regions") return;
    const { event: action, id, count } = event.data;
    if (action === "count" && typeof id === "string" && typeof count === "string") {
      if (projectUrl && event.data.projectUrl !== projectUrl) return;
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
    } else if (action === "marker-step" && (event.data.direction === 1 || event.data.direction === -1)) {
      markers.step(event.data.direction);
    } else if (action === "marker-open") {
      markers.open();
    } else if (action === "marker-clear") {
      markers.clear();
    } else if (action === "request-state") {
      if (regionOverlay) {
        send("available", { areas: [...features.values()].map(feature => feature.properties) });
        if (selected) send("select", { area: selected.properties });
        if (hovered) send("hover", { area: hovered.properties });
      }
      markers.replay();
    }
  });
  map.getCanvas().addEventListener("keydown", event => {
    if (event.key === "Escape") markers.clear();
  });
  install();
  return {
    clearSelection(nextProjectUrl) {
      projectUrl = nextProjectUrl;
      counts.clear();
      pointer = undefined;
      selected = undefined;
      hover(null);
      paintFocus();
      markers.reset();
      send("selection-cleared");
    },
  };
}
