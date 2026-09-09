import { MouseEvent as ReactMouseEvent, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle, Bot, ChevronRight, Download, FileArchive, FileText, Filter,
  GitBranch, LockKeyhole, Search, ShieldCheck, X,
} from "lucide-react";
import {
  InternalDocumentationHub,
  InternalDocumentationPage,
  InternalDocumentationPageList,
  InternalDocumentationPageSummary,
  InternalDocumentationProfile,
  fetchInternalDocumentationHub,
  fetchInternalDocumentationPage,
  fetchInternalDocumentationPages,
} from "./api";

type InternalDocumentationRoute =
  | { kind: "hub"; profile: InternalDocumentationProfile }
  | { kind: "page"; profile: InternalDocumentationProfile; slug: string };

type Filters = {
  component: string;
  kind: string;
  authority: string;
  lifecycle: string;
  taskTag: string;
  reviewStatus: string;
};
const EMPTY_FILTERS: Filters = {
  component: "", kind: "", authority: "", lifecycle: "", taskTag: "", reviewStatus: "",
};

export function InternalDocumentationArea({ canReadLocal = false }: { canReadLocal?: boolean }) {
  const [route, setRoute] = useState<InternalDocumentationRoute>(() => allowedRoute(internalDocumentationRoute(), canReadLocal));

  useEffect(() => {
    const sync = () => setRoute(allowedRoute(internalDocumentationRoute(), canReadLocal));
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, [canReadLocal]);

  const openRoute = (next: InternalDocumentationRoute) => {
    const permitted = allowedRoute(next, canReadLocal);
    window.history.pushState(null, "", routePath(permitted));
    setRoute(permitted);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  if (route.kind === "page") {
    return <InternalDocumentationReader route={route} onOpen={openRoute} />;
  }
  return <InternalDocumentationHubPage profile={route.profile} canReadLocal={canReadLocal} onOpen={openRoute} />;
}

function InternalDocumentationHubPage({
  profile, canReadLocal, onOpen,
}: {
  profile: InternalDocumentationProfile;
  canReadLocal: boolean;
  onOpen: (route: InternalDocumentationRoute) => void;
}) {
  const [hub, setHub] = useState<InternalDocumentationHub | null>(null);
  const [pages, setPages] = useState<InternalDocumentationPageList | null>(null);
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setHub(null);
    setError(null);
    fetchInternalDocumentationHub(profile)
      .then(setHub)
      .catch((reason: Error) => setError(reason.message));
  }, [profile]);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setLoading(true);
      fetchInternalDocumentationPages(profile, { query, ...filters, limit: 100 })
        .then((value) => { if (!cancelled) { setPages(value); setError(null); } })
        .catch((reason: Error) => { if (!cancelled) setError(reason.message); })
        .finally(() => { if (!cancelled) setLoading(false); });
    }, 150);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [filters, profile, query]);

  useEffect(() => {
    document.title = `${profile === "internal" ? "Development" : "Local-restricted"} Documentation | MODAVIS Navigator`;
  }, [profile]);

  const loadMore = async () => {
    if (!pages || loadingMore) return;
    setLoadingMore(true);
    try {
      const next = await fetchInternalDocumentationPages(profile, {
        query, ...filters, limit: 100, offset: pages.items.length,
      });
      setPages({ ...next, items: [...pages.items, ...next.items], offset: 0 });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load more documentation pages");
    } finally {
      setLoadingMore(false);
    }
  };

  const facetSource = hub?.facets ?? pages?.facets;
  const activeFilters = Object.values(filters).filter(Boolean).length;
  const profileLabel = profile === "internal" ? "Internal development" : "Local restricted";
  return (
    <section className="entity-section documentation-hub internal-documentation" id="internal-docs" tabIndex={-1}>
      <header className="documentation-hero internal-documentation-hero">
        <div>
          <p className="eyebrow">MODAVIS knowledge system <span className="internal-documentation-private"><LockKeyhole size={13} /> Not public</span></p>
          <h2>Development documentation for people and agents.</h2>
          <p>This mounted corpus preserves framework, component, operations, HPC, migration, and evidence documentation without mixing it into the public release.</p>
        </div>
        <div className="internal-documentation-profile" aria-label="Documentation access profile">
          <ShieldCheck size={18} />
          <span><small>Active profile</small><strong>{profileLabel}</strong></span>
        </div>
      </header>

      <nav className="internal-documentation-profile-tabs" aria-label="Documentation profile">
        <button type="button" className={profile === "internal" ? "active" : ""} onClick={() => onOpen({ kind: "hub", profile: "internal" })}>Internal</button>
        {canReadLocal && <button type="button" className={profile === "local-restricted" ? "active" : ""} onClick={() => onOpen({ kind: "hub", profile: "local-restricted" })}>Local restricted</button>}
      </nav>

      <div className="documentation-search-shell" role="search" aria-label="Search development documentation">
        <label className="documentation-search">
          <Search size={20} aria-hidden="true" />
          <span className="sr-only">Search development documentation</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search titles, source paths, summaries, or slugs" />
          {query && <button type="button" className="icon-button" aria-label="Clear search" onClick={() => setQuery("")}><X size={16} /></button>}
        </label>
        <div className="documentation-filters open internal-documentation-filters" aria-label="Documentation filters">
          <Filter size={17} aria-hidden="true" />
          <FacetSelect label="Component" value={filters.component} options={facetSource?.components} onChange={(value) => setFilters((current) => ({ ...current, component: value }))} />
          <FacetSelect label="Kind" value={filters.kind} options={facetSource?.kinds} onChange={(value) => setFilters((current) => ({ ...current, kind: value }))} />
          <FacetSelect label="Authority" value={filters.authority} options={facetSource?.authorities} onChange={(value) => setFilters((current) => ({ ...current, authority: value }))} />
          <FacetSelect label="Lifecycle" value={filters.lifecycle} options={facetSource?.lifecycles} onChange={(value) => setFilters((current) => ({ ...current, lifecycle: value }))} />
          <FacetSelect label="Task" value={filters.taskTag} options={facetSource?.taskTags} onChange={(value) => setFilters((current) => ({ ...current, taskTag: value }))} />
          <FacetSelect label="Review" value={filters.reviewStatus} options={facetSource?.reviewStatuses} onChange={(value) => setFilters((current) => ({ ...current, reviewStatus: value }))} />
          {activeFilters > 0 && <button type="button" className="documentation-clear-filters" onClick={() => setFilters(EMPTY_FILTERS)}><X size={15} /> Clear</button>}
        </div>
      </div>

      {error && <div className="notice error" role="alert">{error}</div>}
      {hub && <InternalDocumentationOverview hub={hub} profile={profile} onOpen={onOpen} />}

      <div className="documentation-section-heading">
        <div><p className="eyebrow">Corpus contents</p><h3>{pages?.total ?? hub?.counts.pages ?? 0} matching pages</h3></div>
        {hub && <div className="documentation-section-actions">
          <a href={`/api/internal/docs/${profile}/agent/start.json`}><Bot size={16} /> Agent start</a>
          <a href={`/api/internal/docs/${profile}/agent/catalog.json`}><Bot size={16} /> Agent catalog</a>
          <a href={`/api/internal/docs/${profile}/artifact`}><Download size={16} /> Bundle</a>
        </div>}
      </div>
      {loading && !pages ? <div className="documentation-loading" role="status">Loading development corpus…</div> : (
        <div className="internal-documentation-list">
          {(pages?.items ?? []).map((page) => <InternalDocumentationCard key={page.slug} page={page} onOpen={onOpen} />)}
        </div>
      )}
      {pages?.hasMore && <button type="button" className="secondary internal-documentation-load-more" disabled={loadingMore} onClick={loadMore}>{loadingMore ? "Loading…" : `Load more (${pages.items.length} of ${pages.total})`}</button>}
    </section>
  );
}

