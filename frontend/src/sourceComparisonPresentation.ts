import type { ComponentFieldComparison, OrganParityTechnicalFact, OrganTechnicalComparisonGroup } from "./api";

export function comparisonValue(value: unknown): string {
  return value === null || value === undefined || value === "" ? "Not stated" : String(value);
}

export function capturedRowsLabel(family: string): string {
  return family === "stop_total" ? "Captured stop rows" : family === "manual_total" ? "Captured manual/keyboard rows" : "Captured component rows";
}

export function technicalComparisonLabel(group: Pick<OrganTechnicalComparisonGroup, "status" | "withinSourceDifferences" | "crossSourceDifferences">): string {
  if (group.status === "different_values") return group.withinSourceDifferences && !group.crossSourceDifferences
    ? "Values differ within a source record" : "Reported values differ";
  if (group.status === "different_wording") return "Source wording differs";
  if (group.status === "equivalent_wording") return "Equivalent source wording";
  if (group.status === "source_code_only") return "Uninterpreted source codes";
  if (group.status === "qualified_values") return "Qualified values";
  if (group.status === "not_comparable") return "Different kinds of evidence";
  if (group.status === "matching_values") return "Comparable values match";
  if (group.status === "single_source") return "One comparable source record";
  return "Value unavailable";
}

export function technicalFactDifferenceLabel(fact: Pick<OrganParityTechnicalFact, "comparisonKind" | "comparisonState" | "conflictState">): string | null {
  if (fact.comparisonKind === "source_summary_vs_captured_rows") return "Summary and captured list differ";
  if (fact.comparisonState === "different_values") return "Reported values differ";
  if (fact.comparisonState === "different_wording") return "Source wording differs";
  if (fact.comparisonState === "not_comparable") return "Compare evidence types";
  if (["equivalent_wording", "source_code_only", "source_code"].includes(fact.comparisonState ?? "")) return null;
  if (fact.conflictState?.startsWith("material")) return "Evidence differs";
  return null;
}

// Only explicit field names and established presentation aliases may attach a marker.
// This maps fields within an already supplied component comparison, never identities across rows.
export function comparisonsForComponentField(fields: ComponentFieldComparison[], key: string): ComponentFieldComparison[] {
  const aliases: Record<string, string[]> = {
    length: ["length", "pitch", "nominal_pitch"],
    name: ["name", "label"],
    division_name: ["division_name", "division"],
  };
  const accepted = new Set(aliases[key] || [key]);
  return fields.filter(field => accepted.has(field.field) && ["conflicting", "variant"].includes(field.status));
}

export function componentVariantKind(fields: ComponentFieldComparison[]): string {
  const kinds = new Set(fields.filter(field => field.status === "variant").map(field => field.variantKind || "source_wording"));
  return kinds.size === 1 ? Array.from(kinds)[0] : "source_wording";
}

export function technicalComparisonHasDifference(group: Pick<OrganTechnicalComparisonGroup, "status">): boolean {
  return ["different_values", "different_wording"].includes(group.status);
}

export function relatedActionGroups(groups: OrganTechnicalComparisonGroup[]): OrganTechnicalComparisonGroup[] {
  const related = groups.filter(group => ["action_system", "key_action", "stop_action"].includes(group.family) && group.assertions.some(assertion => assertion.displayValue?.trim()));
  return related.some(group => group.family === "action_system") && related.some(group => group.family !== "action_system") ? related : [];
}
