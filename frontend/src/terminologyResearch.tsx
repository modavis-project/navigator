type Row=Record<string,any>;
const pretty=(value:any)=>String(value??'Unspecified').replace(/_/g,' ');
export function CandidateConcepts({concepts,go}:{concepts:Row[],go:(values:Row)=>void}) {
 if(!concepts.length)return null;
 return <section className="wb-terminology-concepts" aria-label="Candidate terminology concepts">
  <h2>Search by a candidate concept</h2>
  <p>These definitions organize source designations. The lexical rules have been reviewed; the concepts are still candidates for a future vocabulary.</p>
  <div className="wb-columns">{concepts.map(x=><article className="wb-evidence" key={x.id}>
   <h3>{x.label.en} <small>Candidate</small></h3><p>{x.definition}</p>
   <details><summary>Included source wording and evidence</summary>
    {x.mappings.map((m:Row)=><p key={m.family}><strong>{pretty(m.family)}:</strong> {m.literals.join(' · ')}</p>)}
    {x.evidence.map((url:string)=><p key={url}><a href={url} target="_blank" rel="noreferrer">Definition source</a></p>)}
    <p><code>{x.id}</code></p>
   </details>
   {x.mappings.map((m:Row)=><button key={m.family} onClick={()=>go({mode:m.family,concept:x.id,q:null,page:0})}>Inspect {pretty(m.family)} occurrences</button>)}
  </article>)}</div>
 </section>;
}
