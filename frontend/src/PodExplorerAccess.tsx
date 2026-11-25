import {useEffect, useState} from 'react';
import {ArrowRight, Braces, Download, FileDown, Play} from 'lucide-react';
import {downloadPodJson, podJson, usePodRead} from './PodExplorerApi';
import {internalHref} from './PodExplorerModel';
import {useUiLocale} from './uiLocale';

export type Access = {graphqlAvailable:boolean;graphqlEndpoint:string;entityKinds:string[];profiles:string[];distributionManifest:string;releaseContext:string;researchPackages:boolean;semanticDistributionsAvailable?:boolean;vocabularyReferenceAvailable?:boolean};
const examples = {
  organs: ['query FindOrgans($text: String!) {','  snapshot','  organs(query: $text, limit: 5) {','    total','    items { id title canonicalUri }','  }','}'].join('\n'),
  entity: ['query InspectEntity($kind: EntityKind!, $id: ID!) {','  snapshot','  entity(kind: $kind, id: $id) {','    id kind title canonicalUri','    evidence {','      fieldCount unavailable sourceContextOnly','      evidenceContextAvailable recordSha256','    }','  }','}'].join('\n'),
};
type ExportManifest = {mdvsId?:string;entityKind?:string;datasheetUrl?:string;sourceDataUrl?:string;native?:{key:string;label:string;url:string}[];profiles?:{key:string;label:string;format:string;url:string}[]};

const entityKinds: Record<string, readonly [string, string]> = {
  organ: ['organ', 'Orgel'], person: ['person', 'Person'], organization: ['organization', 'Organisation'],
  place: ['place', 'Ort'], name: ['name', 'Name'], virtual_instrument: ['virtual instrument', 'Virtuelles Instrument'],
};

type QueryError = {kind:'variables'|'timeout'|'request'; detail?:string};

