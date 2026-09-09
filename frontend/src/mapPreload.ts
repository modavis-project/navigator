let runtimeRequest: Promise<void> | undefined;

/** Warm the pinned map bundle when a visitor points to or focuses a map button. */
export function preloadMapRuntime(): void {
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  if (connection?.saveData || connection?.effectiveType === "slow-2g" || connection?.effectiveType === "2g") return;
  if (runtimeRequest) return;
  runtimeRequest = fetch("/geolibre/index.html", { credentials: "same-origin" })
    .then(async response => {
      if (!response.ok) throw new Error("Map runtime unavailable");
      const page = new DOMParser().parseFromString(await response.text(), "text/html");
      if (page.title.trim() !== "GeoLibre") throw new Error("Unexpected map runtime");
      for (const source of page.querySelectorAll('script[type="module"][src], link[rel="modulepreload"][href], link[rel="stylesheet"][href]')) {
        const href = new URL(source.getAttribute("src") || source.getAttribute("href") || "", location.origin);
        if (href.origin !== location.origin || !href.pathname.startsWith("/geolibre/assets/")) continue;
        if (document.head.querySelector(`link[data-map-preload][href="${CSS.escape(href.href)}"]`)) continue;
        const link = document.createElement("link");
        link.dataset.mapPreload = "";
        link.href = href.href;
        link.rel = source.getAttribute("rel") === "stylesheet" ? "preload" : "modulepreload";
        if (link.rel === "preload") link.as = "style";
        link.crossOrigin = "anonymous";
        document.head.append(link);
      }
    })
    .catch(() => { runtimeRequest = undefined; });
}
