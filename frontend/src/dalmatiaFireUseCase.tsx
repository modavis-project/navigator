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


export const DALMATIA_FIRE_PATH = "/use-cases/dalmatia-pipe-organs-fire-vulnerability";
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

function formatNumber(value: number, maximumFractionDigits = 0): string {
  return new Intl.NumberFormat("en", { maximumFractionDigits }).format(value);
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not recorded";
  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

function formatDistance(value: number): string {
  if (value === 0) return "Inside mapped perimeter";
  if (value < 1) return `${formatNumber(value * 1000)} m`;
  return `${formatNumber(value, 1)} km`;
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
  const [artifact, setArtifact] = useState<DalmatiaFireArtifact | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [level, setLevel] = useState<VulnerabilityLevel | "all">("all");
  const [county, setCounty] = useState("all");
  const [selectedSiteId, setSelectedSiteId] = useState("");

  usePageMetadata(
    "Pipe organs and 2026 fires in Dalmatia",
    "A reproducible proximity-based vulnerability screen connecting EFFIS 2026 burnt-area polygons with coordinate-backed MODAVIS pipe-organ sites in Dalmatia.",
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
        setError(null);
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "The artifact could not be loaded.");
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
  const selectedSite = artifact?.organSites.find((site) => site.siteGroupId === selectedSiteId)
    || visibleSites[0]
    || artifact?.organSites[0]
    || null;

  useEffect(() => {
    if (visibleSites.length && !visibleSites.some((site) => site.siteGroupId === selectedSiteId)) {
      setSelectedSiteId(visibleSites[0].siteGroupId);
    }
  }, [selectedSiteId, visibleSites]);

  if (loading) {
    return (
      <section className="use-case-page use-case-loading fire-story-loading" id="use-cases" tabIndex={-1}>
        <div className="use-case-loading-mark"><Flame size={26} /></div>
        <p role="status">Loading the Dalmatia fire-vulnerability screen…</p>
      </section>
    );
  }

  if (error || !artifact) {
    return (
      <section className="use-case-page use-case-loading fire-story-loading" id="use-cases" tabIndex={-1}>
        <CircleAlert size={28} />
        <h1>Fire-vulnerability story unavailable</h1>
        <p role="alert">{error || "No analytical artifact is available."}</p>
        <a href="/use-cases" onClick={(event) => navigate(event, "/use-cases", onNavigate)}>Back to Use Cases</a>
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
      <nav className="use-case-breadcrumbs" aria-label="Breadcrumb">
        <a href="/use-cases" onClick={(event) => navigate(event, "/use-cases", onNavigate)}>Use Cases</a>
        <ChevronRight size={14} />
        <span>Dalmatia fire vulnerability</span>
      </nav>

      <header className="fire-story-hero">
        <div className="fire-story-hero-copy">
          <div className="use-case-story-meta">
            <span>2026 EFFIS fire data</span>
            <span>Wildfire exposure</span>
            <span>Proximity screen</span>
          </div>
          <p className="eyebrow">Cultural heritage under environmental pressure</p>
          <h1>Where did 2026 fires converge with Dalmatia&apos;s documented pipe organs?</h1>
          <p className="fire-story-lead">
            This screen measures the distance from exact, coordinate-backed MODAVIS
            organ sites to burnt-area polygons mapped by the European Forest Fire
            Information System. It identifies places for closer assessment; it does
            not predict damage or certify safety.
          </p>
          <div className="fire-story-scope-note">
            <Info size={17} />
            <span>{artifact.scope.studyAreaDefinition}</span>
          </div>
        </div>
        <div className="fire-story-hero-signal" aria-hidden="true">
          <span><Flame size={31} /></span>
          <i /><i /><i />
          <b><MapPinned size={25} /></b>
        </div>
      </header>

      <section className="fire-story-kpis" aria-label="Analytical snapshot">
        <article><Flame size={19} /><strong>{formatNumber(artifact.summary.fireEvents)}</strong><span>EFFIS fire polygons</span><small>firedate in 2026</small></article>
        <article><MapPinned size={19} /><strong>{formatNumber(artifact.summary.organSites)}</strong><span>exact organ sites</span><small>{formatNumber(artifact.summary.organEntities)} organ entities</small></article>
        <article><ShieldAlert size={19} /><strong>{formatNumber(artifact.summary.sitesWithin5Km)}</strong><span>site within 5 km</span><small>{formatNumber(artifact.summary.sitesWithin15Km)} within 15 km</small></article>
        <article><Ruler size={19} /><strong>{formatNumber(artifact.summary.mappedAreaSumHa)} ha</strong><span>reported area sum</span><small>not dissolved for overlap</small></article>
      </section>

      <section className="fire-story-map-section" aria-labelledby="fire-map-title">
        <div className="fire-story-section-heading">
          <div>
            <p className="eyebrow">Spatial convergence</p>
            <h2 id="fire-map-title">Fire perimeters and organ sites, seen together</h2>
          </div>
          <p>Choose a county or vulnerability band. Select a site marker for its record-level evidence.</p>
        </div>

        <div className="fire-story-controls">
          <div role="group" aria-label="Filter by county">
            <button type="button" className={county === "all" ? "active" : ""} aria-pressed={county === "all"} onClick={() => setCounty("all")}>All counties</button>
            {artifact.counties.map((item) => (
              <button key={item.nutsId} type="button" className={county === item.nutsId ? "active" : ""} aria-pressed={county === item.nutsId} onClick={() => setCounty(item.nutsId)}>{item.label.replace(" County", "")}</button>
            ))}
          </div>
          <div role="group" aria-label="Filter by vulnerability level">
            <button type="button" className={level === "all" ? "active" : ""} aria-pressed={level === "all"} onClick={() => setLevel("all")}>All levels</button>
            {artifact.vulnerabilityDistribution.filter((item) => item.siteCount > 0).map((item) => (
              <button key={item.level} type="button" className={`level-${item.level} ${level === item.level ? "active" : ""}`} aria-pressed={level === item.level} onClick={() => setLevel(item.level)}>{LEVEL_LABELS[item.level]}</button>
            ))}
          </div>
        </div>

        <div className="fire-story-map-grid">
          <figure className="fire-story-map">
            <svg viewBox={`0 0 ${map.width} ${map.height}`} role="img" aria-labelledby="dalmatia-map-svg-title dalmatia-map-svg-description">
              <title id="dalmatia-map-svg-title">Dalmatia 2026 fire proximity map</title>
              <desc id="dalmatia-map-svg-description">
                County outlines contain orange EFFIS burnt-area polygons and colored pipe-organ site markers. Marker color encodes the nearest-fire proximity band.
              </desc>
              <g className="fire-map-counties">
                {artifact.counties.map((item) => geometryPaths(item.geometry, map.point).map((path, index) => (
                  <path key={`${item.nutsId}-${index}`} d={path} fillRule="evenodd" className={county === "all" || county === item.nutsId ? "visible" : "muted"} />
                )))}
              </g>
              <g className="fire-map-perimeters" aria-label={`${visibleFires.length} mapped fire perimeters`}>
                {visibleFires.map((fire) => geometryPaths(fire.geometry, map.point).map((path, index) => (
                  <path key={`${fire.id}-${index}`} d={path} fillRule="evenodd"><title>{`${fire.commune || fire.county} · ${formatDate(fire.fireDate)} · ${formatNumber(fire.mappedAreaHa)} ha`}</title></path>
                )))}
              </g>
              <g className="fire-map-sites" aria-label={`${visibleSites.length} visible organ sites`}>
                {visibleSites.map((site) => {
                  const [x, y] = map.point(site.coordinates.lon, site.coordinates.lat);
                  const selected = selectedSite?.siteGroupId === site.siteGroupId;
                  return (
                    <g
                      key={site.siteGroupId}
                      className={`fire-map-site level-${site.vulnerabilityLevel} ${selected ? "selected" : ""}`}
                      role="button"
                      tabIndex={0}
                      aria-label={`${site.title}; ${site.vulnerabilityLabel}; ${formatDistance(site.nearestFireDistanceKm)} from nearest mapped fire`}
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
              <span><i className="fire-swatch" /> EFFIS 2026 burnt-area polygon</span>
              {artifact.vulnerabilityDistribution.filter((item) => item.siteCount > 0).map((item) => (
                <span key={item.level}><i className={`site-swatch level-${item.level}`} /> {item.label}</span>
              ))}
            </figcaption>
          </figure>

          <aside className="fire-site-inspector" aria-live="polite">
            {selectedSite ? (
              <>
                <div className={`fire-site-level level-${selectedSite.vulnerabilityLevel}`}>
                  <ShieldAlert size={16} /> {LEVEL_LABELS[selectedSite.vulnerabilityLevel]}
                </div>
                <p className="eyebrow">Selected organ site</p>
                <h3>{selectedSite.title}</h3>
                <dl>
                  <div><dt>Nearest mapped fire</dt><dd>{formatDistance(selectedSite.nearestFireDistanceKm)}</dd></div>
                  <div><dt>Fire place and date</dt><dd>{selectedSite.nearestFire.commune || selectedSite.county} · {formatDate(selectedSite.nearestFire.fireDate)}</dd></div>
                  <div><dt>Reported polygon area</dt><dd>{formatNumber(selectedSite.nearestFire.mappedAreaHa)} ha</dd></div>
                  <div><dt>Events within 15 km</dt><dd>{formatNumber(selectedSite.firesWithin15Km)}</dd></div>
                  <div><dt>Location evidence</dt><dd>Exact venue coordinate</dd></div>
                </dl>
                <div className="fire-site-links">
                  <a href={`/id/${encodeURIComponent(selectedSite.representativeOrganMdvsId)}`}>Open MODAVIS organ <ArrowUpRight size={15} /></a>
                  <a href={selectedSite.nearestFire.sourceUrl} target="_blank" rel="noreferrer">Open EFFIS record <ExternalLink size={14} /></a>
                </div>
                <p className="fire-site-caution">Proximity sets the displayed level. The model does not infer building resistance, suppression, access, or organ condition.</p>
              </>
            ) : <p>No site matches the selected filters.</p>}
          </aside>
        </div>
      </section>

      <section className="fire-story-findings" aria-labelledby="fire-findings-title">
        <div className="fire-story-section-heading">
          <div>
            <p className="eyebrow">What the screen found</p>
            <h2 id="fire-findings-title">
              {formatNumber(immediateSignalCount)} immediate-proximity {immediateSignalCount === 1 ? "signal" : "signals"};{" "}
              {formatNumber(regionalSignalCount)} regional {regionalSignalCount === 1 ? "signal" : "signals"}
            </h2>
          </div>
          <p>The result is deliberately sparse: exact locations only, no invented coordinates, and no upgrade from proximity to predicted loss.</p>
        </div>
        <div className="fire-story-findings-grid">
          <article className="fire-priority-finding">
            <span><Flame size={21} /> Closest convergence</span>
            <strong>{formatDistance(artifact.organSites[0].nearestFireDistanceKm)}</strong>
            <h3>{artifact.organSites[0].title}</h3>
            <p>The nearest EFFIS polygon is dated {formatDate(artifact.organSites[0].nearestFire.fireDate)} at {artifact.organSites[0].nearestFire.commune || artifact.organSites[0].county}.</p>
          </article>
          <article className="fire-band-chart">
            <h3>Organ sites by proximity band</h3>
            <div>
              {artifact.vulnerabilityDistribution.map((item) => (
                <button key={item.bandId} type="button" onClick={() => setLevel(item.level)} aria-label={`Show ${item.label}: ${item.siteCount} sites`}>
                  <span>{item.label}</span>
                  <i><b className={`level-${item.level}`} style={{ width: `${(item.siteCount / maximumBandCount) * 100}%` }} /></i>
                  <strong>{item.siteCount}</strong>
                </button>
              ))}
            </div>
          </article>
        </div>
      </section>

      <section className="fire-priority-table-section" aria-labelledby="fire-priority-table-title">
        <div className="fire-story-section-heading compact">
          <div>
            <p className="eyebrow">Evidence-linked shortlist</p>
            <h2 id="fire-priority-table-title">Sites within 15 km of a mapped 2026 fire</h2>
          </div>
          <p>{prioritySites.length} exact sites. Sort order follows the configured vulnerability band, then nearest distance.</p>
        </div>
        <div className="fire-table-wrap">
          <table>
            <thead><tr><th>Organ site</th><th>Level</th><th>Nearest fire</th><th>Events within 15 km</th><th>Evidence</th></tr></thead>
            <tbody>
              {prioritySites.map((site) => (
                <tr key={site.siteGroupId}>
                  <th scope="row"><a href={`/id/${encodeURIComponent(site.representativeOrganMdvsId)}`}>{site.title}</a><small>{site.county}</small></th>
                  <td><span className={`table-level level-${site.vulnerabilityLevel}`}>{LEVEL_LABELS[site.vulnerabilityLevel]}</span></td>
                  <td><strong>{formatDistance(site.nearestFireDistanceKm)}</strong><small>{site.nearestFire.commune || "Place not reported"} · {formatDate(site.nearestFire.fireDate)}</small></td>
                  <td>{site.firesWithin15Km}</td>
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
            <p className="eyebrow">Population and denominator</p>
            <h2 id="fire-county-title">The four-county study area</h2>
          </div>
          <p>Reported area is summed per EFFIS record and is not a dissolved estimate of unique burned land.</p>
        </div>
        <div className="fire-table-wrap">
          <table>
            <thead><tr><th>County</th><th>2026 fire polygons</th><th>Reported area sum</th><th>Exact organ sites</th><th>Sites within 15 km</th></tr></thead>
            <tbody>
              {artifact.counties.map((item) => (
                <tr key={item.nutsId}>
                  <th scope="row">{item.label}<small>{item.nutsId} · NUTS 2024</small></th>
                  <td>{formatNumber(item.fireEvents)}</td>
                  <td>{formatNumber(item.mappedAreaSumHa)} ha</td>
                  <td>{formatNumber(item.organSites)}</td>
                  <td>{formatNumber(item.sitesWithin15Km)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="fire-method-section" aria-labelledby="fire-method-title">
        <div className="fire-story-section-heading">
          <div>
            <p className="eyebrow">Reproducible method</p>
            <h2 id="fire-method-title">From frozen source polygons to an inspectable screen</h2>
          </div>
          <p>Each stage has a stable contract and a hash. A later cutoff or organ release produces a new artifact without changing the claim boundary.</p>
        </div>
        <ol className="fire-method-flow">
          <li><span>1</span><div><Database size={19} /><h3>Freeze inputs</h3><p>Capture the EFFIS Croatia response and the four GISCO NUTS-3 geometries without overwriting earlier snapshots.</p></div></li>
          <li><span>2</span><div><MapPinned size={19} /><h3>Select exact sites</h3><p>Keep venue-precision MODAVIS map groups inside the four county polygons; exclude locality fallbacks.</p></div></li>
          <li><span>3</span><div><Ruler size={19} /><h3>Measure convergence</h3><p>Test polygon containment, then calculate the shortest point-to-perimeter distance from full source geometry.</p></div></li>
          <li><span>4</span><div><ShieldAlert size={19} /><h3>Classify transparently</h3><p>Apply fixed 0, 1, 5, and 15 km bands while keeping organ count separate as a consequence proxy.</p></div></li>
        </ol>
        <div className="fire-threshold-grid">
          {artifact.vulnerabilityDistribution.map((item) => (
            <article key={item.bandId}>
              <span className={`table-level level-${item.level}`}>{LEVEL_LABELS[item.level]}</span>
              <strong>{item.label}</strong>
              <p>{item.interpretation}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="fire-limitations" aria-labelledby="fire-limitations-title">
        <div>
          <p className="eyebrow">Interpretive boundary</p>
          <h2 id="fire-limitations-title">Coverage and limitations</h2>
          <p>A screening result is useful only when its omissions remain visible.</p>
        </div>
        <ul>
          {artifact.limitations.map((item) => <li key={item}>{item}</li>)}
        </ul>
      </section>

      <section className="fire-provenance" aria-labelledby="fire-provenance-title">
        <div className="fire-story-section-heading compact">
          <div>
            <p className="eyebrow">Sources and fixity</p>
            <h2 id="fire-provenance-title">Evidence that can be revisited</h2>
          </div>
          <p>Snapshot through {formatDate(artifact.scope.snapshotThrough)} · generated {formatDate(artifact.generatedAt)}</p>
        </div>
        <div className="fire-source-cards">
          {artifact.sources.map((source) => (
            <article key={source.label}>
              <span>{source.role}</span>
              <h3>{source.label}</h3>
              {source.releaseVersion && <p>Release {source.releaseVersion}</p>}
              {source.database && <p>{source.database}</p>}
              {source.url && <a href={source.url} target="_blank" rel="noreferrer">Open source <ExternalLink size={14} /></a>}
              {source.doi && <a href={source.doi} target="_blank" rel="noreferrer">Dataset DOI <ExternalLink size={14} /></a>}
            </article>
          ))}
        </div>
        <dl className="fire-fixity-grid">
          <div><dt>Artifact</dt><dd><code>{artifact.artifactId}</code></dd></div>
          <div><dt>Analysis basis SHA-256</dt><dd><code>{artifact.provenance.analysisBasisSha256}</code></dd></div>
          <div><dt>External input snapshot</dt><dd><code>{artifact.provenance.externalInputSnapshotId}</code></dd></div>
          <div><dt>Organ snapshot SHA-256</dt><dd><code>{artifact.provenance.organSnapshot.snapshotSha256}</code></dd></div>
          {artifact.provenance.organSnapshot.activeBaselineManifestSha256 && <div><dt>Active baseline SHA-256</dt><dd><code>{artifact.provenance.organSnapshot.activeBaselineManifestSha256}</code></dd></div>}
        </dl>
        <p className="fire-provenance-note"><CalendarDays size={16} /> The EFFIS service is updated over time. This page reads the frozen response named above, not a live mutable query.</p>
      </section>
    </article>
  );
}
