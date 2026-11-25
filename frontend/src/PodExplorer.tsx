import {useEffect, useState} from 'react';
import {ArrowLeft, ArrowRight, BookmarkPlus, Database, Search, SlidersHorizontal} from 'lucide-react';
import {collectionCard, collectionWorkspaceItem, collectionFullUrl, collections, explorerQuery} from './PodExplorerModel';
import {usePodRead} from './PodExplorerApi';
import {useUiLocale} from './uiLocale';
import {PodExplorerAccess, type Access} from './PodExplorerAccess';
import './PodExplorer.css';

type Family = {id:string;title:string;description:string;count:number|null;unit:string|null;available:boolean;url:string;api:string;boundary:string};
type Catalog = {release:string;snapshot:string|null;families:Family[];placeKinds?:string[];sources:{source_key:string;source_record_count:number;canonical_organ_count:number}[];exclusions:{category:string;rationale:string}[];countScope:string;dataAccess:Access};
type Page = {items:Record<string,any>[];total:number;limit:number;offset:number};
const familyGerman: Record<string, readonly [string, string, string, string]> = {
  "organs": ["Orgeln","Orgeldatensätze","Finden Sie eine Orgel und lesen Sie die einzeln zugeordneten Quellenbeschreibungen.","Der Datenbestand deckt die vertretenen Quellen ab."],
  "actors": ["Personen und Organisationen","Verzeichniseinträge","Erkunden Sie identifizierte Akteure und noch nicht zugeordnete Quellennennungen.","Das Verzeichnis enthält auch Quellennennungen. Mehrere Einträge können dieselbe Person betreffen."],
  "places": ["Orte","Ortsdatensätze","Durchsuchen Sie erfasste Spielstätten und Siedlungen mit ihren geografischen Belegen.","Ortskennungen und Angaben aus Quellen werden getrennt erfasst. Ungefähre Koordinaten geben keinen genauen Orgelstandort an."],
  "maps": ["Karten und Standortwechsel","Koordinatenangaben","Erkunden Sie erfasste Orte, Koordinatengenauigkeit und dokumentierte Standortwechsel.","Gegenwärtig beschriebene Standorte, ungefähre Ortsangaben und historisch belegte Standortwechsel werden getrennt erfasst."],
  "events": ["Dokumentierte Geschichte","Ereignisangaben aus Quellen","Verfolgen Sie Arbeiten an Orgeln, Beteiligte und die jeweilige Datierungsgrundlage.","Mehrere Quellen können dieselbe Arbeit an einer Orgel beschreiben. Die Zählung bezieht sich auf die Angaben aus Quellen."],
  "accounts": ["Quellenbeschreibungen von Orgelzuständen","Quellenbeschreibungen","Wählen Sie datierte oder undatierte Beschreibungen und vergleichen Sie die erfassten Registerlisten.","Das Datum einer Beschreibung, der beschriebene Orgelzustand und das Veröffentlichungsdatum der Quelle haben unterschiedliche Bedeutungen."],
  "components": ["Register und Pfeifenwerk","Erfasste Einträge zur Disposition","Sehen Sie Register, Werke, Koppeln und funktionale Pfeifenpositionen in Quellenbeschreibungen ein.","Erfasste Einträge und berechnete funktionale Pfeifenpositionen geben keine Anzahl beobachteter physischer Pfeifen an."],
  "media": ["Bilder und Medien","Externe Medienverweise","Finden Sie Orgeln mit Medienverweisen und prüfen Sie Quellenangaben und Rechtehinweise.","Diese Ansicht verlinkt externe Medien. Die Originaldateien werden hier nicht weiterverbreitet."],
  "sources": ["Quellen und Herkunft","Quelldatensätze","Durchsuchen Sie Quelldatensätze und prüfen Sie die daraus übernommenen Angaben.","Die Quellenzuordnung gibt Auskunft über die Herkunft der Angaben. Die Unabhängigkeit der Quellen ist gesondert zu prüfen."],
  "literature": ["Literatur","Publikationsdatensätze","Suchen Sie bibliografische Einträge, Digitalisate und Quellenangaben.","Eine Publikation kann auch ohne Zuordnung zu einer Orgel in der Sammlung stehen."],
  "scores": ["Digitale Notenausgaben","Datensätze zu Notenausgaben","Finden Sie quellenbasierte Ausgaben, Notendateien und vorab berechnete Tonumfänge.","Ein berechneter Tonumfang belegt weder die Eignung für eine Orgel noch eine Zuordnung zu ihr."],
  "temperaments": ["Stimmungssysteme","Stimmungssysteme","Prüfen Sie Cent-Abweichungen, Quellenkommentare und gesondert ausgewiesene Angaben zu Orgeln.","Verwandter Quellenwortlaut allein belegt keine genaue Stimmungsvariante."],
  "virtual-instruments": ["Virtuelle Instrumente","Virtuelle Instrumente","Erkunden Sie dokumentierte Sample-Sets und erfasste Beziehungen zu Orgeln.","Instrumentendateien sind nicht enthalten. Nicht geklärte und wahrscheinliche Beziehungen bleiben entsprechend gekennzeichnet."],
  "vocabulary": ["Vokabulare und Terminologie","Begriffe des Kernbestands","Erkunden Sie kontrollierte Begriffe, erfassten Quellenwortlaut und dessen Verwendung.","Getrennt versionierte Vokabularbestände und nicht normalisierte Quellenausdrücke sind in der Zahl der Kernbegriffe nicht enthalten."],
  "research": ["Recherchewerkzeuge","","Erstellen Sie Auswahlen, vergleichen Sie Quellenbeschreibungen und speichern Sie vollständige Recherchepakete.","Kennungen von Datenstand, Bewertung und Revisionsstand der Quellenbeschreibung bestimmen die Beleggrundlage eines Ergebnisses."],
  "data-access": ["Datenzugriff und Datensatzversionen","","Fragen Sie einen festen Datenstand ab und nutzen Sie Einzeldatensätze, semantische Exporte und Downloadpakete weiter.","Die Abfragen sind auf Lesezugriff beschränkt und unterliegen festen Grenzen. Frühere Datensatzversionen werden gesondert geführt."],
};

