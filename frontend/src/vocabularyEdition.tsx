import { useEffect, useState } from "react";
import { publicGetJson } from "./api";
import { LoadingContent } from "./LoadingContent";
import { SaveVocabularyTerm } from "./SaveVocabularyTerm";
import { useUiLocale } from "./uiLocale";
import { editionReadingUrl, type VocabularyEditionId } from "./vocabularyRoutes";
import "./vocabularyRecords.css";

type Text = Record<string, string>;
type Link = {
  labels: Text; schemeTitle: Text; vocabulary: string; href: string;
  relation: string; note?: Text; evidenceUrl?: string;
};
type Scheme = { id: string; title: Text; description?: Text; count: number; href: string };
type Edition = {
  id: string; title: Text; version: string; contentSha256: string;
  licenseUrl?: string; rights?: Text; rightsUrl?: string; sourceUrl: string;
  attribution: string; description?: Text; downloadUrl?: string; schemes: Scheme[];
  history?: { version: string; changes: Text }[];
  formats: { format: string; href: string }[];
};
type Term = {
  id: string; code: string; labels: Text; sourceUri?: string; definition?: Text; scopeNote?: Text;
  evidence?: { family?: string; wording?: string; label?: Text; href: string }[];
  relatedTerms?: { labels: Text; href: string }[];
  references?: { title: string; href?: string; url?: string }[];
  schemeTitle?: Text; href?: string; translationStatus?: string; otherVocabularies?: Link[];
  forms?: { type: string; labels: Text }[]; aliases?: Record<string, string[]>;
  relationshipType?: string; sourceDirection?: string;

};
type Reading = { edition: Edition; scheme?: Scheme; term?: Term; items?: Term[]; offset?: number; limit?: number; total?: number };
const text = (labels: Text, language: string) => labels[language] || labels.en || labels.de || Object.values(labels)[0];

export function OtherVocabularies({ links, language = "en" }: { links?: Link[]; language?: string }) {
  if (!links?.length) return null;
  return <section className="vr-linked-terms">
    <h2>{language === "de" ? "Verwandte Einträge in anderen Vokabularen" : "Terms in other vocabularies"}</h2>
    <ul className="vr-record-list">{links.map(link => <li key={link.href}><article>
      <h3><a href={link.href}>{text(link.labels, language)}</a></h3>
      <p>{link.vocabulary} · {text(link.schemeTitle, language)} · {link.relation === "exact"
        ? (language === "de" ? "Dokumentierte Entsprechung" : "Documented equivalent")
        : (language === "de" ? "Verwandte Benennung" : "Related term")}</p>
      {link.note && <p>{text(link.note, language)}</p>}
      {link.evidenceUrl && <a href={link.evidenceUrl}>{language === "de" ? "Zuordnungsbeleg" : "Mapping evidence"}</a>}
    </article></li>)}</ul>
  </section>;
}

