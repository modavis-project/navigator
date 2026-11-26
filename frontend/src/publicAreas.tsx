import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Map as MapIcon, MapPin, Search } from "lucide-react";
import { useRecord } from "./publicRecords";
import { useUiLocale } from "./uiLocale";
import { LoadingContent } from "./LoadingContent";
import { readMapRuntime } from "./mapPreload";
import { MapMarkerInspector } from "./mapMarkers";
import "./publicAreas.css";

interface AreaLink {
  id: string;
  title: string;
  type: string;
  context?: string | null;
  url: string;
}

interface Page<T> {
  items: T[];
  total: number;
  offset: number;
  limit: number;
}

interface Area extends AreaLink {
  parents: AreaLink[];
  statistics: { organs: number; places: number; mappedSites?: number | null };
  mapCoordinates?: { exact: number; fallback: number };
  children: Page<AreaLink>;
  organs: Page<{ id: string; title: string; url: string }>;
}

const AREA_SITE_LAYERS = ["modavis-reviewed-current-places-v1", "modavis-locality-fallback-places-v1"];

type MapSite = { id: string; title: string; approximate: boolean };
type AreaMapPrecision = "exact" | "fallback";

function areaType(type: string, locale: "en" | "de") {
  const labels: Record<string, [string, string]> = {
    country: ["Country", "Land"], region: ["Region", "Region"],
    county: ["County", "Landkreis"], municipality: ["Municipality", "Gemeinde"],
    city: ["City", "Stadt"], town: ["Town", "Ort"], district: ["District", "Ortsteil"],
    suburb: ["Suburb", "Stadtteil"], locality: ["Locality", "Ortschaft"],
  };
  return labels[type]?.[locale === "de" ? 1 : 0] || type.replace(/_/g, " ");
}

function AreaLinks({ items, matches = false }: { items: AreaLink[]; matches?: boolean }) {
  const { locale } = useUiLocale();
  return <ul className={matches ? "area-links area-matches" : "area-links"}>{items.map(item => <li key={item.id}>
    <a href={item.url}>
      <strong>{item.title}</strong>
      <span>{[areaType(item.type, locale), item.context].filter(Boolean).join(" · ")}</span>
      {matches && <ChevronRight size={16} aria-hidden="true" />}
    </a>
  </li>)}</ul>;
}

function AreaMatches({ query }: { query: string }) {
  const { t } = useUiLocale();
  const parameters = new URLSearchParams({ q: query });
  const { data, error, retry } = useRecord<{ items: AreaLink[] }>(`/api/areas?${parameters}`);
  if (error) return <p role="alert">{t("area.lookup.failed", "Area search unavailable.", "Die Gebietssuche ist nicht verfügbar.")} <button type="button" className="secondary" onClick={retry}>{t("area.retry", "Try again", "Erneut versuchen")}</button></p>;
  if (!data) return <LoadingContent kind="rows" count={2} label={t("area.lookup.searching", "Finding areas…", "Gebiete werden gesucht …")} />;
  if (!data.items.length) return <p role="status">{t("area.lookup.empty", "No documented areas match this name.", "Für diesen Namen gibt es keine dokumentierten Gebiete.")}</p>;
  return <>
    <p className="sr-only" role="status">{t("area.lookup.results", "{count, plural, one {# matching area} other {# matching areas}}", "{count, plural, one {# passendes Gebiet} other {# passende Gebiete}}", { count: data.items.length })}</p>
    <AreaLinks items={data.items} matches />
  </>;
}

export function AreaLookup() {
  const { t } = useUiLocale();
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");
  const cleanInput = input.trim().replace(/\s+/g, " ");
  const label = t("area.lookup", "Find an area", "Gebiet finden");
  useEffect(() => {
    if (!open || cleanInput.length < 3 || cleanInput === query) return;
    const timer = window.setTimeout(() => setQuery(cleanInput), 280);
    return () => window.clearTimeout(timer);
  }, [cleanInput, open, query]);
  return <details className="area-lookup" onToggle={event => {
    const nextOpen = event.currentTarget.open;
    setOpen(nextOpen);
    if (nextOpen) inputRef.current?.focus();
  }}>
    <summary className="area-disclosure-button"><MapPin size={18} aria-hidden="true" /><span>{label}</span><ChevronDown size={15} aria-hidden="true" /></summary>
    <div className="area-lookup-panel">
      <form role="search" aria-label={label} onSubmit={event => { event.preventDefault(); if (cleanInput) setQuery(cleanInput); }}>
        <label className="search-field">
          <Search size={17} aria-hidden="true" />
          <input ref={inputRef} type="search" aria-label={t("area.lookup.name", "Area name", "Gebietsname")} placeholder={t("area.lookup.example", "e.g. Lower Saxony or Winterhude", "z. B. Niedersachsen oder Winterhude")} maxLength={200} value={input} onChange={event => setInput(event.currentTarget.value)} required />
        </label>
        <button type="submit" className="area-search-submit">{t("area.lookup.submit", "Search areas", "Gebiete suchen")}</button>
      </form>
      <p className="area-lookup-hint">{t("area.lookup.scope", "Browse countries, regions, cities and neighbourhoods.", "Länder, Regionen, Städte und Stadtteile durchsuchen.")}</p>
      {query && cleanInput === query && <AreaMatches key={query} query={query} />}
    </div>
  </details>;
}

