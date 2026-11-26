import {
  ArrowUpRight,
  CalendarDays,
  ChevronRight,
  CircleAlert,
  Database,
  ExternalLink,
  Flame,
  Info,
  MapPinned,
  Ruler,
  ShieldAlert,
} from "lucide-react";
import { KeyboardEvent, MouseEvent, useEffect, useMemo, useState } from "react";
import { useUiLocale } from "./uiLocale";
import { LoadingContent } from "./LoadingContent";
import { DALMATIA_FIRE_PATH } from "./surfaces";
import "./useCases.css";
import "./dalmatiaFireUseCase.css";

const DALMATIA_FIRE_ARTIFACT = "/data/use-cases/dalmatia-fire-vulnerability-pod-1.5.5.json";

type Position = [number, number];
type Geometry = {
  type: "Polygon" | "MultiPolygon";
  coordinates: Position[][] | Position[][][];
};

type VulnerabilityLevel = "critical" | "very-high" | "high" | "elevated" | "baseline";

type VulnerabilityBand = {
  bandId: string;
  level: VulnerabilityLevel;
  label: string;
  maximumDistanceKm: number | null;
  interpretation: string;
  siteCount: number;
  organEntityCount: number;
};

type County = {
  nutsId: string;
  label: string;
  sourceLabel: string;
  fireEvents: number;
  mappedAreaSumHa: number;
  organSites: number;
  organEntities: number;
  sitesWithin15Km: number;
  geometry: Geometry;
};

type FireEvent = {
  id: string;
  effisId: number;
  countyNutsId: string;
  county: string;
  commune: string | null;
  fireDate: string;
  lastUpdated: string | null;
  mappedAreaHa: number;
  dominantLandCover: string;
  dominantLandCoverPercent: number;
  geometry: Geometry;
  sourceUrl: string;
};

type NearbyFire = {
  fireId: string;
  effisId: number;
  distanceKm: number;
  mappedAreaHa: number;
  fireDate: string;
  commune: string | null;
  sourceUrl: string;
};

type OrganSite = {
  siteGroupId: string;
  title: string;
  countyNutsId: string;
  county: string;
  coordinates: { lon: number; lat: number };
  coordinatePrecision: string;
  coordinateFallback: boolean;
  organEntityCount: number;
  representativeOrganMdvsId: string;
  nearestFireDistanceKm: number;
  firesWithin15Km: number;
  mappedAreaSumWithin15KmHa: number;
  nearbyFires: NearbyFire[];
  vulnerabilityLevel: VulnerabilityLevel;
  vulnerabilityBandId: string;
  vulnerabilityLabel: string;
  consequenceProxy: string;
  assessmentConfidence: string;
  nearestFire: {
    effisId: number;
    commune: string | null;
    fireDate: string;
    mappedAreaHa: number;
    sourceUrl: string;
  };
};

type SourceItem = {
  label: string;
  role: string;
  url?: string;
  doi?: string;
  reuseNotice?: string;
  releaseVersion?: string;
  database?: string;
  sha256?: string;
};

type DalmatiaFireArtifact = {
  schemaVersion: string;
  artifactId: string;
  contentSha256: string;
  generatedAt: string;
  status: string;
  question: string;
  scope: {
    studyArea: string;
    studyAreaDefinition: string;
    fireYear: number;
    snapshotThrough: string;
    claimLevel: string;
    recordUnit: string;
    immutableDatasetReleaseBound: boolean;
    coordinatePolicy: string;
  };
  summary: {
    fireEvents: number;
    mappedAreaSumHa: number;
    organSites: number;
    organEntities: number;
    sitesInsidePerimeter: number;
    sitesWithin1Km: number;
    sitesWithin5Km: number;
    sitesWithin15Km: number;
  };
  vulnerabilityDistribution: VulnerabilityBand[];
  counties: County[];
  fires: FireEvent[];
  organSites: OrganSite[];
  mapBounds: { west: number; south: number; east: number; north: number };
  method: Record<string, string>;
  provenance: {
    analysisVersion: string;
    configSha256: string;
    analysisBasisSha256: string;
    externalInputSnapshotId: string;
    externalInputContentSha256: string;
    externalInputsCapturedAt: string;
    effisDatasetId: string;
    effisDoi: string;
    effisLandingPage: string;
    effisQueryUrl: string;
    giscoSourceUrl: string;
    giscoNutsRelease: string;
    organSnapshot: {
      snapshotSha256: string;
      checkpointSha256: string;
      databaseName: string;
      releaseVersion: string;
      activeBaselineEnforced: boolean;
      activeBaselineManifestSha256: string;
    };
    excludedOrganSiteGroups: Record<string, number>;
  };
  limitations: string[];
  sources: SourceItem[];
  extensionContract: Record<string, string>;
};

const FIRE_BANDS_GERMAN: Record<VulnerabilityLevel, [string, string]> = {
  critical: ["Innerhalb der kartierten Brandfläche", "Die Koordinaten der Orgel liegen innerhalb einer von EFFIS kartierten Brandfläche."],
  "very-high": ["Bis 1 km", "Der Standort liegt in unmittelbarer Nähe einer kartierten Brandfläche des Jahres 2026."],
  high: ["1–5 km", "Der geringe Abstand gibt Anlass zu einer genaueren Prüfung vor Ort."],
  elevated: ["5–15 km", "Im weiteren Umfeld des Standorts wurde ein Brand kartiert."],
  baseline: ["Über 15 km", "Im Umkreis von 15 km erfasste EFFIS für den ausgewerteten Zeitraum keine Brandfläche. Die allgemeine Brandgefahr ist separat zu beurteilen."],
};

