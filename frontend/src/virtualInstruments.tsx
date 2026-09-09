import { IdentifierCopy } from "./publicExperience";
import { EntityExportPanel, EntityPageTabs, EntityTabPanel, useEntityPageTab } from "./entityExport";
import type { EntityExportManifest } from "./api";
import { FormEvent, MouseEvent as ReactMouseEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Database,
  ExternalLink,
  FileAudio,
  Filter,
  GitBranch,
  HardDrive,
  Layers3,
  Link2,
  MapPin,
  Search,
  ShieldCheck,
} from "lucide-react";
import "./virtualInstruments.css";
import { codeLabel, safeExternalUrl, virtualEntityScopeLabel } from "./reviewerPresentation";

type FacetItem = Record<string, string | number> & { count: number };

type InvestigationLink = {
  kind: "modavis_entity" | "source_record" | string;
  label: string;
  url: string;
  sourceKey?: string;
  nativeIdentifier?: string;
};

type LinkTarget = {
  mdvsId?: string;
  title?: string;
  canonicalUrl?: string;
  score?: number;
  routeId?: string;
  label?: string;
  pageUrl?: string;
  canonicalStatus?: string;
  canonicalTargetMdvsId?: string | null;
  coordinateState?: string;
  confidenceTier?: string;
  method?: string;
  reason?: string;
  siteIndex?: number;
  siteRole?: string | null;
  referencedEntityId?: string;
  corroboratedByEntityIds?: string[];
  investigationLinks?: InvestigationLink[];
  evidenceMethods?: string[];
  features?: Record<string, number>;
};

type VirtualInstrumentSummary = {
  id: string;
  canonicalUrl?: string;
  identifierUri?: string;
  title: string;
  sampledInstrumentName?: string | null;
  producer?: string | null;
  kind: {
    catalogEntityType?: string | null;
    recordingBasis?: string | null;
    granularity?: string | null;
    componentOrVariantType?: string | null;
    distributionUnit?: string | null;
    independentlyDistributed?: string | null;
  };
  availability: {
    catalogStatus?: string | null;
    accessModel?: string | null;
    accessCategory?: string | null;
    licenseClass?: string | null;
    licenseCategory?: string | null;
    listedPrice?: string | null;
    currency?: string | null;
  };
  platforms: {
    native?: string | null;
    all: string[];
  };
  physicalInstrument: {
    name?: string | null;
    builder?: string | null;
    constructionYear?: string | null;
    rebuildOrRevisionYears?: string | null;
    style?: string | null;
    manuals?: string | null;
    pedal?: string | null;
    stopsOrRanks?: string | null;
    location: {
      type?: string | null;
      venue?: string | null;
      locality?: string | null;
      admin1?: string | null;
      country?: string | null;
      countryCode?: string | null;
      precision?: string | null;
      originalText?: string | null;
      basis?: string | null;
      sites?: Array<{
        entity_id?: string | null;
        venue?: string | null;
        locality?: string | null;
        admin1?: string | null;
        country?: string | null;
        country_code?: string | null;
        precision?: string | null;
      }>;
    };
  };
  localAvailability: {
    state: string;
    status?: string | null;
    integrityVerified?: boolean;
    fileCount?: number | null;
    wavFileCount?: number | null;
    byteSize?: number | null;
    archiveRemovedAfterExtraction?: boolean;
    distinctInstrumentRepresentative?: boolean;
  };
  canonical?: {
    state: "canonical_vmi" | "source_evidence_fragment_only" | string;
    coreEntityMdvsId?: string;
    instrumentMdvsId?: string;
    versionCoreEntityMdvsId?: string;
    versionMdvsId?: string;
    packageCoreEntityMdvsId?: string;
    packageMdvsId?: string;
    sourceFragmentMdvsId?: string;
    externalIdentifier?: string;
    packageTypeCode?: string | null;
    packageFormatCode?: string | null;
    accessModelCode?: string | null;
    availabilityCode?: string | null;
  };
  relationships: {
    parentId?: string | null;
    parentIds?: string[];
    childIds?: string[];
    recordingLocationInheritedFromId?: string | null;
    recordingPlace?: ({ id: string; pageUrl: string } & VirtualInstrumentSummary["physicalInstrument"]["location"]) | null;
    organDecision: { outcome: string; reason: string; confidenceTier?: string; method?: string; score?: number | null; margin?: number | null; target?: LinkTarget | null; targets?: LinkTarget[]; alternatives?: LinkTarget[]; alternativeCount?: number; siteDecisionCount?: number; siteDecisions?: Array<{ outcome?: string; reason?: string; confidenceTier?: string; method?: string; score?: number | null; margin?: number | null; target?: LinkTarget | null; targets?: LinkTarget[]; alternatives?: LinkTarget[]; location?: VirtualInstrumentSummary["physicalInstrument"]["location"] }> };
    placeDecision: { outcome: string; reason: string; target?: LinkTarget; alternatives?: LinkTarget[] };
    canonicalOrganRelations?: Array<{
      targetOrganMdvsId?: string | null;
      targetOrganTitle?: string | null;
      targetManifestationMdvsId?: string | null;
      representedOrganLabel?: string | null;
      relationTypeCode?: string;
      relationTypeName?: string;
      confidence?: number | null;
      sourceFragmentMdvsId?: string;
      resolutionState?: string;
      rowSha256?: string;
    }>;
    linkState: string;
  };
  evidence: {
    sourceKey?: string;
    sourceUrls?: string[];
    sourceUrl?: string | null;
    secondarySourceUrl?: string | null;
    evidenceLocator?: string | null;
    confidence?: string | null;
    researchDate?: string | null;
    rowSha256?: string;
  };
  technical?: Record<string, string | null>;
};

type VirtualInstrumentDetail = VirtualInstrumentSummary & {
  entityType: string;
  notes?: string | null;
  parent?: VirtualInstrumentSummary | null;
  parents?: VirtualInstrumentSummary[];
  children?: VirtualInstrumentSummary[];
  relatedEditions?: VirtualInstrumentSummary[];
  familyEdges?: Array<{ type: string; sourceId: string; targetId: string; inheritedRecordingContext?: boolean }>;
  canonicalUrl: string;
  apiUrl: string;
  releaseBoundary?: Record<string, unknown>;
  matchingPolicy?: Record<string, unknown>;
  source?: { label?: string; catalogResearchDate?: string; key?: string };
  export?: EntityExportManifest | null;
};

type CatalogResponse = {
  items: VirtualInstrumentSummary[];
  total: number;
  limit: number;
  offset: number;
  counts: Record<string, number>;
  reviewQueues: Array<{ key: string; label: string; description: string; count: number; href: string }>;
  matchingPolicy?: Record<string, unknown>;
  matchingEvaluation?: Record<string, unknown>;
  releaseBoundary?: Record<string, unknown>;
  facets: {
    producers: FacetItem[];
    platforms: FacetItem[];
    accessCategories: FacetItem[];
    licenseCategories: FacetItem[];
    availabilityStatuses: FacetItem[];
    downloadStates: FacetItem[];
    countries: FacetItem[];
    linkStates: FacetItem[];
    organOutcomes: FacetItem[];
    confidenceTiers: FacetItem[];
    matchMethods: FacetItem[];
    granularities: FacetItem[];
    distributionStates: FacetItem[];
    sortOptions: Array<{ value: string; label: string }>;
  };
};

type CatalogFilters = {
  q: string;
  producer: string;
  platform: string;
  access: string;
  license_class: string;
  availability: string;
  downloaded: string;
  country: string;
  link_state: string;
  organ_link: string;
  organ_outcome: string;
  confidence_tier: string;
  match_method: string;
  granularity: string;
  independently_distributed: string;
  place: string;
  sort: string;
  offset: number;
};

const PAGE_SIZE = 12;

