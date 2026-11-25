import { TermDistribution } from "./researchExploration";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowRight, Search, Copy, Download } from "lucide-react";
import { JsonEvidence } from "./JsonEvidence";
import { publicGetJson } from "./api";
import { PublicReadError } from "./requestCache";
import "./vocabularyHub.css";
import {SaveVocabularyTerm} from "./SaveVocabularyTerm";
import {vocabularyCaptureUrl} from "./vocabularyWorkspace";
import {useUiLocale} from "./uiLocale";

type Row = Record<string, any>;
export type VocabularyCollection = {
  id: string; title: string; description?: string; recordKind: string; href: string;
  count?: number | null; countUnit?: string; occurrenceCount?: number | null;
  group?: string; searchHref?: string; availability?: string; snapshot?: Row | string; capabilities?: Row;
};
type RequestError = { message: string; status?: number };
type SearchStatus = "pending" | "matched" | "empty" | "error";
type ReportSearchStatus = (id: string, title: string, status: SearchStatus) => void;
const familyNames: Record<string, string> = { activities: "Events and activities", stops: "Stops", divisions: "Divisions" };
const familyGerman: Record<string, string> = {
  activities: "Ereignisse und Tätigkeiten", stops: "Register", divisions: "Werke",
  builders: "Orgelbauer", places: "Orte", temperaments: "Stimmungssysteme",
};
function useVocabularyText() {
  const {t, formatNumber} = useUiLocale();
  return {
    t,
    n: (value: unknown) => typeof value === "number" && Number.isFinite(value)
      ? formatNumber(value) : t("vocab.number.unrecorded", "Not recorded", "Nicht erfasst"),
    family: (key: string, english: string) => familyGerman[key] ? t("vocab.family."+key, english, familyGerman[key]) : english,
    kind: (key: string) => {
      if (["governed_scheme", "governed_concept", "controlled"].includes(key)) return t("vocab.kind.controlled", "Controlled vocabulary", "Kontrolliertes Vokabular");
      if (["schema_categories", "schema_category"].includes(key)) return t("vocab.kind.schema", "Schema categories", "Schemakategorien");
      if (["candidate", "candidate_scheme", "unpublished_candidate", "candidate_registry"].includes(key)) return t("vocab.kind.candidate", "Unpublished candidates", "Unveröffentlichte Terminologievorschläge");
      if (["source_wording", "source_usage", "source_terminology"].includes(key)) return t("vocab.kind.wording", "Recorded source wording", "Erfasster Quellenwortlaut");
      return t("vocab.kind.reference", "Separate reference dataset", "Eigenständiger Referenzdatensatz");
    },
  };
}
const previewFamilies = ["activities", "stops", "divisions"];
const n = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value.toLocaleString() : "Not recorded";
const usageLink = (family: string, term?: string) => `/vocab/usage/${encodeURIComponent(family)}${term ? `?${new URLSearchParams({ term })}` : ""}`;
const familyOf = (collection: VocabularyCollection) => collection.href.match(/^\/vocab\/usage\/([^/?#]+)/)?.[1];
const withQuery = (href: string, values: Record<string, string>) => {
  const [path, search = ""] = href.split("?");
  const parameters = new URLSearchParams(search);
  for (const [key, value] of Object.entries(values)) parameters.set(key, value);
  return `${path}?${parameters}`;
};

export function sourcePreviewCollections(collections: VocabularyCollection[], selectedFamily: string) {
  const source = collections.filter((collection) => familyOf(collection));
  return selectedFamily ? source.filter((collection) => familyOf(collection) === selectedFamily)
    : source.filter((collection) => previewFamilies.includes(familyOf(collection)!));
}

export function sameBoundVocabularyResponse(previous: string, next: string, data: Row) {
  const before = new URL(previous, "https://navigator.invalid");
  const after = new URL(next, "https://navigator.invalid");
  const binding = after.pathname.startsWith("/api/vocab/registry") ? data.registrySha256
    : after.pathname.startsWith("/api/omaro/") ? data.snapshotSha256 : data.publicCoreSha256;
  if (!binding || before.pathname !== after.pathname || before.searchParams.has("snapshot")
    || after.searchParams.getAll("snapshot").length !== 1 || after.searchParams.get("snapshot") !== binding) return false;
  before.searchParams.set("snapshot", binding);
  before.searchParams.sort(); after.searchParams.sort();
  return before.search === after.search;
}

function useData(url: string): { data?: Row; error?: RequestError; retry: () => void } {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{ url: string; data?: Row; error?: RequestError }>();
  useEffect(() => {
    if (!url) return;
    if (state?.data && sameBoundVocabularyResponse(state.url, url, state.data)) return;
    const controller = new AbortController();
    publicGetJson<Row>(url, controller.signal).then((data) => {
      if (!controller.signal.aborted) setState({ url, data });
    }).catch((error: Error) => {
      if (!controller.signal.aborted) setState({ url, error: { message: error.message, status: error instanceof PublicReadError ? error.status : undefined } });
    });
    return () => controller.abort();
  }, [url, attempt]);
  return { ...(state?.url === url || (url && state?.data && sameBoundVocabularyResponse(state.url, url, state.data)) ? state : {}), retry: () => { setState(undefined); setAttempt((value) => value + 1); } };
}

export function VocabularyEvidence({ value, summary }: { value: unknown; summary?: string }) {
  const { t } = useVocabularyText();
  return <details className="vh-evidence"><summary>{summary ?? t("vocab.evidence.original", "Original evidence and identifiers", "Ursprüngliche Belegdaten und Kennungen")}</summary><JsonEvidence value={value} /></details>;
}
export function vocabularyKindLabel(kind: string) {
  if (["governed_scheme", "governed_concept", "controlled"].includes(kind)) return "Controlled vocabulary";
  if (["schema_categories", "schema_category"].includes(kind)) return "Schema categories";
  if (["candidate", "candidate_scheme", "unpublished_candidate", "candidate_registry"].includes(kind)) return "Unpublished candidates";
  if (["source_wording", "source_usage", "source_terminology"].includes(kind)) return "Recorded source wording";
  return "Separate reference dataset";
}
function fallbackCollections(schemes?: Row): VocabularyCollection[] {
  const recorded = (schemes?.items ?? []).map((scheme: Row) => ({
    id: scheme.code, title: scheme.name, description: scheme.description, recordKind: scheme.recordKind,
    href: `/vocab/${encodeURIComponent(scheme.code)}`, count: scheme.recordKind === "schema_categories" ? scheme.categoryCount : scheme.conceptCount,
    countUnit: scheme.recordKind === "schema_categories" ? "schema categories" : "controlled concepts", snapshot: scheme.snapshot,
  }));
  return [...recorded, ...previewFamilies.map((family) => ({ id: family, title: familyNames[family], recordKind: "source_wording", href: usageLink(family) })),
    { id: "omaro", title: "Instrument names and classifications", recordKind: "external_reference", href: "/vocab/omaro", description: "OMARO’s separate instrument names, Hornbostel–Sachs classification and assertion ontology." }];
}
export function VocabularyCollectionCard({ collection, query = "" }: { collection: VocabularyCollection; query?: string }) {
  const { t, n, family, kind } = useVocabularyText();
  const sourceFamily = familyOf(collection);
  const href = query && (collection.searchHref || sourceFamily) ? withQuery(collection.searchHref || collection.href, { q: query }) : collection.href;
  return <article className="vh-collection">
    <span className="vh-kind">{kind(sourceFamily ? "source_wording" : collection.recordKind)}</span>
    <h3><a href={href}>{sourceFamily ? family(sourceFamily, collection.title) : collection.title}</a></h3>{collection.description && (collection.recordKind === "candidate"
      ? <details className="vh-collection-scope"><summary>{t('vocab.collection.scope', "Scope of these entries", "Umfang dieser Einträge")}</summary><p>{collection.description}</p></details>
      : <p>{collection.description}</p>)}
    {collection.availability === "unavailable" && <p className="vh-muted">{t('vocab.collection.unavailable', "Currently unavailable in this runtime.", "In dieser Installation derzeit nicht verfügbar.")}</p>}
    {collection.count != null && <p className="vh-collection-count"><strong>{n(collection.count)}</strong> {collection.countUnit || t('vocab.collection.entries', 'entries', 'Einträge')}</p>}
    {collection.occurrenceCount != null && <small>{t('vocab.collection.occurrenceCount', '{count, plural, one {# recorded occurrence} other {# recorded occurrences}}', '{count, plural, one {# erfasstes Vorkommen} other {# erfasste Vorkommen}}', {count:collection.occurrenceCount})}</small>}
    <a className="vh-next" href={href}>{query && (collection.searchHref || sourceFamily) ? t("vocab.collection.matches", "Browse matching entries", "Passende Einträge ansehen") : t("vocab.collection.open", "Browse collection", "Sammlung öffnen")}<ArrowRight size={15} aria-hidden="true" /></a>
  </article>;
}
export function VocabularyDirectory({ collections, query = "" }: { collections: VocabularyCollection[]; query?: string }) {
  const { t } = useVocabularyText();
  const source = collections.filter((collection) => familyOf(collection));
  const primary = source.filter((collection) => previewFamilies.includes(familyOf(collection)!));
  const additional = source.filter((collection) => !previewFamilies.includes(familyOf(collection)!));
  const other = collections.filter((collection) => !familyOf(collection));
  const candidates = other.filter((collection) => collection.recordKind === "candidate");
  const references = other.filter((collection) => ["external_reference", "published_reference"].includes(collection.recordKind));
  const governed = other.filter((collection) => !candidates.includes(collection) && !references.includes(collection));
  const groups = [...new Set(additional.map((collection) => collection.group || "other_source_fields"))];
  return <section className="vh-directory" aria-label={t('vocab.directory.aria', "Terminology collections", "Terminologiesammlungen")}>
    <div className="vh-section-heading"><div><p className="eyebrow">{t('vocab.directory.eyebrow', "Choose the kind of evidence", "Art der Belegdaten auswählen")}</p><h2>{t('vocab.directory.title', "Vocabulary collections", "Vokabularsammlungen")}</h2></div><a href="#vocabulary-status">{t('vocab.directory.status', "Status, citation and downloads", "Status, Zitierhinweise und Downloads")}</a></div>
    <div className="vh-grid">{governed.map((collection) => <VocabularyCollectionCard key={collection.id} collection={collection} query={query} />)}</div>
    <div className="vh-section-heading"><div><h2>{t('vocab.directory.wordings', "Wording used in source records", "Wortlaut in Quelldatensätzen")}</h2><p>{t('vocab.directory.wordingsNote', "Recorded designations and statements stay separate from controlled definitions.", "Erfasste Bezeichnungen und Angaben bleiben von kontrollierten Definitionen getrennt.")}</p></div></div>
    <div className="vh-grid">{primary.map((collection) => <VocabularyCollectionCard key={collection.id} collection={collection} query={query} />)}</div>
    {additional.length > 0 && <details className="vh-context vh-source-directory"><summary>{t('vocab.directory.more', "More source fields", "Weitere Quellenfelder")} <span>{t("vocab.directory.moreCount", "{count, plural, one {# collection} other {# collections}}", "{count, plural, one {# Sammlung} other {# Sammlungen}}", {count:additional.length})}</span></summary>
      {groups.map((group) => <section key={group}><h3>{group.replace(/_/g, " ")}</h3><div className="vh-field-grid">
        {additional.filter((collection) => (collection.group || "other_source_fields") === group).map((collection) => <VocabularyCollectionCard key={collection.id} collection={collection} query={query} />)}
      </div></section>)}
    </details>}
    {candidates.length > 0 && <><div className="vh-section-heading"><div><h2>{t('vocab.directory.candidates', "Candidate terminology registry", "Verzeichnis der Terminologievorschläge")}</h2><p>{t('vocab.directory.candidateNote', "Frozen definitions and lexical mappings, with unpublished candidate status retained.", "Festgeschriebene Definitionen und lexikalische Zuordnungen mit dem Status unveröffentlichter Vorschläge.")}</p></div></div><div className="vh-grid">{candidates.map((collection) => <VocabularyCollectionCard key={collection.id} collection={collection} query={query} />)}</div></>}
    {references.length > 0 && <><div className="vh-section-heading"><div><h2>{t('vocab.directory.references', "Separate reference collections", "Eigenständige Referenzsammlungen")}</h2><p>{t('vocab.directory.referenceNote', "Explore their own identifiers, versions and distributions.", "Erkunden Sie die jeweiligen Kennungen, Versionen und Downloadpakete.")}</p></div></div><div className="vh-grid">{references.map((collection) => <VocabularyCollectionCard key={collection.id} collection={collection} query={query} />)}</div></>}
  </section>;
}
function SearchFailure({ error, retry }: { error: RequestError; retry: () => void }) {
  const { t } = useVocabularyText();
  return <div role="alert"><p>{t("vocab.search.error", "The vocabulary request could not be completed.", "Die Vokabularabfrage konnte nicht abgeschlossen werden.")} <span lang="en">{error.message}</span></p>{(!error.status || error.status >= 500) && <button type="button" onClick={retry}>{t('vocab.search.retry', "Retry", "Erneut versuchen")}</button>}</div>;
}
function useSearchResult(url: string, id: string, title: string, report: ReportSearchStatus) {
  const result = useData(url);
  const status = result.error ? "error" : !result.data ? "pending" : result.data.total > 0 ? "matched" : "empty";
  useEffect(() => report(id, title, status), [id, title, status, report]);
  return result;
}

function UsageSearch({ family, title, q, report }: { family: string; title: string; q: string; report: ReportSearchStatus }) {
  const { t } = useVocabularyText();
  const name = t("vocab.search.sourceTitle", "{title} · source wording", "{title} · Quellenwortlaut", {title});
  const { data, error, retry } = useSearchResult(`/api/vocab/usage/${encodeURIComponent(family)}?${new URLSearchParams({ q })}`, `usage:${family}`, name, report);
  if (!error && !data?.total) return null;
  const href = withQuery(usageLink(family), { q, ...(data?.publicCoreSha256 ? { snapshot: data.publicCoreSha256 } : {}) });
  return <section className="vh-search-group"><span className="vh-kind">{t("vocab.kind.wording", "Recorded source wording", "Erfasster Quellenwortlaut")}</span><h3>{name}</h3>
    {error ? <SearchFailure error={error} retry={retry} /> : data && <>
      <p className="vh-result-count">{t("vocab.search.wordingCount", "{count, plural, one {# matching wording} other {# matching wordings}}", "{count, plural, one {# passender Wortlaut} other {# passende Wortlautvarianten}}", {count:data.total})}<small>{t("vocab.search.wordingNote", "Showing {count, number}. Case and spacing are grouped for lookup.", "Angezeigt: {count, number}. Für die Suche werden Groß- und Kleinschreibung sowie Leerzeichen zusammengefasst.", {count:Math.min(data.items.length, 5)})}</small></p>
      <ul className="vh-search-results">{data.items.slice(0, 5).map((item: Row) => <li key={item.key}><a href={item.href}>{item.label}</a><small>{t("vocab.search.occurrences", "{count, plural, one {# occurrence} other {# occurrences}}", "{count, plural, one {# Vorkommen} other {# Vorkommen}}", {count:item.occurrences})}</small></li>)}</ul>
      <a className="vh-next" href={href}>{t('vocab.search.browseWordings', "Browse matching wordings", "Passende Wortlautvarianten ansehen")} <ArrowRight size={14} aria-hidden="true" /></a>
    </>}
  </section>;
}
function SchemeSearch({ collection, q, report }: { collection: VocabularyCollection; q: string; report: ReportSearchStatus }) {
  const { t, kind } = useVocabularyText();
  const scheme = decodeURIComponent(collection.href.split("?")[0].split("/").pop() || collection.id);
  const { data, error, retry } = useSearchResult(`/api/vocab/concepts?${new URLSearchParams({ q, scheme_code: scheme, limit: "5" })}`, `scheme:${collection.id}`, collection.title, report);
  if (!error && !data?.total) return null;
  const category = collection.recordKind === "schema_categories";
  return <section className="vh-search-group"><span className="vh-kind">{kind(collection.recordKind)}</span><h3>{collection.title}</h3>
    {error ? <SearchFailure error={error} retry={retry} /> : data && <>
      <p className="vh-result-count">{category ? t("vocab.search.categoryCount", "{count, plural, one {# matching category} other {# matching categories}}", "{count, plural, one {# passende Kategorie} other {# passende Kategorien}}", {count:data.total}) : t("vocab.search.conceptCount", "{count, plural, one {# matching concept} other {# matching concepts}}", "{count, plural, one {# passender Begriff} other {# passende Begriffe}}", {count:data.total})}<small>{t("vocab.search.schemeCount", "Showing {count, number} in this vocabulary.", "Angezeigt in diesem Vokabular: {count, number}.", {count:data.items.length})}</small></p>
      <ul className="vh-search-results">{data.items.map((item: Row) => <li key={item.code}><a href={`/vocab/${encodeURIComponent(item.scheme?.code || scheme)}/concepts/${encodeURIComponent(item.code)}`}>{item.preferredLabel || item.code}</a>{item.definition && <small>{item.definition}</small>}</li>)}</ul>
      <a className="vh-next" href={withQuery(collection.href, { q })}>{t('vocab.search.browseAll', "Browse all matches", "Alle Treffer ansehen")} <ArrowRight size={14} aria-hidden="true" /></a>
    </>}
  </section>;
}
function ReferenceSearch({ q, report }: { q: string; report: ReportSearchStatus }) {
  const { t } = useVocabularyText();
  const name = t('vocab.search.omaroTitle', "OMARO instrument names", "Instrumentennamen in OMARO");
  const { data, error, retry } = useSearchResult(`/api/omaro/concepts?${new URLSearchParams({ q, resolution: "resolved", limit: "5" })}`, "omaro", name, report);
  if (!error && !data?.total) return null;
  return <section className="vh-search-group"><span className="vh-kind">{t("vocab.kind.reference", "Separate reference dataset", "Eigenständiger Referenzdatensatz")}</span><h3>{name}</h3>
    {error ? <SearchFailure error={error} retry={retry} /> : data && <>
      <p className="vh-result-count">{t("vocab.search.referenceCount", "{count, plural, one {# resolved reference match} other {# resolved reference matches}}", "{count, plural, one {# zugeordneter Referenztreffer} other {# zugeordnete Referenztreffer}}", {count:data.total})}<small>{t("vocab.search.referenceNote", "Showing {count, number}. These results do not classify POD organs.", "Angezeigt: {count, number}. Die Treffer stellen keine Klassifikation der im POD erfassten Orgeln dar.", {count:data.items.length})}</small></p>
      <ul className="vh-search-results">{data.items.map((item: Row) => <li key={item.uri}><a href={`/vocab/omaro?${new URLSearchParams({ uri: item.uri, snapshot: data.snapshotSha256 })}`}>{item.label}</a></li>)}</ul>
      <a className="vh-next" href={`/vocab/omaro?${new URLSearchParams({ q, resolution: "resolved", snapshot: data.snapshotSha256 })}`}>{t('vocab.search.browseOmara', "Browse OMARO matches", "Treffer in OMARO ansehen")} <ArrowRight size={14} aria-hidden="true" /></a>
    </>}
  </section>;
}

export function candidateLabel(candidate: Row, language?: string | null): string {
  return (language && candidate.label?.[language]) || candidate.label?.en || Object.values(candidate.label ?? {})[0] || candidate.id;
}

function CandidateSearch({ q, report }: { q: string; report: ReportSearchStatus }) {
  const { t } = useVocabularyText();
  const name = t('vocab.directory.candidates', "Candidate terminology registry", "Verzeichnis der Terminologievorschläge");
  const { data, error, retry } = useSearchResult(`/api/vocab/registry?${new URLSearchParams({ q, limit: "5" })}`, "registry", name, report);
  if (!error && !data?.total) return null;
  return <section className="vh-search-group"><span className="vh-kind">{t("vocab.kind.candidate", "Unpublished candidates", "Unveröffentlichte Terminologievorschläge")}</span><h3>{name}</h3>
    {error ? <SearchFailure error={error} retry={retry} /> : data && <>
      <p className="vh-result-count">{t("vocab.search.candidateCount", "{count, plural, one {# matching candidate} other {# matching candidates}}", "{count, plural, one {# passender Vorschlag} other {# passende Vorschläge}}", {count:data.total})}<small>{t("vocab.search.candidateNote", "Showing {count, number}. Accepted lexical mappings do not promote a concept.", "Angezeigt: {count, number}. Eine akzeptierte lexikalische Zuordnung ändert den Status des vorgeschlagenen Begriffs nicht.", {count:data.items.length})}</small></p>
      <ul className="vh-search-results">{data.items.map((item: Row) => <li key={item.id}><a href={item.href}>{candidateLabel(item)}</a><small>{item.definition}</small></li>)}</ul>
      <a className="vh-next" href={`/vocab/registry?${new URLSearchParams({ q, snapshot: data.registrySha256 })}`}>{t('vocab.search.browseCandidates', "Browse candidate matches", "Passende Vorschläge ansehen")}<ArrowRight size={14} aria-hidden="true" /></a>
    </>}
  </section>;
}

export function VocabularyHub() {
  const { t, n } = useVocabularyText();
  const [search, setSearch] = useState(location.search);
  const parameters = new URLSearchParams(search);
  const q = parameters.get("q") || "";
  const selectedFamily = parameters.get("sourceFamily") || "";
  const [input, setInput] = useState(q);
  const inputRef = useRef<HTMLInputElement>(null);
  const catalogue = useData("/api/vocab/catalogue");
  const schemes = useData("/api/vocab/schemes");
  const releases = useData("/api/vocab/releases?limit=12");
  const collections: VocabularyCollection[] = catalogue.data?.collections ?? fallbackCollections(schemes.data);
  useEffect(() => { const sync = () => { setSearch(location.search); setInput(new URLSearchParams(location.search).get("q") || ""); }; window.addEventListener("popstate", sync); return () => window.removeEventListener("popstate", sync); }, []);
  function go(values: Record<string, string | null>) {
    const next = new URLSearchParams(search);
    for (const [key, value] of Object.entries(values)) value === null || value === "" ? next.delete(key) : next.set(key, value);
    history.pushState({}, "", `/vocab${next.size ? `?${next}` : ""}`); setSearch(location.search);
  }
  function submit(event: FormEvent) { event.preventDefault(); const value = input.trim(); setInput(value); go({ q: value }); }
  return <section className="vh-page" aria-label={t('vocab.hub.aria', "Vocabulary and source terminology", "Vokabulare und Terminologie aus Quellen")}>
    <header className="vh-hero"><p className="eyebrow">{t('vocab.hub.eyebrow', "MODAVIS vocabularies", "MODAVIS-Vokabulare")}</p><h1>{t('vocab.hub.title', "Terms, definitions and recorded uses", "Benennungen, Definitionen und erfasste Verwendungen")}</h1><p>{t('vocab.hub.intro', "Look up a vocabulary concept, inspect source wording, or explore a separate reference collection. Their evidence and status remain distinct.", "Schlagen Sie Begriffe nach, prüfen Sie erfassten Quellenwortlaut oder erkunden Sie eigenständige Referenzsammlungen. Beleggrundlage und Status bleiben jeweils getrennt ausgewiesen.")}</p>
      <form className="vh-search" role="search" onSubmit={submit}><label><span>{t('vocab.hub.search', "Search terms across collections", "Sammlungsübergreifend nach Benennungen suchen")}</span><input ref={inputRef} type="search" value={input} onChange={(event) => setInput(event.target.value)} maxLength={200} placeholder={t("vocab.search.placeholder", "Dankesbrief, Vox Humana, repair…", "Dankesbrief, Vox Humana, Reparatur …")} /></label><button type="submit"><Search size={16} aria-hidden="true" />{t('vocab.hub.submit', "Search", "Suchen")}</button>{q && <button className="vh-secondary" type="button" onClick={() => { setInput(""); go({ q: null }); inputRef.current?.focus(); }}>{t('vocab.hub.clear', "Clear", "Zurücksetzen")}</button>}</form>
      <div className="vh-quick-links"><a href={usageLink("activities", "Dankesbrief")}>Dankesbrief</a><a href={usageLink("stops", "Vox Humana")}>Vox Humana</a><a href={usageLink("divisions", "Swell")}>Swell</a></div>
    </header>
    {q && <VocabularySearchResults
      key={q}
      collections={collections}
      directoryPending={!catalogue.data && !catalogue.error}
      q={q}
      selectedFamily={selectedFamily}
      onSourceFamilyChange={(value) => go({ sourceFamily: value })}
    />}
    {catalogue.error && <p className="vh-muted" role="status">{t('vocab.hub.noDirectory', "The full collection directory is unavailable. Established vocabulary and source-wording routes remain listed below.", "Das vollständige Sammlungsverzeichnis ist nicht verfügbar. Die regulären Zugänge zu Vokabularen und Quellenwortlaut finden Sie unten.")}</p>}
    <VocabularyDirectory collections={collections} query={q} />
    <details className="vh-context" id="vocabulary-status"><summary>{t('vocab.hub.status', "Vocabulary status, versions and downloads", "Status, Versionen und Downloads der Vokabulare")}</summary><p>{t('vocab.hub.statusNote', "Controlled concepts, unpublished candidates, source wording and schema categories carry different status. An occurrence is one retained observation; several accounts may describe the same organ.", "Kontrollierte Begriffe, unveröffentlichte Vorschläge, Quellenwortlaut und Schemakategorien haben einen unterschiedlichen Status. Ein Vorkommen entspricht einer erfassten Angabe. Mehrere Quellenbeschreibungen können dieselbe Orgel betreffen.")}</p>
      {schemes.error && <SearchFailure error={schemes.error} retry={schemes.retry} />}<ul className="vh-reference-list">{schemes.data?.items.map((scheme: Row) => <li key={scheme.code}><a href={`/vocab/${encodeURIComponent(scheme.code)}`}>{scheme.name}</a><span>{scheme.version || "Version not recorded"} · {n(scheme.recordKind === "schema_categories" ? scheme.categoryCount : scheme.conceptCount)} {scheme.recordKind === "schema_categories" ? "schema categories" : "controlled concepts"}</span>{scheme.snapshot && <a href={scheme.snapshot.metadataUrl}>{t('vocab.hub.snapshot', "Snapshot, citation and downloads", "Datenstand, Zitierhinweise und Downloads")}</a>}</li>)}</ul>
      <a href="/vocab/omaro">{t('vocab.hub.omaro', "OMARO’s separate reference version and distributions", "Eigenständige Referenzversion und Downloadpakete von OMARO")}</a>{releases.data?.scope && <p>{releases.data.scope}</p>}{releases.data?.items.map((release: Row) => <p key={release.id || release.versionLabel}><a href={`/vocab/releases/${encodeURIComponent(release.versionLabel || release.mdvsId || String(release.id))}`}>Vocabulary release {release.versionLabel || release.vocabularyVersion || release.mdvsId}</a></p>)}{releases.error && <SearchFailure error={releases.error} retry={releases.retry} />}
    </details>
  </section>;
}

function VocabularySearchResults({ collections, directoryPending, q, selectedFamily, onSourceFamilyChange }: {
  collections: VocabularyCollection[];
  directoryPending: boolean;
  q: string;
  selectedFamily: string;
  onSourceFamilyChange: (value: string) => void;
}) {
  const { t, family } = useVocabularyText();
  const [results, setResults] = useState<Record<string, { title: string; status: SearchStatus }>>({});
  const report: ReportSearchStatus = useCallback((id, title, status) => {
    setResults(current => current[id]?.title === title && current[id].status === status ? current : { ...current, [id]: { title, status } });
  }, []);
  const schemes = collections.filter((collection) => ["controlled", "governed_scheme", "schema_categories"].includes(collection.recordKind));
  const source = collections.filter((collection) => familyOf(collection));
  const previews = sourcePreviewCollections(collections, selectedFamily);
  const hasRegistry = collections.some((collection) => collection.recordKind === "candidate");
  const missingFamily = Boolean(selectedFamily && !previews.length);
  const groupIds = [
    ...schemes.map((collection) => `scheme:${collection.id}`),
    ...(hasRegistry ? ["registry"] : []),
    "omaro",
    ...previews.map((collection) => `usage:${familyOf(collection)}`),
  ];
  const pending = directoryPending || groupIds.some((id) => !results[id] || results[id].status === "pending");
  const empty = groupIds.filter((id) => results[id]?.status === "empty");

  return <section aria-label={t('vocab.hub.resultAria', "Term search results", "Ergebnisse der Benennungssuche")} className="vh-search-section">
    <div className="vh-section-heading">
      <div>
        <h2>{t("vocab.search.results", "Results for “{term}”", "Ergebnisse für „{term}“", {term:q})}</h2>
        <p>{t('vocab.search.collectionCounts', "Counts are shown for each collection.", "Die Trefferzahlen werden je Sammlung angezeigt.")}</p>
      </div>
      <label className="vh-search-scope">
        {t('vocab.hub.sourceField', "Source wording field", "Quellenfeld")}
        <select value={selectedFamily} onChange={(event) => onSourceFamilyChange(event.target.value)}>
          <option value="">{t('vocab.hub.preview', "Events, stops and divisions", "Ereignisse, Register und Werke")}</option>
          {missingFamily && <option value={selectedFamily}>{t("vocab.search.familyUnavailable", "{family} · unavailable", "{family} · nicht verfügbar", {family:selectedFamily})}</option>}
          {source.map((collection) => <option key={collection.id} value={familyOf(collection)}>{family(familyOf(collection)!, collection.title)}</option>)}
        </select>
      </label>
    </div>
    {missingFamily && !directoryPending && <p role="alert">{t('vocab.search.invalidField', "Choose an available field to search recorded wording.", "Wählen Sie ein verfügbares Feld für die Suche im erfassten Wortlaut.")}</p>}
    <div className="vh-grid vh-match-grid">
      {schemes.map((collection) => <SchemeSearch key={collection.id} collection={collection} q={q} report={report} />)}
      {hasRegistry && <CandidateSearch q={q} report={report} />}
      <ReferenceSearch q={q} report={report} />
      {previews.map((collection) => <UsageSearch key={collection.id} family={familyOf(collection)!} title={family(familyOf(collection)!, collection.title)} q={q} report={report} />)}
    </div>
    {pending ? <p role="status" className="vh-muted">{t('vocab.search.pending', "Searching collections…", "Sammlungen werden durchsucht …")}</p>
      : empty.length === groupIds.length && <p role="status">{t('vocab.search.empty', "No matches in the searched collections.", "Keine Treffer in den durchsuchten Sammlungen.")}</p>}
    {empty.length > 0 && <details className="vh-context vh-empty-collections">
      <summary>{t('vocab.search.emptyCollections', '{count, plural, one {# collection without matches} other {# collections without matches}}', '{count, plural, one {# Sammlung ohne Treffer} other {# Sammlungen ohne Treffer}}', {count: empty.length})}</summary>
      <ul>{empty.map((id) => <li key={id}>{results[id].title}</li>)}</ul>
    </details>}
  </section>;
}

export function usageApiParameters(parameters: URLSearchParams) {
  const api = new URLSearchParams(parameters);
  for (const key of ["view", "groupBy", "distributionPage", "zeros", "analysis"]) api.delete(key);
  return api;
}
export function usageQueryIssue(parameters: URLSearchParams): RequestError | undefined {
  const duplicate = [...new Set(parameters.keys())].find((key) => parameters.getAll(key).length > 1);
  if (duplicate) return { message: `The link repeats “${duplicate}”. No filter value has been silently selected.`, status: 400 };
  if (parameters.has("snapshot") && !parameters.get("snapshot")) return { message: "The linked snapshot is empty. Choose an explicitly available snapshot before browsing this selection.", status: 400 };
  return undefined;
}
export function usageCollectionLink(family: string, parameters: URLSearchParams) {
  const next = new URLSearchParams(parameters);
  for (const key of ["term", "match", "organ_q", "section", "page", "dimension", "bucket", "view", "groupBy", "distributionPage", "zeros", "analysis"]) next.delete(key);
  return `${usageLink(family)}${next.size ? `?${next}` : ""}`;
}
export function UsageOccurrence({ item, family }: { item: Row; family: string }) {
  const { t } = useVocabularyText();
  const date = item.year == null ? t("vocab.occurrence.undated", "Date unestablished", "Datierung nicht belegt") : String(item.year);
  return <article className="vh-occurrence"><div className="vh-occurrence-heading"><h3><a href={item.href}>{item.label}</a></h3><span className="vh-kind">{t("vocab.kind.wording", "Recorded source wording", "Erfasster Quellenwortlaut")}</span></div><p className="vh-organ-link"><a href={item.organHref}>{item.organLabel}</a></p>
    <dl className="vh-occurrence-facts">{family === "activities" && <div><dt>{t('vocab.occurrence.record', "Record", "Datensatz")}</dt><dd>{t('vocab.occurrence.eventLabel', "Documented event", "Dokumentiertes Ereignis")}</dd></div>}{family === "stops" && <><div><dt>{t('vocab.occurrence.pitch', "Pitch wording", "Tonhöhenangabe laut Quelle")}</dt><dd>{item.pitch || t("vocab.number.unrecorded", "Not recorded", "Nicht erfasst")}</dd></div><div><dt>{t('vocab.occurrence.division', "Division wording", "Werkbezeichnung laut Quelle")}</dt><dd>{item.division || t("vocab.number.unrecorded", "Not recorded", "Nicht erfasst")}</dd></div></>}<div><dt>{t('vocab.occurrence.date', "Source date", "Datierung laut Quelle")}</dt><dd>{date}{item.date_kind && <small>{String(item.date_kind).replace(/_/g, " ")}</small>}</dd></div><div><dt>{t('vocab.occurrence.collection', "Source collection", "Quellensammlung")}</dt><dd>{item.source_key || t("vocab.number.unrecorded", "Not recorded", "Nicht erfasst")}</dd></div></dl>
    <div className="vh-occurrence-links"><a href={item.href}>{family === "activities" ? t("vocab.occurrence.event", "Open event evidence", "Ereignisbeleg öffnen") : item.description ? t("vocab.occurrence.account", "Open source account", "Quellenbeschreibung öffnen") : t("vocab.occurrence.recorded", "Open recorded evidence", "Erfassten Beleg öffnen")}<ArrowRight size={14} aria-hidden="true" /></a>{item.source && item.href !== item.sourceHref && <a href={item.sourceHref || `/source/${encodeURIComponent(item.source)}`}>{t('vocab.occurrence.source', "Source record", "Quelldatensatz")}</a>}{item.sourceEvidence?.source_url && <a href={item.sourceEvidence.source_url} target="_blank" rel="noreferrer">{t('vocab.occurrence.original', "Original source", "Originalquelle")}</a>}</div><VocabularyEvidence value={item} />
  </article>;
}
export function UsageError({ error, parameters, go, retry, availableSnapshot }: { error: RequestError; parameters: URLSearchParams; go: (values: Row) => void; retry: () => void; availableSnapshot?: string }) {
  const { t } = useVocabularyText();
  return <div className="vh-error" role="alert"><h2>{t('vocab.usage.error', "Terminology evidence is unavailable", "Terminologische Belege sind nicht verfügbar")}</h2><p lang="en">{error.message}</p><div className="vh-controls">{(!error.status || error.status >= 500) && <button type="button" onClick={retry}>{t('vocab.usage.retry', "Retry this selection", "Auswahl erneut laden")}</button>}{error.status === 404 && parameters.get("source") && <button type="button" onClick={() => go({ source: null, page: 0, distributionPage: 0 })}>{t('vocab.usage.includeSources', "Include all sources", "Alle Quellen einbeziehen")}</button>}{error.status === 404 && parameters.get("term") && (parameters.get("match") || "exact") === "exact" && <button type="button" onClick={() => go({ match: "contains", page: 0, distributionPage: 0 })}>{t('vocab.usage.broader', "Search wording containing this text", "Nach Wortlaut mit dieser Zeichenfolge suchen")}</button>}{availableSnapshot && parameters.get("snapshot") !== availableSnapshot && (error.status === 409 || parameters.get("snapshot") === "") && <button type="button" onClick={() => go({ snapshot: availableSnapshot })}>{t('vocab.usage.availableSnapshot', "Open this selection on the available snapshot", "Auswahl mit dem verfügbaren Datenstand öffnen")}</button>}</div>{error.status === 409 && <p>{t('vocab.usage.binding', "The requested binding is retained in this URL. No current snapshot has been substituted.", "Der Link behält die angeforderte Bindung bei. Der aktuelle Datenstand wurde nicht als Ersatz verwendet.")}</p>}</div>;
}
export function UsagePager({ data, term, parameters, go }: { data: Row; term: boolean; parameters: URLSearchParams; go: (values: Row) => void }) {
  const { t } = useVocabularyText();
  const page = Math.floor(data.offset / data.limit);
  const unit = term ? parameters.get("section") === "organs" ? t("vocab.pager.organs", "organs", "Orgeln") : t("vocab.pager.occurrences", "occurrences", "Vorkommen") : t("vocab.pager.wordings", "wordings", "Wortlautvarianten");
  return <nav className="vh-pager" aria-label={t('vocab.pager.aria', "Terminology result pages", "Ergebnisseiten zur Terminologie")}><button type="button" disabled={data.offset === 0} onClick={() => go({ page: Math.max(0, page - 1) })}>{t('vocab.pager.previous', "Previous", "Zurück")}</button><span>{t("vocab.pager.range", "{from, number}–{to, number} of {total, number} {unit}", "{from, number}–{to, number} von {total, number} {unit}", {from:data.items.length ? data.offset + 1 : 0, to:data.items.length ? Math.min(data.total, data.offset + data.items.length) : 0, total:data.total, unit})}</span><button type="button" disabled={!data.hasMore} onClick={() => go({ page: page + 1 })}>{t('vocab.pager.next', "Next", "Weiter")}</button></nav>;
}

export function VocabularyUsage({ family }: { family: string }) {
  const { t, n, family: localizedFamily } = useVocabularyText();
  const [search, setSearch] = useState(location.search);
  const parameters = new URLSearchParams(search);
  const term = parameters.get("term");
  const isTerm = parameters.has("term");
  const [notice, setNotice] = useState<"copied" | "copyManually" | "">("");
  const catalogue = useData("/api/vocab/catalogue");
  const collection: VocabularyCollection | undefined = catalogue.data?.collections.find((item: VocabularyCollection) => familyOf(item) === family);
  const issue = usageQueryIssue(parameters);
  const api = `/api/vocab/usage/${encodeURIComponent(family)}?${usageApiParameters(parameters)}`;
  const response = useData(issue ? "" : api);
  const data = issue ? undefined : response.data;
  const error = issue || response.error;
  const title = localizedFamily(family, collection?.title || data?.title || familyNames[family] || family.replace(/_/g, " "));
  const matchingVariants: Row[] = data?.match === "exact" ? data.variants ?? [] : [];
  const termTitle = matchingVariants.find((variant) => variant.label === term)?.label ?? matchingVariants[0]?.label ?? term;
  const share = new URLSearchParams(search);
  if (data && !share.has("snapshot")) share.set("snapshot", data.publicCoreSha256);
  const shareHref = `${usageLink(family)}?${share}`;
  const supportsDistributions = data?.capabilities?.distributions ?? collection?.capabilities?.distributions ?? previewFamilies.includes(family);
  useEffect(() => { const sync = () => setSearch(location.search); window.addEventListener("popstate", sync); return () => window.removeEventListener("popstate", sync); }, []);
  useEffect(() => { if (data && !parameters.has("snapshot")) { const next = new URLSearchParams(search); next.set("snapshot", data.publicCoreSha256); history.replaceState({}, "", `${location.pathname}?${next}`); setSearch(location.search); } }, [data, search]);
  function go(values: Row) {
    const next = new URLSearchParams(search);
    for (const [key, value] of Object.entries(values)) value === null || value === "" ? next.delete(key) : next.set(key, String(value));
    history.pushState({}, "", `${location.pathname}?${next}`); setSearch(location.search); setNotice("");
  }
  return <section className="vh-page vh-usage-page" aria-label={t('vocab.usage.aria', "Source terminology browser", "Quellenterminologie durchsuchen")}>
    <nav className="vh-breadcrumbs" aria-label={t('vocab.usage.context', "Vocabulary context", "Vokabularkontext")}><a href="/vocab">{t('vocab.usage.all', "All vocabularies", "Alle Vokabulare")}</a>{isTerm && <><span aria-hidden="true">/</span><a href={usageCollectionLink(family, parameters)}>{t("vocab.usage.breadcrumb", "{title} wordings", "Quellenwortlaut · {title}", {title})}</a></>}</nav>
    <header className="vh-hero vh-usage-hero"><p className="eyebrow">{isTerm ? t("vocab.kind.wording", "Recorded source wording", "Erfasster Quellenwortlaut") : t("vocab.usage.eyebrow", "Source terminology", "Terminologie aus Quellen")}</p><h1>{isTerm ? termTitle || t("vocab.usage.emptyWording", "Empty wording", "Leerer Wortlaut") : title}</h1><p>{isTerm ? t("vocab.usage.termIntro", "Follow the wording to its source accounts and related organs. Matching text does not establish equivalent components or a new vocabulary concept.", "Verfolgen Sie den Wortlaut zu den Quellenbeschreibungen und den zugehörigen Orgeln. Gleicher Wortlaut belegt weder gleichartige Bauteile noch einen neuen Vokabularbegriff.") : t("vocab.usage.intro", "Browse recorded wording. Case and spacing are grouped for lookup; original labels and source accounts remain available.", "Durchsuchen Sie den erfassten Quellenwortlaut. Für die Suche werden Groß- und Kleinschreibung sowie Leerzeichen zusammengefasst. Ursprüngliche Benennungen und Quellenbeschreibungen bleiben erhalten.")}</p>{isTerm && data && <a className="vh-next" href="#terminology-results">{parameters.get("section") === "organs" ? t("vocab.usage.jumpOrgans", "Go to related organs", "Zu den zugehörigen Orgeln") : t("vocab.usage.jumpOccurrences", "Go to recorded occurrences", "Zu den erfassten Vorkommen")}<ArrowRight size={14} aria-hidden="true" /></a>}</header>
    {!isTerm && <form className="vh-search" key={`${family}:${parameters.get("q") || ""}:${parameters.get("sort") || "frequency"}`} onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); go({ q: form.get("q"), sort: form.get("sort"), page: 0 }); }}><label>{t("vocab.usage.searchTitle", "Search {title}", "Sammlung „{title}“ durchsuchen", {title})}<input type="search" name="q" defaultValue={parameters.get("q") || ""} maxLength={200} /></label><label className="vh-order">{t('vocab.usage.order', "Order", "Sortierung")}<select aria-label={t('vocab.usage.order', "Order", "Sortierung")} name="sort" defaultValue={parameters.get("sort") || "frequency"}><option value="frequency">{t('vocab.usage.frequency', "Most recorded first", "Häufigste zuerst")}</option><option value="alphabetical">{t('vocab.usage.alphabetical', "Alphabetical", "Alphabetisch")}</option></select></label><button type="submit"><Search size={16} aria-hidden="true" />{t('vocab.usage.search', "Search wording", "Wortlaut suchen")}</button></form>}
    {error && <UsageError error={error} parameters={parameters} go={go} retry={response.retry} availableSnapshot={typeof collection?.snapshot === "string" ? collection.snapshot : undefined} />}{!data && !error && <p role="status" className="vh-loading">{t('vocab.usage.loading', "Loading terminology evidence…", "Terminologische Belege werden geladen …")}</p>}
    {data && <>
      {!isTerm&&<SaveVocabularyTerm contextKey={shareHref} label={t("vocab.usage.saveView", "Save wording view", "Wortlautansicht speichern")}/>}
      {isTerm && <>
        <div className="vh-stats" aria-label={t('vocab.usage.counts', "Counts in this source selection", "Zahlen zur Quellenauswahl")}><span><strong>{n(data.counts.occurrences)}</strong>{t('vocab.usage.occurrenceCount', "source occurrences", "Vorkommen in Quellen")}</span><span><strong>{n(data.counts.organs)}</strong>{t('vocab.usage.organCount', "organ records", "Orgeldatensätze")}</span><span><strong>{n(data.counts.sourceRecords)}</strong>{t('vocab.usage.sourceCount', "source records", "Quelldatensätze")}</span><span><strong>{n(data.counts.wordings)}</strong>{t('vocab.usage.wordingCount', "original wordings", "ursprüngliche Wortlautvarianten")}</span>{data.counts.accounts != null && family !== "activities" && <span><strong>{n(data.counts.accounts)}</strong>{t('vocab.usage.accountCount', "linked source accounts", "verknüpfte Quellenbeschreibungen")}</span>}</div>
        {data.counts.accounts === 0 && family !== "activities" && <p className="vh-muted">{t('vocab.usage.noAccounts', "No configuration-account identifiers are linked in these occurrences. Open the source records for their retained evidence.", "Diese Vorkommen sind mit keiner Kennung einer Quellenbeschreibung verknüpft. Die erfassten Belege finden Sie in den Quelldatensätzen.")}</p>}
        <p className="vh-mapping-summary"><a href="#terminology-mappings">Mapping evidence: {[...new Set<string>(data.mappings.map((mapping: Row) => mapping.status === "controlled" ? "controlled mappings" : mapping.status === "candidate" ? "candidate lexical mappings" : "unmapped wording"))].join(" · ")}</a></p>
        <form className="vh-search vh-organ-search" key={`${family}:${term}:${parameters.get("organ_q") || ""}`} role="search" aria-label={t('vocab.usage.organSearch', "Search related organs", "Zugehörige Orgeln suchen")} onSubmit={(event) => { event.preventDefault(); go({ organ_q: String(new FormData(event.currentTarget).get("organ_q") || "").trim(), page: 0 }); }}><label>{t('vocab.usage.organSearch', "Search related organs", "Zugehörige Orgeln suchen")}<input type="search" name="organ_q" defaultValue={parameters.get("organ_q") || ""} maxLength={200} placeholder={t("vocab.usage.organPlaceholder", "Organ name or MODAVIS ID", "Orgelname oder MODAVIS-Kennung")} aria-describedby="organ-search-help" /></label><button type="submit"><Search size={16} aria-hidden="true" />{t('vocab.usage.findOrgans', "Search organs", "Orgeln suchen")}</button>{parameters.get("organ_q") && <button type="button" className="vh-secondary" onClick={() => go({ organ_q: null, page: 0 })}>{t('vocab.usage.clearOrgan', "Clear organ search", "Orgelsuche zurücksetzen")}</button>}</form><p id="organ-search-help" className="vh-muted">{t('vocab.usage.organHelp', "Search within the current term, source and distribution filters.", "Die Suche berücksichtigt den ausgewählten Wortlaut sowie die Quellen- und Verteilungsfilter.")}</p>
        <div className="vh-controls vh-filter-bar"><label>{t('vocab.usage.match', "Match mode", "Suchmodus")}<select aria-label={t('vocab.usage.match', "Match mode", "Suchmodus")} value={parameters.get("match") || "exact"} onChange={(event) => go({ match: event.target.value, page: 0, distributionPage: 0 })}><option value="exact">{t('vocab.usage.exact', "Exact wording", "Genauer Wortlaut")}</option><option value="contains">{t('vocab.usage.contains', "Wording containing this text", "Wortlaut mit dieser Zeichenfolge")}</option></select></label><label>{t('vocab.usage.source', "Source", "Quelle")}<select aria-label={t('vocab.usage.source', "Source", "Quelle")} value={parameters.get("source") || ""} onChange={(event) => go({ source: event.target.value, page: 0, distributionPage: 0 })}><option value="">{t('vocab.usage.allSources', "All sources", "Alle Quellen")}</option>{parameters.get("source") && !data.sourceOptions.some((item: Row) => item.source_key === parameters.get("source")) && <option value={parameters.get("source")!}>{parameters.get("source")} · selected</option>}{data.sourceOptions.map((item: Row) => <option key={item.source_key} value={item.source_key}>{item.source_key} · {n(item.occurrences)}</option>)}</select></label><label>{t('vocab.usage.show', "Show", "Anzeigen")}<select aria-label={t('vocab.usage.show', "Show", "Anzeigen")} value={parameters.get("section") || "occurrences"} onChange={(event) => go({ section: event.target.value, page: 0 })}><option value="occurrences">{t('vocab.usage.showOccurrences', "Source occurrences", "Vorkommen in Quellen")}</option><option value="organs">{t('vocab.usage.showOrgans', "Related organ records", "Zugehörige Orgeldatensätze")}</option></select></label></div>
        <p className="vh-match-note">{data.match === "exact" ? "Exact lookup ignores case and repeated spaces; punctuation and additional words remain significant." : "Broader text matching does not group equivalent terms."} Accounts and reported dates remain separate.{family === "stops" && <> <a href="#faq-stop-matching">Missing an expected stop? Search FAQ</a></>}</p>
        <div className="vh-controls vh-selection-actions"><SaveVocabularyTerm contextKey={shareHref} /><button type="button" onClick={async () => { try { await navigator.clipboard.writeText(location.origin + shareHref); setNotice("copied"); } catch { setNotice("copyManually"); } }}><Copy size={16} aria-hidden="true" />{t('vocab.usage.copy', "Copy term link", "Link zum Wortlaut kopieren")}</button><a href={shareHref}>{t('vocab.usage.boundLink', "Snapshot-bound term link", "Link zum Wortlaut mit festem Datenstand")}</a>{data.counts.occurrences <= 50000 ? <a href={api.replace("?", "/export?")} download="modavis-source-terminology.json"><Download size={16} aria-hidden="true" />{t('vocab.usage.download', "Download complete occurrence evidence", "Vollständige Belege zu den Vorkommen herunterladen")}</a> : <span className="vh-muted">{t('vocab.usage.limit', "Complete exports support up to 50,000 occurrences. Narrow this selection with exact wording or a source.", "Vollständige Exporte sind bis zu 50.000 Vorkommen möglich. Schränken Sie die Auswahl auf den genauen Wortlaut oder eine Quelle ein.")}</span>}</div>{notice && <p role="status">{notice === "copied" ? t("vocab.usage.copied", "Snapshot-bound term link copied.", "Link zum Wortlaut mit festem Datenstand kopiert.") : t("vocab.usage.copyManually", "Copy the term link below.", "Kopieren Sie den unten angezeigten Link zum Wortlaut.")}</p>}
        {supportsDistributions && (parameters.get("organ_q")?.trim() ? <p className="vh-muted">{t('vocab.hub.clear', "Clear", "Zurücksetzen")} the organ search to explore distributions of the full term and source selection.</p> : <TermDistribution family={family} search={search} go={go} />)}
      </>}
      {parameters.get("dimension") && <p className="vh-applied-filter">Occurrence list filtered by {parameters.get("dimension")}: {parameters.get("bucket")?.replace(/^[a-z]:/, "")}. <button type="button" onClick={() => go({ dimension: null, bucket: null, page: 0 })}>{t('vocab.usage.clearGroup', "Clear group filter", "Gruppenfilter zurücksetzen")}</button></p>}
      <section id="terminology-results" className="vh-results-section" tabIndex={-1} aria-label={isTerm ? parameters.get("section") === "organs" ? "Related organs" : "Recorded occurrences" : "Recorded wordings"}>
        <div className="vh-section-heading"><h2>{isTerm ? parameters.get("section") === "organs" ? "Related organs" : "Recorded occurrences" : "Recorded wordings"}</h2></div><UsagePager data={data} term={isTerm} parameters={parameters} go={go} />
        {!data.total && <p className="vh-empty">{isTerm ? `No ${parameters.get("section") === "organs" ? "organs" : "occurrences"} match this selection. Adjust the organ search or selected filters.` : "No source wording matches this search. Try another spelling or clear the search."}</p>}
        {data.total > 0 && !data.items.length && <p className="vh-empty">This page is beyond the available results. <button type="button" onClick={() => go({ page: 0 })}>{t('vocab.usage.firstPage', "Open the first page", "Erste Seite öffnen")}</button></p>}
        <div className="vh-results">{data.items.map((item: Row, index: number) => !isTerm ? <article key={`${item.key}:${index}`} className="vh-wording-row"><div><h3><a href={item.href}>{item.label}</a></h3><p>{n(item.occurrences)} source occurrences</p></div><a className="vh-next" href={item.href}>{t('vocab.usage.inspect', "Inspect recorded uses", "Erfasste Verwendungen prüfen")}<ArrowRight size={14} aria-hidden="true" /></a></article> : parameters.get("section") === "organs" ? <article key={`${item.organ}:${index}`}><h3><a href={item.href}>{item.label}</a></h3><p>{n(item.occurrences)} matching occurrences</p></article> : <UsageOccurrence key={`${item.id}:${item.source}:${index}`} item={item} family={family} />)}</div><UsagePager data={data} term={isTerm} parameters={parameters} go={go} />
      </section>
      {isTerm && <details className="vh-context" id="terminology-mappings"><summary>Original wordings and mappings <span>{n(data.counts.wordings)} wordings</span></summary><div className="vh-variants">{data.variants.map((variant: Row) => <p key={variant.label}><a href={variant.href}>{variant.label}</a> · {n(variant.occurrences)} occurrences</p>)}</div>{data.variantsTruncated && <p>Showing the first 30 original wordings; the complete evidence export retains every occurrence.</p>}{data.mappings.map((mapping: Row, index: number) => <article className="vh-mapping" key={index}><span className="vh-kind">{mapping.status === "controlled" ? "Controlled mapping" : mapping.status === "candidate" ? "Candidate concept · accepted lexical mapping" : "Unmapped source wording"}</span><p>{n(mapping.occurrences)} occurrences</p>{mapping.href && <h3><a href={mapping.href}>{mapping.definition?.preferredLabel || mapping.concept}</a></h3>}{mapping.status === "candidate" && <><h3>{mapping.definition?.label?.en || mapping.concept}</h3><p>{mapping.definition?.definition}</p><p className="vh-muted">The lexical mapping is accepted; the concept remains unpublished and has not been promoted to the controlled vocabulary.</p></>}<VocabularyEvidence value={mapping} /></article>)}</details>}
      {!isTerm && data.candidateConcepts?.length > 0 && <details className="vh-context"><summary>Candidate reference entries for this collection <span>{data.candidateConcepts.length}</span></summary><p>These candidates cover the whole collection, independently of the wording search. Accepted lexical mappings do not promote them to controlled concepts.</p>{data.candidateConcepts.map((candidate: Row) => <article className="vh-mapping" key={candidate.id}><span className="vh-kind">Unpublished candidate</span><h3>{candidate.label.en}</h3><p>{candidate.definition}</p>{candidate.mappings.filter((mapping: Row) => mapping.family === family).flatMap((mapping: Row) => mapping.literals).map((word: string) => <p key={word}><a href={withQuery(usageLink(family, word), { snapshot: data.publicCoreSha256 })}>{word}: inspect recorded uses</a></p>)}<VocabularyEvidence value={candidate} /></article>)}</details>}
      <details className="vh-context"><summary>{t('vocab.usage.method', "Method, snapshot and citation", "Methode, Datenstand und Zitierhinweise")}</summary><p>{data.method}</p><p>{t('vocab.usage.methodNote', "These views retain POD source evidence; they do not create canonical vocabulary identifiers.", "Diese Ansichten zeigen die erfassten POD-Quellenbelege. Dabei werden keine kanonischen Vokabularkennungen erzeugt.")}</p><JsonEvidence value={{ publicCoreSha256: data.publicCoreSha256, researchIndexSha256: data.researchIndexSha256, methodSha256: data.methodSha256, selectionSha256: data.selectionSha256 }} label="Terminology citation" /></details>
    </>}
  </section>;
}