const filterGerman: Record<string, string> = {
  source: 'Quelle', entity_class: 'Akteurstyp', publication_state: 'Eintragstyp', kind: 'Ortsart', event_type: 'Ereignistyp',
  digitized: 'Zugang zum Digitalisat', year_from: 'Ab Jahr', year_to: 'Bis Jahr einschließlich',
  format: 'Format', analysis_status: 'Analyse des Tonumfangs', precise_variant: 'Präzise Variante', organ_link: 'Beziehung zu einer Orgel',
};
const optionGerman: Record<string, Record<string, string>> = {
  entity_class: {person:'Personen', organization:'Organisationen'},
  publication_state: {canonical:'Kanonische Identitäten', source:'Quellennennungen', all:'Alle Verzeichniseinträge'},
  digitized: {true:'Mit Zugang zum Digitalisat', false:'Ohne Zugang zum Digitalisat'},
  analysis_status: {available:'Tonumfang vorab berechnet', not_analyzed:'Nicht ausgewertet'},
  organ_link: {linked:'Mit erfasster Beziehung zu einer Orgel', unlinked:'Ohne erfasste Beziehung zu einer Orgel'},
  precise_variant: {true:'Präzise Varianten', false:'Gerundete Varianten'},
};

const familyGroups = [
  {id:'instruments', title:'Instruments & sources', de:'Instrumente und Quellen', ids:['organs','actors','places','events','sources']},
  {id:'music', title:'Musical resources', de:'Musikalische Ressourcen', ids:['scores','literature','temperaments','virtual-instruments','media']},
  {id:'research', title:'Research & reuse', de:'Recherche und Weiterverwendung', ids:['accounts','components','maps','vocabulary','research','data-access']},
];
const options: Record<string, [string,string][]> = {
  entity_class:[['person','People'],['organization','Organizations']],
  publication_state:[['canonical','Canonical identities'],['source','Source mentions'],['all','All directory entries']],
  digitized:[['true','With digitized access'],['false','Without digitized access']],
  format:[['pdf','PDF'],['musicxml','MusicXML'],['compressed_musicxml','Compressed MusicXML'],['midi','MIDI'],['lilypond','LilyPond']],
  analysis_status:[['available','Precomputed range available'],['not_analyzed','Not analyzed']],
  organ_link:[['linked','With retained organ links'],['unlinked','Without retained organ links']],
  precise_variant:[['true','Precise variants'],['false','Rounded variants']],
};

