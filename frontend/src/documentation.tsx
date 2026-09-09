import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle, ArrowLeft, ArrowRight, BookMarked, BookOpen, Check, ChevronRight,
  Boxes, Clipboard, Database, Download, FileArchive, FileText, Filter, GitBranch,
  Hash, History, Link2, Menu, Navigation, Radar, Search, ShieldCheck, Workflow, X,
  Users,
} from "lucide-react";
import {
  DocumentationCitation,
  DocumentationHub,
  DocumentationPage,
  DocumentationPageList,
  DocumentationPageSummary,
  DocumentationRelease,
  DocumentationReleasePlan,
  fetchDocumentationAdminStatus,
  fetchDocumentationHub,
  fetchDocumentationIdentifierPlan,
  fetchDocumentationPage,
  fetchDocumentationPages,
  fetchDocumentationPreview,
  fetchDocumentationRelease,
  fetchDocumentationReleases,
  publishDocumentationRelease,
  registerDocumentationIdentifier,
  stageDocumentationReleaseBundle,
} from "./api";

type DocumentationRoute =
  | { kind: "hub" }
  | { kind: "page"; slug: string; version?: string }
  | { kind: "release"; version: string }
  | { kind: "preview"; planId: string; slug: string }
  | { kind: "mdvs"; id: string };

