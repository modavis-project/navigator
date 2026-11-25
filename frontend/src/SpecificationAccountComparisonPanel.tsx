import { useUiLocale } from "./uiLocale";
import { useEffect, useRef, useState } from "react";
import { ChevronRight, X } from "lucide-react";
import { actionReviewCopy, capturedStopSummary, specificationDifferenceLabel, specificationFieldLabel } from "./specificationLabels";
import {
  accountComparisonFieldId,
  accountFactHasValue,
  accountRelatedReviews,
  type AccountComparisonField,
  type AccountTechnicalFact,
  type AccountRelatedReview,
  type ComparableAccount,
} from "./specificationAccountComparison";

export function AccountFactDifference({ field, relatedReview, onCompare }: {
  field?: AccountComparisonField;
  relatedReview?: AccountRelatedReview;
  onCompare: (family: string) => void;
}) {
  const { t } = useUiLocale();
  if (!field?.differing && !relatedReview) return null;
  return <>{field?.differing && <button className="account-fact-difference" type="button" onClick={() => onCompare(field.family)}
    aria-label={t("organ.compare.openField", "Compare {field}: {count, number} value groups across source accounts", "{field} vergleichen: {count, number} Wertegruppen in den Quellenbeschreibungen", {field:specificationFieldLabel(t,field.family,field.label),count:field.valueGroups.length})}>
    {specificationDifferenceLabel(t, field)}
    <ChevronRight size={13} aria-hidden="true" />
  </button>}{relatedReview && <button className="account-fact-difference account-fact-scope-review" type="button" onClick={() => onCompare(relatedReview.id)}>
    {actionReviewCopy(t, relatedReview).label}<ChevronRight size={13} aria-hidden="true" />
  </button>}</>;
}

function FactEvidence({ fact }: { fact: AccountTechnicalFact }) {
  const { t } = useUiLocale();
  return <details className="account-comparison-evidence">
    <summary>{t("organ.compare.factEvidence", "Source evidence", "Quellenbelege")}</summary>
    {fact.source && <p>{t("organ.compare.source", "Source:", "Quelle:")} {fact.source}</p>}
    {fact.sourceRecordId && <p>{t("organ.compare.record", "Source record:", "Quelldatensatz:")} <code>{fact.sourceRecordId}</code></p>}
    {fact.sourcePath && <p>{t("organ.compare.field", "Source field:", "Quellenfeld:")} <code>{fact.sourcePath}</code></p>}
    {fact.revision && <p>{t("organ.compare.revision", "Fact revision:", "Revision der Angabe:")} <code>{fact.revision}</code></p>}
    {fact.sourceWording && <blockquote>{fact.sourceWording}</blockquote>}
    {fact.sourceUrl && <a href={fact.sourceUrl} target="_blank" rel="noreferrer">{t("organ.compare.original", "Original source", "Originalquelle")}</a>}
    {(fact.summaryEvidence?.evidence ?? []).map((span, index) => <blockquote key={index}>{span.wording}</blockquote>)}
    {fact.summaryEvidence?.accountWording && <blockquote>{fact.summaryEvidence.accountWording}</blockquote>}
  </details>;
}

