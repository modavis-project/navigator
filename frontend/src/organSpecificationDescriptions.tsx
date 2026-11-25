import { useUiLocale, type UiText } from "./uiLocale";
import { actionReviewCopy, capturedStopSummary, specificationFieldLabel } from "./specificationLabels";
import { JsonEvidence } from "./JsonEvidence";
import { LoadingContent } from "./LoadingContent";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowLeftRight,
  BookOpen,
  Check,
  ChevronRight,
  Clock3,
  ExternalLink,
  Info,
  Link2,
  X,
} from "lucide-react";
import {
  fetchSpecificationDescription,
  type DescriptionEntry,
  type OrganDetail,
  type SpecificationDescription,
  type SpecificationDescriptionDetail,
} from "./api";
import "./organSpecificationDescriptions.css";
import { AccountFactDifference, SpecificationAccountComparison } from "./SpecificationAccountComparisonPanel";
import { accountRelatedReviews, buildAccountComparison, unmatchedStopEntryIds, type AccountComparisonField } from "./specificationAccountComparison";

import {
  descriptionComponent,
  specificationView,
  updateSpecificationView as updateView,
} from "./specificationNavigation";

const totalFamilies = new Set(["manual_total", "stop_total", "rank_total", "pipe_total", "stoplist_availability"]);

export function SourceReportedTotals({ facts, comparisonFields = [], onCompare = () => {} }: {
  facts: SpecificationDescriptionDetail["technicalFacts"];
  comparisonFields?: AccountComparisonField[];
  onCompare?: (family: string) => void;
}) {
  const { t } = useUiLocale();
  const totals = facts.filter((f) => totalFamilies.has(f.family));
  if (!totals.length) return null;
  return <section className="description-source-totals" aria-label={t("organ.spec.sourceReportedTotals.aria", "Source-reported specification totals", "Summen zur Disposition laut Quelle")}>
    <h4>{t("organ.spec.sourceReportedTotals.title", "Source-reported totals", "Summen laut Quelle")}</h4>
    <dl className="description-technical">
      {totals.map((f) => <div key={f.id}><dt>{specificationFieldLabel(t, f.family, f.label)}</dt><dd><span className="description-total-value">{f.value}</span>
        <AccountFactDifference field={comparisonFields.find(field => field.family === f.family)} onCompare={onCompare} />
        {f.qualificationGuidance && <p className="description-total-qualification">{f.qualificationGuidance}</p>}
        {(f.summaryEvidence || f.sourcePath || f.revision) && <details className="description-evidence-inline"><summary>{t("organ.spec.sourceReportedTotals.evidence", "Source evidence for this total", "Quellenbelege zu dieser Summe")}</summary>
          {f.sourcePath && <p>{t("organ.spec.sourceReportedTotals.field", "Source field:", "Quellenfeld:")} <code>{f.sourcePath}</code></p>}
          {f.revision && <p>{t("organ.spec.sourceReportedTotals.revision", "Fact revision:", "Revision der Angabe:")} <code>{f.revision}</code></p>}
          {(f.summaryEvidence?.evidence ?? []).map((span, index) => {
            const sourcePath = [span.sourcePath, span.path].find((path) => typeof path === "string" && path.trim().length > 0);
            const hasCharacterSpan = typeof span.start === "number" && typeof span.end === "number"
              && Number.isInteger(span.start) && Number.isInteger(span.end) && span.start >= 0 && span.end >= span.start;
            return <div key={index}>
              <blockquote style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{span.wording}</blockquote>
              {sourcePath && <p>{t("organ.spec.sourceReportedTotals.field", "Source field:", "Quellenfeld:")} <code>{sourcePath}</code></p>}
              {hasCharacterSpan && <p>{t("organ.spec.sourceReportedTotals.characters", "Characters", "Zeichen")} {span.start}–{span.end} {t("organ.spec.sourceReportedTotals.range", "(zero-based, end excluded).", "(nullbasiert, ohne Endposition).")}</p>}
            </div>;
          })}
          {f.summaryEvidence?.accountWording && <details><summary>{t("organ.spec.sourceReportedTotals.whole", "Complete retained source account wording", "Vollständiger erfasster Wortlaut der Quellenbeschreibung")}</summary>
            <blockquote style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", maxHeight: "28rem", overflow: "auto" }}>{f.summaryEvidence.accountWording}</blockquote>
          </details>}
          {f.summaryEvidence && <details><summary>{t("organ.spec.sourceReportedTotals.raw", "Raw source summary evidence", "Rohdaten zum Quellenbeleg")}</summary><JsonEvidence value={f.summaryEvidence} label={`${f.label} source evidence`}/></details>}
        </details>}
      </dd></div>)}
    </dl>
    <p className="description-footnote">{t("organ.spec.sourceReportedTotals.note", "Reported for this source account. Totals do not supply individual stops, divisions or pipe positions, or establish present condition.", "Die Summen gelten für diese Quellenbeschreibung. Sie geben keine einzelnen Register, Werke oder Pfeifenpositionen an und belegen nicht den heutigen Zustand.")}</p>
  </section>;
}

export function StopCountDifference({ description }: { description: SpecificationDescriptionDetail }) {
  const {t} = useUiLocale();
  // Missing captured rows are unavailable coverage, not an assertion that the total is zero.
  if (description.stopCount === 0) return null;
  const differences = description.technicalFacts.filter((fact) => fact.family === "stop_total"
    && !fact.qualificationGuidance && /^\d+$/.test(fact.value) && Number.isSafeInteger(Number(fact.value))
    && Number(fact.value) !== description.stopCount);
  if (!differences.length) return null;
  return <div className="description-count-difference" role="note">{differences.map((fact) => <p key={fact.id}>
    {t("organ.spec.stopCountDifference", "The source reports {value} {field}; this account has {captured}. Both are retained separately; a row count is not an independently reported organ total.", "{field} laut Quelle: {value}. In dieser Quellenbeschreibung: {captured}. Beide Angaben bleiben getrennt. Die Zahl der erfassten Einträge ist keine eigenständige Angabe zur Registerzahl der Orgel.", {value:fact.value,field:specificationFieldLabel(t,fact.family,fact.label.toLocaleLowerCase()),captured:capturedStopSummary(t,description)})}
  </p>)}</div>;
}

export function preferredSpecificationDescription(descriptions: SpecificationDescription[], requested: string | null) {
  return descriptions.find((description) => description.id === requested)
    ?? descriptions.find((description) => description.coverage !== "retained_source_transfer")
    ?? descriptions[0];
}

export function specificationSelectionIssue(descriptions: SpecificationDescription[], parameters: URLSearchParams): { message: string; recovery: "account" | "comparison" } | null {
  const recognized = ["tab", "description", "descriptionRevision", "compare", "compareRevision", "specificationView", "specificationSource", "component", "pipe"];
  const duplicated = recognized.filter((key) => parameters.getAll(key).length > 1);
  if (duplicated.length) return {
    message: `The link repeats ${duplicated.join(", ")}. Its intended specification view is ambiguous; no account has been substituted.`,
    recovery: duplicated.every((key) => key === "compare" || key === "compareRevision") ? "comparison" : "account",
  };
  const requested = parameters.get("description");
  const selected = preferredSpecificationDescription(descriptions, requested);
  if (!selected || (parameters.has("description") && !descriptions.some((description) => description.id === requested))) return {
    message: "The linked source account is unavailable in this dataset. No fallback account is displayed.", recovery: "account",
  };
  if (parameters.has("descriptionRevision") && !parameters.has("description")) return {
    message: "The link pins a description revision without identifying its source account. No account is displayed.", recovery: "account",
  };
  if (parameters.has("descriptionRevision") && parameters.get("descriptionRevision") !== selected.revision) return {
    message: "The linked description revision is unavailable in this dataset. Its current processing revision has not been substituted.", recovery: "account",
  };
  const comparison = descriptions.find((description) => description.id === parameters.get("compare"));
  if (parameters.has("compare") && (!comparison || comparison.id === selected.id)) return {
    message: comparison?.id === selected.id ? "The comparison link names the same source account twice. Choose a different account to compare."
      : "The linked comparison account is unavailable in this dataset. No replacement comparison is displayed.", recovery: "comparison",
  };
  if (parameters.has("compareRevision") && !parameters.has("compare")) return {
    message: "The link pins a comparison revision without identifying its source account. No comparison is displayed.", recovery: "comparison",
  };
  if (parameters.has("compareRevision") && parameters.get("compareRevision") !== comparison?.revision) return {
    message: "The linked comparison revision is unavailable in this dataset. Its current processing revision has not been substituted.", recovery: "comparison",
  };
  return null;
}

