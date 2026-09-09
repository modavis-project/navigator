import {
  ArrowRight,
  Building2,
  CalendarDays,
  ChevronRight,
  CircleAlert,
  ExternalLink,
  Filter,
  GitFork,
  Network,
  Search,
  UsersRound,
} from "lucide-react";
import { FormEvent, MouseEvent, useEffect, useMemo, useState } from "react";


export const BUILDER_NETWORK_PATH = "/use-cases/builder-workshop-networks";
const BUILDER_NETWORK_ARTIFACT = "/data/use-cases/builder-network-v1.json";

type RankedCount = {
  label: string;
  count: number;
};

type BuilderProfile = {
  label: string;
  records: number;
  countries: RankedCount[];
  countryCount: number;
  localityCount: number;
  datedRecords: number;
  activityTaggedRecords: number;
  yearRange: { minimum: number | null; maximum: number | null };
  medianYear: number | null;
  decades: RankedCount[];
  activities: Array<{
    activity: string;
    label: string;
    records: number;
    rate: number;
  }>;
  neighbors: Array<{ label: string; sharedRecords: number }>;
  neighborCount: number;
  observedOpusNumbers: string[];
};

type Participation = {
  sourceRecordId: string;
  sourceId: string;
  sourceNativeId: string;
  sourceUrl: string;
  title: string;
  country: string;
  locality: string | null;
  building: string | null;
  label: string;
  years: number[];
  activities: string[];
  opusNumbers: string[];
  sourceAssignments: number;
};

type BuilderNetworkArtifact = {
  schemaVersion: string;
  artifactId: string;
  contentSha256: string;
  generatedAt: string;
  status: string;
  question: string;
  scope: {
    claimLevel: string;
    nodeUnit: string;
    edgeUnit: string;
    recordUnit: string;
    immutableDatasetReleaseBound: boolean;
    sources: Array<{
      sourceId: string;
      label: string;
      adapter: string;
      recordsInspected: number;
    }>;
    countries: string[];
  };
  summary: {
    sourceRecordsInspected: number;
    recordsWithNamedParticipants: number;
    sourceLabels: number;
    recordLabelRelationships: number;
    recordsWithMultipleLabels: number;
    cooccurrenceEdges: number;
    datedRelationships: number;
    activityTaggedRelationships: number;
    countries: number;
    yearRange: { minimum: number | null; maximum: number | null };
  };
  quality: {
    rawParticipantAssignments: number;
    excludedPlaceholderOrSentinelAssignments: number;
    retainedAssignments: number;
    duplicateAssignmentsCollapsed: number;
    exactLabelMatchingOnly: boolean;
  };
  profiles: BuilderProfile[];
  edges: Array<{ source: string; target: string; sharedRecords: number }>;
  participations: Participation[];
  distributions: {
    countries: RankedCount[];
    topLabels: RankedCount[];
  };
  provenance: {
    analysisVersion: string;
    configSha256: string;
    sourceCorpusSha256: string;
    sourceSnapshotFrom: string | null;
    sourceSnapshotThrough: string | null;
    databaseName: string;
  };
  limitations: string[];
  extensionContract: {
    newOrgbaseData: string;
    additionalSources: string;
    canonicalIdentities: string;
    relationshipSemantics: string;
  };
};

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en").format(value);
}

function formatPercent(value: number): string {
  return new Intl.NumberFormat("en", {
    style: "percent",
    maximumFractionDigits: 1,
  }).format(value);
}

function formatDate(value: string | null): string {
  if (!value) return "Not release-bound";
  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

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

function useBuilderNetworkMetadata() {
  useEffect(() => {
    document.title = "Builder and workshop networks | MODAVIS Navigator";
    let description = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (!description) {
      description = document.createElement("meta");
      description.name = "description";
      document.head.appendChild(description);
    }
    description.content = "Explore exact builder and workshop source labels across organ records, places, periods, activities, and record-level co-occurrences.";
    let canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.rel = "canonical";
      document.head.appendChild(canonical);
    }
    canonical.href = new URL(BUILDER_NETWORK_PATH, window.location.origin).toString();
  }, []);
}

function labelUrl(label: string): string {
  const url = new URL(BUILDER_NETWORK_PATH, window.location.origin);
  url.searchParams.set("label", label);
  return `${url.pathname}${url.search}`;
}

