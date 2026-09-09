import { FormEvent, ReactNode, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleDot,
  Database,
  ExternalLink,
  Filter,
  Layers3,
  Link2,
  Map as MapIcon,
  MapPin,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";
import "./release02Candidates.css";

type CandidateAction = "all" | "linked" | "distinct";
type DuplicateFilter = "all" | "with" | "without";
type CandidateView = "catalog" | "map";

type CandidateLocation = {
  address?: string | null;
  building?: string | null;
  town?: string | null;
  region?: string | null;
  country?: string | null;
};

type CandidateMapSummary = {
  eligible: boolean;
  coordinates?: { lat: number; lon: number } | null;
  coordinateFallback: boolean;
  coordinatePrecision?: string | null;
  semantics: string;
};

type CandidateSummary = {
  orgelseiteId: string;
  sourceRecordId: string;
  label: string;
  state: "linked-additive-evidence" | "distinct-provisional-candidate";
  stateLabel: string;
  location: CandidateLocation;
  builders: string[];
  eventYears: number[];
  manualCount?: number | null;
  stopCount?: number | null;
  source: { name: string; url?: string | null };
  identity: {
    action: string;
    classification: string;
    method: string;
    selectedTargetMdvsId?: string | null;
    candidateKey?: string | null;
  };
  evidence: {
    sourceAssertionCount: number;
    atomicAssertionGroupCount: number;
    possibleDuplicateCount: number;
  };
  map: CandidateMapSummary;
  canonicalProjectionAllowed: false;
  navigator: {
    evidencePath: string;
    selectedTargetPath?: string | null;
  };
};

type CandidateDetail = CandidateSummary & {
  sourceAssertions: Array<{
    path: string;
    field: string;
    value: unknown;
    certainty: string;
  }>;
  identityCandidates: Array<{
    rank: number;
    mdvsId: string;
    orgbaseId: string;
    label: string;
    features: Record<string, number>;
    navigatorPath?: string | null;
  }>;
  possibleDuplicates: Array<{
    mdvsId: string;
    orgbaseId: string;
    label: string;
    rank: number;
    score: number;
    status: string;
    relationProjectionAllowed: false;
    navigatorPath?: string | null;
  }>;
  assertionGroups: Array<{
    groupId: string;
    targetMdvsId: string;
    path: string;
    field: string;
    status: string;
    sourceCount: number;
    assertions: Array<{
      source: string;
      sourceRecordId: string;
      sourcePath: string;
      value: unknown;
      certainty: string;
    }>;
  }>;
  provenance: {
    sourceContentSha256: string;
    terminalDecisionSha256: string;
    checkpointSha256: string;
    inputIdentitySha256: string;
  };
};

type CandidateList = {
  status: string;
  items: CandidateSummary[];
  pagination: {
    limit: number;
    offset: number;
    total: number;
    nextOffset?: number | null;
  };
};

type CandidateStatus = {
  status: string;
  visibility: string;
  statistics: {
    sourceRecords: number;
    linkedRecords: number;
    distinctCandidateEntities: number;
    sourceAssertions: number;
    atomicAssertionGroups: number;
    possibleDuplicateEdges: number;
    unresolvedRecords: number;
  };
  checkpoint: {
    checkpointSha256: string;
    contentSha256: string;
  };
  authority: {
    canonicalProjectionAllowed: false;
    publicationAllowed: false;
    release01MutationAllowed: false;
  };
};

type ReleaseDiff = {
  fromRelease: { release: string; canonicalOrgans: number };
  toCandidate: { release: string; candidateOrgans: number; published: false };
  changes: {
    existingOrgansWithAdditiveEvidence: number;
    provisionalDistinctOrgans: number;
    sourceAssertionsAddedToCandidatePlane: number;
    atomicAssertionGroups: number;
    possibleDuplicateIndicators: number;
    unresolvedSourceRecords: number;
    canonicalCreates: number;
    canonicalLinks: number;
    relationWrites: number;
    publicationWrites: number;
  };
};

const PAGE_SIZE = 25;

export function Release02CandidateCatalog({
  initialCandidateId,
}: {
  initialCandidateId?: string;
}) {
  const route = useMemo(() => candidateRouteState(initialCandidateId), [initialCandidateId]);
  const [queryDraft, setQueryDraft] = useState(route.query);
  const [query, setQuery] = useState(route.query);
  const [action, setAction] = useState<CandidateAction>(route.action);
  const [duplicateFilter, setDuplicateFilter] = useState<DuplicateFilter>(route.duplicates);
  const [view, setView] = useState<CandidateView>(route.view);
  const [offset, setOffset] = useState(route.offset);
  const [selectedId, setSelectedId] = useState(route.candidateId);
  const [status, setStatus] = useState<CandidateStatus | null>(null);
  const [releaseDiff, setReleaseDiff] = useState<ReleaseDiff | null>(null);
  const [listing, setListing] = useState<CandidateList | null>(null);
  const [detail, setDetail] = useState<CandidateDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const previousTitle = document.title;
    document.title = "Release 0.2 candidate evidence | MODAVIS Navigator";
    const existingRobots = document.querySelector<HTMLMetaElement>('meta[name="robots"]');
    const robots = existingRobots ?? document.createElement("meta");
    const previousRobots = existingRobots?.content;
    if (!existingRobots) {
      robots.name = "robots";
      document.head.appendChild(robots);
    }
    robots.content = "noindex,nofollow";
    return () => {
      document.title = previousTitle;
      if (!existingRobots) robots.remove();
      else robots.content = previousRobots ?? "";
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetchCandidateJson<CandidateStatus>(
        "/api/research/release-0.2/orgelseite/status",
      ),
      fetchCandidateJson<ReleaseDiff>("/api/research/release-0.2/diff"),
    ])
      .then(([nextStatus, nextDiff]) => {
        if (cancelled) return;
        setStatus(nextStatus);
        setReleaseDiff(nextDiff);
      })
      .catch((reason: Error) => {
        if (!cancelled) setError(reason.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const timer = window.setTimeout(() => {
      const params = candidateApiParams(query, action, duplicateFilter, offset);
      fetchCandidateJson<CandidateList>(
        `/api/research/release-0.2/orgelseite/candidates?${params}`,
      )
        .then((nextListing) => {
          if (cancelled) return;
          setListing(nextListing);
          setError("");
        })
        .catch((reason: Error) => {
          if (!cancelled) setError(reason.message);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 120);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [action, duplicateFilter, offset, query]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    fetchCandidateJson<{ candidate: CandidateDetail }>(
      `/api/research/release-0.2/orgelseite/candidates/${encodeURIComponent(selectedId)}`,
    )
      .then((payload) => {
        if (!cancelled) setDetail(payload.candidate);
      })
      .catch((reason: Error) => {
        if (!cancelled) setError(reason.message);
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  useEffect(() => {
    const sync = () => {
      const next = candidateRouteState();
      setQuery(next.query);
      setQueryDraft(next.query);
      setAction(next.action);
      setDuplicateFilter(next.duplicates);
      setView(next.view);
      setOffset(next.offset);
      setSelectedId(next.candidateId);
    };
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);

  const updateRoute = (next: {
    query?: string;
    action?: CandidateAction;
    duplicates?: DuplicateFilter;
    view?: CandidateView;
    offset?: number;
    candidateId?: string;
  }) => {
    const nextState = {
      query: next.query ?? query,
      action: next.action ?? action,
      duplicates: next.duplicates ?? duplicateFilter,
      view: next.view ?? view,
      offset: next.offset ?? offset,
      candidateId: next.candidateId ?? selectedId,
    };
    const url = candidateBrowserUrl(nextState);
    window.history.pushState(null, "", url);
    setQuery(nextState.query);
    setQueryDraft(nextState.query);
    setAction(nextState.action);
    setDuplicateFilter(nextState.duplicates);
    setView(nextState.view);
    setOffset(nextState.offset);
    setSelectedId(nextState.candidateId);
  };

  const submitSearch = (event: FormEvent) => {
    event.preventDefault();
    updateRoute({ query: queryDraft.trim(), offset: 0, candidateId: "" });
  };

  const clearFilters = () => {
    setQueryDraft("");
    updateRoute({
      query: "",
      action: "all",
      duplicates: "all",
      offset: 0,
      candidateId: "",
    });
  };

  const activeFilterCount = [
    query,
    action !== "all" ? action : "",
    duplicateFilter !== "all" ? duplicateFilter : "",
  ].filter(Boolean).length;
  const total = listing?.pagination.total ?? 0;
  const mapUrl = candidateMapUrl(query, action, duplicateFilter);

  return (
    <article className="release02-candidate-page">
      <header className="release02-candidate-hero">
        <div>
          <p className="eyebrow">Release 0.2 research preview</p>
          <h2>Orgelseite candidate evidence</h2>
          <p>
            Search checkpoint-bound source evidence before it enters any canonical
            release. Linked records preserve additive assertions; distinct records
            remain provisional identities.
          </p>
        </div>
        <div className="release02-candidate-boundary" role="note">
          <ShieldCheck size={22} aria-hidden="true" />
          <div>
            <strong>Read-only and unpublished</strong>
            <span>No canonical entities, relations, coordinates, or publication records are written here.</span>
          </div>
        </div>
      </header>

      {error && <div className="release02-candidate-error" role="alert"><AlertTriangle size={18} /> {error}</div>}

      <section className="release02-candidate-metrics" aria-label="Candidate release summary">
        <CandidateMetric icon={<Database size={18} />} label="Source records" value={status?.statistics.sourceRecords} />
        <CandidateMetric icon={<Link2 size={18} />} label="Linked evidence" value={status?.statistics.linkedRecords} />
        <CandidateMetric icon={<CircleDot size={18} />} label="Provisional identities" value={status?.statistics.distinctCandidateEntities} />
        <CandidateMetric icon={<Layers3 size={18} />} label="Atomic assertion groups" value={status?.statistics.atomicAssertionGroups} />
        <CandidateMetric icon={<AlertTriangle size={18} />} label="Possible-duplicate indicators" value={status?.statistics.possibleDuplicateEdges} />
        <CandidateMetric icon={<CheckCircle2 size={18} />} label="Unresolved records" value={status?.statistics.unresolvedRecords} />
      </section>

      <details className="release02-candidate-diff">
        <summary>Release 0.1 → candidate 0.2 boundary</summary>
        <div>
          <span><strong>{formatInteger(releaseDiff?.fromRelease.canonicalOrgans)}</strong> unchanged Release 0.1 organs</span>
          <span><strong>{formatInteger(releaseDiff?.toCandidate.candidateOrgans)}</strong> candidate-plane total</span>
          <span><strong>{formatInteger(releaseDiff?.changes.sourceAssertionsAddedToCandidatePlane)}</strong> source assertions</span>
          <span><strong>0</strong> canonical or publication writes</span>
        </div>
      </details>

      <form className="release02-candidate-controls" onSubmit={submitSearch} role="search">
        <label className="release02-candidate-search">
          <Search size={19} aria-hidden="true" />
          <span className="sr-only">Search candidate evidence</span>
          <input
            aria-label="Search candidate evidence"
            value={queryDraft}
            maxLength={160}
            onChange={(event) => setQueryDraft(event.target.value)}
            placeholder="Search venue, town, country, builder, or identifier"
          />
          {queryDraft && <button type="button" aria-label="Clear search" onClick={() => setQueryDraft("")}><X size={16} /></button>}
        </label>
        <button type="submit" className="release02-primary-action">Search</button>
        <label>
          <span>Evidence state</span>
          <select value={action} onChange={(event) => updateRoute({ action: event.target.value as CandidateAction, offset: 0, candidateId: "" })}>
            <option value="all">All records</option>
            <option value="linked">Linked additive evidence</option>
            <option value="distinct">Distinct provisional identities</option>
          </select>
        </label>
        <label>
          <span>Duplicate indicator</span>
          <select value={duplicateFilter} onChange={(event) => updateRoute({ duplicates: event.target.value as DuplicateFilter, offset: 0, candidateId: "" })}>
            <option value="all">Any state</option>
            <option value="with">Has possible duplicates</option>
            <option value="without">No possible duplicates</option>
          </select>
        </label>
        {activeFilterCount > 0 && <button type="button" className="release02-clear-action" onClick={clearFilters}><Filter size={15} /> Clear {activeFilterCount}</button>}
      </form>

      <nav className="release02-candidate-view-switch" aria-label="Candidate presentation">
        <button type="button" aria-pressed={view === "catalog"} onClick={() => updateRoute({ view: "catalog" })}><Layers3 size={17} /> Catalog</button>
        <button type="button" aria-pressed={view === "map"} onClick={() => updateRoute({ view: "map", candidateId: "" })}><MapIcon size={17} /> Map</button>
        <span aria-live="polite">{loading ? "Loading…" : `${formatInteger(total)} matching record${total === 1 ? "" : "s"}`}</span>
      </nav>

      {view === "map" ? (
        <section className="release02-candidate-map">
          <div className="release02-candidate-map-note">
            <MapPin size={20} aria-hidden="true" />
            <div>
              <strong>Existing Release 0.1 coordinates only</strong>
              <p>Only linked evidence is shown. Exact venue coordinates and locality fallbacks remain separate; provisional distinct candidates are not plotted.</p>
            </div>
          </div>
          <iframe title="Orgelseite candidate evidence map" src={mapUrl} />
        </section>
      ) : (
        <div className={`release02-candidate-workspace ${selectedId ? "has-detail" : ""}`}>
          <section className="release02-candidate-results" aria-busy={loading} aria-label="Candidate evidence results">
            {listing?.items.map((candidate) => (
              <CandidateCard
                candidate={candidate}
                key={candidate.orgelseiteId}
                selected={selectedId === candidate.orgelseiteId}
                onOpen={() => updateRoute({ candidateId: candidate.orgelseiteId })}
              />
            ))}
            {!loading && listing?.items.length === 0 && (
              <div className="release02-candidate-empty">
                <Search size={22} />
                <strong>No candidate evidence matches these filters.</strong>
                <button type="button" onClick={clearFilters}>Clear filters</button>
              </div>
            )}
            <CandidatePagination
              loading={loading}
              limit={listing?.pagination.limit ?? PAGE_SIZE}
              offset={listing?.pagination.offset ?? offset}
              total={total}
              onChange={(nextOffset) => updateRoute({ offset: nextOffset, candidateId: "" })}
            />
          </section>
          {selectedId && (
            <CandidateDetailPanel
              candidate={detail}
              loading={detailLoading}
              onClose={() => updateRoute({ candidateId: "" })}
            />
          )}
        </div>
      )}
      <footer className="release02-candidate-footer">
        <span>Checkpoint <code>{shortHash(status?.checkpoint.checkpointSha256)}</code></span>
        <span>Candidate DB <code>{shortHash(status?.checkpoint.contentSha256)}</code></span>
        <a href="/api/research/release-0.2/diff" target="_blank" rel="noreferrer">Inspect machine-readable diff <ExternalLink size={14} /></a>
      </footer>
    </article>
  );
}

function CandidateMetric({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value?: number;
}) {
  return <div>{icon}<span>{label}</span><strong>{formatInteger(value)}</strong></div>;
}

function CandidateCard({
  candidate,
  onOpen,
  selected,
}: {
  candidate: CandidateSummary;
  onOpen: () => void;
  selected: boolean;
}) {
  const location = locationLabel(candidate.location);
  return (
    <article className={`release02-candidate-card ${selected ? "selected" : ""}`}>
      <button type="button" onClick={onOpen} aria-pressed={selected}>
        <span className={`release02-state is-${candidate.state}`}>
          {candidate.state === "linked-additive-evidence" ? <Link2 size={14} /> : <CircleDot size={14} />}
          {candidate.stateLabel}
        </span>
        <strong>{candidate.label}</strong>
        <span className="release02-location">{location || "No source location label"}</span>
        <span className="release02-candidate-card-meta">
          <i>{candidate.builders.slice(0, 2).join(", ") || "Builder not stated"}</i>
          <i>{candidate.eventYears.slice(0, 3).join(", ") || "Date not stated"}</i>
        </span>
        <span className="release02-evidence-counts">
          <i>{candidate.evidence.sourceAssertionCount} assertions</i>
          {candidate.evidence.possibleDuplicateCount > 0 && <i className="warning">{candidate.evidence.possibleDuplicateCount} possible duplicate{candidate.evidence.possibleDuplicateCount === 1 ? "" : "s"}</i>}
          {candidate.map.eligible && <i>{candidate.map.coordinateFallback ? "Locality fallback" : "Existing exact venue"}</i>}
        </span>
        <small>Orgelseite {candidate.orgelseiteId} <ChevronRight size={14} /></small>
      </button>
    </article>
  );
}

function CandidateDetailPanel({
  candidate,
  loading,
  onClose,
}: {
  candidate: CandidateDetail | null;
  loading: boolean;
  onClose: () => void;
}) {
  return (
    <aside className="release02-candidate-detail" aria-label="Candidate evidence detail">
      <header>
        <div>
          <p className="eyebrow">Candidate evidence</p>
          <h3>{candidate?.label ?? "Loading candidate…"}</h3>
        </div>
        <button type="button" aria-label="Close candidate detail" onClick={onClose}><X size={18} /></button>
      </header>
      {loading && !candidate && <p className="release02-muted">Loading checkpoint-bound evidence…</p>}
      {candidate && (
        <>
          <div className={`release02-detail-state is-${candidate.state}`}>
            <strong>{candidate.stateLabel}</strong>
            <span>{candidate.state === "linked-additive-evidence"
              ? "This source record is associated with an existing Release 0.1 organ; its assertions remain independently attributed."
              : "This source identity remains provisional and has not created a canonical organ."}</span>
          </div>
          <dl className="release02-detail-facts">
            <div><dt>Source record</dt><dd><code>{candidate.sourceRecordId}</code></dd></div>
            <div><dt>Location text</dt><dd>{locationLabel(candidate.location) || "Not stated"}</dd></div>
            <div><dt>Builders</dt><dd>{candidate.builders.join(", ") || "Not stated"}</dd></div>
            <div><dt>Event years</dt><dd>{candidate.eventYears.join(", ") || "Not stated"}</dd></div>
            <div><dt>Identity method</dt><dd>{friendly(candidate.identity.method)}</dd></div>
            {candidate.identity.selectedTargetMdvsId && <div><dt>Selected target</dt><dd><code>{candidate.identity.selectedTargetMdvsId}</code></dd></div>}
          </dl>
          <div className="release02-detail-actions">
            {candidate.navigator.selectedTargetPath && <a href={candidate.navigator.selectedTargetPath}>Open accepted Release 0.1 organ <ArrowUpRight size={15} /></a>}
            {candidate.source.url && <a href={candidate.source.url} target="_blank" rel="noreferrer">Open Orgelseite source <ExternalLink size={15} /></a>}
          </div>
          <section className="release02-coordinate-boundary">
            <MapPin size={18} />
            <div>
              <strong>{candidate.map.eligible
                ? candidate.map.coordinateFallback
                  ? "Existing locality fallback"
                  : "Existing exact venue"
                : "Candidate not mapped"}</strong>
              <p>{candidate.map.eligible
                ? `Map position reuses the accepted Release 0.1 ${candidate.map.coordinateFallback ? "locality fallback" : "venue coordinate"}; no candidate geometry is created.`
                : "A provisional candidate is not assigned coordinates before an authorized projection."}</p>
              {candidate.map.coordinates && <code>{candidate.map.coordinates.lat}, {candidate.map.coordinates.lon}</code>}
            </div>
          </section>
          {candidate.assertionGroups.length > 0 && (
            <details className="release02-detail-section" open>
              <summary>Atomic source comparison ({candidate.assertionGroups.length})</summary>
              <div className="release02-assertion-groups">
                {candidate.assertionGroups.map((group) => (
                  <article key={group.groupId}>
                    <header><strong>{group.field}</strong><span className={`is-${group.status}`}>{friendly(group.status)}</span></header>
                    {group.assertions.map((assertion, index) => (
                      <div key={`${group.groupId}:${assertion.source}:${index}`}>
                        <span>{friendly(assertion.source)}</span>
                        <code>{formatValue(assertion.value)}</code>
                      </div>
                    ))}
                  </article>
                ))}
              </div>
            </details>
          )}
          {candidate.possibleDuplicates.length > 0 && (
            <details className="release02-detail-section" open>
              <summary>Possible duplicates — indicators only ({candidate.possibleDuplicates.length})</summary>
              <div className="release02-duplicate-list">
                {candidate.possibleDuplicates.map((duplicate) => (
                  <article key={duplicate.mdvsId}>
                    <div><strong>{duplicate.label}</strong><code>{duplicate.mdvsId}</code></div>
                    <span>{Math.round(duplicate.score * 100)}% indicator</span>
                    {duplicate.navigatorPath && <a href={duplicate.navigatorPath}>Inspect organ</a>}
                  </article>
                ))}
              </div>
              <p className="release02-boundary-copy">These indicators do not create relations and do not merge identities.</p>
            </details>
          )}
          <details className="release02-detail-section">
            <summary>Source assertions ({candidate.sourceAssertions.length})</summary>
            <div className="release02-source-assertions">
              {candidate.sourceAssertions.map((assertion) => (
                <div key={assertion.path}><span>{assertion.field}</span><code>{formatValue(assertion.value)}</code></div>
              ))}
            </div>
          </details>
          <details className="release02-detail-section release02-provenance">
            <summary>Fixity and provenance</summary>
            <dl>
              <div><dt>Source content</dt><dd><code>{candidate.provenance.sourceContentSha256}</code></dd></div>
              <div><dt>Terminal decision</dt><dd><code>{candidate.provenance.terminalDecisionSha256}</code></dd></div>
              <div><dt>Checkpoint</dt><dd><code>{candidate.provenance.checkpointSha256}</code></dd></div>
            </dl>
          </details>
        </>
      )}
    </aside>
  );
}

function CandidatePagination({
  limit,
  loading,
  offset,
  onChange,
  total,
}: {
  limit: number;
  loading: boolean;
  offset: number;
  onChange: (offset: number) => void;
  total: number;
}) {
  if (total <= limit) return null;
  return (
    <nav className="release02-pagination" aria-label="Candidate result pages">
      <button type="button" disabled={loading || offset === 0} onClick={() => onChange(Math.max(0, offset - limit))}><ChevronLeft size={16} /> Previous</button>
      <span>{formatInteger(offset + 1)}–{formatInteger(Math.min(offset + limit, total))} of {formatInteger(total)}</span>
      <button type="button" disabled={loading || offset + limit >= total} onClick={() => onChange(offset + limit)}>Next <ChevronRight size={16} /></button>
    </nav>
  );
}

function candidateRouteState(initialCandidateId?: string) {
  const params = new URLSearchParams(window.location.search);
  const pathMatch = window.location.pathname.match(
    /^\/research\/release-0\.2\/orgelseite\/([^/]+)\/?$/,
  );
  const rawAction = params.get("action");
  const rawDuplicates = params.get("duplicates");
  const rawView = params.get("view");
  return {
    query: params.get("q") || "",
    action: (rawAction === "linked" || rawAction === "distinct" ? rawAction : "all") as CandidateAction,
    duplicates: (rawDuplicates === "with" || rawDuplicates === "without" ? rawDuplicates : "all") as DuplicateFilter,
    view: (rawView === "map" ? "map" : "catalog") as CandidateView,
    offset: boundedInteger(params.get("offset"), 0, 100_000),
    candidateId: initialCandidateId || safeDecode(pathMatch?.[1] || ""),
  };
}

function candidateBrowserUrl(state: {
  query: string;
  action: CandidateAction;
  duplicates: DuplicateFilter;
  view: CandidateView;
  offset: number;
  candidateId?: string;
}) {
  const path = state.candidateId
    ? `/research/release-0.2/orgelseite/${encodeURIComponent(state.candidateId)}`
    : "/research/release-0.2/orgelseite";
  const params = new URLSearchParams();
  if (state.query) params.set("q", state.query);
  if (state.action !== "all") params.set("action", state.action);
  if (state.duplicates !== "all") params.set("duplicates", state.duplicates);
  if (state.view !== "catalog") params.set("view", state.view);
  if (state.offset > 0) params.set("offset", String(state.offset));
  const query = params.toString();
  return `${path}${query ? `?${query}` : ""}`;
}

function candidateApiParams(
  query: string,
  action: CandidateAction,
  duplicates: DuplicateFilter,
  offset: number,
) {
  const params = new URLSearchParams({
    limit: String(PAGE_SIZE),
    offset: String(offset),
  });
  if (query) params.set("q", query);
  if (action !== "all") params.set("action", action);
  if (duplicates === "with") params.set("possible_duplicates", "true");
  if (duplicates === "without") params.set("possible_duplicates", "false");
  return params.toString();
}

function candidateMapUrl(
  query: string,
  action: CandidateAction,
  duplicates: DuplicateFilter,
) {
  const project = new URL(
    "/api/research/release-0.2/orgelseite/project.geolibre.json",
    window.location.origin,
  );
  if (query) project.searchParams.set("q", query);
  if (action !== "all") project.searchParams.set("action", action);
  if (duplicates === "with") project.searchParams.set("possible_duplicates", "true");
  if (duplicates === "without") project.searchParams.set("possible_duplicates", "false");
  const frame = new URL("/geolibre/index.html", window.location.origin);
  frame.searchParams.set("url", project.toString());
  frame.searchParams.set("maponly", "true");
  frame.searchParams.set("embed", "1");
  frame.searchParams.set("welcome", "0");
  return frame.toString();
}

async function fetchCandidateJson<T>(path: string): Promise<T> {
  const response = await fetch(path, {
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload?.detail || `${response.status} ${response.statusText}`);
  }
  return payload as T;
}

function locationLabel(location: CandidateLocation) {
  return [location.building, location.address, location.town, location.region, location.country]
    .filter(Boolean)
    .filter((value, index, values) => values.indexOf(value) === index)
    .join(" · ");
}

function formatInteger(value?: number) {
  return typeof value === "number" ? new Intl.NumberFormat().format(value) : "…";
}

function friendly(value: string) {
  return value.replace(/[_-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatValue(value: unknown) {
  if (Array.isArray(value)) return value.map(String).join(", ");
  if (value && typeof value === "object") return JSON.stringify(value);
  return String(value ?? "");
}

function shortHash(value?: string) {
  return value ? `${value.slice(0, 12)}…` : "loading…";
}

function safeDecode(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function boundedInteger(value: string | null, minimum: number, maximum: number) {
  const number = Number.parseInt(value || "", 10);
  return Number.isFinite(number) ? Math.max(minimum, Math.min(maximum, number)) : minimum;
}
