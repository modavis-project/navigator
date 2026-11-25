import { RefObject, useEffect, useState } from "react";
import { jsonRequestCache } from "./requestCache";
import { useUiLocale } from "./uiLocale";
import "./mapRegions.css";

type Region = { id: string; title: string; type: string; url: string; rank: number };
type Totals = { groupCount: number; mappedOrganCount: number };
const channel = "navigator:map-regions";

export default function MapRegions({ frameRef, frameUrl }: {
  frameRef: RefObject<HTMLIFrameElement | null>;
  frameUrl: string;
}) {
  const { t, locale, formatNumber } = useUiLocale();
  const [areas, setAreas] = useState<Region[]>([]);
  const [hovered, setHovered] = useState<Region | null>(null);
  const [selected, setSelected] = useState<Region | null>(null);
  const [counts, setCounts] = useState<Record<string, Totals>>({});
  const [failed, setFailed] = useState<string>();
  const activeId = selected && !counts[selected.id] && selected.id !== failed ? selected.id : (hovered ?? selected)?.id;
  const origin = window.location.origin;
  const send = (event: string, fields?: object) => {
    frameRef.current?.contentWindow?.postMessage({ type: channel, event, ...fields }, origin);
  };

  useEffect(() => {
    const frame = frameRef.current;
    const doc = frame?.contentDocument;
    if (!doc) return;
    const receive = (event: MessageEvent) => {
      if (event.origin !== origin || event.source !== frame.contentWindow || event.data?.type !== channel) return;
      const message = event.data;
      if (message.event === "available" && Array.isArray(message.areas)) {
        setAreas(message.areas);
      } else if (message.event === "hover") {
        setHovered(message.area);
      } else if (message.event === "select") {
        setHovered(null);
        setSelected(message.area);
      }
    };
    window.addEventListener("message", receive);
    const script = doc.createElement("script");
    script.type = "module";
    script.src = "/geolibre-region-bridge.mjs";
    doc.head.append(script);
    return () => {
      window.removeEventListener("message", receive);
      script.remove();
    };
  }, [frameRef, origin]);

  useEffect(() => {
    if (!activeId || counts[activeId]) return;
    const project = new URL(new URL(frameUrl).searchParams.get("url")!, origin);
    project.searchParams.delete("markers");
    project.searchParams.delete("basemap");
    const path = `/api/map/areas/${encodeURIComponent(activeId)}/summary.json?${project.searchParams}`;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const result = await jsonRequestCache.get<Totals>(path, { signal: controller.signal, credentials: "same-origin" });
        if (controller.signal.aborted) return;
        setCounts((values) => ({ ...Object.fromEntries(Object.entries(values).slice(-95)), [activeId]: result }));
        setFailed((value) => value === activeId ? undefined : value);
        send("count", { id: activeId, count: Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 }).format(result.groupCount) });
      } catch {
        if (!controller.signal.aborted) setFailed(activeId);
      }
    }, hovered ? 140 : 0);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [activeId, counts, frameUrl, hovered, locale, origin]);

  if (!areas.length && !selected) return null;
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
      ) : <small>{hovered
        ? [hovered.title, preview && siteCount(preview.groupCount)].filter(Boolean).join(" · ")
        : t("map.region.hint", "Hover to highlight an area. Select it for counts.", "Für die Umrisse über ein Gebiet fahren, für Zahlen auswählen.")}</small>}
      <a className="map-region-credits" href="/basemap/assets-v2/region-boundaries-v1.txt" target="_blank" rel="noreferrer">
        {t("map.region.credits", "Boundary credits", "Quellen der Gebietsgrenzen")}
      </a>
    </div>
  );
}