function CollectionNavigation({families, selected, choose}: {families:Family[];selected?:string;choose:(id:string)=>void}) {
  const {t, formatNumber} = useUiLocale();
  const groups = familyGroups.map(group=>({...group, label:t('pod.group.'+group.id, group.title, group.de), items:group.ids.flatMap(id=>families.filter(item=>item.id===id))}));
  return <>
    <label className="pod-collection-picker"><span>{t('pod.nav.collection', "Collection", "Sammlung")}</span>
      <select value={selected||''} aria-controls="pod-collection-results" onChange={event=>choose(event.target.value)}>
        {!selected&&<option value="" disabled>{t('pod.nav.choose', "Choose a collection", "Sammlung auswählen")}</option>}
        {groups.map(group=><optgroup key={group.title} label={group.label}>{group.items.map(item=><option key={item.id} value={item.id}>{item.title}{!item.available?t('pod.nav.unavailableSuffix', ' · unavailable', ' · nicht verfügbar'):''}</option>)}</optgroup>)}
      </select>
    </label>
    <nav className="pod-collection-nav" aria-label={t('pod.nav.collections', "POD collections", "POD-Sammlungen")}>
      {groups.map(group=><details className="pod-nav-group" key={group.title} open={group.ids.includes(selected||'')}>
        <summary>{group.label}</summary>
        <div>{group.items.map(item=><button type="button" key={item.id} aria-current={selected===item.id?'page':undefined} onClick={()=>choose(item.id)}>
          <span>{item.title}<small>{!item.available?t('pod.nav.unavailable', 'Unavailable', 'Nicht verfügbar'):item.count===null?t('pod.nav.openTool', 'Open tool', 'Werkzeug öffnen'):formatNumber(item.count)+' '+(item.unit||t('pod.records', 'records', 'Datensätze'))}</small></span>
          <ArrowRight size={14} aria-hidden="true"/>
        </button>)}</div>
      </details>)}
    </nav>
  </>;
}