export function registryQueryIssue(parameters: URLSearchParams): RequestError | undefined {
  const issue = usageQueryIssue(parameters);
  if (issue) return issue;
  for(const key of ["coreSnapshot","indexSnapshot"])if(parameters.has(key)&&!parameters.get(key)?.trim())return {message:`The linked ${key} is empty. Choose an explicitly available snapshot before saving or browsing.`,status:400};
  const allowed = new Set(["concept", "scheme", "q", "language", "offset", "limit", "snapshot", "coreSnapshot", "indexSnapshot"]);
  const unknown = [...parameters.keys()].find((key) => !allowed.has(key));
  if (unknown) return { message: `Unsupported registry filter “${unknown}”. No filter has been discarded.`, status: 400 };
  if (parameters.has("concept") && !parameters.get("concept")) return { message: "An exact candidate identifier is required.", status: 400 };
  return undefined;
}
export function registryApiQuery(parameters: URLSearchParams) {
  if (!parameters.has("concept")) return new URLSearchParams(parameters);
  const next = new URLSearchParams({ uri: parameters.get("concept")! });
  for (const key of ["snapshot", "coreSnapshot", "indexSnapshot"]) if (parameters.has(key)) next.set(key, parameters.get(key)!);
  return next;
}
export function registryListLink(parameters: URLSearchParams) {
  const next = new URLSearchParams(parameters); next.delete("concept");
  return `/vocab/registry${next.size ? `?${next}` : ""}`;
}
export function registryExportLink(parameters: URLSearchParams, format: string) {
  const next = new URLSearchParams(parameters);
  for (const key of ["concept", "offset", "limit"]) next.delete(key);
  next.set("format", format);
  return `/api/vocab/registry/export?${next}`;
}

