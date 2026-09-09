import { useEffect, useState } from "react";
import { Braces, ExternalLink, MapPin } from "lucide-react";
import { IdentifierCopy } from "./publicExperience";
import { EntityExportPanel, EntityPageTabs, EntityTabPanel, useEntityPageTab } from "./entityExport";
import type { EntityExportManifest } from "./api";

function useRecord<T>(path: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    setData(null); setError("");
    fetch(path, { signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error(response.status === 404 ? "This record is not available in the current dataset." : "The record could not be loaded. Please try again.");
      return response.json() as Promise<T>;
    }).then(setData).catch(error => { if (!controller.signal.aborted) setError(String(error.message)); });
    return () => controller.abort();
  }, [path]);
  return { data, error };
}

interface PlaceRecord {
  id: string; mdvsId?: string; title: string; kind: string; description: string; releaseVersion: string;
  canonicalUri?: string;
  organCount: number; organs: Array<{ id: string; title: string; url: string; scope: string; source: string }>;
  coordinate?: { latitude: number; longitude: number; precision: string; source: string; confidence?: number };
  sources: Array<{ id: string; label: string; url: string }>;
  names?: Array<{ name: string; kind?: string; language?: string; evidenceLayer?: string }>;
  sourceHierarchy?: Array<{ role: string; value: string; language?: string; evidenceLayer?: string }>;
  providerHierarchy?: Array<{ role: string; value: string; language?: string; evidenceLayer?: string }>;
  providerReferences?: Array<{ provider?: string; identifier: string; providerRelease?: string; matchKind: string; externalUrl?: string; identityRelation: string; sameAs: boolean }>;
  coordinateEvidence?: { method?: string; observations?: Array<{ url: string }> };
  administrativeNodes?: Array<{ nodeId: string; preferredName: string; role: string; providerIdentifier?: string; sourceUrl?: string }>;
  enrichmentOutcome?: string;
  export?: EntityExportManifest;
}

function Hierarchy({ title, items }: { title: string; items?: PlaceRecord["sourceHierarchy"] }) {
  if (!items?.length) return null;
  return <section className="place-hierarchy"><h3>{title}</h3><ol>{items.map((item, index) => <li key={`${item.role}:${item.value}:${index}`}><span>{item.role.replace(/_/g, " ")}</span><strong>{item.value}</strong>{item.language && <small>{item.language}</small>}</li>)}</ol></section>;
}