function CollectionResults({url, family, offset, navigate}: {url:string;family:Family;offset:number;navigate:(params:URLSearchParams)=>void}) {
  const {t, formatNumber} = useUiLocale();
  const {data,error,retry}=usePodRead<Page>(url);
  function page(next:number) {const params=new URLSearchParams(location.search);params.set('offset',String(next));navigate(params);}
  if(error) return <div className="pod-error" role="alert"><p>{t('pod.results.error', 'The collection could not be loaded.', 'Die Sammlung konnte nicht geladen werden.')} <code lang="en">{error}</code></p><button onClick={retry}>{t('pod.results.retry', "Retry this collection", "Sammlung erneut laden")}</button></div>;
  if(!data) return <p className="pod-loading" role="status">{t('pod.results.loading', 'Loading {collection}…', '„{collection}“ wird geladen …', {collection:family.title})}</p>;
  if(!Array.isArray(data.items)||!Number.isInteger(data.total)) return <p role="alert">{t('pod.results.unsupported', "This collection returned an unsupported response.", "Die Sammlung lieferte ein Antwortformat, das der Navigator nicht verarbeiten kann.")} <a href={family.url}>{t('pod.results.full', "Open the full collection", "Gesamte Sammlung öffnen")}</a>.</p>;
  if(data.total>0&&!data.items.length&&offset>=data.total){
    return <div className="pod-empty">
      <h3>{t('pod.results.outOfRange', 'This page is beyond the matching records', 'Diese Seite liegt hinter den passenden Datensätzen')}</h3>
      <button type="button" onClick={()=>page(0)}>{t('pod.results.returnFirst', 'Return to the first page', 'Zur ersten Seite zurückkehren')}</button>
    </div>;
  }
  return <>
    <div className="pod-result-summary" role="status"><p><strong>{formatNumber(data.total)}</strong> {t('pod.results.matching', 'matching {unit}', 'passende {unit}', {unit:family.unit||t('pod.records', 'records', 'Datensätze')})}</p>{!!data.items.length&&<span>{t('pod.results.range', '{from, number}–{to, number} shown', 'Angezeigt: {from, number}–{to, number}', {from:offset+1,to:offset+data.items.length})}</span>}</div>
    {!data.items.length?<div className="pod-empty"><Search size={24} aria-hidden="true"/><h3>{t('pod.results.empty', "No matching records", "Keine Treffer")}</h3><p>{t('pod.results.emptyAdvice', "Try fewer filters or another source wording. An empty selection does not establish that the subject is absent from history.", "Verwenden Sie weniger Filter oder suchen Sie nach einem anderen Quellenwortlaut. Aus einer leeren Auswahl lässt sich keine Aussage über das historische Vorkommen ableiten.")}</p><button onClick={()=>navigate(new URLSearchParams({collection:family.id}))}>{t('pod.results.clear', "Clear this collection’s filters", "Filter dieser Sammlung zurücksetzen")}</button></div>:
      <div className="pod-result-grid">{data.items.map((row,index)=>{
        const card=collectionCard(family.id,row);const keep=collectionWorkspaceItem(family.id,row);
        return <article className="pod-result-card" key={card.id+index}>
          <h3>{card.href?<a href={card.href}>{card.title}<ArrowRight size={17} aria-hidden="true"/></a>:card.title}</h3>
          {card.description&&<p>{card.description}</p>}
          {!!card.qualifications.length&&<div className="pod-chips">{card.qualifications.map((value,i)=><span key={i}>{value.replace(/_/g,' ')}</span>)}</div>}
          <footer><small>{card.id}</small>{keep&&<button className="pod-keep" aria-label={t('pod.results.keepNamed', 'Keep {title} in workspace', '„{title}“ im Arbeitsbereich speichern', {title:card.title})} title={t('pod.results.keepTitle', 'Keep in workspace', 'Im Arbeitsbereich speichern')} onClick={()=>window.dispatchEvent(new CustomEvent('modavis:workspace-add',{detail:keep}))}><BookmarkPlus size={15} aria-hidden="true"/> {t('pod.results.keep', "Keep", "Speichern")}</button>}</footer>
        </article>;
      })}</div>}
    <nav className="pod-pagination" aria-label={t('pod.results.pages', '{collection} pages', 'Ergebnisseiten der Sammlung „{collection}“', {collection:family.title})}><button disabled={offset===0} onClick={()=>page(Math.max(0,offset-12))}><ArrowLeft size={15} aria-hidden="true"/> {t('pod.results.previous', "Previous", "Zurück")}</button><span>{t('pod.results.pageSize', "12 records per page", "12 Datensätze pro Seite")}</span><button disabled={offset+data.items.length>=data.total||offset+12>10000} onClick={()=>page(offset+12)}>{t('pod.results.next', "Next", "Weiter")} <ArrowRight size={15} aria-hidden="true"/></button></nav>
    {offset+12>10000&&offset+data.items.length<data.total&&<p>{t('pod.results.budget', "Narrow this query to continue beyond the interactive page budget. Complete-data routes are available under Data access.", "Schränken Sie die Abfrage ein, um weitere Ergebnisse zu sehen. Unter „Datenzugriff“ finden Sie Wege zum vollständigen Datenabruf.")}</p>}
  </>;
}

