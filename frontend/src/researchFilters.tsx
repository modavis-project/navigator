import type {ReactNode, FormEvent} from 'react';
import {useState} from 'react';
import {ArrowRight, SlidersHorizontal, X} from 'lucide-react';
import {useUiLocale, type UiText} from './uiLocale';
import {workbenchEvidenceLabel} from './workbenchLabels';

type Values = Record<string, any>;
const names: Record<string, [string, string]> = {
  actor: ['Actor', 'Beteiligte Person oder Organisation'], other: ['Comparison actor', 'Weitere Person oder Organisation zum Vergleich'],
  q: ['Search', 'Suche'], organ: ['Organ', 'Orgel'], source: ['Source', 'Quelle'],
  from: ['From', 'Von'], to: ['Through', 'Bis einschließlich'], identity: ['Identity assessment', 'Identitätsbewertung'],
  date: ['Date interpretation', 'Grundlage der Datierung'], activity: ['Activity', 'Tätigkeit'], role: ['Role', 'Rolle'],
  coverage: ['Coverage', 'Erfassungsumfang'], concept: ['Concept', 'Begriff'], pitch: ['Pitch', 'Fußtonlage'],
  country: ['Country', 'Land'], native: ['Cohort', 'Gruppe'], status: ['Assessment', 'Bewertung'],
  kind: ['Occurrence kind', 'Art der Nennung'], event: ['Event', 'Ereignis'], organs: ['Compared organs', 'Verglichene Orgeln'],
};
const fieldLabel = (key: string, t: UiText) => t(`workbench.filter.field.${key}`, ...names[key]);
const fields: Record<string, string[]> = {
  selection: ['actor','other','q','organ','source','from','to','identity','date','activity','role','coverage'],
  terms: ['q','concept','pitch','country','source','from','to'],
  occurrences: ['native','status','kind','actor','source','organ','event'],
  timeline: ['organ'], claims: ['organ'],
  organs: ['organs'],
};
const sectionFields: Record<string, string[]> = {
  events: ['actor','other','q','organ','source','from','to','identity','date','activity','role'],
  sequences: ['actor','other','q','organ','source','from','to','identity','date','activity','role'],
  configurations: ['actor','q','organ','source','from','to','date','coverage'],
  organs: ['actor','other','q','organ','source'],
};

export function AdvancedFilters({params, keys, children}: {params: URLSearchParams, keys: string[], children: ReactNode}) {
  const {t} = useUiLocale();
  const count = keys.filter(key => params.get(key)).length;
  return <details className="wb-advanced" open={count > 0}>
    <summary><SlidersHorizontal size={16} aria-hidden="true"/> {t('workbench.filter.more','More filters','Weitere Filter')} {count > 0 && <span>{t('workbench.filter.appliedCount','{count, number} applied','{count, number} aktiv',{count})}</span>}</summary>
    <div className="wb-filter-grid">{children}</div>
  </details>;
}

export function AppliedFilters({params, mode, go}: {params: URLSearchParams, mode: string, go: (values: Values, reset?: boolean) => void}) {
  const {t} = useUiLocale();
  const active = (mode === 'selection' ? sectionFields[params.get('section') || 'events'] || [] : fields[mode] || []).filter(key => params.get(key));
  if (!active.length) return null;
  return <div className="wb-applied" aria-label={t('workbench.filter.appliedAria','Applied research filters','Aktive Forschungsfilter')}>
    <span>{t('workbench.filter.applied','Applied','Aktiv')}</span>
    {active.map(key => {
      const field = fieldLabel(key,t);
      const raw = params.get(key)!;
      const value = ['identity','date','activity','coverage','kind'].includes(key) ? workbenchEvidenceLabel(raw,t) : raw;
      return <button key={key} type="button" onClick={() => go({[key]: null, page: 0})}
        aria-label={t('workbench.filter.remove','Remove {field} filter: {value}','Filter {field} entfernen: {value}',{field,value})}>
        <span>{field}: <strong>{value}</strong></span><X size={13} aria-hidden="true"/>
      </button>;
    })}
    <button type="button" className="wb-clear" onClick={() => go(Object.fromEntries([...active.map(key => [key, null]), ['page', 0]]))}>{t('workbench.filter.clear','Clear filters','Filter zurücksetzen')}</button>
  </div>;
}

