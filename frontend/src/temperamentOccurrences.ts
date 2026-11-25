import type { TuningCatalogueSort, TuningOccurrenceScope } from "./api";

export const MAX_OCCURRENCE_FILTER = 1_000_000;
export const MAX_TEMPERAMENT_COMPARISON = 4;

const TEMPERAMENT_CATALOGUE_PATH = "/temperaments";
const CATALOGUE_FILTERS = [
  "q", "scope", "group_key", "precise_variant", "commentary_available", "commentary_q",
  "sort", "occurrence_scope", "min_occurrences", "max_occurrences", "offset",
];

export function occurrenceScope(value: string | null): TuningOccurrenceScope {
  return value === "exact" || value === "family" ? value : "all";
}

export function occurrenceSort(value: string | null): TuningCatalogueSort {
  return value === "occurrences_asc" || value === "occurrences_desc" ? value : "catalogue";
}

export function occurrenceRangeIssue(minimum: string, maximum: string): "invalid" | "inverted" | undefined {
  const valid = (value: string) => !value || (/^\d{1,7}$/.test(value) && Number(value) <= MAX_OCCURRENCE_FILTER);
  if (!valid(minimum) || !valid(maximum)) return "invalid";
  if (minimum && maximum && Number(minimum) > Number(maximum)) return "inverted";
  return undefined;
}

export function temperamentCatalogueHref(value?: string | null): string {
  const match = /^\/temperaments\/?(?:\?([^#]*))?$/.exec(value || "");
  const input = new URLSearchParams(match?.[1]);
  const filters = new URLSearchParams();
  for (const key of CATALOGUE_FILTERS) {
    const value = input.get(key);
    if (value) filters.set(key, value);
  }
  const compare = readTemperamentComparison(input);
  if (compare.length) filters.set("compare", compare.join(","));
  const query = filters.toString();
  return query ? `${TEMPERAMENT_CATALOGUE_PATH}?${query}` : TEMPERAMENT_CATALOGUE_PATH;
}

export function readTemperamentComparison(parameters: URLSearchParams): string[] {
  const values = parameters.getAll("compare");
  if (values.length !== 1 || values[0].length > 259) return [];
  return [...new Set(values[0].split(",").filter(id => /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/.test(id)))]
    .slice(0, MAX_TEMPERAMENT_COMPARISON);
}

export function temperamentDetailHref(id: string, catalogueHref?: string, organScope?: TuningOccurrenceScope): string {
  const query = new URLSearchParams();
  if (organScope) {
    query.set("tab", "organs");
    if (organScope !== "all") query.set("match", organScope);
  }
  const returnTo = temperamentCatalogueHref(catalogueHref);
  if (returnTo !== TEMPERAMENT_CATALOGUE_PATH) query.set("return_to", returnTo);
  const path = `${TEMPERAMENT_CATALOGUE_PATH}/${encodeURIComponent(id)}`;
  return query.size ? `${path}?${query}` : path;
}

export function temperamentOrganHref(id: string, scope: TuningOccurrenceScope = "all", catalogueHref?: string): string {
  return temperamentDetailHref(id, catalogueHref, scope);
}
