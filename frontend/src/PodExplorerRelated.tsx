import {usePodRead} from './PodExplorerApi';
import './PodExplorer.css';
type Related = {
  organ: {id:string;title:string;url:string}; relationshipBoundary:string; temperamentBoundary:string;
  collections: {id:string;title:string;count:number|null;unit:string;url:string;available:boolean}[];
  virtualInstruments: {id:string;title:string;url:string;relationshipState:string;evidenceSha256:string}[];
  temperamentAssertions: {id:string;wording:string;source:string;sourceUrl:string;lookupUrl:string|null;evidenceSha256:string}[];
  unavailableRelationships: {id:string;title:string;reason:string;browseUrl:string}[];
  resourceEvidenceUrl:string;exportManifestUrl:string;itemLimit:number;
};
export function PodRelatedResources({organId}: {organId:string}) {
  const {data, error, retry} = usePodRead<Related>('/api/pod/organs/' + encodeURIComponent(organId) + '/resources');
  return <section className="pod-related" aria-label="Connected POD resources">
    <header><h2>Connected resources</h2><p>This organ’s accounts, sources and retained relationships.</p></header>
    {error ? <div role="alert"><p>{error}</p><button onClick={retry}>Retry resources</button></div> : !data ? <p role="status">Loading connected resources…</p> : <>
      <div className="pod-resource-counts">{data.collections.map(item => <a key={item.id} href={item.url}>
        <strong>{item.count === null ? 'Unavailable' : item.count.toLocaleString()}</strong><span>{item.title}</span><small>{item.unit}</small>
      </a>)}</div>
      <p className="pod-boundary">{data.relationshipBoundary}</p>
      <div className="pod-linked-sections">{!!data.virtualInstruments.length && <section><h3>Virtual-instrument relationships</h3><ul className="pod-linked-list">{data.virtualInstruments.map((item, index) => <li key={item.id + index}><a href={item.url}>{item.title}</a><span>{item.relationshipState.replace(/_/g, ' ')}</span><details><summary>Relationship evidence</summary><code>{item.evidenceSha256}</code></details></li>)}</ul></section>}
      {!!data.temperamentAssertions.length && <section><h3>Temperament as reported</h3><p>{data.temperamentBoundary}</p><ul className="pod-linked-list">{data.temperamentAssertions.map(item => <li key={item.id}><strong>{item.wording}</strong><a href={item.sourceUrl}>{item.source} · supporting source</a>{item.lookupUrl && <a href={item.lookupUrl}>Look up this wording</a>}<details><summary>Assertion evidence</summary><code>{item.evidenceSha256}</code></details></li>)}</ul></section>}</div>
      {(data.virtualInstruments.length === data.itemLimit || data.temperamentAssertions.length === data.itemLimit) && <p>Showing up to {data.itemLimit} entries per relationship family. The totals above describe the full retained set.</p>}
      <details><summary>Collections without an established link to this organ</summary>{data.unavailableRelationships.map(item => <p key={item.id}>{item.reason} <a href={item.browseUrl}>Browse the {item.id} collection</a></p>)}</details>
      <div className="pod-actions"><a href={data.resourceEvidenceUrl}>Resource evidence · JSON</a><a href={data.exportManifestUrl}>Complete entity export manifest</a><a href="/pod-explorer">Explore all POD collections</a></div>
    </>}
  </section>;
}
