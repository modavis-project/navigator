import { useEffect, useId, useRef, useState, type FormEvent, type MouseEvent } from "react";
import { publicGetJson } from "./api";
import { LoadingContent } from "./LoadingContent";
import type { VocabularyConcept, VocabularyMapping, VocabularyScheme } from "./api";
import { PublicReadError } from "./requestCache";
import "./vocabularyRecords.css";
import { SaveVocabularyTerm } from "./SaveVocabularyTerm";
import { ActivityVocabularyInput, activityMatches, useActivityVocabularyLookup } from "./activityVocabularySearch";
import { OtherVocabularies } from "./vocabularyEdition";
import { useUiLocale } from "./uiLocale";

export interface PublicVocabularyRecordsProps {
  schemeId?: string;
  conceptId?: string;
  expectedSchemeId?: string;
  onBack?: () => void;
}

export interface VocabularyReadingQuery {
  q: string;
  offset: number;
  limit: number;
  language?: string;
  snapshot?: string;
}

type EditionConcept = VocabularyConcept & {
  editionLabels?: Record<string, string>;
  editionDefinitions?: Record<string, string>;
  editionScopeNotes?: Record<string, string>;
  readerHref?: string;
  termUri?: string;
  otherVocabularies?: Parameters<typeof OtherVocabularies>[0]["links"];
};

interface ConceptList {
  items: EditionConcept[];
  total: number;
  offset: number;
  limit: number;
  contentSha256?: string | null;
  languages?: string[];
  languageFilterScope?: string;
}

export type VocabularyRecordData =
  | { kind: "scheme"; scheme: VocabularyScheme; list: ConceptList; contentSha256?: string | null }
  | { kind: "concept"; concept: EditionConcept; contentSha256?: string | null };

interface VocabularySnapshot {
  citation: string;
  contentSha256: string;
  formalRelease: boolean;
  scope: string;
  provenance?: Record<string, unknown>;
}

type ReadJson = <T>(url: string, signal?: AbortSignal) => Promise<T>;
type ReadingFailure = { message: string; status?: number };
const number = (value: number) => value.toLocaleString();
const words = (value: string) => value.replace(/_/g, " ");
const schemePath = (code: string) => `/vocab/${encodeURIComponent(code)}`;
const conceptPath = (concept: VocabularyConcept) => concept.scheme?.code
  ? `${schemePath(concept.scheme.code)}/concepts/${encodeURIComponent(concept.code)}`
  : `/vocab/concepts/${encodeURIComponent(concept.code)}`;

/** Recognized view parameters fail explicitly rather than silently losing a pin. */
export function parseVocabularyReadingQuery(search: string): VocabularyReadingQuery {
  const params = new URLSearchParams(search);
  const allowed = new Set(["q", "offset", "limit", "language_code", "snapshot"]);
  for (const key of params.keys()) {
    if (!allowed.has(key)) throw new PublicReadError(`Unsupported vocabulary view parameter: ${key.slice(0, 60)}`, 400);
    if (params.getAll(key).length !== 1) throw new PublicReadError(`Repeated vocabulary view parameter: ${key}`, 400);
  }
  const q = params.get("q") ?? "";
  if (q.length > 200 || /[\u0000-\u001f\u007f]/.test(q)) throw new PublicReadError("Search text must contain at most 200 characters and no control characters.", 400);
  const integer = (key: string, fallback: number, min: number, max: number) => {
    const raw = params.get(key);
    if (raw === null) return fallback;
    if (!/^\d+$/.test(raw) || !Number.isSafeInteger(Number(raw)) || Number(raw) < min || Number(raw) > max)
      throw new PublicReadError(`${key === "limit" ? "Page size" : "Page offset"} must be an integer from ${min} to ${max}.`, 400);
    return Number(raw);
  };
  const language = params.get("language_code");
  if (language !== null && !/^[A-Za-z0-9-]{1,35}$/.test(language)) throw new PublicReadError("The recorded-label language is invalid.", 400);
  const snapshot = params.get("snapshot");
  if (snapshot !== null && !/^[a-f0-9]{64}$/.test(snapshot)) throw new PublicReadError("The vocabulary snapshot must be an exact SHA-256 value.", 400);
  return { q, offset: integer("offset", 0, 0, 100000), limit: integer("limit", 30, 1, 500),
    ...(language ? { language } : {}), ...(snapshot ? { snapshot } : {}) };
}

export function vocabularyReadingHref(path: string, query: VocabularyReadingQuery, patch: Partial<VocabularyReadingQuery> = {}): string {
  const value = { ...query, ...patch };
  const params = new URLSearchParams();
  if (value.q) params.set("q", value.q);
  if (value.offset) params.set("offset", String(value.offset));
  if (value.limit !== 30) params.set("limit", String(value.limit));
  if (value.language) params.set("language_code", value.language);
  if (value.snapshot) params.set("snapshot", value.snapshot);
  return `${path}${params.size ? `?${params}` : ""}`;
}

function pinned(url: string, snapshot?: string | null) {
  return snapshot ? `${url}${url.includes("?") ? "&" : "?"}snapshot=${encodeURIComponent(snapshot)}` : url;
}

export function safeVocabularyHref(value: unknown): string | null {
  if (typeof value !== "string" || /[\u0000-\u0020\u007f]/.test(value)) return null;
  if (value.startsWith("/") && !value.startsWith("//") && !value.includes("\\")) return value;
  try { const url = new URL(value); return ["http:", "https:"].includes(url.protocol) ? url.href : null; } catch { return null; }
}

