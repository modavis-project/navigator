import {
  Activity,
  ArrowRight,
  CalendarDays,
  ChevronRight,
  CircleAlert,
  ExternalLink,
  Filter,
  GitBranch,
  History,
  Search,
  Wrench,
} from "lucide-react";
import { ChangeEvent, MouseEvent, useEffect, useMemo, useState } from "react";


export const ORGAN_LIFECYCLE_PATH = "/use-cases/documented-organ-lifecycles";
const ORGAN_LIFECYCLE_ARTIFACT = "/data/use-cases/organ-lifecycle-v1.json";

type RankedCount = {
  label: string;
  count: number;
};

type ActivityProfile = {
  activity: string;
  label: string;
  group: string;
  events: number;
  records: number;
  countries: RankedCount[];
  topParties: RankedCount[];
  decades: RankedCount[];
  yearRange: { minimum: number | null; maximum: number | null };
  medianYear: number | null;
  afterOrigin: { observations: number; medianYears: number | null };
};

type CountryProfile = {
  country: string;
  events: number;
  records: number;
  eventShare: number;
  datedEvents: number;
  activities: Array<{
    activity: string;
    label: string;
    count: number;
    rate: number;
  }>;
  yearRange: { minimum: number | null; maximum: number | null };
};

type LifecycleEvent = {
  sourceRecordId: string;
  sourceId: string;
  sourceNativeId: string;
  sourceUrl: string;
  title: string;
  country: string;
  locality: string | null;
  building: string | null;
  eventId: string;
  sourceEventId: string | null;
  activities: string[];
  activityLabels: string[];
  primaryActivity: string;
  primaryActivityLabel: string;
  group: string;
  rawDates: string[];
  years: number[];
  year: number | null;
  parties: string[];
  identifiers: Array<{ type: string; value: string }>;
};

type LifecycleTransition = {
  from: string;
  fromLabel: string;
  to: string;
  toLabel: string;
  count: number;
  medianGapYears: number | null;
};

type LifecycleArtifact = {
  schemaVersion: string;
  artifactId: string;
  contentSha256: string;
  generatedAt: string;
  status: string;
  question: string;
  scope: {
    claimLevel: string;
    eventUnit: string;
    sequenceUnit: string;
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
    events: number;
    recordsWithEvents: number;
    recordsWithMultipleEvents: number;
    datedEvents: number;
    activityTypes: number;
    countries: number;
    withinRecordTransitions: number;
    recordsWithDocumentedOrigin: number;
    yearRange: { minimum: number | null; maximum: number | null };
  };
  quality: {
    structuredEventObjects: number;
    classifiedEvents: number;
    excludedWithoutActivity: number;
  };
  groups: Array<{
    id: string;
    label: string;
    activities: string[];
    events: number;
  }>;
  activities: ActivityProfile[];
  countries: CountryProfile[];
  transitions: LifecycleTransition[];
  events: LifecycleEvent[];
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
    canonicalEvents: string;
    historicalGeography: string;
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

function useLifecycleMetadata() {
  useEffect(() => {
    document.title = "Documented organ lifecycles | MODAVIS Navigator";
    let description = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (!description) {
      description = document.createElement("meta");
      description.name = "description";
      document.head.appendChild(description);
    }
    description.content = "Explore structured organ-building, restoration, alteration, relocation, and maintenance events in the current MODAVIS corpus.";
    let canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.rel = "canonical";
      document.head.appendChild(canonical);
    }
    canonical.href = new URL(ORGAN_LIFECYCLE_PATH, window.location.origin).toString();
  }, []);
}

function activityUrl(activity: string): string {
  const url = new URL(ORGAN_LIFECYCLE_PATH, window.location.origin);
  url.searchParams.set("activity", activity);
  return `${url.pathname}${url.search}`;
}

