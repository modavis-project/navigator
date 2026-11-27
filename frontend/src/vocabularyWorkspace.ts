import { isPublishedVocabularyCollection } from "./researchWorkspace";
import {publicGetJson} from "./api";
import {editionReadingUrl,vocabularyEditionRoute,vocabularyReaderAlias} from "./vocabularyRoutes";
import {workspaceUrl, type NewWorkspaceView, type VocabularyBinding} from "./researchWorkspace";

type Row=Record<string,any>;
type Reader=<T>(url:string,signal?:AbortSignal)=>Promise<T>;
const BASE="https://navigator.modavis.org";
const HASH=/^[a-f0-9]{64}$/;
function exactHash(value:unknown,label:string):string {
  if(typeof value!=="string"||!HASH.test(value))throw new Error(`The ${label} could not be verified. Nothing was saved.`);
  return value;
}
function assertActive(signal?:AbortSignal) {
  if(signal?.aborted)throw signal.reason??new DOMException("Request cancelled","AbortError");
}
function pin(params:URLSearchParams,key:string,actual:unknown):string {
  const hash=exactHash(actual,key);
  if(params.has(key)&&(params.getAll(key).length!==1||params.get(key)!==hash))throw new Error(`The requested ${key} is unavailable. Nothing was saved against different data.`);
  params.set(key,hash);return hash;
}
function query(params:URLSearchParams,allowed:string[]) {
  for(const key of params.keys()) {
    if(!allowed.includes(key)||params.getAll(key).length!==1)throw new Error("This vocabulary link has unsupported or repeated filters. Repair the link before saving it.");
    if(/[\x00-\x1f\x7f]/.test(params.get(key)!))throw new Error("This vocabulary link contains an invalid filter.");
  }
}
function result(url:URL,title:string,binding?:VocabularyBinding):NewWorkspaceView {
  if(!title?.trim())throw new Error("The vocabulary title could not be verified.");
  url.searchParams.sort();
  return {title,url:url.pathname+url.search+url.hash,...(binding?{binding}:{})};
}
export function vocabularyBindingSummary(binding:VocabularyBinding):string {
  return `${binding.collectionTitle} · ${binding.version||`Snapshot ${binding.snapshot.slice(0,12)}`}`;
}
/** Capture displayed payload bindings without replacing a user-supplied pin. */
export function vocabularyCaptureUrl(path:string,search:string,pins:Record<string,unknown>):string {
  const params=new URLSearchParams(search);
  for(const [key,value] of Object.entries(pins))if(!params.has(key)&&typeof value==="string")params.set(key,value);
  return path+(params.size?"?"+params:"");
}