function CollectionFilters({family, selection, catalog, navigate}: {family:Family;selection:ReturnType<typeof explorerQuery>;catalog:Catalog;navigate:(params:URLSearchParams)=>void}) {
  const {t} = useUiLocale();
  const filterEntries=Object.entries(collections[family.id].filters);
  const activeFilters=filterEntries.filter(([key])=>selection.params.get(key)).length;
  const hasQuery=!!selection.params.get('q')||activeFilters>0;
  return <form className="pod-filter-form pod-collection-filter" aria-label={t('pod.filters.form', 'Search {collection}', 'Sammlung „{collection}“ durchsuchen', {collection:family.title})} onSubmit={event=>{
    event.preventDefault();const values=new FormData(event.currentTarget);const params=new URLSearchParams({collection:family.id});
    for(const [key,value]of values){if(String(value).trim())params.set(key,String(value).trim());}navigate(params);
  }}>
    <div className="pod-search-row"><label className="pod-query-field"><span className="pod-sr-only">{t('pod.filters.searchCollection', "Search this collection", "Diese Sammlung durchsuchen")}</span><Search size={18} aria-hidden="true"/>
      <input name="q" type="search" maxLength={256} defaultValue={selection.params.get('q')||''} placeholder={family.id==='scores'?t('pod.filters.placeholder.score', 'Composer, title or catalogue number', 'Komponist, Titel oder Katalognummer'):family.id==='sources'?t('pod.filters.placeholder.source', 'Source, identifier or organ name', 'Quelle, Kennung oder Name der Orgel'):t('pod.filters.placeholder.general', 'Name, wording or identifier', 'Name, Wortlaut oder Kennung')}/>
    </label><button type="submit">{t('pod.filters.search', "Search", "Suchen")}</button></div>
    <div className="pod-filter-options"><details className="pod-filter-details" open={activeFilters>0}>
      <summary><SlidersHorizontal size={15} aria-hidden="true"/> {t('pod.filters.heading', "Filters", "Filter")} {activeFilters>0&&<span>{t('pod.filters.applied', '{count, number} applied', '{count, number} aktiv', {count:activeFilters})}</span>}</summary>
      <div className="pod-filter-fields">{filterEntries.map(([key,label])=>{
        const choices=key==='source'?catalog.sources.map(item=>[item.source_key,item.source_key] as [string,string]):key==='kind'?(catalog.placeKinds||[]).map(value=>[value,value.replace(/_/g,' ')] as [string,string]):options[key];
        return <label key={key}>{t('pod.filters.label.'+key, label, filterGerman[key]||label)}{choices?<select name={key} defaultValue={selection.params.get(key)||(key==='publication_state'?'canonical':'')}>
          {key!=='publication_state'&&<option value="">{t('pod.filters.all', "All", "Alle")}</option>}{selection.params.get(key)&&!choices.some(([value])=>value===selection.params.get(key))&&<option value={selection.params.get(key)!}>{selection.params.get(key)}</option>}
          {choices.map(([value,text])=><option key={value} value={value}>{optionGerman[key]?.[value]?t('pod.filters.option.'+key+'.'+value, text, optionGerman[key][value]):text}</option>)}
        </select>:<input name={key} maxLength={256} type={key.startsWith('year_')?'number':'text'} min={key.startsWith('year_')?1:undefined} max={key.startsWith('year_')?9999:undefined} defaultValue={selection.params.get(key)||''}/>}</label>;
      })}</div>
    </details>{hasQuery&&<button type="button" className="pod-clear" onClick={()=>navigate(new URLSearchParams({collection:family.id}))}>{t('pod.filters.clear', "Clear filters", "Filter zurücksetzen")}</button>}</div>
  </form>;
}