function InternalDocumentationOverview({
  hub, profile, onOpen,
}: {
  hub: InternalDocumentationHub;
  profile: InternalDocumentationProfile;
  onOpen: (route: InternalDocumentationRoute) => void;
}) {
  return (
    <>
      <section className="internal-documentation-overview" aria-label="Documentation projection summary">
        <div><strong>{hub.counts.pages}</strong><span>pages</span></div>
        <div><strong>{hub.facets.components.length}</strong><span>components</span></div>
        <div><strong>{hub.counts.resources}</strong><span>metadata-only resources</span></div>
        <div><strong>{hub.linkWarnings.length}</strong><span>migration link warnings</span></div>
        <details>
          <summary><FileArchive size={16} /> Projection details</summary>
          <dl>
            <dt>Version</dt><dd>{hub.latestRelease.versionLabel}</dd>
            <dt>Corpus hash</dt><dd><code>{hub.latestRelease.corpusSha256}</code></dd>
            <dt>Agent routing</dt><dd><a href={`/api/internal/docs/${profile}/agent/start.json`}>start.json</a> · <a href={`/api/internal/docs/${profile}/agent/components.json`}>components.json</a></dd>
            {hub.informationBasis && <><dt>Decision basis</dt><dd><a href={`/api/internal/docs/${profile}/agent/information-basis.json`}>information-basis.json</a>{hub.informationBasis.broaderProfileAvailable && <small className="information-basis-profile-notice"><LockKeyhole size={13} /> The local-restricted projection contains additional evidence.</small>}</dd></>}
          </dl>
          {hub.resources.length > 0 && <div className="internal-documentation-resources"><strong>External and ephemeral resources</strong>{hub.resources.map((resource) => <p key={resource.key}><code>{resource.pathAlias || resource.key}</code> — {resource.description || resource.title || resource.kind}</p>)}</div>}
          {hub.linkWarnings.length > 0 && <p className="internal-documentation-warning"><AlertTriangle size={15} /> Broken or legacy links remain visible here for migration cleanup; they do not pass the public projection gate.</p>}
        </details>
      </section>
      {((hub.readFirst ?? []).length > 0 || (hub.taskRoutes ?? []).length > 0) && (
        <section className="internal-documentation-routing" aria-label="Task-oriented documentation routes">
          {(hub.readFirst ?? []).length > 0 && <div className="internal-documentation-read-first"><p className="eyebrow">Read first</p><div>{hub.readFirst.map((page) => <DocumentationRouteLink key={page.canonicalKey} page={page} onOpen={onOpen} />)}</div></div>}
          {(hub.taskRoutes ?? []).length > 0 && <div><p className="eyebrow">Task routes</p><div className="internal-documentation-route-grid">{hub.taskRoutes.map((route) => (
            <article className="internal-documentation-route-card" key={route.key}>
              <code>{route.key}</code><h4>{route.title}</h4>{route.description && <p>{route.description}</p>}
              <div>{route.entrypoints.map((page) => <DocumentationRouteLink key={page.canonicalKey} page={page} onOpen={onOpen} />)}</div>
              {route.broaderProfileAvailable && <small><LockKeyhole size={13} /> Additional evidence is available in a more restricted profile.</small>}
            </article>
          ))}</div></div>}
        </section>
      )}
    </>
  );
}