export function DocumentationArea({ isAdmin = false }: { isAdmin?: boolean }) {
  const [route, setRoute] = useState<DocumentationRoute>(() => documentationRoute());
  useEffect(() => {
    const sync = () => setRoute(documentationRoute());
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);
  if (route.kind === "page") return <DocumentationReader route={route} />;
  if (route.kind === "release") return <DocumentationReleasePage version={route.version} isAdmin={isAdmin} />;
  if (route.kind === "preview") return isAdmin ? <DocumentationPreviewPage route={route} /> : <DocumentationEmpty title="Admin preview unavailable" detail="Sign in with an Admin account to inspect staged documentation." />;
  if (route.kind === "mdvs") return <DocumentationMdvsResolver id={route.id} />;
  return <DocumentationHubPage isAdmin={isAdmin} />;
}

function DocumentationHubPage({ isAdmin }: { isAdmin: boolean }) {
  const [hub, setHub] = useState<DocumentationHub | null>(null);
  const [pages, setPages] = useState<DocumentationPageList | null>(null);
  const [catalogPages, setCatalogPages] = useState<DocumentationPageSummary[]>([]);
  const [query, setQuery] = useState(() => new URLSearchParams(window.location.search).get("q") || "");
  const [category, setCategory] = useState(() => new URLSearchParams(window.location.search).get("category") || "");
  const [audience, setAudience] = useState(() => new URLSearchParams(window.location.search).get("audience") || "");
  const [component, setComponent] = useState(() => new URLSearchParams(window.location.search).get("component") || "");
  const [showAll, setShowAll] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    fetchDocumentationHub().then((value) => { if (!cancelled) setHub(value); }).catch((reason: Error) => { if (!cancelled) setError(reason.message); });
    return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setLoading(true);
      updateDocumentationSearchRoute(query, category, audience, component);
      fetchDocumentationPages({ query, category, audience, component, limit: 100 })
        .then((value) => { if (!cancelled) { setPages(value); if (!query && !category && !audience && !component) setCatalogPages(value.items); setError(null); } })
        .catch((reason: Error) => { if (!cancelled) setError(reason.message); })
        .finally(() => { if (!cancelled) setLoading(false); });
    }, 180);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [query, category, audience, component]);
  useDocumentationMetadata({
    title: "Documentation | MODAVIS Navigator",
    description: "Versioned and citable MODAVIS methods, framework documentation, and source dossiers.",
    canonicalPath: "/docs",
  });
  const hasFilters = Boolean(query || category || audience || component);
  const activeFilterCount = [component, category, audience].filter(Boolean).length;
  const componentOptions = hub?.components ?? pages?.facets?.components ?? hub?.categories ?? [];
  const useCaseCategory = hub?.categories.find((item) => item.value === "Use cases");
  const userStoryCategory = hub?.categories.find((item) => item.value === "User stories");
  const useCaseScenarioCount = Math.max(0, (useCaseCategory?.count ?? 0) - 2);
  const userStoryCount = Math.max(0, (userStoryCategory?.count ?? 0) - 2);
  const starterPool = catalogPages.length ? catalogPages : hub?.featured ?? [];
  const starterPages = componentOptions.map((item) => {
    const matches = starterPool.filter((page) => page.ownerComponent === item.value);
    return matches.find((page) => !page.slug.includes("/")) ?? matches[0];
  }).filter((page): page is DocumentationPageSummary => Boolean(page));
  const visible = hasFilters || showAll ? pages?.items ?? [] : starterPages;
  const published = hub?.status === "published" && Boolean(hub.latestRelease);
  const resultTitle = hasFilters
    ? `${pages?.total ?? 0} matching page${pages?.total === 1 ? "" : "s"}`
    : showAll
      ? `All ${pages?.total ?? hub?.counts.pages ?? 0} pages`
      : "Recommended starting points";
  const resetDiscovery = () => { setQuery(""); setCategory(""); setAudience(""); setComponent(""); setShowAll(false); setFiltersOpen(false); };
  return (
    <section className="entity-section documentation-hub" id="docs" tabIndex={-1}>
      <header className="documentation-hero">
        <div>
          <p className="eyebrow">MODAVIS Documentation <span className="documentation-published-state">{published ? "Approved corpus" : "No approved release"}</span></p>
          <h2>{published ? "Evidence, methods, and decisions—ready to cite." : "Citable documentation begins with an approved release."}</h2>
          <p>{published ? "Move from an accessible overview to immutable versions, stable identifiers, repository provenance, and technical fixity." : "The active local software and database preview is private and unpublished. Its reviewer-facing scope and limitations are available separately and must not be cited as a published documentation release."}</p>
          {!published && <a className="documentation-release-guide-link" href="/about/release">Open active preview scope and limitations</a>}
        </div>
        {hub?.latestRelease && <DocumentationReleaseBadge release={hub.latestRelease} />}
      </header>
      <div className="documentation-search-shell" role="search" aria-label="Search and filter documentation">
        <label className="documentation-search">
          <Search size={20} aria-hidden="true" />
          <span className="sr-only">Search documentation</span>
          <input aria-label="Search documentation" value={query} onChange={(event) => { setQuery(event.target.value); setShowAll(false); }} placeholder="Search titles, methods, mappings, or contracts" />
          {query && <button type="button" className="icon-button" aria-label="Clear documentation search" onClick={() => setQuery("")}><X size={16} /></button>}
        </label>
        <button type="button" className="documentation-filter-toggle" aria-controls="documentation-filter-panel" aria-expanded={filtersOpen} onClick={() => setFiltersOpen((value) => !value)}><Filter size={17} /> Filters{activeFilterCount > 0 && <span>{activeFilterCount}</span>}</button>
        <div id="documentation-filter-panel" className={filtersOpen ? "documentation-filters open" : "documentation-filters"} aria-label="Documentation filters">
          <Filter size={17} aria-hidden="true" />
          <label><span>Component</span><select value={component} onChange={(event) => { setComponent(event.target.value); setShowAll(false); }}><option value="">All components</option>{componentOptions.map((item) => <option key={item.value} value={item.value}>{item.value} ({item.count})</option>)}</select></label>
          <label><span>Category</span><select value={category} onChange={(event) => { setCategory(event.target.value); setShowAll(false); }}><option value="">All categories</option>{(hub?.categories ?? pages?.facets?.categories ?? []).map((item) => <option key={item.value} value={item.value}>{item.value} ({item.count})</option>)}</select></label>
          <label><span>Audience</span><select value={audience} onChange={(event) => { setAudience(event.target.value); setShowAll(false); }}><option value="">All audiences</option>{(hub?.audiences ?? pages?.facets?.audiences ?? []).map((item) => <option key={item.value} value={item.value}>{friendly(item.value)} ({item.count})</option>)}</select></label>
          {hasFilters && <button type="button" className="documentation-clear-filters" onClick={resetDiscovery}><X size={15} /> Clear</button>}
        </div>
      </div>
      {hub?.status === "schema_missing" && <DocumentationEmpty title="Documentation schema is not deployed" detail="Apply the Initiator documentation schema before publishing the first approved release." />}
      {hub?.status === "no_release" && <DocumentationEmpty title="No approved documentation release yet" detail="No page in this area is currently presented as published or citable. The private reviewer guide is disclosed separately." />}
      {error && <div className="notice error" role="alert">{error}</div>}
      {hub?.latestRelease && (
        <section className="documentation-component-dashboard" aria-labelledby="documentation-components-title">
          <header className="documentation-component-header">
            <div><p className="eyebrow">Explore the corpus</p><h3 id="documentation-components-title">Start with a MODAVIS component</h3><p>Choose a component to narrow the approved release without losing citation context.</p></div>
            <div className="documentation-compact-metrics" aria-label="Documentation publication summary">
              <span><strong>{hub.counts.pages}</strong> pages</span>
              <span><strong>{hub.counts.releases}</strong> release{hub.counts.releases === 1 ? "" : "s"}</span>
              <span><strong>CC BY 4.0</strong></span>
            </div>
          </header>
          <div className="documentation-component-grid">
            {componentOptions.map((item) => (
              <button key={item.value} type="button" className={component === item.value ? "active" : ""} aria-pressed={component === item.value} onClick={() => { setComponent(component === item.value ? "" : item.value); setShowAll(false); }}>
                <span className="documentation-component-icon"><DocumentationComponentIcon name={item.value} /></span>
                <span><strong>{item.value}</strong><small>{item.count} approved page{item.count === 1 ? "" : "s"}</small></span>
                <ChevronRight size={17} aria-hidden="true" />
              </button>
            ))}
          </div>
          <div className="documentation-proof-libraries">
            {useCaseCategory && (
              <button type="button" className={category === "Use cases" ? "documentation-proof-entry use-cases active" : "documentation-proof-entry use-cases"} aria-pressed={category === "Use cases"} onClick={() => { setQuery(""); setComponent(""); setAudience(""); setCategory(category === "Use cases" ? "" : "Use cases"); setShowAll(false); }}>
                <span className="documentation-proof-icon"><ShieldCheck size={22} aria-hidden="true" /></span>
                <span className="documentation-proof-copy"><small>Workflow proof library</small><strong>Use case scenarios</strong><span>Workflows, edge conditions, ownership, evidence, and executable acceptance criteria.</span></span>
                <span className="documentation-proof-count">{useCaseScenarioCount} scenarios <i>+ template</i></span>
                <ChevronRight size={18} aria-hidden="true" />
              </button>
            )}
            {userStoryCategory && (
              <button type="button" className={category === "User stories" ? "documentation-proof-entry user-stories active" : "documentation-proof-entry user-stories"} aria-pressed={category === "User stories"} onClick={() => { setQuery(""); setComponent(""); setAudience(""); setCategory(category === "User stories" ? "" : "User stories"); setShowAll(false); }}>
                <span className="documentation-proof-icon"><Users size={22} aria-hidden="true" /></span>
                <span className="documentation-proof-copy"><small>Actor-centred delivery library</small><strong>User stories</strong><span>Acceptance criteria, current gaps, priorities, responsibilities, and proof of closure.</span></span>
                <span className="documentation-proof-count">{userStoryCount} stories <i>+ template</i></span>
                <ChevronRight size={18} aria-hidden="true" />
              </button>
            )}
          </div>
        </section>
      )}
      <div className="documentation-section-heading">
        <div aria-live="polite"><p className="eyebrow">{published ? "Read and cite" : "Approved-release catalog"}</p><h3>{published ? resultTitle : "No approved pages"}</h3>{!hasFilters && !showAll && <p>{published ? "One reliable entry point from each published component." : "Private preview guidance is not inserted into the citable documentation corpus."}</p>}</div>
        <div className="documentation-section-actions">
          {published && !hasFilters && !showAll && <button type="button" className="secondary" onClick={() => setShowAll(true)}>Browse all {hub?.counts.pages ?? 0}</button>}
          {(hasFilters || showAll) && <button type="button" className="documentation-text-action" onClick={resetDiscovery}>Show recommended</button>}
          {hub?.latestRelease
            ? <a href={`/docs/releases/${hub.latestRelease.versionLabel}`} onClick={(event) => { event.preventDefault(); openDocumentationPath(`/docs/releases/${hub.latestRelease!.versionLabel}`); }}><History size={16} /> Release details</a>
            : <span className="documentation-muted-action" aria-disabled="true"><History size={16} /> Release history begins with the first approved release</span>}
        </div>
      </div>
      {loading && !visible.length ? <div className="documentation-loading" role="status">Loading documentation…</div> : null}
      <div className="documentation-card-grid">
        {visible.map((page) => <DocumentationCard key={`${page.releaseVersion}:${page.slug}`} page={page} />)}
      </div>
      {!loading && hub?.status === "published" && visible.length === 0 && <DocumentationEmpty title="No pages match" detail="Try a broader search or clear the filters." />}
      {hub?.citationPolicy && <aside className="documentation-citation-policy"><BookMarked size={20} /><div><strong>Citation policy</strong><p>{hub.citationPolicy}</p></div></aside>}
      {isAdmin && <DocumentationPublisher latestRelease={hub?.latestRelease ?? null} onPublished={() => window.location.reload()} />}
    </section>
  );
}

