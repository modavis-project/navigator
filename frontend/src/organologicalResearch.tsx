import {BuilderNetwork} from './researchExploration';
import { JsonEvidence } from "./JsonEvidence";
import { useEffect, useState } from "react";
import "./organologicalResearch.css";
import { ParticipantIdentityNote, ParticipantSourceEvidence } from "./eventParticipation";

type Item = Record<string, any>;
type Page = { items: Item[]; total: number; offset: number; hasMore: boolean; publicCoreSha256: string };
const enc = encodeURIComponent;
const pretty = (s: string) => s.replace(/_/g, " ");
const actorHref = (id: string) => `/people/${enc(id.replace("MDVS:ENTY:", ""))}`;

function useData<T>(url: string | null) {
  const [state, setState] = useState<{url: string; data?: T; error?: string}>();
  useEffect(() => {
    if (!url) return;
    const controller = new AbortController();
    const timer = setTimeout(() => fetch(url, {signal:controller.signal}).then(async r => {
      if (!r.ok) throw new Error(r.status === 503 ? "Research data is unavailable or belongs to a different snapshot." : "Unable to load research evidence.");
      return await r.json() as T;
    }).then(data => {if (!controller.signal.aborted) setState({url,data});}).catch(e => {if (!controller.signal.aborted) setState({url,error:String(e.message)});}),150);
    return () => {clearTimeout(timer);controller.abort();};
  }, [url]);
  return state?.url === url ? state : undefined;
}

function EventEvidence({event}: {event: Item}) {
  return <div className="research-event">
    <a href={event.href || `/events/${enc(event.event_id)}`}><strong>{event.controlled_event_type ? pretty(event.controlled_event_type) : event.source_event_type || "Source statement"}</strong></a>
    <p>{event.dates?.map((d: Item) => d.expression).filter(Boolean).join("; ") || "Undated"} · {event.source_key}</p>
    {event.source_event_type && <p>Source wording: {event.source_event_type}</p>}
    {event.narrative && <p>{event.narrative}</p>}
    <ul>{event.participants?.map((p: Item,i: number) => <li key={i}>{p.targetId ? <a href={actorHref(p.targetId)}>{p.wording}</a> : p.wording} · {p.role || "Role unspecified"}{!p.targetId && " · Identity unresolved or unknown"}<ParticipantIdentityNote participant={p}/><ParticipantSourceEvidence participant={p}/></li>)}</ul>
    {event.source_url && <a href={event.source_url} target="_blank" rel="noreferrer">Original source</a>}
  </div>;
}

function RelativeAccountEvidence({item}: {item: Item}) {
  const scope=item.sourceRelativeContext;
  return <>{scope && <p>Source account {scope.temporalRelation} {scope.boundaryYear}; exact configuration year unestablished.</p>}{item.eventAssociations?.map((a:Item,i:number)=><p key={i}><a href={`/events/${enc(a.eventId)}`}>{a.temporalRelation ? `Account ${a.temporalRelation} this documented event` : "Related documented event"}</a> · Historical context; causation and physical continuity are not established.</p>)}</>;
}

function AccountComparison({items}: {items: Item[]}) {
  return <section className="research-comparison"><h3>Separate source accounts</h3><p>Comparison does not establish authorship, equivalent physical states or acoustic identity. No absent stops are inferred.</p><div className="research-account-grid">{items.map(item => <Account key={item.description_id} item={item}/>)}</div></section>;
}
function Account({item}: {item: Item}) {
  const result=useData<{description: Item}>(item.apiUrl+`?revision=${enc(item.description_revision)}`);
  const d=result?.data?.description;
  return <article><h4>{item.organLabel}</h4><p>{item.source_heading} · {item.period_label}</p><p>{item.qualification.join(" · ")}</p><RelativeAccountEvidence item={item}/>
    {result?.error && <p role="alert">{result.error}</p>}{!result && <p role="status">Loading account…</p>}
    {d && <><p>{d.groups.reduce((n: number,g: Item) => n+g.entries.filter((e: Item) => e.kind==="stop").length,0)} delivered stop entries · {d.groups.length} division groups. Source entries, not a total of unique physical stops.</p>
      {d.groups.map((g: Item,i: number) => <details key={i}><summary>{g.label} · {g.entries.length} entries</summary><ul>{g.entries.map((e: Item) => <li key={e.id}>{e.wording || e.label} {e.pitch && ` · ${e.pitch}′`} · {e.kind}</li>)}</ul></details>)}
      <p>Source: {d.source?.source} · {d.source?.id}</p></>}
    <a href={item.href}>Open specification and full evidence</a></article>;
}

