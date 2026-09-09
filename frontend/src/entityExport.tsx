import { ResourceView } from "./resourceView";
import { Braces, ExternalLink } from "lucide-react";
import { ReactNode, useCallback, useEffect, useState } from "react";
import type { EntityExportManifest } from "./api";

export type EntityPageTab = "overview" | "export";

function requestedEntityTab(): EntityPageTab {
  return new URLSearchParams(window.location.search).get("tab") === "export" ? "export" : "overview";
}

function updateEntityTabRoute(tab: EntityPageTab, replace = false): void {
  const url = new URL(window.location.href);
  if (tab === "overview") url.searchParams.delete("tab");
  else url.searchParams.set("tab", tab);
  window.history[replace ? "replaceState" : "pushState"](
    null,
    "",
    `${url.pathname}${url.search}${url.hash}`,
  );
}

export function useEntityPageTab(exportAvailable: boolean | undefined, routeKey: string) {
  const [activeTab, setActiveTab] = useState<EntityPageTab>(requestedEntityTab);

  useEffect(() => {
    setActiveTab(requestedEntityTab());
  }, [routeKey]);

  useEffect(() => {
    const handlePopState = () => setActiveTab(requestedEntityTab());
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    if (exportAvailable !== false || activeTab !== "export") return;
    updateEntityTabRoute("overview", true);
    setActiveTab("overview");
  }, [activeTab, exportAvailable]);

  const selectTab = useCallback((tab: EntityPageTab) => {
    if (tab === "export" && exportAvailable === false) return;
    if (tab === activeTab) return;
    updateEntityTabRoute(tab);
    setActiveTab(tab);
  }, [activeTab, exportAvailable]);

  return { activeTab, selectTab };
}

function tabIdentifier(scope: string, tab: EntityPageTab, suffix: "tab" | "panel"): string {
  return `${scope.replace(/[^a-z0-9_-]+/gi, "-")}-${tab}-${suffix}`;
}

export function EntityPageTabs({
  scope,
  label,
  activeTab,
  exportAvailable,
  onChange,
}: {
  scope: string;
  label: string;
  activeTab: EntityPageTab;
  exportAvailable: boolean;
  onChange: (tab: EntityPageTab) => void;
}) {
  const tabs: EntityPageTab[] = exportAvailable ? ["overview", "export"] : ["overview"];
  return (
    <nav className="entity-section-control" aria-label={`${label} sections`}>
      <div className="tab-strip" role="tablist" aria-label={`${label} page sections`}>
        {tabs.map((tab) => (
          <button
            type="button"
            id={tabIdentifier(scope, tab, "tab")}
            key={tab}
            role="tab"
            aria-controls={tabIdentifier(scope, tab, "panel")}
            aria-selected={activeTab === tab}
            className={activeTab === tab ? "selected" : ""}
            onClick={() => onChange(tab)}
          >
            {tab === "overview" ? "Overview" : "Export"}
          </button>
        ))}
      </div>
    </nav>
  );
}

export function EntityTabPanel({
  scope,
  tab,
  activeTab,
  className = "",
  children,
}: {
  scope: string;
  tab: EntityPageTab;
  activeTab: EntityPageTab;
  className?: string;
  children: ReactNode;
}) {
  if (activeTab !== tab) return null;
  return (
    <div
      id={tabIdentifier(scope, tab, "panel")}
      role="tabpanel"
      aria-labelledby={tabIdentifier(scope, tab, "tab")}
      className={["entity-tab-panel", className].filter(Boolean).join(" ")}
    >
      {children}
    </div>
  );
}

export function EntityExportPanel({ manifest }: { manifest?: EntityExportManifest | null }) {
  if (!manifest) {
    return (
      <section className="panel-block export-unavailable" role="status">
        <Braces size={24} aria-hidden="true" />
        <div>
          <h2>Export unavailable</h2>
          <p>No public machine-readable representation is included for this record in the active dataset version.</p>
        </div>
      </section>
    );
  }
  return (
    <div className="entity-export-panel">
      <ResourceView owner={manifest.mdvsId} />
      <section className="panel-block export-introduction">
        <p className="eyebrow">MODAVIS Ontology Network datasheet</p>
        <h2 id="entity-export-heading" tabIndex={-1}>Linked data for this entity</h2>
        <p>This datasheet describes the entity in the MODAVIS Ontology Network and links each representation to the exact dataset version used to create it.</p>
        <div className="export-identity"><span>Entity</span><code>{manifest.mdvsId}</code><span>Contract</span><code>{manifest.contract}</code></div>
      </section>
      <section className="panel-block">
        <h2>Native MODAVIS formats</h2>
        <p>Equivalent serializations of the native public graph for software, repositories, and command-line tools.</p>
        <div className="export-format-grid">{manifest.native.map((item) => <a href={item.url} key={item.key} className="export-format-card">
          <Braces size={20} aria-hidden="true" /><strong>{item.label}</strong><span>{item.mediaType}</span><small>Versioned representation</small>
        </a>)}</div>
      </section>
      <section className="panel-block">
        <h2>Semantic profiles</h2>
        <p>Read-only mappings support discovery and exchange while preserving the native MODAVIS graph as the authoritative representation.</p>
        <div className="public-record-list">{manifest.profiles.map((item) => <a href={item.url} key={item.key}><strong>{item.label}</strong><span>{item.format || "JSON-LD"} profile{item.mediaType ? ` · ${item.mediaType}` : ""}</span></a>)}</div>
      </section>
      <section className="panel-block">
        <h2>Source-dependent structured data</h2>
        <p>View the publication-safe structured projections supporting this entity. Original source prose and media bytes remain governed by their source records.</p>
        <a className="public-action-link" href={manifest.sourceDataUrl}>Open source data index <ExternalLink size={15} /></a>
      </section>
    </div>
  );
}