function DocumentationCard({ page }: { page: DocumentationPageSummary }) {
  return (
    <a className="documentation-card" href={page.url} onClick={(event) => { event.preventDefault(); openDocumentationPath(page.url); }}>
      <div className="documentation-card-icon"><FileText size={20} /></div>
      <div className="documentation-card-copy">
        <div className="documentation-card-meta"><span>{page.category}</span><span>{friendly(page.audience)}</span></div>
        <h4>{page.title}</h4>
        {page.summary && <p>{page.summary}</p>}
        <footer><span>{page.ownerComponent || "MODAVIS"}</span><span>v{page.releaseVersion}</span><span className="documentation-card-action">Read &amp; cite <ChevronRight size={16} /></span></footer>
      </div>
    </a>
  );
}

function DocumentationComponentIcon({ name }: { name: string }) {
  if (name === "Framework") return <GitBranch size={20} aria-hidden="true" />;
  if (name === "Navigator") return <Navigation size={20} aria-hidden="true" />;
  if (name === "Initiator") return <Database size={20} aria-hidden="true" />;
  if (name === "Aggregator") return <Boxes size={20} aria-hidden="true" />;
  if (name === "Processor") return <Workflow size={20} aria-hidden="true" />;
  if (name === "Prospector") return <Radar size={20} aria-hidden="true" />;
  return <BookOpen size={20} aria-hidden="true" />;
}