export function OrganologicalResearch({initialActor}: {initialActor?: string}) {
  const [actorId,setActor]=useState(initialActor || new URLSearchParams(location.search).get('actor') || "");
  const [search,setSearch]=useState("");const [actorPage,setActorPage]=useState(0);
  const [section,setSection]=useState("neighbors");const [other,setOther]=useState<Item>();
  const [query,setQuery]=useState("");const [page,setPage]=useState(0);const [compare,setCompare]=useState<Item[]>([]);
  const directory=useData<Page>(!initialActor ? `/api/research/actors?q=${enc(search)}&page=${actorPage}` : null);
  const overview=useData<Item>(actorId ? `/api/research/actors/${enc(actorId)}` : null);
  const result=useData<Page>(actorId ? `/api/research/actors/${enc(actorId)}/${section}?q=${enc(query)}&page=${page}${other && section!=="neighbors" && section!=="configurations" ? `&other=${enc(other.id)}` : ""}` : null);
  const data=result?.data;const actor=overview?.data?.actor;
  const mismatch=!!(data && overview?.data && data.publicCoreSha256!==overview.data.publicCoreSha256);
  const changeSection=(s: string) => {setSection(s);setPage(0);setQuery("");};
  useEffect(()=>{if(initialActor)return;const restore=()=>{const value=new URLSearchParams(location.search).get('actor')||'';setActor(value)};window.addEventListener('popstate',restore);return()=>window.removeEventListener('popstate',restore)},[initialActor]);
  const choose=(id: string) => {if(!initialActor){const p=new URLSearchParams(location.search);p.set('actor',id);p.set('networkPage','0');history.pushState({},'',location.pathname+'?'+p);window.dispatchEvent(new PopStateEvent('popstate'));}setActor(id);setPage(0);setOther(undefined);setCompare([]);setQuery("");setSection("neighbors");};
  return <section className="organological-research" aria-label="Builder research dossier">
    <h2>Builder research dossier</h2><p><a href={`/use-cases/research-workbench?actor=${enc(actorId)}&section=events`}>Open reproducible research, filters and downloads</a></p><p>Explore documented work and compare the evidence behind connections.</p>
    {!initialActor && <details open={!actorId}><summary>Choose any builder or organization</summary><label>Search builders<input value={search} onChange={e=>{setSearch(e.target.value);setActorPage(0);}} placeholder="Name or MODAVIS identifier"/></label>
      {directory?.error && <p role="alert">{directory.error}</p>}
      <div className="research-builder-results">{directory?.data?.items.map(a=><button key={a.id} onClick={()=>choose(a.id)}>{a.label} · {a.organ_count.toLocaleString()} organs</button>)}</div>
      {directory?.data && <nav aria-label="Builder search pages"><button disabled={!actorPage} onClick={()=>setActorPage(actorPage-1)}>Previous builders</button><span>{directory.data.total.toLocaleString()} matching identities</span><button disabled={!directory.data.hasMore} onClick={()=>setActorPage(actorPage+1)}>Next builders</button></nav>}
    </details>}
    {overview?.error && <p role="alert">{overview.error}</p>}
    {actor && <>{!initialActor&&<BuilderNetwork actor={actorId} onChoose={choose}/>}<h3><a href={actor.href}>{actor.label}</a></h3><p>{actor.organ_count.toLocaleString()} associated organs · {actor.eventCount.toLocaleString()} linked event assertions · {actor.sourceCount.toLocaleString()} builder source records</p>
      <div className="research-section-buttons" aria-label="Research sections">{[["neighbors","Other builders"],["organs","Instruments and evidence"],["events","Event participation"],["configurations","Configuration accounts"]].map(([id,label])=><button key={id} aria-pressed={section===id} onClick={()=>{changeSection(id);if(id==="neighbors"||id==="configurations")setOther(undefined);}}>{label}</button>)}</div>
      {other && <div className="research-peer"><p>Comparing with <a href={actorHref(other.id)}>{other.label}</a>. {other.audit && <strong>Identity correspondence remains unresolved; do not interpret this pair as distinct historical collaborators.</strong>}</p><button onClick={()=>changeSection("organs")}>Shared instruments</button><button onClick={()=>changeSection("events")}>Joint controlled events</button><button onClick={()=>changeSection("sequences")}>Earlier → later work</button><button onClick={()=>{const old={id:actor.id,label:actor.label,audit:other.audit};setActor(other.id);setOther(old);changeSection("sequences");}}>Reverse direction</button><button onClick={()=>{setOther(undefined);changeSection("neighbors");}}>Clear comparison</button></div>}
      <p className="research-qualification">{section==="neighbors" ? "Shared instruments establish a catalogue connection, not collaboration, family ties, apprenticeship or company succession. Counts reflect documentation coverage." : section==="events" ? "Joint participation means named actors in one controlled source event. It does not establish a partnership; repeated source assertions can describe the same event." : section==="sequences" ? "Earlier work by the selected actor → later work by the comparison actor. Only non-overlapping bounded dates qualify. These are pairs of event assertions, not proof of continuity of physical fabric or company succession." : section==="configurations" ? "These separate accounts come from source records that name this actor for this organ. This does not attribute every configuration to the actor. Retained transfers, partial accounts and unknown dates remain explicit." : "Original builder assertions are retained. Locations below describe current source listings, not historical workshop addresses or commission locations."}</p>
      <label>Filter this section<input value={query} onChange={e=>{setQuery(e.target.value);setPage(0);}} placeholder={section==="configurations" ? "Organ, date or coverage wording" : "Organ, builder, event or identifier"}/></label>
      {result?.error && <p role="alert">{result.error}</p>}{!result && <p role="status">Loading research evidence…</p>}{mismatch && <p role="alert">Research snapshot changed. Reload before comparing.</p>}
      {data && !mismatch && <><nav aria-label="Research result pages"><button disabled={!page} onClick={()=>setPage(page-1)}>Previous results</button><span role="status">{data.total.toLocaleString()} results{data.total>0 && ` · ${data.offset+1}–${data.offset+data.items.length}`}</span><button disabled={!data.hasMore} onClick={()=>setPage(page+1)}>Next results</button></nav>
      {compare.length>0 && <AccountComparison items={compare}/>}
      <div className="research-results">{data.items.map((item,i)=><article key={item.id || item.description_id || item.event_id || i}>
        {section==="neighbors" ? <><h4><a href={item.href}>{item.label}</a></h4><p>{item.shared} shared organs · {item.joint} joint controlled event assertions</p>{item.audit && <p className="research-qualification">Identity correspondence unresolved. <a href="/api/research/identity-audit">Inspect the evidence audit</a>.</p>}<button onClick={()=>{setOther(item);changeSection("organs");}}>Compare evidence</button></> :
        section==="organs" ? <><h4><a href={item.href}>{item.label}</a></h4><details><summary>Builder evidence · {item.assertions.length} assertions</summary>{item.assertions.map((a:Item)=><div key={a.assertion_id}><p><a href={actorHref(a.actor_mdvs_id)}>{a.source_label}</a> · {a.relation_role} · {a.source_key}</p><a href={`${item.href}?tab=sources`}>Source record {a.source_record_id}</a><details><summary>Original assertion and provenance</summary><JsonEvidence value={a} label="Original builder assertion"/></details></div>)}{!item.assertions.length && <p>Association retained from canonical relation evidence; inspect the organ dossier.</p>}</details><details><summary>Current source-listed locations</summary>{item.locations.map((l:Item,j:number)=><p key={j}>{l.label} · {l.source}</p>)}</details></> :
        section==="events" ? <><h4><a href={item.organHref}>{item.organLabel}</a></h4><EventEvidence event={item}/></> :
        section==="sequences" ? <><h4><a href={item.organHref}>{item.organLabel}</a></h4><div className="research-account-grid"><EventEvidence event={item.earlier}/><EventEvidence event={item.later}/></div></> :
        <><h4><a href={item.href}>{item.organLabel}</a></h4><p>{item.source_heading} · {item.period_label}</p><p>{item.source_record_id}</p><p>{item.qualification.join(" · ")}</p><RelativeAccountEvidence item={item}/><button disabled={compare.length>=2 && !compare.some(x=>x.description_id===item.description_id)} onClick={()=>setCompare(compare.some(x=>x.description_id===item.description_id) ? compare.filter(x=>x.description_id!==item.description_id) : [...compare,item])}>{compare.some(x=>x.description_id===item.description_id) ? "Remove account" : "Compare account"}</button></>}
      </article>)}</div>{data.total===0 && <p>No qualifying evidence matches these filters. Absence here does not establish that a historical relationship did not exist.</p>}</>}
      <details><summary>Method, coverage and snapshot</summary><p>Every relationship is derived from retained source assertions and existing actor IDs. Ambiguous identities remain separate. Source records are not necessarily independent corroboration. Missing and contextual evidence is not silently converted to a historical relationship.</p><p>Data snapshot: {overview.data?.publicCoreSha256}</p><a href="/api/research/context">Download research coverage and binding</a></details>
    </>}
  </section>;
}

export function ActorResearchPanel({actorId}: {actorId: string}) {
  const [open,setOpen]=useState(false);
  return <details className="actor-compact-details" onToggle={e=>setOpen(e.currentTarget.open)}><summary>Research builder connections and configurations</summary>{open && <OrganologicalResearch initialActor={actorId}/>}</details>;
}
