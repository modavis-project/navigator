/** The catalogue advertises families; the API decides their availability. */
export function vocabularyUsageFamily(path: string): string | null {
  return path.match(/^\/vocab\/usage\/([a-z][a-z0-9_]*)\/?$/)?.[1] ?? null;
}