function AreaPagination({ area, field }: { area: Area; field: "children" | "organs" }) {
  const { t, formatNumber } = useUiLocale();
  const page = area[field];
  if (!page.offset && page.total <= page.limit) return null;
  const href = (offset: number) => {
    const parameters = new URLSearchParams();
    const children = field === "children" ? offset : area.children.offset;
    const organs = field === "organs" ? offset : area.organs.offset;
    if (children) parameters.set("child_offset", String(children));
    if (organs) parameters.set("organ_offset", String(organs));
    return area.url + (parameters.size ? `?${parameters}` : "") + `#area-${field}`;
  };
  return <div className="area-pagination">
    {page.offset > 0 && <a href={href(Math.max(0, page.offset - page.limit))}>{t("area.previous", "Previous", "Zurück")}</a>}
    {page.items.length > 0 && <span>{formatNumber(page.offset + 1)}–{formatNumber(page.offset + page.items.length)} / {formatNumber(page.total)}</span>}
    {page.offset + page.limit < page.total && <a href={href(page.offset + page.limit)}>{t("area.next", "Next", "Weiter")}</a>}
  </div>;
}

function AreaMapFrame({ area, precision, onRetry }: { area: Area; precision: AreaMapPrecision; onRetry: () => void }) {
  const { t } = useUiLocale();
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [runtime, setRuntime] = useState(false);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [site, setSite] = useState<MapSite | null>(null);
  const frame = new URL("/geolibre/index.html", window.location.origin);
  frame.searchParams.set("url", new URL(`/api/areas/${encodeURIComponent(area.id)}/map.geolibre.json?precision=${precision}`, frame.origin).href);
  frame.searchParams.set("maponly", "true");
  frame.searchParams.set("embed", "1");
  frame.searchParams.set("welcome", "0");
  const send = (message: Record<string, unknown>) => frameRef.current?.contentWindow?.postMessage(message, window.location.origin);
  const requestState = () => send({ type: "geolibre:request-state" });

  useEffect(() => {
    let active = true;
    let zoomTarget: [number, number] | null = null;
    const timeout = window.setTimeout(() => setStatus("error"), 20000);
    const updateStatus = (next: "ready" | "error") => {
      window.clearTimeout(timeout);
      setStatus(next);
    };
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== frameRef.current?.contentWindow) return;
      const message = event.data;
      if (message?.type === "geolibre:ready") {
        requestState();
      } else if (message?.type === "geolibre:error") {
        updateStatus("error");
      } else if (message?.type === "geolibre:state" && Array.isArray(message.project?.layers)
        && message.project.layers.some((layer: { id?: string }) => layer?.id && AREA_SITE_LAYERS.includes(layer.id))) {
        updateStatus("ready");
      } else if (message?.type === "geolibre:result" && message.requestId === "area-map-zoom" && zoomTarget) {
        const zoom = Number(message.value?.zoom);
        if (!Number.isFinite(zoom)) return;
        const duration = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 440;
        send({ type: "geolibre:command", requestId: "area-map-fly", method: "flyTo", params: { center: zoomTarget, zoom: Math.min(zoom + 2.5, 17), duration } });
        zoomTarget = null;
      } else if (message?.type === "geolibre:event" && message.event === "click") {
        const { features, lngLat } = message.payload ?? {};
        const hit = Array.isArray(features) ? features.find(feature => AREA_SITE_LAYERS.includes(feature?.layerId)) : undefined;
        const properties = hit?.properties;
        if (!properties) return;
        if ([true, "true"].includes(properties.aggregate) || [true, "true"].includes(properties.cluster)) {
          if (Array.isArray(lngLat) && lngLat.length === 2 && lngLat.every(Number.isFinite)) {
            zoomTarget = [lngLat[0], lngLat[1]];
            setSite(null);
            send({ type: "geolibre:command", requestId: "area-map-zoom", method: "getView", params: {} });
          }
        } else if (typeof properties.siteGroupId === "string") {
          setSite({ id: properties.siteGroupId, title: typeof properties.title === "string" ? properties.title : "",
            approximate: hit.layerId === AREA_SITE_LAYERS[1] || [true, "true", 1].includes(properties.coordinateFallback) });
        }
      }
    };
    window.addEventListener("message", onMessage);
    void readMapRuntime().then(
      () => { if (active) setRuntime(true); },
      () => { if (active) updateStatus("error"); },
    );
    return () => {
      active = false;
      window.clearTimeout(timeout);
      window.removeEventListener("message", onMessage);
    };
  }, []);

  return <>
    {status === "ready" && <MapMarkerInspector frameRef={frameRef} regionOverlay={false} />}
    <div className={`area-map-shell ${status === "ready" ? "is-ready" : ""}`}>
      {runtime && status !== "error" && <iframe ref={frameRef} className="area-map-frame" src={frame.href}
        title={t("area.map.title", "Map of organ locations in {area}", "Karte der Orgelstandorte in {area}", { area: area.title })}
        sandbox="allow-scripts allow-same-origin allow-downloads" onLoad={requestState} aria-hidden={status !== "ready"} tabIndex={status === "ready" ? 0 : -1} />}
      {status === "loading" && <LoadingContent className="area-map-placeholder" label={t("area.map.loading", "Loading area map…", "Gebietskarte wird geladen …")} />}
      {status === "error" && <div className="area-map-error" role="alert">
        <p>{t("area.map.failed", "The area map is temporarily unavailable.", "Die Gebietskarte ist derzeit nicht verfügbar.")}</p>
        <button type="button" className="secondary" onClick={onRetry}>{t("area.retry", "Try again", "Erneut versuchen")}</button>
      </div>}
    </div>
    {site && status === "ready" && <AreaMapSite key={site.id} areaId={area.id} site={site} onClose={() => setSite(null)} />}
  </>;
}

