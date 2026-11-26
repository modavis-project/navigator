import { RefObject, useEffect, useState } from "react";
import { installMapBridge, mapBridgeChannel, MapMarkerInspector } from "./mapMarkers";
import { jsonRequestCache } from "./requestCache";
import { useUiLocale } from "./uiLocale";

type Region = { id: string; title: string; type: string; url: string; rank: number };
type Totals = { groupCount: number; mappedOrganCount: number };
const emptyCounts: Record<string, Totals> = {};

export default function MapRegions({ frameRef, projectUrl }: {
  frameRef: RefObject<HTMLIFrameElement | null>;
  projectUrl: string;
}) {
  const { t, locale, formatNumber } = useUiLocale();
  const [areas, setAreas] = useState<Region[]>([]);
  const [hovered, setHovered] = useState<Region | null>(null);
  const [selected, setSelected] = useState<Region | null>(null);
  const [countScope, setCountScope] = useState<{ projectUrl: string; counts: Record<string, Totals>; failed?: string }>();
  const counts = countScope?.projectUrl === projectUrl ? countScope.counts : emptyCounts;
  const failed = countScope?.projectUrl === projectUrl ? countScope.failed : undefined;
  const activeId = selected && !counts[selected.id] && selected.id !== failed ? selected.id : (hovered ?? selected)?.id;
  const origin = window.location.origin;
  const send = (event: string, fields?: object) => {
    frameRef.current?.contentWindow?.postMessage({ type: mapBridgeChannel, event, ...fields }, origin);
  };

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const receive = (event: MessageEvent) => {
      if (event.origin !== origin || event.source !== frame.contentWindow || event.data?.type !== mapBridgeChannel) return;
      const message = event.data;
      if (message.event === "available" && Array.isArray(message.areas)) {
        setAreas(message.areas);
      } else if (message.event === "hover") {
        setHovered(message.area);
      } else if (message.event === "select") {
        setHovered(null);
        setSelected(message.area);
      } else if (message.event === "selection-cleared") {
        setHovered(null);
        setSelected(null);
      }
    };
    window.addEventListener("message", receive);
    const remove = installMapBridge(frame);
    frame.contentWindow?.postMessage({ type: mapBridgeChannel, event: "request-state" }, origin);
    return () => {
      window.removeEventListener("message", receive);
      remove?.();
    };
  }, [frameRef, origin]);

  useEffect(() => {
    if (!activeId || counts[activeId] || activeId === failed) return;
    const project = new URL(projectUrl);
    project.searchParams.delete("markers");
    project.searchParams.delete("basemap");
    const path = `/api/map/areas/${encodeURIComponent(activeId)}/summary.json?${project.searchParams}`;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const result = await jsonRequestCache.get<Totals>(path, { signal: controller.signal, credentials: "same-origin" });
        if (controller.signal.aborted) return;
        setCountScope((value) => ({
          projectUrl,
          counts: {
            ...Object.fromEntries(Object.entries(value?.projectUrl === projectUrl ? value.counts : {}).slice(-95)),
            [activeId]: result,
          },
          failed: value?.projectUrl === projectUrl && value.failed !== activeId ? value.failed : undefined,
        }));
        send("count", { id: activeId, projectUrl, count: Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 }).format(result.groupCount) });
      } catch {
        if (!controller.signal.aborted) setCountScope((value) => ({
          projectUrl, counts: value?.projectUrl === projectUrl ? value.counts : {}, failed: activeId,
        }));
      }
    }, hovered ? 140 : 0);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [activeId, counts, failed, hovered, locale, origin, projectUrl]);

  const stats = selected && counts[selected.id];
  const preview = hovered && counts[hovered.id];
  const siteCount = (count: number) => t("map.region.sites", "{count} mapped sites", "{count} kartierte Standorte", { count: formatNumber(count) });
  const available = [...areas].sort((left, right) => left.title.localeCompare(right.title, locale));
  return (
    <div className="map-region-bar">
      {areas.length > 0 && (
        <select
          value=""
          aria-label={t("map.region.select", "Select an area in this view", "Gebiet in dieser Ansicht auswählen")}
          onChange={(event) => {
            if (event.target.value) send("choose", { id: event.target.value });
          }}
        >
          <option value="" disabled>{t("map.region.placeholder", "Select an area", "Gebiet auswählen")}</option>
          {available.map((area) => <option key={area.id} value={area.id}>{area.title}</option>)}
        </select>
      )}
      {selected ? (
        <div className="map-region-selection" aria-live="polite">
          <a href={selected.url}>{selected.title}</a>
          {stats ? <>
            <span>{siteCount(stats.groupCount)}</span>
            <span>{t("map.region.organs", "{count} organ records", "{count} Orgeldatensätze", { count: formatNumber(stats.mappedOrganCount) })}</span>
          </> : <span>{selected.id === failed
            ? t("map.region.unavailable", "Counts unavailable", "Anzahlen nicht verfügbar")
            : t("map.region.loading", "Loading counts…", "Anzahlen werden geladen …")}</span>}
          <button type="button" aria-label={t("map.region.clear", "Clear area selection", "Gebietsauswahl aufheben")} onClick={() => {
            send("clear");
            setHovered(null);
            setSelected(null);
          }}>×</button>
        </div>
      ) : areas.length > 0 && <small className={hovered ? undefined : "map-region-hint"}>{hovered
        ? [hovered.title, preview && siteCount(preview.groupCount)].filter(Boolean).join(" · ")
        : t("map.region.hint", "Hover to highlight an area. Select it for counts.", "Für die Umrisse über ein Gebiet fahren, für Zahlen auswählen.")}</small>}
      <MapMarkerInspector frameRef={frameRef} />
      {(areas.length > 0 || selected) && <a className="map-region-credits" href="/basemap/assets-v2/region-boundaries-v1.txt" target="_blank" rel="noreferrer">
        {t("map.region.credits", "Boundary credits", "Quellen der Gebietsgrenzen")}
      </a>}
    </div>
  );
}