// Keep public filters aligned with the public catalogue API; investigation-only
// fields from older shared URLs must not be sent to the public projection.
const PUBLIC_CATALOG_FILTERS = new Set<keyof CatalogFilters>([
  "q", "producer", "platform", "access", "license_class", "availability",
  "country", "granularity", "independently_distributed", "link_state", "organ_link",
]);

function routeInstrumentId(): string {
  const match = window.location.pathname.match(/^\/virtual-instruments\/([^/]+)\/?$/);
  if (!match) return "";
  try { return decodeURIComponent(match[1]); }
  catch { return match[1]; }
}

function filtersFromLocation(): CatalogFilters {
  const params = new URLSearchParams(window.location.search);
  return {
    q: params.get("q") || "",
    producer: params.get("producer") || "",
    platform: params.get("platform") || "",
    access: params.get("access") || "",
    license_class: params.get("license_class") || "",
    availability: params.get("availability") || "",
    downloaded: params.get("downloaded") || "",
    country: params.get("country") || "",
    link_state: params.get("link_state") || "",
    organ_link: params.get("organ_link") || "",
    organ_outcome: params.get("organ_outcome") || "",
    confidence_tier: params.get("confidence_tier") || "",
    match_method: params.get("match_method") || "",
    granularity: params.get("granularity") || "",
    independently_distributed: params.get("independently_distributed") === "all" ? "" : params.get("independently_distributed") || "yes",
    place: params.get("place") || "",
    sort: params.get("sort") || "title",
    offset: Math.max(0, Number.parseInt(params.get("offset") || "0", 10) || 0),
  };
}

async function readJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { credentials: "same-origin", headers: { Accept: "application/json" } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(String(payload.detail || payload.error || `Request failed (${response.status})`));
  return payload as T;
}

function formatLabel(value?: string | null): string {
  return codeLabel(value);
}

function formatInteger(value?: number | null): string {
  return new Intl.NumberFormat("en").format(value || 0);
}

function formatBytes(value?: number | null): string {
  if (!value) return "Not recorded";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let current = value;
  let index = 0;
  while (current >= 1024 && index < units.length - 1) { current /= 1024; index += 1; }
  return `${current >= 10 || index === 0 ? current.toFixed(0) : current.toFixed(1)} ${units[index]}`;
}

function locationLabel(item: VirtualInstrumentSummary): string {
  const location = item.physicalInstrument.location;
  return [location.venue, location.locality, location.admin1, location.country].filter(Boolean).join(", ") || "Recording place not disclosed";
}

function instrumentHref(id: string): string {
  return `/virtual-instruments/${encodeURIComponent(id)}`;
}

function openInstrumentLink(event: ReactMouseEvent<HTMLAnchorElement>, id: string, onOpen: (id: string) => void) {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  onOpen(id);
}

function sourceLinkLabel(url: string, index: number): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    return `Open source · ${host}`;
  } catch {
    return `Open source ${index + 1}`;
  }
}

function decisionReason(value?: string | null): string {
  const reasons: Record<string, string> = {
    unique_locality_builder_chronology_and_specification_profile: "A unique candidate remains after country, locality, builder, chronology, manuals and stops are corroborated.",
    parallel_source_records_share_strict_physical_profile: "Multiple distinct MODAVIS source records fit the same physical profile. They remain probable suggestions because no canonical merge is asserted.",
    insufficient_unique_margin: "The leading candidate does not clear the required score and uniqueness boundary.",
    candidate_below_probable_threshold: "The leading candidate remains below the probable-link score threshold.",
    one_or_more_recording_sites_ambiguous: "At least one recording-site decision remains unresolved, so no organ relation is promoted.",
    explicit_catalog_component_references_resolved: "Explicit catalog component references connect this composite to multiple independently documented source instruments.",
    no_specific_physical_recording_site: "This entity does not document one physical recording site, so an organ identity relation is not applicable.",
    linked_canonical_organ_place_relation: "The place is inherited from the linked MODAVIS organ relation.",
    unique_exact_place_wording: "The retained place wording has one exact source-backed place match.",
    no_exact_release_1_4_place_wording: "The source location remains available, but no exact Release 1.4 place identity was asserted.",
    no_structured_physical_location: "No structured physical location is present in the source evidence.",
  };
  return reasons[String(value || "")] || formatLabel(value);
}

function decisionEvidence(decision: VirtualInstrumentSummary["relationships"]["organDecision"]) {
  const site = decision.siteDecisions?.[0];
  const candidate = decision.targets?.[0] || decision.alternatives?.[0] || site?.targets?.[0] || site?.alternatives?.[0];
  return {
    method: decision.method || site?.method || candidate?.method || candidate?.evidenceMethods?.join(" + "),
    score: decision.score ?? site?.score ?? candidate?.score,
    margin: decision.margin ?? site?.margin,
    reason: site?.reason || decision.reason,
  };
}

function policyNumber(policy: Record<string, unknown> | undefined, key: string): number | null {
  const value = policy?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function formatPercent(value?: number | null): string {
  return value == null ? "Not scored" : `${Math.round(value * 100)}%`;
}

const FEATURE_LABELS: Record<string, string> = {
  venue: "Venue",
  locality: "Locality",
  country: "Country",
  builder: "Builder",
  year: "Chronology",
  manuals: "Manuals",
  stops: "Stops / ranks",
  name: "Instrument name",
};

function updateCatalogRoute(filters: CatalogFilters, replace = false) {
  const url = new URL("/virtual-instruments", window.location.origin);
  Object.entries(filters).forEach(([key, value]) => {
    if (key === "independently_distributed" && value === "") {
      url.searchParams.set(key, "all");
      return;
    }
    if (value !== "" && value !== 0 && !(key === "sort" && value === "title")) url.searchParams.set(key, String(value));
  });
  window.history[replace ? "replaceState" : "pushState"](null, "", `${url.pathname}${url.search}`);
}

function FacetSelect({ label, name, value, items, itemKey, onChange }: {
  label: string;
  name: keyof CatalogFilters;
  value: string;
  items: FacetItem[];
  itemKey: string;
  onChange: (name: keyof CatalogFilters, value: string) => void;
}) {
  return (
    <label>
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(name, event.target.value)}>
        <option value="">All</option>
        {(items ?? []).map((item) => {
          const itemValue = String(item[itemKey] || "");
          return <option value={itemValue} key={`${name}:${itemValue}`}>{formatLabel(itemValue)} ({formatInteger(item.count)})</option>;
        })}
      </select>
    </label>
  );
}

function LinkState({ item }: { item: VirtualInstrumentSummary }) {
  const canonicalRelations = item.relationships.canonicalOrganRelations;
  if (item.canonical?.state === "canonical_vmi" && canonicalRelations) {
    const linked = canonicalRelations.filter((relation) => Boolean(relation.targetOrganMdvsId));
    if (linked.length > 0) return <span className="vpi-link-state linked"><ShieldCheck size={13} /> Canonical VMI · {linked.length} organ relation{linked.length === 1 ? "" : "s"}</span>;
    return <span className="vpi-link-state source"><ShieldCheck size={13} /> Canonical VMI · represented organ unresolved</span>;
  }
  if (item.canonical?.state === "source_evidence_fragment_only") return <span className="vpi-link-state source"><Database size={13} /> Exact component evidence</span>;
  const decision = item.relationships.organDecision;
  const organTargets = decision.targets ?? (decision.target ? [decision.target] : []);
  const organ = organTargets[0];
  const place = item.relationships.placeDecision.target;
  if (organ && decision.confidenceTier === "verified_exact") return <span className="vpi-link-state linked"><ShieldCheck size={13} /> Exact MODAVIS link{organTargets.length > 1 ? `s (${organTargets.length})` : ` · ${organ.title || "organ"}`}</span>;
  if (organ && decision.confidenceTier === "high_confidence") return <span className="vpi-link-state linked"><Link2 size={13} /> High-confidence link{organTargets.length > 1 ? `s (${organTargets.length})` : ` · ${organ.title || "organ"}`}</span>;
  if (organ) return <span className="vpi-link-state ambiguous"><GitBranch size={13} /> Probable organ candidate{organTargets.length > 1 ? `s (${organTargets.length})` : ` · ${organ.title || "organ"}`}</span>;
  if (place) return <span className="vpi-link-state placed"><MapPin size={13} /> Linked to {place.label || "documented place"}</span>;
  if (item.relationships.linkState === "ambiguous") return <span className="vpi-link-state ambiguous"><GitBranch size={13} /> Possible matches retained</span>;
  if (item.relationships.linkState === "no_physical_site") return <span className="vpi-link-state source"><MapPin size={13} /> No physical site documented</span>;
  return <span className="vpi-link-state source"><MapPin size={13} /> Source-backed location</span>;
}