function DocumentationRouteLink({
  page, onOpen,
}: {
  page: { canonicalKey: string; title: string; url: string };
  onOpen: (route: InternalDocumentationRoute) => void;
}) {
  return <a href={page.url} onClick={(event) => {
    const linked = internalDocumentationRoute(new URL(page.url, window.location.origin).pathname);
    if (linked.kind !== "page") return;
    event.preventDefault();
    onOpen(linked);
  }}>{page.title}<ChevronRight size={13} /></a>;
}

function InternalDocumentationCard({ page, onOpen }: { page: InternalDocumentationPageSummary; onOpen: (route: InternalDocumentationRoute) => void }) {
  return (
    <a className="internal-documentation-card" href={routePath({ kind: "page", profile: page.profile, slug: page.slug })} onClick={(event) => { event.preventDefault(); onOpen({ kind: "page", profile: page.profile, slug: page.slug }); }}>
      <FileText size={19} />
      <span className="internal-documentation-card-copy">
        <span className="documentation-card-meta"><span>{friendly(page.ownerComponent || "Framework")}</span><span>{friendly(page.kind)}</span><span>{friendly(page.lifecycle)}</span><span>{friendly(page.authority)}</span></span>
        <strong>{page.title}</strong>
        {page.summary && <small>{page.summary}</small>}
        <code>{page.slug}</code>
      </span>
      <ChevronRight size={18} />
    </a>
  );
}