function activityLabel(value: string): string {
  return value
    .split(/[ /_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function BuilderNetworkUseCase({
  route,
  onNavigate,
}: {
  route: string;
  onNavigate: (path: string) => void;
}) {
  const [artifact, setArtifact] = useState<BuilderNetworkArtifact | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedLabel, setSelectedLabel] = useState("");
  const [labelQuery, setLabelQuery] = useState("");
  const [countryFilter, setCountryFilter] = useState("all");
  const [evidenceQuery, setEvidenceQuery] = useState("");
  const [recordLimit, setRecordLimit] = useState(12);

  useBuilderNetworkMetadata();

  useEffect(() => {
    let cancelled = false;
    fetch(BUILDER_NETWORK_ARTIFACT, { cache: "force-cache" })
      .then(async (response) => {
        if (!response.ok) throw new Error(`The builder-network artifact returned ${response.status}.`);
        return response.json() as Promise<BuilderNetworkArtifact>;
      })
      .then((value) => {
        if (
          value.schemaVersion !== "modavis.navigator.use-case.builder-network/v1"
          || !Array.isArray(value.profiles)
          || !Array.isArray(value.participations)
        ) throw new Error("The builder-network artifact does not match the supported contract.");
        if (!cancelled) {
          setArtifact(value);
          setError(null);
        }
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setError(reason instanceof Error ? reason.message : "The builder-network artifact could not be loaded.");
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
    const requested = new URLSearchParams(window.location.search).get("label") || "";
    const match = artifact.profiles.find(
      (item) => item.label.toLocaleLowerCase() === requested.toLocaleLowerCase(),
    );
    const fallback = artifact.profiles.find((item) => item.label === "E.F. Walcker & Cie.")
      || artifact.profiles[0];
    const next = match?.label || fallback?.label || "";
    setSelectedLabel(next);
    setLabelQuery(next);
    setCountryFilter("all");
    setEvidenceQuery("");
    setRecordLimit(12);
  }, [artifact, route]);

  const profile = useMemo(
    () => artifact?.profiles.find((item) => item.label === selectedLabel) || null,
    [artifact, selectedLabel],
  );

  const suggestions = useMemo(() => {
    if (!artifact) return [];
    const normalized = labelQuery.trim().toLocaleLowerCase();
    const matching = normalized
      ? artifact.profiles.filter((item) => item.label.toLocaleLowerCase().includes(normalized))
      : artifact.profiles;
    return matching.slice(0, 12);
  }, [artifact, labelQuery]);

  const evidence = useMemo(() => {
    if (!artifact || !selectedLabel) return [];
    const query = evidenceQuery.trim().toLocaleLowerCase();
    return artifact.participations.filter((item) => {
      if (item.label !== selectedLabel) return false;
      if (countryFilter !== "all" && item.country !== countryFilter) return false;
      if (!query) return true;
      return [
        item.title,
        item.country,
        item.locality || "",
        ...item.years.map(String),
        ...item.activities,
        ...item.opusNumbers,
      ].join(" ").toLocaleLowerCase().includes(query);
    });
  }, [artifact, countryFilter, evidenceQuery, selectedLabel]);

  const decades = useMemo(() => {
    const counter = new Map<number, number>();
    for (const item of evidence) {
      for (const year of new Set(item.years)) {
        const decade = Math.floor(year / 10) * 10;
        counter.set(decade, (counter.get(decade) || 0) + 1);
      }
    }
    return [...counter.entries()]
      .sort(([left], [right]) => left - right)
      .map(([decade, count]) => ({ decade, count }));
  }, [evidence]);

  function chooseLabel(label: string) {
    setSelectedLabel(label);
    setLabelQuery(label);
    setCountryFilter("all");
    setEvidenceQuery("");
    setRecordLimit(12);
    window.history.replaceState(null, "", labelUrl(label));
    onNavigate(currentRoute());
  }

  function submitLabel(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!artifact) return;
    const exact = artifact.profiles.find(
      (item) => item.label.toLocaleLowerCase() === labelQuery.trim().toLocaleLowerCase(),
    );
    const next = exact || suggestions[0];
    if (next) chooseLabel(next.label);
  }

  if (loading) {
    return (
      <section className="use-case-page use-case-loading" id="use-cases" tabIndex={-1}>
        <div className="use-case-loading-mark"><Network size={26} /></div>
        <p className="eyebrow">Resolving the source-label network</p>
        <h1>Loading builder and workshop evidence…</h1>
      </section>
    );
  }

  if (error || !artifact || !profile) {
    return (
      <section className="use-case-page use-case-error" id="use-cases" tabIndex={-1}>
        <CircleAlert size={30} />
        <p className="eyebrow">Data story unavailable</p>
        <h1>The builder-network artifact could not be opened.</h1>
        <p>{error || "No supported source-label profile was found."}</p>
        <a href="/use-cases" onClick={(event) => navigate(event, "/use-cases", onNavigate)}>
          Return to Use Cases
        </a>
      </section>
    );
  }

  const maximumCountry = Math.max(...profile.countries.map((item) => item.count), 1);
  const maximumDecade = Math.max(...decades.map((item) => item.count), 1);
  const maximumNeighbor = Math.max(...profile.neighbors.map((item) => item.sharedRecords), 1);
  const visibleEvidence = evidence.slice(0, recordLimit);
  const datedRate = profile.datedRecords / profile.records;
  const activityRate = profile.activityTaggedRecords / profile.records;
  const finland = artifact.distributions.countries.find((item) => item.label === "Finland");
  const finlandShare = (finland?.count || 0) / artifact.summary.recordsWithNamedParticipants;

  return (
    <article className="use-case-page builder-story" id="use-cases" tabIndex={-1}>
      <nav className="use-case-breadcrumbs" aria-label="Breadcrumb">
        <a href="/use-cases" onClick={(event) => navigate(event, "/use-cases", onNavigate)}>
          Use Cases
        </a>
        <ChevronRight size={14} aria-hidden="true" />
        <span>Builder and workshop networks</span>
      </nav>

      <header className="builder-hero">
        <div>
          <div className="builder-badges">
            <span>Exact source labels</span>
            <span>Co-occurrence network</span>
          </div>
          <p className="eyebrow">Builder and workshop networks</p>
          <h1>Who appears across organ-building projects?</h1>
          <p className="builder-lede">
            Trace exact participant labels across organ records, places, periods,
            activities, and shared-record neighborhoods—while preserving the
            distinction between source evidence and canonical identity.
          </p>
        </div>
        <aside className="builder-short-answer">
          <span>Short answer</span>
          <strong>
            {formatNumber(artifact.summary.sourceLabels)} participant labels connect{" "}
            {formatNumber(artifact.summary.recordsWithNamedParticipants)} organ records.
          </strong>
          <p>
            The network contains {formatNumber(artifact.summary.cooccurrenceEdges)} shared-record
            edges. These are discovery signals, not assertions of collaboration.
          </p>
        </aside>
      </header>

      <section className="builder-basis" aria-label="Data basis">
        <div><span>Source</span><strong>{artifact.scope.sources[0]?.label || "Current corpus"}</strong></div>
        <div><span>Records inspected</span><strong>{formatNumber(artifact.summary.sourceRecordsInspected)}</strong></div>
        <div><span>Exact labels</span><strong>{formatNumber(artifact.summary.sourceLabels)}</strong></div>
        <div><span>Observed years</span><strong>{artifact.summary.yearRange.minimum}–{artifact.summary.yearRange.maximum}</strong></div>
        <div><span>Snapshot through</span><strong>{formatDate(artifact.provenance.sourceSnapshotThrough)}</strong></div>
      </section>

      <section className="builder-summary" aria-labelledby="builder-summary-title">
        <div className="use-case-section-heading">
          <div>
            <p className="eyebrow">Corpus at a glance</p>
            <h2 id="builder-summary-title">A record-participation network, not a social graph</h2>
          </div>
          <p>
            Repeated assignments for one exact label are collapsed within each
            record before profiles and edges are counted.
          </p>
        </div>
        <div className="builder-metric-grid">
          <article><Building2 size={20} /><strong>{formatNumber(artifact.summary.recordLabelRelationships)}</strong><span>record–label relationships</span></article>
          <article><UsersRound size={20} /><strong>{formatNumber(artifact.summary.recordsWithMultipleLabels)}</strong><span>multi-label records</span></article>
          <article><GitFork size={20} /><strong>{formatNumber(artifact.summary.cooccurrenceEdges)}</strong><span>distinct co-occurrence edges</span></article>
          <article><CalendarDays size={20} /><strong>{formatNumber(artifact.summary.datedRelationships)}</strong><span>dated relationships</span></article>
        </div>
        <div className="builder-coverage-note">
          <strong>{formatPercent(finlandShare)}</strong>
          <div>
            <span>of participant-bearing records are currently associated with Finland</span>
            <p>Geographic concentration qualifies every apparent workshop footprint and network comparison below.</p>
          </div>
        </div>
      </section>

      <section className="builder-explorer" aria-labelledby="builder-explorer-title">
        <div className="use-case-section-heading">
          <div>
            <p className="eyebrow">Interactive source-label resolver</p>
            <h2 id="builder-explorer-title">Choose a builder or workshop label</h2>
          </div>
          <p>
            Search the exact strings present in the source. Similar spellings are
            deliberately not merged without an identity mapping.
          </p>
        </div>

        <form className="builder-label-search" onSubmit={submitLabel}>
          <label>
            <Search size={19} />
            <span className="sr-only">Builder or workshop source label</span>
            <input
              value={labelQuery}
              onChange={(event) => setLabelQuery(event.target.value)}
              placeholder="Try Walcker, Virtanen, Rieger…"
              autoComplete="off"
            />
          </label>
          <button type="submit">Open label <ArrowRight size={16} /></button>
        </form>
        {labelQuery.trim() && labelQuery !== selectedLabel && (
          <div className="builder-suggestions" aria-label="Matching source labels">
            {suggestions.map((item) => (
              <button key={item.label} type="button" onClick={() => chooseLabel(item.label)}>
                <span>{item.label}</span>
                <strong>{item.records} records</strong>
              </button>
            ))}
            {!suggestions.length && <p>No exact source labels match this text.</p>}
          </div>
        )}

        <div className="builder-profile-head">
          <div>
            <span>Selected exact source label</span>
            <h3>{profile.label}</h3>
            <p>
              {formatNumber(profile.records)} records · {profile.countryCount} countries ·{" "}
              {profile.localityCount} distinct current country/locality pairs
            </p>
            <a className="builder-person-search-link" href={`/persons?q=${encodeURIComponent(profile.label)}`}>Find this label in People</a>
          </div>
          <div className="builder-profile-quality">
            <span><strong>{formatPercent(datedRate)}</strong> dated</span>
            <span><strong>{formatPercent(activityRate)}</strong> activity-tagged</span>
          </div>
        </div>

        <div className="builder-profile-grid">
          <article className="builder-footprint-card">
            <div className="builder-panel-head">
              <div><span>Current record geography</span><h3>Documented footprint</h3></div>
            </div>
            <div className="builder-bar-list">
              {profile.countries.map((item) => (
                <div key={item.label}>
                  <span>{item.label}</span>
                  <i><b style={{ width: `${(item.count / maximumCountry) * 100}%` }} /></i>
                  <strong>{item.count}</strong>
                </div>
              ))}
            </div>
            <p>Locations belong to organ records and are not automatically workshop locations.</p>
          </article>

          <article className="builder-time-card">
            <div className="builder-panel-head">
              <div><span>Dated source assignments</span><h3>Records by decade</h3></div>
              <div className="builder-time-summary">
                <strong>{profile.yearRange.minimum ?? "—"}–{profile.yearRange.maximum ?? "—"}</strong>
                <span>median {profile.medianYear ?? "—"}</span>
              </div>
            </div>
            {decades.length ? (
              <div className="builder-timeline-scroll">
                <div
                  className="builder-timeline"
                  style={{ gridTemplateColumns: `repeat(${decades.length}, minmax(26px, 1fr))` }}
                  role="img"
                  aria-label={`Records carrying ${profile.label} by decade`}
                >
                  {decades.map((item) => (
                    <div key={item.decade}>
                      <span>{item.count}</span>
                      <i style={{ height: `${Math.max(8, (item.count / maximumDecade) * 100)}%` }} />
                      <em>{item.decade % 50 === 0 || decades.length < 14 ? item.decade : ""}</em>
                    </div>
                  ))}
                </div>
              </div>
            ) : <p className="builder-empty">No dated assignments match this lens.</p>}
            <details className="builder-chart-table">
              <summary>Open accessible decade table</summary>
              <table>
                <thead><tr><th>Decade</th><th>Record assignments</th></tr></thead>
                <tbody>{decades.map((item) => <tr key={item.decade}><td>{item.decade}s</td><td>{item.count}</td></tr>)}</tbody>
              </table>
            </details>
          </article>
        </div>

        <div className="builder-secondary-grid">
          <article className="builder-activity-card">
            <div className="builder-panel-head">
              <div><span>Structured work types</span><h3>Documented activities</h3></div>
            </div>
            {profile.activities.length ? (
              <div className="builder-activity-list">
                {profile.activities.map((item) => (
                  <div key={item.activity}>
                    <span>{item.label}</span>
                    <strong>{item.records}</strong>
                    <em>{formatPercent(item.rate)}</em>
                  </div>
                ))}
              </div>
            ) : <p className="builder-empty">This label has dates or roles, but no configured lifecycle activity.</p>}
          </article>

          <article className="builder-network-card">
            <div className="builder-panel-head">
              <div><span>Shared organ records</span><h3>Source-label neighborhood</h3></div>
              <strong>{profile.neighborCount} neighbors</strong>
            </div>
            {profile.neighbors.length ? (
              <div className="builder-neighbor-list">
                {profile.neighbors.slice(0, 9).map((item) => (
                  <button key={item.label} type="button" onClick={() => chooseLabel(item.label)}>
                    <span>{item.label}</span>
                    <i><b style={{ width: `${(item.sharedRecords / maximumNeighbor) * 100}%` }} /></i>
                    <strong>{item.sharedRecords}</strong>
                  </button>
                ))}
              </div>
            ) : <p className="builder-empty">No other retained label occurs in the same records.</p>}
            <p className="builder-network-warning">
              Shared records can describe successive builders, restorers, or transfers.
              They do not establish direct collaboration.
            </p>
          </article>
        </div>
      </section>

      <section className="builder-comparison" aria-labelledby="builder-comparison-title">
        <div className="use-case-section-heading">
          <div>
            <p className="eyebrow">Comparative source-label index</p>
            <h2 id="builder-comparison-title">Frequently recurring labels</h2>
          </div>
          <p>Record counts indicate representation in this corpus, not historical output or market share.</p>
        </div>
        <div className="builder-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Exact source label</th>
                <th>Records</th>
                <th>Countries</th>
                <th>Localities</th>
                <th>Observed years</th>
                <th>Neighbors</th>
              </tr>
            </thead>
            <tbody>
              {artifact.profiles.slice(0, 24).map((item) => (
                <tr key={item.label} className={item.label === selectedLabel ? "is-selected" : ""}>
                  <th><button type="button" onClick={() => chooseLabel(item.label)}>{item.label}</button></th>
                  <td>{item.records}</td>
                  <td>{item.countryCount}</td>
                  <td>{item.localityCount}</td>
                  <td>{item.yearRange.minimum ?? "—"}–{item.yearRange.maximum ?? "—"}</td>
                  <td>{item.neighborCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="builder-evidence" aria-labelledby="builder-evidence-title">
        <div className="use-case-section-heading">
          <div>
            <p className="eyebrow">Explore the evidence</p>
            <h2 id="builder-evidence-title">Records carrying “{profile.label}”</h2>
          </div>
          <p>{formatNumber(evidence.length)} matching record–label relationships.</p>
        </div>
        <div className="builder-record-controls">
          <label className="builder-record-search">
            <Search size={17} />
            <span className="sr-only">Search participation evidence</span>
            <input
              type="search"
              value={evidenceQuery}
              onChange={(event) => {
                setEvidenceQuery(event.target.value);
                setRecordLimit(12);
              }}
              placeholder="Search venue, locality, date, activity, or opus"
            />
          </label>
          <label className="builder-country-filter">
            <Filter size={16} />
            <span>Country</span>
            <select
              value={countryFilter}
              onChange={(event) => {
                setCountryFilter(event.target.value);
                setRecordLimit(12);
              }}
            >
              <option value="all">All</option>
              {profile.countries.map((item) => <option key={item.label} value={item.label}>{item.label}</option>)}
            </select>
          </label>
        </div>
        <div className="builder-record-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Organ record</th>
                <th>Current location</th>
                <th>Structured years</th>
                <th>Documented activities</th>
                <th>Identifiers</th>
                <th>Source</th>
              </tr>
            </thead>
            <tbody>
              {visibleEvidence.map((item) => (
                <tr key={`${item.label}:${item.sourceRecordId}`}>
                  <td><strong><a href={`/source/${encodeURIComponent(item.sourceRecordId)}`}>{item.title}</a></strong><span><a href={`/source/${encodeURIComponent(item.sourceRecordId)}`}>{item.sourceRecordId}</a></span></td>
                  <td>{[item.locality, item.country].filter(Boolean).join(", ")}</td>
                  <td>{item.years.join(", ") || "Not recorded"}</td>
                  <td>{item.activities.map(activityLabel).join(", ") || "Not classified"}</td>
                  <td>{item.opusNumbers.length ? `Opus ${item.opusNumbers.join(", ")}` : "—"}</td>
                  <td>
                    <a href={`/source/${encodeURIComponent(item.sourceRecordId)}`}>MODAVIS evidence</a>
                    {item.sourceUrl ? (
                      <a href={item.sourceUrl} target="_blank" rel="noreferrer">
                        orgbase <ExternalLink size={13} />
                      </a>
                    ) : <span>Source record {item.sourceNativeId}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!visibleEvidence.length && <p className="builder-empty">No evidence matches the current filters.</p>}
        </div>
        {evidence.length > recordLimit && (
          <button className="builder-show-more" type="button" onClick={() => setRecordLimit((value) => value + 20)}>
            Show more evidence
          </button>
        )}
      </section>

      <section className="builder-interpretation" aria-labelledby="builder-meaning-title">
        <div>
          <p className="eyebrow">What the result means</p>
          <h2 id="builder-meaning-title">Repeated names reveal research pathways, not finished identities</h2>
        </div>
        <div>
          <p>
            The network makes it possible to find where a workshop label recurs,
            which periods and activities are documented, and which other labels
            share the same organ histories.
          </p>
          <p>
            Its scientific value is as a source-backed index and candidate-generation
            layer. Biographical, organizational, lineage, or collaboration claims
            require canonical identity resolution and relation-specific evidence.
          </p>
        </div>
      </section>

      <section className="builder-method" aria-labelledby="builder-method-title">
        <div className="use-case-section-heading">
          <div>
            <p className="eyebrow">Methods and evidence</p>
            <h2 id="builder-method-title">How the network was produced</h2>
          </div>
          <p>All aggregates are precomputed in a content-addressed analytical artifact.</p>
        </div>
        <ol className="builder-method-flow">
          <li><span>1</span><div><strong>Select</strong><p>Read configured source records in a repeatable, read-only transaction.</p></div></li>
          <li><span>2</span><div><strong>Clean</strong><p>Remove configured placeholder and sentinel labels while retaining exact source strings.</p></div></li>
          <li><span>3</span><div><strong>Collapse</strong><p>Combine duplicate assignments for one exact label within each organ record.</p></div></li>
          <li><span>4</span><div><strong>Connect</strong><p>Create an edge when two retained labels occur in the same source record.</p></div></li>
          <li><span>5</span><div><strong>Qualify</strong><p>Carry dates, activities, locations, identifiers, and source links into evidence rows.</p></div></li>
        </ol>
        <div className="builder-quality-grid">
          <div><span>Raw assignments</span><strong>{formatNumber(artifact.quality.rawParticipantAssignments)}</strong></div>
          <div><span>Excluded placeholders/sentinels</span><strong>{formatNumber(artifact.quality.excludedPlaceholderOrSentinelAssignments)}</strong></div>
          <div><span>Duplicate assignments collapsed</span><strong>{formatNumber(artifact.quality.duplicateAssignmentsCollapsed)}</strong></div>
          <div><span>Retained record–label relationships</span><strong>{formatNumber(artifact.summary.recordLabelRelationships)}</strong></div>
        </div>
        <div className="builder-fixity">
          <div><span>Artifact</span><code>{artifact.artifactId}</code></div>
          <div><span>Analysis</span><code>{artifact.provenance.analysisVersion}</code></div>
          <div><span>Input corpus SHA-256</span><code>{artifact.provenance.sourceCorpusSha256}</code></div>
          <div><span>Configuration SHA-256</span><code>{artifact.provenance.configSha256}</code></div>
        </div>
      </section>

      <section className="builder-limits" aria-labelledby="builder-limits-title">
        <div>
          <CircleAlert size={24} />
          <p className="eyebrow">Coverage and limitations</p>
          <h2 id="builder-limits-title">Use the network as evidence discovery</h2>
        </div>
        <ul>{artifact.limitations.map((limitation) => <li key={limitation}>{limitation}</li>)}</ul>
      </section>

      <section className="builder-future" aria-labelledby="builder-future-title">
        <div>
          <p className="eyebrow">Designed for extension</p>
          <h2 id="builder-future-title">New sources can deepen the network without erasing provenance</h2>
        </div>
        <div className="builder-future-grid">
          <article><span>Complete orgbase</span><p>{artifact.extensionContract.newOrgbaseData}</p></article>
          <article><span>Additional providers</span><p>{artifact.extensionContract.additionalSources}</p></article>
          <article><span>Canonical identities</span><p>{artifact.extensionContract.canonicalIdentities}</p></article>
          <article><span>Relationship semantics</span><p>{artifact.extensionContract.relationshipSemantics}</p></article>
        </div>
      </section>
    </article>
  );
}
