/** The catalogue advertises families; the API decides their availability. */
export function vocabularyUsageFamily(path: string): string | null {
  return path.match(/^\/vocab\/usage\/([a-z][a-z0-9_]*)\/?$/)?.[1] ?? null;
}

/** The public short routes resolve the same identity used in saved POD views. */
export function vocabularyReaderAlias(path: string): { schemeId: string; conceptId?: string } | null {
  const match = path.match(/^\/vocab\/(activity-types|person-terms)(?:\/([^/]+))?\/?$/);
  if (!match) return null;
  const activities = match[1] === "activity-types";
  const schemeId = activities ? "modavis_activity_types" : "modavis_person_terminology";
  if (!match[2]) return { schemeId };
  try {
    const slug = decodeURIComponent(match[2]);
    if (!/^[a-z0-9][a-z0-9.-]*$/.test(slug)) return null;
    return { schemeId, conceptId: activities ? `activitype:${slug}` : slug.replace(/-/g, "_") };
  } catch { return null; }
}

export type VocabularyEditionId = "modavis" | "musixplora" | "organ-specifications";

export function vocabularyEditionRoute(path: string) {
  const match = path.match(/^\/vocab\/(editions\/modavis|musixplora|organ-specifications)(?:\/([^/]+)(?:\/([^/]+))?)?\/?$/);
  if (!match) return null;
  try {
    return {
      edition: match[1] === "editions/modavis" ? "modavis" : match[1] as VocabularyEditionId,
      scheme: match[2] && decodeURIComponent(match[2]),
      term: match[3] && decodeURIComponent(match[3]),
      resource: match[3] ? match[2] + "/" + match[3] : undefined,
    };
  } catch { return null; }
}

export function editionReadingUrl(route: { edition: VocabularyEditionId; scheme?: string; term?: string }, params: URLSearchParams) {
  const prefix = route.edition === "musixplora" ? "/api/vocab/musixplora" : "/api/vocab/edition-terms/" + route.edition;
  const parts = [route.scheme, route.term].filter((part): part is string => Boolean(part)).map(encodeURIComponent);
  return prefix + (parts.length ? "/" + parts.join("/") : "") + (params.size ? "?" + params : "");
}
