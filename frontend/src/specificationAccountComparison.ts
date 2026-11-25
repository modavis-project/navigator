import type { DescriptionEntry, SpecificationDescription, SpecificationDescriptionDetail } from "./api";

export type AccountTechnicalFact = SpecificationDescriptionDetail["technicalFacts"][number] & {
  normalizedNumber?: number | null;
  source?: string;
  sourceRecordId?: string;
  sourceWording?: string;
  sourceUrl?: string | null;
  aggregateQualification?: { headlineEligible: boolean; status: string };
  comparisonState?: string;
  comparisonGroupId?: string;
};

export type ComparableAccount = SpecificationDescription & {
  technicalFacts?: AccountTechnicalFact[];
  stopListAvailability?: "captured_stop_rows" | "no_captured_stop_rows" | string;
  coverageSummary?: { reportedZero?: boolean };
};

/** A captured row count is coverage, never a source assertion of an organ total. */
export function accountStopSummary(account: Pick<ComparableAccount, "stopCount" | "coverage">) {
  if (account.stopCount === 0) return "No captured stop rows";
  return `${account.stopCount} ${account.coverage === "retained_source_transfer" ? "retained stop rows" : "captured stop rows"}`;
}

export function stopWordingKey(entry: Pick<DescriptionEntry, "label" | "pitch">) {
  // Keep spellings and pitch expressions distinct; no physical identity is inferred.
  return JSON.stringify([entry.label.normalize("NFC").replace(/\s+/g, " ").trim(),
    (entry.pitch ?? "").normalize("NFC").replace(/\s+/g, " ").trim()]);
}

/** Match occurrences, so repeated equal labels are not silently collapsed into a set. */
export function unmatchedStopEntryIds(entries: DescriptionEntry[], otherEntries: DescriptionEntry[]) {
  const remaining = new Map<string, number>();
  for (const entry of otherEntries.filter(entry => entry.kind === "stop")) {
    const key = stopWordingKey(entry);
    remaining.set(key, (remaining.get(key) ?? 0) + 1);
  }
  const unmatched = new Set<string>();
  for (const entry of entries.filter(entry => entry.kind === "stop")) {
    const key = stopWordingKey(entry);
    const count = remaining.get(key) ?? 0;
    if (count > 0) remaining.set(key, count - 1);
    else unmatched.add(entry.id);
  }
  return unmatched;
}

export type AccountValueGroup = {
  key: string;
  value: string;
  facts: Array<{ accountId: string; fact: AccountTechnicalFact }>;
  accountIds: string[];
  sourceRecordIds: string[];
};
export type AccountComparisonField = {
  family: string;
  label: string;
  cells: Array<{ accountId: string; facts: AccountTechnicalFact[] }>;
  valueGroups: AccountValueGroup[];
  assertionCount: number;
  sourceCount: number;
  differing: boolean;
  qualifiedAssertionCount: number;
  differenceLabel: string;
};

export type AccountRelatedReview = {
  id: string;
  label: string;
  explanation: string;
  families: string[];
  assertionCount: number;
  sourceCount: number;
};

/** Related scopes deserve a wording review, without merging them into one technical field. */
export function accountRelatedReviews(accounts: ComparableAccount[]): AccountRelatedReview[] {
  const families = ["action_system", "key_action", "stop_action"];
  const assertions = accounts.flatMap(account => accountComparisonFacts(account)
    .filter(fact => families.includes(fact.family) && accountFactHasValue(fact))
    .map(fact => ({ fact, sourceRecordId: fact.sourceRecordId || account.source.id })));
  const present = [...new Set(assertions.map(({ fact }) => fact.family))];
  if (!present.includes("action_system") || !present.some(family => family === "key_action" || family === "stop_action")) return [];
  return [{
    id: "related-action-descriptions", label: "Action descriptions need comparison",
    explanation: "General action descriptions and separate key-action or stop-action assertions have different scopes. Review their original wording together. Each field and account date is retained; a contradiction or shared configuration is not established.",
    families: present, assertionCount: assertions.length,
    sourceCount: new Set(assertions.map(assertion => assertion.sourceRecordId)).size,
  }];
}

export function accountComparisonFieldId(family: string) {
  return `account-comparison-field-${encodeURIComponent(family)}`;
}

export function accountFactHasValue(fact: AccountTechnicalFact) {
  return typeof fact.value === "string" && fact.value.trim().length > 0 && fact.comparisonState !== "missing_value";
}