function GuidedCollection({family, access}: {family:Family;access:Access}) {
  const {t} = useUiLocale();
  const german:Record<string,string>={accounts:'Quellenbeschreibungen vergleichen',components:'Register und Pfeifenwerk erkunden',media:'Bilder mit Quellenangaben finden',vocabulary:'Begriffe und Quellenwortlaut verknüpfen',maps:'Orte und dokumentierte Standortwechsel erkunden',research:'Reproduzierbare Rechercheauswahl erstellen'};
  const headings:Record<string,string>={accounts:'Compare source accounts',components:'Explore stops and pipework',media:'Find images with their source context',vocabulary:'Connect concepts to source wording',maps:'Explore locations and documented movements',research:'Build a reproducible research selection'};
  return <div className="pod-guided-card"><h3>{headings[family.id]?t('pod.guided.title.'+family.id, headings[family.id], german[family.id]):family.title}</h3>
    <a className="pod-primary-link" href={family.url}>{t('pod.guided.open', 'Open {collection}', '„{collection}“ öffnen', {collection:family.title})} <ArrowRight size={17} aria-hidden="true"/></a>
    <div className="pod-guided-links">
      {['accounts','components'].includes(family.id)&&<a href="/use-cases/research-workbench?view=selection&section=configurations&organ=EAXV-HAAS-S">{t('pod.guided.enschede', "Try the Enschede configuration accounts", "Quellenbeschreibungen zu Enschede vergleichen")} <ArrowRight size={15} aria-hidden="true"/></a>}
      {family.id==='vocabulary'&&access.vocabularyReferenceAvailable&&<><a href="/vocab/omaro">{t('pod.guided.omaro', "OMARO instrument names and classifications", "Instrumentennamen und Klassifikationen in OMARO")} <ArrowRight size={15} aria-hidden="true"/></a><p>{t('pod.guided.omaroNote', "OMARO is a separately versioned reference; its concepts do not add source evidence to POD organs.", "OMARO ist ein getrennt versionierter Referenzbestand. Seine Begriffe sind keine zusätzlichen Quellenbelege für die im POD erfassten Orgeln.")}</p></>}
      {family.id==='research'&&<><a href="/use-cases/organ-corpus-coverage">{t('pod.guided.coverage', "Corpus coverage and documentation gaps", "Abdeckung des Datenbestands und Dokumentationslücken")} <ArrowRight size={15} aria-hidden="true"/></a><a href="/use-cases/documented-organ-lifecycles">{t('pod.guided.lifecycles', "Qualified organ lifecycles", "Dokumentierte Orgelgeschichten und ihre Beleglage")} <ArrowRight size={15} aria-hidden="true"/></a></>}
      {family.id==='components'&&<a href="/use-cases/regional-organ-stop-names">{t('pod.guided.stopDistribution', "Source-stratified stop-name distributions", "Verteilung der Registernamen nach Quelle")} <ArrowRight size={15} aria-hidden="true"/></a>}
      {family.id==='maps'&&<a href="/api/map/movements.geojson">{t('pod.guided.movements', "Evidenced movements · GeoJSON", "Belegte Standortwechsel · GeoJSON")} <ArrowRight size={15} aria-hidden="true"/></a>}
      {family.id==='media'&&<a href="/pod-explorer?collection=sources">{t('pod.guided.mediaSources', "Supporting source records", "Zugehörige Quelldatensätze")} <ArrowRight size={15} aria-hidden="true"/></a>}
    </div>
  </div>;
}