function InternalDocumentationReader({ route, onOpen }: { route: Extract<InternalDocumentationRoute, { kind: "page" }>; onOpen: (route: InternalDocumentationRoute) => void }) {
  const [page, setPage] = useState<InternalDocumentationPage | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setPage(null);
    setError(null);
    fetchInternalDocumentationPage(route.profile, route.slug)
      .then(setPage)
      .catch((reason: Error) => setError(reason.message));
  }, [route.profile, route.slug]);

  useEffect(() => {
    document.title = `${page?.title || "Development documentation"} | MODAVIS Navigator`;
  }, [page?.title]);

  const headingLinks = useMemo(() => page?.headings.filter((heading) => heading.level >= 2 && heading.level <= 4) ?? [], [page]);
  const onProseClick = (event: ReactMouseEvent<HTMLElement>) => {
    const anchor = (event.target as HTMLElement).closest("a");
    if (!anchor?.href) return;
    const url = new URL(anchor.href, window.location.origin);
    if (url.origin !== window.location.origin || !url.pathname.startsWith("/internal/docs/")) return;
    const linked = internalDocumentationRoute(url.pathname);
    if (linked.kind !== "page") return;
    event.preventDefault();
    onOpen({ ...linked, profile: route.profile });
  };

  if (error) return <section className="entity-section"><div className="notice error" role="alert">{error}</div></section>;
  if (!page) return <div className="documentation-loading" role="status">Loading development page…</div>;
  return (
    <article className="entity-section documentation-reader internal-documentation-reader">
      <nav className="documentation-breadcrumbs">
        <a href={routePath({ kind: "hub", profile: route.profile })} onClick={(event) => { event.preventDefault(); onOpen({ kind: "hub", profile: route.profile }); }}>Development docs</a>
        <ChevronRight size={14} /><span>{friendly(route.profile)}</span><ChevronRight size={14} /><span>{page.title}</span>
      </nav>
      <header className="documentation-page-header">
        <div>
          <p className="eyebrow">{friendly(page.visibility)} · {friendly(page.authority)} · {friendly(page.lifecycle)}</p>
          <h1>{page.title}</h1>
          {page.summary && <p>{page.summary}</p>}
        </div>
        <div className="internal-documentation-profile"><LockKeyhole size={18} /><span><small>Access profile</small><strong>{friendly(route.profile)}</strong></span></div>
      </header>
      <div className="documentation-reader-layout">
        <aside className="documentation-toc open">
          <strong>On this page</strong>
          <nav aria-label="On this page">{headingLinks.map((heading) => <a key={heading.id} className={`level-${heading.level}`} href={`#${heading.id}`}>{heading.label}</a>)}</nav>
        </aside>
        <main className="documentation-prose" onClick={onProseClick} dangerouslySetInnerHTML={{ __html: page.html }} />
        <aside className="documentation-context-card">
          <strong>Development provenance</strong>
          <dl>
            <dt>Component</dt><dd>{page.ownerComponent}</dd>
            <dt>Kind</dt><dd>{friendly(page.kind)}</dd>
            <dt>Authority</dt><dd>{friendly(page.authority)}</dd>
            <dt>Lifecycle</dt><dd>{friendly(page.lifecycle)}</dd>
            <dt>Repository</dt><dd>{page.repositoryKey}</dd>
            <dt>Source</dt><dd><code>{page.sourcePath}</code></dd>
            <dt>State</dt><dd>{friendly(page.sourceState)}</dd>
            <dt>Commit</dt><dd><code>{page.sourceCommit}</code></dd>
            <dt>Page hash</dt><dd><code>{page.contentSha256}</code></dd>
            <dt>Review</dt><dd>{friendly(page.contentReview?.status || "not configured")}</dd>
            <dt>Runtime</dt><dd>{friendly(page.contentReview?.runtimeVerification || "separate process")}</dd>
          </dl>
          {page.environments && page.environments.length > 0 && <p><GitBranch size={14} /> Environments: {page.environments.map(friendly).join(", ")}</p>}
          {page.sensitivity && page.sensitivity.length > 0 && <p><LockKeyhole size={14} /> Sensitivity: {page.sensitivity.map(friendly).join(", ")}</p>}
          {(page.taskTags ?? []).length > 0 && <div className="internal-documentation-tags"><strong>Task routes</strong>{page.taskTags.map((tag) => <span key={tag}>{friendly(tag)}</span>)}</div>}
          {page.resolvedRelated && page.resolvedRelated.length > 0 && <div className="internal-documentation-related"><strong>Related authority</strong>{page.resolvedRelated.map((relation) => (
            <a key={`${relation.kind}:${relation.canonicalKey || relation.targetCanonicalKey || relation.url}`} href={relation.url} onClick={(event) => {
              const linked = internalDocumentationRoute(new URL(relation.url, window.location.origin).pathname);
              if (linked.kind !== "page") return;
              event.preventDefault();
              onOpen(linked);
            }}><small>{friendly(relation.kind)}</small>{relation.title}</a>
          ))}</div>}
        </aside>
      </div>
    </article>
  );
}