const FIRE_LIMITATIONS_GERMAN: Record<string, string> = {
  "This is a screening model of observed spatial proximity, not an engineering fire-risk, emergency-response, insurance, or conservation assessment.": "Die Auswertung ermittelt den räumlichen Abstand. Für Fragen des Brandschutzes, der Einsatzplanung, der Versicherung oder der Denkmalpflege sind jeweils eigene Beurteilungen erforderlich.",
  "EFFIS burnt-area polygons represent mapped wildfire events and can be revised as near-real-time estimates are consolidated; the frozen snapshot is valid only through the stated cutoff.": "EFFIS kartiert Waldbrände und kann vorläufige Flächenschätzungen später korrigieren. Die archivierten Daten geben den Kenntnisstand zum genannten Stichtag wieder.",
  "EFFIS does not map every fire. Its documented monitoring emphasizes wildland fires and has sensor, cloud, timing, interpretation, and minimum-detectable-area limitations.": "EFFIS erfasst vor allem Vegetationsbrände. Sensoren, Bewölkung, Aufnahmezeitpunkt, Auswertung und Mindestgröße der erkennbaren Flächen begrenzen die Erfassung.",
  "The sum of reported mapped areas is not a unique-area estimate because event polygons are not dissolved and may overlap.": "Flächen werden pro Brand addiert. Überschneidungen können mehrfach in die Summe eingehen.",
  "Distance to a past 2026 fire perimeter is an exposure indicator, not a forecast of where a future fire will occur.": "Der Abstand bezieht sich auf dokumentierte Brände im Jahr 2026. Prognosen über künftige Brandorte erfordern andere Daten.",
  "The model has no organ- or building-specific evidence for construction materials, compartmentation, suppression, access, maintenance, condition, response time, or emergency plans.": "Für die einzelnen Orgeln und Gebäude liegen hier keine Angaben zu Baustoffen, Brandabschnitten, Löscheinrichtungen, Zugänglichkeit, Wartung, Zustand, Einsatzzeiten oder Notfallplänen vor.",
  "Only venue-precision MODAVIS map groups are scored. Coordinate fallbacks and organs without safe coordinates are excluded rather than assigned invented locations.": "Die Auswertung umfasst MODAVIS-Standorte mit genauen Gebäudekoordinaten. Ungefähre Ortsangaben und Orgeln ohne verlässliche Koordinaten sind ausgeschlossen.",
  "A map site group can represent more than one pipe-organ entity at the same coordinate; the representative MODAVIS link is not an exhaustive member list.": "Mehrere Orgeln können denselben Standort haben. Der MODAVIS-Link führt zu einem repräsentativen Orgeleintrag.",
  "The four selected counties are an explicit operational proxy for Dalmatia and should not be read as a definitive historical-cultural boundary.": "Das Untersuchungsgebiet folgt den Grenzen von vier Gespanschaften. Die historische Kulturlandschaft Dalmatien lässt sich anders abgrenzen.",
  "A baseline result means no selected EFFIS 2026 polygon lies within 15 km; it does not mean low general wildfire hazard or safety.": "Jenseits der 15-km-Schwelle ist im ausgewerteten EFFIS-Datenstand 2026 keine Brandfläche in Standortnähe erfasst. Die allgemeine Waldbrandgefahr ist separat zu beurteilen.",
};

const FIRE_SOURCE_ROLES_GERMAN: Record<string, string> = {
  "2026 observed burnt-area polygons": "Kartierte Brandflächen 2026",
  "study-area county geometry": "Grenzen der Gespanschaften im Untersuchungsgebiet",
  "coordinate-backed pipe-organ site groups": "Pfeifenorgelstandorte mit Koordinaten",
};

const LEVEL_LABELS: Record<VulnerabilityLevel, string> = {
  critical: "Inside perimeter",
  "very-high": "Very high",
  high: "High",
  elevated: "Elevated",
  baseline: "Baseline screen",
};

function currentRoute(): string {
  return `${window.location.pathname}${window.location.search}`;
}

function navigate(
  event: MouseEvent<HTMLAnchorElement>,
  path: string,
  onNavigate: (path: string) => void,
) {
  if (
    event.defaultPrevented
    || event.button !== 0
    || event.metaKey
    || event.ctrlKey
    || event.shiftKey
    || event.altKey
  ) return;
  event.preventDefault();
  window.history.pushState(null, "", path);
  onNavigate(currentRoute());
  window.scrollTo({ top: 0, behavior: "auto" });
}

function usePageMetadata(title: string, description: string) {
  useEffect(() => {
    document.title = `${title} | MODAVIS Navigator`;
    let descriptionElement = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (!descriptionElement) {
      descriptionElement = document.createElement("meta");
      descriptionElement.name = "description";
      document.head.appendChild(descriptionElement);
    }
    descriptionElement.content = description;
    let canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.rel = "canonical";
      document.head.appendChild(canonical);
    }
    canonical.href = new URL(DALMATIA_FIRE_PATH, window.location.origin).toString();
  }, [description, title]);
}

function polygonRings(geometry: Geometry): Position[][][] {
  if (geometry.type === "Polygon") return [geometry.coordinates as Position[][]];
  return geometry.coordinates as Position[][][];
}

