import {usePodRead} from './PodExplorerApi';
import {LoadingContent} from './LoadingContent';
import {useUiLocale} from './uiLocale';
import './PodExplorer.css';
type Related = {
  organ: {id:string;title:string;url:string}; relationshipBoundary:string; temperamentBoundary:string;
  collections: {id:string;title:string;count:number|null;unit:string;url:string;available:boolean}[];
  virtualInstruments: {id:string;title:string;url:string;relationshipState:string;evidenceSha256:string}[];
  temperamentAssertions: {id:string;wording:string;source:string;sourceUrl:string;lookupUrl:string|null;evidenceSha256:string}[];
  unavailableRelationships: {id:string;title:string;reason:string;browseUrl:string}[];
  resourceEvidenceUrl:string;exportManifestUrl:string;itemLimit:number;
};
const collectionLabels: Record<string, readonly [string, string]> = {
  accounts: ['Dispositionsbeschreibungen', 'Quellenbeschreibungen'],
  events: ['Dokumentierte Geschichte', 'Ereignisangaben'],
  media: ['Medienverweise', 'Externe Verweise'],
  sources: ['Quelldatensätze', 'Quelldatensätze'],
  builders: ['Zuordnung zu Orgelbauern', 'Quellenangaben'],
  places: ['Standortzuordnungen', 'Ortsangaben'],
  'virtual-instruments': ['Virtuelle Instrumente', 'Verknüpfungen'],
  temperaments: ['Stimmungssysteme laut Quelle', 'Quellenangaben'],
};
export function PodRelatedResources({organId}: {organId:string}) {
  const {t, formatNumber} = useUiLocale();
  const {data, error, retry} = usePodRead<Related>('/api/pod/organs/' + encodeURIComponent(organId) + '/resources');
  const heading = t('organ.resources.heading', 'Connected resources', 'Verknüpfte Ressourcen');
  return <section className="pod-related" aria-label={heading}>
    <header><h2>{heading}</h2><p>{t('organ.resources.intro', 'This organ’s accounts, sources and retained relationships.', 'Quellenbeschreibungen, Belege und erfasste Verknüpfungen zu dieser Orgel.')}</p></header>
    {error ? <div role="alert"><p>{t('organ.resources.error', 'The resources could not be loaded.', 'Die Ressourcen konnten nicht geladen werden.')}</p><button onClick={retry}>{t('organ.resources.retry', 'Try again', 'Erneut versuchen')}</button></div> : !data ? <LoadingContent label={t('organ.resources.loading', 'Loading connected resources…', 'Verknüpfte Ressourcen werden geladen …')} /> : <>
      <div className="pod-resource-counts">{data.collections.map(item => {
        const labels = Object.prototype.hasOwnProperty.call(collectionLabels, item.id) ? collectionLabels[item.id] : null;
        return <a key={item.id} href={item.url}>
          <strong>{item.count === null ? t('organ.resources.unavailable', 'Unavailable', 'Nicht verfügbar') : formatNumber(item.count)}</strong>
          <span>{labels ? t('organ.resources.collection.' + item.id, item.title, labels[0]) : item.title}</span>
          <small>{labels ? t('organ.resources.unit.' + item.id, item.unit, labels[1]) : item.unit}</small>
        </a>;
      })}</div>
      <p className="pod-boundary">{t('organ.resources.relationshipScope', data.relationshipBoundary, 'Hier stehen die veröffentlichten Verknüpfungen und Quellenangaben. Gleiche Namen oder die Zugehörigkeit zu derselben Sammlung allein begründen keine Verknüpfung mit der Orgel.')}</p>
      <div className="pod-linked-sections">
        {!!data.virtualInstruments.length && <section>
          <h3>{t('organ.resources.virtualRelations', 'Virtual-instrument relationships', 'Verknüpfungen zu virtuellen Instrumenten')}</h3>
          <ul className="pod-linked-list">{data.virtualInstruments.map((item, index) => <li key={item.id + index}>
            <a href={item.url}>{item.title}</a><span>{item.relationshipState.replace(/_/g, ' ')}</span>
            <details><summary>{t('organ.resources.relationEvidence', 'Relationship evidence', 'Beleg zur Verknüpfung')}</summary><code>{item.evidenceSha256}</code></details>
          </li>)}</ul>
        </section>}
        {!!data.temperamentAssertions.length && <section>
          <h3>{t('organ.resources.temperament', 'Temperament as reported', 'Stimmungssystem laut Quelle')}</h3>
          <p>{t('organ.resources.temperamentScope', data.temperamentBoundary, 'Der Quellenwortlaut ist wörtlich wiedergegeben. Die Kataloglinks führen zu Einträgen mit übereinstimmendem Wortlaut. Die Cent-Werte stammen aus dem Katalog.')}</p>
          <ul className="pod-linked-list">{data.temperamentAssertions.map(item => <li key={item.id}>
            <strong>{item.wording}</strong><a href={item.sourceUrl}>{item.source} · {t('organ.resources.supportingSource', 'supporting source', 'Quellenbeleg')}</a>
            {item.lookupUrl && <a href={item.lookupUrl}>{t('organ.resources.lookupWording', 'Look up this wording', 'Diesen Wortlaut nachschlagen')}</a>}
            <details><summary>{t('organ.resources.assertionEvidence', 'Assertion evidence', 'Beleg zur Quellenangabe')}</summary><code>{item.evidenceSha256}</code></details>
          </li>)}</ul>
        </section>}
      </div>
      {(data.virtualInstruments.length === data.itemLimit || data.temperamentAssertions.length === data.itemLimit) && <p>{t('organ.resources.limit', 'Showing up to {count} entries per relationship family. The totals above describe the full retained set.', 'Je Art von Verknüpfung werden bis zu {count} Einträge angezeigt. Die Summen oben beziehen sich auf alle erfassten Einträge.', {count:formatNumber(data.itemLimit)})}</p>}
      <details><summary>{t('organ.resources.unlinked', 'Collections without an established link to this organ', 'Sammlungen ohne belegte Zuordnung zu dieser Orgel')}</summary>{data.unavailableRelationships.map(item => <p key={item.id}>
        {item.id === 'scores' ? t('organ.resources.noScores', item.reason, 'Die öffentliche Version enthält Notenausgaben, aber keine geprüfte Zuordnung von Notenausgaben zu Orgeln.') : item.id === 'literature' ? t('organ.resources.noLiterature', item.reason, 'Die öffentliche Version enthält Literaturangaben, aber keine geprüfte Zuordnung von Publikationen zu Orgeln.') : item.reason}{' '}
        <a href={item.browseUrl}>{item.id === 'scores' ? t('organ.resources.browseScores', 'Browse the scores collection', 'Notensammlung durchsuchen') : item.id === 'literature' ? t('organ.resources.browseLiterature', 'Browse the literature collection', 'Literatursammlung durchsuchen') : item.title}</a>
      </p>)}</details>
      <div className="pod-actions">
        <a href={data.resourceEvidenceUrl}>{t('organ.resources.evidenceJson', 'Resource evidence · JSON', 'Ressourcenbelege · JSON')}</a>
        <a href={data.exportManifestUrl}>{t('organ.resources.exportManifest', 'Complete entity export manifest', 'Vollständiges Exportverzeichnis des Eintrags')}</a>
        <a href="/pod-explorer">{t('organ.resources.browseAll', 'Explore all POD collections', 'Alle POD-Sammlungen erkunden')}</a>
      </div>
    </>}
  </section>;
}
