import type {FormEvent} from 'react';
import {JsonEvidence} from './JsonEvidence';
import {AdvancedFilters} from './researchFilters';
import {useUiLocale, type UiText} from './uiLocale';

type Row = Record<string, any>;
const occurrenceLabels: Record<string, [string, string]> = {
  authority_conflict: ['Authority/date conflict', 'Widerspruch in Normdaten oder Datierungen'],
  outside_person_lifetime: ['Outside named person’s lifetime', 'Außerhalb der Lebenszeit der genannten Person'],
  within_person_lifetime: ['Within evidenced lifetime · identity unresolved', 'Innerhalb der belegten Lebenszeit · Identität ungeklärt'],
  no_conflict_with_known_boundary: ['No conflict with known boundary · identity unresolved', 'Mit der bekannten Zeitgrenze vereinbar · Identität ungeklärt'],
  overlaps_person_boundary: ['Interval crosses lifetime boundary', 'Zeitraum überschneidet eine Grenze der Lebenszeit'],
  date_unestablished: ['Participation date unestablished', 'Zeitpunkt der Beteiligung ungeklärt'],
  identity_scope_unresolved: ['Person/workshop/generation scope unresolved', 'Zuordnung zu Person, Werkstatt oder Generation ungeklärt'],
};
const label = (value: string, t: UiText) => occurrenceLabels[value] ? t(`workbench.attribution.status.${value}`, ...occurrenceLabels[value]) : value;
const builder = (t: UiText) => t('workbench.attribution.builder', 'Aggregate builder assertion', 'Zusammengefasste Orgelbauerzuschreibung');
const participant = (t: UiText) => t('workbench.attribution.participant', 'Event participant', 'An einem Ereignis beteiligte Person');

export function AttributionNotes({items, inspect}: {items: Row[]; inspect: (value: Row) => void}) {
  const {t} = useUiLocale();
  if (!items?.length) return <p className="wb-source">{t('workbench.attribution.noAssessment', 'This event has no occurrence assessment in the bounded identity cohort.', 'Für dieses Ereignis liegt in der untersuchten Gruppe keine Bewertung der Zuschreibung vor.')}</p>;
  return <details className="wb-identity-notes">
    <summary>{t('workbench.attribution.inspectCount', 'Inspect attribution assessments · {count, number}', 'Bewertungen der Zuschreibungen prüfen · {count, number}', {count: items.length})}</summary>
    {items.map(item => <div key={item.id}>
      <p><strong>{label(item.status, t)}</strong> · {item.evidence?.participant?.wording || item.actorId || t('workbench.attribution.unknownActor', 'Unresolved actor', 'Beteiligte Person oder Organisation ungeklärt')}</p>
      <p>{item.reason}</p>
      <button type="button" onClick={() => inspect({view: 'occurrences', native: item.nativeId, actor: item.actorId || '', event: item.eventId || ''})}>{t('workbench.attribution.inspectSource', 'Inspect this attribution and its source', 'Diese Zuschreibung und ihre Quelle prüfen')}</button>
    </div>)}
  </details>;
}

export function OccurrenceFilters({params, data, go}: {params: URLSearchParams; data?: Row; go: (values: Row, reset?: boolean) => void}) {
  const {t} = useUiLocale();
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    go({...Object.fromEntries(new FormData(event.currentTarget)), view: 'occurrences', page: 0}, true);
  }
  return <form key={params.toString()} className="wb-filters" onSubmit={submit} aria-label={t('workbench.attribution.filter', 'Attribution filters', 'Filter für Zuschreibungen')}>
    <div className="wb-filter-grid">
      <label>{t('workbench.attribution.cohort', 'Identity cohort', 'Untersuchte Gruppe')}<select name="native" defaultValue={params.get('native') || ''}>
        <option value="">{t('workbench.attribution.allCohorts', 'All assessed cohorts', 'Alle bewerteten Gruppen')}</option>
        {data?.cohorts.map((item: Row) => <option key={item.nativeId} value={item.nativeId}>{item.sourceNames.join(' / ')} · {item.nativeId}</option>)}
      </select></label>
      <label>{t('workbench.attribution.assessment', 'Assessment', 'Bewertung')}<select name="status" defaultValue={params.get('status') || ''}>
        <option value="">{t('workbench.attribution.allAssessments', 'All assessments', 'Alle Bewertungen')}</option>
        {Object.keys(occurrenceLabels).map(key => <option key={key} value={key}>{label(key, t)}</option>)}
      </select></label>
      <label>{t('workbench.attribution.kind', 'Occurrence kind', 'Art der Nennung')}<select name="kind" defaultValue={params.get('kind') || ''}>
        <option value="">{t('workbench.attribution.allKinds', 'Builder assertions and participants', 'Orgelbauerzuschreibungen und Beteiligte')}</option>
        <option value="builder">{builder(t)}</option><option value="participant">{participant(t)}</option>
      </select></label>
    </div>
    <AdvancedFilters params={params} keys={['actor', 'source', 'organ', 'event']}>
      <label>{t('workbench.attribution.actorId', 'Actor identifier', 'Kennung der beteiligten Person oder Organisation')}<input name="actor" defaultValue={params.get('actor') || ''}/></label>
      <label>{t('workbench.attribution.sourceId', 'Source record identifier', 'Kennung des Quellendatensatzes')}<input name="source" defaultValue={params.get('source') || ''}/></label>
      <label>{t('workbench.attribution.organId', 'Organ identifier', 'Orgelkennung')}<input name="organ" defaultValue={params.get('organ') || ''}/></label>
      <label>{t('workbench.attribution.eventId', 'Event identifier', 'Ereigniskennung')}<input name="event" defaultValue={params.get('event') || ''}/></label>
    </AdvancedFilters>
    <div className="wb-filter-actions"><button className="wb-apply" type="submit">{t('workbench.attribution.apply', 'Apply attribution filters', 'Filter für Zuschreibungen anwenden')}</button></div>
  </form>;
}