export function PodExplorer() {
  const {locale, t, formatNumber} = useUiLocale();
  const title = t('pod.title', 'Explore the POD', 'Den POD erkunden');
  const catalog=usePodRead<Catalog>('/api/pod/capabilities');
  const [search,setSearch]=useState(location.search);
  useEffect(()=>{document.title=title+' | MODAVIS Navigator';},[title]);
  useEffect(()=>{const sync=()=>setSearch(location.search);window.addEventListener('popstate',sync);return()=>window.removeEventListener('popstate',sync);},[]);
  function navigate(params:URLSearchParams) {history.pushState({},'', '/pod-explorer?'+params);setSearch(location.search);}
  let selection:ReturnType<typeof explorerQuery>|undefined;let invalid='';
  try {selection=explorerQuery(search);} catch(error) {invalid=String(error instanceof Error?error.message:error);}
  const families=catalog.data?.families.map(item=>{
    const copy=familyGerman[item.id];
    if(!copy) return item;
    return {...item,
      title:t('pod.family.'+item.id+'.title', item.title, copy[0]),
      unit:item.unit?t('pod.family.'+item.id+'.unit', item.unit, copy[1]):null,
      description:t('pod.family.'+item.id+'.description', item.description, copy[2]),
      boundary:t('pod.family.'+item.id+'.boundary', item.boundary, copy[3]),
    };
  })||[];
  const family=families.find(item=>item.id===selection?.family);
  return <section className="pod-explorer" aria-label={title}>
    <header className="pod-header"><div><p className="eyebrow"><Database size={14} aria-hidden="true"/> Pipe Organ Dataset</p><h1>{title}</h1></div>
      <div className="pod-header-links">{catalog.data&&<a className="pod-release" href="/about/release">POD {catalog.data.release}</a>}<a href="/use-cases/research-workbench">{t('pod.workbench', "Research workbench", "Recherchewerkzeuge")} <ArrowRight size={15} aria-hidden="true"/></a></div>
    </header>
    {catalog.error?<div role="alert"><p>{t('pod.catalog.error', 'The POD collections could not be loaded.', 'Die POD-Sammlungen konnten nicht geladen werden.')} <code lang="en">{catalog.error}</code></p><button onClick={catalog.retry}>{t('pod.catalog.retry', "Retry available collections", "Sammlungsübersicht erneut laden")}</button></div>:!catalog.data?<p role="status">{t('pod.catalog.loading', "Reading collection coverage…", "Sammlungsübersicht wird geladen …")}</p>:<>
      <div className="pod-explorer-layout">
        <CollectionNavigation families={families} selected={family?.id} choose={id=>navigate(new URLSearchParams({collection:id}))}/>
        <section id="pod-collection-results" className="pod-collection-content" aria-label={t('pod.catalog.selected', "Selected collection", "Ausgewählte Sammlung")}>
          {invalid?<div role="alert"><p>{t('pod.catalog.invalid', 'The link does not specify a valid collection selection.', 'Der Link enthält keine gültige Sammlungsauswahl.')} <code lang="en">{invalid}</code></p><button onClick={()=>navigate(new URLSearchParams({collection:'organs'}))}>{t('pod.catalog.reset', "Start with organs", "Zur Orgelsammlung")}</button></div>:family&&selection&&<>
            <header className="pod-collection-header"><div><h2>{family.title}</h2><p>{family.description}</p>
              {family.count!==null&&<p className="pod-collection-total"><strong>{formatNumber(family.count)}</strong> {t('pod.family.count', '{unit} in this release', '{unit} in dieser Datensatzversion', {unit:family.unit||t('pod.records', 'records', 'Datensätze')})}</p>}
            </div>{!['data-access','sources','places'].includes(family.id)&&selection.url&&<a className="pod-text-link" href={collectionFullUrl(family.url,selection.params)}>{t('pod.catalog.full', "Full collection", "Gesamte Sammlung")} <ArrowRight size={15} aria-hidden="true"/></a>}</header>
            {!family.available?<><p className="pod-boundary">{family.boundary}</p><div className="pod-empty"><h3>{t('pod.catalog.unavailable', "This resource is currently unavailable", "Diese Ressource ist derzeit nicht verfügbar")}</h3><p>{t('pod.catalog.other', "Other collections remain available from the collection menu.", "Über das Sammlungsmenü können Sie andere Sammlungen öffnen.")}</p></div></>:<>
              {selection.url&&<CollectionFilters key={search} family={family} selection={selection} catalog={catalog.data} navigate={navigate}/>}
              <p className="pod-boundary">{family.boundary}{family.id==='actors'&&!selection.params.get('publication_state')&&<> {t('pod.filters.actorScope', 'Showing canonical identities. Use Entry type in Filters to browse source mentions.', 'Kanonische Identitäten werden angezeigt. Quellennennungen sind über den Filter Eintragstyp verfügbar.')}</>}</p>
              {family.id==='data-access'?<PodExplorerAccess snapshot={catalog.data.snapshot} access={catalog.data.dataAccess}/>:selection.url?<CollectionResults key={selection.url} url={selection.url} family={family} offset={selection.offset} navigate={navigate}/>:<GuidedCollection family={family} access={catalog.data.dataAccess}/>}
            </>}
          </>}
        </section>
      </div>
      <footer className="pod-coverage-footer"><details><summary>{t('pod.coverage.title', "About these counts and sources", "Zu den Zahlen und Quellen")}</summary><p>{locale === 'en' ? catalog.data.countScope : t('pod.coverage.rows', 'Exact rows in this public release.', 'Gezählt werden die tatsächlich enthaltenen Zeilen dieser öffentlichen Datensatzversion.')} {t('pod.coverage.units', 'These units overlap and must not be added together as a count of physical instruments.', 'Die Kategorien überschneiden sich. Ihre Summe gibt daher nicht die Anzahl physischer Instrumente an.')}</p><p>{t('pod.coverage.boundary', "Collections preserve source dependence, uncertainty and incomplete capture. A shared place, name or wording does not establish identity or a new relation.", "Die Sammlungen weisen Quellenabhängigkeit, Unsicherheit und Erfassungslücken aus. Ein übereinstimmender Ort, Name oder Wortlaut belegt für sich allein weder dieselbe Identität noch eine Beziehung.")}</p>{catalog.data.exclusions.map(item=><p key={item.category}><strong>{item.category.replace(/_/g,' ')}:</strong> <span lang="en">{item.rationale}</span></p>)}<a href="/api/pod/capabilities">{t('pod.coverage.machine', "Machine-readable capability description", "Maschinenlesbare Funktionsübersicht")}</a></details></footer>
    </>}
  </section>;
}
