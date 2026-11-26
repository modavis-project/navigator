import type { UiText } from "./uiLocale";
import type { AccountComparisonField, AccountRelatedReview, ComparableAccount } from "./specificationAccountComparison";
import { capturedRowsLabel, technicalComparisonLabel, technicalFactDifferenceLabel } from "./sourceComparisonPresentation";
import type { OrganParityTechnicalFact, OrganTechnicalComparisonGroup, SpecificationDescription } from "./api";

const technicalFieldGerman: Record<string, string> = {
  stop_total: "Registerzahl",
  register_total: "Registerzahl",
  manual_total: "Manualzahl",
  rank_total: "Zahl der Pfeifenreihen",
  pipe_total: "Pfeifenzahl",
  pitch: "Stimmtonhöhe",
  temperament: "Stimmungssystem",
  action_system: "Traktur",
  key_action: "Spieltraktur",
  stop_action: "Registertraktur",
  wind_system: "Windversorgung",
  wind_pressure: "Winddruck",
  windchest: "Windlade",
  stoplist_availability: "Verfügbarkeit der Registerliste",
  source_summary: "Zusammenfassung laut Quelle",
  manual_summary: "Angaben zu den Manualen",
  functional_pipe_position: "Funktionale Pfeifenposition",
};

export function specificationFieldLabel(t: UiText, family: string, original: string) {
  const german = technicalFieldGerman[family];
  return german ? t("organ.spec.field." + family, original, german) : original;
}

export function capturedStopSummary(t: UiText, account: Pick<ComparableAccount, "stopCount" | "coverage">) {
  if (account.stopCount === 0) return t("organ.spec.stopRows.none", "No captured stop rows", "Keine erfassten Registereinträge");
  const count = account.stopCount;
  return account.coverage === "retained_source_transfer"
    ? t("organ.spec.stopRows.retained", "{count, plural, one {# retained stop row} other {# retained stop rows}}", "{count, plural, one {# übernommener Registereintrag} other {# übernommene Registereinträge}}", {count})
    : t("organ.spec.stopRows.captured", "{count, plural, one {# captured stop row} other {# captured stop rows}}", "{count, plural, one {# erfasster Registereintrag} other {# erfasste Registereinträge}}", {count});
}

export function specificationPeriodLabel(t: UiText, description: Pick<SpecificationDescription, "periodLabel" | "timeKind">) {
  const century = description.timeKind === "century" && /^(\d+)(?:st|nd|rd|th) century$/i.exec(description.periodLabel);
  return century ? t("organ.spec.period.century", description.periodLabel, "{century}. Jahrhundert", { century: century[1] }) : description.periodLabel;
}

const differenceGerman: Record<string, readonly [string, string]> = {
  "Different kinds of evidence": ["kinds", "Unterschiedliche Arten von Belegdaten"],
  "Source expressions or qualifications differ": ["qualifications", "Quellenwortlaut oder Einschränkungen weichen ab"],
  "Reported values differ": ["values", "Werte laut Quelle weichen ab"],
  "Source wording differs": ["wording", "Quellenwortlaut weicht ab"],
};

export function specificationDifferenceLabel(t: UiText, field: AccountComparisonField) {
  const copy = differenceGerman[field.differenceLabel];
  return copy ? t("organ.spec.difference." + copy[0], field.differenceLabel, copy[1]) : field.differenceLabel;
}

export function actionReviewCopy(t: UiText, review: AccountRelatedReview) {
  if (review.id !== "related-action-descriptions") return review;
  return {
    label: t("organ.spec.actionReview.title", review.label, "Angaben zur Traktur im Zusammenhang prüfen"),
    explanation: t("organ.spec.actionReview.explanation", review.explanation, "Allgemeine Trakturbeschreibungen und Angaben zur Spiel- oder Registertraktur haben unterschiedliche Geltungsbereiche. Prüfen Sie den ursprünglichen Wortlaut im Zusammenhang. Feld und Datierung jeder Quellenbeschreibung bleiben erhalten. Ein Widerspruch oder eine gemeinsame Disposition ist damit nicht belegt."),
  };
}

const technicalGroupGerman: Record<string, string> = {
  different_values: "Werte laut Quelle weichen ab",
  different_wording: "Quellenwortlaut weicht ab",
  equivalent_wording: "Gleichbedeutender Quellenwortlaut",
  source_code_only: "Nicht interpretierte Quellencodes",
  qualified_values: "Werte mit Einschränkungen",
  not_comparable: "Unterschiedliche Arten von Belegdaten",
  matching_values: "Vergleichbare Werte stimmen überein",
  single_source: "Ein vergleichbarer Quelldatensatz",
};

export function technicalComparisonText(t: UiText, group: OrganTechnicalComparisonGroup) {
  const english = technicalComparisonLabel(group);
  if (group.status === "different_values" && group.withinSourceDifferences && !group.crossSourceDifferences) {
    return t("organ.technical.status.withinSource", english, "Werte innerhalb eines Quelldatensatzes weichen ab");
  }
  const german = technicalGroupGerman[group.status];
  return german
    ? t("organ.technical.status." + group.status, english, german)
    : t("organ.technical.status.unavailable", english, "Wert nicht verfügbar");
}

export function technicalFactDifferenceText(t: UiText, fact: OrganParityTechnicalFact) {
  const english = technicalFactDifferenceLabel(fact);
  if (!english) return null;
  if (fact.comparisonKind === "source_summary_vs_captured_rows") {
    return t("organ.technical.fact.captureDifference", english, "Zusammenfassung und erfasste Liste weichen ab");
  }
  if (fact.comparisonState === "not_comparable") return t("organ.technical.fact.notComparable", english, "Arten von Belegdaten vergleichen");
  const german = fact.comparisonState === "different_values" || fact.comparisonState === "different_wording"
    ? technicalGroupGerman[fact.comparisonState] : undefined;
  return german ? t("organ.technical.fact." + fact.comparisonState, english, german) : t("organ.technical.fact.evidenceDiffers", english, "Belegdaten weichen ab");
}

export function technicalCaptureRowsLabel(t: UiText, family: string) {
  const english = capturedRowsLabel(family);
  if (family === "stop_total") return t("organ.technical.rows.stops", english, "Erfasste Registereinträge");
  if (family === "manual_total") return t("organ.technical.rows.keyboards", english, "Erfasste Einträge zu Manualen und Klaviaturen");
  return t("organ.technical.rows.components", english, "Erfasste Bauteileinträge");
}