export function sourcePitchLabel(pitch: string | null) {
  return pitch ? /['’‘′]/.test(pitch) ? pitch : `${pitch}′` : "";
}

function sourceDatesConfiguration(description: SpecificationDescription) {
  return description.coverage !== "retained_source_transfer"
    && description.sortYear !== null && description.chronology?.configurationDateState.startsWith("explicit_")
    && Boolean(description.chronology.claims.length);
}

export function SourceAccountEvidence({ description }: { description: SpecificationDescription }) {
  const { t } = useUiLocale();
  const evidence = description.chronology;
  const retained = description.coverage === "retained_source_transfer";
  const recovered = evidence?.contract === "modavis.source-account-recovery/v1" && !retained;
  if (!retained && !recovered) return null;
  const unresolved = evidence?.unresolvedStoplistRowCount ?? 0;
  return <section aria-label={t("organ.spec.sourceAccountEvidence.title", "Source account coverage", "Erfassungsumfang der Quellenbeschreibung")}>
    {retained ? <p className="description-notice">{t("organ.spec.sourceAccountEvidence.transferred", "Original transferred rows are retained here. Their correspondence to each separately recovered source account is not established. Use the recovered accounts to inspect their own stoplists and dates.", "Die ursprünglich übertragenen Zeilen bleiben hier erhalten. Ihre Zuordnung zu den getrennt erschlossenen Quellenbeschreibungen ist nicht belegt. Deren Registerlisten und Datierungen finden Sie in der jeweiligen Beschreibung.")}</p>
      : <>
        <p>{t("organ.spec.sourceAccountEvidence.recovered", "Recovered from a separately bounded source account:", "Aus einer abgegrenzten Quellenbeschreibung erschlossen:")} <strong>{description.sourceHeading}</strong>.</p>
        {unresolved > 0 && <p className="description-notice">{t("organ.spec.sourceAccountEvidence.partialRows", "Partial stoplist recovery: {count, plural, one {# source row could} other {# source rows could}} not be interpreted as structured stops. The retained source evidence includes these rows; the listed count is not a complete register total.", "Die Registerliste konnte teilweise erschlossen werden. {count, plural, one {# Quelleneintrag ließ sich} other {# Quelleneinträge ließen sich}} nicht als strukturierte Registerangaben erfassen. Diese Einträge bleiben in den Quellenbelegen erhalten. Die Zahl der erfassten Einträge ist keine vollständige Registerzahl.", {count:unresolved})}</p>}
        <p className="muted">{t("organ.spec.sourceAccountEvidence.note", "This account does not establish complete recovery, shared physical pipes, or present condition.", "Diese Beschreibung belegt weder eine vollständige Erfassung noch gemeinsame physische Pfeifen oder den heutigen Zustand.")}</p>
      </>}
    {evidence && <details><summary>{t("organ.spec.sourceAccountEvidence.evidence", "Source account evidence", "Belege zur Quellenbeschreibung")}</summary>
      <JsonEvidence value={evidence} label={t("organ.spec.sourceAccountEvidence.evidence", "Source account evidence", "Belege zur Quellenbeschreibung")}/>
    </details>}
  </section>;
}

export function SourceAccountTotals({ description, comparisonFields = [], onCompare = () => {} }: {
  description: SpecificationDescription;
  comparisonFields?: AccountComparisonField[];
  onCompare?: (family: string) => void;
}) {
  const { t } = useUiLocale();
  const facts = description.chronology?.accountSourceFacts ?? [];
  if (!facts.length || description.coverage === "retained_source_transfer") return null;
  return <section className="description-source-totals" aria-label={t("organ.spec.sourceAccountTotals.title", "Totals reported in this source account", "Summen in dieser Quellenbeschreibung")}>
    <h4>{t("organ.spec.sourceAccountTotals.title", "Totals reported in this source account", "Summen in dieser Quellenbeschreibung")}</h4>
    <dl className="description-technical">{facts.map((fact, index) => <div key={`${fact.family}-${index}`}><dt>{specificationFieldLabel(t, fact.family, fact.label)}</dt><dd><span className="description-total-value">{fact.value}</span><AccountFactDifference field={comparisonFields.find(field => field.family === fact.family)} onCompare={onCompare} /></dd></div>)}</dl>
    <p className="description-footnote">{t("organ.spec.sourceAccountTotals.note", "Register and transmission figures retain their source scope; they are not added to each other or to the organ’s totals.", "Register- und Transmissionszahlen gelten im jeweiligen Quellenkontext. Sie werden weder miteinander noch mit Summen zur Orgel addiert.")}</p>
    <details className="description-evidence-inline"><summary>{t("organ.spec.sourceAccountTotals.wording", "Original total wording", "Ursprünglicher Wortlaut der Summe")}</summary>{facts.map((fact, index) => <blockquote key={index}>{fact.wording}</blockquote>)}</details>
  </section>;
}

export function SourceAccountQualification({ description }: { description: SpecificationDescription }) {
  const { t } = useUiLocale();
  const unresolved = description.chronology?.unresolvedStoplistRowCount ?? 0;
  return <div className="description-account-qualification" role="note">
    <p>{contextNote(t, description)}</p>
    {description.stopCount === 0 && <p className="description-coverage-warning">{t("organ.spec.sourceAccountQualification.noRows", "No captured stoplist: this source account has no structured stop rows. Its other components, reported facts and source evidence can still be available. This does not mean the organ has zero stops.", "Für diese Quellenbeschreibung sind keine strukturierten Registereinträge erfasst. Andere Bauteile, Angaben und Quellenbelege können verfügbar sein. Eine Registerzahl von null lässt sich daraus nicht ableiten.")}</p>}
    {unresolved > 0 ? <p className="description-coverage-warning">{t("organ.spec.sourceAccountQualification.partialRows", "Partial stoplist recovery: {count, plural, one {# source row could} other {# source rows could}} not be interpreted as structured stops. The listed count is not a complete register total.", "Die Registerliste konnte teilweise erschlossen werden. {count, plural, one {# Quelleneintrag ließ sich} other {# Quelleneinträge ließen sich}} nicht als strukturierte Registerangaben erfassen. Die Zahl der erfassten Einträge ist keine vollständige Registerzahl.", {count:unresolved})}</p>
      : ["partial", "partial_structured_stops"].includes(description.coverage) && <p className="description-coverage-warning">{t("organ.spec.sourceAccountQualification.partial", "The source identifies partial coverage.", "Die Quelle weist auf eine unvollständige Erfassung hin.")}</p>}
    {description.chronology?.sourceRelativeContext && <p>The source places this account <strong>{description.chronology.sourceRelativeContext.temporalRelation} {description.chronology.sourceRelativeContext.boundaryYear}</strong>; this boundary is not an exact configuration year.</p>}
    {description.chronology?.sourceDateQualification && <p>{t("organ.spec.sourceAccountQualification.intervention", "The source dates the account separately from an intervention whose year is not established by that wording.", "Die Quelle datiert die Beschreibung getrennt von einem Eingriff. Aus dem Wortlaut geht das Jahr des Eingriffs nicht hervor.")}</p>}
  </div>;
}

export function ConfigurationChronology({ description }: { description?: SpecificationDescription }) {
  const { t } = useUiLocale();
  const evidence = description?.chronology;
  if (!evidence || !description) return null;
  const captures = [...new Set(evidence.sourceObservations
    .filter((observation) => observation.kind === "source_retrieval")
    .map((observation) => observation.expression.match(/^\d{4}-\d{2}-\d{2}/)?.[0])
    .filter((date): date is string => Boolean(date)))].sort();
  const dated = sourceDatesConfiguration(description);
  return <section className="description-chronology" aria-label={t("organ.spec.configurationChronology.aria", "Configuration chronology", "Chronologie der Disposition")}>
    {dated ? <p>{t("organ.spec.configurationChronology.dated", "Configuration dated by the source:", "Datierung der Disposition laut Quelle:")} <strong>{description.periodLabel}</strong>. Present condition is not established.</p>
      : evidence.claims.length > 0 ? <p>{t("organ.spec.configurationChronology.dateWording", "Source date wording is retained below. A configuration date for this description is not established.", "Der Datierungswortlaut der Quelle ist unten wiedergegeben. Die Datierung der beschriebenen Disposition ist nicht belegt.")}</p>
        : <p>{t("organ.spec.configurationChronology.noDate", "A configuration date for this description is not established.", "Die Datierung der beschriebenen Disposition ist nicht belegt.")}</p>}
    {evidence.sourceDateQualification && <p>{t("organ.spec.configurationChronology.intervention", "The source dates the account and separately places it before or after an intervention. The intervention’s year is not established by that wording.", "Die Quelle datiert die Beschreibung und ordnet sie getrennt davon vor oder nach einem Eingriff ein. Aus dem Wortlaut geht das Jahr des Eingriffs nicht hervor.")}</p>}
    {evidence.sourceRelativeContext && <p>The source places this account <strong>{evidence.sourceRelativeContext.temporalRelation} {evidence.sourceRelativeContext.boundaryYear}</strong>. This is a historical boundary, not an exact configuration year.</p>}
    <details className="description-evidence-inline"><summary>{t("organ.spec.configurationChronology.details", "Dating evidence and source captures", "Datierungsbelege und Quellenabrufe")}</summary>
      {captures.length > 0 && <p>{t("organ.spec.configurationChronology.capture", "Latest recorded source capture:", "Letzter erfasster Quellenabruf:")} <time dateTime={captures[captures.length - 1]}>{captures[captures.length - 1]}</time>. This is an access date, not an organ survey date.</p>}
      {evidence.eventAssociations.map((association) => <p key={association.eventId}>
        <a href={`/events/${encodeURIComponent(association.eventId)}`}>{t("organ.spec.configurationChronology.event", "Related documented event", "Zugehörige dokumentierte Ereignisangabe")}</a>
        {" · "}{association.temporalRelation ? <>The source describes this account {association.temporalRelation} this event. An exact configuration date and a causal relationship are not established.</> : <>{t("organ.spec.configurationChronology.matches", "The source’s date and named context correspond; this does not establish that the event caused this configuration.", "Datierung und genannter Kontext der Quelle stimmen überein. Daraus lässt sich kein ursächlicher Zusammenhang mit der Disposition ableiten.")}</>}
      </p>)}
      {evidence.claims.map((claim, i) => <blockquote key={i}>{claim.wording}</blockquote>)}
      {evidence.sourceObservations.map((observation, i) => <p key={i}>{observation.kind === "source_retrieval" ? t("organ.spec.configurationChronology.retrieved", "Source retrieved", "Quellenabruf") : t("organ.spec.configurationChronology.observed", "Source observation", "Beobachtung zur Quelle")}: {observation.expression}. This does not establish the configuration’s date or present condition.</p>)}
      {evidence.eventAssociations.length === 0 && <p>{t("organ.spec.configurationChronology.none", "No event association is established by the available date and context.", "Die vorhandene Datierung und der Kontext belegen keine Zuordnung zu einem Ereignis.")}</p>}
    </details>
  </section>;
}

export function sourceAccountLabel(description: SpecificationDescription, accounts: SpecificationDescription[]) {
  const base = `${description.periodLabel} · ${description.source.source}`;
  const peers = accounts.filter((account) => account.periodLabel === description.periodLabel && account.source.source === description.source.source);
  if (peers.length < 2) return base;
  const heading = description.sourceHeading.trim();
  const sameHeading = peers.filter((account) => account.sourceHeading.trim() === heading);
  if (heading && sameHeading.length === 1) return `${base} · ${heading}`;
  let suffixLength = 8;
  while (suffixLength < description.id.length && sameHeading.some((account) => account.id !== description.id && account.id.slice(-suffixLength) === description.id.slice(-suffixLength))) suffixLength += 4;
  return `${base} · ${heading || "Source account"} · ${description.id.slice(-suffixLength)}`;
}

function subject(t: UiText, description: SpecificationDescription) {
  if (description.coverage === "retained_source_transfer") return t("organ.spec.subject.transfer", "Retained source transfer", "Übernommene Quelleneinträge");
  if (description.chronology?.contract === "modavis.source-account-recovery/v1") return t("organ.spec.subject.recovered", "Recovered source account", "Erschlossene Quellenbeschreibung");
  if (description.subjectKind === "earlier_instrument") return t("organ.spec.subject.earlier", "Earlier organ", "Frühere Orgel");
  if (description.realization === "proposed") return t("organ.spec.subject.proposed", "Proposed design", "Entwurf");
  return description.kind === "main"
    ? t("organ.spec.subject.main", "Main source description", "Erfasste Disposition")
    : t("organ.spec.subject.reported", "Documented description", "Dokumentierte Quellenbeschreibung");
}

function contextNote(t: UiText, d: SpecificationDescription) {
  if (d.coverage === "retained_source_transfer") return t("organ.spec.note.transfer", "The original transferred rows remain available. Their correspondence to the separately bounded source accounts is not established.", "Die ursprünglich übertragenen Zeilen bleiben verfügbar. Ihre Zuordnung zu den getrennt abgegrenzten Quellenbeschreibungen ist nicht belegt.");
  if (d.subjectKind === "earlier_instrument")
    return t("organ.spec.note.earlier", "This list describes an earlier instrument. Its connection to the organ in this record remains unresolved.", "Diese Liste beschreibt ein früheres Instrument. Sein Zusammenhang mit der hier erfassten Orgel ist ungeklärt.");
  if (d.realization === "proposed")
    return t("organ.spec.note.proposed", "The source presents a proposed design. This list does not establish that the design was built.", "Die Quelle zeigt einen Entwurf. Ob er ausgeführt wurde, geht aus dieser Liste nicht hervor.");
  if (d.kind === "main")
    return sourceDatesConfiguration(d) ? t("organ.spec.note.mainDated", "The source explicitly dates this configuration account. Present condition and continuous validity are not established.", "Die Quelle datiert die Beschreibung der Disposition ausdrücklich. Der heutige Zustand und eine durchgehende Gültigkeit sind damit nicht belegt.") : t("organ.spec.note.mainUndated", "The source’s main listing. Its complete survey date and present condition are not established by this description.", "Dies ist die Hauptliste der Quelle. Ein vollständiges Aufnahmedatum und der heutige Zustand gehen aus dieser Beschreibung nicht hervor.");
  if (d.timeKind === "document_date")
    return t("organ.spec.note.documentDate", "The date belongs to the source document. It does not necessarily date the instrument’s configuration.", "Das Datum bezieht sich auf das Quelldokument. Es datiert die Disposition des Instruments nicht zwangsläufig.");
  if (d.timeKind === "relative")
    return t("organ.spec.note.relative", "The source dates this description relative to another account or event. Exact validity boundaries remain unspecified.", "Die Quelle datiert diese Beschreibung im Verhältnis zu einer anderen Beschreibung oder einem Ereignis. Der genaue Geltungszeitraum bleibt offen.");
  if (d.timeKind === "source_listing" && d.sortYear === null) return t("organ.spec.note.undated", "A separately attributed source account. Its configuration date and present condition are not established.", "Diese Quellenbeschreibung ist gesondert zugeordnet. Die Datierung der beschriebenen Disposition und der heutige Zustand sind nicht belegt.");
  return t("organ.spec.note.separate", "A separately attributed source description. Its date does not imply that every component remained unchanged between documented periods.", "Diese Quellenbeschreibung ist gesondert zugeordnet. Ihre Datierung belegt nicht, dass alle Bauteile zwischen den dokumentierten Zeiträumen unverändert blieben.");
}

function OriginalSource({
  description,
}: {
  description: SpecificationDescription;
}) {
  return description.source.url ? (
    <a
      className="description-source-link"
      href={description.source.url}
      target="_blank"
      rel="noreferrer"
    >
      {description.source.source} <ExternalLink size={14} aria-hidden="true" />
    </a>
  ) : (
    <span>{description.source.source}</span>
  );
}

export function DescriptionEvidence({ description }: { description: SpecificationDescription }) {
  const { t } = useUiLocale();
  return <details className="description-disclosure description-account-evidence">
    <summary>{t("organ.spec.descriptionEvidence.title", "Source, dating and revision evidence", "Quellen-, Datierungs- und Revisionsbelege")} <span>{description.source.source}</span></summary>
    <p className="description-source-heading">{description.sourceHeading}</p>
    <ConfigurationChronology description={description} />
    <SourceAccountEvidence description={description} />
    <p>{contextNote(t, description)} {[
      "partial", "partial_structured_stops",
    ].includes(description.coverage) ? t("organ.spec.descriptionEvidence.partial", "The source identifies partial coverage.", "Die Quelle weist auf eine unvollständige Erfassung hin.") : t("organ.spec.descriptionEvidence.unknown", "Completeness beyond the captured source entries is unspecified.", "Der Umfang über die erfassten Quelleneinträge hinaus ist offen.")}</p>
    <OriginalSource description={description} />
    <dl>
      <dt>{t("organ.spec.descriptionEvidence.record", "Source record", "Quelldatensatz")}</dt><dd><code>{description.source.id}</code></dd>
      <dt>{t("organ.spec.descriptionEvidence.account", "Source account", "Quellenbeschreibung")}</dt><dd><code>{description.id}</code></dd>
      <dt>{t("organ.spec.descriptionEvidence.descriptionRevision", "Description revision", "Revision der Beschreibung")}</dt><dd><code>{description.revision}</code></dd>
      <dt>{t("organ.spec.descriptionEvidence.sourceRevision", "Source revision", "Quellenrevision")}</dt><dd><code>{description.sourceRevision}</code></dd>
      <dt>{t("organ.spec.descriptionEvidence.locations", "Evidence locations", "Fundstellen der Belege")}</dt>
      {description.sourcePaths.map((path) => <dd key={path}><code>{path}</code></dd>)}
    </dl>
  </details>;
}

export function filterDescriptionStops(groups: SpecificationDescriptionDetail["groups"], query: string) {
  const needle = query.normalize("NFC").toLocaleLowerCase().trim();
  return groups.map((group) => ({ ...group, entries: group.entries.filter((entry) => entry.kind === "stop"
    && (!needle || `${entry.label} ${sourcePitchLabel(entry.pitch)}`.normalize("NFC").toLocaleLowerCase().includes(needle))) }))
    .filter((group) => group.entries.length > 0);
}

// Session-only presentation state survives account → component → Back remounts.
// It is deliberately separate from URL pins and research selection membership.
const stopFilterQueries = new Map<string, string>();
const stopFilterLimit = 20;

function recalledStopFilter(key: string) {
  const query = stopFilterQueries.get(key) ?? "";
  if (query) {
    stopFilterQueries.delete(key);
    stopFilterQueries.set(key, query);
  }
  return query;
}

export function DescriptionStoplist({ organId, description, renderEntries }: {
  organId: string;
  description: SpecificationDescriptionDetail;
  renderEntries: (description: SpecificationDescriptionDetail, group: SpecificationDescriptionDetail["groups"][number]) => ReactNode;
}) {
  const { t } = useUiLocale();
  const filterKey = JSON.stringify([organId, description.id, description.revision]);
  const [query, setQuery] = useState(() => recalledStopFilter(filterKey));
  const filterInput = useRef<HTMLInputElement>(null);
  function changeQuery(next: string) {
    stopFilterQueries.delete(filterKey);
    if (next.trim()) {
      stopFilterQueries.set(filterKey, next);
      while (stopFilterQueries.size > stopFilterLimit) stopFilterQueries.delete(stopFilterQueries.keys().next().value!);
    }
    setQuery(next);
  }
  const groups = filterDescriptionStops(description.groups, query);
  const total = description.groups.reduce((sum, group) => sum + group.entries.filter((entry) => entry.kind === "stop").length, 0);
  const shown = groups.reduce((sum, group) => sum + group.entries.length, 0);
  return <section className="description-stoplist" id="source-account-stoplist" tabIndex={-1} aria-label={t("organ.spec.descriptionStoplist.aria", "Stoplist from this source account", "Registerliste aus dieser Quellenbeschreibung")}>
    <div className="description-list-heading"><h4>{t("organ.spec.descriptionStoplist.title", "Stoplist", "Registerliste")}</h4><span>{t("organ.spec.descriptionStoplist.select", "Select a stop for details and source evidence", "Register auswählen, um Details und Quellenbelege anzuzeigen")}</span></div>
    {total > 0 && <div className="description-stop-filter">
      <label htmlFor="description-stop-search">{t("organ.spec.descriptionStoplist.filter", "Find a stop in this account", "Register in dieser Quellenbeschreibung suchen")}</label>
      <div><input ref={filterInput} id="description-stop-search" type="search" value={query} placeholder={t("organ.spec.descriptionStoplist.placeholder", "Stop name or pitch", "Registername oder Tonhöhenangabe")} aria-controls="description-stoplist-results" onChange={(event) => changeQuery(event.target.value)} />
        {query && <button type="button" onClick={() => { changeQuery(""); filterInput.current?.focus(); }}>{t("organ.spec.descriptionStoplist.clear", "Clear", "Zurücksetzen")}</button>}</div>
      <span role="status">{query.trim() ? t("organ.spec.stopFilter.count", "{shown, number} of {total, number} listed entries shown. Source totals are unchanged.", "Angezeigt: {shown, number} von {total, number} erfassten Einträgen. Die Summen laut Quelle bleiben unverändert.", {shown,total}) : t("organ.spec.descriptionStoplist.note", "Filters this account only; source wording is preserved.", "Der Filter gilt für diese Quellenbeschreibung. Der Quellenwortlaut bleibt unverändert.")}</span>
    </div>}
    <div id="description-stoplist-results">
      {groups.length ? <div className="description-divisions">
        {groups.map((group, index) => <section key={`${group.label}-${index}`} aria-label={group.label}>
          <header><div><h4>{group.label}</h4><span>{query.trim() ? t("organ.spec.stopFilter.group", "{count, number} shown", "{count, number} angezeigt", {count:group.entries.length}) : t("organ.spec.stopFilter.groupCount", "{count, plural, one {# stop} other {# stops}}", "{count, plural, one {# Register} other {# Register}}", {count:group.entries.length})}</span></div>
            {group.compass && <small>{t("organ.spec.descriptionStoplist.compass", "Source compass ·", "Tonumfang laut Quelle ·")} {group.compass}</small>}
          </header>
          {renderEntries(description, group)}
        </section>)}
      </div> : <p className="description-empty">{total > 0 ? t("organ.spec.descriptionStoplist.noMatch", "No stop names or pitches match this filter. Clear it to see the complete captured list.", "Keine Registernamen oder Tonhöhenangaben entsprechen dem Filter. Setzen Sie ihn zurück, um die gesamte erfasste Liste zu sehen.")
        : t("organ.spec.descriptionStoplist.noRows", "No structured stop entries were captured for this source account. Reported facts and source evidence are retained separately where available; this does not mean the organ has no stops.", "Für diese Quellenbeschreibung sind keine strukturierten Registereinträge erfasst. Angaben und Quellenbelege bleiben, soweit verfügbar, separat erhalten. Daraus lässt sich keine Registerzahl von null ableiten.")}</p>}
    </div>
  </section>;
}

export function DescriptionHistory({
  descriptions,
}: {
  descriptions: SpecificationDescription[];
}) {
  const { t } = useUiLocale();
  const historical = descriptions.filter((d) => d.kind === "alternative");
  if (!historical.length) return null;
  return (
    <section
      className="description-history"
      aria-label={t("organ.spec.descriptionHistory.aria", "Specification descriptions in history", "Quellenbeschreibungen zur Disposition im Geschichtsverlauf")}
    >
      <h3>{t("organ.spec.descriptionHistory.title", "Documented specifications", "Dokumentierte Dispositionen")}</h3>
      <p>
        Open a source description alongside the event history. These accounts do
        not establish continuous physical states.
      </p>
      <div>
        {historical.map((d) => (
          <button
            key={d.id}
            type="button"
            onClick={() =>
              updateView({
                tab: "specification",
                specificationView: null,
                specificationSource: null,
                description: d.id,
                descriptionRevision: null,
                compare: null,
                compareRevision: null,
                component: null,
                pipe: null,
              })
            }
          >
            <strong>{d.periodLabel}</strong>
            <span>
              {subject(t, d)} · {capturedStopSummary(t, d)}
            </span>
            <small>{d.source.source}</small>
            <ChevronRight size={16} aria-hidden="true" />
          </button>
        ))}
      </div>
    </section>
  );
}

export function OrganSpecificationDescriptions({
  organ,
  components,
}: {
  organ: OrganDetail;
  components: ReactNode;
}) {
  const { t } = useUiLocale();
  const organId = organ.id;
  const descriptions = [...(organ.specificationDescriptions ?? [])].sort((a, b) => Number(a.coverage === "retained_source_transfer") - Number(b.coverage === "retained_source_transfer"));
  const [query, setQuery] = useState(window.location.search);
  const parameters = new URLSearchParams(query);
  const view = specificationView(parameters);
  const requested = parameters.get("description");
  const surface = useRef<HTMLDivElement>(null);
  const selected =
    preferredSpecificationDescription(descriptions, requested);
  const comparison = descriptions.find(
    (d) => d.id === parameters.get("compare") && d.id !== selected?.id,
  );
  const selectionIssue = specificationSelectionIssue(descriptions, parameters);
  const [data, setData] = useState<SpecificationDescriptionDetail | null>(null);
  const [otherData, setOtherData] =
    useState<SpecificationDescriptionDetail | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [notice, setNotice] = useState<"copied" | "copyManually" | "">("");
  const [allComparisonOpen, setAllComparisonOpen] = useState(false);
  const [comparisonFocusFamily, setComparisonFocusFamily] = useState<string | null>(null);
  const allComparisonButton = useRef<HTMLButtonElement>(null);
  const [evidence, setEvidence] = useState<{
    entry: DescriptionEntry;
    description: SpecificationDescriptionDetail;
    division: string;
  } | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const cache = useRef(new Map<string, SpecificationDescriptionDetail>());
  const main = useRef<HTMLDivElement>(null);
  const comparisonAccounts = descriptions.map(description => {
    const loaded = [data, otherData].find(detail => detail?.id === description.id && detail.revision === description.revision);
    return loaded ?? description;
  });
  const comparisonFields = buildAccountComparison(comparisonAccounts);
  const relatedReviews = accountRelatedReviews(comparisonAccounts);

  function compareAllAccounts(family: string | null = null) {
    setComparisonFocusFamily(family);
    setAllComparisonOpen(true);
  }
  function closeAllComparison() {
    setAllComparisonOpen(false);
    allComparisonButton.current?.focus();
  }

  useEffect(() => {
    const sync = () => setQuery(window.location.search);
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);
  useEffect(() => {
    let active = true;
    setData(null);
    setOtherData(null);
    setError("");
    setEvidence(null);
    if (selectionIssue || view === "components") return;
    async function get(d: SpecificationDescription) {
      const key = `${organId}|${d.id}|${d.revision}`;
      const cached = cache.current.get(key);
      if (cached) return cached;
      const loaded = await fetchSpecificationDescription(organId, d);
      if (cache.current.size >= 12)
        cache.current.delete(cache.current.keys().next().value!);
      cache.current.set(key, loaded);
      return loaded;
    }
    Promise.all([
      get(selected),
      comparison ? get(comparison) : Promise.resolve(null),
    ])
      .then(([first, second]) => {
        if (active) {
          setData(first);
          setOtherData(second);
        }
      })
      .catch((e: Error) => {
        if (active)
          setError(e.message || "The description could not be loaded.");
      });
    return () => {
      active = false;
    };
  }, [
    organId,
    view,
    selected?.id,
    selected?.revision,
    comparison?.id,
    comparison?.revision,
    selectionIssue?.message,
    attempt,
  ]);
  useEffect(() => {
    if (evidence) dialog.current?.showModal();
    else dialog.current?.close();
  }, [evidence]);

  function select(id: string) {
    setAllComparisonOpen(false);
    updateView({
      specificationView: null,
      specificationSource: null,
      description: id,
      descriptionRevision: null,
      compare: null,
      compareRevision: null,
      component: null,
      pipe: null,
    });
    if (main.current && window.scrollY > main.current.offsetTop)
      main.current.scrollIntoView({ block: "start" });
  }
  async function copy() {
    const url = new URL(window.location.href);
    url.searchParams.set("description", selected.id);
    url.searchParams.set("descriptionRevision", selected.revision);
    if (comparison)
      url.searchParams.set("compareRevision", comparison.revision);
    else {
      url.searchParams.delete("compare");
      url.searchParams.delete("compareRevision");
    }
    try {
      await navigator.clipboard.writeText(url.href);
      setNotice("copied");
    } catch {
      window.history.replaceState(null, "", url.href);
      setNotice("copyManually");
    }
  }
  function openEntry(
    d: SpecificationDescriptionDetail,
    entry: DescriptionEntry,
    division: string,
  ) {
    const target = descriptionComponent(organ, d, entry);
    if (target) {
      updateView({
        specificationView: "components",
        specificationSource: target.sourceId,
        component: target.component.id,
        pipe: null,
      });
    } else {
      setEvidence({ entry, description: d, division });
    }
  }
  function changeView(next: "descriptions" | "components") {
    updateView({
      specificationView: next === "components" ? next : null,
      component: null,
      pipe: null,
    });
    surface.current?.scrollIntoView({ block: "start" });
  }
  function entries(
    d: SpecificationDescriptionDetail,
    group: SpecificationDescriptionDetail["groups"][number],
    unmatched?: Set<string>,
  ) {
    return (
      <ul className="description-stops">
        {group.entries
          .filter((e) => e.kind === "stop")
          .map((e) => {
            const different = Boolean(unmatched?.has(e.id));
            return (
              <li key={e.id}>
                <button
                  className={different ? "description-difference" : ""}
                  type="button"
                  onClick={() => openEntry(d, e, group.label)}
                  aria-label={`${descriptionComponent(organ, d, e) ? "Stop details" : "Source details"}: ${e.label}${e.pitch ? ` ${sourcePitchLabel(e.pitch)}` : ""}, ${d.periodLabel}, ${group.label}${different ? ". This wording occurrence is not matched in the other account" : ""}`}
                >
                  <span>
                    {e.label}
                    {different && <small className="description-entry-difference-label">{t("organ.spec.unmatched", "Wording not matched", "Quellenwortlaut ohne Übereinstimmung")}</small>}
                  </span>
                  <strong>{sourcePitchLabel(e.pitch)}</strong>
                </button>
              </li>
            );
          })}
      </ul>
    );
  }
  const stopGroups =
    data?.groups.filter((g) => g.entries.some((e) => e.kind === "stop")) ?? [];
  const comparisonNames =
    data && otherData
      ? [
          ...new Set(
            [...data.groups, ...otherData.groups]
              .filter((g) => g.entries.some((e) => e.kind === "stop"))
              .map((g) => (g.label === "Pedaal" ? "Pedal" : g.label)),
          ),
        ]
      : [];
  const auxiliaries =
    data?.groups.flatMap((g) =>
      g.entries
        .filter((e) => e.kind !== "stop")
        .map((entry) => ({ entry, division: g.label })),
    ) ?? [];
  const repeatedDivisions = [data, otherData].some((d) => {
    const names =
      d?.groups
        .filter((g) => g.entries.some((e) => e.kind === "stop"))
        .map((g) => (g.label === "Pedaal" ? "Pedal" : g.label)) ?? [];
    return new Set(names).size !== names.length;
  });
  const hasConflicts = Boolean(
    organ.technicalEvidence?.materialConflictCount ||
    organ.technicalEvidence?.facts?.some((f) =>
      f.conflictState.startsWith("material"),
    ) ||
    [
      organ.componentHierarchy,
      ...(organ.sourceSpecifications ?? []).map((s) => s.componentHierarchy),
    ]
      .flat(2)
      .some((g) =>
        g.items.some((c) =>
          c.sourceComparison?.fields.some((f) => f.status === "conflicting"),
        ),
      ),
  );

  if (selectionIssue) return <div className="specification-workspace description-selection-refusal" role="alert">
    <h3>{t("organ.spec.linkIssue", "This specification link needs attention", "Der Link zur Disposition kann so nicht geöffnet werden")}</h3>
    <p lang="en">{selectionIssue.message}</p>
    {selectionIssue.recovery === "comparison" ? <button type="button" onClick={() => updateView({ compare: null, compareRevision: null })}>{t("organ.spec.clearComparison", "Clear comparison", "Vergleich zurücksetzen")}</button>
      : selected && <><p>{t("organ.spec.available", "Available account:", "Verfügbare Quellenbeschreibung:")} <strong>{sourceAccountLabel(selected, descriptions)}</strong>. {t("organ.spec.openAvailableNote", "Opening it uses the revision available in this dataset.", "Beim Öffnen wird die in diesem Datensatz verfügbare Revision verwendet.")}</p>
        <button type="button" onClick={() => updateView({ tab: "specification", specificationView: null, specificationSource: null,
          description: selected.id, descriptionRevision: selected.revision, compare: null, compareRevision: null, component: null, pipe: null })}>{t("organ.spec.openAvailable", "Open available account", "Verfügbare Quellenbeschreibung öffnen")}</button></>}
  </div>;

  return (
    <div className="specification-workspace" ref={surface}>
      <div
        className="specification-view-switch"
        role="group"
        aria-label={t("organ.spec.view", "Specification view", "Ansicht der Disposition")}
      >
        <button
          type="button"
          aria-pressed={view === "descriptions"}
          onClick={() => changeView("descriptions")}
        >
          <BookOpen size={17} aria-hidden="true" /> {t("organ.spec.accounts", "Source accounts", "Quellenbeschreibungen")}
        </button>
        <button
          type="button"
          aria-pressed={view === "components"}
          onClick={() => changeView("components")}
        >
          {t("organ.spec.componentsButton", "Components & source evidence", "Bauteile und Quellenbelege")}
          {hasConflicts && (
            <span className="specification-differences">
              {t("organ.spec.differences", "Source differences", "Abweichende Quellenangaben")}
            </span>
          )}
        </button>
      </div>
      {view === "components" ? (
        <div className="specification-record-evidence">
          <header>
            <h3>{t("organ.spec.components", "Components and source evidence", "Bauteile und Quellenbelege")}</h3>
            <p>
              {t("organ.spec.componentIntro", "Explore full stop details, keyboards, pipe positions, tuning, and differences between sources. Each component set retains its own source. This evidence is not assigned to the selected historical description.", "Hier finden Sie Angaben zu Registern, Klaviaturen, Pfeifenpositionen und Stimmung sowie Unterschiede zwischen den Quellen. Jede Bauteilgruppe bleibt ihrer Quelle zugeordnet. Diese Belegdaten sind der ausgewählten historischen Beschreibung nicht zugewiesen.")}
            </p>
            <button type="button" onClick={() => changeView("descriptions")}>
              {comparison ? t("organ.spec.returnComparison", "Return to account comparison", "Zurück zum Vergleich der Quellenbeschreibungen") : t("organ.spec.returnAccount", "Return to {account}", "Zurück zur Quellenbeschreibung „{account}“", {account:selected.periodLabel})}
            </button>
          </header>
          {descriptions.some((description) => description.coverage === "retained_source_transfer") && <p className="description-notice">{t("organ.spec.transfers", "This view includes retained source transfers. Their rows are not assigned to the separately recovered accounts. Open Source accounts to inspect each recovered stoplist and its source date.", "Diese Ansicht enthält übertragene Quelleneinträge. Die Zeilen sind den getrennt erschlossenen Quellenbeschreibungen nicht zugeordnet. Deren Registerlisten und Datierungen finden Sie unter „Quellenbeschreibungen“.")}</p>}
          {components}
        </div>
      ) : (
        <div className={`organ-descriptions${descriptions.length === 1 ? " description-single-account" : ""}`}>
          {descriptions.length > 1 && <aside
            className="description-sidebar"
            aria-label={t("organ.spec.accounts", "Source accounts", "Quellenbeschreibungen")}
          >
            <header>
              {t("organ.spec.accounts", "Source accounts", "Quellenbeschreibungen")} <span>{descriptions.length}</span>
            </header>
            {descriptions.map((d) => (
              <button
                key={d.id}
                type="button"
                className="description-option"
                aria-pressed={selected.id === d.id}
                aria-label={`${sourceAccountLabel(d, descriptions)} · ${subject(t, d)} · ${capturedStopSummary(t, d)}`}
                title={sourceAccountLabel(d, descriptions)}
                onClick={() => select(d.id)}
              >
                <strong>
                  {d.periodLabel}
                  {selected.id === d.id && (
                    <Check size={16} aria-hidden="true" />
                  )}
                </strong>
                <span>{d.source.source}</span>
                {sourceAccountLabel(d, descriptions) !== `${d.periodLabel} · ${d.source.source}` && <span className="description-option-distinction">{sourceAccountLabel(d, descriptions).slice(`${d.periodLabel} · ${d.source.source} · `.length)}</span>}
                <small>
                  {capturedStopSummary(t, d)} · {subject(t, d)}
                </small>
              </button>
            ))}
            <p className="description-reading-note">
              {t("organ.spec.accountDateNote", "Dates identify source descriptions. They do not establish uninterrupted material identity or continuous validity.", "Datierungen kennzeichnen die jeweilige Quellenbeschreibung. Sie belegen weder einen ununterbrochenen Fortbestand der Bausubstanz noch eine durchgehende Gültigkeit.")}
            </p>
          </aside>}
          <div className="description-main" ref={main}>
            {descriptions.length > 1 && <div className="description-mobile-selector">
              <label htmlFor="organ-description">{t("organ.spec.account", "Source account", "Quellenbeschreibung")}</label>
              <select
                id="organ-description"
                value={selected.id}
                onChange={(e) => select(e.target.value)}
              >
                {descriptions.map((d) => (
                  <option value={d.id} key={d.id}>
                    {sourceAccountLabel(d, descriptions)} · {subject(t, d)} · {capturedStopSummary(t, d)}
                  </option>
                ))}
              </select>
            </div>}
            <header className="description-heading">
              <div>
                <span className={`description-badge ${selected.kind}`}>
                  {selected.kind === "main" ? (
                    <BookOpen size={15} aria-hidden="true" />
                  ) : (
                    <Clock3 size={15} aria-hidden="true" />
                  )}
                  {comparison ? t("organ.spec.comparison", "Comparison", "Vergleich") : subject(t, selected)}
                </span>
                <h3>
                  {comparison
                    ? t("organ.spec.compare", "Compare source accounts", "Quellenbeschreibungen vergleichen")
                    : selected.periodLabel}
                </h3>
                <p>
                  {selected.source.source} ·{" "}
                  {selected.kind === "main"
                    ? t("organ.spec.listing", "Source listing", "Erfasste Disposition")
                    : t("organ.spec.historical", "Historical or alternative account", "Historische oder alternative Quellenbeschreibung")}
                </p>
              </div>
              <div className="description-actions">
                {!comparison && data?.id === selected.id && data.revision === selected.revision && <a href="#source-account-stoplist">{data.stopCount > 0 ? t("organ.spec.goStoplist", "Go to stoplist", "Zur Registerliste") : t("organ.spec.coverage", "Stoplist coverage", "Erfassungsumfang der Registerliste")}</a>}
                {descriptions.length > 1 && <button ref={allComparisonButton} type="button" aria-expanded={allComparisonOpen} aria-controls="source-account-comparison" onClick={() => allComparisonOpen ? closeAllComparison() : compareAllAccounts()}>
                  <ArrowLeftRight size={16} aria-hidden="true" /> {t("organ.spec.compareAll", "Compare all {count, number} accounts", "Alle {count, number} Quellenbeschreibungen vergleichen", {count:descriptions.length})}
                </button>}
                {descriptions.length > 1 && (
                  <button
                    type="button"
                    onClick={() =>
                      updateView({
                        description: selected.id,
                        compare: comparison
                          ? null
                          : descriptions.find((d) => d.id !== selected.id)!.id,
                        compareRevision: null,
                        component: null,
                        pipe: null,
                      })
                    }
                  >
                    <ArrowLeftRight size={16} aria-hidden="true" />
                    {comparison ? t("organ.spec.back", "Back to stoplist", "Zurück zur Registerliste") : t("organ.spec.compareStoplists", "Compare stoplists", "Registerlisten vergleichen")}
                  </button>
                )}
                <button
                  type="button"
                  onClick={copy}
                  aria-label={t("organ.spec.copy", "Copy link to selected account and revision", "Link zur ausgewählten Quellenbeschreibung und Revision kopieren")}
                  title={t("organ.spec.copy", "Copy link to selected account and revision", "Link zur ausgewählten Quellenbeschreibung und Revision kopieren")}
                >
                  <Link2 size={16} aria-hidden="true" />
                </button>
              </div>
            </header>
            <span className="description-announcement" role="status">
              {notice === "copied" ? t("organ.spec.copied", "View link copied.", "Link zur Ansicht kopiert.") : notice === "copyManually" ? t("organ.spec.copyManually", "Copy the address bar to link to this view.", "Kopieren Sie die Adresse aus der Adressleiste, um diese Ansicht zu verlinken.") : null}
            </span>
            {!allComparisonOpen && relatedReviews.map(review => <div className="description-related-review" role="note" key={review.id}>
              <div><strong>{actionReviewCopy(t, review).label}</strong><p>{actionReviewCopy(t, review).explanation}</p></div>
              <button type="button" onClick={() => compareAllAccounts(review.id)}>{t("organ.spec.review", "Review action descriptions", "Angaben zur Traktur prüfen")}</button>
            </div>)}
            <SpecificationAccountComparison accounts={comparisonAccounts} fields={comparisonFields} selectedId={selected.id}
              accountLabel={account => sourceAccountLabel(account, descriptions)} focusFamily={comparisonFocusFamily}
              open={allComparisonOpen} onClose={closeAllComparison} onAccount={select} onFocusFamily={setComparisonFocusFamily}
              onStoplists={id => {
                const other = descriptions.find(description => description.id === id)!;
                setAllComparisonOpen(false);
                updateView({ description: selected.id, descriptionRevision: selected.revision, compare: other.id, compareRevision: other.revision,
                  specificationView: null, specificationSource: null, component: null, pipe: null });
              }} />
            {comparison && (
              <div className="description-compare-control">
                <label htmlFor="comparison-description">
                  {t("organ.spec.compareWith", "Compare {account} with", "„{account}“ vergleichen mit", {account:sourceAccountLabel(selected, descriptions)})}
                </label>
                <select
                  id="comparison-description"
                  value={comparison.id}
                  onChange={(e) =>
                    updateView({
                      compare: e.target.value,
                      compareRevision: null,
                    })
                  }
                >
                  {descriptions
                    .filter((d) => d.id !== selected.id)
                    .map((d) => (
                      <option key={d.id} value={d.id}>
                        {sourceAccountLabel(d, descriptions)} · {subject(t, d)}
                      </option>
                    ))}
                </select>
              </div>
            )}
            {comparison ? <div className="description-notice">
              <Info size={17} aria-hidden="true" />
              <span>{t("organ.spec.highlights", "Highlights identify wording occurrences that cannot be matched in the other captured list, including additional repeated rows. A difference does not establish when a physical stop was added, removed, or replaced. No stoplist differences are inferred against an account with no captured stop rows.", "Hervorgehoben sind Wortlautvorkommen ohne Entsprechung in der anderen erfassten Liste, einschließlich zusätzlicher Wiederholungen. Daraus lässt sich nicht ableiten, wann ein physisches Register hinzugefügt, entfernt oder ersetzt wurde. Bei einer Quellenbeschreibung ohne erfasste Registereinträge werden keine Unterschiede zur Registerliste abgeleitet.")}</span>
            </div> : <SourceAccountQualification description={selected} />}
            {error ? (
              <div role="alert" className="description-error">
                <p>{t("organ.spec.loadError", "The source description could not be loaded.", "Die Quellenbeschreibung konnte nicht geladen werden.")} <span lang="en">{error}</span></p>
                <button type="button" onClick={() => setAttempt((n) => n + 1)}>
                  {t("organ.spec.retry", "Retry description", "Beschreibung erneut laden")}
                </button>
              </div>
            ) : !data ||
              data.id !== selected.id ||
              data.revision !== selected.revision ||
              (comparison &&
                (!otherData ||
                  otherData.id !== comparison.id ||
                  otherData.revision !== comparison.revision)) ? (
              <LoadingContent kind="table" label={t("organ.spec.loading", "Loading source description…", "Quellenbeschreibung wird geladen …")} />
            ) : (
              <>
                {comparison && otherData ? (
                  <>
                    <div className="description-compare-summary">
                      {[data, otherData].map((d) => (
                        <div key={d.id}>
                          <span>{sourceAccountLabel(d, descriptions)}</span>
                          <strong>
                            {capturedStopSummary(t, d)}
                          </strong>
                          <small>
                            {subject(t, d)} · {d.source.source}
                          </small>
                          <SourceAccountQualification description={d} />
                          <StopCountDifference description={d} />
                          <SourceAccountTotals description={d} comparisonFields={comparisonFields} onCompare={compareAllAccounts} />
                          <SourceReportedTotals facts={d.technicalFacts} comparisonFields={comparisonFields} onCompare={compareAllAccounts} />
                        </div>
                      ))}
                    </div>
                    {repeatedDivisions ? (
                      <>
                        <p className="description-notice">
                          Some division names repeat. Every group is shown
                          separately; automatic alignment and difference
                          highlighting are unavailable for these lists.
                        </p>
                        <div className="description-unaligned">
                          {[data, otherData].map((d) => (
                            <section key={d.id}>
                              <h4>{d.periodLabel}</h4>
                              {d.groups
                                .filter((g) =>
                                  g.entries.some((e) => e.kind === "stop"),
                                )
                                .map((g, i) => (
                                  <section key={i}>
                                    <h4>{g.label}</h4>
                                    {entries(d, g)}
                                  </section>
                                ))}
                            </section>
                          ))}
                        </div>
                      </>
                    ) : (
                      comparisonNames.map((name) => {
                        const group = (d: SpecificationDescriptionDetail) =>
                          d.groups.find(
                            (g) =>
                              (g.label === "Pedaal" ? "Pedal" : g.label) ===
                              name,
                          );
                        const pairs = [data, otherData];
                        return (
                          <section
                            className="description-compare-division"
                            key={name}
                          >
                            <h4>{name}</h4>
                            <div>
                              {pairs.map((d, i) => {
                                const g = group(d);
                                const other = group(pairs[1 - i]);
                                const unmatched = g && pairs[1 - i].stopCount > 0 ? unmatchedStopEntryIds(g.entries, other?.entries ?? []) : undefined;
                                return (
                                  <div key={d.id}>
                                    <header>
                                      <strong>{d.periodLabel}</strong>
                                      <small>{d.source.source}</small>
                                    </header>
                                    {g ? (
                                      entries(d, g, unmatched)
                                    ) : (
                                      <p>
                                        {d.stopCount === 0 ? t("organ.spec.noneCaptured", "No structured stop rows were captured for this account; a stoplist comparison is unavailable.", "Für diese Quellenbeschreibung sind keine strukturierten Registereinträge erfasst. Ein Vergleich der Registerlisten ist daher nicht möglich.") : t("organ.spec.noDivision", "No division with this source label was captured.", "Es ist kein Werk mit dieser Quellenbezeichnung erfasst.")}
                                      </p>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </section>
                        );
                      })
                    )}
                    <p className="description-footnote">
                      Spelling variants remain distinct. Pedal and Pedaal are
                      aligned for display; this does not identify shared
                      physical pipes.
                    </p>
                    <div className="description-compare-evidence">
                      {[data, otherData].map((description) => <section key={description.id} aria-label={`${sourceAccountLabel(description, descriptions)} evidence`}>
                        <h4>{sourceAccountLabel(description, descriptions)}</h4>
                        <DescriptionEvidence description={description} />
                      </section>)}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="description-metrics">
                      <span>
                        {data.stopCount > 0 ? <><strong>{data.stopCount}</strong> captured stop rows</> : <strong className="description-missing-count">{t("organ.spec.noRows", "No captured stop rows", "Keine erfassten Registereinträge")}</strong>}
                      </span>
                      {data.stopCount > 0 && <span>
                        <strong>{stopGroups.length}</strong> captured divisions with stops
                      </span>}
                      <OriginalSource description={data} />
                    </div>
                    <StopCountDifference description={data} />
                    <SourceAccountTotals description={data} comparisonFields={comparisonFields} onCompare={compareAllAccounts} />
                    <SourceReportedTotals facts={data.technicalFacts} comparisonFields={comparisonFields} onCompare={compareAllAccounts} />
                    <DescriptionStoplist key={JSON.stringify([organId, data.id, data.revision])} organId={organId} description={data} renderEntries={entries} />
                    {auxiliaries.length > 0 && (
                      <details className="description-disclosure">
                        <summary>
                          {t("organ.spec.otherEntries", "Other specification entries", "Weitere Angaben zur Disposition")}{" "}
                          <span>{auxiliaries.length}</span>
                        </summary>
                        <div className="description-auxiliaries">
                          {auxiliaries.map(({ entry, division }) => (
                            <button
                              type="button"
                              key={entry.id}
                              onClick={() => openEntry(data, entry, division)}
                            >
                              {entry.label}
                              <small>{division}</small>
                            </button>
                          ))}
                        </div>
                      </details>
                    )}
                    {data.technicalFacts.some((fact) => !totalFamilies.has(fact.family)) && (
                      <details className="description-disclosure">
                        <summary>{t("organ.spec.otherFacts", "Other technical facts from this account", "Weitere technische Angaben aus dieser Quellenbeschreibung")}</summary>
                        <dl className="description-technical">
                          {data.technicalFacts.filter((fact) => !totalFamilies.has(fact.family)).map((fact) => {
                            const tuning = fact.family === "temperament"
                              ? organ.technicalEvidence?.facts?.find(item => item.id === fact.id && item.sourceRecordId === data.source.id)
                              : undefined;
                            return <div key={fact.id}>
                              <dt>{specificationFieldLabel(t, fact.family, fact.label)}</dt>
                              <dd>
                                {tuning?.catalogUrl ? <a href={tuning.catalogUrl}>{fact.value}</a> : fact.value}
                                {(tuning?.valueKind ?? fact.valueKind) === "source_code" && <small>{t("organ.spec.opaque", "Source code with no verified temperament label.", "Quellencode ohne bestätigte Stimmungsbezeichnung.")}</small>}
                                <AccountFactDifference field={comparisonFields.find(field => field.family === fact.family)} relatedReview={relatedReviews.find(review => review.families.includes(fact.family))} onCompare={compareAllAccounts} />
                              </dd>
                            </div>;
                          })}
                        </dl>
                        <p>
                          These assertions belong to the selected source
                          account. Missing values are not inherited from another
                          period.
                        </p>
                      </details>
                    )}
                    <DescriptionEvidence description={data} />
                    <p className="description-footnote">
                      Counts describe source entries. Mixtures remain single
                      stops; no physical pipe total or present condition is
                      inferred.
                    </p>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      )}
      <dialog
        className="description-dialog"
        ref={dialog}
        onClose={() => setEvidence(null)}
        aria-labelledby="description-evidence-title"
      >
        {evidence && (
          <>
            <header>
              <div>
                <span className="description-badge">
                  {t("organ.spec.entry", "Source entry ·", "Quelleneintrag ·")} {evidence.description.periodLabel}
                </span>
                <h3 id="description-evidence-title">
                  {evidence.entry.label}
                  {evidence.entry.pitch ? ` ${sourcePitchLabel(evidence.entry.pitch)}` : ""}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setEvidence(null)}
                aria-label={t("organ.spec.close", "Close source details", "Quellendetails schließen")}
              >
                <X size={20} aria-hidden="true" />
              </button>
            </header>
            <p>
              {evidence.division} · {subject(t, evidence.description)}
            </p>
            <blockquote>{evidence.entry.wording}</blockquote>
            <p>{contextNote(t, evidence.description)}</p>
            {evidence.entry.dates.length > 0 && (
              <p>
                {t("organ.spec.date", "Dates on this entry:", "Datierungen dieses Eintrags:")} {evidence.entry.dates.join(" / ")}. These
                do not date the whole specification.
              </p>
            )}
            <details className="description-disclosure">
              <summary>{t("organ.spec.locations", "Exact evidence locations", "Genaue Fundstellen der Belege")}</summary>
              <p>{evidence.description.source.id}</p>
              {evidence.entry.sourcePaths.map((p) => (
                <p key={p}>
                  <code>{p}</code>
                </p>
              ))}
              {evidence.entry.recoveredFromHeading && (
                <p>
                  This entry was preserved in the division heading and recovered
                  during normalization.
                </p>
              )}
              <p>
                <code>{evidence.description.sourceRevision}</code>
              </p>
            </details>
            <OriginalSource description={evidence.description} />
          </>
        )}
      </dialog>
    </div>
  );
}
