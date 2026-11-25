import type { OrganDetail, OrganSourceSpecification } from "./api";

export function hasSpecificationDescriptions(
  organ: Pick<OrganDetail, "specificationDescriptions">,
): boolean {
  return Boolean(organ.specificationDescriptions?.length);
}

export function selectedSpecificationFacts(
  organ: Pick<OrganDetail, "technicalEvidence" | "sourceSpecifications">,
  selectedSource?: Pick<OrganSourceSpecification, "source"> | null,
) {
  const facts = organ.technicalEvidence?.facts ?? [];
  if (selectedSource) {
    const id = selectedSource.source.id;
    return id ? facts.filter(fact => fact.sourceRecordId === id) : [];
  }
  // Once source sets exist, an unresolved selection must not inherit another
  // account's facts. Legacy records without source sets keep their full evidence.
  return organ.sourceSpecifications?.length ? [] : facts;
}