/** Verify the requested view, then retain its native pins without replacing them. */
export async function resolveVocabularyWorkspaceView(raw:string,signal?:AbortSignal,get:Reader=publicGetJson):Promise<NewWorkspaceView> {
  const origin=typeof location==="undefined"?BASE:location.origin;
  const url=new URL(workspaceUrl(raw,origin),BASE),params=url.searchParams;
  assertActive(signal);
  if(/^\/vocab\/?$/.test(url.pathname)) {
    query(params,["q","sourceFamily"]);
    if((params.get("q")||"").length>200)throw new Error("Vocabulary search exceeds its supported length.");
    if(params.has("sourceFamily")) {
      const data=await get<Row>("/api/vocab/catalogue",signal);assertActive(signal);
      if(!data.collections?.some((item:Row)=>item.family===params.get("sourceFamily")))throw new Error("The selected source-wording field is unavailable.");
    }
    return result(url,params.get("q")?`Vocabulary search: ${params.get("q")}`:"Vocabulary collections");
  }
  if(url.pathname==="/vocab/registry") {
    const {registryQueryIssue,registryApiQuery,candidateLabel}=await import("./vocabularyHub");
    const issue=registryQueryIssue(params);if(issue)throw new Error(issue.message);
    const data=await get<Row>(`/api/vocab/registry${params.has("concept")?"/concept":""}?${registryApiQuery(params)}`,signal);assertActive(signal);
    const snapshot=pin(params,"snapshot",data.registrySha256);
    const publicCoreSha256=pin(params,"coreSnapshot",data.publicCoreSha256);
    const researchIndexSha256=pin(params,"indexSnapshot",data.researchIndexSha256);
    const concept=data.concept;
    if(params.has("concept")&&concept?.id!==params.get("concept"))throw new Error("The requested candidate identity is unavailable.");
    if(concept&&params.has("scheme")&&params.get("scheme")!==concept.scheme)throw new Error("The candidate belongs to a different scheme. Nothing was saved.");
    if(params.has("language")&&!data.languages?.includes(params.get("language")))throw new Error("The requested candidate-label language is unavailable.");
    const scheme=data.schemes?.find((item:Row)=>item.id===(concept?.scheme||params.get("scheme")));
    const collectionTitle=scheme?.title||"Candidate terminology registry";
    return result(url,concept?candidateLabel(concept,params.get("language")):collectionTitle,{kind:"candidate",collection:"registry",snapshot,collectionTitle,publicCoreSha256,researchIndexSha256,...(concept?{resource:concept.id}:{})});
  }
  if(url.pathname==="/vocab/reference") {
    const {referenceQueryIssue,referenceRequestUrl}=await import("./referenceVocabulary");
    const issue=referenceQueryIssue(params);if(issue)throw new Error(issue);
    const data=await get<Row>(referenceRequestUrl(params),signal);assertActive(signal);
    const info=data.collection,collection=params.get("collection")??"network";
    if(!info||info.id!==collection||!isPublishedVocabularyCollection(collection))throw new Error("The requested published collection could not be verified.");
    const snapshot=pin(params,"snapshot",data.snapshot);
    if(info.snapshot!==snapshot)throw new Error("The published resource and its source graph do not agree.");
    if(params.has("uri")&&data.resource?.uri!==params.get("uri"))throw new Error("The exact published resource is unavailable.");
    params.set("collection",collection);
    return result(url,data.resource?.label||info.title,{kind:"published",collection,snapshot,collectionTitle:info.title,version:info.version,...(data.resource?{resource:data.resource.uri}:{})});
  }
  if(url.pathname==="/vocab/omaro") {
    const {omaroQueryIssue,omaroApiQuery}=await import("./omaro");
    let issue=omaroQueryIssue(params);if(issue)throw new Error(issue);
    const metadataParams=new URLSearchParams();if(params.has("snapshot"))metadataParams.set("snapshot",params.get("snapshot")!);
    const meta=await get<Row>("/api/omaro"+(metadataParams.size?"?"+metadataParams:""),signal);assertActive(signal);
    issue=omaroQueryIssue(params,meta);if(issue)throw new Error(issue);
    const snapshot=pin(params,"snapshot",meta.snapshotSha256);
    const data=await get<Row>("/api/omaro/"+(params.has("uri")?"concept?":"concepts?")+omaroApiQuery(params),signal);assertActive(signal);
    if(data.snapshotSha256!==snapshot)throw new Error("The reference response does not match the requested OMARO snapshot.");
    const resource=data.concept?.uri||data.uri;
    if(params.has("uri")&&resource!==params.get("uri"))throw new Error("The exact OMARO resource could not be verified.");
    const translated=data.records?.labels?.find((label:Row)=>label.language===(params.get("language")||"en")&&label.label_type==="preferred")?.label;
    const collectionTitle=params.get("collection")==="ontology"?"OMARO assertion ontology":params.get("collection")==="hs"?"OMARO Hornbostel–Sachs":"OMARO instrument names";
    return result(url,translated||data.label||data.concept?.label||collectionTitle,{kind:"omaro",collection:"omaro",snapshot,collectionTitle,version:meta.datasetVersion,...(resource?{resource}:{})});
  }
  const usage=url.pathname.match(/^\/vocab\/usage\/([a-z][a-z0-9_]*)\/?$/);
  if(usage) {
    const {usageQueryIssue,usageApiParameters}=await import("./vocabularyHub");
    const issue=usageQueryIssue(params);if(issue)throw new Error(issue.message);
    const data=await get<Row>(`/api/vocab/usage/${usage[1]}?${usageApiParameters(params)}`,signal);assertActive(signal);
    if(data.family!==usage[1])throw new Error("The source-wording response belongs to a different field. Nothing was saved.");
    pin(params,"snapshot",data.publicCoreSha256);
    return result(url,params.get("term")?`${params.get("term")} · ${data.title||usage[1]}`:`${data.title||usage[1]} wordings`);
  }
  const alias=vocabularyReaderAlias(url.pathname);
  const edition=vocabularyEditionRoute(url.pathname);
  if(edition) {
    const {term, resource}=edition;
    query(params,term?["language","snapshot"]:["language","q","offset","snapshot"]);
    const language=params.get("language")||"en";
    if(!["de","en"].includes(language))throw new Error("Choose English or German.");
    const data=await get<Row>(editionReadingUrl(edition, params),signal);assertActive(signal);
    const info=data.edition;
    if(info?.id!==edition.edition||(term&&term!==data.term?.id))
      throw new Error("The requested edition or term was not verified.");
    const snapshot=pin(params,"snapshot",info.contentSha256);
    const labels=data.term?.labels||info.schemes?.find((item:Row)=>item.id===edition.scheme)?.title||info.title;
    return result(url,labels?.[language]||labels?.en||labels?.de||data.term?.code,{
      kind:"edition",collection:edition.edition,snapshot,
      collectionTitle:info.title?.[language]||info.title?.en||edition.edition,version:info.version,
      ...(resource?{resource}:{})});
  }
  const scoped=url.pathname.match(/^\/vocab\/([^/]+)\/concepts\/([^/]+)\/?$/),unscoped=url.pathname.match(/^\/vocab\/concepts\/([^/]+)\/?$/),scheme=url.pathname.match(/^\/vocab\/([^/]+)\/?$/);
  if(alias||scoped||unscoped||scheme) {
    const {parseVocabularyReadingQuery,loadVocabularyRecord}=await import("./vocabularyRecords");
    const parsed=parseVocabularyReadingQuery(url.search);
    const props=alias?(alias.conceptId?{expectedSchemeId:alias.schemeId,conceptId:alias.conceptId}:{schemeId:alias.schemeId})
      :scoped?{expectedSchemeId:decodeURIComponent(scoped[1]),conceptId:decodeURIComponent(scoped[2])}:unscoped?{conceptId:decodeURIComponent(unscoped[1])}:{schemeId:decodeURIComponent(scheme![1])};
    const controller=signal?undefined:new AbortController();
    const data=await loadVocabularyRecord(props,parsed,signal||controller!.signal,get);assertActive(signal);
    const concept=data.kind==="concept"?data.concept:undefined,info=data.kind==="scheme"?data.scheme:concept!.scheme!;
    if(concept&&props.conceptId!==concept.code&&props.conceptId!==concept.mdvsId)throw new Error("The requested vocabulary concept could not be verified. Nothing was saved.");
    const schema=data.kind==="concept"?concept?.recordKind==="schema_category":data.scheme.recordKind==="schema_categories";
    const schemeCode=info.code;
    if(typeof schemeCode!=="string"||!schemeCode)throw new Error("The vocabulary scheme identity could not be verified.");
    url.pathname=`/vocab/${encodeURIComponent(schemeCode)}${concept?"/concepts/"+encodeURIComponent(concept.code):""}`;
    const title=concept?.preferredLabel||concept?.code||info.name||schemeCode;
    if(schema)return result(url,title);
    if(schemeCode!=="modavis_activity_types"&&schemeCode!=="modavis_person_terminology")throw new Error("This controlled collection is unavailable for exact workspace saving.");
    const snapshot=pin(params,"snapshot",data.contentSha256);
    return result(url,title,{kind:"controlled",collection:schemeCode,snapshot,collectionTitle:info.name||schemeCode,version:info.version||undefined,...(concept?{resource:concept.code}:{})});
  }
  throw new Error("This page does not have a supported vocabulary workspace view.");
}

