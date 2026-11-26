import { Braces, ExternalLink } from "lucide-react";
import { lazy, ReactNode, Suspense, useCallback, useEffect, useState } from "react";
import type { EntityExportManifest } from "./api";
import { LoadingContent } from "./LoadingContent";
import { useUiLocale } from "./uiLocale";

export type EntityPageTab = "overview" | "export";
const ResourceView = lazy(() => import("./resourceView").then(module => ({ default: module.ResourceView })));

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
            tabIndex={activeTab === tab ? 0 : -1}
            className={activeTab === tab ? "selected" : ""}
            onClick={() => onChange(tab)}
            onKeyDown={event => {
              const index = tabs.indexOf(tab);
              const next = event.key === "ArrowRight" ? tabs[(index + 1) % tabs.length]
                : event.key === "ArrowLeft" ? tabs[(index + tabs.length - 1) % tabs.length]
                : event.key === "Home" ? tabs[0] : event.key === "End" ? tabs[tabs.length - 1] : null;
              if (!next) return;
              event.preventDefault();
              onChange(next);
              document.getElementById(tabIdentifier(scope, next, "tab"))?.focus();
            }}
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
  const { t } = useUiLocale();
  if (!manifest) {
    return (
      <section className="panel-block export-unavailable" role="status">
        <Braces size={24} aria-hidden="true" />
        <div>
          <h2>{t("entity.export.unavailable", "Export unavailable", "Kein Export verfügbar")}</h2>
          <p>{t("entity.export.unavailableDetail", "No public machine-readable representation is included for this record in the active dataset version.", "Die aktuelle Version des Datensatzes enthält für diesen Eintrag keine öffentliche maschinenlesbare Darstellung.")}</p>
        </div>
      </section>
    );
  }
  return (
    <div className="entity-export-panel">
      <Suspense fallback={<LoadingContent label={t("entity.export.loading", "Loading retained resources…", "Ressourcen werden geladen …")} />}><ResourceView owner={manifest.mdvsId} /></Suspense>
      <section className="panel-block export-introduction">
        <p className="eyebrow">{t("entity.export.datasheet", "MODAVIS Ontology Network datasheet", "Datenblatt des MODAVIS Ontology Network")}</p>
        <h2 id="entity-export-heading" tabIndex={-1}>{t("entity.export.linkedData", "Linked data for this entity", "Verknüpfte Daten zu diesem Eintrag")}</h2>
        <p>{t("entity.export.scope", "This datasheet describes the entity in the MODAVIS Ontology Network and links each representation to the exact dataset version used to create it.", "Das Datenblatt beschreibt den Eintrag im MODAVIS Ontology Network. Für jedes Exportformat ist die zugrunde liegende Version des Datensatzes angegeben.")}</p>
        <div className="export-identity"><span>{t("entity.export.entity", "Entity", "Eintrag")}</span><code>{manifest.mdvsId}</code><span>{t("entity.export.contract", "Contract", "Exportspezifikation")}</span><code>{manifest.contract}</code></div>
      </section>
      <section className="panel-block">
        <h2>{t("entity.export.nativeFormats", "Native MODAVIS formats", "Native MODAVIS-Formate")}</h2>
        <p>{t("entity.export.nativeScope", "Equivalent serializations of the native public graph for software, repositories, and command-line tools.", "Gleichwertige Serialisierungen des öffentlichen MODAVIS-Datengraphen für Software, Repositorien und Kommandozeilenwerkzeuge.")}</p>
        <div className="export-format-grid">{manifest.native.map((item) => <a href={item.url} key={item.key} className="export-format-card">
          <Braces size={20} aria-hidden="true" /><strong>{item.label}</strong><span>{item.mediaType}</span><small>{t("entity.export.versioned", "Versioned representation", "Darstellung mit Versionsangabe")}</small>
        </a>)}</div>
      </section>
      <section className="panel-block">
        <h2>{t("entity.export.semanticProfiles", "Semantic profiles", "Semantische Profile")}</h2>
        <p>{t("entity.export.profileScope", "Read-only mappings support discovery and exchange while preserving the native MODAVIS graph as the authoritative representation.", "Die nur lesbaren Abbildungen erleichtern die Recherche und den Datenaustausch. Maßgeblich bleibt der ursprüngliche MODAVIS-Datengraph.")}</p>
        <div className="public-record-list">{manifest.profiles.map((item) => <a href={item.url} key={item.key}><strong>{item.label}</strong><span>{t("entity.export.profile", "{format} profile", "{format}-Profil", { format: item.format || "JSON-LD" })}{item.mediaType ? ` · ${item.mediaType}` : ""}</span></a>)}</div>
      </section>
      <section className="panel-block">
        <h2>{t("entity.export.sourceData", "Source-dependent structured data", "Strukturierte Daten aus den Quellen")}</h2>
        <p>{t("entity.export.sourceScope", "View the public structured data supporting this entity. The source records govern access to the original texts and media.", "Hier finden Sie die veröffentlichten strukturierten Angaben zu diesem Eintrag. Der Zugang zu Originaltexten und Medien richtet sich nach den Bedingungen der jeweiligen Quelle.")}</p>
        <a className="public-action-link" href={manifest.sourceDataUrl}>{t("entity.export.openSourceData", "Open source data index", "Verzeichnis der Quelldaten öffnen")} <ExternalLink size={15} aria-hidden="true" /></a>
        {manifest.sourceDataUrl.endsWith("/sources") && <p className="export-evidence-coverage"><a className="public-action-link" href={manifest.sourceDataUrl.replace(/\/sources$/, "/evidence")}>{t("entity.export.evidence", "Inspect evidence coverage", "Beleglage prüfen")} <ExternalLink size={15} aria-hidden="true" /></a><small>{t("entity.export.evidenceScope", "Distinguishes available evidence context, source context, and missing field provenance.", "Die Übersicht zeigt, für welche Datenfelder Belege oder Quellenkontext vorliegen und wo Herkunftsangaben fehlen.")}</small></p>}
      </section>
    </div>
  );
}