function projector(bounds: DalmatiaFireArtifact["mapBounds"]) {
  const width = 920;
  const height = 560;
  const padding = 24;
  const lonSpan = Math.max(bounds.east - bounds.west, 0.001);
  const latSpan = Math.max(bounds.north - bounds.south, 0.001);
  const scale = Math.min(
    (width - padding * 2) / lonSpan,
    (height - padding * 2) / latSpan,
  );
  const occupiedWidth = lonSpan * scale;
  const occupiedHeight = latSpan * scale;
  const offsetX = (width - occupiedWidth) / 2;
  const offsetY = (height - occupiedHeight) / 2;
  return {
    width,
    height,
    point: (lon: number, lat: number): Position => [
      offsetX + (lon - bounds.west) * scale,
      height - offsetY - (lat - bounds.south) * scale,
    ],
  };
}

function geometryPaths(geometry: Geometry, project: ReturnType<typeof projector>["point"]): string[] {
  return polygonRings(geometry).map((polygon) => polygon.map((ring) => (
    ring.map(([lon, lat], index) => {
      const [x, y] = project(lon, lat);
      return `${index ? "L" : "M"}${x.toFixed(2)},${y.toFixed(2)}`;
    }).join(" ") + " Z"
  )).join(" "));
}

function markerRadius(level: VulnerabilityLevel): number {
  if (level === "critical") return 8;
  if (level === "very-high") return 7;
  if (level === "high") return 6.5;
  if (level === "elevated") return 6;
  return 5.2;
}

function chooseFromKeyboard(event: KeyboardEvent<SVGGElement>, action: () => void) {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    action();
  }
}

