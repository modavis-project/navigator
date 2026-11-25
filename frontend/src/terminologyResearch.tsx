import {useUiLocale} from './uiLocale';
import {workbenchEvidenceLabel} from './workbenchLabels';

type Row = Record<string, any>;
export function CandidateConcepts({concepts, go}: {concepts: Row[]; go: (values: Row) => void}) {
  const {locale, t} = useUiLocale();
  if (!concepts.length) return null;
  return <section className="wb-terminology-concepts" aria-label={t('workbench.concepts.region', 'Candidate terminology concepts', 'Kandidaten für Terminologiebegriffe')}>
    <h2>{t('workbench.concepts.search', 'Search by a candidate concept', 'Nach einem Begriffskandidaten suchen')}</h2>
    <p>{t('workbench.concepts.method', 'These definitions organize source designations. The lexical rules have been reviewed; the concepts are still candidates for a future vocabulary.',
      'Diese Definitionen ordnen Bezeichnungen aus den Quellen. Die lexikalischen Regeln wurden geprüft. Die Begriffe sind Kandidaten für ein künftiges Vokabular.')}</p>
    <div className="wb-columns">{concepts.map(concept => <article className="wb-evidence" key={concept.id}>
      <h3>{concept.label[locale] || concept.label.en} <small>{t('workbench.concepts.candidate', 'Candidate', 'Kandidat')}</small></h3><p>{concept.definition}</p>
      <details><summary>{t('workbench.concepts.evidence', 'Included source wording and evidence', 'Berücksichtigter Quellenwortlaut und Belege')}</summary>
        {concept.mappings.map((mapping: Row) => <p key={mapping.family}><strong>{workbenchEvidenceLabel(mapping.family, t)}</strong> · {mapping.literals.join(' · ')}</p>)}
        {concept.evidence.map((url: string) => <p key={url}><a href={url} target="_blank" rel="noreferrer">{t('workbench.concepts.source', 'Definition source', 'Quelle der Definition')}</a></p>)}
        <p><code>{concept.id}</code></p>
      </details>
      {concept.mappings.map((mapping: Row) => <button type="button" key={mapping.family} onClick={() => go({mode: mapping.family, concept: concept.id, q: null, page: 0})}>
        {t('workbench.concepts.inspect', 'Inspect occurrences · {family}', 'Vorkommen prüfen · {family}', {family: workbenchEvidenceLabel(mapping.family, t)})}
      </button>)}
    </article>)}</div>
  </section>;
}
