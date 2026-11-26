import type { EventListResponse, OrganListResponse, PersonListResponse, ReleaseContext } from "./api";

type CatalogueResponses = {
  organs: OrganListResponse;
  people: PersonListResponse;
  events: EventListResponse;
};
type Catalogue = keyof CatalogueResponses;

export const ORGAN_PAGE_SIZE = 50;
export const PERSON_PAGE_SIZE = 18;
export const EVENT_PAGE_SIZE = 12;

const catalogues = {
  organs: { path: "/organs", limit: ORGAN_PAGE_SIZE },
  people: { path: "/persons", limit: PERSON_PAGE_SIZE },
  events: { path: "/events", limit: EVENT_PAGE_SIZE },
} as const;

const firstPages = new Map<Catalogue, { snapshot: string; promise: Promise<unknown> }>();

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validFirstPage(page: Catalogue, value: unknown): boolean {
  const { limit } = catalogues[page];
  if (!record(value) || value.offset !== 0 || value.limit !== limit
      || typeof value.total !== "number" || !Number.isSafeInteger(value.total) || value.total < 0
      || !Array.isArray(value.items) || value.items.length !== Math.min(value.total, limit)
      || !value.items.every(record)) {
    return false;
  }
  if (page === "people") {
    return record(value.page) && record(value.counts) && record(value.filters) && record(value.facets)
      && ["sources", "publicationStates", "roles", "entityClasses", "sortOptions"]
        .every(key => Array.isArray((value.facets as Record<string, unknown>)[key]));
  }
  return true;
}

async function readFirstPage(page: Catalogue, snapshot: string): Promise<unknown> {
  try {
    const response = await fetch(`/catalogue-first-page/v1/${page}.json`, {
      credentials: "same-origin",
      redirect: "error",
      signal: AbortSignal.timeout(1500),
    });
    if (!response.ok || !response.headers.get("Content-Type")?.includes("application/json")) return null;

    const body: unknown = await response.json();
    if (!record(body) || body.version !== 1 || body.page !== page || body.catalogueSnapshot !== snapshot
        || !validFirstPage(page, body.response)) {
      return null;
    }
    return body.response;
  } catch {
    return null;
  }
}

export async function loadCataloguePage<T extends Catalogue>(
  page: T,
  context: ReleaseContext | null,
  defaultSelection: boolean,
  signal: AbortSignal,
  load: () => Promise<CatalogueResponses[T]>,
): Promise<CatalogueResponses[T]> {
  const snapshot = context?.catalogueSnapshot;
  const path = window.location.pathname.replace(/\/+$/, "");
  if (defaultSelection && path === catalogues[page].path && !window.location.search
      && context?.dataProfile === "pod-1.5-public" && context.readOnly
      && !context.capabilities?.includes("authentication")
      && typeof snapshot === "string" && /^[a-f0-9]{64}$/.test(snapshot)) {
    let entry = firstPages.get(page);
    if (entry?.snapshot !== snapshot) {
      entry = { snapshot, promise: readFirstPage(page, snapshot) };
      firstPages.set(page, entry);
    }
    const initial = await entry.promise as CatalogueResponses[T] | null;
    signal.throwIfAborted();
    if (initial) return initial;
  }
  signal.throwIfAborted();
  return load();
}