function VirtualInstrumentCard({ item, onOpen, publicProjection = false }: { item: VirtualInstrumentSummary; onOpen: (id: string) => void; publicProjection?: boolean }) {
  const local = item.localAvailability.state === "locally_available";
  const integrityVerified = local && item.localAvailability.integrityVerified === true;
  return (
    <article className="vpi-card">
      <a className="vpi-card-main" href={item.canonicalUrl || instrumentHref(item.id)} onClick={(event) => openInstrumentLink(event, item.id, onOpen)}>
        <div className="vpi-card-title">
          <span>{item.id}</span>
          <h3>{item.title}</h3>
          {(!publicProjection || item.producer) && <p>{item.producer || "Producer not recorded"}</p>}
        </div>
        <div className="vpi-card-badges">
          <span className="scope">{publicProjection ? "Virtual instrument" : virtualEntityScopeLabel(item.kind.granularity)}</span>
          {(!publicProjection || item.availability.accessCategory) && <span>{formatLabel(item.availability.accessCategory)}</span>}
          {(!publicProjection || item.platforms.native) && <span>{item.platforms.native || "Platform varies"}</span>}
          {local && <span className="local"><HardDrive size={12} /> Local files</span>}
          {integrityVerified && <span className="verified"><ShieldCheck size={12} /> Integrity verified</span>}
        </div>
        {!publicProjection && <p className="vpi-card-location"><MapPin size={15} /> {locationLabel(item)}</p>}
        <dl>
          {(!publicProjection || item.sampledInstrumentName) && <div><dt>{publicProjection ? "Documented organ context" : "Physical instrument"}</dt><dd>{item.sampledInstrumentName || "Not stated"}</dd></div>}
          {(!publicProjection || item.physicalInstrument.builder) && <div><dt>Builder</dt><dd>{item.physicalInstrument.builder || "Not stated"}</dd></div>}
          {!publicProjection && <div><dt>Structure</dt><dd>{formatLabel(item.kind.granularity)}</dd></div>}
        </dl>
      </a>
      <footer>{publicProjection
        ? <span className="vpi-link-state">{item.relationships.organDecision.targets?.length ? `${item.relationships.organDecision.targets.length} related organ${item.relationships.organDecision.targets.length === 1 ? "" : "s"}` : "Source description"}</span>
        : <LinkState item={item} />}<a href={item.canonicalUrl || instrumentHref(item.id)} onClick={(event) => openInstrumentLink(event, item.id, onOpen)}>{publicProjection ? "Open record" : "Open entity"} <ChevronRight size={14} /></a></footer>
    </article>
  );
}

function Fact({ label, value }: { label: string; value?: string | number | null }) {
  if (value === null || value === undefined || value === "") return null;
  return <div><dt>{label}</dt><dd>{value}</dd></div>;
}

function PublicVirtualInstrumentDetail({ instrument, releaseVersion, onBack }: { instrument: VirtualInstrumentDetail; releaseVersion?: string; onBack: () => void }) {
  const relations = instrument.relationships.canonicalOrganRelations ?? [];
  const modeled = /modeled|modelled/i.test(instrument.kind.recordingBasis || "");
  const { activeTab, selectTab } = useEntityPageTab(Boolean(instrument.export), instrument.id);
  const tabScope = `virtual-instrument-${instrument.id}`;
  return (
    <article className="vpi-detail">
      <button type="button" className="vpi-back" onClick={onBack}><ArrowLeft size={16} /> Back to virtual instruments</button>
      <header className="vpi-detail-hero">
        <div><p className="eyebrow">Virtual instrument · POD {releaseVersion}</p><h2>{instrument.title}</h2><IdentifierCopy id={instrument.id} url={instrument.identifierUri} />{instrument.producer && <p>By <a href={`/virtual-instruments?producer=${encodeURIComponent(instrument.producer)}`}>{instrument.producer}</a></p>}<div className="vpi-badges">{instrument.platforms.all.map(platform => <a key={platform} href={`/virtual-instruments?platform=${encodeURIComponent(platform)}`}>{platform}</a>)}</div></div>
      </header>
      <EntityPageTabs scope={tabScope} label={instrument.title} activeTab={activeTab} exportAvailable={Boolean(instrument.export)} onChange={selectTab} />
      <EntityTabPanel scope={tabScope} tab="overview" activeTab={activeTab} className="vpi-detail-overview">
        <div className="vpi-detail-columns">
          <section className="vpi-detail-section"><h3>The virtual instrument</h3><dl className="vpi-facts">
            <Fact label="Instrument" value={instrument.sampledInstrumentName} /><Fact label="Recording basis" value={instrument.kind.recordingBasis} /><Fact label="Edition / variant" value={instrument.technical?.editionOrVariant} /><Fact label="Software" value={instrument.platforms.all.join(", ")} /><Fact label="Distribution" value={instrument.kind.distributionUnit} />
            <Fact label="Audio included" value={instrument.technical?.audioIncluded} /><Fact label="Sample resolution" value={instrument.technical?.sampleFormatResolution} /><Fact label="Perspectives / channels" value={instrument.technical?.perspectivesOrChannels} /><Fact label="Wet / dry" value={instrument.technical?.wetDry} /><Fact label="Size / memory" value={instrument.technical?.sizeOrMemory} />
          </dl></section>
          <section className="vpi-detail-section"><h3>Access and licence</h3><dl className="vpi-facts"><Fact label="Access" value={instrument.availability.accessModel} /><Fact label="Licence" value={instrument.availability.licenseClass} /><Fact label="Catalogue status" value={instrument.availability.catalogStatus} /><Fact label="Listed price" value={[instrument.availability.listedPrice, instrument.availability.currency].filter(Boolean).join(" ")} /><Fact label="Recorded on" value={instrument.evidence.researchDate} /></dl><div className="vpi-source-links">{(instrument.evidence.sourceUrls || []).map((url, index) => <a key={url} href={url} target="_blank" rel="noreferrer">{index === 0 ? "Open publisher / source" : "Additional source"} <ExternalLink size={14} /></a>)}</div></section>
        </div>
        {instrument.notes && <p className="vpi-detail-note">{instrument.notes}</p>}
        {(instrument.physicalInstrument.builder || instrument.physicalInstrument.constructionYear || instrument.physicalInstrument.stopsOrRanks || instrument.physicalInstrument.location.locality) && <section className="vpi-detail-section"><h3>{modeled ? "Documented model or inspiration" : "The physical instrument"}</h3><dl className="vpi-facts"><Fact label="Builder" value={instrument.physicalInstrument.builder} /><Fact label="Construction" value={instrument.physicalInstrument.constructionYear} /><Fact label="Rebuilds / revisions" value={instrument.physicalInstrument.rebuildOrRevisionYears} /><Fact label="Manuals" value={instrument.physicalInstrument.manuals} /><Fact label="Stops / ranks" value={instrument.physicalInstrument.stopsOrRanks} /><Fact label="Place" value={locationLabel(instrument)} /></dl></section>}
        {relations.length > 0 && <section className="vpi-detail-section"><h3>{modeled ? "Modelled organ relationships" : "Related organs"}</h3><div className="vpi-resolution-grid">{relations.map((relation, index) => {
          const linked = relation.targetOrganMdvsId && relation.resolutionState === "accepted_canonical_organ_relation";
          const url = linked ? `/organs/${encodeURIComponent(relation.targetOrganMdvsId!.replace("MDVS:ENTY:", ""))}` : "";
          return <article key={`${relation.targetOrganMdvsId || "source"}:${index}`}><span>{linked ? "Linked organ" : "Source description"}</span><strong>{url ? <a href={url}>{relation.targetOrganTitle || relation.representedOrganLabel}</a> : relation.representedOrganLabel}</strong>{relation.relationTypeName && <p>{relation.relationTypeName}</p>}{!linked && <p>No confirmed link to a specific organ record is available.</p>}</article>;
        })}</div></section>}
        <details className="vpi-detail-section"><summary>Identifiers and dataset</summary><dl className="vpi-facts"><div><dt>Instrument identifier</dt><dd><IdentifierCopy id={instrument.id} url={instrument.identifierUri} /></dd></div><Fact label="Source catalogue identifier" value={instrument.canonical?.externalIdentifier} />{instrument.canonical?.versionMdvsId && <div><dt>Version identifier</dt><dd><IdentifierCopy id={instrument.canonical.versionMdvsId} /></dd></div>}{instrument.canonical?.packageMdvsId && <div><dt>Package identifier</dt><dd><IdentifierCopy id={instrument.canonical.packageMdvsId} /></dd></div>}<div><dt>Collection</dt><dd><a href="/about/release">MODAVIS Pipe Organ Dataset {releaseVersion}</a></dd></div><Fact label="Research date" value={instrument.evidence.researchDate} /></dl><p>Instrument files are distributed by their publishers; this collection describes the instruments and their documented relationships.</p></details>
      </EntityTabPanel>
      <EntityTabPanel scope={tabScope} tab="export" activeTab={activeTab}><EntityExportPanel manifest={instrument.export} /></EntityTabPanel>
    </article>
  );
}

