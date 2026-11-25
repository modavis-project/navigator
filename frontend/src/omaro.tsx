import { JsonEvidence } from "./JsonEvidence";
import { publicGetJson } from "./api";
import { PublicReadError } from "./requestCache";
import {useEffect,useState} from 'react';
import {ArrowRight,Download,Search,Copy,ChevronLeft} from 'lucide-react';
import './omaro.css';
import {SaveVocabularyTerm} from './SaveVocabularyTerm';
import {vocabularyCaptureUrl} from './vocabularyWorkspace';
type Row=Record<string,any>;
const ROOT='/vocab/omaro';
const titles:Record<string,string>={instruments:'Instrument names',hs:'Hornbostel–Sachs',ontology:'OMARO ontology'};
const languageNames:Record<string,string>={ca:'Català',da:'Dansk',de:'Deutsch',en:'English',es:'Español',eu:'Euskara',fr:'Français',it:'Italiano',ko:'한국어',nl:'Nederlands',pl:'Polski',sv:'Svenska',zh:'中文'};
const languageLabel=(code:string)=>languageNames[code]?`${languageNames[code]} · ${code}`:code;
const pretty=(s:string)=>s.replace(/_/g,' ').replace(/-/g,' ');
function useData(url:string):{data?:Row,error?:string,status?:number,missing?:boolean,retry:()=>void}{
 const [attempt,setAttempt]=useState(0);
 const [state,set]=useState<{url:string,data?:Row,error?:string,status?:number,missing?:boolean}>();
 useEffect(()=>{if(!url)return;const controller=new AbortController();publicGetJson<Row>(url,controller.signal).then(data=>{if(!controller.signal.aborted)set({url,data});}).catch((error:unknown)=>{if(controller.signal.aborted)return;const status=error instanceof PublicReadError?error.status:undefined;if(status===404&&(url==='/api/omaro'||url.startsWith('/api/omaro?')))set({url,missing:true});else set({url,error:error instanceof Error?error.message:'Reference unavailable',status});});return()=>controller.abort();},[url,attempt]);
 return {...(state?.url===url?state:{}),retry:()=>{set(undefined);setAttempt(value=>value+1)}};
}
export function omaroQueryIssue(params:URLSearchParams,meta?:Row):string|undefined{
 const allowed=new Set(['collection','uri','q','language','resolution','offset','limit','snapshot']);
 for(const key of params.keys()){
  if(!allowed.has(key))return `Unsupported OMARO filter: ${key}. No filter has been discarded.`;
  if(params.getAll(key).length!==1)return `The link repeats ${key}. No value has been silently selected.`;
  const value=params.get(key)!;const maximum=key==='uri'?2048:key==='q'?200:500;
  if(value.length>maximum||/[\x00-\x1f\x7f]/.test(value))return `Invalid or overlong OMARO filter: ${key}.`;
  if(['snapshot','uri'].includes(key)&&!value.trim())return `The supplied ${key} must not be empty.`;
 }
 const collection=params.get('collection')??'instruments';
 if(!Object.prototype.hasOwnProperty.call(titles,collection))return 'The requested OMARO collection is unavailable.';
 if(params.has('resolution')&&!['resolved','unresolved','all'].includes(params.get('resolution')!))return 'The requested reference-record scope is unavailable.';
 if(!params.has('uri')&&collection==='ontology'&&(params.has('language')||params.has('resolution')))return 'Display language and record scope apply to reference concepts, not ontology terms.';
 if(meta?.counts?.languages&&params.has('language')&&!Object.prototype.hasOwnProperty.call(meta.counts.languages,params.get('language')!))return 'The requested display language is not recorded in this snapshot.';
 for(const [key,min,max] of [['offset',0,100000],['limit',1,100]] as const){if(params.has(key)&&(!/^\d+$/.test(params.get(key)!)||Number(params.get(key))<min||Number(params.get(key))>max))return `Invalid ${key}; use an integer from ${min} to ${max}.`;}
 if(params.has('uri')){try{const uri=params.get('uri')!;const parsed=new URL(uri);if(/\s/.test(uri)||!['http:','https:','urn:'].includes(parsed.protocol)||parsed.username||parsed.password||(parsed.protocol==='urn:'&&!parsed.pathname))return 'An exact absolute reference URI is required.';}catch{return 'An exact absolute reference URI is required.';}}
 return undefined;
}
export function omaroApiQuery(params:URLSearchParams){
 if(params.has('uri')){const result=new URLSearchParams({uri:params.get('uri')!});if(params.has('snapshot'))result.set('snapshot',params.get('snapshot')!);return result;}
 const result=new URLSearchParams(params);const collection=params.get('collection')??'instruments';result.set('collection',collection);
 if(collection!=='ontology'){const resolution=params.get('resolution')??'resolved';if(resolution==='all')result.delete('resolution');else result.set('resolution',resolution);}
 return result;
}
export function omaroNavigationQuery(search:string,values:Row,reset=false,availableSnapshot?:string){
 const original=new URLSearchParams(search);const next=reset?new URLSearchParams():new URLSearchParams(original);
 if(reset)for(const value of original.getAll('snapshot'))next.append('snapshot',value);
 for(const [key,value]of Object.entries(values)){if(value===null||value==='')next.delete(key);else next.set(key,String(value));}
 if(!next.has('snapshot')&&!original.has('snapshot')&&availableSnapshot)next.set('snapshot',availableSnapshot);
 return next;
}
export function omaroSearchFormKey(params:URLSearchParams){return JSON.stringify([params.get('collection')??'instruments',params.get('q')??'',params.get('language')??'en',params.get('resolution')??'resolved']);}
const releaseLabel=(meta:Row)=>meta.releaseStatus==='github-release'?'GitHub release':meta.releaseStatus?pretty(meta.releaseStatus):'Release status not recorded';
export function OmaroMetadataBadges({meta}:{meta:Row}){return <div className="om-badges">{meta.datasetVersion&&<span>Dataset {meta.datasetVersion}</span>}{meta.ontologyVersion&&<span>Ontology {meta.ontologyVersion}</span>}<span>{releaseLabel(meta)}</span>{meta.license&&<span>{meta.license}</span>}</div>;}
export function OmaroDistributions({meta}:{meta:Row}){
 return <details className="om-distributions"><summary>Snapshot, citation and original distributions</summary>
  <p>Ontology for Multiperspectivity, Assertions, and Review in Organology.</p>
  <p>OMARO. Reference Dataset {meta.datasetVersion||'version unrecorded'}; Ontology {meta.ontologyVersion||'version unrecorded'}. {meta.releaseUrl?<a href={meta.releaseUrl} target="_blank" rel="noreferrer">{releaseLabel(meta)}</a>:releaseLabel(meta)}.</p>
  {meta.sourceCommit&&<p>Recorded source commit: <code>{meta.sourceCommit}</code></p>}<p>Snapshot SHA-256: <code>{meta.snapshotSha256}</code></p>
  <p>Release metadata and original native artifacts retain their separate source declarations and checksums. A version declaration inside an original distribution can differ from the release metadata shown here; those original bytes are preserved.</p>
  {meta.publicIdentifiersActive===false?<p>Public identifier activation is not asserted by this snapshot. Original MIMO identifiers remain retained.</p>:meta.publicIdentifiersActive===true?<p>The snapshot records public identifiers as active.</p>:<p>Public identifier activation is not recorded.</p>}
  {meta.scope&&<p>{meta.scope}</p>}<div className="om-downloads">{Object.entries(meta.exports??{}).map(([key,value])=>{const item=value as Row;return <div key={key}><a href={'/api/omaro/download/'+encodeURIComponent(key)+'?snapshot='+encodeURIComponent(meta.snapshotSha256)}><Download size={15} aria-hidden="true"/>{item.file}</a><small>{item.mediaType}{typeof item.bytes==='number'&&<> · {item.bytes.toLocaleString()} bytes</>}</small>{item.sha256&&<details><summary>File SHA-256</summary><code>{item.sha256}</code></details>}</div>;})}</div>
  <a className="om-download" href={'/api/omaro?snapshot='+encodeURIComponent(meta.snapshotSha256)} download="omaro-snapshot-metadata.json"><Download size={15} aria-hidden="true"/>Download snapshot metadata · JSON</a><Evidence value={meta} label="Version bindings, source checksums and coverage"/>
 </details>;
}
function Evidence({value,label='Retained evidence'}:{value:any,label?:string}){return <details className="om-evidence"><summary>{label}</summary><JsonEvidence value={value} label={label}/></details>;}
export function OmaroCard({query=''}:{query?:string}){
 const {data,error,missing}=useData('/api/omaro');
 if(missing||!('omaro mimo instrument names hornbostel sachs ontology reference classification'.includes(query.toLowerCase())))return null;
 if(error)return <p role="alert">OMARO reference unavailable: {error}</p>;
 if(!data)return null;
 return <section className="om-entry" aria-label="OMARO reference collections"><div><p className="eyebrow">Separate reference collections · {releaseLabel(data)}</p><h2>OMARO</h2><p>Instrument names, classification and the evidence behind an organological assertion.</p><p>{data.counts.classifications.toLocaleString()} classifications · {data.counts.instruments.toLocaleString()} instrument concepts{data.counts.languages&&<> · {Object.keys(data.counts.languages).length} recorded label languages</>}</p><small>Separate from the POD vocabularies. Ontology {data.ontologyVersion} · Reference dataset {data.datasetVersion}</small></div><div className="om-entry-links">{Object.entries(titles).map(([key,title])=><a key={key} href={ROOT+'?collection='+key+'&snapshot='+data.snapshotSha256}>{title}<ArrowRight size={16} aria-hidden="true"/></a>)}</div></section>;
}
export function OmaroExplorer(){
 const [search,setSearch]=useState(location.search);
 const params=new URLSearchParams(search);
 const collection=params.get('collection')??'instruments';
 const uri=params.get('uri');
 const pin=params.get('snapshot');
 const initialIssue=omaroQueryIssue(params);
 const metadataUrl=pin ? '/api/omaro?'+new URLSearchParams({snapshot:pin}) : '/api/omaro';
 const context=useData(initialIssue ? '' : metadataUrl);
 const meta=context.data;
 const [notice,setNotice]=useState('');
 const issue=initialIssue??omaroQueryIssue(params,meta);
 const mismatch=Boolean(meta&&pin&&pin!==meta.snapshotSha256);
 useEffect(()=>{const change=()=>setSearch(location.search);window.addEventListener('popstate',change);return()=>window.removeEventListener('popstate',change);},[]);
 useEffect(()=>{document.title='OMARO reference | MODAVIS Navigator';if(meta&&!issue&&!params.has('snapshot')){const next=new URLSearchParams(search);next.set('snapshot',meta.snapshotSha256);history.replaceState({},'',ROOT+'?'+next);setSearch(location.search);}},[meta,search,issue]);
 // The browser starts with source concepts; the API's unfiltered contract stays unchanged.
 const resolution=params.get('resolution')??'resolved';
 const language=params.get('language')??'en';
 const api=omaroApiQuery(params);
 if(meta?.snapshotSha256&&!pin)api.set('snapshot',meta.snapshotSha256);
 const result=useData(!meta||issue||mismatch?'':'/api/omaro/'+(params.has('uri')?'concept?':'concepts?')+api);
 const data=issue||mismatch?undefined:result.data;
 function go(values:Row,reset=false){const next=omaroNavigationQuery(search,values,reset,meta?.snapshotSha256);history.pushState({},'',ROOT+'?'+next);setSearch(location.search);setNotice('');}
 function href(value:string){const next=new URLSearchParams(search);next.set('uri',value);return ROOT+'?'+next;}
 const localLink=(value:string,label?:string)=><a href={href(value)} onClick={e=>{if(e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;e.preventDefault();go({uri:value});}}>{label||value.split(/[\/#]/).pop()}</a>;
 return <section className="om-page" aria-label="OMARO reference browser"><a href="/vocab" className="om-back"><ChevronLeft size={16} aria-hidden="true"/> All vocabularies</a>
 <header className="om-hero"><p className="eyebrow">Separate organological reference</p><h1>OMARO reference</h1><p>Explore instrument names, classifications and the evidence behind organological assertions.</p>{meta&&<OmaroMetadataBadges meta={meta}/>}</header>
 <nav className="om-tabs" aria-label="OMARO collections">{Object.entries(titles).map(([key,title])=><button key={key} aria-pressed={collection===key} onClick={()=>go({collection:key},true)}>{title}</button>)}</nav>
 {context.error&&<div role="alert"><p>{context.error}</p>{context.status===409&&pin?<button type="button" onClick={()=>go({snapshot:null})}>Open this selection on the available snapshot</button>:(!context.status||context.status>=500)&&<button type="button" onClick={context.retry}>Retry this reference</button>}</div>}{context.missing&&<p role="alert">OMARO is not configured in this Navigator snapshot.</p>}
 {issue&&<div role="alert"><p>{issue}</p><p>The URL is retained; no filter has been silently removed.</p></div>}
 {mismatch&&<div role="alert"><p>This link refers to a different OMARO snapshot. Its records and downloads have not been replaced.</p>{meta&&<button type="button" onClick={()=>go({snapshot:meta.snapshotSha256})}>Open this selection on the available snapshot</button>}</div>}
 <p className="om-boundary">{collection==='ontology'?'Ontology classes and properties describe the assertion model. They are distinct from SKOS instrument concepts and physical instruments.':'These are MIMO-derived reference concepts. A source classification or matching name does not establish a classification of a particular POD organ. Labels and classification assertions remain unreviewed source evidence.'}</p>
 {!params.has('uri')&&!issue&&<form className="om-search" key={omaroSearchFormKey(params)} onSubmit={e=>{e.preventDefault();go({...Object.fromEntries(new FormData(e.currentTarget)),offset:0});}}><label><span>Search {titles[collection]||'reference'}</span><div><Search size={18} aria-hidden="true"/><input type="search" name="q" defaultValue={params.get('q')||''} maxLength={200} placeholder={collection==='ontology'?'Assertion, scope, review…':'Name in any language or classification code'}/></div></label>{collection!=='ontology'&&<><label>Display language<select name="language" defaultValue={language}><option key={language} value={language}>{languageLabel(language)}</option>{Object.keys(meta?.counts?.languages??{}).filter(code=>code!==language).sort().map(code=><option key={code} value={code}>{languageLabel(code)}</option>)}</select></label><label>Record scope<select name="resolution" defaultValue={resolution}><option value="resolved">Source concepts</option><option value="unresolved">Unresolved references</option><option value="all">All records</option></select></label></>}<button type="submit">Search</button></form>}
 {!uri&&!issue&&!mismatch&&collection!=='ontology'&&<p className="om-scope-note">{resolution==='resolved'?<>Showing concepts with source records. <button onClick={()=>go({resolution:'unresolved',offset:0})}>Browse unresolved source references</button></>:resolution==='unresolved'?<>These identifiers occur in source relationships, but their concept records are absent from this snapshot. <button onClick={()=>go({resolution:'resolved',offset:0})}>Browse concepts with source records</button></>:<>Showing source concepts and unresolved references together.</>}</p>}
 {uri&&<button className="om-back" onClick={()=>go({uri:null})}><ChevronLeft size={16} aria-hidden="true"/> Back to results</button>}
 {result.error&&!issue&&!mismatch&&<div role="alert"><p>{result.error}</p>{result.status===409&&<button type="button" onClick={context.retry}>Check the available snapshot</button>}{(!result.status||result.status>=500)&&<button type="button" onClick={result.retry}>Retry this reference</button>}</div>}{!data&&!result.error&&!issue&&!mismatch&&!context.missing&&!context.error&&<p role="status">Loading reference evidence…</p>}
 {data&&!mismatch&&!uri&&<><SaveVocabularyTerm contextKey={vocabularyCaptureUrl(ROOT,search,{snapshot:data.snapshotSha256})} label="Save reference view"/><div className="om-result-bar" role="status">{data.total.toLocaleString()} {collection==='ontology'?'ontology resources':resolution==='resolved'?'source concepts':resolution==='unresolved'?'unresolved source references':'reference records'} · {data.items.length?data.offset+1:0}–{data.items.length?Math.min(data.total,data.offset+data.items.length):0}</div>{!data.total&&<p className="om-empty">No records match these filters. Try another term or change the record scope.</p>}{data.total>0&&!data.items.length&&<p className="om-empty">This page is beyond the matching records. <button type="button" onClick={()=>go({offset:0})}>Open the first page</button></p>}<div className="om-results">{data.items.map((x:Row)=><article key={x.uri}><span className="om-kind">{x.kind==='classification'?x.notation:x.kind==='instrument'?'Instrument concept':pretty(x.kind)}</span><h2>{localLink(x.uri,x.label)}</h2>{x.definition&&<p>{x.definition}</p>}{x.resolution==='unresolved'&&<p className="om-unresolved">Unresolved source reference · no definition or identity inferred</p>}<small>{x.uri}</small></article>)}</div><nav className="om-pagination" aria-label="OMARO result pages"><button disabled={data.offset===0} onClick={()=>go({offset:Math.max(0,data.offset-data.limit)})}>Previous</button><span>Page {Math.floor(data.offset/data.limit)+1}</span><button disabled={!data.hasMore} onClick={()=>go({offset:data.offset+data.limit})}>Next</button></nav></>}
 {data&&!mismatch&&uri&&<article className="om-detail"><p className="eyebrow">{data.kind==='ontology-term'?data.kind:pretty(data.concept.kind)}</p><h2>{data.label||data.concept.label}</h2><SaveVocabularyTerm contextKey={vocabularyCaptureUrl(ROOT,search,{snapshot:data.snapshotSha256})} label={data.kind==='ontology-term'?'Save reference':'Save term'}/><div className="om-identity"><code>{uri}</code><button onClick={async()=>{try{await navigator.clipboard.writeText(uri);setNotice('Reference URI copied.');}catch{setNotice('Select and copy the reference URI above.');}}}><Copy size={15} aria-hidden="true"/> Copy URI</button></div>{notice&&<p role="status">{notice}</p>}
 {data.kind==='ontology-term'?<><p>{data.definition}</p><h3>Term relationships</h3><dl className="om-statements">{data.statements.map((s:Row,i:number)=><div key={i}><dt>{s.predicate.split(/[\/#]/).pop()}</dt><dd>{s.kind==='uri'&&s.value.startsWith('https://w3id.org/modavis/omaro#')?localLink(s.value):s.kind==='blank'?'OWL expression · see complete ontology download':s.value}{s.language&&<small> ({s.language})</small>}</dd></div>)}</dl><Evidence value={data.statements} label="Exact retained RDF statements"/></>:<>
 {data.concept.resolution==='unresolved'&&<p className="om-unresolved">This source reference is unresolved. No instrument identity or preferred label is inferred.</p>}
 {data.concept.notation&&<p><strong>Classification notation:</strong> {data.concept.notation}</p>}<p>{data.concept.definition||'No source definition recorded.'}</p>
 <details className="om-detail-section"><summary>Source labels <span>{(data.records.labels||[]).length} retained labels</span></summary><div className="om-table"><table><thead><tr><th>Language</th><th>Wording</th><th>Source label role</th></tr></thead><tbody>{(data.records.labels||[]).map((l:Row,i:number)=><tr key={i}><td>{l.language}{l.submitted_language&&l.submitted_language!==l.language&&<small>Source tag: {l.submitted_language}</small>}</td><td lang={l.language==='und'?undefined:l.language}>{l.label}</td><td>{l.label_type}</td></tr>)}</tbody></table></div></details>
 <h3>Hierarchy and source relations</h3>{data.relations.length===0&&<p>No source relations recorded.</p>}<ul className="om-relations">{data.relations.map((r:Row,i:number)=><li key={i}><span>{r.predicate_uri.endsWith('#broader')?(r.direction==='outgoing'?'Broader concept':'Narrower concept'):(r.direction==='incoming'?'Incoming ':'')+r.predicate_uri.split('#').pop()}</span>{localLink(r.other.uri,(r.other.notation?r.other.notation+' · ':'')+r.other.label)}{r.predicate_uri.endsWith('#exactMatch')&&<small>Original MIMO mapping · retained source layer, not project endorsement</small>}</li>)}</ul>
 <h3>Qualified classification evidence</h3><p>Source-asserted occurrences remain distinct from assignment activities and review decisions. Source-silent applicability is unknown, not universal validity.</p>{!(data.records.classification_assertions||[]).length&&<p>No classification assertion is recorded for this concept.</p>}{(data.records.classification_assertions||[]).map((a:Row)=><section className="om-assertion" key={a.uri}><p>{localLink(a.target_uri)} → {localLink(a.classification_uri)}</p><p>{a.stance} · {a.target_type} · {a.assertion_origin}</p><Evidence value={a} label="Scope, evidence, provenance and assertion identity"/></section>)}
 <p className="om-boundary">{data.podClassificationStatus}</p><details><summary>All retained concept evidence and registry context</summary>{Object.entries(data.records).map(([kind,rows])=><Evidence key={kind} value={rows} label={pretty(kind)}/>)}<Evidence value={data.registry} label="Perspectives, source-silent scope, source records and projection policies"/></details>
 </>}
 <a className="om-download" href={'/api/omaro/concept?uri='+encodeURIComponent(uri)+'&snapshot='+data.snapshotSha256} download="omaro-reference-evidence.json"><Download size={16} aria-hidden="true"/> Download reference evidence · JSON</a></article>}
 {meta&&!mismatch&&!issue&&<OmaroDistributions meta={meta}/>}
 </section>;
}
