import { JsonEvidence } from "./JsonEvidence";
import type {FormEvent} from 'react';
import {AdvancedFilters} from './researchFilters';
type Row=Record<string,any>;
export const occurrenceLabels:Record<string,string>={authority_conflict:'Authority/date conflict',outside_person_lifetime:'Outside named person’s lifetime',within_person_lifetime:'Within evidenced lifetime · identity unresolved',no_conflict_with_known_boundary:'No conflict with known boundary · identity unresolved',overlaps_person_boundary:'Interval crosses lifetime boundary',date_unestablished:'Participation date unestablished',identity_scope_unresolved:'Person/workshop/generation scope unresolved'};
const label=(x:string)=>occurrenceLabels[x]||x;
export function AttributionNotes({items,inspect}:{items:Row[],inspect:(value:Row)=>void}){
 if(!items?.length)return <p className="wb-source">This event has no occurrence assessment in the bounded identity cohort.</p>;
 return <details className="wb-identity-notes"><summary>Inspect attribution assessments · {items.length}</summary>{items.map(x=><div key={x.id}><p><strong>{label(x.status)}</strong> — {x.evidence?.participant?.wording||x.actorId||'Unresolved actor'}</p><p>{x.reason}</p><button onClick={()=>inspect({view:'occurrences',native:x.nativeId,actor:x.actorId||'',event:x.eventId||''})}>Inspect this attribution and its source</button></div>)}</details>;
}
export function OccurrenceFilters({params,data,go}:{params:URLSearchParams,data?:Row,go:(values:Row,reset?:boolean)=>void}){
 function submit(e:FormEvent<HTMLFormElement>){e.preventDefault();go({...Object.fromEntries(new FormData(e.currentTarget)),view:'occurrences',page:0},true);}
 return <form key={params.toString()} className="wb-filters" onSubmit={submit} aria-label="Attribution filters"><div className="wb-filter-grid">
 <label>Identity cohort<select name="native" defaultValue={params.get('native')||''}><option value="">All assessed cohorts</option>{data?.cohorts.map((x:Row)=><option key={x.nativeId} value={x.nativeId}>{x.sourceNames.join(' / ')} · {x.nativeId}</option>)}</select></label>
 <label>Assessment<select name="status" defaultValue={params.get('status')||''}><option value="">All assessments</option>{Object.entries(occurrenceLabels).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
 <label>Occurrence kind<select name="kind" defaultValue={params.get('kind')||''}><option value="">Builder assertions and participants</option><option value="builder">Aggregate builder assertion</option><option value="participant">Event participant</option></select></label>
 </div><AdvancedFilters params={params} keys={['actor','source','organ','event']}>
 <label>Actor identifier<input name="actor" defaultValue={params.get('actor')||''}/></label>
 <label>Source record identifier<input name="source" defaultValue={params.get('source')||''}/></label>
 <label>Organ identifier<input name="organ" defaultValue={params.get('organ')||''}/></label>
 <label>Event identifier<input name="event" defaultValue={params.get('event')||''}/></label>
 </AdvancedFilters><div className="wb-filter-actions"><button className="wb-apply">Apply attribution filters</button></div></form>;
}
export function OccurrenceResults({data}:{data:Row}){
 return <><h2>Individual attribution evidence</h2><div className="wb-stats"><span>{data.coverage.occurrences.toLocaleString()} assessed occurrences</span><span>{data.coverage.groups} cohorts</span><span>{data.coverage.organ.toLocaleString()} organs</span><span>{data.total.toLocaleString()} matching this selection</span></div>
 <details><summary>Assessment coverage and unresolved outcomes</summary><ul>{Object.entries(data.coverage.byStatus).map(([k,v])=><li key={k}>{label(k)}: {Number(v).toLocaleString()}</li>)}</ul><p>These are occurrence counts, not unique people or physical interventions. Unassessed records elsewhere in the corpus are not counted as verified.</p></details>
 {data.items.map((x:Row)=><article key={x.id} className="wb-occurrence" data-assessment={x.status}><h3>{label(x.status)}</h3><p><strong>{x.evidence?.participant?.wording||x.evidence?.source_label||'Unresolved source participant'}</strong> · {x.kind==='builder'?'Aggregate builder assertion':'Event participant'}</p><p>{x.reason}</p><p>{x.dates.map((d:Row)=>d.expression||[d.startYear,d.endYear].join('–')).join('; ')||'No single participation date established'}</p>
 <div className="wb-tools"><a href={x.organHref}>Open organ</a>{x.eventId&&<a href={x.href}>Open documented event</a>}{x.actorId&&<a href={'/people/'+encodeURIComponent(x.actorId.replace('MDVS:ENTY:',''))}>Retained actor record</a>}</div>
 {x.personHypothesis&&<blockquote><strong>Person interpretation being tested:</strong> {x.personHypothesis.name} ({x.personHypothesis.birth||'birth unestablished'}–{x.personHypothesis.death||'death unestablished'}). <a href={x.personHypothesis.source.url} target="_blank" rel="noreferrer">Preserved primary source</a><p>A workshop replacement and this occurrence’s identity remain unestablished.</p></blockquote>}
 <p className="wb-source">{x.sourceRecordId} · source-native ID {x.observedNativeId||'not evidenced for this occurrence'}</p><details><summary>Original attribution, date and provenance</summary><JsonEvidence value={x.evidence} label="Original attribution and provenance"/></details><details><summary>Assessment evidence and identifiers</summary><JsonEvidence value={x} label="Attribution assessment"/></details></article>)}</>;
}
