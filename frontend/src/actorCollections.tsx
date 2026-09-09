import { useEffect, useState } from "react";
import { ActorCollectionPage, CanonicalActorDetail, fetchActorCollection } from "./api";

/** Cancel stale requests and never show a previous query's page as the current result. */
export function useActorCollection<T>(url: string | undefined, query: string, page: number) {
  const [result, setResult] = useState<{ key: string; data?: ActorCollectionPage<T>; error?: string }>();
  const [attempt, setAttempt] = useState(0);
  const key = JSON.stringify([url, query, page, attempt]);
  useEffect(() => {
    if (!url) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      fetchActorCollection<T>(url, query, page, controller.signal)
        .then((data) => { if (!controller.signal.aborted) setResult({ key, data }); })
        .catch(() => { if (!controller.signal.aborted) setResult({ key, error: "Unable to load records. Please try again." }); });
    }, query ? 250 : 0);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [key, url, query, page]);
  return {
    data: result?.key === key ? result.data : undefined,
    error: result?.key === key ? result.error : undefined,
    loading: Boolean(url) && (result?.key !== key || (!result?.data && !result?.error)),
    retry: () => setAttempt((value) => value + 1),
  };
}

export function ActorRelationshipPages({ actor }: { actor: CanonicalActorDetail }) {
  type Relationship = NonNullable<CanonicalActorDetail["relationships"]>[number];
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const { data, loading, error, retry } = useActorCollection<Relationship>(
    open ? actor.collectionDelivery?.relationshipsUrl : undefined, query, page,
  );
  const total = actor.publicProfile?.relationshipCount ?? 0;
  return <details className="actor-compact-details" onToggle={(event) => setOpen(event.currentTarget.open)}>
    <summary>Builder of · {total} connected {total === 1 ? "organ" : "organs"}</summary>
    {open && <>
      <label className="actor-mention-search"><span>Search related entities</span>
        <div><input value={query} maxLength={200} onChange={(event) => { setQuery(event.target.value); setPage(0); }} placeholder="Organ name or identifier" /></div>
      </label>
      {loading && <p role="status">Loading relationships…</p>}
      {error && <p role="alert">{error} <button type="button" className="secondary" onClick={retry}>Retry relationships</button></p>}
      {data && <>
        <p role="status">{data.total} of {total} connected organs{data.total > 0 && ` · Showing ${data.offset + 1}–${data.offset + data.items.length}`}</p>
        <nav className="catalog-pagination" aria-label="Relationship pages">
          <button type="button" className="secondary" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous relationships</button>{" "}
          <button type="button" className="secondary" disabled={!data.hasMore} onClick={() => setPage(page + 1)}>Next relationships</button>
        </nav>
        <div className="actor-relationship-entity-list">
          {data.items.map((item) => <article key={item.id}>
            <a className="actor-relationship-entity-link" href={item.relatedUrl || item.entityPageUrl || undefined}>
              <span><strong>{item.relatedLabel || item.label}</strong>
                <small>{item.relatedMdvsId || item.mdvsId} · {item.evidenceSummary}</small></span>
              <span className="actor-relationship-entity-action">Open organ</span>
            </a>
          </article>)}
        </div>
        {data.total === 0 && <p className="muted">No relationships match this search.</p>}
      </>}
    </>}
  </details>;
}