export async function loadVocabularyRecord(props: PublicVocabularyRecordsProps, query: VocabularyReadingQuery,
  signal: AbortSignal, get: ReadJson = publicGetJson): Promise<VocabularyRecordData> {
  const active = () => { if (signal.aborted) throw new DOMException("Request cancelled", "AbortError"); };
  if (props.conceptId) {
    const params = new URLSearchParams();
    if (props.expectedSchemeId) params.set("scheme_code", props.expectedSchemeId);
    if (query.snapshot) params.set("snapshot", query.snapshot);
    const response = await get<{ concept: EditionConcept; contentSha256?: string | null }>(
      `/api/vocab/concepts/${encodeURIComponent(props.conceptId)}${params.size ? `?${params}` : ""}`, signal);
    active();
    if (!response.concept || (props.expectedSchemeId && response.concept.scheme?.code !== props.expectedSchemeId))
      throw new PublicReadError("This record is not included in the requested vocabulary.", 404);
    if (query.snapshot && response.contentSha256 !== query.snapshot)
      throw new PublicReadError("The requested vocabulary snapshot is unavailable for this record.", 409);
    return { kind: "concept", ...response };
  }
  if (!props.schemeId) throw new PublicReadError("No vocabulary was selected.", 400);
  const schemes = await get<{ items: VocabularyScheme[] }>("/api/vocab/schemes", signal);
  active();
  const scheme = schemes.items.find(item => item.code === props.schemeId || item.mdvsId === props.schemeId);
  if (!scheme) throw new PublicReadError("This vocabulary is not included in the current dataset.", 404);
  if (scheme.recordKind === "schema_categories" && query.snapshot)
    throw new PublicReadError("Schema categories do not have a governed vocabulary snapshot.", 400);
  const params = new URLSearchParams({ scheme_code: scheme.code, q: query.q, limit: String(query.limit), offset: String(query.offset) });
  if (query.language) params.set("language", query.language);
  if (query.snapshot) params.set("snapshot", query.snapshot);
  const list = await get<ConceptList>(`/api/vocab/concepts?${params}`, signal);
  active();
  if (query.snapshot && list.contentSha256 !== query.snapshot)
    throw new PublicReadError("The requested vocabulary snapshot is unavailable for this scheme.", 409);
  return { kind: "scheme", scheme, list, contentSha256: list.contentSha256 };
}

function useReading<T>(key: string | null, read: (signal: AbortSignal) => Promise<T>) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{ key: string | null; data?: T; error?: ReadingFailure }>({ key: null });
  useEffect(() => {
    if (!key) return;
    const controller = new AbortController();
    setState({ key });
    read(controller.signal).then(data => {
      if (!controller.signal.aborted) setState({ key, data });
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) setState({ key, error: {
        message: error instanceof Error ? error.message : "The record could not be loaded. Please try again.",
        status: error instanceof PublicReadError ? error.status : undefined,
      } });
    });
    return () => controller.abort();
    // The key includes every route/query input read by this request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, attempt]);
  return { ...(state.key === key ? state : {}), retry: () => setAttempt(value => value + 1) };
}

