let runtimeRequest: Promise<Document> | undefined;

export function readMapRuntime(): Promise<Document> {
  runtimeRequest ??= fetch("/geolibre/index.html", {
    credentials: "same-origin",
    signal: AbortSignal.timeout(12000),
  }).then(async response => {
    if (!response.ok) throw new Error("Map runtime unavailable");
    const page = new DOMParser().parseFromString(await response.text(), "text/html");
    if (page.title.trim() !== "GeoLibre") throw new Error("Unexpected map runtime");
    return page;
  }).catch(error => {
    runtimeRequest = undefined;
    throw error;
  });
  return runtimeRequest;
}

/** Check availability on map intent. Load GeoLibre's modules only when the map opens. */
export function preloadMapRuntime(): void {
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  if (connection?.saveData || connection?.effectiveType === "slow-2g" || connection?.effectiveType === "2g") return;
  void readMapRuntime().catch(() => {});
}