function DocumentationReader({ route }: { route: Extract<DocumentationRoute, { kind: "page" }> }) {
  const [page, setPage] = useState<DocumentationPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [citationOpen, setCitationOpen] = useState(false);
  const [tocOpen, setTocOpen] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setPage(null);
    setError(null);
    fetchDocumentationPage(route.slug, route.version)
      .then((value) => { if (!cancelled) setPage(value); })
      .catch((reason: Error) => { if (!cancelled) setError(reason.message); });
    return () => { cancelled = true; };
  }, [route.slug, route.version]);
  useDocumentationMetadata(page ? {
    title: `${page.title} · MODAVIS Documentation`,
    description: page.summary || "Versioned MODAVIS documentation.",
    canonicalPath: route.version ? page.versionedUrl : page.url,
    jsonLd: {
      "@context": "https://schema.org", "@type": "TechArticle", name: page.title,
      version: page.release.versionLabel, datePublished: page.release.issuedAt,
      author: { "@type": "Organization", name: page.citation.creator },
      publisher: { "@type": "Organization", name: page.citation.publisher },
      license: page.citation.licenseUrl, identifier: [page.mdvsId, page.citation.doi].filter(Boolean),
      isPartOf: { "@type": "CreativeWork", name: page.release.title, version: page.release.versionLabel },
    },
  } : null);
  if (error) return <DocumentationEmpty title="Documentation page unavailable" detail={error} />;
  if (!page) return <div className="documentation-loading" role="status">Loading documentation page…</div>;
  const sourceContext = sourceDocumentationContext(page.slug);
  return (
    <article className="documentation-reader">
      <nav className="documentation-breadcrumbs" aria-label="Breadcrumb">
        <a href="/docs" onClick={(event) => { event.preventDefault(); openDocumentationPath("/docs"); }}>Documentation</a><ChevronRight size={14} />
        <span>{page.category}</span><ChevronRight size={14} /><span aria-current="page">{page.title}</span>
      </nav>
      {page.notices.map((notice) => <div key={String(notice.id)} className={`documentation-release-notice ${notice.type}`} role="note"><AlertCircle size={19} /><div><strong>{friendly(notice.type)} release notice</strong><p>{notice.text}</p>{notice.replacementVersion && <a href={`/docs/v/${notice.replacementVersion}/${page.slug}`}>Open replacement release</a>}</div></div>)}
      <header className="documentation-page-header">
        <div>
          <div className="documentation-card-meta"><span>{page.category}</span><span>{friendly(page.audience)}</span><span>{page.ownerComponent}</span></div>
          <h1>{page.title}</h1>
          {page.summary && <p>{page.summary}</p>}
        </div>
        <div className="documentation-page-actions">
          <button type="button" className="primary" onClick={() => setCitationOpen(true)}><BookMarked size={17} /> Cite this page</button>
          <a className="secondary button-like" href={page.versionedUrl}><Link2 size={17} /> Immutable version</a>
        </div>
      </header>
      <div className="documentation-version-strip">
        <div><Check size={17} /><span>Approved release</span><strong>{page.release.versionLabel}</strong><span>{formatDate(page.release.issuedAt)}</span></div>
        <div><span>Page ID</span><code>{page.mdvsId}</code></div>
        <a href={`/docs/releases/${page.release.versionLabel}`} onClick={(event) => { event.preventDefault(); openDocumentationPath(`/docs/releases/${page.release.versionLabel}`); }}>Release details <ChevronRight size={15} /></a>
      </div>
      {sourceContext && <SourceDocumentationTabs context={sourceContext} current={page.slug} version={route.version} />}
      <div className="documentation-reader-layout">
        <aside className={`documentation-toc ${tocOpen ? "open" : ""}`}>
          <button type="button" className="documentation-toc-toggle" aria-expanded={tocOpen} onClick={() => setTocOpen((value) => !value)}><Menu size={17} /> On this page</button>
          <nav aria-label="On this page">{page.headings.filter((heading) => heading.level >= 2 && heading.level <= 4).map((heading) => <a key={heading.id} className={`level-${heading.level}`} href={`#${heading.id}`} onClick={() => setTocOpen(false)}>{heading.label}</a>)}</nav>
        </aside>
        <main className="documentation-prose" dangerouslySetInnerHTML={{ __html: page.html }} />
        <aside className="documentation-context-card">
          <strong>Publication details</strong>
          <dl><dt>Version</dt><dd>{page.release.versionLabel}</dd><dt>Verified</dt><dd>{page.lastVerified ? formatDate(page.lastVerified) : "At release"}</dd><dt>License</dt><dd><a href={page.release.licenseUrl || "https://creativecommons.org/licenses/by/4.0/"} target="_blank" rel="noreferrer">{page.release.licenseSpdx}</a></dd></dl>
          <details><summary>Technical provenance</summary><dl><dt>Repository</dt><dd>{page.repositoryKey}</dd><dt>Source path</dt><dd><code>{page.sourcePath}</code></dd><dt>Commit</dt><dd><code>{page.sourceCommit}</code></dd><dt>Page hash</dt><dd><code>{page.contentSha256}</code></dd><dt>Corpus hash</dt><dd><code>{page.release.corpusSha256}</code></dd></dl></details>
          {sourceContext && <p className="documentation-source-caveat">This page documents how MODAVIS evaluates or processes a source. It does not replace citation of the upstream source record.</p>}
        </aside>
      </div>
      <nav className="documentation-adjacent" aria-label="Adjacent documentation pages">
        {page.navigation?.previous ? <a href={page.navigation.previous.url} onClick={(event) => { event.preventDefault(); openDocumentationPath(page.navigation!.previous!.url); }}><ArrowLeft size={17} /><span><small>Previous</small>{page.navigation.previous.title}</span></a> : <span />}
        {page.navigation?.next && <a href={page.navigation.next.url} onClick={(event) => { event.preventDefault(); openDocumentationPath(page.navigation!.next!.url); }}><span><small>Next</small>{page.navigation.next.title}</span><ArrowRight size={17} /></a>}
      </nav>
      {citationOpen && <DocumentationCitationDialog citation={page.citation} onClose={() => setCitationOpen(false)} />}
    </article>
  );
}