export function ResearchFilters({params, mode, facets, onSubmit}: {params: URLSearchParams, mode: string, facets?: Values, onSubmit: (event: FormEvent<HTMLFormElement>) => void}) {
  const {t,locale} = useUiLocale();
  const [section, setSection] = useState(params.get('section') || 'events');
  const sequenceSection = mode === 'selection' && section === 'sequences';
  const eventSection = ['events', 'sequences'].includes(section);
  const datedSection = eventSection || section === 'configurations';
  const input = (name: string, label: string, placeholder?: string, year = false) => <label>{label}<input name={name} defaultValue={params.get(name) || ''} placeholder={placeholder} required={sequenceSection && (name === 'actor' || name === 'other')} type={year ? 'number' : 'text'} min={year ? 1 : undefined} max={year ? 2100 : undefined}/></label>;
  const select = (name: string, label: string, fallback: string, options: string[] = [], coded = true) => {
    const selected = params.get(name) || '';
    // Facets arrive after the form mounts. Keep its URL value selectable from
    // the first render without controlling or resetting the user's draft.
    const available = selected && !options.includes(selected) ? [selected, ...options] : options;
    return <label>{label}<select name={name} defaultValue={selected}><option value="">{fallback}</option>{available.map(x => <option key={x} value={x}>{coded?workbenchEvidenceLabel(x,t):x}</option>)}</select></label>;
  };
  const years = <>{input('from',t('workbench.filter.fromYear','From year','Ab Jahr'),undefined,true)}{input('to',t('workbench.filter.throughYear','Through year','Bis einschließlich Jahr'),undefined,true)}</>;
  const source = select('source',fieldLabel('source',t),t('workbench.filter.allSources','All sources','Alle Quellen'),facets?.sources,false);
  const organ = input('organ',t('workbench.filter.organId','Organ identifier','Orgelkennung'),'EAXV-HAAS-S');
  const identity = t('workbench.filter.actorIdentity','Identity assessment (actor events/sequences)','Identitätsbewertung bei Ereignissen und Ereignisfolgen');
  const sections = [
    ['events', t('workbench.filter.sectionEvents','Event assertions','Ereignisaussagen')],
    ['configurations', t('workbench.filter.sectionAccounts','Configuration accounts','Dispositionsbeschreibungen')],
    ['organs', t('workbench.filter.sectionOrgans','Associated organs','Zugeordnete Orgeln')],
    ['sequences', t('workbench.filter.sectionSequences','Earlier → later work','Frühere und spätere Arbeiten')],
  ];
  return <form className="wb-filters" id="wb-filters" onSubmit={onSubmit} aria-label={t('workbench.filter.form','Research selection filters','Filter für die Forschungsauswahl')}>
    <div className="wb-filter-heading"><span>{t('workbench.filter.heading','Set your scope','Suche eingrenzen')}</span><small>{t('workbench.filter.submitHint','Filters apply when you submit','Filter werden beim Absenden angewendet')}</small></div>
    <div className="wb-filter-grid">
      {mode === 'selection' && <>
        <label>{t('workbench.filter.section','Research section','Forschungsbereich')}<select name="section" value={section} onChange={event => setSection(event.target.value)}>{!sectionFields[section] && <option value={section}>{t('workbench.filter.unsupportedSection','Unsupported section: {section}','Nicht unterstützter Bereich: {section}',{section})}</option>}{sections.map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        {input('actor',sequenceSection?t('workbench.filter.earlierActor','Earlier actor identifier','Kennung zum früheren Ereignis'):t('workbench.filter.actorId','Actor identifier','Kennung der beteiligten Person oder Organisation'),t('workbench.filter.builderHint','Use builder search above','Orgelbauersuche oben verwenden'))}
        {sequenceSection && input('other',t('workbench.filter.laterActor','Later actor identifier','Kennung zum späteren Ereignis'))}
        {input('q',t('workbench.filter.organQuery','Organ name or identifier search','Orgelname oder Kennung'),t('workbench.filter.queryHint','Search this selection','Diese Auswahl durchsuchen'))}{source}
      </>}
      {['timeline','claims'].includes(mode) && organ}
      {mode === 'organs' && input('organs',t('workbench.filter.comparedOrganIds','Compared organ identifiers','Kennungen der verglichenen Orgeln'),t('workbench.filter.comparedOrganHint','Two to four comma-separated organ identifiers','Zwei bis vier Orgelkennungen, durch Kommas getrennt'))}
      {mode === 'compare' && <>{['left','right'].map(side => <label key={side}>{side === 'left' ? t('workbench.filter.firstAccount','First account identifier','Kennung der ersten Beschreibung') : t('workbench.filter.secondAccount','Second account identifier','Kennung der zweiten Beschreibung')}<input name={side} required defaultValue={params.get(side) || ''}/><input type="hidden" name={side+'Revision'} value={params.get(side+'Revision') || ''}/></label>)}</>}
      {mode === 'terms' && <>
        <label>{t('workbench.filter.termKind','Occurrence kind','Art der Nennung')}<select name="mode" defaultValue={params.get('mode') || 'stops'}>{(facets?.termKinds || ['stops','divisions','activities']).map((kind:string)=><option key={kind} value={kind}>{workbenchEvidenceLabel(kind,t)}</option>)}</select></label>
        {input('q',t('workbench.filter.wording','Literal term or wording','Begriff oder Wortlaut der Quelle'),'Principal')}{source}{input('pitch',t('workbench.filter.recordedPitch','Recorded pitch','Überlieferte Fußtonlage'))}
      </>}
    </div>
    {mode === 'selection' && <AdvancedFilters params={params} keys={(sectionFields[section] || []).filter(key => !['actor','q','source'].includes(key) && (!sequenceSection || key !== 'other'))}>
      {section !== 'configurations' && !sequenceSection && input('other',fieldLabel('other',t))}{organ}{datedSection && years}
      {eventSection && <label>{identity}<select name="identity" aria-label={identity} defaultValue={params.get('identity') || ''}>
        <option value="">{t('workbench.filter.identityAll','Retain all attributions','Alle Zuschreibungen berücksichtigen')}</option>
        <option value="exclude_conflicts">{t('workbench.filter.identityExclude','Exclude assessed conflicts','Bewertete Konflikte ausschließen')}</option>
        <option value="conflicts_only">{t('workbench.filter.identityConflicts','Assessed conflicts only','Nur bewertete Konflikte')}</option>
        <option value="temporally_compatible">{t('workbench.filter.identityLifetime','Within evidenced person lifetime','Innerhalb der belegten Lebenszeit')}</option>
      </select></label>}
      {datedSection && select('date',fieldLabel('date',t),t('workbench.filter.dateAll','All date qualifications','Alle Datierungsarten'),facets?.dateKinds)}
      {eventSection && select('activity',t('workbench.filter.controlledActivity','Controlled activity','Standardisierte Tätigkeit'),t('workbench.filter.activityAll','Any event activity','Alle Tätigkeiten'),facets?.activities)}
      {eventSection && input('role',t('workbench.filter.exactRole','Participant role (exact source role)','Rolle der beteiligten Person im exakten Quellenwortlaut'))}
      {section === 'configurations' && select('coverage',t('workbench.filter.accountCoverage','Account coverage','Erfassungsumfang der Beschreibung'),t('workbench.filter.coverageAll','All account coverage','Alle Erfassungsumfänge'),facets?.coverage)}
    </AdvancedFilters>}
    {mode === 'terms' && <AdvancedFilters params={params} keys={['concept','country','from','to']}>
      {facets?.seedConcepts?.length ? <label>{t('workbench.filter.conceptId','Concept identifier','Begriffskennung')}<input name="concept" list="wb-term-concepts" defaultValue={params.get('concept')||''} placeholder={t('workbench.filter.conceptHint','Select a candidate concept or enter an activity code','Begriffskandidaten wählen oder Tätigkeitscode eingeben')}/><datalist id="wb-term-concepts">{facets.seedConcepts.map((x:Values)=><option key={x.id} value={x.id}>{x.label[locale] || x.label.en} · {t('workbench.filter.candidate','candidate','Kandidat')}</option>)}</datalist></label> : input('concept',t('workbench.filter.conceptCode','Controlled concept code','Code eines standardisierten Begriffs'),t('workbench.filter.conceptOptional','Optional existing activity concept','Optionaler vorhandener Tätigkeitsbegriff'))}
      {select('country',t('workbench.filter.sourceCountry','Country of source listing','Land laut Quelleneintrag'),t('workbench.filter.countriesAll','All / unassigned included','Alle, einschließlich ohne Zuordnung'),facets?.countries,false)}{years}
    </AdvancedFilters>}
    <div className="wb-filter-actions"><p>{t('workbench.filter.preserve','Source wording and date qualifications stay attached to the results.','Quellenwortlaut und Hinweise zur Datierung bleiben den Ergebnissen zugeordnet.')}</p><button className="wb-apply" type="submit">{t('workbench.filter.apply','Apply selection','Auswahl anwenden')} <ArrowRight size={16} aria-hidden="true"/></button></div>
  </form>;
}