export function PublicPlacePage({ id }: { id: string }) {
  const { data: place, error } = useRecord<PlaceRecord>(`/api/places/${encodeURIComponent(id)}`);
  const { activeTab, selectTab } = useEntityPageTab(place ? Boolean(place.export) : undefined, id);
  useEffect(() => { if (place) document.title = `${place.title} · Place | MODAVIS Navigator`; }, [place]);
  if (error) return <p className="notice" role="alert">{error}</p>;
  if (!place) return <p role="status">Loading place…</p>;
  const sources = [...new Map(place.sources.map(source => [source.id, source])).values()];
  const venueCoordinates = ["venue", "exact_venue", "building", "exact"].includes(place.coordinate?.precision?.toLowerCase() || "");
  const placeKind = place.kind.startsWith("source_scoped_")
    ? `Source-scoped ${place.kind.slice("source_scoped_".length).replace(/_/g, " ")}`
    : place.kind.replace(/_/g, " ");
  const tabScope = `place-${place.mdvsId || place.id}`;
  return <article className="public-record-page place-record-page"><header className="public-record-header"><p className="eyebrow">{placeKind} · MODAVIS POD {place.releaseVersion}</p><h1><MapPin size={26} /> {place.title}</h1>{place.mdvsId && <IdentifierCopy id={place.mdvsId} url={place.canonicalUri} />}<p>{place.description}</p></header>
    <EntityPageTabs scope={tabScope} label={place.title} activeTab={activeTab} exportAvailable={Boolean(place.export)} onChange={selectTab} />
    <EntityTabPanel scope={tabScope} tab="overview" activeTab={activeTab} className="public-record-overview">
      {(place.sourceHierarchy?.length || place.providerHierarchy?.length) && <section className="panel-block"><h2>Administrative context</h2><p className="muted">Source wording and geocoding observations are shown separately. Provider identifiers document a match and do not replace the MODAVIS identity.</p><div className="place-hierarchy-grid"><Hierarchy title="As stated by sources" items={place.sourceHierarchy} /><Hierarchy title="Geocoding result" items={place.providerHierarchy} /></div></section>}
      {place.names && place.names.length > 1 && <section className="panel-block"><h2>Documented names</h2><div className="place-name-list">{place.names.map((item, index) => <div key={`${item.name}:${index}`}><strong>{item.name}</strong><span>{[item.kind?.replace(/_/g, " "), item.language, item.evidenceLayer?.replace(/_/g, " ")].filter(Boolean).join(" · ")}</span></div>)}</div></section>}
      <section className="panel-block"><h2>{place.organCount === 1 ? "Organ at this location" : `${place.organCount.toLocaleString()} organs at this location`}</h2><div className="public-record-list">{place.organs.map(organ => <a key={organ.id} href={organ.url}><strong>{organ.title}</strong><span>{organ.scope === "current" ? "Current location" : "Historical location"} · {organ.source}</span></a>)}</div>{place.organCount > place.organs.length && <p>Showing the first {place.organs.length} organs.</p>}</section>
      {place.coordinate && <section className="panel-block"><h2>Location on the map</h2><p>{place.coordinate.latitude.toFixed(5)}, {place.coordinate.longitude.toFixed(5)} · {place.coordinate.precision.replace(/_/g, " ")} precision</p><p className="muted">{place.coordinateEvidence?.method === "centroid_of_verified_church_footprint" ? "Map point derived from the documented church footprint; it does not locate the organ within the building." : place.coordinate?.precision === "source_grid_cell" ? "Source grid-cell coordinates; precision is limited by the source grid." : venueCoordinates ? "Coordinates are recorded at venue level." : "These coordinates locate the surrounding area; they do not establish the exact building position."}</p><a href={`https://www.openstreetmap.org/?mlat=${place.coordinate.latitude}&mlon=${place.coordinate.longitude}#map=${venueCoordinates ? 17 : 12}/${place.coordinate.latitude}/${place.coordinate.longitude}`} target="_blank" rel="noreferrer">View on OpenStreetMap <ExternalLink size={14} /></a></section>}
      {place.coordinateEvidence?.method === "withheld_nonvenue_feature" && <section className="panel-block"><h2>Coordinate evidence</h2><p>The previous point identifies a non-venue feature; no verified venue point is currently shown.</p></section>}
      {place.administrativeNodes?.length ? <section className="panel-block"><h2>Documented administrative entities</h2><ol>{place.administrativeNodes.map(item => <li key={item.nodeId}>{item.role}: <strong>{item.preferredName}</strong>{item.providerIdentifier && ` · ${item.providerIdentifier}`} {item.sourceUrl && <a href={item.sourceUrl} target="_blank" rel="noreferrer">Source</a>}</li>)}</ol></section> : null}
      {place.providerReferences?.length ? <section className="panel-block"><h2>Geographic provider references</h2><div className="provider-reference-list">{place.providerReferences.map(item => <div key={item.identifier}><div><strong>{item.provider || "Geographic provider"}</strong><code>{item.identifier}</code></div><span>{item.matchKind.replace(/_/g, " ")}{item.providerRelease ? ` · ${item.providerRelease}` : ""}</span>{item.externalUrl && <a href={item.externalUrl} target="_blank" rel="noreferrer">Open provider record <ExternalLink size={14} /></a>}</div>)}</div></section> : null}
      <section className="panel-block"><h2>Sources</h2><div className="public-record-list">{sources.map(source => <a key={source.id} href={source.url}>{source.label}<span>View supporting record</span></a>)}</div></section>
    </EntityTabPanel>
    <EntityTabPanel scope={tabScope} tab="export" activeTab={activeTab}><EntityExportPanel manifest={place.export} /></EntityTabPanel>
  </article>;
}

interface SourceRecord {
  id: string; title: string; sourceIdentifier: string; sourceUrl?: string; releaseVersion: string;
  organ: { id: string; title: string; url: string }; counts: { events: number; components: number; facts: number };
  structuredJsonUrl?: string;
}
export function PublicSourcePage({ id }: { id: string }) {
  const { data: source, error } = useRecord<SourceRecord>(`/api/public/sources/${encodeURIComponent(id)}`);
  useEffect(() => { if (source) document.title = `${source.title} · Source record | MODAVIS Navigator`; }, [source]);
  if (error) return <p className="notice" role="alert">{error}</p>;
  if (!source) return <p role="status">Loading source record…</p>;
  return <article className="public-record-page"><header className="public-record-header"><p className="eyebrow">Source record · MODAVIS POD {source.releaseVersion}</p><h1>{source.title}</h1><p>Record {source.sourceIdentifier}</p></header>
    <section className="panel-block"><h2>Documented organ</h2><a href={source.organ.url}>{source.organ.title}</a><div className="public-source-statistics"><a href={`${source.organ.url}?tab=history`}><strong>{source.counts.events.toLocaleString()}</strong> activities</a><a href={`${source.organ.url}?tab=specification`}><strong>{source.counts.components.toLocaleString()}</strong> main specification entries</a><a href={`${source.organ.url}?tab=specification`}><strong>{source.counts.facts.toLocaleString()}</strong> technical facts</a></div></section>
    <section className="panel-block"><h2>Original source</h2><p>The linked source provides the original description and its context. Navigator retains separately attributed facts from this record.</p><div className="public-source-actions">{source.sourceUrl && <a className="public-action-link" href={source.sourceUrl} target="_blank" rel="noreferrer">Open original source <ExternalLink size={16} /></a>}{source.structuredJsonUrl && <a className="public-action-link" href={source.structuredJsonUrl}>Structured JSON <Braces size={16} /></a>}</div><p className="muted">Source identifier: <code>{source.id}</code></p></section>
  </article>;
}