function DocumentationReleasePage({ version, isAdmin }: { version: string; isAdmin: boolean }) {
  const [release, setRelease] = useState<DocumentationRelease | null>(null);
  const [releases, setReleases] = useState<DocumentationRelease[]>([]);
  const [pages, setPages] = useState<DocumentationPageSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [citationOpen, setCitationOpen] = useState(false);
  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchDocumentationRelease(version), fetchAllDocumentationPages(version), fetchDocumentationReleases()])
      .then(([releaseValue, pageItems, releaseList]) => { if (!cancelled) { setRelease(releaseValue); setPages(pageItems); setReleases(releaseList.items); } })
      .catch((reason: Error) => { if (!cancelled) setError(reason.message); });
    return () => { cancelled = true; };
  }, [version]);
  useDocumentationMetadata(release ? { title: `${release.title} ${release.versionLabel} · MODAVIS`, description: release.citationText || "Immutable MODAVIS documentation release.", canonicalPath: release.pageUrl } : null);
  if (error) return <DocumentationEmpty title="Documentation release unavailable" detail={error} />;
  if (!release) return <div className="documentation-loading" role="status">Loading release…</div>;
  return (
    <section className="entity-section documentation-release-page">
      <nav className="documentation-breadcrumbs"><a href="/docs" onClick={(event) => { event.preventDefault(); openDocumentationPath("/docs"); }}>Documentation</a><ChevronRight size={14} /><span>Releases</span><ChevronRight size={14} /><span>{release.versionLabel}</span></nav>
      {release.notices?.map((notice) => <div key={String(notice.id)} className={`documentation-release-notice ${notice.type}`}><AlertCircle size={19} /><div><strong>{friendly(notice.type)}</strong><p>{notice.text}</p></div></div>)}
      <header className="documentation-page-header"><div><p className="eyebrow">Immutable documentation release</p><h1>{release.title}</h1><p>{release.citationText}</p></div><div className="documentation-page-actions"><button className="primary" onClick={() => setCitationOpen(true)}><BookMarked size={17} /> Cite release</button><a className="secondary button-like" href={`/api/docs/releases/${encodeURIComponent(version)}/artifact`}><Download size={17} /> Download bundle</a></div></header>
      <div className="documentation-release-fixity">
        <div><span>Version</span><strong>{release.versionLabel}</strong></div><div><span>Issued</span><strong>{formatDate(release.issuedAt)}</strong></div><div><span>Pages</span><strong>{release.pageCount ?? pages.length}</strong></div><div><span>License</span><strong>{release.licenseSpdx}</strong></div>
      </div>
      <section className="documentation-release-identifiers"><h3>Identifiers and fixity</h3><div><span>Release MDVS ID</span><code>{release.mdvsId}</code></div><div><span>DOI</span>{release.identifiers?.find((item) => item.type === "doi") ? <a href={release.identifiers.find((item) => item.type === "doi")?.uri || "#"}>{release.identifiers.find((item) => item.type === "doi")?.value}</a> : <strong>Registration pending</strong>}</div><div><span>Corpus SHA-256</span><code>{release.corpusSha256}</code></div>{release.artifacts?.map((artifact) => <div key={artifact.sha256}><span>{artifact.filename}</span><code>{artifact.sha256}</code></div>)}</section>
      <section><div className="documentation-section-heading"><div><p className="eyebrow">Contents</p><h3>{pages.length} pages</h3></div></div><div className="documentation-card-grid">{pages.map((page) => <DocumentationCard key={page.slug} page={page} />)}</div></section>
      {releases.length > 1 && <section className="documentation-release-history"><h3>Release history</h3>{releases.map((item) => <a key={item.versionLabel} className={item.versionLabel === version ? "active" : ""} href={`/docs/releases/${item.versionLabel}`} onClick={(event) => { event.preventDefault(); openDocumentationPath(`/docs/releases/${item.versionLabel}`); }}><span>{item.versionLabel}</span><span>{formatDate(item.issuedAt)}</span><span>{item.pageCount ?? 0} pages</span></a>)}</section>}
      {isAdmin && <DocumentationIdentifierPanel version={version} hasDoi={Boolean(release.identifiers?.some((item) => item.type === "doi"))} />}
      {citationOpen && release.citation && <DocumentationCitationDialog citation={release.citation} onClose={() => setCitationOpen(false)} />}
    </section>
  );
}

function DocumentationIdentifierPanel({ version, hasDoi }: { version: string; hasDoi: boolean }) {
  const [plan, setPlan] = useState<Record<string, unknown> | null>(null);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { fetchDocumentationIdentifierPlan(version).then(setPlan).catch((reason: Error) => setError(reason.message)); }, [version]);
  const blockers = Array.isArray(plan?.blockers) ? plan.blockers.map(String) : [];
  return <section className="documentation-identifier-admin"><header><div><p className="eyebrow">Admin identifier workflow</p><h3>DataCite DOI registration</h3></div><ShieldCheck size={22} /></header>{hasDoi ? <p className="notice">This release already has a registered DOI.</p> : <><div className="documentation-change-summary"><span>Provider: {String((plan?.provider as Record<string, unknown> | undefined)?.mode || "disabled")}</span><span>Governance: {blockers.includes("publication_governance_approval_required") ? "pending" : "approved"}</span></div>{blockers.length > 0 && <p className="notice">Registration blockers: {blockers.map(friendly).join(", ")}.</p>}<div className="documentation-citation-actions"><button type="button" onClick={() => registerDocumentationIdentifier(version, true).then(setResult).catch((reason: Error) => setError(reason.message))}>Run provider dry-run</button><button type="button" className="primary" disabled={!Boolean(plan?.canRegister)} onClick={() => registerDocumentationIdentifier(version, false).then(setResult).catch((reason: Error) => setError(reason.message))}>Register DOI</button></div></>}{result && <details open><summary>Provider result</summary><pre>{JSON.stringify(result, null, 2)}</pre></details>}{error && <p className="notice error">{error}</p>}</section>;
}