export function PodExplorerAccess({snapshot, access}: {snapshot:string|null;access:Access}) {
  const {t} = useUiLocale();
  const [example, setExample] = useState<keyof typeof examples>('organs');
  const [query, setQuery] = useState(examples.organs);
  const [variables, setVariables] = useState(JSON.stringify({text:'Leipzig'}, null, 2));
  const [result, setResult] = useState<{snapshot:string|null;query:string;variables:Record<string,unknown>;response:unknown}>();
  const [error, setError] = useState<QueryError>(); const [busy, setBusy] = useState(false);
  const [kind, setKind] = useState('organ'); const [identifier, setIdentifier] = useState('FFH7-Z9KV-V');
  const [exportUrl, setExportUrl] = useState('/api/exports/organ/FFH7-Z9KV-V');
  const exported = usePodRead<ExportManifest>(exportUrl);
  useEffect(() => {
    const id = window.location.hash.slice(1);
    if (id === 'pod-entity-export' || id === 'pod-graphql' || id === 'pod-dataset-downloads') {
      document.getElementById(id)?.scrollIntoView({block:'start'});
    }
  }, []);
  async function run() {
    setError(undefined); setBusy(true); setResult(undefined);
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 15000);
    try {
      let values: unknown;
      try { values = JSON.parse(variables); } catch { setError({kind:'variables'}); return; }
      if (!values || typeof values !== 'object' || Array.isArray(values)) { setError({kind:'variables'}); return; }
      const output = await podJson<unknown>(access.graphqlEndpoint, {method:'POST', signal:controller.signal,
        headers:{'Content-Type':'application/json'}, body:JSON.stringify({snapshot, query, variables:values})});
      setResult({snapshot, query, variables:values as Record<string,unknown>, response:output});
    } catch (e) {setError(e instanceof Error && e.name === 'AbortError' ? {kind:'timeout'} : {kind:'request', detail:String(e instanceof Error ? e.message : e)});}
    finally {clearTimeout(timer); setBusy(false);}
  }
  return <div className="pod-access">
    <nav className="pod-access-nav" aria-label={t('pod.access.tools', "Data access tools", "Werkzeuge für den Datenzugriff")}>
      <a href="#pod-entity-export"><FileDown size={15} aria-hidden="true"/> {t('pod.access.exports', "Entity exports", "Datensatzexporte")}</a>
      <a href="#pod-graphql"><Braces size={15} aria-hidden="true"/> GraphQL</a>
      <a href="#pod-dataset-downloads"><Download size={15} aria-hidden="true"/> {t('pod.access.datasets', "Dataset & selections", "Datensatz und Auswahlen")}</a>
    </nav>
    <section id="pod-entity-export" className="pod-access-section" aria-labelledby="pod-export-heading">
      <header><h3 id="pod-export-heading">{t('pod.access.export.title', "Export an entity", "Einzeldatensatz exportieren")}</h3><p>{t('pod.access.export.intro', "Choose an identifier to find its formats, semantic profiles and supporting evidence.", "Wählen Sie eine Kennung, um verfügbare Formate, semantische Profile und zugehörige Belegdaten abzurufen.")}</p></header>
      <form className="pod-filter-form pod-export-form" onSubmit={event=>{event.preventDefault();setExportUrl('/api/exports/'+kind+'/'+encodeURIComponent(identifier.trim()));}}>
        <label>{t('pod.access.export.kind', "Entity kind", "Entitätstyp")}<select value={kind} onChange={event=>setKind(event.target.value)}>{access.entityKinds.map(value=><option key={value} value={value}>{entityKinds[value] ? t('pod.access.entity.'+value, ...entityKinds[value]) : value}</option>)}</select></label>
        <label>{t('pod.access.export.id', "MODAVIS identifier", "MODAVIS-Kennung")}<input required maxLength={256} value={identifier} onChange={event=>setIdentifier(event.target.value)}/></label>
        <button type="submit">{t('pod.access.export.find', "Find exports", "Exportformate suchen")} <ArrowRight size={15} aria-hidden="true"/></button>
      </form>
      {exported.error?<div role="alert"><p>{t('pod.access.error.export', 'The export manifest could not be loaded.', 'Das Verzeichnis der Exportformate konnte nicht geladen werden.')} <code lang="en">{exported.error}</code></p><button onClick={exported.retry}>{t('pod.access.export.retry', "Retry export lookup", "Exportformate erneut abrufen")}</button></div>:!exported.data?<p role="status">{t('pod.access.export.loading', "Loading export manifest…", "Verzeichnis der Exportformate wird geladen …")}</p>:<>
        <div className="pod-resolved-entity"><span>{t('pod.access.export.profiles', "Available profiles", "Verfügbare Profile")}</span>{exported.data.mdvsId&&<code>{exported.data.mdvsId}</code>}</div>
        <div className="pod-export-grid">{exported.data.profiles?.map(item=><a key={item.key} href={internalHref(item.url)}><strong>{item.label}</strong><span>{item.format}</span><Download size={15} aria-hidden="true"/></a>)}</div>
        {!!exported.data.native?.length&&<div className="pod-native-formats" aria-label={t('pod.access.export.nativeAria', "Native export formats", "MODAVIS-Exportformate")}><span>{t('pod.access.export.native', "Native formats", "MODAVIS-Formate")}</span>{exported.data.native.map(item=><a key={item.key} href={internalHref(item.url)}>{item.label}</a>)}</div>}
        <div className="pod-evidence-links">
          {exported.data.datasheetUrl&&<a href={internalHref(exported.data.datasheetUrl)}>{t('pod.access.export.datasheet', "Readable entity datasheet", "Lesbare Datensatzübersicht")}</a>}
          <a href={exportUrl+'/evidence'}>{t('pod.access.export.evidence', "Field evidence coverage", "Belegübersicht je Datenfeld")}</a>
          {exported.data.sourceDataUrl&&<a href={internalHref(exported.data.sourceDataUrl)}>{t('pod.access.export.sources', "Source projections", "Strukturierte Quellendaten")}</a>}
          <a href={exportUrl}>{t('pod.access.export.manifest', "Export manifest · JSON", "Verzeichnis der Exportformate · JSON")}</a>
        </div>
      </>}
    </section>
    <section id="pod-graphql" className="pod-access-section" aria-labelledby="pod-graphql-heading">
      <header><h3 id="pod-graphql-heading">{t('pod.access.query.title', "Query with GraphQL", "Daten mit GraphQL abfragen")}</h3><p>{t('pod.access.query.intro', "Start with an example. Edit its variables, run it and download the result.", "Wählen Sie ein Beispiel, passen Sie die Variablen an und führen Sie die Abfrage aus. Das Ergebnis können Sie herunterladen.")} <a href="/about/api">{t('pod.access.query.guide', "API guide and examples", "API-Leitfaden mit Beispielen")}</a></p></header>
      <label className="pod-query-preset">{t('pod.access.query.example', "Example", "Beispiel")}<select value={example} onChange={event => {
        const value=event.target.value as keyof typeof examples;setExample(value);setQuery(examples[value]);
        setVariables(JSON.stringify(value==='organs'?{text:'Leipzig'}:{kind:'organ',id:'FFH7-Z9KV-V'},null,2));setResult(undefined);setError(undefined);
      }}><option value="organs">{t('pod.access.query.findOrgans', "Find organs", "Orgeln suchen")}</option><option value="entity">{t('pod.access.query.inspectEntity', "Inspect an entity and its evidence", "Datensatz und Belegdaten prüfen")}</option></select></label>
      <div className="pod-query-columns">
        <label>{t('pod.access.query.input', "GraphQL query", "GraphQL-Abfrage")}<textarea spellCheck={false} rows={8} maxLength={12000} value={query} onChange={event=>setQuery(event.target.value)}/></label>
        <label>{t('pod.access.query.variables', "Variables · JSON", "Variablen · JSON")}<textarea spellCheck={false} rows={8} maxLength={12000} value={variables} onChange={event=>setVariables(event.target.value)}/></label>
      </div>
      <div className="pod-query-details">
        <details><summary>{t('pod.access.query.limits', "Supported data and query limits", "Unterstützte Daten und Abfragegrenzen")}</summary><p>{t('pod.access.query.details', "Queries read public records from this exact snapshot. Supported roots: snapshot, entity and organs. Up to four root fields, 50 organs per page and offset 10,000. Mutations, subscriptions, fragments, directives and introspection are refused. A score’s availability does not add it to this GraphQL profile.", "Die Abfragen lesen öffentliche Datensätze aus diesem festgelegten Datenstand. Auf oberster Ebene stehen snapshot, entity und organs zur Verfügung. Je Abfrage sind bis zu vier Felder auf dieser Ebene, 50 Orgeln pro Seite und ein Versatz von 10.000 Zeilen möglich. Mutationen, Abonnements, Fragmente, Direktiven und Introspektion werden abgewiesen. Verfügbare Notenausgaben gehören nicht zum Umfang dieses GraphQL-Profils.")}</p></details>
        {snapshot?<details><summary>{t('pod.access.query.snapshot', "Dataset snapshot", "Festgelegter Datenstand")}</summary><code>{snapshot}</code></details>:<p role="status">{t('pod.access.query.noSnapshot', "A pinned snapshot is unavailable. REST browsing remains available.", "Ein fester Datenstand ist derzeit nicht verfügbar. Der Zugriff über REST bleibt möglich.")}</p>}
        {snapshot&&!access.graphqlAvailable&&<p role="status">{t('pod.access.query.unavailable', "GraphQL is currently unavailable. Entity exports remain available above.", "GraphQL ist derzeit nicht verfügbar. Einzeldatensätze können Sie weiterhin oben exportieren.")}</p>}
      </div>
      <div className="pod-actions"><button className="pod-run" disabled={busy||!snapshot||!access.graphqlAvailable} onClick={run}><Play size={15} aria-hidden="true"/>{busy?t('pod.access.query.busy', 'Running query…', 'Abfrage läuft …'):t('pod.access.query.run', 'Run query', 'Abfrage ausführen')}</button>
        {result!==undefined&&<button onClick={()=>downloadPodJson(result,'modavis-pinned-query.json')}><Download size={15} aria-hidden="true"/> {t('pod.access.query.download', "Download query and response", "Abfrage und Antwort herunterladen")}</button>}
      </div>
      {error&&<p role="alert">{error.kind==='variables'
        ? t('pod.access.error.variables', 'Variables must be a JSON object.', 'Die Variablen müssen als JSON-Objekt vorliegen.')
        : error.kind==='timeout'
          ? t('pod.access.error.timeout', 'The query exceeded the client time budget. Narrow it and retry.', 'Die Abfrage hat das Zeitlimit im Browser überschritten. Schränken Sie die Abfrage ein und versuchen Sie es erneut.')
          : <>{t('pod.access.error.request', 'The query could not be completed.', 'Die Abfrage konnte nicht abgeschlossen werden.')} {error.detail&&<code lang="en">{error.detail}</code>}</>}</p>}
      {result!==undefined&&<div className="pod-query-result" aria-live="polite"><header><strong>{t('pod.access.query.response', "Query response", "Antwort auf die Abfrage")}</strong><span>JSON</span></header><p>{t('pod.access.query.responseNote', "This response and its download retain the exact query and variables from the last run.", "Die Anzeige und die Downloaddatei enthalten die genaue Abfrage und die Variablen des letzten Durchlaufs.")}</p><pre className="pod-json" tabIndex={0}>{JSON.stringify(result.response,null,2)}</pre></div>}
    </section>
    <section id="pod-dataset-downloads" className="pod-access-section" aria-labelledby="pod-dataset-heading">
      <header><h3 id="pod-dataset-heading">{t('pod.access.downloads.title', "Dataset & complete selections", "Datensatz und vollständige Auswahlen")}</h3><p>{t('pod.access.downloads.intro', "Reuse the release or keep a complete research selection with its evidence and rights information.", "Verwenden Sie diese Datensatzversion weiter oder speichern Sie eine vollständige Rechercheauswahl samt Belegdaten und Rechtehinweisen.")}</p></header>
      <div className="pod-download-grid">
        <div>{access.semanticDistributionsAvailable!==false?<a href={access.distributionManifest}>{t('pod.access.downloads.manifest', "Bulk distribution manifest", "Verzeichnis der Downloadpakete")} <ArrowRight size={15} aria-hidden="true"/></a>:<span>{t('pod.access.downloads.unavailable', "Bulk distributions are currently unavailable.", "Die Downloadpakete sind derzeit nicht verfügbar.")}</span>}<p>{t('pod.access.downloads.files', "Release files, formats and checksums.", "Dateien, Formate und Prüfsummen dieser Datensatzversion.")}</p></div>
        <div><a href="/use-cases/research-workbench">{t('pod.access.downloads.build', "Build a research selection", "Rechercheauswahl erstellen")} <ArrowRight size={15} aria-hidden="true"/></a><p>{t('pod.access.downloads.replay', "Complete bounded selections with offline replay instructions.", "Vollständige, abgegrenzte Auswahlen mit Anleitung zur Offline-Auswertung.")}</p>{!access.researchPackages&&<p>{t('pod.access.downloads.noPackages', "Research-package downloads are currently unavailable.", "Recherchepakete stehen derzeit nicht zum Download bereit.")}</p>}</div>
        <div><a href="/about/release">{t('pod.access.downloads.about', "About this release", "Über diese Datensatzversion")} <ArrowRight size={15} aria-hidden="true"/></a><p>{t('pod.access.downloads.coverage', "Coverage, version information and limitations.", "Abdeckung, Angaben zur Version und Einschränkungen.")}</p></div>
      </div>
      <div className="pod-evidence-links"><a href={access.releaseContext}>{t('pod.access.downloads.context', "Release context · JSON", "Angaben zur Datensatzversion · JSON")}</a></div>
    </section>
  </div>;
}
