import { useEffect, useRef, useState } from "react";
import { Map as MapIcon } from "lucide-react";
import type { ExploreResponse } from "./api";
import { useUiLocale } from "./uiLocale";

type LocatedOrgan = ExploreResponse["mapItems"][number] & { coordinates: { lat: number; lon: number } };
type PreviewFrameProps = {
  source: string;
  examples: LocatedOrgan[];
  recordHref: (id: string) => string;
};

export default function ExploreMapPreview({ items, href, recordHref }: {
  items: ExploreResponse["mapItems"];
  href: string;
  recordHref: (id: string) => string;
}) {
  const { locale, t, formatNumber } = useUiLocale();
  const examples = items.filter((item): item is LocatedOrgan => {
    const point = item.coordinates;
    return !!point && Number.isFinite(point.lat) && Number.isFinite(point.lon)
      && Math.abs(point.lat) <= 90 && Math.abs(point.lon) <= 180;
  }).slice(0, 12);
  const source = `/map-viewer.html#${new URLSearchParams({
    preview: JSON.stringify(examples.map(({ coordinates }) => [coordinates.lon, coordinates.lat])),
    lang: locale,
  })}`;

  return (
    <section className="map-panel explore-map-preview">
      <div className="explore-map-preview-heading">
        <h3>{t("explore.mapExamples", "Map examples", "Beispiele auf der Karte")}</h3>
        {examples.length > 0 && <span>{t("explore.mapExampleCount", "{count} records", "{count} Datensätze", { count: formatNumber(examples.length) })}</span>}
      </div>
      {examples.length > 0
        ? <DeferredPreview key={source} source={source} examples={examples} recordHref={recordHref} />
        : <p>{t("explore.mapNoExamples", "No mapped records in this preview.", "In dieser Vorschau sind keine kartierten Datensätze enthalten.")}</p>}
      <div><a href={href}>{t("explore.openFullMap", "Open the full map", "Vollständige Karte öffnen")}</a></div>
    </section>
  );
}

function DeferredPreview(props: PreviewFrameProps) {
  const { t } = useUiLocale();
  const [opened, setOpened] = useState(false);
  if (opened) return <PreviewFrame {...props} />;

  return <div className="explore-map-preview-frame explore-map-preview-placeholder">
    <button className="secondary" type="button" onClick={() => setOpened(true)}>
      <MapIcon size={17} aria-hidden="true" />
      {t("explore.mapActivate", "Open interactive preview", "Interaktive Vorschau öffnen")}
    </button>
  </div>;
}

function PreviewFrame({ source, examples, recordHref }: PreviewFrameProps) {
  const { t } = useUiLocale();
  const frame = useRef<HTMLIFrameElement>(null);
  const loadTimer = useRef<number>(undefined);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [selected, setSelected] = useState<number[]>([]);
  const records = status === "error" ? examples : selected.map(index => examples[index]);
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.origin !== location.origin || event.source !== frame.current?.contentWindow) return;
      if (event.data?.type === "navigator:map-preview-ready" || event.data?.type === "navigator:map-preview-error") {
        window.clearTimeout(loadTimer.current);
        setStatus(event.data.type === "navigator:map-preview-ready" ? "ready" : "error");
      }
      if (event.data?.type !== "navigator:map-preview-marker" || !Array.isArray(event.data.indices)) return;
      const indices = event.data.indices.filter((index: unknown): index is number => (
        typeof index === "number" && Number.isInteger(index) && index >= 0 && index < examples.length
      ));
      setSelected([...new Set<number>(indices)]);
    };
    window.addEventListener("message", receive);
    frame.current?.focus({ preventScroll: true });
    return () => {
      window.removeEventListener("message", receive);
      window.clearTimeout(loadTimer.current);
    };
  }, [examples.length]);

  return (
    <>
      <div className="explore-map-preview-frame">
        {status !== "error" && <iframe ref={frame} src={source} sandbox="allow-scripts allow-same-origin" onLoad={() => {
          if (status !== "loading") return;
          window.clearTimeout(loadTimer.current);
          loadTimer.current = window.setTimeout(() => setStatus("error"), 20000);
        }}
          title={t("explore.mapFrame", "Map of example organ records", "Karte mit Beispielen aus dem Orgelkatalog")} />}
        {status !== "ready" && <p role="status">{status === "loading"
          ? t("explore.mapLoading", "Loading the map preview…", "Kartenvorschau wird geladen …")
          : t("explore.mapUnavailable", "Map preview unavailable.", "Die Kartenvorschau ist nicht verfügbar.")}</p>}
      </div>
      {status === "ready" && <div className="explore-map-preview-credits">
        <a href="https://openmaptiles.org/">© OpenMapTiles</a> · <a href="https://www.openstreetmap.org/copyright">© OpenStreetMap</a> · <a href="/basemap/assets-v2/NOTICE.txt">{t("explore.basemapCredits", "Basemap credits", "Quellen der Hintergrundkarte")}</a>
      </div>}
      <div className="explore-map-preview-results" aria-live="polite">
        {records.length > 0 && (
          <ul>{records.map(organ => <li key={organ.id}><a href={recordHref(organ.mdvsId)}>{organ.title}</a></li>)}</ul>
        )}
      </div>
    </>
  );
}