function InvestigationLinks({ target }: { target: LinkTarget }) {
  const links = target.investigationLinks ?? [];
  if (links.length === 0 && !target.canonicalUrl) return null;
  return <div className="vpi-investigation-links">
    {links.length > 0 ? links.map((link) => {
      const external = link.kind !== "modavis_entity";
      const href = external ? safeExternalUrl(link.url) : link.url.startsWith("/id/") ? link.url : null;
      if (!href) return null;
      return <a href={href} target={external ? "_blank" : undefined} rel={external ? "noreferrer" : undefined} key={`${link.kind}:${link.url}`}>{link.label} <ExternalLink size={12} /></a>;
    }) : <a href={target.canonicalUrl}>MODAVIS organ entity <ExternalLink size={12} /></a>}
  </div>;
}

function FeatureEvidence({ target }: { target: LinkTarget }) {
  const entries = Object.entries(target.features ?? {}).filter(([, value]) => typeof value === "number");
  if (entries.length === 0) return null;
  return (
    <dl className="vpi-feature-evidence" aria-label={`Match signals for ${target.title || target.mdvsId || "candidate"}`}>
      {entries.map(([key, value]) => <div key={key}><dt>{FEATURE_LABELS[key] || formatLabel(key)}</dt><dd>{formatPercent(value)}</dd></div>)}
    </dl>
  );
}

function RelationshipGraph({ instrument, onOpen }: { instrument: VirtualInstrumentDetail; onOpen: (id: string) => void }) {
  const parents = instrument.parents ?? (instrument.parent ? [instrument.parent] : []);
  const location = instrument.physicalInstrument.location;
  const basis = String(instrument.kind.recordingBasis || "").toLowerCase();
  const modeled = basis.includes("modeled") || String(location.basis || "").includes("modeled_style");
  const composite = parents.length > 1 || location.type === "multiple_sites";
  const subordinate = parents.length === 1 && instrument.kind.independentlyDistributed !== "yes";

  if (composite) {
    const sites = location.sites ?? [];
    return (
      <div className="vpi-relationship-branching" aria-label="Composite virtual instrument relationship graph">
        <article className="vpi-graph-origin"><Layers3 size={20} /><small>Composite virtual instrument</small><strong>{instrument.title}</strong><span>{instrument.id}</span></article>
        <div className="vpi-graph-edge">combines source instruments</div>
        <div className="vpi-graph-branches">
          {parents.map((parent, index) => {
            const site = sites.find((item) => item.entity_id === parent.id) ?? sites[index];
            const siteLabel = site ? [site.venue, site.locality, site.country].filter(Boolean).join(", ") : locationLabel(parent);
            return <a href={parent.canonicalUrl || instrumentHref(parent.id)} onClick={(event) => openInstrumentLink(event, parent.id, onOpen)} key={parent.id}><FileAudio size={18} /><small>Source instrument · {parent.id}</small><strong>{parent.title}</strong><span>{siteLabel || "Location retained on source entity"}</span></a>;
          })}
        </div>
        <p>Each branch is a documented source instrument. Its place and organ decisions remain separate; this composite does not invent one shared recording site.</p>
      </div>
    );
  }

  if (subordinate) {
    const parent = parents[0];
    return (
      <div className="vpi-relationship-flow" aria-label="Component to package relationship graph">
        <article><Layers3 size={20} /><small>{virtualEntityScopeLabel(instrument.kind.granularity)}</small><strong>{instrument.title}</strong><span>{instrument.id}</span></article>
        <i aria-hidden="true">component of</i>
        <a href={parent.canonicalUrl || instrumentHref(parent.id)} onClick={(event) => openInstrumentLink(event, parent.id, onOpen)}><GitBranch size={20} /><small>Parent package</small><strong>{parent.title}</strong><span>{parent.id}</span></a>
        <i aria-hidden="true">inherits context</i>
        <article><MapPin size={20} /><small>Recording context</small><strong>{locationLabel(instrument)}</strong><span>Inherited—not an additional recording</span></article>
      </div>
    );
  }

  if (modeled) {
    return (
      <div className="vpi-relationship-flow" aria-label="Modeled virtual instrument relationship graph">
        <article><Layers3 size={20} /><small>Virtual instrument</small><strong>{instrument.title}</strong><span>{instrument.id}</span></article>
        <i aria-hidden="true">modeled after</i>
        <article><FileAudio size={20} /><small>Composition or stylistic basis</small><strong>{instrument.sampledInstrumentName || "Source-described organ model"}</strong><span>{instrument.physicalInstrument.style || instrument.physicalInstrument.builder || "No single physical recording site"}</span></article>
        <i aria-hidden="true">associated with</i>
        <article><MapPin size={20} /><small>Geographic / style evidence</small><strong>{locationLabel(instrument)}</strong><span>{location.precision || "Source wording"}</span></article>
      </div>
    );
  }

  return (
    <div className="vpi-relationship-flow" aria-label="Recorded virtual instrument relationship graph">
      <article><Layers3 size={20} /><small>Virtual instrument</small><strong>{instrument.title}</strong><span>{instrument.id}</span></article>
      <i aria-hidden="true">samples</i>
      <article><FileAudio size={20} /><small>Physical instrument</small><strong>{instrument.sampledInstrumentName || "Source-described organ"}</strong><span>{instrument.physicalInstrument.builder || "Builder not stated"}</span></article>
      <i aria-hidden="true">recorded at</i>
      <article><MapPin size={20} /><small>Recording place</small><strong>{locationLabel(instrument)}</strong><span>{location.precision || "Source precision"}</span></article>
    </div>
  );
}

