import type {
  DescriptionEntry,
  OrganDetail,
  SpecificationDescription,
} from "./api";

export function specificationView(parameters: URLSearchParams) {
  return parameters.get("specificationView") === "components" ||
    parameters.has("component") ||
    parameters.has("pipe")
    ? "components"
    : "descriptions";
}

export function specificationSource(
  organ: OrganDetail,
  parameters: URLSearchParams,
) {
  const sources = organ.sourceSpecifications ?? [];
  const componentId = parameters.get("component");
  return (
    (componentId
      ? sources.find((source) =>
          source.componentHierarchy.some((group) =>
            group.items.some((component) => component.id === componentId),
          ),
        )
      : undefined) ??
    sources.find(
      (source) => source.id === parameters.get("specificationSource"),
    ) ??
    sources.find((source) => source.preferred) ??
    sources[0]
  );
}

export function descriptionComponent(
  organ: OrganDetail,
  description: SpecificationDescription,
  entry: DescriptionEntry,
) {
  if (description.kind !== "main") return undefined;
  const source = organ.sourceSpecifications?.find(
    (item) => item.source.id === description.source.id,
  );
  const component = source?.componentHierarchy
    .flatMap((group) => group.items)
    .find((item) => item.id === entry.id);
  return component && source ? { component, sourceId: source.id } : undefined;
}

export function updateSpecificationView(values: Record<string, string | null>) {
  const url = new URL(window.location.href);
  for (const [key, value] of Object.entries(values)) {
    if (value === null) url.searchParams.delete(key);
    else url.searchParams.set(key, value);
  }
  window.history.pushState(null, "", `${url.pathname}${url.search}${url.hash}`);
  window.dispatchEvent(new PopStateEvent("popstate"));
}
