import {useEffect, useState} from "react";
import {ArrowLeft, ArrowRight, Copy, Download, ExternalLink, Search} from "lucide-react";
import {JsonEvidence} from "./JsonEvidence";
import {LoadingContent} from "./LoadingContent";
import {publicGetJson} from "./api";
import {PublicReadError} from "./requestCache";
import "./referenceVocabulary.css";
import {SaveVocabularyTerm} from "./SaveVocabularyTerm";
import {vocabularyCaptureUrl} from "./vocabularyWorkspace";

type Row = Record<string, any>;
const ROOT = "/vocab/reference";
const formatNames:Record<string,string>={jsonld:"JSON-LD",nt:"N-Triples",rdf:"RDF/XML",ttl:"Turtle"};
const kinds: Record<string,string> = {concept:"SKOS concepts",scheme:"Concept schemes",class:"Model classes",property:"Model properties",other:"Other RDF resources",all:"All source resources"};
const resourceKinds: Record<string,string> = {concept:"SKOS concept",scheme:"Concept scheme",class:"Model class",property:"Model property"};
function useData(url:string) {
  const [attempt,setAttempt]=useState(0);
  const [state,setState]=useState<{url:string;data?:Row;error?:string;status?:number}>();
  useEffect(()=>{
    if(!url) return;
    const controller=new AbortController();
    publicGetJson<Row>(url,controller.signal).then(data=>{if(!controller.signal.aborted)setState({url,data});}).catch(error=>{
      if(!controller.signal.aborted)setState({url,error:error.message,status:error instanceof PublicReadError?error.status:undefined});
    });
    return ()=>controller.abort();
  },[url,attempt]);
  return {...(state?.url===url?state:{}),retry:()=>setAttempt(value=>value+1)};
}
export function referenceQueryIssue(parameters:URLSearchParams) {
  const allowed=new Set(["collection","uri","q","kind","scheme","language","offset","limit","snapshot"]);
  for(const key of parameters.keys()) {
    if(!allowed.has(key))return "This reference link contains an unsupported parameter. Its filters have not been ignored.";
    if(parameters.getAll(key).length!==1)return "This reference link repeats a parameter. Choose a single reference selection.";
  }
  return null;
}
export function referenceHref(search:string,values:Record<string,string|null>) {
  const next=new URLSearchParams(search);
  for(const [key,value] of Object.entries(values))value===null||value===""?next.delete(key):next.set(key,value);
  return ROOT+(next.size?"?"+next:"");
}
export function referenceRequestUrl(parameters:URLSearchParams) {
  const api=new URLSearchParams(),uri=parameters.get("uri");
  if(uri!==null)api.set("uri",uri);
  for(const key of (uri!==null?["language","snapshot"]:["q","kind","scheme","language","offset","limit","snapshot"])) {
    if(parameters.has(key))api.set(key,parameters.get(key)!);
  }
  return "/api/vocab/references/"+encodeURIComponent(parameters.get("collection")??"network")+(uri!==null?"/concept?":"?")+api;
}
function CopyValue({value,label}:{value:string;label:string}) {
  const [copied,setCopied]=useState(false);
  useEffect(()=>setCopied(false),[value]);
  return <button type="button" onClick={async()=>{try{await navigator.clipboard.writeText(value);setCopied(true);}catch{setCopied(false);}}}><Copy size={15} aria-hidden="true"/>{copied?"Copied":label}</button>;
}
export function ReferenceVocabulary() {
  const [search,setSearch]=useState(location.search);
  const parameters=new URLSearchParams(search);
  const issue=referenceQueryIssue(parameters);
  const meta=useData("/api/vocab/references");
  const vaoAlias=/^\/vocab\/vao\/?$/.test(location.pathname);
  const implicitVao=vaoAlias&&!parameters.has("collection");
  const pin=parameters.get("snapshot");
  if(implicitVao) {
    const recorded=pin&&meta.data?.collections?.find((item:Row)=>
      (item.id==="vao"||item.id==="vao-0.6.0")&&item.snapshot===pin);
    parameters.set("collection",recorded?.id||"vao-0.6.0");
  }
  const collection=parameters.get("collection")??"network",uri=parameters.get("uri");
  const collectionMeta=meta.data?.collections?.find((item:Row)=>item.id===collection);
  const [draft,setDraft]=useState(parameters.get("q")||"");
  const [kind,setKind]=useState(parameters.get("kind")||"concept");
  const [scheme,setScheme]=useState(parameters.get("scheme")||"");
  const [language,setLanguage]=useState(parameters.get("language")||"en");
  useEffect(()=>{const sync=()=>setSearch(location.search);window.addEventListener("popstate",sync);return()=>window.removeEventListener("popstate",sync);},[]);
  const urlQuery=parameters.get("q")||"",urlKind=parameters.get("kind")||"concept",urlScheme=parameters.get("scheme")||"",urlLanguage=parameters.get("language")||"en";
  useEffect(()=>{setDraft(urlQuery);setKind(urlKind);setScheme(urlScheme);setLanguage(urlLanguage);},[urlQuery,urlKind,urlScheme,urlLanguage]);
  useEffect(()=>{
    if(collectionMeta&&!issue&&(vaoAlias||!parameters.has("snapshot"))) {
      if(!parameters.has("snapshot"))parameters.set("snapshot",collectionMeta.snapshot);
      const next=ROOT+"?"+parameters;
      history.replaceState(history.state,"",next+location.hash);setSearch(location.search);
    }
  },[collectionMeta?.snapshot,search,issue,vaoAlias]);
  const requestUrl=referenceRequestUrl(parameters);
  const waitingForVaoPin=implicitVao&&parameters.has("snapshot")&&!meta.data;
  const result=useData(issue||waitingForVaoPin?"":requestUrl);
  const data=result.data,info=data?.collection||collectionMeta,resource=data?.resource;
  useEffect(()=>{document.title=(resource?.label||info?.title||"Published vocabularies")+" | MODAVIS Navigator";},[resource?.label,info?.title]);
  function go(values:Record<string,string|null>) {history.pushState({},"",referenceHref(search,values));setSearch(location.search);}
  function localLink(target:string,label:string) {return <a href={referenceHref(search,{uri:target})} onClick={event=>{
    if(event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
    event.preventDefault();go({uri:target});
  }}>{label}</a>;}
  const title=resource?.label||(uri?"Published reference record":info?.title||"Published vocabularies");
  const collections = <nav className="rv-collections" aria-label="Published reference collections">
    {meta.data?.collections?.map((item:Row)=><a key={item.id} aria-current={item.id===collection?(uri?"location":"page"):undefined} href={ROOT+"?"+new URLSearchParams({collection:item.id,snapshot:item.snapshot})}>{item.title}<small>{item.count.toLocaleString()} {item.countUnit}</small></a>)}
  </nav>;
  const boundary = <p className="rv-boundary">{info?.boundary||"Published reference concepts and model resources stay separate from POD controlled concepts and candidate designations."}</p>;
  return <section className="reference-vocabulary" aria-label="Published vocabulary reference">
    <nav className="rv-breadcrumb" aria-label="Reference context"><a href="/vocab">Vocabularies</a><span>›</span>{uri?<a href={referenceHref(search,{uri:null})}>{info?.title||"Collection"}</a>:<span>Published reference</span>}</nav>
    <header className="rv-hero"><p className="eyebrow">{resource?resourceKinds[resource.kind]||"Source resource":"Published reference collections"}</p><h1>{title}</h1>
      {!uri&&<p className="rv-intro">{info?.description||"Explore the source terminology retained in the MODAVIS and VAO publication bundles."}</p>}
      {info&&<div className="rv-meta"><span>Version {info.version}</span><a href={info.licenseUrl}>{info.license}</a><span>{info.attribution}</span></div>}
    </header>
    {!uri&&<>{collections}{boundary}</>}
    {meta.error&&!data&&<div role="alert" className="rv-error"><p>{meta.error}</p><button type="button" onClick={meta.retry}>Retry reference directory</button></div>}
    {issue||result.error?<div role="alert" className="rv-error"><h2>Reference selection unavailable</h2><p>{issue||result.error}</p>
      {result.status===409?<button type="button" onClick={()=>go({snapshot:null})}>Open the available published snapshot</button>:issue?<a href={ROOT}>Browse published collections</a>:<button type="button" onClick={result.retry}>Try again</button>}
      <a href={ROOT+"?"+new URLSearchParams({collection:collectionMeta?.id||"network"})}>Browse this collection</a>
    </div>:!data?<LoadingContent kind="article" label="Loading published vocabulary…"/>:uri&&resource?<>
      <div className="rv-identity"><code>{resource.uri}</code><div className="rv-identity-actions">
        <SaveVocabularyTerm contextKey={vocabularyCaptureUrl(ROOT,search,{snapshot:data.snapshot})} label={resource.kind==="concept"?"Save term":"Save reference"}/>
        <CopyValue value={resource.uri} label="Copy source URI"/>
      </div></div>
      <section className="rv-definition" aria-label="Recorded source description"><h2>Source description</h2><p lang={resource.definitionLanguage||undefined}>{resource.definition||"No definition is recorded in this frozen reference."}</p>
        {!resource.definition&&<a href={info.sourcePage} target="_blank" rel="noreferrer">Read the source documentation <ExternalLink size={14} aria-hidden="true"/></a>}
        {resource.displayLabelBasis!=="recorded label"&&<p className="rv-note">The heading uses the URI local name because no label was recorded.</p>}
        {resource.labelConflicts?.length>0&&<p className="rv-note">The source contains multiple preferred labels in one language. All recorded labels are preserved below.</p>}
      </section>
      <section className="rv-labels"><h2>Recorded labels</h2>{resource.labels.length?<dl>{resource.labels.map((label:Row,index:number)=><div key={index}><dt>{label.language||"Untagged"} · {label.role}</dt><dd lang={label.language||undefined}>{label.value}</dd></div>)}</dl>:<p>No labels were recorded.</p>}</section>
      <section className="rv-relations"><h2>Source relationships</h2>{data.relations.length?<ul>{data.relations.map((relation:Row,index:number)=><li key={index}><span>{relation.direction==="incoming"?"Incoming ":""}{relation.predicate.split("#").pop()}</span>{relation.inCollection?localLink(relation.uri,relation.label):<a href={relation.uri} target="_blank" rel="noreferrer">{relation.label}</a>}</li>)}</ul>:<p>No navigable source relationships were recorded for this resource.</p>}
        {data.relations.some((relation:Row)=>/Match$/.test(relation.predicate))&&<p className="rv-note">Mapping statements are retained from the source graph; this browser does not assert a new equivalence or a POD classification.</p>}
        {resource.kind!=="concept"&&<p className="rv-note">Domain, range and model relationships are original RDF statements. No inferred membership or instrument classification is added.</p>}
      </section>
      {boundary}
      <details className="rv-disclosure"><summary>Exact RDF evidence and datatype information</summary><p>{data.evidenceScope}</p><JsonEvidence value={data.statements} label="Original direct RDF statements"/></details>
      <a className="rv-json" href={requestUrl} download="published-reference-evidence.json"><Download size={15} aria-hidden="true"/> Download this reference view · JSON</a>
    </>:<>
      <form className="rv-search" role="search" aria-label="Search published reference" onSubmit={event=>{event.preventDefault();go({q:draft,kind,scheme,language,offset:null});}}>
        <label className="rv-search-text">Search this collection<input type="search" value={draft} onChange={event=>setDraft(event.target.value)} maxLength={200} placeholder="Term, definition or source URI"/></label>
        <label>Resource kind<select value={kind} onChange={event=>setKind(event.target.value)}>{Object.entries(kinds).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
        <label>Concept scheme<select value={scheme} onChange={event=>setScheme(event.target.value)}><option value="">All schemes</option>{data.schemes.map((item:Row)=><option key={item.uri} value={item.uri}>{item.label}</option>)}<option value="unassigned">Without a recorded scheme</option></select></label>
        <label>Display language<select value={language} onChange={event=>setLanguage(event.target.value)}>{[...new Set(["en",...(info.languages||[]),"und"])].map(value=><option key={value} value={value}>{value==="en"?"English · en":value==="und"?"Untagged / und":value}</option>)}</select></label>
        <button type="submit"><Search size={16} aria-hidden="true"/>Search</button>
      </form>
      <div className="rv-results-bar"><SaveVocabularyTerm contextKey={vocabularyCaptureUrl(ROOT,search,{snapshot:data.snapshot})} label="Save reference view"/><p role="status"><strong>{data.total.toLocaleString()}</strong> {kinds[data.kind]||"source resources"}{data.items.length>0&&<> · {data.offset+1}–{Math.min(data.total,data.offset+data.items.length)} shown</>}</p>{urlQuery&&<button type="button" onClick={()=>go({q:null,offset:null})}>Clear search</button>}</div>
      {!data.total?<p className="rv-empty">No resources match these filters. Change the wording, kind or scheme to continue.</p>:data.items.length===0?<div className="rv-empty"><p>This page is beyond the matching results.</p><button type="button" onClick={()=>go({offset:null})}>Return to the first page</button></div>:null}
      <div className="rv-results">{data.items.map((item:Row)=><article key={item.uri}><p className="rv-kind">{kinds[item.kind]||"Source resource"}{item.displayLabelLanguage&&" · "+item.displayLabelLanguage}</p><h2>{localLink(item.uri,item.label)}</h2><p>{item.definition||"No source definition recorded."}</p><code>{item.uri}</code></article>)}</div>
      <nav className="rv-pager" aria-label="Published reference pages"><button disabled={data.offset===0} onClick={()=>go({offset:String(Math.max(0,data.offset-data.limit))})}><ArrowLeft size={15} aria-hidden="true"/> Previous</button><span>Page {Math.floor(data.offset/data.limit)+1}</span><button disabled={!data.hasMore} onClick={()=>go({offset:String(data.offset+data.limit)})}>Next <ArrowRight size={15} aria-hidden="true"/></button></nav>
    </>}
    {info&&<details className="rv-disclosure"><summary>Version, coverage and original downloads</summary><p>{info.attribution} · {info.license}. {info.title}, version {info.version}.</p>
      <dl className="rv-coverage"><div><dt>SKOS concepts</dt><dd>{info.count}</dd></div><div><dt>Concept schemes</dt><dd>{info.schemeCount}</dd></div><div><dt>All named RDF resources</dt><dd>{info.resourceCount}</dd></div></dl>
      <p>{info.quality.conceptsWithoutDefinition} concepts have no definition in this graph; {info.quality.conceptsWithoutScheme} have no recorded scheme. These gaps are preserved, not filled by inference.</p>
      <p>Source Turtle SHA-256: <code>{info.snapshot}</code></p><p>Source commit: <code>{info.sourceCommit}</code></p><a href={info.sourcePage} target="_blank" rel="noreferrer">Source documentation <ExternalLink size={14} aria-hidden="true"/></a>
      <div className="rv-downloads">{info.formats.map((format:Row)=><a key={format.format} href={format.href}><Download size={15} aria-hidden="true"/>{formatNames[format.format]||format.format.toUpperCase()}<small>{format.bytes.toLocaleString()} bytes · original source graph</small></a>)}</div>
      <CopyValue label="Copy reference" value={`${info.attribution}. ${info.title}, version ${info.version}. ${info.sourcePage}. Source Turtle SHA-256: ${info.snapshot}.`}/>
    </details>}
    {uri&&collections}
  </section>;
}