function DecisionPanel({ instrument, activeReleaseVersion, baselineReleaseVersion, onOpen }: { instrument: VirtualInstrumentDetail; activeReleaseVersion?: string; baselineReleaseVersion?: string; onOpen: (id: string) => void }) {
  const organ = instrument.relationships.organDecision;
  const organTargets = organ.targets ?? (organ.target ? [organ.target] : []);
  const place = instrument.relationships.placeDecision;
  const evidence = decisionEvidence(organ);
  const policy = instrument.matchingPolicy;
  const exactOrHigh = organ.confidenceTier === "verified_exact" || organ.confidenceTier === "high_confidence";
  const probable = organ.confidenceTier === "probable" || (!exactOrHigh && organTargets.length > 0);
  const heading = instrument.kind.independentlyDistributed !== "yes" && (instrument.parents?.length || instrument.parent)
    ? "Component and inherited context"
    : instrument.physicalInstrument.location.type === "multiple_sites" || (instrument.parents?.length || 0) > 1
      ? "Composite source instruments"
      : String(instrument.kind.recordingBasis || "").toLowerCase().includes("modeled")
        ? "Modeled basis and geographic association"
        : "Recorded instrument and place";
  const highScore = policyNumber(policy, "minimumHighConfidenceScore");
  const highMargin = policyNumber(policy, "minimumHighConfidenceMargin");
  const probableScore = policyNumber(policy, "minimumProbableScore");
  const probableMargin = policyNumber(policy, "minimumProbableMargin");
  const retainedScore = policyNumber(policy, "minimumAmbiguousScore");
  const placeHasIdentity = Boolean(place.target?.canonicalTargetMdvsId);
  const canonicalRelations = instrument.relationships.canonicalOrganRelations;
  const canonicalTargets = canonicalRelations?.filter((relation) => Boolean(relation.targetOrganMdvsId)) ?? [];
  return (
    <section className="vpi-detail-section vpi-relationship-section">
      <header><div><p className="eyebrow">Entity graph</p><h3>{heading}</h3></div><span>{formatLabel(instrument.relationships.linkState)}</span></header>
      <RelationshipGraph instrument={instrument} onOpen={onOpen} />
      {instrument.canonical?.state === "canonical_vmi" && canonicalRelations && <p className="vpi-truth-note"><ShieldCheck size={15} /> Canonical Release 1.5 VMI identity {instrument.canonical.instrumentMdvsId}. {canonicalTargets.length > 0 ? `${canonicalTargets.length} verified/high-confidence physical-organ relation${canonicalTargets.length === 1 ? " is" : "s are"} projected.` : "The represented organ remains explicit source evidence without a canonical organ target."}</p>}
      <div className="vpi-resolution-grid">
        <article className={organTargets.length ? probable ? "ambiguous" : "resolved" : organ.outcome === "ambiguous" ? "ambiguous" : "unresolved"}>
          <span>MODAVIS organ relation · {formatLabel(organ.confidenceTier || organ.outcome)}</span>
          <strong>{organTargets.length ? `${organTargets.length} ${probable ? "probable organ candidate" : "linked organ"}${organTargets.length === 1 ? "" : "s"}` : organ.outcome === "not_applicable" ? "No physical-organ link applicable" : "No organ link promoted"}</strong>
          <p>{decisionReason(evidence.reason)}</p>
          {(evidence.score != null || evidence.margin != null || evidence.method) && <div className="vpi-decision-explanation">
            <span><b>Method</b>{formatLabel(evidence.method)}</span>
            <span><b>Observed score</b>{formatPercent(evidence.score)}</span>
            <span><b>Uniqueness margin</b>{formatPercent(evidence.margin)}</span>
          </div>}
          {policy && <details className="vpi-thresholds"><summary>How this decision is classified</summary><p>High confidence requires at least {formatPercent(highScore)} score and {formatPercent(highMargin)} uniqueness margin. Probable requires {formatPercent(probableScore)} and {formatPercent(probableMargin)}. Candidates at or above {formatPercent(retainedScore)} may remain visible without becoming links. Contradictory countries are rejected; parallel source records remain probable rather than being merged.</p></details>}
          {probable && <p className="vpi-candidate-warning"><GitBranch size={14} /> These are evidence-backed candidates, not asserted identities or canonical merges.</p>}
          {organTargets.map((target) => <div className="vpi-organ-target" key={`${target.mdvsId}:${target.siteIndex ?? 0}`}>
            <span>{probable ? "Probable candidate" : "Linked organ"}</span>
            <strong>{target.title || target.mdvsId}</strong>
            <small>{formatLabel(target.confidenceTier || organ.confidenceTier)} · {formatLabel(target.method || evidence.method)}{target.siteRole ? ` · ${formatLabel(target.siteRole)}` : ""}{target.score != null ? ` · score ${formatPercent(target.score)}` : ""}</small>
            <FeatureEvidence target={target} />
            <InvestigationLinks target={target} />
          </div>)}
          {organTargets.length === 0 && (organ.alternatives?.length || 0) > 0 && <details className="vpi-alternatives"><summary>{organ.alternatives?.length} bounded candidate{organ.alternatives?.length === 1 ? "" : "s"} retained</summary>{organ.alternatives?.map((item) => <div key={item.mdvsId}><strong>{item.title}</strong><small>{item.mdvsId} · score {formatPercent(item.score)}</small><FeatureEvidence target={item} /><InvestigationLinks target={item} /></div>)}</details>}
        </article>
        <article className={placeHasIdentity ? "resolved" : place.outcome === "ambiguous" ? "ambiguous" : "unresolved"}>
          <span>{placeHasIdentity ? "MODAVIS place identity" : "Source-backed place evidence"}</span>
          <strong>{place.target?.label || locationLabel(instrument)}</strong>
          <p>{decisionReason(place.reason)}</p>
          {placeHasIdentity && place.target?.pageUrl && <a href={place.target.pageUrl}>Open place entity <ExternalLink size={13} /></a>}
          {!placeHasIdentity && instrument.relationships.recordingPlace?.pageUrl && <a href={instrument.relationships.recordingPlace.pageUrl}>Browse records sharing this location wording</a>}
        </article>
      </div>
      <p className="vpi-truth-note"><ShieldCheck size={15} /> {instrument.canonical?.state === "canonical_vmi" ? "Read-only Release 1.5 candidate: this VMI, its version, package, exact VPO identifier, profiles, and bounded organ relation are canonical database rows. Probable and ambiguous candidates remain unpromoted; publication is disabled." : `Read-only${activeReleaseVersion ? ` Release ${activeReleaseVersion} successor` : " successor"} evidence projection${baselineReleaseVersion ? ` over the immutable Release ${baselineReleaseVersion} baseline` : ""}. This component remains an exact source fragment inside its parent VMI.`}</p>
    </section>
  );
}

function InstrumentFamilyLink({ item, role, onOpen }: { item: VirtualInstrumentSummary; role: string; onOpen: (id: string) => void }) {
  return <a href={item.canonicalUrl || instrumentHref(item.id)} onClick={(event) => openInstrumentLink(event, item.id, onOpen)}><span>{role}</span><strong>{item.title}</strong><small>{item.id} · {formatLabel(item.kind.granularity)}</small></a>;
}

function InstrumentFamilySection({ instrument, onOpen }: { instrument: VirtualInstrumentDetail; onOpen: (id: string) => void }) {
  const parentMap = new Map<string, VirtualInstrumentSummary>();
  (instrument.parents ?? []).forEach((item) => parentMap.set(item.id, item));
  if (instrument.parent) parentMap.set(instrument.parent.id, instrument.parent);
  const parents = [...parentMap.values()];
  const children = instrument.children ?? [];
  const namedChildren = children.filter((item) => Boolean(item.technical?.componentStopOrRankName));
  const unnamedChildren = children.filter((item) => !item.technical?.componentStopOrRankName);
  const editions = (instrument.relatedEditions ?? []).filter((item) => !parentMap.has(item.id));
  if (parents.length === 0 && children.length === 0 && editions.length === 0) return null;
  return (
    <section className="vpi-detail-section vpi-family-section">
      <header><div><p className="eyebrow">Structure</p><h3>Package, components and editions</h3></div><GitBranch size={22} /></header>
      {parents.length > 0 && <div className="vpi-family-group"><h4>{parents.length > 1 ? "Source / parent packages" : "Parent package"}</h4>{parents.map((item) => <InstrumentFamilyLink key={item.id} item={item} role={parents.length > 1 ? "Source instrument" : "Parent entity"} onOpen={onOpen} />)}</div>}
      {namedChildren.length > 0 && <div className="vpi-family-group"><h4>Named components ({formatInteger(namedChildren.length)})</h4>{namedChildren.map((item) => <InstrumentFamilyLink key={item.id} item={item} role={item.technical?.componentStopOrRankName || "Component"} onOpen={onOpen} />)}</div>}
      {unnamedChildren.length > 0 && <details className="vpi-family-group" open={unnamedChildren.length <= 12}><summary>Other components ({formatInteger(unnamedChildren.length)})</summary>{unnamedChildren.map((item) => <InstrumentFamilyLink key={item.id} item={item} role="Component / configuration" onOpen={onOpen} />)}</details>}
      {editions.length > 0 && <details className="vpi-family-group" open={editions.length <= 12}><summary>Related editions ({formatInteger(editions.length)})</summary>{editions.map((item) => <InstrumentFamilyLink key={item.id} item={item} role="Related edition" onOpen={onOpen} />)}</details>}
    </section>
  );
}