export default function VocabularyEdition({ edition, scheme, term }: {
  edition: VocabularyEditionId; scheme?: string; term?: string;
}) {
  const { locale } = useUiLocale();
  const params = new URLSearchParams(location.search);
  const language = params.get("language") || locale;
  const german = language === "de";
  const label = (en: string, de: string) => german ? de : en;
  const prefix = edition === "modavis" ? "/vocab/editions/modavis" : "/vocab/" + edition;
  const pathname = prefix + (scheme ? "/" + encodeURIComponent(scheme) : "") + (term ? "/" + encodeURIComponent(term) : "");
  const [draft, setDraft] = useState(params.get("q") || "");
  const [query, setQuery] = useState(params.get("q") || "");
  const [offset, setOffset] = useState(params.get("offset") || "0");
  const snapshot = params.get("snapshot");
  const search = new URLSearchParams({ language });
  if (snapshot) search.set("snapshot", snapshot);
  if (!term) {
    if (query) search.set("q", query);
    if (offset !== "0") search.set("offset", offset);
  }
  const endpoint = editionReadingUrl({ edition, scheme, term }, search);
  const [state, setState] = useState<{ endpoint: string; data?: Reading; error?: string }>();
  const [attempt, retry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    const read = publicGetJson<Reading>(endpoint, controller.signal);
    read.then(data => { if (!controller.signal.aborted) setState({ endpoint, data }); }).catch(error => {
      if (!controller.signal.aborted) setState({ endpoint, error: String(error.message || error) });
    });
    return () => controller.abort();
  }, [edition, endpoint, attempt]);
  useEffect(() => {
    if (term || draft === query) return;
    const timer = window.setTimeout(() => { setOffset("0"); setQuery(draft.trim()); }, 190);
    return () => window.clearTimeout(timer);
  }, [draft, edition, query, term]);
  const data = state?.endpoint === endpoint ? state.data : undefined;
  const issue = state?.endpoint === endpoint ? state.error : undefined;
  const localHref = (path: string, filters: Record<string, string> = {}) => {
    const next = new URLSearchParams({ language, ...(snapshot ? { snapshot } : {}), ...filters });
    return path + "?" + next;
  };
  const checksum = data?.edition.contentSha256;
  const workspaceHref = checksum && /^[a-f0-9]{64}$/.test(checksum) && (!snapshot || snapshot === checksum)
    ? localHref(pathname, {
      ...(!term && query ? { q: query } : {}),
      ...(!term && offset !== "0" ? { offset } : {}),
      snapshot: checksum,
    }) : null;
  const activeScheme = data?.edition.schemes.find(item => item.id === scheme);
  const heading = (data?.term && text(data.term.labels, language))
    || (activeScheme && text(activeScheme.title, language))
    || (data && text(data.edition.title, language))
    || label("Vocabulary edition", "Vokabularausgabe");
  useEffect(() => { document.title = heading + " | MODAVIS Navigator"; }, [heading]);
  return <article className="vocabulary-reader">
    <nav className="vr-breadcrumbs" aria-label={label("Breadcrumb", "Brotkrumennavigation")}>
      <a href="/vocab">{label("Vocabularies", "Vokabulare")}</a>
      {scheme && <a href={localHref(prefix)}>{data ? text(data.edition.title, language) : label("Vocabulary edition", "Vokabularausgabe")}</a>}
      {term && data?.scheme && <a href={localHref(data.scheme.href)}>{text(data.scheme.title, language)}</a>}
    </nav>
    <header className="vr-header"><div><h1>{heading}</h1>{!term && (activeScheme?.description || data?.edition.description) &&
      <p>{text(activeScheme?.description || data!.edition.description!, language)}</p>}</div>
      <div className="vr-version"><span>{label("Edition", "Ausgabe")}</span><strong>{data?.edition.version}</strong>
        <label>{label("Display language", "Anzeigesprache")} <select value={language} onChange={event => {
          location.href = localHref(pathname, { ...(query ? { q: query } : {}), language: event.target.value });
        }}><option value="en">English</option><option value="de">Deutsch</option></select></label>
      </div>
    </header>
    {!term && <form className="vr-search" role="search" action={pathname}>
      <label><span>{label("Find a term", "Benennung suchen")}</span><input type="search" maxLength={200} name="q" value={draft} onChange={event => setDraft(event.target.value)} /></label>
      <input type="hidden" name="language" value={language} />{snapshot && <input type="hidden" name="snapshot" value={snapshot} />}
      <button type="submit">{label("Search", "Suchen")}</button>
    </form>}
    {workspaceHref && <div className="vr-actions"><SaveVocabularyTerm contextKey={workspaceHref} label={term ? "Save term" : "Save vocabulary view"} /></div>}
    {issue && <p role="alert">{issue} <button type="button" onClick={() => { setState(undefined); retry(value => value + 1); }}>{label("Try again", "Erneut versuchen")}</button></p>}
    {!data && !issue && <LoadingContent kind="rows" label={label("Loading vocabulary…", "Vokabular wird geladen …")} />}
    {data && (data.term ? <>
      <section className="vr-definition-section"><h2>{edition === "musixplora"
        ? label("Source labels", "Benennungen der Quelle") : label("Labels and definition", "Benennungen und Definition")}</h2>
        <dl className="vr-facts">{Object.entries(data.term.labels).map(([lang, value]) => <div key={lang}><dt>{lang === "de" ? "Deutsch" : lang === "en" ? "English" : lang === "und" ? label("Language unrecorded", "Sprache nicht erfasst") : lang}</dt><dd lang={lang}>{value}</dd></div>)}
          <div><dt>{label("Source code", "Quellcode")}</dt><dd>{data.term.code}</dd></div>
          {data.term.relationshipType && <div><dt>{label("Relationship type", "Beziehungsart")}</dt>
            <dd><a href={localHref(prefix + "/relationship-type/" + encodeURIComponent(data.term.relationshipType))}>{data.term.relationshipType}</a></dd>
          </div>}
          {data.term.sourceDirection && <div><dt>{label("Source direction code", "Richtungscode der Quelle")}</dt><dd>{data.term.sourceDirection}</dd></div>}
        </dl>
        {!data.term.labels.en && <p>{label("The source edition supplies no English label.", "Die Quellausgabe enthält keine englische Benennung.")}</p>}
        {data.term.definition && <p>{text(data.term.definition, language)}</p>}
        {data.term.scopeNote && <p>{text(data.term.scopeNote, language)}</p>}
        {data.term.sourceUri && <a href={data.term.sourceUri}>{label("Open the term in musiXplora", "Eintrag in musiXplora öffnen")}</a>}
      </section>
      <OtherVocabularies links={data.term.otherVocabularies} language={language} />
      <TermSources term={data.term} german={german} />
      {Boolean(data.term.forms?.length || data.term.aliases) && <section className="vr-linked-terms">
        <h2>{label("Source forms and aliases", "Formen und Alternativbenennungen der Quelle")}</h2>
        {data.term.forms?.length ? <ul>{data.term.forms.map((form, index) => <li key={index}>
          {Object.entries(form.labels).map(([lang, value]) => <span lang={lang} key={lang}>{value} ({lang}) </span>)}
        </li>)}</ul> : <ul>{Object.entries(data.term.aliases || {}).map(([lang, aliases]) => <li lang={lang} key={lang}>{aliases.join(" · ")}</li>)}</ul>}
      </section>}
    </> : <>
      {!scheme && !query && <ul className="vr-record-list vr-edition-schemes">{data.edition.schemes.map(item => <li key={item.id}><article>
        <h3><a href={localHref(item.href)}>{text(item.title, language)}</a></h3><span>{item.count.toLocaleString(language)}</span>
      </article></li>)}</ul>}
      {data.items && (scheme || query) && <section aria-label={label("Matching terms", "Passende Benennungen")}>
        <p role="status">{data.total?.toLocaleString(language)} {label("matching terms", "passende Benennungen")}</p>
        <ul className="vr-record-list">{data.items.map(item => <li key={item.href}><article>
          <h3><a href={localHref(item.href!)}>{text(item.labels, language)}</a></h3>
          <span>{item.schemeTitle && text(item.schemeTitle, language)} · {item.code}</span>
        </article></li>)}</ul>
        <nav className="vr-pagination" aria-label={label("Vocabulary result pages", "Ergebnisseiten")}>
          {(data.offset ?? 0) > 0 && <a href={localHref(pathname, { q: query, offset: String(Math.max(0, data.offset! - data.limit!)) })}>{label("Previous", "Zurück")}</a>}
          {data.offset! + data.items.length < data.total! && <a href={localHref(pathname, { q: query, offset: String(data.offset! + data.limit!) })}>{label("Next", "Weiter")}</a>}
        </nav>
      </section>}
      <section className="vr-definition-section"><h2>{label("Download and cite", "Download und Zitation")}</h2>
        <p>{data.edition.attribution}</p>
        {data.edition.rights && <p>{text(data.edition.rights, language)}</p>}
        <div className="vr-actions">
          <a href={data.edition.sourceUrl}>{label("Source edition", "Quellausgabe")}</a>
          {(data.edition.licenseUrl || data.edition.rightsUrl) && <a href={data.edition.licenseUrl || data.edition.rightsUrl}>{label("Reuse rights", "Nutzungsrechte")}</a>}
          {data.edition.formats.map(item => <a href={item.href} key={item.format}>{item.format === "ttl" ? "SKOS / Turtle" : item.format.toUpperCase()}</a>)}
          {data.edition.downloadUrl && <a href={data.edition.downloadUrl}>{label("Original download", "Originaldownload")}</a>}
          <a href={localHref(pathname, { snapshot: data.edition.contentSha256 })}>{label("Permanent edition link", "Link zu dieser Ausgabe")}</a>
        </div>
        <p className="vr-checksum">SHA-256 <code>{data.edition.contentSha256}</code></p>
        {data.edition.history?.length && <details className="vr-disclosure"><summary>{label("Version history", "Versionsgeschichte")}</summary>
          <ul>{data.edition.history.map(entry => <li key={entry.version}><strong>{entry.version}</strong> · {text(entry.changes, language)}</li>)}</ul>
        </details>}
      </section>
    </>)}
  </article>;
}


function TermSources({ term, german }: { term: Term; german: boolean }) {
  if (!term.evidence?.length && !term.references?.length && !term.relatedTerms?.length) return null;
  const language = german ? "de" : "en";
  return <section className="vr-linked-terms">
    {term.evidence?.length ? <>
      <h2>{german ? "Belegter Quellenwortlaut" : "Documented source wording"}</h2>
      <ul>{term.evidence.map(item => <li key={item.href}><a href={item.href}>
        {item.label ? text(item.label, language) : item.wording}</a></li>)}</ul>
    </> : null}
    {term.relatedTerms?.length ? <>
      <h2>{german ? "Verwandte Begriffe" : "Related terms"}</h2>
      <ul>{term.relatedTerms.map(item => <li key={item.href}><a href={item.href}>{text(item.labels, language)}</a></li>)}</ul>
    </> : null}
    {term.references?.length ? <>
      <h2>{german ? "Fachquellen" : "References"}</h2>
      <ul>{term.references.map(item => <li key={item.title}><a href={item.href || item.url}>{item.title}</a></li>)}</ul>
    </> : null}
  </section>;
}