export function OrganLifecycleUseCase({
  route,
  onNavigate,
}: {
  route: string;
  onNavigate: (path: string) => void;
}) {
  const [artifact, setArtifact] = useState<LifecycleArtifact | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedActivity, setSelectedActivity] = useState("");
  const [countryFilter, setCountryFilter] = useState("all");
  const [recordQuery, setRecordQuery] = useState("");
  const [recordLimit, setRecordLimit] = useState(12);

  useLifecycleMetadata();

  useEffect(() => {
    let cancelled = false;
    fetch(ORGAN_LIFECYCLE_ARTIFACT, { cache: "force-cache" })
      .then(async (response) => {
        if (!response.ok) throw new Error(`The lifecycle artifact returned ${response.status}.`);
        return response.json() as Promise<LifecycleArtifact>;
      })
      .then((value) => {
        if (
          value.schemaVersion !== "modavis.navigator.use-case.organ-lifecycle/v1"
          || !Array.isArray(value.activities)
          || !Array.isArray(value.events)
          || !Array.isArray(value.transitions)
        ) throw new Error("The lifecycle artifact does not match the supported contract.");
        if (!cancelled) {
          setArtifact(value);
          setError(null);
        }
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setError(reason instanceof Error ? reason.message : "The lifecycle artifact could not be loaded.");
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
    const requested = new URLSearchParams(window.location.search).get("activity") || "";
    const match = artifact.activities.find(
      (item) => item.activity.toLocaleLowerCase() === requested.toLocaleLowerCase(),
    );
    const fallback = artifact.activities.find((item) => item.activity === "restoration")
      || artifact.activities[0];
    setSelectedActivity(match?.activity || fallback?.activity || "");
    setCountryFilter("all");
    setRecordQuery("");
    setRecordLimit(12);
  }, [artifact, route]);

  const activity = useMemo(
    () => artifact?.activities.find((item) => item.activity === selectedActivity) || null,
    [artifact, selectedActivity],
  );

  const activityEvents = useMemo(() => {
    if (!artifact || !selectedActivity) return [];
    const query = recordQuery.trim().toLocaleLowerCase();
    return artifact.events.filter((event) => {
      if (!event.activities.includes(selectedActivity)) return false;
      if (countryFilter !== "all" && event.country !== countryFilter) return false;
      if (!query) return true;
      return [
        event.title,
        event.country,
        event.locality || "",
        ...event.parties,
        ...event.rawDates,
      ].join(" ").toLocaleLowerCase().includes(query);
    });
  }, [artifact, countryFilter, recordQuery, selectedActivity]);

  const decades = useMemo(() => {
    const counter = new Map<number, number>();
    for (const event of activityEvents) {
      if (event.year == null) continue;
      const decade = Math.floor(event.year / 10) * 10;
      counter.set(decade, (counter.get(decade) || 0) + 1);
    }
    return [...counter.entries()]
      .sort(([left], [right]) => left - right)
      .map(([decade, count]) => ({ decade, count }));
  }, [activityEvents]);

  const outgoingTransitions = useMemo(
    () => artifact?.transitions
      .filter((item) => item.from === selectedActivity)
      .slice(0, 8) || [],
    [artifact, selectedActivity],
  );

  function chooseActivity(value: string) {
    setSelectedActivity(value);
    setCountryFilter("all");
    setRecordQuery("");
    setRecordLimit(12);
    window.history.replaceState(null, "", activityUrl(value));
    onNavigate(currentRoute());
  }

  if (loading) {
    return (
      <section className="use-case-page use-case-loading" id="use-cases" tabIndex={-1}>
        <div className="use-case-loading-mark"><History size={26} /></div>
        <p className="eyebrow">Building the chronology</p>
        <h1>Loading documented organ lifecycles…</h1>
      </section>
    );
  }

  if (error || !artifact || !activity) {
    return (
      <section className="use-case-page use-case-error" id="use-cases" tabIndex={-1}>
        <CircleAlert size={30} />
        <p className="eyebrow">Data story unavailable</p>
        <h1>The lifecycle artifact could not be opened.</h1>
        <p>{error || "No supported activity profile was found."}</p>
        <a href="/use-cases" onClick={(event) => navigate(event, "/use-cases", onNavigate)}>
          Return to Use Cases
        </a>
      </section>
    );
  }

  const maximumDecade = Math.max(...decades.map((item) => item.count), 1);
  const maximumCountry = Math.max(...activity.countries.map((item) => item.count), 1);
  const maximumTransition = Math.max(...outgoingTransitions.map((item) => item.count), 1);
  const visibleEvents = activityEvents.slice(0, recordLimit);
  const datedRate = artifact.summary.datedEvents / artifact.summary.events;
  const selectedGroup = artifact.groups.find((item) => item.id === activity.group);

  return (
    <article className="use-case-page lifecycle-story" id="use-cases" tabIndex={-1}>
      <nav className="use-case-breadcrumbs" aria-label="Breadcrumb">
        <a href="/use-cases" onClick={(event) => navigate(event, "/use-cases", onNavigate)}>
          Use Cases
        </a>
        <ChevronRight size={14} aria-hidden="true" />
        <span>Documented organ lifecycles</span>
      </nav>

      <header className="lifecycle-hero">
        <div>
          <div className="lifecycle-badges">
            <span>Structured event cohort</span>
            <span>Descriptive chronology</span>
          </div>
          <p className="eyebrow">Restoration and transformation histories</p>
          <h1>How documented organs change over time</h1>
          <p className="lifecycle-lede">
            Follow construction, replacement, restoration, rebuilding, alteration,
            movement, and maintenance as structured events—then inspect the source
            records behind every pattern.
          </p>
        </div>
        <aside className="lifecycle-short-answer">
          <span>Short answer</span>
          <strong>
            {formatNumber(artifact.summary.events)} classified lifecycle events are documented
            across {formatNumber(artifact.summary.recordsWithEvents)} organ records.
          </strong>
          <p>
            Restoration is the most frequent later intervention, but this describes
            the imported evidence—not a complete history of the world’s organs.
          </p>
        </aside>
      </header>

      <section className="lifecycle-basis" aria-label="Data basis">
        <div><span>Source</span><strong>{artifact.scope.sources[0]?.label || "Current corpus"}</strong></div>
        <div><span>Classified events</span><strong>{formatNumber(artifact.summary.events)}</strong></div>
        <div><span>Dated events</span><strong>{formatPercent(datedRate)}</strong></div>
        <div><span>Observed span</span><strong>{artifact.summary.yearRange.minimum}–{artifact.summary.yearRange.maximum}</strong></div>
        <div><span>Snapshot through</span><strong>{formatDate(artifact.provenance.sourceSnapshotThrough)}</strong></div>
      </section>

      <section className="lifecycle-summary" aria-labelledby="lifecycle-summary-title">
        <div className="use-case-section-heading">
          <div>
            <p className="eyebrow">Corpus at a glance</p>
            <h2 id="lifecycle-summary-title">A cohort rich enough to compare pathways</h2>
          </div>
          <p>
            Counts use structured event objects. A single organ record may contribute
            several events and several adjacent-event transitions.
          </p>
        </div>
        <div className="lifecycle-metric-grid">
          <article><History size={20} /><strong>{formatNumber(artifact.summary.recordsWithMultipleEvents)}</strong><span>multi-event records</span></article>
          <article><Wrench size={20} /><strong>{artifact.summary.activityTypes}</strong><span>source activity types</span></article>
          <article><GitBranch size={20} /><strong>{formatNumber(artifact.summary.withinRecordTransitions)}</strong><span>dated transitions</span></article>
          <article><CalendarDays size={20} /><strong>{formatNumber(artifact.summary.recordsWithDocumentedOrigin)}</strong><span>records with an origin event</span></article>
        </div>
        <div className="lifecycle-group-strip" aria-label="Lifecycle activity groups">
          {artifact.groups.map((group) => (
            <div key={group.id} className={`lifecycle-group lifecycle-group-${group.id}`}>
              <span>{group.label}</span>
              <strong>{formatNumber(group.events)}</strong>
            </div>
          ))}
        </div>
      </section>

      <section className="lifecycle-explorer" aria-labelledby="activity-lens-title">
        <div className="use-case-section-heading">
          <div>
            <p className="eyebrow">Interactive activity lens</p>
            <h2 id="activity-lens-title">Select one kind of change</h2>
          </div>
          <p>
            Compare its chronology, geographic representation, participating
            workshops, outgoing sequence patterns, and event-level evidence.
          </p>
        </div>

        <div className="lifecycle-activity-selector" role="list" aria-label="Activity types">
          {artifact.activities.map((item) => (
            <button
              key={item.activity}
              className={item.activity === selectedActivity ? "is-active" : ""}
              onClick={() => chooseActivity(item.activity)}
              aria-pressed={item.activity === selectedActivity}
              type="button"
            >
              <span>{item.label}</span>
              <strong>{formatNumber(item.events)}</strong>
            </button>
          ))}
        </div>

        <div className="lifecycle-focus">
          <div className={`lifecycle-focus-card lifecycle-focus-${activity.group}`}>
            <span className="lifecycle-focus-kicker">{selectedGroup?.label}</span>
            <h3>{activity.label}</h3>
            <p>
              Documented in <strong>{formatNumber(activity.events)} events</strong> across{" "}
              <strong>{formatNumber(activity.records)} source records</strong>.
            </p>
            <dl>
              <div><dt>Observed years</dt><dd>{activity.yearRange.minimum ?? "—"}–{activity.yearRange.maximum ?? "—"}</dd></div>
              <div><dt>Median event year</dt><dd>{activity.medianYear ?? "—"}</dd></div>
              <div>
                <dt>Median after first documented origin</dt>
                <dd>{activity.afterOrigin.medianYears != null ? `${activity.afterOrigin.medianYears} years` : "Insufficient data"}</dd>
              </div>
              <div><dt>Latency observations</dt><dd>{formatNumber(activity.afterOrigin.observations)}</dd></div>
            </dl>
            <p className="lifecycle-focus-note">
              “After origin” is calculated only where the same source record has a
              dated construction or replacement event. It is descriptive, not an
              expected service interval.
            </p>
          </div>

          <div className="lifecycle-chart-card">
            <div className="lifecycle-panel-head">
              <div><span>Chronology</span><h3>Events by decade</h3></div>
              <label>
                <span>Country</span>
                <select
                  value={countryFilter}
                  onChange={(event: ChangeEvent<HTMLSelectElement>) => {
                    setCountryFilter(event.target.value);
                    setRecordLimit(12);
                  }}
                >
                  <option value="all">All represented countries</option>
                  {activity.countries.map((item) => (
                    <option key={item.label} value={item.label}>{item.label}</option>
                  ))}
                </select>
              </label>
            </div>
            {decades.length ? (
              <div className="lifecycle-timeline-scroll">
                <div
                  className="lifecycle-timeline"
                  style={{ gridTemplateColumns: `repeat(${decades.length}, minmax(24px, 1fr))` }}
                  role="img"
                  aria-label={`${activity.label} events by decade`}
                >
                  {decades.map((item) => (
                    <div key={item.decade} className="lifecycle-decade">
                      <span>{item.count}</span>
                      <i style={{ height: `${Math.max(8, (item.count / maximumDecade) * 100)}%` }} />
                      <em>{item.decade % 50 === 0 || decades.length < 16 ? item.decade : ""}</em>
                    </div>
                  ))}
                </div>
              </div>
            ) : <p className="lifecycle-empty">No dated events match this lens.</p>}
            <details className="lifecycle-chart-table">
              <summary>Open accessible decade table</summary>
              <table>
                <thead><tr><th>Decade</th><th>Events</th></tr></thead>
                <tbody>
                  {decades.map((item) => <tr key={item.decade}><td>{item.decade}s</td><td>{item.count}</td></tr>)}
                </tbody>
              </table>
            </details>
          </div>
        </div>

        <div className="lifecycle-secondary-grid">
          <article className="lifecycle-country-card">
            <div className="lifecycle-panel-head">
              <div><span>Current record geography</span><h3>Where the evidence is represented</h3></div>
            </div>
            <div className="lifecycle-bar-list">
              {activity.countries.map((item) => (
                <div key={item.label}>
                  <span>{item.label}</span>
                  <i><b style={{ width: `${(item.count / maximumCountry) * 100}%` }} /></i>
                  <strong>{item.count}</strong>
                </div>
              ))}
            </div>
            <p>
              These are latest record locations, not verified historical event places.
            </p>
          </article>

          <article className="lifecycle-parties-card">
            <div className="lifecycle-panel-head">
              <div><span>Named participants</span><h3>Frequently documented workshops or builders</h3></div>
            </div>
            <ol>
              {activity.topParties.slice(0, 7).map((item) => (
                <li key={item.label}><span>{item.label}</span><strong>{item.count}</strong></li>
              ))}
            </ol>
            <p>Names are source labels and may not yet resolve to canonical person or organization identities.</p>
          </article>
        </div>
      </section>

      <section className="lifecycle-pathways" aria-labelledby="pathways-title">
        <div className="use-case-section-heading">
          <div>
            <p className="eyebrow">Within-record sequences</p>
            <h2 id="pathways-title">What is documented next?</h2>
          </div>
          <p>
            Adjacent dated events reveal recurring documentation pathways without
            asserting that missing intermediate work did not occur.
          </p>
        </div>
        {outgoingTransitions.length ? (
          <div className="lifecycle-transition-list">
            {outgoingTransitions.map((item) => (
              <article key={`${item.from}:${item.to}`}>
                <div className="lifecycle-transition-labels">
                  <span>{item.fromLabel}</span>
                  <ArrowRight size={17} />
                  <strong>{item.toLabel}</strong>
                </div>
                <div className="lifecycle-transition-bar">
                  <i style={{ width: `${(item.count / maximumTransition) * 100}%` }} />
                </div>
                <div className="lifecycle-transition-stats">
                  <strong>{item.count} sequences</strong>
                  <span>{item.medianGapYears != null ? `median ${item.medianGapYears} years` : "gap unavailable"}</span>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="lifecycle-empty">
            No outgoing adjacent-event pattern is available for this activity.
          </div>
        )}
      </section>

      <section className="lifecycle-comparison" aria-labelledby="activity-comparison-title">
        <div className="use-case-section-heading">
          <div>
            <p className="eyebrow">Comparable descriptive measures</p>
            <h2 id="activity-comparison-title">All source activity types</h2>
          </div>
          <p>Use event counts alongside record counts and latency sample sizes.</p>
        </div>
        <div className="lifecycle-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Activity</th>
                <th>Events</th>
                <th>Records</th>
                <th>Observed years</th>
                <th>Median year</th>
                <th>Median after origin</th>
                <th>n</th>
              </tr>
            </thead>
            <tbody>
              {artifact.activities.map((item) => (
                <tr key={item.activity} className={item.activity === selectedActivity ? "is-selected" : ""}>
                  <th>
                    <button type="button" onClick={() => chooseActivity(item.activity)}>
                      {item.label}
                    </button>
                  </th>
                  <td>{item.events}</td>
                  <td>{item.records}</td>
                  <td>{item.yearRange.minimum ?? "—"}–{item.yearRange.maximum ?? "—"}</td>
                  <td>{item.medianYear ?? "—"}</td>
                  <td>{item.afterOrigin.medianYears != null ? `${item.afterOrigin.medianYears} y` : "—"}</td>
                  <td>{item.afterOrigin.observations}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="lifecycle-evidence" aria-labelledby="lifecycle-evidence-title">
        <div className="use-case-section-heading">
          <div>
            <p className="eyebrow">Explore the evidence</p>
            <h2 id="lifecycle-evidence-title">Events behind “{activity.label}”</h2>
          </div>
          <p>{formatNumber(activityEvents.length)} matching structured events.</p>
        </div>
        <div className="lifecycle-record-controls">
          <label className="lifecycle-search">
            <Search size={17} />
            <span className="sr-only">Search event evidence</span>
            <input
              type="search"
              value={recordQuery}
              onChange={(event) => {
                setRecordQuery(event.target.value);
                setRecordLimit(12);
              }}
              placeholder="Search venue, locality, participant, or date"
            />
          </label>
          <label className="lifecycle-country-filter">
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
              {activity.countries.map((item) => (
                <option key={item.label} value={item.label}>{item.label}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="lifecycle-record-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Organ record</th>
                <th>Current location</th>
                <th>Named participant</th>
                <th>Source</th>
              </tr>
            </thead>
            <tbody>
              {visibleEvents.map((event) => (
                <tr key={`${event.eventId}:${event.primaryActivity}`}>
                  <td><strong>{event.rawDates.join(", ") || event.year || "Undated"}</strong></td>
                  <td>
                    <strong><a href={`/source/${encodeURIComponent(event.sourceRecordId)}`}>{event.title}</a></strong>
                    <span><a href={`/source/${encodeURIComponent(event.sourceRecordId)}`}>{event.sourceEventId || event.eventId}</a></span>
                  </td>
                  <td>{[event.locality, event.country].filter(Boolean).join(", ")}</td>
                  <td>{event.parties.slice(0, 2).join(", ") || "Not named"}</td>
                  <td>
                    <a href={`/events?type=${encodeURIComponent(`activitype:${event.primaryActivity}`)}`}>Related events</a>
                    <a href={`/source/${encodeURIComponent(event.sourceRecordId)}`}>MODAVIS evidence</a>
                    {event.sourceUrl ? (
                      <a href={event.sourceUrl} target="_blank" rel="noreferrer">
                        orgbase <ExternalLink size={13} />
                      </a>
                    ) : <span>Source record {event.sourceNativeId}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!visibleEvents.length && <p className="lifecycle-empty">No evidence matches the current filters.</p>}
        </div>
        {activityEvents.length > recordLimit && (
          <button
            className="lifecycle-show-more"
            type="button"
            onClick={() => setRecordLimit((value) => value + 20)}
          >
            Show more evidence
          </button>
        )}
      </section>

      <section className="lifecycle-interpretation" aria-labelledby="lifecycle-meaning-title">
        <div>
          <p className="eyebrow">What the result means</p>
          <h2 id="lifecycle-meaning-title">The corpus exposes instruments as changing historical objects</h2>
        </div>
        <div>
          <p>
            A catalogue record is not only a specification of an organ at one moment.
            In this cohort, {formatNumber(artifact.summary.recordsWithMultipleEvents)} records
            preserve more than one structured activity, making replacement, alteration,
            restoration, and movement inspectable as sequences.
          </p>
          <p>
            The strongest claim is therefore about <em>documented transformations in
            the present corpus</em>. Comparative historical claims require broader
            coverage, canonical identities, event-place evidence, and source-bias analysis.
          </p>
        </div>
      </section>

      <section className="lifecycle-method" aria-labelledby="lifecycle-method-title">
        <div className="use-case-section-heading">
          <div>
            <p className="eyebrow">Methods and evidence</p>
            <h2 id="lifecycle-method-title">How this story was produced</h2>
          </div>
          <p>
            All claim-defining computation is precomputed in a content-hashed
            artifact; {artifact.quality.excludedWithoutActivity} event object without
            an activity label is reported and excluded.
          </p>
        </div>
        <ol className="lifecycle-method-flow">
          <li><span>1</span><div><strong>Select</strong><p>Read configured organ source records in a repeatable, read-only database transaction.</p></div></li>
          <li><span>2</span><div><strong>Classify</strong><p>Retain event objects carrying a configured source activity label and map them into disclosed analytical groups.</p></div></li>
          <li><span>3</span><div><strong>Order</strong><p>Extract structured four-digit years and order events only within their source record.</p></div></li>
          <li><span>4</span><div><strong>Aggregate</strong><p>Compute activity, decade, country, participant, latency, and adjacent-transition summaries.</p></div></li>
          <li><span>5</span><div><strong>Link</strong><p>Carry source record and event identifiers into every evidence row.</p></div></li>
        </ol>
        <div className="lifecycle-fixity">
          <div><span>Artifact</span><code>{artifact.artifactId}</code></div>
          <div><span>Analysis</span><code>{artifact.provenance.analysisVersion}</code></div>
          <div><span>Input corpus SHA-256</span><code>{artifact.provenance.sourceCorpusSha256}</code></div>
          <div><span>Configuration SHA-256</span><code>{artifact.provenance.configSha256}</code></div>
        </div>
      </section>

      <section className="lifecycle-limits" aria-labelledby="lifecycle-limits-title">
        <div>
          <CircleAlert size={24} />
          <p className="eyebrow">Coverage and limitations</p>
          <h2 id="lifecycle-limits-title">Read these findings at corpus scale</h2>
        </div>
        <ul>
          {artifact.limitations.map((limitation) => <li key={limitation}>{limitation}</li>)}
        </ul>
      </section>

      <section className="lifecycle-future" aria-labelledby="lifecycle-future-title">
        <div>
          <p className="eyebrow">Designed for the next release</p>
          <h2 id="lifecycle-future-title">More records can extend the story without changing its claim contract</h2>
        </div>
        <div className="lifecycle-future-grid">
          <article><span>Complete orgbase</span><p>{artifact.extensionContract.newOrgbaseData}</p></article>
          <article><span>Additional providers</span><p>{artifact.extensionContract.additionalSources}</p></article>
          <article><span>Canonical event vocabulary</span><p>{artifact.extensionContract.canonicalEvents}</p></article>
          <article><span>Historical geography</span><p>{artifact.extensionContract.historicalGeography}</p></article>
        </div>
      </section>
    </article>
  );
}