function AreaMapSite({ areaId, site, onClose }: { areaId: string; site: MapSite; onClose: () => void }) {
  const { t } = useUiLocale();
  const { data, error, retry } = useRecord<{ items: Area["organs"]["items"]; total: number }>(
    `/api/areas/${encodeURIComponent(areaId)}/map/sites/${encodeURIComponent(site.id)}`,
  );
  return <aside className="area-map-site" aria-live="polite">
    <header>
      <div>
        <h3>{site.approximate
          ? t("map.marker.approximate", "Approximate locality", "Ungefähre Ortsangabe")
          : site.title || t("area.map.selected", "Selected site", "Ausgewählter Standort")}</h3>
      </div>
      <button type="button" className="secondary" onClick={onClose}>{t("area.map.closeSite", "Close site", "Standort schließen")}</button>
    </header>
    {error ? <p role="alert">{t("area.map.siteFailed", "Could not load the organ records for this site.", "Die Orgelauswahl für diesen Standort konnte nicht geladen werden.")} <button type="button" className="secondary" onClick={retry}>{t("area.retry", "Try again", "Erneut versuchen")}</button></p>
      : data ? <>
        <ul className="area-links">{data.items.map(organ => <li key={organ.id}><a href={organ.url}>{organ.title}</a></li>)}</ul>
        {data.total > data.items.length && <p className="muted">{t("area.map.siteMore", "Showing {visible} of {total} organ records.", "{visible} von {total} Orgeldatensätzen werden angezeigt.", { visible: data.items.length, total: data.total })}</p>}
      </> : <LoadingContent label={t("area.map.siteLoading", "Loading site records…", "Standortdatensätze werden geladen …")} />}
  </aside>;
}

function AreaMap({ area }: { area: Area }) {
  const { t, formatNumber } = useUiLocale();
  const [opened, setOpened] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const coordinates = area.mapCoordinates;
  const [precision, setPrecision] = useState<AreaMapPrecision>(coordinates?.exact === 0 ? "fallback" : "exact");
  const sites = coordinates?.[precision] ?? area.statistics.mappedSites ?? 0;
  const count = formatNumber(sites);
  return <details className="area-map" onToggle={event => { if (event.currentTarget.open) setOpened(true); }}>
    <summary className="area-disclosure-button">
      <MapIcon size={18} aria-hidden="true" />
      <span>{t("area.map.show", "Map of organ locations", "Karte der Orgelstandorte")}</span>
      <small>{sites === 1 ? t("area.map.site", "1 site", "1 Standort") : t("area.map.sites", "{count} sites", "{count} Standorte", { count })}</small>
      <ChevronDown size={15} aria-hidden="true" />
    </summary>
    {opened && <>
      <div className="area-map-controls">
        <p className="muted">{t("area.map.scope", "Hover or tap a marker for counts. Select a site for its records or a group to zoom.", "Für Anzahlen über einen Marker fahren oder ihn antippen. Standorte für Datensätze oder Gruppen zum Vergrößern auswählen.")}</p>
        {coordinates && coordinates.exact > 0 && coordinates.fallback > 0 && <label>
          <span>{t("area.map.showPrecision", "Show", "Anzeigen")}</span>
          <select value={precision} onChange={event => setPrecision(event.currentTarget.value === "fallback" ? "fallback" : "exact")}>
            <option value="exact">{t("area.map.exact", "Current positions", "Aktuelle Positionen")} ({formatNumber(coordinates.exact)})</option>
            <option value="fallback">{t("area.map.fallback", "Approximate localities", "Ungefähre Orte")} ({formatNumber(coordinates.fallback)})</option>
          </select>
        </label>}
      </div>
      <AreaMapFrame key={`${precision}:${attempt}`} area={area} precision={precision} onRetry={() => setAttempt(value => value + 1)} />
    </>}
  </details>;
}