export function OccurrenceResults({data}: {data: Row}) {
  const {t, formatNumber} = useUiLocale();
  return <>
    <h2>{t('workbench.attribution.heading', 'Individual attribution evidence', 'Belege für einzelne Zuschreibungen')}</h2>
    <div className="wb-stats">
      <span>{t('workbench.attribution.assessedCount', '{count, number} assessed occurrences', '{count, number} bewertete Nennungen', {count: data.coverage.occurrences})}</span>
      <span>{t('workbench.attribution.cohortCount', '{count, number} cohorts', '{count, number} Gruppen', {count: data.coverage.groups})}</span>
      <span>{t('workbench.attribution.organCount', '{count, number} organs', '{count, number} Orgeln', {count: data.coverage.organ})}</span>
      <span>{t('workbench.attribution.matchCount', '{count, number} matching this selection', '{count, number} Treffer in dieser Auswahl', {count: data.total})}</span>
    </div>
    <details>
      <summary>{t('workbench.attribution.coverage', 'Assessment coverage and unresolved outcomes', 'Umfang der Bewertungen und ungeklärte Fälle')}</summary>
      <ul>{Object.entries(data.coverage.byStatus).map(([key, value]) => <li key={key}>{label(key, t)} · {formatNumber(Number(value))}</li>)}</ul>
      <p>{t('workbench.attribution.countScope', 'These are occurrence counts, not unique people or physical interventions. Unassessed records elsewhere in the corpus are not counted as verified.',
        'Die Zahlen beziehen sich auf einzelne Nennungen. Eine Person oder ein Eingriff kann mehrfach genannt sein. Nur bewertete Datensätze gehen in diese Auswertung ein.')}</p>
    </details>
    {data.items.map((item: Row) => <article key={item.id} className="wb-occurrence" data-assessment={item.status}>
      <h3>{label(item.status, t)}</h3>
      <p><strong>{item.evidence?.participant?.wording || item.evidence?.source_label || t('workbench.attribution.unknownParticipant', 'Unresolved source participant', 'In der Quelle genannte Person ungeklärt')}</strong> · {item.kind === 'builder' ? builder(t) : participant(t)}</p>
      <p>{item.reason}</p>
      <p>{item.dates.map((date: Row) => date.expression || [date.startYear, date.endYear].join('–')).join('; ') || t('workbench.attribution.unknownDate', 'No single participation date established', 'Kein eindeutiges Datum der Beteiligung ermittelt')}</p>
      <div className="wb-tools">
        <a href={item.organHref}>{t('workbench.attribution.openOrgan', 'Open organ', 'Orgel öffnen')}</a>
        {item.eventId && <a href={item.href}>{t('workbench.attribution.openEvent', 'Open documented event', 'Dokumentiertes Ereignis öffnen')}</a>}
        {item.actorId && <a href={'/people/' + encodeURIComponent(item.actorId.replace('MDVS:ENTY:', ''))}>{t('workbench.attribution.openActor', 'Retained actor record', 'Erhaltener Datensatz zur Person oder Organisation')}</a>}
      </div>
      {item.personHypothesis && <blockquote>
        <strong>{t('workbench.attribution.hypothesis', 'Person interpretation being tested', 'Geprüfte Zuordnung zu einer Person')}</strong> · {item.personHypothesis.name} ({item.personHypothesis.birth || t('workbench.attribution.birth', 'birth unestablished', 'Geburtsdatum ungeklärt')}–{item.personHypothesis.death || t('workbench.attribution.death', 'death unestablished', 'Sterbedatum ungeklärt')}).{' '}
        <a href={item.personHypothesis.source.url} target="_blank" rel="noreferrer">{t('workbench.attribution.primarySource', 'Preserved primary source', 'Erhaltene Primärquelle')}</a>
        <p>{t('workbench.attribution.hypothesisBoundary', 'A workshop replacement and this occurrence’s identity remain unestablished.', 'Ein Wechsel der Werkstatt und die Identität der hier genannten Person bleiben ungeklärt.')}</p>
      </blockquote>}
      <p className="wb-source">{item.sourceRecordId} · {t('workbench.attribution.nativeId', 'Identifier in the source', 'Kennung in der Quelle')} {item.observedNativeId || t('workbench.attribution.noNativeId', 'not evidenced for this occurrence', 'für diese Nennung nicht belegt')}</p>
      <details><summary>{t('workbench.attribution.original', 'Original attribution, date and provenance', 'Ursprüngliche Zuschreibung, Datierung und Herkunft')}</summary><JsonEvidence value={item.evidence} label={t('workbench.attribution.originalJson', 'Original attribution and provenance', 'Ursprüngliche Zuschreibung und Herkunft')}/></details>
      <details><summary>{t('workbench.attribution.assessmentEvidence', 'Assessment evidence and identifiers', 'Bewertungsbelege und Kennungen')}</summary><JsonEvidence value={item} label={t('workbench.attribution.assessmentJson', 'Attribution assessment', 'Bewertung der Zuschreibung')}/></details>
    </article>)}
  </>;
}