function FacetSelect({ label, value, options = [], onChange }: { label: string; value: string; options?: Array<{ value: string; count: number }>; onChange: (value: string) => void }) {
  return <label><span>{label}</span><select value={value} onChange={(event) => onChange(event.target.value)}><option value="">All {label.toLowerCase()}s</option>{options.map((item) => <option key={item.value} value={item.value}>{friendly(item.value)} ({item.count})</option>)}</select></label>;
}

function internalDocumentationRoute(pathname = window.location.pathname): InternalDocumentationRoute {
  const normalized = decodeURI(pathname).replace(/\/+$/, "");
  const segments = normalized.split("/").filter(Boolean);
  if (segments[0] !== "internal" || segments[1] !== "docs") return { kind: "hub", profile: "internal" };
  const candidate = segments[2];
  if (candidate === "internal" || candidate === "local-restricted") {
    if (segments[3] === "pages" && segments.length > 4) return { kind: "page", profile: candidate, slug: segments.slice(4).join("/") };
    if (segments[3] === "v" && segments.length > 5) {
      const slugStart = segments[5] === "pages" ? 6 : 5;
      return { kind: "page", profile: candidate, slug: segments.slice(slugStart).join("/") };
    }
    return { kind: "hub", profile: candidate };
  }
  if (candidate === "v" && segments.length > 4) return { kind: "page", profile: "internal", slug: segments.slice(4).join("/") };
  if (segments.length > 2) return { kind: "page", profile: "internal", slug: segments.slice(2).join("/") };
  return { kind: "hub", profile: "internal" };
}

function allowedRoute(route: InternalDocumentationRoute, canReadLocal: boolean): InternalDocumentationRoute {
  return route.profile === "local-restricted" && !canReadLocal ? { kind: "hub", profile: "internal" } : route;
}

function routePath(route: InternalDocumentationRoute): string {
  const base = `/internal/docs/${route.profile}`;
  return route.kind === "page" ? `${base}/pages/${route.slug.split("/").map(encodeURIComponent).join("/")}` : base;
}

function friendly(value: string): string {
  return value.replace(/[_-]+/g, " ").replace(/^\w/, (letter) => letter.toUpperCase());
}