function DocumentationCitationDialog({ citation, onClose }: { citation: DocumentationCitation; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "Tab" && dialogRef.current) {
        const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), summary, [tabindex]:not([tabindex="-1"])'));
        if (!focusable.length) return;
        const first = focusable[0], last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [onClose]);
  const baseCitationUrl = citation.entityType === "documentation_release"
    ? `/api/docs/releases/${encodeURIComponent(citation.version)}/citation`
    : `/api/docs/v/${encodeURIComponent(citation.version)}/pages/${citation.versionedUrl.split(`/docs/v/${citation.version}/`)[1]}/citation`;
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section ref={dialogRef} className="modal-panel documentation-citation-dialog" role="dialog" aria-modal="true" aria-labelledby="documentation-citation-title" onMouseDown={(event) => event.stopPropagation()}>
        <header><div><p className="eyebrow">Professional citation</p><h2 id="documentation-citation-title">Cite this immutable version</h2></div><button ref={closeRef} type="button" className="icon-button" aria-label="Close citation" onClick={onClose}><X size={18} /></button></header>
        <blockquote>{citation.recommendedCitation}</blockquote>
        <div className="documentation-citation-actions"><CopyAction label="Copy citation" value={citation.recommendedCitation} /><CopyAction label="Copy version URL" value={citation.versionedUrl} /><CopyAction label="Copy MDVS ID" value={citation.mdvsId || ""} /></div>
        <div className="documentation-citation-downloads"><a href={`${baseCitationUrl}?format=bibtex`}><Download size={16} /> BibTeX</a><a href={`${baseCitationUrl}?format=ris`}><Download size={16} /> RIS</a><a href={`${baseCitationUrl}?format=csl-json`}><Download size={16} /> CSL-JSON</a></div>
        <dl><dt>Release</dt><dd>{citation.version}</dd><dt>Publisher</dt><dd>{citation.publisher}</dd><dt>License</dt><dd><a href={citation.licenseUrl || "#"}>{citation.licenseSpdx}</a></dd>{citation.doi && <><dt>DOI</dt><dd><a href={`https://doi.org/${citation.doi}`}>{citation.doi}</a></dd></>}<dt>Version URL</dt><dd><a href={citation.versionedUrl}>{citation.versionedUrl}</a></dd></dl>
        <details><summary>Technical fixity</summary><dl>{citation.contentSha256 && <><dt>Page SHA-256</dt><dd><code>{citation.contentSha256}</code></dd></>}{citation.corpusSha256 && <><dt>Corpus SHA-256</dt><dd><code>{citation.corpusSha256}</code></dd></>}</dl></details>
      </section>
    </div>
  );
}

function DocumentationPublisher({ latestRelease, onPublished }: { latestRelease: DocumentationRelease | null; onPublished: () => void }) {
  const [status, setStatus] = useState<Record<string, unknown> | null>(null);
  const [bundle, setBundle] = useState<File | null>(null);
  const [plan, setPlan] = useState<DocumentationReleasePlan | null>(() => {
    try { return JSON.parse(window.sessionStorage.getItem("modavis:documentation-release-plan") || "null"); }
    catch { return null; }
  });
  const [confirmation, setConfirmation] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { fetchDocumentationAdminStatus().then(setStatus).catch((reason: Error) => setError(reason.message)); }, []);
  const stage = (event: FormEvent) => {
    event.preventDefault();
    if (!bundle) return;
    setBusy(true); setError(null); setMessage("Validating committed documentation bundle…");
    stageDocumentationReleaseBundle(bundle).then((value) => {
      setPlan(value);
      if (value.ok) window.sessionStorage.setItem("modavis:documentation-release-plan", JSON.stringify(value));
      if (!value.ok) setError(value.detail || value.error || "Bundle validation failed.");
      else setMessage(`Ready to publish ${value.pageCount ?? 0} immutable pages.`);
    }).catch((reason: Error) => setError(reason.message)).finally(() => setBusy(false));
  };
  const publish = () => {
    if (!plan?.planId) return;
    setBusy(true); setError(null); setMessage("Persisting and verifying the immutable release artifact…");
    publishDocumentationRelease(plan.planId, confirmation).then((value) => {
      if (!value.ok) { setError(value.detail || value.error || "Publication failed."); return; }
      window.sessionStorage.removeItem("modavis:documentation-release-plan");
      setMessage("Documentation release published and fixity verified.");
      onPublished();
    }).catch((reason: Error) => setError(reason.message)).finally(() => setBusy(false));
  };
  return (
    <section className="documentation-publisher" aria-labelledby="documentation-publisher-title">
      <header><div><p className="eyebrow">Admin publication</p><h3 id="documentation-publisher-title">Publish an approved documentation release</h3><p>Bundles must contain committed Git content, complete citation metadata, deterministic hashes, and sanitized render output.</p></div><ShieldCheck size={25} /></header>
      <div className="documentation-publisher-status"><span>Schema: <strong>{String(status?.status || "checking")}</strong></span><span>Latest: <strong>{latestRelease?.versionLabel || "None"}</strong></span><span>DataCite: <strong>{String(status?.dataCiteMode || "disabled")}</strong></span></div>
      <form onSubmit={stage}><label><span>Documentation bundle (.zip)</span><input type="file" accept=".zip,application/zip" onChange={(event) => setBundle(event.target.files?.[0] ?? null)} /></label><button className="secondary" type="submit" disabled={!bundle || busy}><FileArchive size={17} /> Validate bundle</button></form>
      {plan?.ok && <div className="documentation-publication-plan"><div><strong>{plan.release?.versionLabel}</strong><span>{plan.pageCount} pages · {formatBytes(plan.byteSize ?? 0)}</span><code>{plan.archiveSha256}</code></div><div className="documentation-change-summary"><span>{plan.changes?.added.length ?? 0} added</span><span>{plan.changes?.changed.length ?? 0} changed</span><span>{plan.changes?.removed.length ?? 0} removed</span></div>{Boolean(plan.previewPages?.length) && <div className="documentation-preview-links"><strong>Review changed pages</strong>{plan.previewPages?.slice(0, 12).map((page) => <a key={page.slug} href={`/docs/preview/${plan.planId}/${page.slug}`} onClick={(event) => { event.preventDefault(); openDocumentationPath(`/docs/preview/${plan.planId}/${page.slug}`); }}><span>{page.title}</span><small>{friendly(page.change)}</small></a>)}</div>}<label><span>Enter the exact confirmation phrase</span><code>{plan.confirmationPhrase}</code><input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></label><button type="button" className="primary" disabled={busy || confirmation !== plan.confirmationPhrase} onClick={publish}><ShieldCheck size={17} /> Publish immutable release</button></div>}
      {message && <p className="notice">{message}</p>}{error && <p className="notice error" role="alert">{error}</p>}
    </section>
  );
}

