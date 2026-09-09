import {
  ArrowRight,
  BarChart3,
  ChevronRight,
  CircleAlert,
  ExternalLink,
  Filter,
  MapPin,
  Search,
} from "lucide-react";
import { ChangeEvent, MouseEvent, useEffect, useMemo, useState } from "react";


export const ORGAN_COVERAGE_PATH = "/use-cases/organ-corpus-coverage";
const ORGAN_COVERAGE_ARTIFACT = "/data/use-cases/organ-coverage-v1.json";

type FeatureCount = {
  id: string;
  label: string;
  count: number;
  rate: number;
};

type RankedCount = {
  label: string;
  count: number;
};

type CoverageCountry = {
  country: string;
  records: number;
  corpusShare: number;
  distinctLocalities: number;
  distinctBuilders: number;
  recordsWithStops: number;
  stopOccurrences: number;
  averageStopsPerRecord: number;
  medianStopsPerRecord: number;
  structuredYearRange: {
    minimum: number | null;
    maximum: number | null;
  };
  features: FeatureCount[];
  topLocalities: RankedCount[];
  topBuilders: RankedCount[];
  decades: RankedCount[];
  depthDistribution: Array<{ featureCount: number; records: number }>;
};

type CoverageRecord = {
  sourceRecordId: string;
  sourceId: string;
  sourceNativeId: string;
  sourceUrl: string;
  title: string;
  country: string;
  locality: string | null;
  building: string | null;
  builders: string[];
  years: number[];
  stopCount: number;
  mediaCount: number;
  literatureCount: number;
  eventCount: number;
  featureCount: number;
  featureTotal: number;
  features: Record<string, boolean>;
};

type OrganCoverageArtifact = {
  schemaVersion: string;
  artifactId: string;
  contentSha256: string;
  generatedAt: string;
  status: string;
  question: string;
  scope: {
    claimLevel: string;
    recordUnit: string;
    immutableDatasetReleaseBound: boolean;
    sources: Array<{
      sourceId: string;
      label: string;
      adapter: string;
      records: number;
    }>;
    countries: string[];
  };
  summary: {
    records: number;
    countries: number;
    distinctLocalities: number;
    recordsWithUsableStops: number;
    stopOccurrences: number;
    recordsWithMedia: number;
    recordsWithLiterature: number;
  };
  features: FeatureCount[];
  countries: CoverageCountry[];
  records: CoverageRecord[];
  provenance: {
    analysisVersion: string;
    configSha256: string;
    sourceCorpusSha256: string;
    sourceSnapshotFrom: string | null;
    sourceSnapshotThrough: string | null;
    databaseName: string;
    stopProfileId: string;
    stopProfileContentSha256: string;
  };
  limitations: string[];
  extensionContract: {
    newOrgbaseData: string;
    additionalSources: string;
  };
};

function useCoverageMetadata() {
  useEffect(() => {
    document.title = "Organ corpus coverage and documentation gaps | MODAVIS Navigator";
    let description = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (!description) {
      description = document.createElement("meta");
      description.name = "description";
      document.head.appendChild(description);
    }
    description.content = "Explore where current MODAVIS organ source records are concentrated and which documentation fields are available.";
    let canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.rel = "canonical";
      document.head.appendChild(canonical);
    }
    canonical.href = new URL(ORGAN_COVERAGE_PATH, window.location.origin).toString();
  }, []);
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
  onNavigate(`${window.location.pathname}${window.location.search}`);
  window.scrollTo({ top: 0, behavior: "auto" });
}

