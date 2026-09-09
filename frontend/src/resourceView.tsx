import { Braces, Check, Copy, ExternalLink, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

interface ResourceValue { kind: string; text: string; uri?: string; url?: string; language?: string; datatype?: string }
interface ResourceDescription {
  uri: string; label: string; releaseVersion: string; profile: string; documentUri: string;
  types: Array<{ uri: string; label: string }>;
  owner?: { uri: string; label: string; identifier: string; kind: string; url: string } | null;
  identifiers: string[];
  properties: Array<{ uri: string; label: string; values: ResourceValue[] }>;
  sources: Array<ResourceValue & { identifiers: string[]; originalUrls: string[] }>;
  related: ResourceValue[]; relatedCount: number; members: ResourceValue[]; memberCount: number;
  representations: Array<{ label: string; url: string; mediaType: string }>;
}

function selectedResource(standalone: boolean): string {
  const query = new URLSearchParams(window.location.search);
  const uri = query.get(standalone ? "uri" : "resource") || "";
  // Browsers preserve a fragment across a 303 when Location has no fragment.
  return uri && !uri.includes("#") && window.location.hash ? uri + window.location.hash : uri;
}

function ResourceValueLink({ value }: { value: ResourceValue }) {
  const safe = value.url && /^(https?:\/\/|\/(?!\/))/.test(value.url);
  return <span className="resource-value">{safe ? <a href={value.url} title={value.uri}>{value.text}</a> : <span>{value.text}</span>}{value.language && <small lang="en"> [{value.language}]</small>}</span>;
}

const keyProperties = new Set(["Value", "Source wording", "Describes", "Property", "Location in source", "Source fragment", "Supported statement"]);

export function ResourceView({ owner, standalone = false }: { owner?: string; standalone?: boolean }) {
  const [uri, setUri] = useState(() => selectedResource(standalone));
  const [result, setResult] = useState<{ uri: string; data?: ResourceDescription; error?: string } | null>(null);
  const [copyStatus, setCopyStatus] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const update = () => setUri(selectedResource(standalone));
    update();
    window.addEventListener("popstate", update);
    window.addEventListener("hashchange", update);
    return () => { window.removeEventListener("popstate", update); window.removeEventListener("hashchange", update); };
  }, [owner, standalone]);
  useEffect(() => {
    if (!uri) return;
    const controller = new AbortController();
    setResult(null); setCopyStatus("");
    const query = new URLSearchParams({ uri, ...(owner ? { owner } : {}) });
    fetch(`/api/public/resources?${query}`, { signal: controller.signal, headers: { Accept: "application/json" } })
      .then(async response => {
        if (!response.ok) throw new Error(response.status === 404 || response.status === 400
          ? "This resource is not available for this entity and dataset version. Check the identifier or return to the entity exports."
          : "The resource could not be loaded. Please try again.");
        return response.json() as Promise<ResourceDescription>;
      }).then(data => { if (!controller.signal.aborted) setResult({ uri, data }); })
      .catch(error => { if (!controller.signal.aborted) setResult({ uri, error: String(error.message) }); });
    return () => controller.abort();
  }, [uri, owner]);
  const data = result?.uri === uri ? result.data : undefined;
  const error = result?.uri === uri ? result.error : undefined;
  useEffect(() => {
    if (data) {
      heading.current?.focus({ preventScroll: true });
      if (standalone) document.title = `${data.label} · Resource | MODAVIS Navigator`;
    }
  }, [data, standalone]);
  function dismiss() {
    const url = new URL(window.location.href);
    url.searchParams.delete("resource"); url.hash = "";
    window.history.pushState(null, "", `${url.pathname}${url.search}`);
    window.dispatchEvent(new PopStateEvent("popstate"));
    window.requestAnimationFrame(() => document.getElementById("entity-export-heading")?.focus());
  }
  async function copy() {
    try { await navigator.clipboard.writeText(data!.uri); setCopyStatus("Copied stable URI"); }
    catch { setCopyStatus("Copy unavailable. Select and copy the identifier below."); }
  }
  if (!uri) return standalone ? <p role="alert">Choose a dataset resource to view its description.</p> : null;
  if (error) return <section className="panel-block resource-inspector"><p role="alert">{error}</p>{!standalone && <button type="button" onClick={dismiss}>Return to entity exports</button>}</section>;
  if (!data) return <section className="panel-block resource-inspector" role="status">Loading resource description…</section>;
  const highlights = data.properties.filter(property => keyProperties.has(property.label));
  return <section className="panel-block resource-inspector" aria-labelledby="selected-resource-heading">
    <header className="resource-header">
      <div><p className="eyebrow">{data.types.map(type => type.label).join(" · ") || "Dataset resource"} · Release {data.releaseVersion}</p>
        <h2 id="selected-resource-heading" ref={heading} tabIndex={-1}>{data.label}</h2>
        <p className="resource-profile">{data.profile === "modavis" ? "MODAVIS Ontology Network" : data.profile.toUpperCase()} · Resource description</p></div>
      {!standalone && <button type="button" className="resource-close" onClick={dismiss} aria-label="Close resource description"><X size={20} /></button>}
    </header>
    {data.owner && <p className="resource-owner">Part of <a href={`${data.owner.url}?tab=export`}>{data.owner.label}</a><span>{data.owner.kind.replace(/_/g, " ")}</span></p>}
    <div className="resource-uri"><code>{data.uri}</code><button type="button" onClick={copy}>{copyStatus === "Copied stable URI" ? <Check size={16} /> : <Copy size={16} />} Copy stable URI</button></div>
    <span className="resource-copy-status" role="status">{copyStatus}</span>
    {highlights.length > 0 && <dl className="resource-facts">{highlights.map(property => <div key={property.uri}><dt>{property.label}</dt><dd>{property.values.map((value, i) => <ResourceValueLink key={i} value={value} />)}</dd></div>)}</dl>}
    {data.identifiers.length > 0 && <details className="resource-details"><summary>Source identifiers and keys</summary>{data.identifiers.map(id => <code className="resource-source-key" key={id}>{id}</code>)}</details>}
    {data.sources.length > 0 && <section className="resource-sources"><h3>Sources and provenance</h3>{data.sources.map(source => <div key={source.uri}><ResourceValueLink value={source} />{source.identifiers.map(id => <code key={id}>{id}</code>)}{source.originalUrls.map(url => <a key={url} href={url} target="_blank" rel="noreferrer">Open original source <ExternalLink size={14} /></a>)}</div>)}</section>}
    <section className="resource-downloads"><h3>Download the defining graph</h3><p>Each format contains this resource and its recorded context.</p><div className="resource-format-links">{data.representations.map(item => <a key={item.label} href={item.url} title={item.mediaType}><Braces size={16} />{item.label}</a>)}</div></section>
    {data.members.length > 0 && <details className="resource-details"><summary>Resources in this document ({data.memberCount})</summary><ul>{data.members.map(value => <li key={value.uri}><ResourceValueLink value={value} /></li>)}</ul>{data.memberCount > data.members.length && <p>Showing {data.members.length} resources. Download the graph for the full document.</p>}</details>}
    <details className="resource-details"><summary>All recorded properties ({data.properties.length})</summary><dl className="resource-facts">{data.properties.map(property => <div key={property.uri}><dt><a href={property.uri}>{property.label}</a></dt><dd>{property.values.map((value, i) => <span key={i}><ResourceValueLink value={value} />{value.datatype && <small className="resource-datatype">{value.datatype.split("#").pop()}</small>}</span>)}</dd></div>)}</dl></details>
    {data.related.length > 0 && <details className="resource-details"><summary>Referenced by ({data.relatedCount})</summary><ul>{data.related.map(value => <li key={value.uri}><ResourceValueLink value={value} /></li>)}</ul>{data.relatedCount > data.related.length && <p>Showing {data.related.length} references. The defining graph contains the full context.</p>}</details>}
  </section>;
}

export function ResourcePage() {
  return <article className="public-record-page resource-page"><h1>Dataset resource</h1><ResourceView standalone /></article>;
}
