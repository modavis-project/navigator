import {useId, type ReactNode} from "react";
import {ArrowRight, BookOpen, History, Music2} from "lucide-react";
import type {OrganDetail} from "./api";
import {relatedActionGroups} from "./sourceComparisonPresentation";
import {useUiLocale} from "./uiLocale";
import "./organOverview.css";

type OverviewTab = "specification" | "history" | "identifiers" | "related";
type Props = {
  organ: OrganDetail;
  onOpenTab: (tab: OverviewTab) => void;
  facts: ReactNode;
  factCount: number;
  moreFacts: ReactNode;
  moreFactCount: number;
  accountContext: ReactNode;
  narrative: ReactNode;
  comparisons: ReactNode;
};

export function OrganOverview({
  organ, onOpenTab, facts, factCount, moreFacts, moreFactCount, accountContext, narrative, comparisons,
}: Props) {
  const {t} = useUiLocale();
  const label = useId();
  const descriptions = organ.specificationDescriptions || [];
  const profileFacts = organ.publicProfile?.sections?.find(section => section.key === "overview")?.items || [];
  const stopFact = profileFacts.find(item => item.label === "Source-reported stops" || item.label === "Documented stops");
  const stopValue = stopFact?.value || "";
  const numericStops = /^\d+$/.test(stopValue);
  const sourceRecords = organ.sourceSummary?.sourceRecords;
  const collections = organ.sourceSummary?.collections;
  const history = organ.documentedStateSummary;
  const sourceLinks = (organ.sources || []).slice(0, 3);
  const narrativeCount = organ.technicalEvidence?.descriptions?.length || 0;
  const comparisonGroups = (organ.sourceComparisons || []).flatMap(comparison => comparison.groups);
  const differing = comparisonGroups.filter(group => /conflict|differ|disagree/i.test(group.status));
  const technicalGroups = organ.technicalEvidence?.comparisonGroups ?? [];
  const technicalDifferences = technicalGroups.filter(group => ["different_values", "different_wording"].includes(group.status));
  const actionScopeReview = relatedActionGroups(technicalGroups).length > 0;
  const hasComparisons = comparisonGroups.length > 0 || technicalGroups.length > 0;
  const virtualCount = organ.virtualInstruments?.linked || 0;
  const recordPath = organ.pageUrl || organ.canonicalUrl || "/organs/" + encodeURIComponent(organ.mdvsId);
  const tabLink = (tab: OverviewTab, text: string, className = "") => <a
    className={"overview-tab-link " + className}
    href={recordPath + (recordPath.includes("?") ? "&" : "?") + "tab=" + tab}
    onClick={event => {
      if (event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
        event.preventDefault(); onOpenTab(tab);
      }
    }}
  >{text}<ArrowRight size={15} aria-hidden="true"/></a>;

  return <div className="organ-overview">
    <section className="overview-at-a-glance" aria-labelledby={label + "-title"}>
      <header><h2 id={label + "-title"}>{t("organ.overview.instrument", "Documented instrument", "Dokumentiertes Instrument")}</h2>
        <p className="overview-source-scope">{t("organ.overview.scope", "Source accounts retain their own dates and attribution. These descriptions do not establish the organ’s present condition.", "Jede Quellenbeschreibung behält ihre Datierung und Quellenzuordnung. Aus diesen Beschreibungen lässt sich der heutige Zustand der Orgel nicht ableiten.")}</p>
      </header>
      <div className="overview-summary-grid">
        <section className="overview-summary-card" aria-labelledby={label + "-specification"}>
          <h3 id={label + "-specification"}><Music2 size={17} aria-hidden="true"/> {t("organ.overview.specification", "Specification", "Disposition")}</h3>
          {stopValue ? numericStops
            ? <p className="overview-stop-total"><strong>{stopValue}</strong><span>{t("organ.overview.stopLabel", stopFact?.label?.toLowerCase() || "source-reported stops", "Register laut Quelle")}</span></p>
            : <p className="overview-quantity-qualification" role="note">{stopValue}</p>
            : <p className="overview-card-description">{t("organ.overview.readSources", "Read the source specifications for the documented disposition.", "Lesen Sie die Quellenbeschreibungen zur dokumentierten Disposition.")}</p>}
          {stopFact?.source && <p className="overview-fact-attribution">{stopFact.source}</p>}
          {stopFact?.evidenceSummary && <p className="overview-fact-attribution">{stopFact.evidenceSummary}</p>}
          {descriptions.length > 0 && <p className="overview-card-description">{t("organ.overview.descriptionCount", "{count, plural, one {# specification description} other {# specification descriptions}} · dates kept by account", "{count, plural, one {# Quellenbeschreibung} other {# Quellenbeschreibungen}} · mit eigener Datierung", {count:descriptions.length})}</p>}
          {tabLink("specification", t("organ.overview.openSpecification", "Explore specifications", "Dispositionen ansehen"), "overview-primary-action")}
        </section>
        <section className="overview-summary-card" aria-labelledby={label + "-history"}>
          <h3 id={label + "-history"}><History size={17} aria-hidden="true"/> {t("organ.overview.history", "Documented history", "Dokumentierte Geschichte")}</h3>
          {history?.yearLabel && <p className="overview-history-range">{history.yearLabel}<small>{t("organ.overview.historyDates", "Dates of recorded assertions", "Datierung der erfassten Angaben")}</small></p>}
          <p className="overview-card-description">{history?.assertionCount != null
            ? t("organ.overview.eventCount", "{count, plural, one {# source event assertion} other {# source event assertions}}. Separate sources may describe the same activity.", "{count, plural, one {# Ereignisangabe aus einer Quelle} other {# Ereignisangaben aus Quellen}}. Mehrere Quellen können dieselbe Tätigkeit beschreiben.", {count:history.assertionCount})
            : t("organ.overview.historyIntro", "Explore documented activities, participants and their source dates.", "Erkunden Sie dokumentierte Tätigkeiten, Beteiligte und die Datierungen laut Quelle.")}</p>
          {tabLink("history", t("organ.overview.openHistory", "Read the history", "Geschichte ansehen"), "overview-primary-action")}
        </section>
        <section className="overview-summary-card overview-source-card" aria-labelledby={label + "-sources"}>
          <h3 id={label + "-sources"}><BookOpen size={17} aria-hidden="true"/> {t("organ.overview.sources", "Sources", "Quellen")}</h3>
          <p className="overview-card-description">{sourceRecords != null
            ? collections != null
              ? t("organ.overview.sourceCollections", "This page draws on {count, plural, one {# source record} other {# source records}} from {collections, plural, one {# collection} other {# collections}}.", "Diese Seite stützt sich auf {count, plural, one {# Quelldatensatz} other {# Quelldatensätze}} aus {collections, plural, one {# Sammlung} other {# Sammlungen}}.", {count:sourceRecords,collections})
              : t("organ.overview.sourceCount", "{count, plural, one {# source record supports} other {# source records support}} this page.", "Diese Seite stützt sich auf {count, plural, one {# Quelldatensatz} other {# Quelldatensätze}}.", {count:sourceRecords})
            : t("organ.overview.sourceIntro", "Follow the source records supporting this page.", "Öffnen Sie die Quelldatensätze, auf denen diese Seite beruht.")}</p>
          {sourceLinks.length > 0 && <ul className="overview-source-links">{sourceLinks.map((source, index) => <li key={source.id + ":" + index}>
            {source.url ? <a href={source.url} target="_blank" rel="noreferrer">{source.source.replace(/^src:/, "")}</a> : source.source.replace(/^src:/, "")}
          </li>)}</ul>}
          {(organ.sources?.length || 0) > sourceLinks.length && <p className="overview-fact-attribution">{t("organ.overview.sourcePreview", "Showing {count, number} source links; the complete list is available below and under Sources and identifiers.", "Angezeigt werden {count, number} Quellenlinks. Die vollständige Liste finden Sie unten und unter „Quellen und Kennungen“.", {count:sourceLinks.length})}</p>}
          {tabLink("identifiers", t("organ.overview.openSources", "Sources and identifiers", "Quellen und Kennungen"))}
        </section>
      </div>
      {virtualCount > 0 && <div className="overview-related-shortcut">{tabLink("related", t("organ.overview.virtualCount", "{count, plural, one {# linked virtual instrument} other {# linked virtual instruments}}", "{count, plural, one {# verknüpftes virtuelles Instrument} other {# verknüpfte virtuelle Instrumente}}", {count:virtualCount}))}<span>{t("organ.overview.virtualIntro", "Inspect the retained relationship and edition.", "Prüfen Sie die erfasste Verknüpfung und Ausgabe.")}</span></div>}
    </section>

    {factCount > 0 && <section className="overview-facts" aria-labelledby={label + "-facts"}>
      <h3 id={label + "-facts"}>{t("organ.overview.facts", "Documented facts", "Dokumentierte Angaben")}</h3>
      <p>{t("organ.overview.factsIntro", "Source-backed summary values. Open each fact’s sources for its evidence and qualifications.", "Die Übersicht fasst quellenbasierte Angaben zusammen. Öffnen Sie die jeweiligen Quellen, um Belege und Einschränkungen zu prüfen.")}</p>
      <div className="quick-fact-grid">{facts}</div>
    </section>}

    <div className="overview-details" aria-label={t("organ.overview.moreAria", "More organ context and evidence", "Weiterer Kontext und Belege zur Orgel")}>
      {hasComparisons && <details className={"overview-disclosure" + (differing.length || technicalDifferences.length || actionScopeReview ? " overview-disclosure-differences" : "")}>
        <summary><span>{t("organ.overview.compare", "Compare source assertions", "Quellenangaben vergleichen")}<small>{t("organ.overview.comparedCount", "{count, plural, one {# compared fact} other {# compared facts}}", "{count, plural, one {# verglichene Angabe} other {# verglichene Angaben}}", {count:comparisonGroups.length + technicalGroups.length})}
          {differing.length > 0 && <> · {t("organ.overview.differences", "{count, plural, one {# fact differs} other {# facts differ}} between sources", "{count, plural, one {# Angabe weicht} other {# Angaben weichen}} zwischen Quellen ab", {count:differing.length})}</>}
          {technicalDifferences.length > 0 && <> · {t("organ.overview.technicalDifferences", "{count, plural, one {# technical field} other {# technical fields}} with differing assertions", "{count, plural, one {# technisches Feld} other {# technische Felder}} mit abweichenden Angaben", {count:technicalDifferences.length})}</>}
          {actionScopeReview && <> · {t("organ.overview.actionReview", "Action descriptions need comparison", "Angaben zur Traktur im Zusammenhang prüfen")}</>}</small></span></summary>
        <div className="overview-disclosure-body">{comparisons}</div>
      </details>}
      {moreFactCount > 0 && <details className="overview-disclosure">
        <summary><span>{t("organ.overview.moreFacts", "More documented facts", "Weitere dokumentierte Angaben")}<small>{t("organ.overview.moreFactCount", "{count, plural, one {# additional fact} other {# additional facts}} with source evidence", "{count, plural, one {# weitere Angabe} other {# weitere Angaben}} mit Quellenbelegen", {count:moreFactCount})}</small></span></summary>
        <div className="overview-disclosure-body"><div className="quick-fact-grid">{moreFacts}</div></div>
      </details>}
      {narrativeCount > 0 && <details className="overview-disclosure">
        <summary><span>{t("organ.overview.narrative", "Description and historical context", "Beschreibung und historischer Kontext")}<small>{t("organ.overview.narrativeCount", "{count, plural, one {# source description} other {# source descriptions}}", "{count, plural, one {# Quellenbeschreibung} other {# Quellenbeschreibungen}}", {count:narrativeCount})}</small></span></summary>
        <div className="overview-disclosure-body">{narrative}</div>
      </details>}
      <details className="overview-disclosure">
        <summary><span>{t("organ.overview.fullContext", "Full instrument and source context", "Weitere Angaben zum Instrument und seinen Quellen")}<small>{t("organ.overview.fullContextNote", "Account totals, recorded milestones and source links", "Summen laut Quellenbeschreibung, erfasste Ereignisse und Quellenlinks")}</small></span></summary>
        <div className="overview-disclosure-body">{accountContext}</div>
      </details>
    </div>
  </div>;
}