export function OrganCoverageUseCase({
  route,
  onNavigate,
}: {
  route: string;
  onNavigate: (path: string) => void;
}) {
  const [artifact, setArtifact] = useState<OrganCoverageArtifact | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCountry, setSelectedCountry] = useState("");
  const [recordQuery, setRecordQuery] = useState("");
  const [recordFilter, setRecordFilter] = useState("all");
  const [recordLimit, setRecordLimit] = useState(12);

  useCoverageMetadata();

  useEffect(() => {
    let cancelled = false;
    fetch(ORGAN_COVERAGE_ARTIFACT, { cache: "force-cache" })
      .then(async (response) => {
        if (!response.ok) throw new Error(`The coverage artifact returned ${response.status}.`);
        return response.json() as Promise<OrganCoverageArtifact>;
      })
      .then((value) => {
        if (
          value.schemaVersion !== "modavis.navigator.use-case.organ-coverage/v1"
          || !Array.isArray(value.countries)
          || !Array.isArray(value.records)
        ) throw new Error("The coverage artifact does not match the supported contract.");
        if (!cancelled) {
          setArtifact(value);
          setError(null);
        }
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setError(reason instanceof Error ? reason.message : "The coverage artifact could not be loaded.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!artifact) return;
    const requested = new URLSearchParams(window.location.search).get("country") || "";
    const match = artifact.countries.find(
      (item) => item.country.toLocaleLowerCase() === requested.toLocaleLowerCase(),
    );
    setSelectedCountry(match?.country || artifact.countries[0]?.country || "");
    setRecordQuery("");
    setRecordFilter("all");
    setRecordLimit(12);
  }, [artifact, route]);

  const country = useMemo(
    () => artifact?.countries.find((item) => item.country === selectedCountry) || null,
    [artifact, selectedCountry],
  );
  const filteredRecords = useMemo(() => {
    if (!artifact || !selectedCountry) return [];
    const normalized = recordQuery.trim().toLocaleLowerCase();
    return artifact.records.filter((record) => {
      if (record.country !== selectedCountry) return false;
      if (
        recordFilter !== "all"
        && !record.features[recordFilter]
      ) return false;
      if (!normalized) return true;
      return [
        record.title,
        record.locality,
        record.building,
        record.sourceNativeId,
        ...record.builders,
      ].filter(Boolean).some(
        (value) => String(value).toLocaleLowerCase().includes(normalized),
      );
    });
  }, [artifact, recordFilter, recordQuery, selectedCountry]);

  function chooseCountry(value: string) {
    setSelectedCountry(value);
    setRecordQuery("");
    setRecordFilter("all");
    setRecordLimit(12);
    const url = new URL(window.location.href);
    url.pathname = ORGAN_COVERAGE_PATH;
    url.searchParams.set("country", value);
    window.history.replaceState(null, "", `${url.pathname}${url.search}`);
    onNavigate(`${window.location.pathname}${window.location.search}`);
  }

  if (loading) {
    return (
      <section className="use-case-page use-case-loading coverage-loading" id="use-cases" tabIndex={-1}>
        <div className="use-case-loading-mark"><MapPin size={26} /></div>
        <p role="status">Loading the organ-coverage analytical snapshot…</p>
      </section>
    );
  }

  if (error || !artifact || !country) {
    return (
      <section className="use-case-page use-case-loading coverage-loading" id="use-cases" tabIndex={-1}>
        <CircleAlert size={28} />
        <h1>Coverage story unavailable</h1>
        <p role="alert">{error || "No coverage artifact is available."}</p>
        <a href="/use-cases" onClick={(event) => navigate(event, "/use-cases", onNavigate)}>Back to Use Cases</a>
      </section>
    );
  }

  const largestCountry = artifact.countries[0];
  const maximumCountryRecords = Math.max(...artifact.countries.map((item) => item.records), 1);
  const weakestFeatures = [...artifact.features].sort((left, right) => left.rate - right.rate).slice(0, 3);

  return (
    <article className="use-case-page coverage-story" id="use-cases" tabIndex={-1}>
      <nav className="use-case-breadcrumbs" aria-label="Breadcrumb">
        <a href="/use-cases" onClick={(event) => navigate(event, "/use-cases", onNavigate)}>Use Cases</a>
        <ChevronRight size={14} />
        <span>Organ corpus coverage</span>
      </nav>

      <header className="coverage-hero">
        <div>
          <div className="use-case-story-meta">
            <span>Coverage audit</span>
            <span>Source-record counts</span>
          </div>
          <p className="eyebrow">Geographic coverage and documentation gaps</p>
          <h1>Where the current MODAVIS organ corpus is documented</h1>
          <p className="coverage-lede">
            Inspect which countries and localities are represented, how strongly
            the current records are concentrated, and which forms of evidence are
            available for each part of the corpus.
          </p>
        </div>
        <aside className="coverage-short-answer" aria-label="Short answer">
          <span>Short answer</span>
          <strong>
            The current organ cohort covers {artifact.summary.countries} countries,
            but {largestCountry.country} accounts for {formatPercent(largestCountry.corpusShare)} of its records.
          </strong>
          <p>
            This describes the imported corpus—not the geographic distribution of
            organs in the world.
          </p>
        </aside>
      </header>

      <section className="coverage-basis" aria-label="Data basis">
        <div><span>Unit</span><strong>Registered organ source record</strong></div>
        <div><span>Source</span><strong>{artifact.scope.sources.map((item) => item.label).join(", ")}</strong></div>
        <div><span>Snapshot through</span><strong>{formatDate(artifact.provenance.sourceSnapshotThrough)}</strong></div>
        <div><span>Claim level</span><strong>Descriptive coverage only</strong></div>
        <p><CircleAlert size={16} /> Not yet bound to an immutable MODAVIS dataset release</p>
      </section>

      <section className="coverage-summary" aria-labelledby="coverage-summary-title">
        <div className="use-case-section-heading">
          <div>
            <p className="eyebrow">Corpus footprint</p>
            <h2 id="coverage-summary-title">What the current import contains</h2>
          </div>
          <p>Counts are source records and structured fields after country-name normalization.</p>
        </div>
        <div className="coverage-metric-grid">
          <CoverageMetric value={formatNumber(artifact.summary.records)} label="organ source records" />
          <CoverageMetric value={formatNumber(artifact.summary.countries)} label="represented countries" />
          <CoverageMetric value={formatNumber(artifact.summary.distinctLocalities)} label="country–locality pairs" />
          <CoverageMetric value={formatNumber(artifact.summary.recordsWithUsableStops)} label="records with usable stop lists" />
        </div>
        <div className="coverage-summary-insight">
          <BarChart3 size={20} />
          <p>
            The shallowest structured dimensions are{" "}
            {weakestFeatures.map((item, index) => (
              <span key={item.id}>
                {index > 0 ? index === weakestFeatures.length - 1 ? " and " : ", " : ""}
                <strong>{item.label.toLocaleLowerCase()}</strong> ({formatPercent(item.rate)})
              </span>
            ))}.
          </p>
        </div>
      </section>

      <section className="coverage-explorer" aria-labelledby="coverage-explorer-title">
        <header>
          <div>
            <p className="eyebrow">Interactive finding</p>
            <h2 id="coverage-explorer-title">Compare geographic footprint and documentation depth</h2>
          </div>
          <p>
            Select a country to see its share of the imported cohort, field
            completeness, frequent localities and builders, and linked record evidence.
          </p>
        </header>

        <div className="coverage-explorer-layout">
          <aside className="coverage-country-list" aria-label="Countries in current organ corpus">
            <div>
              <span>Current footprint</span>
              <strong>{artifact.summary.records} records</strong>
            </div>
            {artifact.countries.map((item) => (
              <button
                type="button"
                key={item.country}
                className={item.country === selectedCountry ? "active" : ""}
                aria-pressed={item.country === selectedCountry}
                onClick={() => chooseCountry(item.country)}
              >
                <span>
                  <strong>{item.country}</strong>
                  <small>{formatPercent(item.corpusShare)}</small>
                </span>
                <i aria-hidden="true">
                  <b style={{ width: `${(item.records / maximumCountryRecords) * 100}%` }} />
                </i>
                <em>{formatNumber(item.records)}</em>
              </button>
            ))}
          </aside>

          <div className="coverage-country-profile">
            <header>
              <div>
                <span>Selected corpus segment</span>
                <h3>{country.country}</h3>
                <p>{formatNumber(country.records)} registered source records · {formatPercent(country.corpusShare)} of this snapshot</p>
              </div>
              <div className="coverage-country-year">
                <span>Structured year mentions</span>
                <strong>{formatYearRange(country.structuredYearRange)}</strong>
              </div>
            </header>

            <div className="coverage-country-metrics">
              <div><strong>{formatNumber(country.distinctLocalities)}</strong><span>localities</span></div>
              <div><strong>{formatNumber(country.distinctBuilders)}</strong><span>builder names</span></div>
              <div><strong>{formatNumber(country.stopOccurrences)}</strong><span>usable stop rows</span></div>
              <div><strong>{formatDecimal(country.averageStopsPerRecord)}</strong><span>mean stops / record</span></div>
            </div>

            <section className="coverage-feature-profile" aria-labelledby="coverage-feature-profile-title">
              <div className="coverage-result-heading">
                <div>
                  <span>Documentation depth</span>
                  <h4 id="coverage-feature-profile-title">Structured fields present in records</h4>
                </div>
                <small>Absence means “not present in this record”</small>
              </div>
              <div className="coverage-feature-grid">
                {country.features.map((feature) => (
                  <div key={feature.id}>
                    <span>{feature.label}</span>
                    <strong>{formatPercent(feature.rate)}</strong>
                    <i aria-hidden="true"><b style={{ width: `${feature.rate * 100}%` }} /></i>
                    <small>{formatNumber(feature.count)} of {formatNumber(country.records)}</small>
                  </div>
                ))}
              </div>
            </section>

            <div className="coverage-ranked-grid">
              <RankedList title="Most represented localities" items={country.topLocalities} />
              <RankedList title="Most frequent builder names" items={country.topBuilders} />
            </div>
          </div>
        </div>
      </section>

      <section className="coverage-comparison" aria-labelledby="coverage-comparison-title">
        <div className="use-case-section-heading">
          <div>
            <p className="eyebrow">Accessible comparison</p>
            <h2 id="coverage-comparison-title">All represented countries</h2>
          </div>
          <p>Rates show records containing the named structured evidence type.</p>
        </div>
        <div className="coverage-table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">Country</th>
                <th scope="col">Records</th>
                <th scope="col">Corpus share</th>
                <th scope="col">Localities</th>
                <th scope="col">Usable stops</th>
                <th scope="col">Media</th>
                <th scope="col">Literature</th>
                <th scope="col">Events</th>
              </tr>
            </thead>
            <tbody>
              {artifact.countries.map((item) => (
                <tr key={item.country}>
                  <th scope="row">
                    <button type="button" onClick={() => chooseCountry(item.country)}>{item.country}</button>
                  </th>
                  <td>{formatNumber(item.records)}</td>
                  <td>{formatPercent(item.corpusShare)}</td>
                  <td>{formatNumber(item.distinctLocalities)}</td>
                  <td>{formatPercent(featureRate(item, "stopSpecification"))}</td>
                  <td>{formatPercent(featureRate(item, "media"))}</td>
                  <td>{formatPercent(featureRate(item, "literature"))}</td>
                  <td>{formatPercent(featureRate(item, "eventHistory"))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="coverage-evidence" aria-labelledby="coverage-evidence-title">
        <div className="use-case-section-heading">
          <div>
            <p className="eyebrow">Explore the evidence</p>
            <h2 id="coverage-evidence-title">Source-linked records from {country.country}</h2>
          </div>
          <p>These are individual records behind the aggregate—not a representative sample of all organs in the country.</p>
        </div>
        <div className="coverage-record-controls">
          <label>
            <span>Search this country</span>
            <div><Search size={16} /><input value={recordQuery} onChange={(event) => { setRecordQuery(event.target.value); setRecordLimit(12); }} placeholder="Building, locality, builder or source ID" /></div>
          </label>
          <label>
            <span>Require evidence type</span>
            <div><Filter size={16} /><select value={recordFilter} onChange={(event: ChangeEvent<HTMLSelectElement>) => { setRecordFilter(event.target.value); setRecordLimit(12); }}>
              <option value="all">All records</option>
              <option value="stopSpecification">Usable stop specification</option>
              <option value="media">Linked media</option>
              <option value="literature">Literature reference</option>
              <option value="eventHistory">Structured event history</option>
              <option value="description">Description</option>
            </select></div>
          </label>
          <p aria-live="polite">{formatNumber(filteredRecords.length)} matching record{filteredRecords.length === 1 ? "" : "s"}</p>
        </div>

        <div className="coverage-record-table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">Documented organ / venue</th>
                <th scope="col">Locality</th>
                <th scope="col">Builder evidence</th>
                <th scope="col">Structured evidence</th>
                <th scope="col">Source</th>
              </tr>
            </thead>
            <tbody>
              {filteredRecords.slice(0, recordLimit).map((record) => (
                <tr key={record.sourceRecordId}>
                  <th scope="row">
                    <strong><a href={`/source/${encodeURIComponent(record.sourceRecordId)}`}>{record.title}</a></strong>
                    <small><a href={`/source/${encodeURIComponent(record.sourceRecordId)}`}>orgbase {record.sourceNativeId}</a></small>
                  </th>
                  <td>{record.locality || "Not recorded"}</td>
                  <td>{record.builders.slice(0, 2).join(", ") || "Not recorded"}</td>
                  <td>
                    <span>{record.stopCount} stops</span>
                    <span>{record.mediaCount} media</span>
                    <span>{record.literatureCount} literature</span>
                  </td>
                  <td>
                    <a href={`/source/${encodeURIComponent(record.sourceRecordId)}`}>MODAVIS evidence</a>
                    {record.sourceUrl ? (
                      <a href={record.sourceUrl} target="_blank" rel="noreferrer">
                        Open source <ExternalLink size={13} />
                      </a>
                    ) : "No public source link"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!filteredRecords.length && (
          <p className="coverage-record-empty">No records match the current evidence filter and search.</p>
        )}
        {recordLimit < filteredRecords.length && (
          <button type="button" className="coverage-load-records" onClick={() => setRecordLimit((value) => value + 20)}>
            Show more records
          </button>
        )}
      </section>

      <section className="coverage-meaning" aria-labelledby="coverage-meaning-title">
        <div>
          <p className="eyebrow">What the result means</p>
          <h2 id="coverage-meaning-title">Coverage is a property of the corpus, not the world</h2>
          <p>
            The page identifies where the current import is strong enough to support
            exploration and where source fields are sparse. It is useful for
            prioritizing ingestion, documentation, and analytical validation.
          </p>
          <p>
            It cannot support country-level organ-density comparisons because the
            denominator is imported source records, not a census of instruments.
          </p>
        </div>
        <aside>
          <CircleAlert size={21} />
          <div>
            <strong>Most important limitation</strong>
            <p>{artifact.limitations[0]}</p>
          </div>
        </aside>
      </section>

      <section className="coverage-method" aria-labelledby="coverage-method-title">
        <div className="use-case-section-heading">
          <div>
            <p className="eyebrow">Methods and evidence</p>
            <h2 id="coverage-method-title">How the audit was produced</h2>
          </div>
        </div>
        <ol className="coverage-method-flow">
          <li><span>01</span><strong>Freeze inputs</strong><p>Read source records in one repeatable-read transaction.</p></li>
          <li><span>02</span><strong>Normalize geography</strong><p>Select the latest source location and govern country aliases.</p></li>
          <li><span>03</span><strong>Measure fields</strong><p>Count each evidence dimension without imputing missing facts.</p></li>
          <li><span>04</span><strong>Link evidence</strong><p>Retain bounded public record summaries and upstream source URLs.</p></li>
          <li><span>05</span><strong>Publish aggregates</strong><p>Hash the result and serve it as a read-only analytical artifact.</p></li>
        </ol>

        <div className="coverage-limitations">
          <div>
            <h3>Coverage and limitations</h3>
            <ul>{artifact.limitations.map((item) => <li key={item}>{item}</li>)}</ul>
          </div>
          <div>
            <h3>Designed for the next imports</h3>
            <p><strong>Complete orgbase:</strong> {artifact.extensionContract.newOrgbaseData}</p>
            <p><strong>Other sources:</strong> {artifact.extensionContract.additionalSources}</p>
          </div>
        </div>

        <details className="stop-provenance coverage-provenance">
          <summary>Artifact identifiers and fixity</summary>
          <dl>
            <div><dt>Analytical artifact</dt><dd><code>{artifact.artifactId}</code></dd></div>
            <div><dt>Source corpus SHA-256</dt><dd><code>{artifact.provenance.sourceCorpusSha256}</code></dd></div>
            <div><dt>Stop-profile input</dt><dd><code>{artifact.provenance.stopProfileId}</code></dd></div>
            <div><dt>Analysis version</dt><dd><code>{artifact.provenance.analysisVersion}</code></dd></div>
          </dl>
        </details>
      </section>

      <footer className="coverage-next">
        <div>
          <p className="eyebrow">Use the corpus responsibly</p>
          <h2>Explore individual organs with the coverage context in view</h2>
          <p>The country selector and source links show what supports each aggregate; the organ catalog remains the place for canonical public records.</p>
        </div>
        <a href="/organs">Open the organ catalog <ArrowRight size={17} /></a>
      </footer>
    </article>
  );
}

function CoverageMetric({ value, label }: { value: string; label: string }) {
  return <div className="coverage-metric"><strong>{value}</strong><span>{label}</span></div>;
}

function RankedList({ title, items }: { title: string; items: RankedCount[] }) {
  const maximum = Math.max(...items.map((item) => item.count), 1);
  return (
    <section className="coverage-ranked-list">
      <div className="coverage-result-heading"><h4>{title}</h4><small>Records</small></div>
      {items.length ? (
        <ol>
          {items.slice(0, 8).map((item) => (
            <li key={item.label}>
              <span>{item.label}</span>
              <i aria-hidden="true"><b style={{ width: `${(item.count / maximum) * 100}%` }} /></i>
              <strong>{formatNumber(item.count)}</strong>
            </li>
          ))}
        </ol>
      ) : <p>No structured values are available.</p>}
    </section>
  );
}

function featureRate(country: CoverageCountry, id: string): number {
  return country.features.find((feature) => feature.id === id)?.rate || 0;
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en").format(value);
}

function formatDecimal(value: number): string {
  return new Intl.NumberFormat("en", { maximumFractionDigits: 1 }).format(value);
}

function formatPercent(value: number): string {
  return new Intl.NumberFormat("en", { style: "percent", maximumFractionDigits: 1 }).format(value);
}

function formatDate(value: string | null): string {
  if (!value) return "Not recorded";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not recorded";
  return new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric" }).format(date);
}

function formatYearRange(value: CoverageCountry["structuredYearRange"]): string {
  if (!value.minimum || !value.maximum) return "Not recorded";
  return value.minimum === value.maximum ? String(value.minimum) : `${value.minimum}–${value.maximum}`;
}
