import { FormEvent, useEffect, useState } from "react";
import {
  fetchRelease11Evidence,
  fetchRelease11Summary,
  Release11EvidenceResponse,
  Release11Summary,
} from "./api";

const number = new Intl.NumberFormat("en");

function evidenceText(value: Record<string, unknown>): string {
  const text = value.text ?? value.quote ?? value.evidenceQuote;
  return typeof text === "string" ? text : JSON.stringify(value);
}

export function Release11EvidencePage() {
  const initial = new URLSearchParams(window.location.search);
  const [query, setQuery] = useState(initial.get("q") ?? "");
  const [family, setFamily] = useState(initial.get("family") ?? "");
  const [kind, setKind] = useState(initial.get("kind") ?? "");
  const [outcome, setOutcome] = useState(initial.get("outcome") ?? "");
  const [summary, setSummary] = useState<Release11Summary | null>(null);
  const [results, setResults] = useState<Release11EvidenceResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextSummary, nextResults] = await Promise.all([
        fetchRelease11Summary(),
        fetchRelease11Evidence({ query, family, kind, outcome, limit: 40 }),
      ]);
      setSummary(nextSummary);
      setResults(nextResults);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Evidence could not be loaded.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // The first request reflects the URL-bound initial state. Further requests
    // are explicit form submissions, avoiding an API request on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const next = new URLSearchParams();
    if (query) next.set("q", query);
    if (family) next.set("family", family);
    if (kind) next.set("kind", kind);
    if (outcome) next.set("outcome", outcome);
    window.history.replaceState(null, "", `${window.location.pathname}${next.size ? `?${next}` : ""}`);
    void load();
  };

  return (
    <main className="release11-page">
      <header className="release11-hero">
        <div>
          <a className="release11-back" href="/">← MODAVIS Navigator</a>
          <p className="release11-eyebrow">Private Release 1.1 candidate</p>
          <h1>Structured source evidence</h1>
          <p>
            Searchable narrative facts and conservative reference links. Unresolved evidence remains
            visible and attributed; an abstention is not presented as canonical truth.
          </p>
        </div>
        {summary?.policy && (
          <aside className="release11-policy" aria-label="Candidate policy">
            <strong>Bounded acceptance policy</strong>
            <span>Qualified canonical links only</span>
            <span>Underqualified provider actor exact-alias cohort withheld</span>
            <span>No publication transition</span>
          </aside>
        )}
      </header>

      {summary?.available && summary.assertions && summary.links && (
        <section className="release11-metrics" aria-label="Corpus summary">
          <article><strong>{number.format(summary.assertions.total)}</strong><span>structured assertions</span></article>
          <article><strong>{number.format(summary.links.selected)}</strong><span>canonical links</span></article>
          <article><strong>{number.format(summary.links.unresolved)}</strong><span>source-backed unresolved links</span></article>
          <article><strong>{number.format(summary.assertions.sourceRecords)}</strong><span>source records represented</span></article>
        </section>
      )}

      <form className="release11-filters" onSubmit={submit} role="search">
        <label>Search evidence<input value={query} onChange={(event) => setQuery(event.target.value)} /></label>
        <label>Structured family<select value={family} onChange={(event) => setFamily(event.target.value)}>
          <option value="">All</option><option value="date">Dates</option><option value="event">Events</option><option value="temperament">Temperaments</option>
        </select></label>
        <label>Reference kind<select value={kind} onChange={(event) => setKind(event.target.value)}>
          <option value="">All</option><option value="actor">Actors</option><option value="place">Places</option><option value="event">Events</option><option value="temperament">Temperaments</option>
        </select></label>
        <label>Reference outcome<select value={outcome} onChange={(event) => setOutcome(event.target.value)}>
          <option value="">All</option><option value="selected">Canonical link</option><option value="abstain">Unresolved</option>
        </select></label>
        <button type="submit" disabled={loading}>{loading ? "Loading…" : "Apply filters"}</button>
      </form>

      {error && <p className="release11-error" role="alert">{error}</p>}
      {!loading && results && (
        <div className="release11-results" aria-live="polite">
          <section>
            <h2>Structured assertions <span>{number.format(results.counts.assertions)}</span></h2>
            {results.assertions.map((item) => (
              <article className="release11-card" key={item.requestId}>
                <div className="release11-card-head"><span>{item.family}</span><a href={`/source/${encodeURIComponent(item.sourceRecordId)}`}>Source dossier</a></div>
                <blockquote>{item.evidence}</blockquote>
                <pre>{JSON.stringify(item.normalizedValue, null, 2)}</pre>
              </article>
            ))}
          </section>
          <section>
            <h2>Reference decisions <span>{number.format(results.counts.links)}</span></h2>
            {results.links.map((item) => (
              <article className="release11-card" key={item.packetId}>
                <div className="release11-card-head"><span>{item.kind} · {item.relationRole}</span><a href={`/source/${encodeURIComponent(item.sourceRecordId)}`}>Source dossier</a></div>
                <p>{evidenceText(item.evidence)}</p>
                {item.outcome === "selected" && item.targetUrl ? (
                  <div className="release11-decision-row">
                    <a className="release11-decision selected" href={item.targetUrl}>Canonical target: {item.selectedCandidateId}</a>
                    <span>{number.format(item.supportingSourceCount)} supporting source{item.supportingSourceCount === 1 ? "" : "s"}</span>
                    {item.conflictingTargetCount > 1 && <span className="release11-conflict">Conflict: {item.conflictingTargetCount} targets</span>}
                  </div>
                ) : (
                  <span className="release11-decision unresolved">Unresolved · {item.reasonCode}</span>
                )}
              </article>
            ))}
          </section>
        </div>
      )}
    </main>
  );
}