export function PublicAreaPage({ id }: { id: string }) {
  const { t, locale, formatNumber } = useUiLocale();
  const source = new URLSearchParams(window.location.search);
  const parameters = new URLSearchParams();
  for (const key of ["child_offset", "organ_offset"]) {
    const offset = source.get(key);
    if (offset && /^\d{1,7}$/.test(offset) && Number(offset) <= 1_000_000) parameters.set(key, offset);
  }
  const { data: area, error, retry } = useRecord<Area>(`/api/areas/${encodeURIComponent(id)}${parameters.size ? `?${parameters}` : ""}`);
  useEffect(() => {
    if (!area) return;
    document.title = `${area.title} | MODAVIS Navigator`;
    const canonicalPath = new URL(area.url, window.location.origin);
    if (canonicalPath.origin === window.location.origin && canonicalPath.pathname.startsWith("/areas/") && canonicalPath.pathname !== window.location.pathname) {
      window.history.replaceState(window.history.state, "", canonicalPath.pathname + window.location.search + window.location.hash);
    }
    const section = window.location.hash.slice(1);
    if (section === "area-children" || section === "area-organs") {
      document.getElementById(section)?.scrollIntoView();
    }
  }, [area]);
  if (error) return <section className="notice error" role="alert">
    <h1>{t("area.failed", "Area unavailable", "Gebiet nicht verfügbar")}</h1>
    <p>{error}</p><button type="button" className="secondary" onClick={retry}>{t("area.retry", "Try again", "Erneut versuchen")}</button>
  </section>;
  if (!area) return <LoadingContent kind="article" label={t("area.loading", "Loading area…", "Gebiet wird geladen …")} />;
  const mappedSites = area.statistics.mappedSites ?? 0;
  const metrics = [
    [t("area.stat.organs", "Organ records", "Orgeldatensätze"), area.statistics.organs],
    [t("area.stat.places", "Documented places", "Dokumentierte Orte"), area.statistics.places],
    [t("area.stat.sites", "Mapped sites", "Kartierte Standorte"), area.statistics.mappedSites],
  ] as const;
  return <article className="public-record-page area-page">
    <header className="public-record-header">
      {area.parents.length > 0 && <nav className="area-parents" aria-label={t("area.parents", "Containing areas", "Übergeordnete Gebiete")}>
        {area.parents.map(parent => <span key={parent.id}><a href={parent.url}>{parent.title}</a><ChevronRight size={13} aria-hidden="true" /></span>)}
      </nav>}
      <p className="eyebrow">{areaType(area.type, locale)}</p>
      <h1>{area.title}</h1>
    </header>
    <section className="panel-block area-statistics" aria-label={t("area.statistics", "Catalogue coverage", "Katalogabdeckung")}>
      <dl>{metrics.map(([label, value]) => value != null && <div key={label}><dt>{label}</dt><dd>{formatNumber(value)}</dd></div>)}</dl>
      <p className="muted">{t("area.scope", "Counts cover records with a documented current location in this area. They depend on the administrative hierarchy recorded in the dataset.", "Die Zahlen umfassen Datensätze mit einem dokumentierten aktuellen Standort in diesem Gebiet. Grundlage ist die im Datensatz erfasste Verwaltungshierarchie.")}</p>
    </section>
    {area.children.total > 0 && <section className="panel-block" id="area-children">
      <h2>{t("area.children", "Smaller areas", "Untergeordnete Gebiete")}</h2>
      <AreaLinks items={area.children.items} />
      <AreaPagination area={area} field="children" />
    </section>}
    <section className="panel-block" id="area-organs">
      <h2>{t("area.organs", "Organs in this area", "Orgeln in diesem Gebiet")}</h2>
      <ul className="area-links">{area.organs.items.map(organ => <li key={organ.id}><a href={organ.url}>{organ.title}</a></li>)}</ul>
      {!area.organs.total && <p className="muted">{t("area.organs.empty", "No organ records have a documented current location here.", "Hier sind keine aktuellen Orgelstandorte dokumentiert.")}</p>}
      <AreaPagination area={area} field="organs" />
      {mappedSites > 0 && <AreaMap key={area.id} area={area} />}
    </section>
  </article>;
}