function DocumentationPreviewPage({ route }: { route: Extract<DocumentationRoute, { kind: "preview" }> }) {
  const [page, setPage] = useState<DocumentationPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetchDocumentationPreview(route.planId, route.slug).then((value) => { if (!cancelled) setPage(value.page); }).catch((reason: Error) => { if (!cancelled) setError(reason.message); });
    const robots = ensureMeta("robots"); robots.content = "noindex,nofollow";
    return () => { cancelled = true; robots.remove(); };
  }, [route.planId, route.slug]);
  if (error) return <DocumentationEmpty title="Preview unavailable" detail={error} />;
  if (!page) return <div className="documentation-loading">Loading staged preview…</div>;
  return <article className="documentation-reader documentation-preview"><div className="documentation-preview-banner"><AlertCircle size={19} /><div><strong>Admin preview — not published or citable</strong><p>This content is staged for release {page.release.versionLabel}. Citation controls and search indexing are disabled.</p></div></div><button className="text-link-button" onClick={() => openDocumentationPath("/docs")}><ArrowLeft size={16} /> Back to publication plan</button><header className="documentation-page-header"><div><div className="documentation-card-meta"><span>{page.category}</span><span>{friendly(page.audience)}</span></div><h1>{page.title}</h1><p>{page.summary}</p></div></header><div className="documentation-reader-layout"><aside className="documentation-toc"><strong>On this page</strong><nav>{page.headings?.filter((heading) => heading.level >= 2).map((heading) => <a key={heading.id} href={`#${heading.id}`}>{heading.label}</a>)}</nav></aside><main className="documentation-prose" dangerouslySetInnerHTML={{ __html: page.html }} /><aside className="documentation-context-card"><strong>Staged provenance</strong><dl><dt>Commit</dt><dd><code>{page.sourceCommit}</code></dd><dt>Page hash</dt><dd><code>{page.contentSha256}</code></dd></dl></aside></div></article>;
}

function DocumentationMdvsResolver({ id }: { id: string }) {
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    fetch(`/api/id/${encodeURIComponent(id)}`, { credentials: "include" }).then(async (response) => {
      if (!response.ok) throw new Error("The documentation identifier could not be resolved.");
      return response.json();
    }).then((value) => { if (value.pageUrl) openDocumentationPath(value.pageUrl, true); else setError("No public documentation route is registered for this identifier."); }).catch((reason: Error) => setError(reason.message));
  }, [id]);
  return <div className="documentation-loading" role="status">{error || "Resolving documentation identifier…"}</div>;
}

function SourceDocumentationTabs({ context, current, version }: { context: { sourceKey: string; pageType: string }; current: string; version?: string }) {
  return <nav className="source-documentation-tabs" aria-label={`${context.sourceKey} documentation sections`}>{["overview", "analysis", "mapping"].map((type) => { const path = version ? `/docs/v/${version}/sources/${context.sourceKey}/${type}` : `/docs/sources/${context.sourceKey}/${type}`; return <a key={type} className={current.endsWith(`/${type}`) ? "active" : ""} href={path} onClick={(event) => { event.preventDefault(); openDocumentationPath(path); }}>{friendly(type)}</a>; })}</nav>;
}