/** A reading projection, derived from a validated saved view rather than an imported URL. */
export function vocabularyEvidenceHref(view:NewWorkspaceView):string|undefined {
  const binding=view.binding;if(!binding)return undefined;
  const url=new URL(view.url,BASE),params=url.searchParams,api=new URLSearchParams({snapshot:binding.snapshot});
  if(binding.kind==="controlled") {
    if(binding.resource){api.set("scheme_code",binding.collection);return `/api/vocab/concepts/${encodeURIComponent(binding.resource)}?${api}`;}
    return `/api/vocab/snapshots/${encodeURIComponent(binding.collection)}?${api}`;
  }
  if(binding.kind==="candidate") {
    api.set("coreSnapshot",binding.publicCoreSha256);api.set("indexSnapshot",binding.researchIndexSha256);
    if(binding.resource){api.set("uri",binding.resource);return `/api/vocab/registry/concept?${api}`;}
    for(const key of ["scheme","q","language","offset","limit"])if(params.has(key))api.set(key,params.get(key)!);
    return `/api/vocab/registry?${api}`;
  }
  if(binding.kind==="published") {
    if(binding.resource)api.set("uri",binding.resource);
    for(const key of binding.resource?["language"]:["q","kind","scheme","language","offset","limit"])if(params.has(key))api.set(key,params.get(key)!);
    return `/api/vocab/references/${binding.collection}${binding.resource?"/concept":""}?${api}`;
  }
  if(binding.resource){api.set("uri",binding.resource);return `/api/omaro/concept?${api}`;}
  return `/api/omaro?${api}`;
}