function VirtualInstrumentDetailPage({ instrument, activeReleaseVersion, baselineReleaseVersion, onBack, onOpen }: { instrument: VirtualInstrumentDetail; activeReleaseVersion?: string; baselineReleaseVersion?: string; onBack: () => void; onOpen: (id: string) => void }) {
  const local = instrument.localAvailability.state === "locally_available";
  const integrityVerified = local && instrument.localAvailability.integrityVerified === true;
  const modeled = String(instrument.kind.recordingBasis || "").toLowerCase().includes("modeled") || String(instrument.physicalInstrument.location.basis || "").includes("modeled_style");
  return (
    <article className="vpi-detail">
      <button type="button" className="vpi-back" onClick={onBack}><ArrowLeft size={16} /> Back to virtual instruments</button>
      <header className="vpi-detail-hero">
        <div>
          <p className="eyebrow">{virtualEntityScopeLabel(instrument.kind.granularity)} · {instrument.id}</p>
          <h2>{instrument.title}</h2>
          <p>{instrument.producer || "Producer not recorded"} · {formatLabel(instrument.kind.granularity)}</p>
          <div className="vpi-detail-badges"><span>{formatLabel(instrument.availability.accessCategory)}</span><span>{formatLabel(instrument.availability.licenseCategory)}</span>{instrument.platforms.all.map((item) => <span key={item}>{item}</span>)}</div>
        </div>
        <aside className={integrityVerified ? "verified" : local ? "available" : "catalog-only"}>
          {integrityVerified ? <ShieldCheck size={28} /> : local ? <HardDrive size={28} /> : <Database size={28} />}
          <strong>{integrityVerified ? "Integrity-verified local files" : local ? "Local files present" : "External catalog record"}</strong>
          <span>{local ? `${formatLabel(instrument.localAvailability.status)}${integrityVerified ? " · checksums verified" : " · integrity not verified"}` : "No local copy recorded"}</span>
        </aside>
      </header>

      <DecisionPanel instrument={instrument} activeReleaseVersion={activeReleaseVersion} baselineReleaseVersion={baselineReleaseVersion} onOpen={onOpen} />

      <div className="vpi-detail-columns">
        <section className="vpi-detail-section">
          <h3>Virtual instrument</h3>
          <dl className="vpi-facts">
            <Fact label="Producer" value={instrument.producer} />
            <Fact label="Entity type" value={instrument.kind.catalogEntityType} />
            <Fact label="Recording basis" value={instrument.kind.recordingBasis} />
            <Fact label="Distribution" value={instrument.kind.distributionUnit} />
            <Fact label="Independent package" value={instrument.kind.independentlyDistributed} />
            <Fact label="Native platform" value={instrument.platforms.native} />
            <Fact label="Edition / variant" value={instrument.technical?.editionOrVariant} />
            <Fact label="Perspectives / channels" value={instrument.technical?.perspectivesOrChannels} />
            <Fact label="Sample resolution" value={instrument.technical?.sampleFormatResolution} />
            <Fact label="Wet / dry" value={instrument.technical?.wetDry} />
            <Fact label="Size / memory" value={instrument.technical?.sizeOrMemory} />
            <Fact label="Audio included" value={instrument.technical?.audioIncluded} />
          </dl>
        </section>
        <section className="vpi-detail-section">
          <h3>{modeled ? "Modeled / source-described basis" : "Physical instrument"}</h3>
          <dl className="vpi-facts">
            <Fact label="Instrument" value={instrument.sampledInstrumentName} />
            <Fact label="Builder" value={instrument.physicalInstrument.builder} />
            <Fact label="Construction" value={instrument.physicalInstrument.constructionYear} />
            <Fact label="Rebuilds / revisions" value={instrument.physicalInstrument.rebuildOrRevisionYears} />
            <Fact label="Style" value={instrument.physicalInstrument.style} />
            <Fact label="Manuals" value={instrument.physicalInstrument.manuals} />
            <Fact label="Pedal" value={instrument.physicalInstrument.pedal} />
            <Fact label="Stops / ranks" value={instrument.physicalInstrument.stopsOrRanks} />
            <Fact label={modeled ? "Geographic / style association" : "Recording place"} value={locationLabel(instrument)} />
            <Fact label="Location basis" value={instrument.physicalInstrument.location.basis} />
          </dl>
        </section>
        <section className="vpi-detail-section">
          <h3>Access and rights</h3>
          <dl className="vpi-facts">
            <Fact label="Availability" value={instrument.availability.catalogStatus} />
            <Fact label="Access" value={instrument.availability.accessModel} />
            <Fact label="License" value={instrument.availability.licenseClass} />
            <Fact label="Listed price" value={[instrument.availability.listedPrice, instrument.availability.currency].filter(Boolean).join(" ")} />
          </dl>
          <p className="vpi-rights-note"><CircleDollarSign size={15} /> Free access and open licensing are separate. Check the linked producer terms before reuse or redistribution.</p>
        </section>
        <section className="vpi-detail-section">
          <h3>Local corpus state</h3>
          <dl className="vpi-facts">
            <Fact label="State" value={formatLabel(instrument.localAvailability.state)} />
            <Fact label="Status" value={formatLabel(instrument.localAvailability.status)} />
            <Fact label="Integrity verified" value={instrument.localAvailability.integrityVerified ? "Yes" : "No"} />
            <Fact label="Files" value={instrument.localAvailability.fileCount ? formatInteger(instrument.localAvailability.fileCount) : null} />
            <Fact label="WAV files" value={instrument.localAvailability.wavFileCount ? formatInteger(instrument.localAvailability.wavFileCount) : null} />
            <Fact label="Recorded size" value={formatBytes(instrument.localAvailability.byteSize)} />
          </dl>
          <p className="vpi-rights-note"><HardDrive size={15} /> Public responses expose verification state and counts, never workstation paths or manifest locations.</p>
        </section>
      </div>

      <InstrumentFamilySection instrument={instrument} onOpen={onOpen} />

      <section className="vpi-detail-section vpi-provenance">
        <header><div><p className="eyebrow">Evidence</p><h3>Source and reproducibility</h3></div><Database size={22} /></header>
        <dl className="vpi-facts">
          <Fact label="Catalog identifier" value={instrument.id} />
          <Fact label="Canonical VMI ID" value={instrument.canonical?.instrumentMdvsId} />
          <Fact label="Canonical core entity" value={instrument.canonical?.coreEntityMdvsId} />
          <Fact label="Canonical version" value={instrument.canonical?.versionMdvsId} />
          <Fact label="Canonical package" value={instrument.canonical?.packageMdvsId} />
          <Fact label="Exact evidence fragment" value={instrument.canonical?.sourceFragmentMdvsId} />
          <Fact label="Research date" value={instrument.evidence.researchDate} />
          <Fact label="Catalog confidence" value={instrument.evidence.confidence} />
          <Fact label="Source-row SHA-256" value={instrument.evidence.rowSha256} />
        </dl>
        <div className="vpi-source-links">{(instrument.evidence.sourceUrls ?? []).map((url) => safeExternalUrl(url)).filter((url): url is string => Boolean(url)).map((url, index) => <a href={url} target="_blank" rel="noreferrer" key={url}>{sourceLinkLabel(url, index)} <ExternalLink size={13} /></a>)}<a href={instrument.apiUrl}>Open structured API</a></div>
        {instrument.evidence.evidenceLocator && <p className="vpi-evidence-locator"><strong>Evidence locator:</strong> {instrument.evidence.evidenceLocator}</p>}
        {instrument.notes && <p>{instrument.notes}</p>}
      </section>
    </article>
  );
}