export function CandidateRecord({ candidate, language }: { candidate: Row; language?: string | null }) {
  return <section className="vh-candidate-record" aria-label="Candidate definition and mapping evidence">
    <div className="vh-candidate-status"><span className="vh-kind">Unpublished candidate</span><p>Accepted lexical mappings support lookup of recorded designations. They do not approve this concept as a controlled term or establish equivalent physical components.</p></div>
    <section className="vh-candidate-definition"><h2>Recorded definition</h2><p>{candidate.definition}</p></section>
    <section><h2>Recorded labels</h2><dl className="vh-labels">{Object.entries(candidate.label || {}).map(([code, label]) => <div key={code}><dt>{code}</dt><dd lang={code}>{String(label)}{code === language && <small>Selected label language</small>}</dd></div>)}</dl><p className="vh-muted">These language tags belong to the concept labels. The language of a source occurrence is not inferred.</p></section>
    <section className="vh-candidate-usage"><h2>Find recorded uses</h2><p>Each source field keeps its own exact lexical mappings. These links run exact wording lookups; a retained mapping may have no occurrences in this snapshot.</p>
      {(candidate.usageLinks ?? []).map((mapping: Row, index: number) => <article className="vh-mapping" key={`${mapping.family}:${index}`}><h3>{mapping.familyTitle || mapping.family}</h3><span className="vh-kind">{String(mapping.status || "Status not recorded").replace(/_/g, " ")}</span>
        <ul className="vh-usage-links">{mapping.wordings.map((wording: Row) => <li key={wording.label}><a href={wording.href}>{wording.label}<ArrowRight size={14} aria-hidden="true" /></a></li>)}</ul>
        {candidate.usage?.families?.filter((field: Row) => field.family === mapping.family).map((field: Row) => <p key={field.family}>{n(field.occurrences)} mapped source occurrences in this field</p>)}
        {mapping.researchHref && <a href={mapping.researchHref}>Inspect this mapping in the research workbench</a>}
      </article>)}
      {candidate.usage?.scope && <p className="vh-muted">{candidate.usage.scope}</p>}
    </section>
    {candidate.evidence?.length > 0 && <section><h2>Recorded references</h2><ul className="vh-reference-list">{candidate.evidence.map((reference: unknown, index: number) => <li key={index}>{typeof reference === "string" && /^https?:\/\//.test(reference) ? <a href={reference} target="_blank" rel="noreferrer">{reference}</a> : <code>{typeof reference === "string" ? reference : JSON.stringify(reference)}</code>}</li>)}</ul></section>}
    <details className="vh-context"><summary>Identifier, lifecycle and original evidence</summary><dl className="vh-identifiers"><dt>Candidate identifier</dt><dd><code>{candidate.id}</code></dd><dt>Candidate scheme</dt><dd><code>{candidate.scheme}</code></dd><dt>Recorded lifecycle</dt><dd>{candidate.lifecycle || "Not recorded"}</dd><dt>Mapping purpose</dt><dd>{candidate.mappingPurpose || "Not recorded"}</dd></dl><JsonEvidence value={candidate} label="Candidate terminology evidence" /></details>
  </section>;
}

export function registrySchemeOptions(schemes: Row[] = [], selected: string | null) {
  const current = selected ? schemes.find(scheme => scheme.id === selected) || { id: selected, title: selected } : null;
  return [...(current ? [current] : []), ...schemes.filter(scheme => scheme.id !== selected)];
}
export function registryLanguageOptions(languages: string[] = [], selected: string | null) {
  return [...new Set([...(selected ? [selected] : []), ...languages])];
}

export function CandidateVocabularyPage() {
  const { t, n } = useVocabularyText();
  const [search, setSearch] = useState(location.search);
  const parameters = new URLSearchParams(search);
  const isDetail = parameters.has("concept");
  const issue = registryQueryIssue(parameters);
  const api = `/api/vocab/registry${isDetail ? "/concept" : ""}?${registryApiQuery(parameters)}`;
  const response = useData(issue ? "" : api);
  const catalogue = useData("/api/vocab/catalogue");
  const availableSnapshot = catalogue.data?.collections.find((collection: VocabularyCollection) => collection.recordKind === "candidate" && typeof collection.snapshot === "string")?.snapshot;
  const [metadata, setMetadata] = useState<Row>();
  const data = issue ? undefined : response.data;
  const wrongScheme = data?.concept && parameters.has("scheme") && parameters.get("scheme") !== data.concept.scheme;
  const wrongLanguage = data && parameters.has("language") && !data.languages.includes(parameters.get("language"));
  const error = issue || response.error || (wrongScheme ? { message: "This candidate belongs to a different scheme than the link requests. No scheme has been substituted.", status: 409 } : undefined)
    || (wrongLanguage ? { message: "The requested candidate label language is unavailable.", status: 400 } : undefined);
  const candidate = !error ? data?.concept : undefined;
  const options = data || metadata;
  const pinned = new URLSearchParams(parameters);
  if (data && !pinned.has("snapshot")) pinned.set("snapshot", data.registrySha256);
  const shareHref = `/vocab/registry?${pinned}`;
  const [notice, setNotice] = useState("");
  useEffect(() => { const sync = () => setSearch(location.search); window.addEventListener("popstate", sync); return () => window.removeEventListener("popstate", sync); }, []);
  useEffect(() => {
    if (data && !error) {
      setMetadata(data);
      if (!parameters.has("snapshot")) { const next = new URLSearchParams(search); next.set("snapshot", data.registrySha256); history.replaceState({}, "", `${location.pathname}?${next}`); setSearch(location.search); }
    }
  }, [data, search]);
  function go(values: Row) {
    const next = new URLSearchParams(search);
    for (const [key, value] of Object.entries(values)) value === null || value === "" ? next.delete(key) : next.set(key, String(value));
    history.pushState({}, "", `/vocab/registry${next.size ? `?${next}` : ""}`); setSearch(location.search); setNotice("");
  }
  const selectedScheme = options?.schemes?.find((scheme: Row) => scheme.id === parameters.get("scheme"));
  return <section className="vh-page vh-registry-page" aria-label="Candidate terminology registry">
    <nav className="vh-breadcrumbs" aria-label="Vocabulary context"><a href="/vocab">All vocabularies</a>{isDetail && <><span aria-hidden="true">/</span><a href={registryListLink(parameters)}>Candidate registry</a></>}</nav>
    <header className="vh-hero vh-usage-hero"><p className="eyebrow">Unpublished candidate terminology</p><h1>{candidate ? candidateLabel(candidate, parameters.get("language")) : isDetail ? "Candidate terminology entry" : selectedScheme?.title || "Candidate terminology registry"}</h1><p>Read the frozen registry’s definitions and field-specific lexical mappings. Candidate lifecycle and mapping acceptance remain separate.</p></header>
    {candidate&&data&&<SaveVocabularyTerm contextKey={vocabularyCaptureUrl("/vocab/registry",search,{snapshot:data.registrySha256,coreSnapshot:data.publicCoreSha256,indexSnapshot:data.researchIndexSha256})} />}
    {!isDetail && <form className="vh-search vh-registry-search" key={`${parameters.get("q") || ""}:${parameters.get("scheme") || ""}:${parameters.get("language") || ""}`} onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); go({ q: form.get("q"), scheme: form.get("scheme"), language: form.get("language"), offset: 0 }); }}>
      <label>Search candidate entries<input type="search" name="q" maxLength={200} defaultValue={parameters.get("q") || ""} placeholder="Recorded label, definition or mapping wording" /></label>
      <label>Candidate scheme<select name="scheme" defaultValue={parameters.get("scheme") || ""}><option value="">All candidate schemes</option>{registrySchemeOptions(options?.schemes, parameters.get("scheme")).map((scheme: Row) => <option key={scheme.id} value={scheme.id}>{scheme.title}{scheme.conceptCount != null ? ` · ${n(scheme.conceptCount)}` : ""}</option>)}</select></label>
      <label className="vh-order">Label language<select name="language" defaultValue={parameters.get("language") || ""}><option value="">All recorded languages</option>{registryLanguageOptions(options?.languages, parameters.get("language")).map((language: string) => <option key={language} value={language}>{language}</option>)}</select></label>
      <button type="submit"><Search size={16} aria-hidden="true" />Search registry</button>
    </form>}
    {error && <><SearchFailure error={error} retry={response.retry} />{availableSnapshot && parameters.get("snapshot") !== availableSnapshot && (error.status === 409 || parameters.get("snapshot") === "") && <button type="button" onClick={() => go({ snapshot: availableSnapshot })}>Open this selection on the available registry snapshot</button>}</>}{!data && !error && <p role="status" className="vh-loading">Loading frozen candidate registry…</p>}
    {data && !error && <>
      {!isDetail && <><SaveVocabularyTerm contextKey={vocabularyCaptureUrl("/vocab/registry",search,{snapshot:data.registrySha256,coreSnapshot:data.publicCoreSha256,indexSnapshot:data.researchIndexSha256})} label="Save candidate view"/><p className="vh-selection-summary"><strong>{n(data.total)}</strong> candidate entries in this selection · {n(data.registryConceptCount)} in the frozen registry. This is not a formal controlled-vocabulary release.</p>
        <nav className="vh-pager" aria-label="Candidate result pages"><button type="button" disabled={!data.offset} onClick={() => go({ offset: Math.max(0, data.offset - data.limit) })}>Previous</button><span>{data.items.length ? data.offset + 1 : 0}–{data.items.length ? Math.min(data.total, data.offset + data.items.length) : 0} of {n(data.total)} candidates</span><button type="button" disabled={!data.hasMore} onClick={() => go({ offset: data.offset + data.limit })}>Next</button></nav>
        {!data.total && <p className="vh-empty">No candidates match these registry filters. No source wording has been promoted or substituted.</p>}
        {data.total > 0 && !data.items.length && <p className="vh-empty">This page is beyond the matching candidates. <button type="button" onClick={() => go({ offset: 0 })}>{t('vocab.usage.firstPage', "Open the first page", "Erste Seite öffnen")}</button></p>}
        <div className="vh-grid vh-candidates">{data.items.map((item: Row) => <article key={item.id} className="vh-collection"><span className="vh-kind">Unpublished candidate</span><h2><a href={withQuery(shareHref, { concept: item.id })}>{candidateLabel(item, parameters.get("language"))}</a></h2><p>{item.definition}</p><small>{data.schemes.find((scheme: Row) => scheme.id === item.scheme)?.title || item.scheme}</small><a className="vh-next" href={withQuery(shareHref, { concept: item.id })}>Definition and recorded uses<ArrowRight size={14} aria-hidden="true" /></a></article>)}</div>
      </>}
      {candidate && <CandidateRecord candidate={candidate} language={parameters.get("language")} />}
      <div className="vh-controls vh-selection-actions"><button type="button" onClick={async () => { try { await navigator.clipboard.writeText(location.origin + shareHref); setNotice("Registry snapshot link copied."); } catch { setNotice("Copy the registry link below."); } }}><Copy size={16} aria-hidden="true" />Copy registry link</button><a href={shareHref}>Snapshot-bound registry link</a>{candidate && <a href={api} download="modavis-candidate-entry.json"><Download size={16} aria-hidden="true" />Download candidate evidence · JSON</a>}</div>{notice && <p role="status">{notice}</p>}
      {!isDetail && <section className="vh-registry-downloads" aria-label="Complete candidate selection downloads"><h2>Download this registry selection</h2><p>Every matching candidate is included, independently of the displayed page. Original local identifiers and candidate status are retained.</p><div className="vh-controls">{[["json", "JSON"], ["csv", "CSV"], ["jsonld", "JSON-LD"], ["ttl", "Turtle"], ["skos", "SKOS"]].map(([format, label]) => <a key={format} href={registryExportLink(pinned, format)} download><Download size={15} aria-hidden="true" />{label}</a>)}</div></section>}
      <details className="vh-context"><summary>Registry scope, version and citation</summary><p>{data.scope}</p><p>{data.languagePolicy}</p><JsonEvidence value={{ contract: data.contract, registrySha256: data.registrySha256, publicCoreSha256: data.publicCoreSha256, researchIndexSha256: data.researchIndexSha256, selectionSha256: data.selectionSha256, formalRelease: data.formalRelease }} label="Candidate registry citation" /></details>
    </>}
  </section>;
}