function factValueKind(fact: AccountTechnicalFact) {
  if (fact.qualificationGuidance || fact.aggregateQualification?.headlineEligible === false) return "qualified";
  return typeof fact.normalizedNumber === "number" && Number.isFinite(fact.normalizedNumber) ? "number" : "wording";
}

function factValueKey(fact: AccountTechnicalFact) {
  // Qualified values are retained as their own expressions, never promoted to numeric totals.
  if (fact.family === "temperament" && fact.temperamentComparisonKey) return `temperament:${fact.temperamentComparisonKey}`;
  const kind = factValueKind(fact);
  if (kind === "number") return `number:${fact.normalizedNumber}`;
  return `${kind}:${kind === "qualified" ? `${fact.aggregateQualification?.status ?? "qualified"}:` : ""}${fact.value.normalize("NFC").trim()}`;
}

/** Separately dated source-account totals are their own assertions, never inherited main totals. */
export function accountComparisonFacts(account: ComparableAccount): AccountTechnicalFact[] {
  const facts = [...(account.technicalFacts ?? [])];
  if (account.coverage !== "retained_source_transfer") for (const [index, fact] of (account.chronology?.accountSourceFacts ?? []).entries()) {
    facts.push({
      id: `${account.id}:reported-total:${index}`, family: fact.family, label: fact.label, value: fact.value,
      normalizedNumber: fact.normalizedNumber, source: account.source.source, sourceRecordId: account.source.id,
      revision: account.revision, sourcePath: account.sourcePaths.join("; "), sourceWording: fact.wording,
    });
  }
  return facts;
}

/** All assertions remain in their account cell, including conflicting values from one source. */
export function buildAccountComparison(accounts: ComparableAccount[]): AccountComparisonField[] {
  const accountFacts = accounts.map(account => ({ account, facts: accountComparisonFacts(account) }));
  const families = [...new Set(accountFacts.flatMap(({ facts }) => facts.map(fact => fact.family)))];
  const priority = ["stop_total", "register_total", "manual_total", "rank_total", "pipe_total", "pitch", "temperament", "action_system", "wind_system", "stoplist_availability", "source_summary", "manual_summary"];
  return families.map(family => {
    const cells = accountFacts.map(({ account, facts }) => ({ accountId: account.id, facts: facts.filter(fact => fact.family === family) }));
    const assertions = cells.flatMap(cell => cell.facts.map(fact => ({ accountId: cell.accountId, fact })));
    const reportedAssertions = assertions.filter(({ fact }) => accountFactHasValue(fact));
    const groupedAssertions = reportedAssertions.filter(({ fact }) => fact.valueKind !== "source_code");
    const sourceFor = (assertion: typeof reportedAssertions[number]) => assertion.fact.sourceRecordId
      || accounts.find(account => account.id === assertion.accountId)!.source.id;
    const groups = new Map<string, AccountValueGroup>();
    for (const assertion of groupedAssertions) {
      const key = factValueKey(assertion.fact);
      const group = groups.get(key) ?? { key, value: assertion.fact.value, facts: [], accountIds: [], sourceRecordIds: [] };
      group.facts.push(assertion);
      if (!group.accountIds.includes(assertion.accountId)) group.accountIds.push(assertion.accountId);
      const source = sourceFor(assertion);
      if (!group.sourceRecordIds.includes(source)) group.sourceRecordIds.push(source);
      groups.set(key, group);
    }
    const valueGroups = [...groups.values()];
    const kinds = new Set(groupedAssertions.map(({ fact }) => factValueKind(fact)));
    const differenceLabel = kinds.size > 1 || groupedAssertions.some(({ fact }) => fact.comparisonState === "not_comparable") ? "Different kinds of evidence"
      : kinds.has("qualified") ? "Source expressions or qualifications differ"
      : kinds.has("number") ? "Reported values differ" : "Source wording differs";
    return {
      family, label: assertions[0]?.fact.label || family, cells, valueGroups,
      assertionCount: reportedAssertions.length,
      sourceCount: new Set(reportedAssertions.map(sourceFor)).size,
      differing: valueGroups.length > 1,
      qualifiedAssertionCount: groupedAssertions.filter(({ fact }) => factValueKind(fact) === "qualified").length,
      differenceLabel,
    };
  }).sort((a, b) => {
    const ai = priority.indexOf(a.family), bi = priority.indexOf(b.family);
    return (ai < 0 ? priority.length : ai) - (bi < 0 ? priority.length : bi) || a.label.localeCompare(b.label);
  });
}