function DocumentationReleaseBadge({ release }: { release: DocumentationRelease }) {
  return <a className="documentation-release-badge" href={`/docs/releases/${release.versionLabel}`} onClick={(event) => { event.preventDefault(); openDocumentationPath(`/docs/releases/${release.versionLabel}`); }}><BookOpen size={20} /><span><small>Latest approved release</small><strong>{release.versionLabel}</strong><small>{formatDate(release.issuedAt)}</small></span><ChevronRight size={17} /></a>;
}

function CopyAction({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return <button type="button" disabled={!value} onClick={() => navigator.clipboard.writeText(value).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1800); })}>{copied ? <Check size={16} /> : <Clipboard size={16} />}{copied ? "Copied" : label}</button>;
}

function DocumentationEmpty({ title, detail }: { title: string; detail: string }) {
  return <section className="documentation-empty"><BookOpen size={25} /><div><h3>{title}</h3><p>{detail}</p></div></section>;
}

function documentationRoute(): DocumentationRoute {
  const path = decodeURI(window.location.pathname.replace(/\/+$/, "") || "/");
  const mdvs = path.match(/^\/id\/(MDVS:DO(?:CU|CR|CA|CI):[^/]+)$/i);
  if (mdvs) return { kind: "mdvs", id: mdvs[1] };
  const release = path.match(/^\/docs\/releases\/([^/]+)$/);
  if (release) return { kind: "release", version: decodeURIComponent(release[1]) };
  const preview = path.match(/^\/docs\/preview\/(docs-plan-[0-9a-f]{24})\/(.+)$/);
  if (preview) return { kind: "preview", planId: preview[1], slug: preview[2] };
  const versioned = path.match(/^\/docs\/v\/([^/]+)\/(.+)$/);
  if (versioned) return { kind: "page", version: decodeURIComponent(versioned[1]), slug: versioned[2] };
  const page = path.match(/^\/docs\/(.+)$/);
  if (page) return { kind: "page", slug: page[1] };
  return { kind: "hub" };
}

function sourceDocumentationContext(slug: string): { sourceKey: string; pageType: string } | null {
  const match = slug.match(/^sources\/([^/]+)\/(overview|analysis|mapping)$/);
  return match ? { sourceKey: match[1], pageType: match[2] } : null;
}

function openDocumentationPath(path: string, replace = false) {
  if (replace) window.history.replaceState(null, "", path);
  else window.history.pushState(null, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
  window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
}

function updateDocumentationSearchRoute(query: string, category: string, audience: string, component: string) {
  const url = new URL(window.location.href);
  url.pathname = "/docs";
  setParam(url, "q", query.trim()); setParam(url, "category", category); setParam(url, "audience", audience); setParam(url, "component", component);
  window.history.replaceState(null, "", `${url.pathname}${url.search}`);
}

function setParam(url: URL, key: string, value: string) { if (value) url.searchParams.set(key, value); else url.searchParams.delete(key); }
function friendly(value: string) { return value.replace(/[_-]+/g, " ").replace(/^\w/, (letter) => letter.toUpperCase()); }
function formatDate(value: string) { const date = new Date(value); return Number.isNaN(date.valueOf()) ? value : new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date); }
function formatBytes(value: number) { if (value < 1024) return `${value} B`; if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`; return `${(value / (1024 * 1024)).toFixed(1)} MB`; }

async function fetchAllDocumentationPages(version: string): Promise<DocumentationPageSummary[]> {
  const items: DocumentationPageSummary[] = [];
  let offset = 0;
  do {
    const page = await fetchDocumentationPages({ release: version, limit: 100, offset });
    items.push(...page.items);
    if (!page.hasMore) break;
    offset += 100;
  } while (offset < 10_000);
  return items;
}

function useDocumentationMetadata(metadata: { title: string; description: string; canonicalPath: string; jsonLd?: Record<string, unknown> } | null) {
  const previous = useRef(document.title);
  useEffect(() => {
    if (!metadata) return;
    document.title = metadata.title;
    const description = ensureMeta("description"); description.content = metadata.description;
    const ogTitle = ensureMeta("og:title", true); ogTitle.content = metadata.title;
    const ogDescription = ensureMeta("og:description", true); ogDescription.content = metadata.description;
    const canonical = ensureCanonical(); canonical.href = new URL(metadata.canonicalPath, window.location.origin).toString();
    let script = document.getElementById("modavis-documentation-jsonld") as HTMLScriptElement | null;
    if (metadata.jsonLd) { if (!script) { script = document.createElement("script"); script.id = "modavis-documentation-jsonld"; script.type = "application/ld+json"; document.head.appendChild(script); } script.text = JSON.stringify(metadata.jsonLd); }
    return () => { document.title = previous.current; script?.remove(); };
  }, [metadata?.title, metadata?.description, metadata?.canonicalPath, JSON.stringify(metadata?.jsonLd ?? null)]);
}

function ensureMeta(name: string, property = false): HTMLMetaElement { const selector = property ? `meta[property="${name}"]` : `meta[name="${name}"]`; let element = document.head.querySelector(selector) as HTMLMetaElement | null; if (!element) { element = document.createElement("meta"); element.setAttribute(property ? "property" : "name", name); document.head.appendChild(element); } return element; }
function ensureCanonical(): HTMLLinkElement { let element = document.head.querySelector('link[rel="canonical"]') as HTMLLinkElement | null; if (!element) { element = document.createElement("link"); element.rel = "canonical"; document.head.appendChild(element); } return element; }