export function SpecificationAccountComparison({ accounts, fields, selectedId, accountLabel, focusFamily, open, onClose, onAccount, onStoplists, onFocusFamily = () => {} }: {
  accounts: ComparableAccount[];
  fields: AccountComparisonField[];
  selectedId: string;
  accountLabel: (account: ComparableAccount) => string;
  focusFamily: string | null;
  open: boolean;
  onClose: () => void;
  onAccount: (id: string) => void;
  onStoplists: (id: string) => void;
  onFocusFamily?: (family: string | null) => void;
}) {
  const { t } = useUiLocale();
  const [differencesOnly, setDifferencesOnly] = useState(true);
  const section = useRef<HTMLElement>(null);
  const differing = fields.filter(field => field.differing);
  const relatedReviews = accountRelatedReviews(accounts);
  const relatedFamilies = new Set(relatedReviews.flatMap(review => review.families));
  const reviewFields = fields.filter(field => field.differing || relatedFamilies.has(field.family));
  const activeReview = relatedReviews.find(review => review.id === focusFamily);
  const visible = activeReview ? fields.filter(field => activeReview.families.includes(field.family))
    : differencesOnly && reviewFields.length ? reviewFields : fields;
  useEffect(() => {
    if (!open) return;
    const target = focusFamily
      ? section.current?.querySelector<HTMLElement>(`[id="${accountComparisonFieldId(focusFamily)}"]`)
      : section.current;
    target?.scrollIntoView({ block: "start", behavior: "smooth" });
    target?.focus({ preventScroll: true });
  }, [open, focusFamily]);
  if (!open) return null;
  return <section ref={section} className="account-comparison" id="source-account-comparison" tabIndex={-1} aria-labelledby="source-account-comparison-title">
    <header className="account-comparison-heading">
      <div><span className="description-badge">{t("organ.compare.all", "All source accounts", "Alle Quellenbeschreibungen")}</span><h4 id="source-account-comparison-title">{t("organ.compare.title", "Compare reported values", "Quellenangaben vergleichen")}</h4>
        <p>{t("organ.compare.counts", "{accounts, number} accounts · {sources, number} source records · {differences, plural, one {# same-field assertion difference} other {# same-field assertion differences}}", "{accounts, number} Quellenbeschreibungen · {sources, number} Quelldatensätze · {differences, plural, one {# Abweichung im selben Feld} other {# Abweichungen innerhalb einzelner Felder}}", {accounts:accounts.length,sources:new Set(accounts.map(account => account.source.id)).size,differences:differing.length})}
          {relatedReviews.length > 0 && <> · {t("organ.compare.relatedCount", "{count, number} related-scope review", "{count, number} Vergleich zugehöriger Angaben", {count:relatedReviews.length})}</>}</p></div>
      <button type="button" onClick={onClose} aria-label={t("organ.compare.close", "Close all-account comparison", "Vergleich aller Quellenbeschreibungen schließen")}><X size={18} aria-hidden="true" /></button>
    </header>
    <p className="account-comparison-scope">{t("organ.compare.scope", "Each column retains one source account and its date or dating qualification. Different values may describe different periods, proposals, source scopes or wording; they do not by themselves establish a contradiction or a physical change. Missing assertions are shown explicitly.", "Jede Spalte zeigt eine Quellenbeschreibung mit ihrer Datierung und deren Einschränkungen. Abweichende Werte können verschiedene Zeiträume, Entwürfe, Geltungsbereiche oder Formulierungen betreffen. Für sich allein belegen sie weder einen Widerspruch noch eine bauliche Veränderung. Fehlende Angaben sind ausdrücklich gekennzeichnet.")}</p>
    {relatedReviews.map(review => <div className="account-comparison-related-notice" id={accountComparisonFieldId(review.id)} tabIndex={-1} role="note" key={review.id}>
      <strong>{actionReviewCopy(t, review).label}</strong><p>{actionReviewCopy(t, review).explanation}</p>
      <button type="button" onClick={() => onFocusFamily(review.id)}>{t("organ.compare.review", "Review related action fields", "Zugehörige Angaben zur Traktur prüfen")}</button>
    </div>)}
    {fields.length > 0 && <div className="account-comparison-filters" role="group" aria-label={t("organ.compare.fields", "Fields to compare", "Felder für den Vergleich")}>
      <button type="button" aria-pressed={Boolean(differencesOnly && reviewFields.length && !activeReview)} onClick={() => { setDifferencesOnly(true); onFocusFamily(null); }}>{relatedReviews.length ? t("organ.compare.differences", "Differences & scope reviews", "Abweichungen und zugehörige Angaben") : t("organ.compare.differing", "Differing assertions", "Abweichende Angaben")} ({reviewFields.length})</button>
      <button type="button" aria-pressed={Boolean((!differencesOnly || !reviewFields.length) && !activeReview)} onClick={() => { setDifferencesOnly(false); onFocusFamily(null); }}>{t("organ.compare.allFields", "All reported fields ({count, number})", "Alle Felder mit Quellenangaben ({count, number})", {count:fields.length})}</button>
      {relatedReviews.map(review => <button type="button" key={review.id} aria-pressed={activeReview?.id === review.id} onClick={() => onFocusFamily(review.id)}>{t("organ.compare.actionFields", "Related action fields ({count, number})", "Zugehörige Trakturangaben ({count, number})", {count:review.families.length})}</button>)}
    </div>}
    <p className="account-comparison-scroll-note">{t("organ.compare.scroll", "Scroll across to compare every account. Open a value’s evidence for its source field and revision.", "Scrollen Sie seitlich, um alle Quellenbeschreibungen zu vergleichen. In den Belegdaten zu einem Wert finden Sie Quellenfeld und Revision.")}</p>
    <div className="account-comparison-scroll" role="region" aria-label={t("organ.compare.table", "Source account comparison table", "Vergleichstabelle der Quellenbeschreibungen")} tabIndex={0}>
      <table>
        <caption>{t("organ.compare.caption", "Reported assertions and captured coverage, by source account", "Quellenangaben und Erfassungsumfang je Quellenbeschreibung")}</caption>
        <thead><tr><th scope="col">{t("organ.compare.fieldScope", "Field / scope", "Feld und Geltungsbereich")}</th>{accounts.map(account => <th scope="col" key={account.id}>
          <span>{account.periodLabel}</span><small>{account.source.source}</small>
          {accountLabel(account) !== `${account.periodLabel} · ${account.source.source}` && <small className="account-comparison-account-distinction">{accountLabel(account).slice(`${account.periodLabel} · ${account.source.source} · `.length)}</small>}
          <details><summary>{t("organ.compare.context", "Account context", "Kontext der Quellenbeschreibung")}</summary><p>{accountLabel(account)}</p><p>{account.sourceHeading}</p>
            <p>{account.realization === "proposed" ? t("organ.compare.proposed", "Proposed design; realization is not established.", "Entwurf. Die Ausführung ist nicht belegt.") : account.subjectKind === "earlier_instrument" ? t("organ.compare.earlier", "Earlier instrument; continuity is not established.", "Früheres Instrument. Ein Fortbestand ist nicht belegt.") : t("organ.compare.reported", "Reported account; present condition is not established.", "Quellenbeschreibung. Der heutige Zustand ist nicht belegt.")}</p>
            <p>{t("organ.compare.date", "Configuration date:", "Datierung der Disposition:")} {account.sortYear !== null && account.chronology?.configurationDateState.startsWith("explicit_") ? `${account.sortYear} (source account claim)` : t("organ.compare.noExactYear", "not established as an exact year", "kein genaues Jahr belegt")}.</p>
            {account.chronology?.claims.map((claim, index) => <p key={index}>{t("organ.compare.dateWording", "Source dating wording:", "Datierungswortlaut der Quelle:")} <q>{claim.wording}</q>{claim.qualification ? ` · ${claim.qualification}` : ""}</p>)}
            <p>{t("organ.compare.accountRevision", "Account revision:", "Revision der Quellenbeschreibung:")} <code>{account.revision}</code></p>
            {account.source.url && <a href={account.source.url} target="_blank" rel="noreferrer">{t("organ.compare.original", "Original source", "Originalquelle")}</a>}
          </details>
          <button type="button" onClick={() => onAccount(account.id)}>{t("organ.compare.open", "Open account", "Quellenbeschreibung öffnen")}</button>
          {account.id !== selectedId && <button type="button" onClick={() => onStoplists(account.id)}>{t("organ.compare.compareLists", "Compare stoplists", "Registerlisten vergleichen")}</button>}
        </th>)}</tr></thead>
        <tbody>
          <tr className="account-comparison-coverage"><th scope="row">{t("organ.compare.captured", "Captured stoplist rows", "Erfasste Registereinträge")}<small>{t("organ.compare.coverage", "Coverage, separate from reported totals", "Erfassungsumfang, getrennt von Summen laut Quelle")}</small></th>
            {accounts.map(account => <td key={account.id}><strong>{capturedStopSummary(t, account)}</strong>
              {account.stopCount === 0 && <p>{t("organ.compare.noCaptured", "No structured stoplist was captured. This is not a report of zero stops.", "Es wurde keine strukturierte Registerliste erfasst. Daraus lässt sich keine Registerzahl von null ableiten.")}</p>}
              {account.coverageSummary?.reportedZero && <p>{t("organ.compare.reportedZero", "A source also explicitly reports zero; that assertion is retained separately below.", "Eine Quelle nennt ausdrücklich null. Diese Angabe ist unten separat aufgeführt.")}</p>}
              <small>{t("organ.compare.components", "{count, number} captured component rows in this account. Components can include couplers and accessories.", "{count, number} erfasste Bauteileinträge in dieser Quellenbeschreibung. Dazu können Koppeln und Spielhilfen gehören.", {count:account.componentCount})}</small>
            </td>)}</tr>
          {visible.map(field => <tr key={field.family} id={accountComparisonFieldId(field.family)} tabIndex={-1} className={`${field.differing ? "account-comparison-differing" : ""}${relatedFamilies.has(field.family) ? " account-comparison-related" : ""}`}>
            <th scope="row">{specificationFieldLabel(t, field.family, field.label)}
              <small>{t("organ.compare.fieldCounts", "{groups, plural, one {# value group} other {# value groups}} · {assertions, plural, one {# assertion} other {# assertions}} · {sources, plural, one {# source record} other {# source records}}", "{groups, plural, one {# Wertegruppe} other {# Wertegruppen}} · {assertions, plural, one {# Angabe} other {# Angaben}} · {sources, plural, one {# Quelldatensatz} other {# Quelldatensätze}}", {groups:field.valueGroups.length,assertions:field.assertionCount,sources:field.sourceCount})}</small>
              {field.differing && <span className="account-comparison-status">{specificationDifferenceLabel(t, field)}</span>}
              {relatedFamilies.has(field.family) && <span className="account-comparison-related-status">{field.family === "action_system" ? t("organ.compare.generalAction", "General action description", "Allgemeine Trakturbeschreibung") : t("organ.compare.specificAction", "Function-specific action assertion", "Angabe zur Spiel- oder Registertraktur")} · {t("organ.compare.reviewFields", "review related fields", "zugehörige Felder prüfen")}</span>}
              {field.qualifiedAssertionCount > 0 && <small>{t("organ.compare.qualified", "Includes qualified source expressions.", "Enthält Quellenangaben mit Einschränkungen.")}</small>}
            </th>
            {field.cells.map(cell => <td key={cell.accountId}>{cell.facts.length ? cell.facts.map((fact, index) => <div className="account-comparison-assertion" key={`${fact.id}-${index}`}>
              {accountFactHasValue(fact) ? <strong>{fact.value}</strong> : <span className="account-comparison-missing">{t("organ.compare.noValue", "No reported value", "Kein Wert angegeben")}</span>}
              {fact.valueKind === "source_code" && <small>{t("organ.compare.opaque", "Source code with no verified temperament label.", "Quellencode ohne bestätigte Stimmungsbezeichnung.")}</small>}
              {fact.qualificationGuidance && <p className="description-total-qualification">{fact.qualificationGuidance}</p>}
              <FactEvidence fact={fact} />
            </div>) : <span className="account-comparison-missing">{t("organ.compare.noAssertion", "No assertion for this account", "Keine Angabe in dieser Quellenbeschreibung")}</span>}</td>)}
          </tr>)}
        </tbody>
      </table>
    </div>
    {!fields.length && <p className="description-empty">{t("organ.compare.empty", "No account-specific technical assertions are available for these accounts. Their captured rows and retained account evidence can still be compared.", "Für diese Quellenbeschreibungen sind keine eigenen technischen Angaben verfügbar. Die erfassten Einträge und Belege lassen sich weiterhin vergleichen.")}</p>}
    <p className="description-footnote">{t("organ.compare.method", "Values are grouped by technical field, using source wording, recognized temperament equivalents, or eligible normalized numbers. Qualified expressions remain separate. Uninterpreted source codes stay visible outside comparable value groups. Repeated assertions from one source record count as one source record. Agreement in wording does not establish shared physical components. Historical accounts do not inherit totals from another account.", "Werte werden je technischem Feld anhand des Quellenwortlauts, zugeordneter gleichbedeutender Stimmungsangaben oder geeigneter normalisierter Zahlen gruppiert. Angaben mit Einschränkungen bleiben getrennt. Nicht interpretierte Quellencodes bleiben außerhalb der vergleichbaren Wertegruppen sichtbar. Wiederholte Angaben aus demselben Quelldatensatz zählen als ein Quelldatensatz. Gleicher Wortlaut belegt keine gemeinsamen physischen Bauteile. Summen anderer Quellenbeschreibungen werden nicht auf historische Beschreibungen übertragen.")}</p>
  </section>;
}