function followQuery(event: MouseEvent<HTMLAnchorElement>) {
  if (event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  updateLocation(event.currentTarget.getAttribute("href") || window.location.pathname);
}

function updateLocation(href: string) {
  window.history.pushState({ ...window.history.state, vocabularyResultsFocus: true }, "", href);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

function CopyValue({ label, value }: { label: string; value: string }) {
  const [message, setMessage] = useState("");
  return <span className="vr-copy"><button type="button" className="secondary" onClick={async () => {
    try { await navigator.clipboard.writeText(value); setMessage("Copied."); }
    catch { setMessage("Copy unavailable. Select the displayed text to copy it."); }
  }}>{label}</button><span role="status">{message}</span></span>;
}

export function VocabularyReadingFailure({ error, path, onRetry }: { error: ReadingFailure; path: string; onRetry: () => void }) {
  const ref = useRef<HTMLElement>(null);
  const id = useId();
  useEffect(() => { ref.current?.focus({ preventScroll: true }); }, [error.message]);
  const refusal = error.status === 400 || error.status === 409;
  return <section className="vocabulary-reader vr-failure" ref={ref} role="alert" tabIndex={-1} aria-labelledby={id}>
    <p className="eyebrow">Vocabulary reading</p><h1 id={id}>{refusal ? "This vocabulary view is unavailable" : error.status === 404 ? "Vocabulary record not found" : "Vocabulary could not be loaded"}</h1>
    <p>{error.message}</p>
    {refusal && <p>The requested view has been preserved in the address bar. Open the current record separately to change its filters or snapshot.</p>}
    <div className="vr-actions">{!refusal && error.status !== 404 && <button type="button" className="secondary" onClick={onRetry}>Try again</button>}
      {refusal && <a href={path}>Open the current record without view parameters</a>}<a href="/vocab">Browse vocabularies</a></div>
  </section>;
}

function SnapshotAccess({ scheme, snapshot, reference }: { scheme: string; snapshot?: string | null; reference?: string }) {
  const [open, setOpen] = useState(false);
  const url = pinned(`/api/vocab/snapshots/${encodeURIComponent(scheme)}`, snapshot);
  const result = useReading<VocabularySnapshot>(open ? url : null, signal => publicGetJson(url, signal));
  const hash = result.data?.contentSha256 || snapshot;
  return <details className="vr-disclosure" onToggle={event => setOpen(event.currentTarget.open)}>
    <summary>Cite and download this bundled snapshot</summary>
    <div className="vr-disclosure-body"><p>Definitions and labels are bundled with the selected POD. This is not a separately published vocabulary release.</p>
      {open && !result.data && !result.error && <LoadingContent label="Loading citation and checksum…" />}
      {result.error && <div role="alert"><p>{result.error.message}</p>{![400, 409].includes(result.error.status || 0) && <button type="button" className="secondary" onClick={result.retry}>Retry snapshot metadata</button>}</div>}
      {reference && <div className="vr-citation"><h3>Record reference</h3><p>{reference}</p><CopyValue label="Copy record reference" value={reference} /></div>}
      {result.data && <div className="vr-citation"><h3>Snapshot citation</h3><p>{result.data.citation}</p><CopyValue label="Copy snapshot citation" value={result.data.citation} /><p>{result.data.scope}</p></div>}
      {hash && <p className="vr-checksum">Content SHA-256 <code>{hash}</code></p>}
      <div className="vr-actions"><a href={url}>Metadata JSON</a>{["json", "csv", "ttl", "jsonld"].map(format => <a key={format} href={pinned(`/api/vocab/snapshots/${encodeURIComponent(scheme)}.${format}`, hash)} download>{format === "ttl" ? "SKOS / Turtle" : format.toUpperCase()}</a>)}</div>
      {result.data?.provenance && <dl className="vr-facts">{Object.entries(result.data.provenance).map(([key, value]) => <div key={key}><dt>{key.replace(/([A-Z])/g, " $1")}</dt><dd>{Array.isArray(value) ? value.join(", ") : typeof value === "string" ? value : JSON.stringify(value)}</dd></div>)}</dl>}
    </div>
  </details>;
}

type ActorCategory = Pick<EditionConcept, "code" | "preferredLabel" | "definition">;
const ACTOR_REFERENCE = "/vocab/modavis_entity_types";

function ActorCategoryReference({ categories, query, version, selected, list, resultsId }: {
  categories: ActorCategory[]; query: VocabularyReadingQuery; version?: string | null;
  selected?: EditionConcept; list?: ConceptList; resultsId?: string;
}) {
  const { t } = useUiLocale();
  const headingId = useId();
  const overview = t("vocab.actor.title", "Person and organisation records", "Datensätze zu Personen und Organisationen");
  const content = (category: ActorCategory) => category.code === "person" ? {
    name: t("vocab.actor.person", "Person", "Person"),
    description: t("vocab.actor.personNote", "A record about an individual, such as an organ builder or performer.",
      "Ein Datensatz zu einer einzelnen Person, etwa aus dem Orgelbau oder der Musikpraxis."),
    browse: t("vocab.actor.people", "Browse people", "Personen ansehen"),
  } : {
    name: t("vocab.actor.organisation", "Organisation", "Organisation"),
    description: t("vocab.actor.organisationNote", "A record about an organisation, company or workshop.",
      "Ein Datensatz zu einer Organisation, einem Unternehmen oder einer Werkstatt."),
    browse: t("vocab.actor.organisations", "Browse organisations", "Organisationen ansehen"),
  };
  const detail = selected && content(selected);
  const view = vocabularyReadingHref(selected ? conceptPath(selected) : ACTOR_REFERENCE, query);
  return <article className="vocabulary-reader vr-actor-reference" aria-labelledby={headingId}>
    <nav className="vr-breadcrumbs" aria-label={t("vocab.actor.breadcrumb", "Breadcrumb", "Brotkrumennavigation")}>
      <a href="/vocab">{t("vocab.actor.vocabularies", "Vocabularies", "Vokabulare")}</a>
      {detail ? <><a href={ACTOR_REFERENCE}>{overview}</a><span aria-current="page">{detail.name}</span></>
        : <span aria-current="page">{t("vocab.actor.reference", "Catalogue reference", "Katalogreferenz")}</span>}
    </nav>
    <header className="vr-header"><div>
      <p className="eyebrow">{t("vocab.actor.reference", "Catalogue reference", "Katalogreferenz")}</p>
      <h1 id={headingId}>{detail?.name || overview}</h1>
      <p>{detail?.description || t("vocab.actor.intro",
        "These two record types describe who is represented in Navigator’s actor catalogue.",
        "Diese beiden Datensatzarten zeigen, wer im Akteurskatalog des Navigators erfasst ist.")}</p>
    </div>{version && <div className="vr-version"><strong>POD {version}</strong></div>}</header>
    {selected && detail ? <div className="vr-actions">
      <a className="vr-catalogue-link" href={`/persons?entity_class=${encodeURIComponent(selected.code)}`}>{detail.browse}</a>
      <SaveVocabularyTerm contextKey={view} label="Save category" />
    </div> : <section id={resultsId} tabIndex={-1} className="vr-results" aria-label={overview}>
      {categories.length ? <ul className="vr-category-cards">{categories.map(category => {
        const type = content(category);
        const key = encodeURIComponent(category.code);
        return <li key={category.code}>
          <h2>{type.name}</h2>
          <p>{type.description}</p>
          <div className="vr-actions">
            <a className="vr-catalogue-link" href={`/persons?entity_class=${key}`}>{type.browse}</a>
            <a href={`${ACTOR_REFERENCE}/concepts/${key}`}>
              {t("vocab.actor.categoryDetail", "{name} record type", "Datensatzart „{name}“", { name: type.name })}
            </a>
          </div>
        </li>;
      })}</ul> : <p>{t("vocab.actor.empty", "No record types match this view.", "In dieser Ansicht wurden keine passenden Datensatzarten gefunden.")}</p>}
      {list && (query.q || query.language || list.offset > 0 || list.limit < list.total) &&
        <p><a href={ACTOR_REFERENCE} onClick={followQuery}>{t("vocab.actor.showAll", "Show both record types", "Beide Datensatzarten anzeigen")}</a></p>}
    </section>}
    <details className="vr-disclosure">
      <summary>{t("vocab.actor.data", "Schema and API details", "Schema- und API-Details")}</summary>
      <div className="vr-disclosure-body">
        <dl className="vr-facts"><div><dt>{t("vocab.actor.code", "Schema code", "Schemacode")}</dt><dd><code>modavis_entity_types</code></dd></div>
          {selected && <div><dt>{t("vocab.actor.category", "Type code", "Typcode")}</dt><dd><code>{selected.code}</code></dd></div>}
        </dl>
        <div className="vr-actions">
          <a href={selected
            ? `/api/vocab/concepts/${encodeURIComponent(selected.code)}?scheme_code=modavis_entity_types`
            : "/api/vocab/concepts?scheme_code=modavis_entity_types"}>{t("vocab.actor.json", "View JSON", "JSON ansehen")}</a>
          {selected ? <CopyValue label={t("vocab.actor.copyCode", "Copy category code", "Kategoriecode kopieren")} value={selected.code} />
            : <SaveVocabularyTerm contextKey={view} label="Save catalogue reference" />}
        </div>
      </div>
    </details>
  </article>;
}

export function VocabularySchemeReading({ scheme, list, query, contentSha256 }: {
  scheme: VocabularyScheme; list: ConceptList; query: VocabularyReadingQuery; contentSha256?: string | null;
}) {
  const [draft, setDraft] = useState(query.q);
  useEffect(() => setDraft(query.q), [query.q]);
  const titleId = useId();
  const resultsId = useId();
  useEffect(() => {
    if (window.history.state?.vocabularyResultsFocus) {
      document.getElementById(resultsId)?.focus({ preventScroll: true });
      window.history.replaceState({ ...window.history.state, vocabularyResultsFocus: false }, "");
    }
  }, [list, resultsId]);
  const { locale, t } = useUiLocale();
  const isActivity = scheme.code === "modavis_activity_types";
  const path = isActivity ? "/vocab/activity-types" : scheme.code === "modavis_person_terminology" ? "/vocab/person-terms" : schemePath(scheme.code);
  const matches = useActivityVocabularyLookup(isActivity && Boolean(query.q), contentSha256 || query.snapshot);
  const additionalMatches = activityMatches(matches?.data, query.q, locale)
    .filter(match => match.kind === "wording" || !list.items.some(term => term.preferredLabel === match.title || term.editionLabels?.de === match.title))
    .slice(0, 8);
  const scope = scheme.recordKind === "schema_categories";
  const bound = { ...query, snapshot: contentSha256 || query.snapshot };
  if (scope && scheme.code === "modavis_entity_types") return <ActorCategoryReference categories={list.items}
    query={query} version={scheme.version} list={list} resultsId={resultsId} />;
  const total = scope ? scheme.categoryCount : scheme.conceptCount;
  const unit = scope ? "schema categories" : "governed concepts";
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    updateLocation(vocabularyReadingHref(path, bound, { q: draft, offset: 0 }));
  };
  return <article className="vocabulary-reader" aria-labelledby={titleId}>
    <nav className="vr-breadcrumbs" aria-label="Breadcrumb"><a href="/vocab">Vocabularies</a><span aria-current="page">{scope ? "Schema categories" : "Controlled vocabulary"}</span></nav>
    <header className="vr-header"><div><p className="eyebrow">{scope ? "Public schema" : "Controlled vocabulary"}</p><h1 id={titleId}>{scheme.name || scheme.code}</h1><p>{scheme.description || (scope ? "Categories used to organize public records." : "Recorded concepts and definitions in the selected POD.")}</p></div>
      <div className="vr-version"><span>Recorded version</span><strong>{scheme.version || "Not supplied"}</strong>{typeof total === "number" && <span>{number(total)} {unit} · whole {scope ? "category set" : "scheme"}</span>}</div></header>
    <form className="vr-search" role="search" aria-label={`Search ${scope ? "schema categories" : "this vocabulary"}`} method="get" action={path} onSubmit={submit}>
      {isActivity ? <ActivityVocabularyInput name="q" value={draft} onChange={setDraft} snapshot={bound.snapshot}
        label={t("vocab.reader.findTerm", "Find a concept or source term", "Begriff oder Quellenwortlaut suchen")}
        placeholder={t("vocab.reader.matchFields", "Search labels, definitions and source wording", "Benennungen, Definitionen und Quellenwortlaut durchsuchen")} />
        : <label><span>Find a {scope ? "category" : "concept"}</span><input name="q" type="search" value={draft} maxLength={200} onChange={event => setDraft(event.target.value)} placeholder="Search labels, codes and definitions" /></label>}
      <button type="submit">Search</button>
      {(query.q || query.language) && <a href={vocabularyReadingHref(path, bound, { q: "", language: undefined, offset: 0 })} onClick={followQuery}>Clear filters</a>}
    </form>
    <div className="vr-actions"><SaveVocabularyTerm contextKey={vocabularyReadingHref(path, bound)} label="Save vocabulary view" /></div>
    <div className="vr-list-controls">{(list.languages?.length || query.language) ? <label>Recorded label language <select value={query.language || ""} onChange={event => updateLocation(vocabularyReadingHref(path, bound, { language: event.target.value || undefined, offset: 0 }))}><option value="">All recorded languages</option>{[...new Set([...(list.languages || []), ...(query.language ? [query.language] : [])])].map(code => <option key={code} value={code}>{code}</option>)}</select></label> : null}
      <label>Per page <select value={query.limit} onChange={event => updateLocation(vocabularyReadingHref(path, bound, { limit: Number(event.target.value), offset: 0 }))}>{[...new Set([15, 30, 60, 100, query.limit])].sort((a, b) => a - b).map(value => <option key={value} value={value}>{value}</option>)}</select></label></div>
    {query.language && <p className="vr-note">{list.languageFilterScope || "Shows concepts with a retained label in this language. Display titles are not new translations."}</p>}
    {additionalMatches.length > 0 && <section className="vr-linked-terms">
      <h2>{t("vocab.reader.additionalMatches", "Matches in the bilingual edition and source wording", "Treffer in der zweisprachigen Ausgabe und im Quellenwortlaut")}</h2>
      <ul className="vr-record-list">{additionalMatches.map(match => <li key={match.href}><article>
        <h3><a href={match.href}>{match.title}</a></h3>
        <p>{match.kind === "concept" ? "Controlled concept" : "Recorded source wording"}
          {match.subtitle && ` · ${match.subtitle}`}{match.count != null && ` · ${number(match.count)} event assertions`}</p>
      </article></li>)}</ul>
    </section>}
    <section id={resultsId} tabIndex={-1} className="vr-results" aria-labelledby={`${resultsId}-title`}>
      <div className="vr-section-title"><h2 id={`${resultsId}-title`}>{scope ? "Categories" : "Concepts"}</h2><p role="status">{number(list.total)} matching {unit}{list.items.length > 0 && ` · ${number(list.offset + 1)}–${number(list.offset + list.items.length)} shown`}</p></div>
      {list.items.length === 0 ? <div className="vr-empty"><h3>{list.total > 0 ? "This page is beyond the results" : `No ${scope ? "categories" : "concepts"} match this view`}</h3><p>{list.total > 0 ? "Return to the first page while keeping your search and snapshot." : "Try a shorter label or a concept code, or clear the filters."}</p><a href={vocabularyReadingHref(path, bound, list.total > 0 ? { offset: 0 } : { q: "", language: undefined, offset: 0 })} onClick={followQuery}>{list.total > 0 ? "Go to first page" : "Show all records in this scheme"}</a></div>
        : <ol className="vr-record-list" start={list.offset + 1}>{list.items.map(concept => <li key={concept.mdvsId || concept.code}><article><div className="vr-record-title"><h3><a href={pinned(concept.readerHref || conceptPath(concept), bound.snapshot)}>{concept.editionLabels?.[locale] || concept.preferredLabel || concept.code}</a></h3><code>{concept.code}</code></div><p className="vr-definition">{concept.editionDefinitions?.[locale] || concept.definition || "No definition is included in this snapshot."}</p><div className="vr-label-summary">{[...new Set((concept.labels || []).map(label => label.languageCode).filter(Boolean))].map(code => <span key={code}>{code}</span>)}{concept.recordKind === "schema_category" && <span>Schema category</span>}</div></article></li>)}</ol>}
      {(list.offset > 0 || list.offset + list.items.length < list.total) && <nav className="vr-pagination" aria-label="Vocabulary result pages">{list.offset > 0 && <a rel="prev" href={vocabularyReadingHref(path, bound, { offset: Math.max(0, list.offset - list.limit) })} onClick={followQuery}>Previous page</a>}{list.offset + list.limit < list.total && <a rel="next" href={vocabularyReadingHref(path, bound, { offset: list.offset + list.limit })} onClick={followQuery}>Next page</a>}</nav>}
    </section>
    <details className="vr-disclosure"><summary>Coverage and vocabulary identity</summary><div className="vr-disclosure-body"><dl className="vr-facts"><div><dt>Scheme code</dt><dd><code>{scheme.code}</code></dd></div>{scheme.mdvsId && <div><dt>MDVS identifier</dt><dd><code>{scheme.mdvsId}</code></dd></div>}</dl><p>{scope ? "These categories organize the public schema. They have no independently governed concept identity or vocabulary snapshot." : scheme.mappingCount == null ? "Source-term registry mapping totals are not included. This does not establish that no mappings exist." : `${number(scheme.mappingCount)} registry mappings have qualified occurrence evidence in the public subset. This does not count all authoritative mappings.`}</p></div></details>
    {!scope && <p><a href="/vocab/editions/modavis">Download the bilingual vocabulary edition</a></p>}
    {!scope && scheme.snapshot && <SnapshotAccess scheme={scheme.code} snapshot={contentSha256 || query.snapshot} />}
  </article>;
}

function SourceMapping({ mapping }: { mapping: VocabularyMapping }) {
  const term = mapping.sourceTerm;
  const id = term?.mdvsId;
  const href = id == null ? null : `/vocab/source-terms/${encodeURIComponent(String(id))}`;
  const label = term?.rawTerm || term?.normalizedTerm || "Unnamed source term";
  return <article className="vr-evidence-item"><h3>{href ? <a href={href}>{label}</a> : label}</h3><p>{mapping.mappingKind ? `${words(mapping.mappingKind)} relation` : "Mapping relation not recorded"}{mapping.confidence != null && ` · ${Math.round(mapping.confidence * 100)}% recorded confidence`}</p>{mapping.scopeNote && <p>{mapping.scopeNote}</p>}<dl className="vr-facts"><div><dt>Source</dt><dd>{term?.sourceKey || "Not recorded"}</dd></div><div><dt>Source field</dt><dd>{[term?.sourceTable, term?.sourceField].filter(Boolean).join(".") || "Not recorded"}</dd></div><div><dt>Term class</dt><dd>{term?.termClass || "Not recorded"}</dd></div><div><dt>Context</dt><dd>{mapping.context?.code || "Not recorded"}</dd></div><div><dt>Language</dt><dd>{term?.languageCode || "Not recorded"}</dd></div></dl>{mapping.reviewStatus && <p>Recorded review status: {mapping.reviewStatus}</p>}{mapping.version && <p>Mapping version: {mapping.version}</p>}{term?.scopeNote && <p>Source-term scope: {term.scopeNote}</p>}{mapping.mdvsId && <code>{mapping.mdvsId}</code>}</article>;
}

export function VocabularyConceptReading({ concept, query, contentSha256 }: { concept: EditionConcept; query: VocabularyReadingQuery; contentSha256?: string | null }) {
  const titleId = useId();
  const { locale, t } = useUiLocale();
  const scope = concept.recordKind === "schema_category";
  const scheme = concept.scheme?.code || "";
  if (scope && scheme === "modavis_entity_types") return <ActorCategoryReference categories={[]}
    query={query} version={concept.datasetVersion || concept.scheme?.version} selected={concept} />;

  const bound = { ...query, snapshot: contentSha256 || query.snapshot };
  const path = conceptPath(concept);
  const href = pinned(path, bound.snapshot);
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const pageUrl = `${origin}${href}`;
  const browseUrl = `${origin}${concept.readerHref || path}`;
  const title = concept.editionLabels?.[locale] || concept.preferredLabel || concept.code;
  const labels = concept.labels || [];
  const languageCount = new Set(labels.map(label => label.languageCode).filter(Boolean)).size;
  const mappings = concept.sourceTermMappings || [];
  const usage = concept.publicEventUsage;
  const reverse = concept.reverseLinkedGroups || [];
  const external = concept.externalMappings || [];
  const status = concept.status?.label || concept.status?.code || "Included in the selected snapshot";
  const reference = `${concept.preferredLabel || concept.code}. ${concept.scheme?.name || scheme}${concept.scheme?.version ? `, recorded version ${concept.scheme.version}` : ""}. MODAVIS Navigator. ${pageUrl}${contentSha256 ? `. Vocabulary content SHA-256: ${contentSha256}` : ""}`;
  const apiParams = new URLSearchParams();
  if (scheme) apiParams.set("scheme_code", scheme);
  if (bound.snapshot) apiParams.set("snapshot", bound.snapshot);
  const apiHref = `/api/vocab/concepts/${encodeURIComponent(concept.code)}${apiParams.size ? `?${apiParams}` : ""}`;
  return <article className="vocabulary-reader" aria-labelledby={titleId}>
    <nav className="vr-breadcrumbs" aria-label="Breadcrumb"><a href="/vocab">Vocabularies</a>{scheme && <a href={vocabularyReadingHref(schemePath(scheme), bound)}>{concept.scheme?.name || scheme}</a>}<span aria-current="page">{concept.preferredLabel || concept.code}</span></nav>
    <header className="vr-header"><div><p className="eyebrow">{scope ? "Schema category" : "Controlled vocabulary concept"}</p><h1 id={titleId}>{title}</h1><p className="vr-lifecycle">{status}{concept.datasetVersion && ` · POD ${concept.datasetVersion}`}</p></div><div className="vr-version"><span>{scope ? "Schema version" : "Recorded vocabulary version"}</span><strong>{concept.scheme?.version || "Not supplied"}</strong></div></header>
    <section className="vr-definition-section"><h2>{t("vocab.reader.definition", "Definition", "Definition")}</h2><p className="vr-definition">{concept.editionDefinitions?.[locale] || concept.definition || "No definition is included in this snapshot."}</p>
      {concept.editionLabels?.de && concept.editionDefinitions?.de && locale !== "de" && <p lang="de"><strong>{concept.editionLabels.de}</strong> · {concept.editionDefinitions.de}</p>}
      {concept.editionLabels?.en && concept.editionDefinitions?.en && locale === "de" && <p lang="en"><strong>{concept.editionLabels.en}</strong> · {concept.editionDefinitions.en}</p>}
      {concept.editionScopeNotes && <details className="vr-disclosure"><summary>{t("vocab.reader.scope", "Scope note", "Hinweis zum Gebrauch")}</summary>
        <p lang={locale}>{concept.editionScopeNotes[locale] || concept.editionScopeNotes.en}</p>
        {locale !== "de" && concept.editionScopeNotes.de && <p lang="de">{concept.editionScopeNotes.de}</p>}
      </details>}
    </section>
    {usage && <section className="vr-usage-summary">
      <h2>{t("vocab.reader.linkedEvents", "Linked public events", "Verknüpfte öffentliche Ereignisse")}</h2>
      <p>{t("vocab.reader.eventAssertionCount",
        "{count, plural, =0 {No event assertions are linked to this concept in POD {version}.} one {# mapped event assertion in POD {version}.} other {# mapped event assertions in POD {version}.}}",
        "{count, plural, =0 {Im POD {version} sind keine Ereignisbelege mit diesem Begriff verknüpft.} one {# zugeordneter Ereignisbeleg im POD {version}.} other {# zugeordnete Ereignisbelege im POD {version}.}}",
        { count: usage.occurrenceCount, version: concept.datasetVersion || "" })}</p>
      {usage.occurrenceCount > 0 && <a href={`/events?concept=${encodeURIComponent(concept.code)}`}>
        {t("vocab.reader.openLinkedEvents", "{count, plural, one {View linked event} other {View all # linked events}}",
          "{count, plural, one {Verknüpftes Ereignis ansehen} other {Alle # verknüpften Ereignisse ansehen}}", { count: usage.occurrenceCount })}
      </a>}
    </section>}
    <OtherVocabularies links={concept.otherVocabularies} language={locale} />
    <div className="vr-actions"><SaveVocabularyTerm contextKey={href} label={scope ? "Save category" : "Save term"} /><CopyValue label={scope ? "Copy category code" : "Copy identifier"} value={concept.mdvsId || concept.code} />{concept.termUri && <CopyValue label="Copy term URI" value={concept.termUri} />}<CopyValue label="Copy page link" value={browseUrl} />
      {bound.snapshot && <CopyValue label="Copy snapshot link" value={pageUrl} />}<a href={apiHref}>Record JSON</a>{scope && <a href={concept.code === "organization" ? "/organizations" : "/persons"}>Browse {concept.code === "organization" ? "organisations" : "people"}</a>}{scheme === "modavis_activity_types" && Boolean(usage?.occurrenceCount) && <a href={`/use-cases/research-workbench?view=terms&mode=activities&concept=${encodeURIComponent(concept.code)}`}>Research source occurrences</a>}</div>
    <section className="vr-reading-guide"><h2>How to read this {scope ? "category" : "concept"}</h2><p>{scope ? "This is a record category used by the public catalogue. It is separate from the governed terminology and has no newly assigned concept identifier." : "The definition and labels below are retained from the selected POD. Source-term mappings and documented-event mappings describe different evidence and are shown separately. A matching word alone does not establish equivalence."}</p></section>
    <section className="vr-labels"><div className="vr-section-title"><h2>Recorded labels and languages</h2><p>{number(labels.length)} {labels.length === 1 ? "label" : "labels"} · {number(languageCount)} recorded language {languageCount === 1 ? "code" : "codes"}</p></div>{labels.length ? <ul>{labels.map((label, index) => <li key={`${label.id || index}:${label.languageCode}:${label.label}`}><div><strong lang={label.languageCode || undefined}>{label.label || "Label text not included"}</strong><span>{label.labelTypeId === 4 ? "Recorded full label" : "Recorded label"}{label.label === concept.preferredLabel ? " · used as this page’s title" : ""}</span></div><div><span>{label.languageEndonym || label.languageName || "Language not recorded"}</span>{label.languageCode && <code>{label.languageCode}</code>}</div></li>)}</ul> : <p>No separate language-label records are included for this {scope ? "category" : "concept"}.</p>}</section>
    {!scope && <details className="vr-disclosure"><summary>Source-term registry mappings <span>{concept.sourceMappingCount == null ? "Count not included" : `${number(concept.sourceMappingCount)} in the public subset`}</span></summary><div className="vr-disclosure-body"><p>{concept.mappingEvidenceScope || "Mappings retain their source term and context. This public view is a bounded subset of the authoritative registry."}</p>{mappings.length ? mappings.map((mapping, index) => <SourceMapping key={mapping.mdvsId || index} mapping={mapping} />) : <p>{concept.sourceMappingCount == null ? "Registry evidence is not included in this snapshot. Absence here does not establish that no mappings exist." : "No registry mappings have qualified occurrence evidence in this public subset. Unlinked historical mappings remain outside this view."}</p>}{concept.sourceMappingCount != null && concept.sourceMappingCount > mappings.length && <p>Showing {number(mappings.length)} of {number(concept.sourceMappingCount)} reported mappings. The record JSON retains the supplied evidence.</p>}</div></details>}
    {usage && <details className="vr-disclosure"><summary>Public event usage <span>{number(usage.occurrenceCount)} event assertions</span></summary><div className="vr-disclosure-body"><p>{usage.scope}</p><p>{number(usage.occurrenceCount)} assertions in {number(usage.groupCount)} source-wording and mapping groups. Repeated reports can describe the same historical activity.</p>{usage.groups.map((group, index) => <article className="vr-evidence-item" key={`${group.sourceKey}:${group.sourceWording}:${index}`}><h3>{group.sourceWording || "Source wording not recorded"}</h3><p>{group.sourceKey} · {group.mappingKind} · {number(group.occurrenceCount)} assertions · {number(group.sourceRecordCount)} source records</p><div className="vr-actions">{group.eventUrls.map((url, eventIndex) => safeVocabularyHref(url) && <a key={url} href={safeVocabularyHref(url)!}>Event evidence {eventIndex + 1}</a>)}</div></article>)}{usage.groupsLimited && <p>Showing {number(usage.groups.length)} of {number(usage.groupCount)} groups, with bounded event examples. Totals cover all groups.</p>}</div></details>}
    {reverse.length > 0 && <details className="vr-disclosure"><summary>Reverse-linked evidence <span>{number(concept.reverseLinkedGroupTotal ?? reverse.length)} groups</span></summary><div className="vr-disclosure-body"><p>Groups summarize retained evidence using this term. Item, source-record and linked-entity counts have separate meanings.</p>{reverse.map((group, index) => <article className="vr-evidence-item" key={index}><h3>{group.sourceGroup || "Source group not included"}</h3><p>{group.itemKind || "Evidence"}</p><dl className="vr-facts"><div><dt>Items</dt><dd>{group.itemCount == null ? "Not included" : number(group.itemCount)}</dd></div><div><dt>Source records</dt><dd>{group.sourceRecordCount == null ? "Not included" : number(group.sourceRecordCount)}</dd></div><div><dt>Linked entities</dt><dd>{group.subjectCount == null ? "Not included" : number(group.subjectCount)}</dd></div></dl></article>)}{concept.reverseLinkedGroupsLimited && <p>Showing {number(reverse.length)} groups; the reported total is {number(concept.reverseLinkedGroupTotal ?? reverse.length)}.</p>}</div></details>}
    {!scope && <details className="vr-disclosure"><summary>External vocabulary connections <span>{concept.externalMappingCount == null ? "Coverage not included" : `${number(concept.externalMappingCount)} reported`}</span></summary><div className="vr-disclosure-body">{external.length ? external.map((mapping, index) => {
      const uri = String(mapping.externalUri || mapping.uri || ""); const safe = safeVocabularyHref(uri);
      return <article className="vr-evidence-item" key={index}><h3>{String(mapping.externalScheme || mapping.scheme || "External vocabulary")}</h3><p>{String(mapping.mappingKind || mapping.mappingType || "Relation not recorded")}</p>{safe ? <a href={safe} target="_blank" rel="noreferrer">{uri}</a> : <code>{uri || "Target URI not included"}</code>}</article>;
    }) : <p>{concept.externalMappingCount == null ? "External mapping evidence is not included in this public snapshot. No equivalence can be inferred from its absence." : "No external mappings are recorded in the supplied public subset."}</p>}</div></details>}
    <details className="vr-disclosure"><summary>Identity and lifecycle</summary><div className="vr-disclosure-body"><dl className="vr-facts"><div><dt>{scope ? "Category code" : "Concept code"}</dt><dd><code>{concept.code}</code></dd></div><div><dt>MDVS identifier</dt><dd>{concept.mdvsId ? <code>{concept.mdvsId}</code> : "Not assigned in this snapshot"}</dd></div><div><dt>Scheme</dt><dd><code>{scheme || "Not included"}</code></dd></div><div><dt>Lifecycle</dt><dd>{status}</dd></div>{concept.status?.code && <div><dt>Lifecycle code</dt><dd><code>{concept.status.code}</code></dd></div>}{(concept.status?.id ?? concept.statusId) != null && <div><dt>Lifecycle ID</dt><dd>{concept.status?.id ?? concept.statusId}</dd></div>}{concept.status?.description && <div><dt>Lifecycle note</dt><dd>{concept.status.description}</dd></div>}<div><dt>Hierarchy</dt><dd>{concept.parentId == null ? "No parent relation is included in this snapshot" : `Recorded parent ID: ${concept.parentId}`}</dd></div>{concept.validFrom && <div><dt>Valid from</dt><dd>{concept.validFrom}</dd></div>}{concept.validTo && <div><dt>Valid until</dt><dd>{concept.validTo}</dd></div>}</dl></div></details>
    {!scope && scheme ? <SnapshotAccess scheme={scheme} snapshot={contentSha256 || query.snapshot} reference={reference} /> : <section className="vr-citation"><h2>Reference this category</h2><p>{reference}</p><CopyValue label="Copy reference" value={reference} /></section>}
  </article>;
}

export function PublicVocabularyRecords(props: PublicVocabularyRecordsProps) {
  const [, refresh] = useState(0);
  useEffect(() => { const change = () => refresh(value => value + 1); window.addEventListener("popstate", change); return () => window.removeEventListener("popstate", change); }, []);
  const search = typeof window === "undefined" ? "" : window.location.search;
  const path = typeof window === "undefined" ? (props.schemeId ? schemePath(props.schemeId) : "/vocab") : window.location.pathname;
  let query: VocabularyReadingQuery | undefined;
  let invalid: ReadingFailure | undefined;
  try {
    const params = new URLSearchParams(search);
    const resource = params.get("resource");
    if (props.expectedSchemeId === "modavis_activity_types" && props.conceptId?.startsWith("activitype:")
        && params.getAll("tab").length === 1 && params.getAll("resource").length === 1 && params.get("tab") === "export"
        && resource === `https://w3id.org/modavis/vocab/event-type/${props.conceptId}`) {
      params.delete("tab");
      params.delete("resource");
    }
    query = parseVocabularyReadingQuery(params.toString());
  } catch (error) { invalid = { message: (error as Error).message, status: 400 }; }
  const key = query ? JSON.stringify([props.schemeId, props.conceptId, props.expectedSchemeId, query]) : null;
  const result = useReading<VocabularyRecordData>(key, signal => loadVocabularyRecord(props, query!, signal));
  const data = result.data;
  useEffect(() => {
    const title = data?.kind === "concept" ? data.concept.preferredLabel || data.concept.code : data?.scheme.name || data?.scheme.code;
    document.title = `${title || "Vocabulary reading"} | MODAVIS Navigator`;
  }, [data]);
  if (invalid || result.error) return <VocabularyReadingFailure error={invalid || result.error!} path={path} onRetry={result.retry} />;
  if (!data || !query) return <section className="vocabulary-reader vr-loading"><h1>{props.conceptId ? "Vocabulary record" : "Vocabulary"}</h1><LoadingContent kind={props.conceptId ? "article" : "rows"} label={props.conceptId ? "Loading the requested record and its evidence…" : "Loading the requested vocabulary and matching records…"} /></section>;
  return data.kind === "scheme" ? <VocabularySchemeReading scheme={data.scheme} list={data.list} query={query} contentSha256={data.contentSha256} /> : <VocabularyConceptReading concept={data.concept} query={query} contentSha256={data.contentSha256} />;
}