export function DalmatiaFireUseCase({
  onNavigate,
}: {
  route: string;
  onNavigate: (path: string) => void;
}) {
  const { locale, intlLocale, t, formatNumber: formatCount } = useUiLocale();
  const dateFormatter = new Intl.DateTimeFormat(intlLocale, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  const formatDate = (value: string) => {
    const date = new Date(value);
    return Number.isNaN(date.valueOf()) ? t("story.fire.dateMissing", "Date unavailable", "Datum nicht erfasst") : dateFormatter.format(date);
  };
  const band = (level: VulnerabilityLevel, value: string) => locale === "de" ? FIRE_BANDS_GERMAN[level][0] : value;
  const levelLabel = (level: VulnerabilityLevel) => band(level, LEVEL_LABELS[level]);
  const formatDistance = (value: number) => {
    if (value === 0) return t("story.fire.contained", "Inside the mapped fire area", "Innerhalb der kartierten Brandfläche");
    if (value < 1) return `${formatCount(value * 1000)} m`;
    return `${formatCount(value, { maximumFractionDigits: 1 })} km`;
  };

  const countyLabel = (label: string, short = false) => {
    const name = label.replace(/ County$/, "");
    if (short) return name;
    return locale === "de" ? t("story.fire.countyName", "{name} County", "Gespanschaft {name}", { name }) : label;
  };

  const [artifact, setArtifact] = useState<DalmatiaFireArtifact | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [level, setLevel] = useState<VulnerabilityLevel | "all">("all");
  const [county, setCounty] = useState("all");
  const [selectedSiteId, setSelectedSiteId] = useState("");

  usePageMetadata(
    t("story.fire.title", "Pipe organs and 2026 fires in Dalmatia", "Pfeifenorgeln und Brände in Dalmatien 2026"),
    t("story.fire.description", "Distance between mapped 2026 fires and documented organ sites in Dalmatia.", "Abstände zwischen kartierten Waldbränden des Jahres 2026 und dokumentierten Orgelstandorten in Dalmatien."),
  );

  useEffect(() => {
    let cancelled = false;
    fetch(DALMATIA_FIRE_ARTIFACT)
      .then(async (response) => {
        if (!response.ok) throw new Error(`The fire-vulnerability artifact returned ${response.status}.`);
        return response.json() as Promise<DalmatiaFireArtifact>;
      })
      .then((value) => {
        if (cancelled) return;
        if (
          value.schemaVersion !== "modavis.navigator.use-case.dalmatia-fire-vulnerability/v1"
          || !Array.isArray(value.organSites)
          || !Array.isArray(value.fires)
          || value.provenance?.organSnapshot?.activeBaselineEnforced !== true
        ) throw new Error("The fire-vulnerability artifact does not match the supported contract.");
        setArtifact(value);
        setSelectedSiteId(value.organSites[0]?.siteGroupId || "");
        setError(false);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const visibleSites = useMemo(() => artifact?.organSites.filter((site) => (
    (level === "all" || site.vulnerabilityLevel === level)
    && (county === "all" || site.countyNutsId === county)
  )) || [], [artifact, county, level]);
  const visibleFires = useMemo(() => artifact?.fires.filter((fire) => (
    county === "all" || fire.countyNutsId === county
  )) || [], [artifact, county]);
  const selectedSite = visibleSites.find((site) => site.siteGroupId === selectedSiteId) ?? visibleSites[0];

  useEffect(() => {
    if (visibleSites.length && !visibleSites.some((site) => site.siteGroupId === selectedSiteId)) {
      setSelectedSiteId(visibleSites[0].siteGroupId);
    }
  }, [selectedSiteId, visibleSites]);

  if (loading) {
    return (
      <section className="use-case-page use-case-loading fire-story-loading" id="use-cases" tabIndex={-1}>
        <LoadingContent label={t("story.fire.loading", "Loading the fire study…", "Die Waldbrandauswertung wird geladen …")} />
      </section>
    );
  }

  if (error || !artifact) {
    return (
      <section className="use-case-page use-case-loading fire-story-loading" id="use-cases" tabIndex={-1}>
        <CircleAlert size={28} />
        <h1>{t("story.fire.unavailable", "Fire study unavailable", "Waldbrandauswertung nicht verfügbar")}</h1>
        <p role="alert">{t("story.fire.loadError", "The study data could not be loaded.", "Die Daten der Auswertung konnten nicht geladen werden.")}</p>
        <a href="/use-cases" onClick={(event) => navigate(event, "/use-cases", onNavigate)}>{t("story.fire.back", "All data stories", "Alle Datenberichte")}</a>
      </section>
    );
  }

  const map = projector(artifact.mapBounds);
  const maximumBandCount = Math.max(...artifact.vulnerabilityDistribution.map((item) => item.siteCount), 1);
  const prioritySites = artifact.organSites.filter((site) => site.nearestFireDistanceKm <= 15);
  const immediateSignalCount = artifact.summary.sitesWithin1Km;
  const regionalSignalCount = Math.max(artifact.summary.sitesWithin15Km - immediateSignalCount, 0);

  return (
    <article className="use-case-page dalmatia-fire-story" id="use-cases" tabIndex={-1}>
      <nav className="use-case-breadcrumbs" aria-label={t("story.fire.breadcrumb", "Breadcrumb", "Brotkrumennavigation")}>
        <a href="/use-cases" onClick={(event) => navigate(event, "/use-cases", onNavigate)}>{t("story.fire.browse", "Data stories", "Datenberichte")}</a>
        <ChevronRight size={14} />
        <span>{t("story.fire.archive", "Fire study in Dalmatia", "Waldbrandauswertung für Dalmatien")}</span>
      </nav>

      <header className="fire-story-hero">
        <div className="fire-story-hero-copy">
          <div className="use-case-story-meta">
            <span>{t("story.fire.year", "2026 EFFIS fire data", "EFFIS-Branddaten 2026")}</span>
            <span>{t("story.fire.overlap", "Wildfire exposure", "Nähe zu Waldbränden")}</span>
            <span>{t("story.fire.screen", "Proximity screen", "Räumliche Auswertung")}</span>
          </div>
          <p className="eyebrow">{t("story.fire.topic", "Cultural heritage and wildfires", "Kulturerbe und Waldbrände")}</p>
          <h1>{t("story.fire.headline", "How close did the 2026 wildfires come to Dalmatia’s documented organs?", "Wie nahe kamen die Waldbrände 2026 den dokumentierten Orgeln in Dalmatien?")}</h1>
          <p className="fire-story-lead">
            {t("story.fire.lead", "The European Forest Fire Information System (EFFIS) maps the extent of wildfires. The distance to documented organ sites shows where closer assessment may be worthwhile. Actual damage and safety require separate evidence.", "Das Europäische Waldbrandinformationssystem (EFFIS) kartiert die Ausdehnung von Waldbränden. Der Abstand zu dokumentierten Orgelstandorten zeigt, wo sich eine genauere Prüfung vor Ort lohnen kann. Schäden und Sicherheit lassen sich nur mit weiteren Belegen beurteilen.")}
          </p>
          <div className="fire-story-scope-note">
            <Info size={17} />
            <span>{t("story.fire.scope", "The study area comprises four Croatian coastal counties. The historical region of Dalmatia has a less precisely defined boundary.", "Das Untersuchungsgebiet umfasst vier kroatische Küstengespanschaften. Die historische Region Dalmatien lässt sich weniger genau abgrenzen.")}</span>
          </div>
        </div>
        <div className="fire-story-hero-signal" aria-hidden="true">
          <span><Flame size={31} /></span>
          <i /><i /><i />
          <b><MapPinned size={25} /></b>
        </div>
      </header>

      <section className="fire-story-kpis" aria-label={t("story.fire.snapshotAria", "Overview of the study", "Überblick über die Auswertung")}>
        <article><Flame size={19} /><strong>{formatCount(artifact.summary.fireEvents)}</strong><span>{t("story.fire.firePolygons", "EFFIS fire polygons", "von EFFIS kartierte Brandflächen")}</span><small>{t("story.fire.fireYear", "fire date in 2026", "mit Branddatum 2026")}</small></article>
        <article><MapPinned size={19} /><strong>{formatCount(artifact.summary.organSites)}</strong><span>{t("story.fire.exact", "exact organ sites", "Orgelstandorte mit genauen Koordinaten")}</span><small>{t("story.fire.organCount", "{count} organ records", "{count} Orgeldatensätze", { count: formatCount(artifact.summary.organEntities) })}</small></article>
        <article><ShieldAlert size={19} /><strong>{formatCount(artifact.summary.sitesWithin5Km)}</strong><span>{t("story.fire.within5", "sites within 5 km", "Standorte im Umkreis von 5 km")}</span><small>{t("story.fire.within15Count", "{count} within 15 km", "{count} im Umkreis von 15 km", { count: formatCount(artifact.summary.sitesWithin15Km) })}</small></article>
        <article><Ruler size={19} /><strong>{formatCount(artifact.summary.mappedAreaSumHa)} ha</strong><span>{t("story.fire.area", "sum of reported areas", "Summe der erfassten Flächen")}</span><small>{t("story.fire.areaOverlap", "overlaps counted separately", "Überschneidungen mehrfach gezählt")}</small></article>
      </section>

      <section className="fire-story-map-section" aria-labelledby="fire-map-title">
        <div className="fire-story-section-heading">
          <div>
            <p className="eyebrow">{t("story.fire.mapSection", "Spatial analysis", "Räumliche Auswertung")}</p>
            <h2 id="fire-map-title">{t("story.fire.mapTitle", "Fire areas and organ sites", "Brandflächen und Orgelstandorte")}</h2>
          </div>
          <p>{t("story.fire.mapHelp", "Filter by county or distance band. Select an organ site for details and evidence.", "Wählen Sie eine Gespanschaft oder Entfernungsstufe. Ein Klick auf einen Orgelstandort öffnet die Belege und Einzelheiten.")}</p>
        </div>

        <div className="fire-story-controls">
          <div role="group" aria-label={t("story.fire.countyFilter", "Filter by county", "Nach Gespanschaft filtern")}>
            <button type="button" className={county === "all" ? "active" : ""} aria-pressed={county === "all"} onClick={() => setCounty("all")}>{t("story.fire.allCounties", "All counties", "Alle Gespanschaften")}</button>
            {artifact.counties.map((item) => (
              <button key={item.nutsId} type="button" className={county === item.nutsId ? "active" : ""} aria-pressed={county === item.nutsId} onClick={() => setCounty(item.nutsId)}>{countyLabel(item.label, true)}</button>
            ))}
          </div>
          <div role="group" aria-label={t("story.fire.bandFilter", "Filter by distance band", "Nach Entfernungsstufe filtern")}>
            <button type="button" className={level === "all" ? "active" : ""} aria-pressed={level === "all"} onClick={() => setLevel("all")}>{t("story.fire.allBands", "All distance bands", "Alle Entfernungsstufen")}</button>
            {artifact.vulnerabilityDistribution.filter((item) => item.siteCount > 0).map((item) => (
              <button key={item.level} type="button" className={`level-${item.level} ${level === item.level ? "active" : ""}`} aria-pressed={level === item.level} onClick={() => setLevel(item.level)}>{levelLabel(item.level)}</button>
            ))}
          </div>
        </div>

        <div className="fire-story-map-grid">
          <figure className="fire-story-map">
            <svg viewBox={`0 0 ${map.width} ${map.height}`} role="img" aria-labelledby="dalmatia-map-svg-title dalmatia-map-svg-description">
              <title id="dalmatia-map-svg-title">{t("story.fire.mapSvgTitle", "Distance to mapped wildfires in Dalmatia, 2026", "Abstand zu kartierten Waldbränden in Dalmatien 2026")}</title>
              <desc id="dalmatia-map-svg-description">
                {t("story.fire.mapDescription", "Orange areas show mapped fires. Organ markers are colored according to the distance to the nearest fire perimeter.", "Die orangefarbenen Flächen zeigen die kartierten Brände. Die Farbe der Orgelmarkierungen gibt den Abstand zur nächsten Brandfläche an.")}
              </desc>
              <g className="fire-map-counties">
                {artifact.counties.map((item) => geometryPaths(item.geometry, map.point).map((path, index) => (
                  <path key={`${item.nutsId}-${index}`} d={path} fillRule="evenodd" className={county === "all" || county === item.nutsId ? "visible" : "muted"} />
                )))}
              </g>
              <g className="fire-map-perimeters" aria-label={t("story.fire.mapFireCount", "Mapped fire areas: {count}", "Kartierte Brandflächen: {count}", { count: formatCount(visibleFires.length) })}>
                {visibleFires.map((fire) => geometryPaths(fire.geometry, map.point).map((path, index) => (
                  <path key={`${fire.id}-${index}`} d={path} fillRule="evenodd"><title>{`${fire.commune || fire.county} · ${formatDate(fire.fireDate)} · ${formatCount(fire.mappedAreaHa)} ha`}</title></path>
                )))}
              </g>
              <g className="fire-map-sites" aria-label={t("story.fire.mapSiteCount", "Visible organ sites: {count}", "Sichtbare Orgelstandorte: {count}", { count: formatCount(visibleSites.length) })}>
                {visibleSites.map((site) => {
                  const [x, y] = map.point(site.coordinates.lon, site.coordinates.lat);
                  const selected = selectedSite?.siteGroupId === site.siteGroupId;
                  return (
                    <g
                      key={site.siteGroupId}
                      className={`fire-map-site level-${site.vulnerabilityLevel} ${selected ? "selected" : ""}`}
                      role="button"
                      tabIndex={0}
                      aria-label={t("story.fire.mapSite", "{site}. Nearest mapped fire: {distance}", "{site}. Nächstgelegene kartierte Brandfläche: {distance}", { site: site.title, distance: formatDistance(site.nearestFireDistanceKm) })}
                      onClick={() => setSelectedSiteId(site.siteGroupId)}
                      onFocus={() => setSelectedSiteId(site.siteGroupId)}
                      onKeyDown={(event) => chooseFromKeyboard(event, () => setSelectedSiteId(site.siteGroupId))}
                    >
                      <circle cx={x} cy={y} r={markerRadius(site.vulnerabilityLevel)} />
                      <circle className="site-ring" cx={x} cy={y} r={markerRadius(site.vulnerabilityLevel) + 4} />
                      <title>{site.title}</title>
                    </g>
                  );
                })}
              </g>
            </svg>
            <figcaption>
              <span><i className="fire-swatch" /> {t("story.fire.mapFireLegend", "EFFIS 2026 fire area", "EFFIS-Brandfläche 2026")}</span>
              {artifact.vulnerabilityDistribution.filter((item) => item.siteCount > 0).map((item) => (
                <span key={item.level}><i className={`site-swatch level-${item.level}`} /> {band(item.level, item.label)}</span>
              ))}
            </figcaption>
          </figure>

          <aside className="fire-site-inspector" aria-live="polite">
            {selectedSite ? (
              <>
                <div className={`fire-site-level level-${selectedSite.vulnerabilityLevel}`}>
                  <ShieldAlert size={16} /> {levelLabel(selectedSite.vulnerabilityLevel)}
                </div>
                <p className="eyebrow">{t("story.fire.selected", "Selected organ site", "Ausgewählter Orgelstandort")}</p>
                <h3>{selectedSite.title}</h3>
                <dl>
                  <div><dt>{t("story.fire.distance", "Nearest mapped fire", "Nächstgelegene kartierte Brandfläche")}</dt><dd>{formatDistance(selectedSite.nearestFireDistanceKm)}</dd></div>
                  <div><dt>{t("story.fire.firePlaceDate", "Fire location and date", "Ort und Datum des Brandes")}</dt><dd>{selectedSite.nearestFire.commune || selectedSite.county} · {formatDate(selectedSite.nearestFire.fireDate)}</dd></div>
                  <div><dt>{t("story.fire.fireArea", "Reported fire area", "Erfasste Brandfläche")}</dt><dd>{formatCount(selectedSite.nearestFire.mappedAreaHa)} ha</dd></div>
                  <div><dt>{t("story.fire.events15", "Fires within 15 km", "Brände im Umkreis von 15 km")}</dt><dd>{formatCount(selectedSite.firesWithin15Km)}</dd></div>
                  <div><dt>{t("story.fire.where", "Location evidence", "Standortbeleg")}</dt><dd>{t("story.fire.exactEvidence", "Exact venue coordinates", "Genaue Koordinaten des Gebäudes")}</dd></div>
                </dl>
                <div className="fire-site-links">
                  <a href={`/id/${encodeURIComponent(selectedSite.representativeOrganMdvsId)}`}>{t("story.fire.organ", "Open organ record", "Orgeleintrag öffnen")} <ArrowUpRight size={15} /></a>
                  <a href={selectedSite.nearestFire.sourceUrl} target="_blank" rel="noreferrer">{t("story.fire.effis", "Open EFFIS record", "EFFIS-Eintrag öffnen")} <ExternalLink size={14} /></a>
                </div>
                <p className="fire-site-caution">{t("story.fire.caution", "Distance determines the displayed band. Assessing building resistance, access, fire suppression and organ condition requires site-specific evidence.", "Die Einstufung richtet sich nach dem Abstand. Aussagen zum baulichen Brandschutz, zur Zugänglichkeit, zur Brandbekämpfung und zum Zustand der Orgel erfordern Belege vor Ort.")}</p>
              </>
            ) : <p>{t("story.fire.empty", "No site matches the selected filters.", "Für diese Filterauswahl sind keine Standorte erfasst.")}</p>}
          </aside>
        </div>
      </section>

      <section className="fire-story-findings" aria-labelledby="fire-findings-title">
        <div className="fire-story-section-heading">
          <div>
            <p className="eyebrow">{t("story.fire.findings", "Findings", "Ergebnisse")}</p>
            <h2 id="fire-findings-title">
              {t("story.fire.findingCounts", "Within 1 km: {immediate}. From 1 to 15 km: {regional}", "Bis 1 km: {immediate}. Zwischen 1 und 15 km: {regional}", {
                immediate: formatCount(immediateSignalCount), regional: formatCount(regionalSignalCount),
              })}
            </h2>
          </div>
          <p>{t("story.fire.findingsNote", "The analysis includes only sites with exact coordinates. Distance alone cannot establish a loss.", "Die Auswertung umfasst ausschließlich Standorte mit genauen Koordinaten. Aus dem Abstand allein lassen sich keine Schäden ableiten.")}</p>
        </div>
        <div className="fire-story-findings-grid">
          <article className="fire-priority-finding">
            <span><Flame size={21} /> {t("story.fire.closest", "Closest organ site to a fire area", "Orgelstandort mit dem geringsten Abstand zu einer Brandfläche")}</span>
            <strong>{formatDistance(artifact.organSites[0].nearestFireDistanceKm)}</strong>
            <h3>{artifact.organSites[0].title}</h3>
            <p>{t("story.fire.closestDate", "EFFIS records the nearest fire at {place} on {date}.", "EFFIS verzeichnet den nächstgelegenen Brand bei {place} am {date}.", {
              date: formatDate(artifact.organSites[0].nearestFire.fireDate), place: artifact.organSites[0].nearestFire.commune || artifact.organSites[0].county,
            })}</p>
          </article>
          <article className="fire-band-chart">
            <h3>{t("story.fire.bandChart", "Organ sites by distance band", "Orgelstandorte nach Entfernungsstufe")}</h3>
            <div>
              {artifact.vulnerabilityDistribution.map((item) => (
                <button key={item.bandId} type="button" onClick={() => setLevel(item.level)} aria-label={t("story.fire.bandShow", "Show {band}: {count} sites", "{band} anzeigen: {count} Standorte", { band: band(item.level, item.label), count: formatCount(item.siteCount) })}>
                  <span>{band(item.level, item.label)}</span>
                  <i><b className={`level-${item.level}`} style={{ width: `${(item.siteCount / maximumBandCount) * 100}%` }} /></i>
                  <strong>{formatCount(item.siteCount)}</strong>
                </button>
              ))}
            </div>
          </article>
        </div>
      </section>

      <section className="fire-priority-table-section" aria-labelledby="fire-priority-table-title">
        <div className="fire-story-section-heading compact">
          <div>
            <p className="eyebrow">{t("story.fire.priority", "Site records", "Standortbelege")}</p>
            <h2 id="fire-priority-table-title">{t("story.fire.priorityTitle", "Organ sites within 15 km of a mapped fire", "Orgelstandorte im Umkreis von 15 km um eine kartierte Brandfläche")}</h2>
          </div>
          <p>{t("story.fire.priorityCount", "{count} sites with exact coordinates, sorted by distance band and then by nearest distance.", "{count} Standorte mit genauen Koordinaten, sortiert nach Entfernungsstufe und anschließend nach Abstand.", { count: formatCount(prioritySites.length) })}</p>
        </div>
        <div className="fire-table-wrap">
          <table>
            <thead><tr><th>{t("story.fire.siteColumn", "Organ site", "Orgelstandort")}</th><th>{t("story.fire.bandColumn", "Distance band", "Entfernungsstufe")}</th><th>{t("story.fire.fireColumn", "Nearest fire", "Nächstgelegene Brandfläche")}</th><th>{t("story.fire.events15", "Fires within 15 km", "Brände im Umkreis von 15 km")}</th><th>{t("story.fire.evidenceColumn", "Evidence", "Beleg")}</th></tr></thead>
            <tbody>
              {prioritySites.map((site) => (
                <tr key={site.siteGroupId}>
                  <th scope="row"><a href={`/id/${encodeURIComponent(site.representativeOrganMdvsId)}`}>{site.title}</a><small>{countyLabel(site.county)}</small></th>
                  <td><span className={`table-level level-${site.vulnerabilityLevel}`}>{levelLabel(site.vulnerabilityLevel)}</span></td>
                  <td><strong>{formatDistance(site.nearestFireDistanceKm)}</strong><small>{site.nearestFire.commune || t("story.fire.placeUnknown", "Place not recorded", "Ort nicht erfasst")} · {formatDate(site.nearestFire.fireDate)}</small></td>
                  <td>{formatCount(site.firesWithin15Km)}</td>
                  <td><a href={site.nearestFire.sourceUrl} target="_blank" rel="noreferrer">EFFIS {site.nearestFire.effisId} <ExternalLink size={13} /></a></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="fire-county-section" aria-labelledby="fire-county-title">
        <div className="fire-story-section-heading compact">
          <div>
            <p className="eyebrow">{t("story.fire.population", "Geographic coverage", "Räumlicher Umfang")}</p>
            <h2 id="fire-county-title">{t("story.fire.countiesTitle", "The four counties in the study", "Die vier Gespanschaften des Untersuchungsgebiets")}</h2>
          </div>
          <p>{t("story.fire.countyAreaNote", "The area sums the figures reported by EFFIS for each fire. Overlapping areas can be counted more than once.", "Die Flächensumme ergibt sich aus den EFFIS-Angaben zu den einzelnen Bränden. Sich überschneidende Flächen können mehrfach eingehen.")}</p>
        </div>
        <div className="fire-table-wrap">
          <table>
            <thead><tr><th>{t("story.fire.countyColumn", "County", "Gespanschaft")}</th><th>{t("story.fire.countyFires", "Fire areas in 2026", "Kartierte Brandflächen 2026")}</th><th>{t("story.fire.countyArea", "Sum of reported areas", "Summe der erfassten Flächen")}</th><th>{t("story.fire.countySites", "Organ sites with exact coordinates", "Orgelstandorte mit genauen Koordinaten")}</th><th>{t("story.fire.countyWithin", "Sites within 15 km", "Standorte im Umkreis von 15 km")}</th></tr></thead>
            <tbody>
              {artifact.counties.map((item) => (
                <tr key={item.nutsId}>
                  <th scope="row">{countyLabel(item.label)}<small>{item.nutsId} · NUTS 2024</small></th>
                  <td>{formatCount(item.fireEvents)}</td>
                  <td>{formatCount(item.mappedAreaSumHa)} ha</td>
                  <td>{formatCount(item.organSites)}</td>
                  <td>{formatCount(item.sitesWithin15Km)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="fire-method-section" aria-labelledby="fire-method-title">
        <div className="fire-story-section-heading">
          <div>
            <p className="eyebrow">{t("story.fire.method", "Method", "Methode")}</p>
            <h2 id="fire-method-title">{t("story.fire.methodTitle", "How the distances were calculated", "So wurden die Abstände berechnet")}</h2>
          </div>
          <p>{t("story.fire.methodNote", "Checksums identify the data used at each step. A new cutoff date or MODAVIS release produces a separate analysis.", "Prüfsummen weisen die in jedem Schritt verwendeten Daten aus. Ein anderer Stichtag oder eine neue MODAVIS-Version führt zu einer eigenen Auswertung.")}</p>
        </div>
        <ol className="fire-method-flow">
          <li><span>1</span><div><Database size={19} /><h3>{t("story.fire.freeze", "Archive the inputs", "Eingangsdaten archivieren")}</h3><p>{t("story.fire.freezeDetail", "Archive the EFFIS response for Croatia and the boundaries of four NUTS-3 regions from GISCO.", "Die EFFIS-Abfrage für Kroatien und die von GISCO bereitgestellten Grenzen der vier NUTS-3-Regionen werden archiviert.")}</p></div></li>
          <li><span>2</span><div><MapPinned size={19} /><h3>{t("story.fire.select", "Select well-located sites", "Standorte auswählen")}</h3><p>{t("story.fire.selectDetail", "Include MODAVIS organ sites with exact coordinates in the four counties. Exclude positions known only to locality level.", "Berücksichtigt werden MODAVIS-Orgelstandorte mit genauen Koordinaten innerhalb der vier Gespanschaften. Bei Angaben auf Ortsebene allein entfällt die Zuordnung.")}</p></div></li>
          <li><span>3</span><div><Ruler size={19} /><h3>{t("story.fire.measure", "Calculate distances", "Abstände berechnen")}</h3><p>{t("story.fire.measureDetail", "Test whether a site is inside a mapped fire. Otherwise, measure the shortest distance to the perimeter using the full source geometry.", "Zunächst wird geprüft, ob der Standort innerhalb einer Brandfläche liegt. Andernfalls wird der kürzeste Abstand zur Grenze der vollständigen Flächengeometrie berechnet.")}</p></div></li>
          <li><span>4</span><div><ShieldAlert size={19} /><h3>{t("story.fire.classify", "Assign distance bands", "Nach Entfernung einstufen")}</h3><p>{t("story.fire.classifyDetail", "Classify sites by their distance to the nearest mapped fire using thresholds at 0, 1, 5 and 15 km. Organ counts are reported separately.", "Die Einstufung erfolgt anhand des Abstands zur nächsten erfassten Brandfläche. Die Schwellen liegen bei 0, 1, 5 und 15 km. Die Anzahl der Orgeln wird getrennt ausgewiesen.")}</p></div></li>
        </ol>
        <div className="fire-threshold-grid">
          {artifact.vulnerabilityDistribution.map((item) => (
            <article key={item.bandId}>
              <span className={`table-level level-${item.level}`}>{levelLabel(item.level)}</span>
              <strong>{band(item.level, item.label)}</strong>
              <p>{locale === "de" ? FIRE_BANDS_GERMAN[item.level][1] : item.interpretation}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="fire-limitations" aria-labelledby="fire-limitations-title">
        <div>
          <p className="eyebrow">{t("story.fire.boundary", "Interpretation", "Einordnung")}</p>
          <h2 id="fire-limitations-title">{t("story.fire.limitations", "Coverage and limitations", "Datengrundlage und Grenzen der Auswertung")}</h2>
          <p>{t("story.fire.limitationsLead", "The following limits apply to the data and to the distance-based assessment.", "Die folgenden Einschränkungen betreffen die Datengrundlage und die Auswertung nach Entfernung.")}</p>
        </div>
        <ul>
          {artifact.limitations.map((item) => <li key={item}>{locale === "de" ? FIRE_LIMITATIONS_GERMAN[item] ?? item : item}</li>)}
        </ul>
      </section>

      <section className="fire-provenance" aria-labelledby="fire-provenance-title">
        <div className="fire-story-section-heading compact">
          <div>
            <p className="eyebrow">{t("story.fire.fixity", "Sources and checksums", "Quellen und Prüfsummen")}</p>
            <h2 id="fire-provenance-title">{t("story.fire.provenance", "Data used in the analysis", "Datengrundlage der Auswertung")}</h2>
          </div>
          <p>{t("story.fire.snapshotDate", "Observations through {cutoff} · study generated {date}", "Erfassungsstand {cutoff} · Auswertung vom {date}", { cutoff: formatDate(artifact.scope.snapshotThrough), date: formatDate(artifact.generatedAt) })}</p>
        </div>
        <div className="fire-source-cards">
          {artifact.sources.map((source) => (
            <article key={source.label}>
              <span>{locale === "de" ? FIRE_SOURCE_ROLES_GERMAN[source.role] ?? source.role : source.role}</span>
              <h3>{source.label}</h3>
              {source.releaseVersion && <p>{t("story.fire.release", "Version {version}", "Version {version}", { version: source.releaseVersion })}</p>}
              {source.database && <p>{source.database}</p>}
              {source.url && <a href={source.url} target="_blank" rel="noreferrer">{t("story.fire.source", "Open source", "Quelle öffnen")} <ExternalLink size={14} /></a>}
              {source.doi && <a href={source.doi} target="_blank" rel="noreferrer">{t("story.fire.doi", "Dataset DOI", "DOI des Datensatzes")} <ExternalLink size={14} /></a>}
            </article>
          ))}
        </div>
        <dl className="fire-fixity-grid">
          <div><dt>{t("story.fire.artifact", "Analysis identifier", "Kennung der Auswertung")}</dt><dd><code>{artifact.artifactId}</code></dd></div>
          <div><dt>{t("story.fire.basisHash", "Analysis basis SHA-256", "SHA-256-Prüfsumme der Analysegrundlage")}</dt><dd><code>{artifact.provenance.analysisBasisSha256}</code></dd></div>
          <div><dt>{t("story.fire.external", "External data snapshot", "Archivstand der externen Daten")}</dt><dd><code>{artifact.provenance.externalInputSnapshotId}</code></dd></div>
          <div><dt>{t("story.fire.organHash", "Organ data SHA-256", "SHA-256-Prüfsumme der Orgeldaten")}</dt><dd><code>{artifact.provenance.organSnapshot.snapshotSha256}</code></dd></div>
          {artifact.provenance.organSnapshot.activeBaselineManifestSha256 && <div><dt>{t("story.fire.baselineHash", "Source database SHA-256", "SHA-256-Prüfsumme der Quelldatenbank")}</dt><dd><code>{artifact.provenance.organSnapshot.activeBaselineManifestSha256}</code></dd></div>}
        </dl>
        <p className="fire-provenance-note"><CalendarDays size={16} /> {t("story.fire.archived", "EFFIS updates its data periodically. This analysis uses the archived EFFIS response listed above.", "EFFIS aktualisiert seine Daten regelmäßig. Dieser Auswertung liegt die oben genannte archivierte EFFIS-Abfrage zugrunde.")}</p>
      </section>
    </article>
  );
}
