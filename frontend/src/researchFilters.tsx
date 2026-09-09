import type {ReactNode, FormEvent} from 'react';
import {ArrowRight, SlidersHorizontal, X} from 'lucide-react';

type Values = Record<string, any>;
const pretty = (value: string) => value.replace(/_/g, ' ');
const names: Record<string, string> = {
  actor: 'Actor', other: 'Comparison actor', q: 'Search', organ: 'Organ', source: 'Source',
  from: 'From', to: 'Through', identity: 'Identity assessment', date: 'Date interpretation',
  activity: 'Activity', role: 'Role', coverage: 'Coverage', concept: 'Concept', pitch: 'Pitch',
  country: 'Country', native: 'Cohort', status: 'Assessment', kind: 'Occurrence kind', event: 'Event',
};
const fields: Record<string, string[]> = {
  selection: ['actor','other','q','organ','source','from','to','identity','date','activity','role','coverage'],
  terms: ['q','concept','pitch','country','source','from','to'],
  occurrences: ['native','status','kind','actor','source','organ','event'],
  timeline: ['organ'], claims: ['organ'],
};

export function AdvancedFilters({params, keys, children}: {params: URLSearchParams, keys: string[], children: ReactNode}) {
  const count = keys.filter(key => params.get(key)).length;
  return <details className="wb-advanced" open={count > 0}>
    <summary><SlidersHorizontal size={16} aria-hidden="true"/> More filters {count > 0 && <span>{count} applied</span>}</summary>
    <div className="wb-filter-grid">{children}</div>
  </details>;
}

export function AppliedFilters({params, mode, go}: {params: URLSearchParams, mode: string, go: (values: Values, reset?: boolean) => void}) {
  const active = (fields[mode] || []).filter(key => params.get(key));
  if (!active.length) return null;
  return <div className="wb-applied" aria-label="Applied research filters">
    <span>Applied</span>
    {active.map(key => <button key={key} onClick={() => go({[key]: null, page: 0})}
      aria-label={`Remove ${names[key]} filter: ${params.get(key)}`}>
      <span>{names[key]}: <strong>{pretty(params.get(key)!)}</strong></span><X size={13} aria-hidden="true"/>
    </button>)}
    <button className="wb-clear" onClick={() => go(Object.fromEntries([...active.map(key => [key, null]), ['page', 0]]))}>Clear filters</button>
  </div>;
}

export function ResearchFilters({params, mode, facets, onSubmit}: {params: URLSearchParams, mode: string, facets?: Values, onSubmit: (event: FormEvent<HTMLFormElement>) => void}) {
  const input = (name: string, label: string, placeholder?: string, year = false) => <label>{label}<input name={name} defaultValue={params.get(name) || ''} placeholder={placeholder} type={year ? 'number' : 'text'} min={year ? 1 : undefined} max={year ? 2100 : undefined}/></label>;
  const select = (name: string, label: string, fallback: string, options: string[] = []) => <label>{label}<select name={name} defaultValue={params.get(name) || ''}><option value="">{fallback}</option>{options.map(x => <option key={x} value={x}>{pretty(x)}</option>)}</select></label>;
  const years = <>{input('from','From year',undefined,true)}{input('to','Through year',undefined,true)}</>;
  const source = select('source','Source','All sources',facets?.sources);
  return <form key={params.toString()} className="wb-filters" onSubmit={onSubmit} aria-label="Research selection filters">
    <div className="wb-filter-grid">
      {mode === 'selection' && <>
        <label>Research section<select name="section" defaultValue={params.get('section') || 'events'}>{[['events','Event assertions'],['configurations','Configuration accounts'],['organs','Associated organs'],['sequences','Earlier → later work']].map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        {input('actor','Actor identifier','Use builder search above')}
        {input('q','Organ name or identifier search','Search this selection')}{source}
      </>}
      {['timeline','claims'].includes(mode) && input('organ','Organ identifier','e.g. EAXV-HAAS-S')}
      {mode === 'compare' && <>{['left','right'].map(side => <label key={side}>{side === 'left' ? 'First' : 'Second'} account identifier<input name={side} required defaultValue={params.get(side) || ''}/><input type="hidden" name={side+'Revision'} value={params.get(side+'Revision') || ''}/></label>)}</>}
      {mode === 'terms' && <>
        <label>Occurrence kind<select name="mode" defaultValue={params.get('mode') || 'stops'}>{(facets?.termKinds || ['stops','divisions','activities']).map((kind:string)=><option key={kind} value={kind}>{pretty(kind)}</option>)}</select></label>
        {input('q','Literal term or wording','e.g. Principal')}{source}{input('pitch','Recorded pitch')}
      </>}
    </div>
    {mode === 'selection' && <AdvancedFilters params={params} keys={['other','organ','from','to','identity','date','activity','role','coverage']}>
      {input('other','Comparison actor (events, organs, sequences)')}{input('organ','Organ identifier','e.g. EAXV-HAAS-S')}{years}
      <label>Identity assessment (actor events/sequences)<select name="identity" aria-label="Identity assessment (actor events/sequences)" defaultValue={params.get('identity') || ''}><option value="">Retain all attributions</option><option value="exclude_conflicts">Exclude assessed conflicts</option><option value="conflicts_only">Assessed conflicts only</option><option value="temporally_compatible">Within evidenced person lifetime</option></select></label>
      {select('date','Date interpretation','All date qualifications',facets?.dateKinds)}
      {select('activity','Controlled activity','Any event activity',facets?.activities)}
      {input('role','Participant role (exact source role)')}
      {select('coverage','Account coverage','All account coverage',facets?.coverage)}
    </AdvancedFilters>}
    {mode === 'terms' && <AdvancedFilters params={params} keys={['concept','country','from','to']}>
      {facets?.seedConcepts?.length ? <label>Concept identifier<input name="concept" list="wb-term-concepts" defaultValue={params.get('concept')||''} placeholder="Select a candidate concept or enter an activity code"/><datalist id="wb-term-concepts">{facets.seedConcepts.map((x:Values)=><option key={x.id} value={x.id}>{x.label.en} · candidate</option>)}</datalist></label> : input('concept','Controlled concept code','Optional existing activity concept')}
      {select('country','Country of source listing','All / unassigned included',facets?.countries)}{years}
    </AdvancedFilters>}
    <div className="wb-filter-actions"><button className="wb-apply" type="submit">Apply research selection <ArrowRight size={16} aria-hidden="true"/></button></div>
  </form>;
}