export function VirtualInstrumentsArea({ activeReleaseVersion, baselineReleaseVersion, publicProjection = false }: { activeReleaseVersion?: string; baselineReleaseVersion?: string; publicProjection?: boolean }) {
  const [filters, setFilters] = useState<CatalogFilters>(filtersFromLocation);
  const [draftQuery, setDraftQuery] = useState(filters.q);
  const [selectedId, setSelectedId] = useState(routeInstrumentId);
  const [catalog, setCatalog] = useState<CatalogResponse | null>(null);
  const [detail, setDetail] = useState<VirtualInstrumentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const catalogScrollPosition = useRef(0);
  const restoreCatalogScroll = useRef(false);

  useEffect(() => {
    const onRoute = () => { const next = filtersFromLocation(); setFilters(next); setDraftQuery(next.q); setSelectedId(routeInstrumentId()); };
    window.addEventListener("popstate", onRoute);
    return () => window.removeEventListener("popstate", onRoute);
  }, []);

  const requestUrl = useMemo(() => {
    const search = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(filters.offset) });
    Object.entries(filters).forEach(([key, value]) => {
      if (key !== "offset" && value && (!publicProjection || PUBLIC_CATALOG_FILTERS.has(key as keyof CatalogFilters))) search.set(key, String(value));
    });
    return `/api/virtual-instruments?${search.toString()}`;
  }, [filters, publicProjection]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError("");
    if (selectedId) {
      setDetail(null);
      readJson<{ virtualInstrument: VirtualInstrumentDetail }>(`/api/virtual-instruments/${encodeURIComponent(selectedId)}`)
        .then((response) => { if (!cancelled) {
          setDetail(response.virtualInstrument);
          const path = response.virtualInstrument.canonicalUrl;
          if (path && path !== window.location.pathname) window.history.replaceState(null, "", path + window.location.search);
        } })
        .catch((reason: Error) => { if (!cancelled) setError(reason.message); })
        .finally(() => { if (!cancelled) setLoading(false); });
    } else {
      setCatalog(null);
      readJson<CatalogResponse>(requestUrl)
        .then((response) => { if (!cancelled) setCatalog(response); })
        .catch((reason: Error) => { if (!cancelled) setError(reason.message); })
        .finally(() => { if (!cancelled) setLoading(false); });
    }
    return () => { cancelled = true; };
  }, [requestUrl, selectedId]);

  useEffect(() => {
    document.title = detail ? `${detail.title} · MODAVIS Navigator` : "Virtual instruments · MODAVIS Navigator";
    return () => { document.title = "MODAVIS Navigator"; };
  }, [detail]);

  useEffect(() => {
    if (selectedId || loading || !catalog || !restoreCatalogScroll.current) return;
    restoreCatalogScroll.current = false;
    window.requestAnimationFrame(() => window.scrollTo({ top: catalogScrollPosition.current, behavior: "auto" }));
  }, [catalog, loading, selectedId]);

  const changeFilter = (name: keyof CatalogFilters, value: string) => {
    const next = { ...filters, [name]: value, offset: 0 };
    setFilters(next); updateCatalogRoute(next);
  };
  const applySearch = (event: FormEvent) => {
    event.preventDefault();
    const next = { ...filters, q: draftQuery.trim(), offset: 0 };
    setFilters(next); updateCatalogRoute(next);
  };
  const clear = () => {
    const next = { ...filtersFromLocation(), q: "", producer: "", platform: "", access: "", license_class: "", availability: "", downloaded: "", country: "", link_state: "", organ_link: "", organ_outcome: "", confidence_tier: "", match_method: "", granularity: "", independently_distributed: "yes", place: "", sort: "title", offset: 0 };
    setDraftQuery(""); setFilters(next); updateCatalogRoute(next);
  };
  const open = (id: string) => {
    catalogScrollPosition.current = window.scrollY;
    window.history.pushState(null, "", `/virtual-instruments/${encodeURIComponent(id.replace(/^MDVS:VMIN:/, ""))}${window.location.search}`);
    setSelectedId(id); window.scrollTo({ top: 0, behavior: "auto" });
  };
  const back = () => {
    restoreCatalogScroll.current = true;
    setCatalog(null); setLoading(true);
    updateCatalogRoute(filters); setSelectedId(""); setDetail(null);
  };

  if (selectedId) {
    if (loading) return <section className="vpi-shell"><p className="notice" role="status">Loading virtual instrument entity…</p></section>;
    if (error || !detail) return <section className="vpi-shell"><button className="vpi-back" type="button" onClick={back}><ArrowLeft size={16} /> Back</button><p className="notice error">{error || "Virtual instrument not found."}</p></section>;
    return <section className="vpi-shell" id="vmi" tabIndex={-1}>{publicProjection
      ? <PublicVirtualInstrumentDetail instrument={detail} releaseVersion={String(detail.releaseBoundary?.targetRelease || activeReleaseVersion || "")} onBack={back} />
      : <VirtualInstrumentDetailPage instrument={detail} activeReleaseVersion={activeReleaseVersion} baselineReleaseVersion={baselineReleaseVersion} onBack={back} onOpen={open} />}</section>;
  }

  return (
    <section className="vpi-shell" id="vmi" tabIndex={-1}>
      <header className="vpi-catalog-hero">
        <div><p className="eyebrow">{publicProjection ? `Public collection · Release ${activeReleaseVersion}` : <>{catalog?.releaseBoundary?.targetRelease ? `Release ${String(catalog.releaseBoundary.targetRelease)} canonical candidate` : activeReleaseVersion ? `Release ${activeReleaseVersion} successor candidate` : "Successor preview"}{baselineReleaseVersion ? ` · Release ${baselineReleaseVersion} baseline` : ""} · read-only</>}</p><h2>Virtual instruments</h2><p>{publicProjection ? "Explore virtual instrument records and their documented connections to pipe organs." : "Browse canonical independent VMI packages first, then inspect their exact component evidence, versions, physical-organ relations and withheld candidates. Confidence and matching method remain visible—not hidden certainty."}</p></div>
        <div className="vpi-hero-count"><strong>{catalog ? formatInteger(catalog.counts.distinctCanonicalOrganEntities ?? catalog.counts.distinctOrganEntitiesLinked) : "…"}</strong><span>{publicProjection ? "distinct related organs in these results" : catalog?.counts.canonicalVmiInstruments ? "distinct MODAVIS organs in canonical VMI relations" : "distinct MODAVIS organ entities linked or suggested"}</span></div>
      </header>

      <section className="vpi-filter-panel" aria-label="Virtual instrument filters">
        <form onSubmit={applySearch}><label><span>{publicProjection ? "Search titles and identifiers" : "Search all structured fields"}</span><div><Search size={16} /><input aria-label={publicProjection ? "Search virtual instruments" : "Search all structured fields"} value={draftQuery} onChange={(event) => setDraftQuery(event.target.value)} placeholder={publicProjection ? "Virtual instrument title or identifier" : "Instrument, venue, builder, producer, platform…"} /><button type="submit">Search</button></div></label></form>
        {catalog && <div className="vpi-filter-grid vpi-filter-primary">
          <label><span>Organ relationship</span><select value={filters.organ_link} onChange={event => changeFilter("organ_link", event.target.value)}><option value="">All virtual instruments</option><option value="linked">Linked to an organ record</option><option value="unlinked">No confirmed organ link</option></select></label>
          <FacetSelect label="Producer" name="producer" value={filters.producer} items={catalog.facets.producers} itemKey="producer" onChange={changeFilter} />
          <FacetSelect label="Platform" name="platform" value={filters.platform} items={catalog.facets.platforms} itemKey="platform" onChange={changeFilter} />
          <FacetSelect label="Access" name="access" value={filters.access} items={catalog.facets.accessCategories} itemKey={publicProjection ? "value" : "access"} onChange={changeFilter} />
          <FacetSelect label="Country" name="country" value={filters.country} items={catalog.facets.countries} itemKey="country" onChange={changeFilter} />
          <FacetSelect label="Granularity" name="granularity" value={filters.granularity} items={catalog.facets.granularities} itemKey={publicProjection ? "value" : "granularity"} onChange={changeFilter} />
          <label><span>Sort</span><select value={filters.sort} onChange={(event) => changeFilter("sort", event.target.value)}>{catalog.facets.sortOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
        </div>}
        {catalog && !publicProjection && <details className="vpi-advanced-filters"><summary><Filter size={14} /> More evidence filters</summary><div className="vpi-filter-grid">
          <FacetSelect label="License" name="license_class" value={filters.license_class} items={catalog.facets.licenseCategories} itemKey="licenseClass" onChange={changeFilter} />
          <FacetSelect label="Catalog status" name="availability" value={filters.availability} items={catalog.facets.availabilityStatuses} itemKey="availability" onChange={changeFilter} />
          <FacetSelect label="Local state" name="downloaded" value={filters.downloaded} items={catalog.facets.downloadStates} itemKey="downloaded" onChange={changeFilter} />
          <FacetSelect label="Link state" name="link_state" value={filters.link_state} items={catalog.facets.linkStates} itemKey="linkState" onChange={changeFilter} />
          <FacetSelect label="Organ outcome" name="organ_outcome" value={filters.organ_outcome} items={catalog.facets.organOutcomes} itemKey="organOutcome" onChange={changeFilter} />
          <FacetSelect label="Confidence" name="confidence_tier" value={filters.confidence_tier} items={catalog.facets.confidenceTiers} itemKey="confidenceTier" onChange={changeFilter} />
          <FacetSelect label="Match method" name="match_method" value={filters.match_method} items={catalog.facets.matchMethods} itemKey="matchMethod" onChange={changeFilter} />
        </div></details>}
        <footer>{!publicProjection && <label className="vpi-subordinate-toggle"><input type="checkbox" checked={filters.independently_distributed === ""} onChange={(event) => changeFilter("independently_distributed", event.target.checked ? "" : "yes")} /><span><strong>Include subordinate components and variants</strong><small>Off by default; components remain available inside their parent packages.</small></span></label>}<button type="button" onClick={clear}>Reset filters</button></footer>
      </section>

      {error && <p className="notice error">{error}</p>}
      {loading && <p className="notice" role="status">Loading virtual instrument entities…</p>}
      {catalog && !loading && <>
        <div className="vpi-result-head"><strong>{formatInteger(catalog.total)} {publicProjection ? "virtual instrument" : filters.independently_distributed === "yes" ? "independent package" : "evidence result"}{catalog.total === 1 ? "" : "s"}</strong><span>{publicProjection ? "Listed alphabetically" : filters.place ? "Filtered to one source-backed recording place" : filters.independently_distributed === "yes" ? "Components and variants are nested in each package" : "All package, component and variant rows included"}</span></div>
        <div className="vpi-card-grid">{catalog.items.map((item) => <VirtualInstrumentCard key={item.id} item={item} onOpen={open} publicProjection={publicProjection} />)}</div>
        {catalog.items.length === 0 && <div className="vpi-empty"><Layers3 size={28} /><strong>No virtual instruments match these filters.</strong><button type="button" onClick={clear}>Reset the collection</button></div>}
        <nav className="vpi-pagination" aria-label="Virtual instrument pagination">
          <button type="button" disabled={filters.offset === 0} onClick={() => { const next = { ...filters, offset: Math.max(0, filters.offset - PAGE_SIZE) }; setFilters(next); updateCatalogRoute(next); }}><ChevronLeft size={15} /> Previous</button>
          <span>{formatInteger(catalog.total ? filters.offset + 1 : 0)}–{formatInteger(Math.min(filters.offset + PAGE_SIZE, catalog.total))} of {formatInteger(catalog.total)}</span>
          <button type="button" disabled={filters.offset + PAGE_SIZE >= catalog.total} onClick={() => { const next = { ...filters, offset: filters.offset + PAGE_SIZE }; setFilters(next); updateCatalogRoute(next); }}>Next <ChevronRight size={15} /></button>
        </nav>
        {!publicProjection && <details className="vpi-catalog-context">
          <summary>Collection scope and linkage evidence</summary>
          <div className="vpi-metrics">
            <article><strong>{formatInteger(catalog.counts.entities)}</strong><span>evidence entities total</span></article>
            {catalog.counts.canonicalVmiInstruments != null && <article><strong>{formatInteger(catalog.counts.canonicalVmiInstruments)}</strong><span>canonical VMI identities</span></article>}
            {catalog.counts.canonicalOrganRelations != null && <article><strong>{formatInteger(catalog.counts.canonicalOrganRelations)}</strong><span>canonical organ relations</span></article>}
            {catalog.counts.unresolvedRepresentedOrganRelations != null && <article><strong>{formatInteger(catalog.counts.unresolvedRepresentedOrganRelations)}</strong><span>represented organs unresolved</span></article>}
            <article><strong>{formatInteger(catalog.counts.independentlyDistributed)}</strong><span>independent packages</span></article>
            <article><strong>{formatInteger(catalog.counts.sampledInstrumentIdentities)}</strong><span>sampled identities</span></article>
            <article><strong>{formatInteger(catalog.counts.stopOrRankComponents)}</strong><span>stop/rank components</span></article>
            <article><strong>{formatInteger(catalog.counts.locallyAvailable)}</strong><span>records with local files</span></article>
            <article><strong>{formatInteger(catalog.counts.locallyIntegrityVerified)}</strong><span>integrity verified locally</span></article>
            <article><strong>{formatInteger(catalog.counts.distinctExactOrHighOrganEntities)}</strong><span>distinct exact/high organs</span></article>
            <article><strong>{formatInteger(catalog.counts.distinctProbableOnlyOrganEntities)}</strong><span>distinct probable-only organs</span></article>
          </div>
          <p className="vpi-count-scope-note" role="note"><strong>{formatInteger(catalog.counts.entities)} evidence entities do not mean {formatInteger(catalog.counts.entities)} distinct instruments.</strong> The Release 1.5 candidate contains {formatInteger(catalog.counts.canonicalVmiInstruments ?? catalog.counts.independentlyDistributed)} canonical independent VMI identities and retains {formatInteger(catalog.counts.componentEvidenceFragments ?? catalog.counts.componentsOrVariants)} subordinate components or variants as exact evidence, including {formatInteger(catalog.counts.stopOrRankComponents)} stop/rank rows.</p>
          <section className="vpi-review-queues" aria-labelledby="vpi-review-heading">
            <header><div><p className="eyebrow">Critical investigation</p><h3 id="vpi-review-heading">Review the linkage boundary</h3></div><ShieldCheck size={22} /></header>
            <p>These queries isolate strict corroboration, parallel-source candidates and unresolved uncertainty. Detail pages expose both MODAVIS targets and original source records where available.</p>
            <div>{(catalog.reviewQueues ?? []).map((queue) => <a href={queue.href} key={queue.key}><strong>{formatInteger(queue.count)}</strong><span>{queue.label}</span><small>{queue.description}</small><ChevronRight size={16} /></a>)}</div>
          </section>
        </details>}
      </>}
    </section>
  );
}
