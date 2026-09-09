import { JsonEvidence } from "./JsonEvidence";
import { temperamentSearchUrl } from "./temperamentSearch";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowLeftRight,
  BookOpen,
  Check,
  ChevronRight,
  Clock3,
  ExternalLink,
  Info,
  Link2,
  X,
} from "lucide-react";
import {
  fetchSpecificationDescription,
  type DescriptionEntry,
  type OrganDetail,
  type SpecificationDescription,
  type SpecificationDescriptionDetail,
} from "./api";
import "./organSpecificationDescriptions.css";

import {
  descriptionComponent,
  specificationView,
  updateSpecificationView as updateView,
} from "./specificationNavigation";

export function SourceReportedTotals({ facts }: { facts: SpecificationDescriptionDetail["technicalFacts"] }) {
  const totals = facts.filter((f) => ["manual_total", "stop_total", "rank_total", "pipe_total", "stoplist_availability"].includes(f.family));
  if (!totals.length) return null;
  return <section aria-label="Source-reported specification totals">
    <h4>Source-reported totals</h4>
    <dl className="description-technical">
      {totals.map((f) => <div key={f.id}><dt>{f.label}</dt><dd>{f.value}
        {f.qualificationGuidance && <p className="description-notice">{f.qualificationGuidance}</p>}
        {f.summaryEvidence && <details><summary>Source evidence for this total</summary>
          {(f.summaryEvidence.evidence ?? []).map((span, index) => <div key={index}>
            <blockquote style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{span.wording}</blockquote>
            <p>Source field: <code>{span.path}</code>; characters {span.start}–{span.end} (zero-based, end excluded).</p>
          </div>)}
          {f.summaryEvidence.accountWording && <details><summary>Complete retained source account wording</summary>
            <blockquote style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", maxHeight: "28rem", overflow: "auto" }}>{f.summaryEvidence.accountWording}</blockquote>
          </details>}
          <details><summary>Raw source summary evidence</summary><JsonEvidence value={f.summaryEvidence} label={`${f.label} source evidence`}/></details>
        </details>}
      </dd></div>)}
    </dl>
    <p>Each statement retains its recorded source scope and account qualification. Totals do not supply individual stops, divisions or pipe positions, or establish present condition.</p>
  </section>;
}

export function preferredSpecificationDescription(descriptions: SpecificationDescription[], requested: string | null) {
  return descriptions.find((description) => description.id === requested)
    ?? descriptions.find((description) => description.coverage !== "retained_source_transfer")
    ?? descriptions[0];
}

export function sourcePitchLabel(pitch: string | null) {
  return pitch ? /['’‘′]/.test(pitch) ? pitch : `${pitch}′` : "";
}

function sourceDatesConfiguration(description: SpecificationDescription) {
  return description.coverage !== "retained_source_transfer"
    && description.sortYear !== null && description.chronology?.configurationDateState.startsWith("explicit_")
    && Boolean(description.chronology.claims.length);
}

export function SourceAccountEvidence({ description }: { description: SpecificationDescription }) {
  const evidence = description.chronology;
  const retained = description.coverage === "retained_source_transfer";
  const recovered = evidence?.contract === "modavis.source-account-recovery/v1" && !retained;
  if (!retained && !recovered) return null;
  const facts = evidence?.accountSourceFacts ?? [];
  const unresolved = evidence?.unresolvedStoplistRowCount ?? 0;
  return <section aria-label="Source account coverage">
    {retained ? <p className="description-notice">Original transferred rows are retained here. Their correspondence to each separately recovered source account is not established. Use the recovered accounts to inspect their own stoplists and dates.</p>
      : <>
        <p>Recovered from a separately bounded source account: <strong>{description.sourceHeading}</strong>.</p>
        {unresolved > 0 && <p className="description-notice">Partial stoplist recovery: {unresolved} source {unresolved === 1 ? "row could" : "rows could"} not be interpreted as structured stops. The retained source evidence includes these rows; the listed count is not a complete register total.</p>}
        {facts.length > 0 && <section aria-label="Totals reported in this source account">
          <h4>Totals reported in this source account</h4>
          <dl className="description-technical">{facts.map((fact, index) => <div key={`${fact.family}-${index}`}><dt>{fact.label}</dt><dd>{fact.value}</dd></div>)}</dl>
          <p>These are source-reported statements for this account. Register and transmission figures are retained separately; they are not added to each other or to the organ’s totals.</p>
          <details><summary>Original total wording</summary>{facts.map((fact, index) => <blockquote key={index}>{fact.wording}</blockquote>)}</details>
        </section>}
        <p className="muted">This account does not establish complete recovery, shared physical pipes, or present condition.</p>
      </>}
    {evidence && <details><summary>Source account evidence</summary>
      <JsonEvidence value={evidence} label="Source account evidence"/>
    </details>}
  </section>;
}

export function ConfigurationChronology({ description }: { description?: SpecificationDescription }) {
  const evidence = description?.chronology;
  if (!evidence || !description) return null;
  const captures = [...new Set(evidence.sourceObservations
    .filter((observation) => observation.kind === "source_retrieval")
    .map((observation) => observation.expression.match(/^\d{4}-\d{2}-\d{2}/)?.[0])
    .filter((date): date is string => Boolean(date)))].sort();
  const dated = sourceDatesConfiguration(description);
  return <section aria-label="Configuration chronology">
    {dated ? <p>Configuration dated by the source: <strong>{description.periodLabel}</strong>. Present condition is not established.</p>
      : evidence.claims.length > 0 ? <p>Source date wording is retained below. A configuration date for this description is not established.</p>
        : <p>A configuration date for this description is not established.</p>}
    {evidence.sourceDateQualification && <p>The source dates the account and separately places it before or after an intervention. The intervention’s year is not established by that wording.</p>}
    {evidence.sourceRelativeContext && <p>The source places this account <strong>{evidence.sourceRelativeContext.temporalRelation} {evidence.sourceRelativeContext.boundaryYear}</strong>. This is a historical boundary, not an exact configuration year.</p>}
    {captures.length > 0 && <p>Latest recorded source capture: <time dateTime={captures[captures.length - 1]}>{captures[captures.length - 1]}</time>. This is an access date, not an organ survey date.</p>}
    {evidence.eventAssociations.map((association) => <p key={association.eventId}>
      <a href={`/events/${encodeURIComponent(association.eventId)}`}>Related documented event</a>
      {" · "}{association.temporalRelation ? <>The source describes this account {association.temporalRelation} this event. An exact configuration date and a causal relationship are not established.</> : <>The source’s date and named context correspond; this does not establish that the event caused this configuration.</>}
    </p>)}
    <details><summary>Dating evidence</summary>
      {evidence.claims.map((claim, i) => <blockquote key={i}>{claim.wording}</blockquote>)}
      {evidence.sourceObservations.map((observation, i) => <p key={i}>{observation.kind === "source_retrieval" ? "Source retrieved" : "Source observation"}: {observation.expression}. This does not establish the configuration’s date or present condition.</p>)}
      {evidence.eventAssociations.length === 0 && <p>No event association is established by the available date and context.</p>}
    </details>
  </section>;
}

function stopCountLabel(description: SpecificationDescription) {
  return description.coverage === "retained_source_transfer" ? "retained stop rows" : "listed stops";
}

function subject(description: SpecificationDescription) {
  if (description.coverage === "retained_source_transfer") return "Retained source transfer";
  if (description.chronology?.contract === "modavis.source-account-recovery/v1") return "Recovered source account";
  if (description.subjectKind === "earlier_instrument") return "Earlier organ";
  if (description.realization === "proposed") return "Proposed design";
  return description.kind === "main"
    ? "Main source description"
    : "Documented description";
}

function contextNote(d: SpecificationDescription) {
  if (d.coverage === "retained_source_transfer") return "The original transferred rows remain available. Their correspondence to the separately bounded source accounts is not established.";
  if (d.subjectKind === "earlier_instrument")
    return "This list describes an earlier instrument. Its connection to the organ in this record remains unresolved.";
  if (d.realization === "proposed")
    return "The source presents a proposed design. This list does not establish that the design was built.";
  if (d.kind === "main")
    return sourceDatesConfiguration(d) ? "The source explicitly dates this configuration account. Present condition and continuous validity are not established." : "The source’s main listing. Its complete survey date and present condition are not established by this description.";
  if (d.timeKind === "document_date")
    return "The date belongs to the source document. It does not necessarily date the instrument’s configuration.";
  if (d.timeKind === "relative")
    return "The source dates this description relative to another account or event. Exact validity boundaries remain unspecified.";
  if (d.timeKind === "source_listing" && d.sortYear === null) return "A separately attributed source account. Its configuration date and present condition are not established.";
  return "A separately attributed source description. Its date does not imply that every component remained unchanged between documented periods.";
}

function OriginalSource({
  description,
}: {
  description: SpecificationDescription;
}) {
  return description.source.url ? (
    <a
      className="description-source-link"
      href={description.source.url}
      target="_blank"
      rel="noreferrer"
    >
      {description.source.source} <ExternalLink size={14} aria-hidden="true" />
    </a>
  ) : (
    <span>{description.source.source}</span>
  );
}

export function DescriptionHistory({
  descriptions,
}: {
  descriptions: SpecificationDescription[];
}) {
  const historical = descriptions.filter((d) => d.kind === "alternative");
  if (!historical.length) return null;
  return (
    <section
      className="description-history"
      aria-label="Specification descriptions in history"
    >
      <h3>Documented specifications</h3>
      <p>
        Open a source description alongside the event history. These accounts do
        not establish continuous physical states.
      </p>
      <div>
        {historical.map((d) => (
          <button
            key={d.id}
            type="button"
            onClick={() =>
              updateView({
                tab: "specification",
                specificationView: null,
                specificationSource: null,
                description: d.id,
                descriptionRevision: null,
                compare: null,
                compareRevision: null,
                component: null,
                pipe: null,
              })
            }
          >
            <strong>{d.periodLabel}</strong>
            <span>
              {subject(d)} · {d.stopCount} {stopCountLabel(d)}
            </span>
            <small>{d.source.source}</small>
            <ChevronRight size={16} aria-hidden="true" />
          </button>
        ))}
      </div>
    </section>
  );
}

function entryKey(e: DescriptionEntry) {
  return `${e.label}|${e.pitch ?? ""}`
    .normalize("NFC")
    .toLocaleLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function OrganSpecificationDescriptions({
  organ,
  components,
}: {
  organ: OrganDetail;
  components: ReactNode;
}) {
  const organId = organ.id;
  const descriptions = [...(organ.specificationDescriptions ?? [])].sort((a, b) => Number(a.coverage === "retained_source_transfer") - Number(b.coverage === "retained_source_transfer"));
  const [query, setQuery] = useState(window.location.search);
  const parameters = new URLSearchParams(query);
  const view = specificationView(parameters);
  const requested = parameters.get("description");
  const surface = useRef<HTMLDivElement>(null);
  const selected =
    preferredSpecificationDescription(descriptions, requested);
  const comparison = descriptions.find(
    (d) => d.id === parameters.get("compare") && d.id !== selected.id,
  );
  const [data, setData] = useState<SpecificationDescriptionDetail | null>(null);
  const [otherData, setOtherData] =
    useState<SpecificationDescriptionDetail | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [notice, setNotice] = useState("");
  const [evidence, setEvidence] = useState<{
    entry: DescriptionEntry;
    description: SpecificationDescriptionDetail;
    division: string;
  } | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const cache = useRef(new Map<string, SpecificationDescriptionDetail>());
  const main = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const sync = () => setQuery(window.location.search);
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);
  useEffect(() => {
    let active = true;
    setData(null);
    setOtherData(null);
    setError("");
    setEvidence(null);
    if (view === "components") return;
    async function get(d: SpecificationDescription) {
      const key = `${organId}|${d.id}|${d.revision}`;
      const cached = cache.current.get(key);
      if (cached) return cached;
      const loaded = await fetchSpecificationDescription(organId, d);
      if (cache.current.size >= 12)
        cache.current.delete(cache.current.keys().next().value!);
      cache.current.set(key, loaded);
      return loaded;
    }
    Promise.all([
      get(selected),
      comparison ? get(comparison) : Promise.resolve(null),
    ])
      .then(([first, second]) => {
        if (active) {
          setData(first);
          setOtherData(second);
        }
      })
      .catch((e: Error) => {
        if (active)
          setError(e.message || "The description could not be loaded.");
      });
    return () => {
      active = false;
    };
  }, [
    organId,
    view,
    selected.id,
    selected.revision,
    comparison?.id,
    comparison?.revision,
    attempt,
  ]);
  useEffect(() => {
    if (evidence) dialog.current?.showModal();
    else dialog.current?.close();
  }, [evidence]);

  function select(id: string) {
    updateView({
      specificationView: null,
      specificationSource: null,
      description: id,
      descriptionRevision: null,
      compare: null,
      compareRevision: null,
      component: null,
      pipe: null,
    });
    if (main.current && window.scrollY > main.current.offsetTop)
      main.current.scrollIntoView({ block: "start" });
  }
  async function copy() {
    const url = new URL(window.location.href);
    url.searchParams.set("description", selected.id);
    url.searchParams.set("descriptionRevision", selected.revision);
    if (comparison)
      url.searchParams.set("compareRevision", comparison.revision);
    try {
      await navigator.clipboard.writeText(url.href);
      setNotice("View link copied.");
    } catch {
      window.history.replaceState(null, "", url.href);
      setNotice("Copy the address bar to link to this view.");
    }
  }
  function openEntry(
    d: SpecificationDescriptionDetail,
    entry: DescriptionEntry,
    division: string,
  ) {
    const target = descriptionComponent(organ, d, entry);
    if (target) {
      updateView({
        specificationView: "components",
        specificationSource: target.sourceId,
        component: target.component.id,
        pipe: null,
      });
    } else {
      setEvidence({ entry, description: d, division });
    }
  }
  function changeView(next: "descriptions" | "components") {
    updateView({
      specificationView: next === "components" ? next : null,
      component: null,
      pipe: null,
    });
    surface.current?.scrollIntoView({ block: "start" });
  }
  function entries(
    d: SpecificationDescriptionDetail,
    group: SpecificationDescriptionDetail["groups"][number],
    otherKeys?: Set<string>,
  ) {
    return (
      <ul className="description-stops">
        {group.entries
          .filter((e) => e.kind === "stop")
          .map((e) => {
            const different = Boolean(otherKeys && !otherKeys.has(entryKey(e)));
            return (
              <li key={e.id}>
                <button
                  className={different ? "description-difference" : ""}
                  type="button"
                  onClick={() => openEntry(d, e, group.label)}
                  aria-label={`${descriptionComponent(organ, d, e) ? "Stop details" : "Source details"}: ${e.label}${e.pitch ? ` ${sourcePitchLabel(e.pitch)}` : ""}, ${d.periodLabel}, ${group.label}`}
                >
                  <span>
                    {e.label}
                    {different && <i aria-hidden="true" />}
                  </span>
                  <strong>{sourcePitchLabel(e.pitch)}</strong>
                </button>
              </li>
            );
          })}
      </ul>
    );
  }
  const stopGroups =
    data?.groups.filter((g) => g.entries.some((e) => e.kind === "stop")) ?? [];
  const comparisonNames =
    data && otherData
      ? [
          ...new Set(
            [...data.groups, ...otherData.groups]
              .filter((g) => g.entries.some((e) => e.kind === "stop"))
              .map((g) => (g.label === "Pedaal" ? "Pedal" : g.label)),
          ),
        ]
      : [];
  const auxiliaries =
    data?.groups.flatMap((g) =>
      g.entries
        .filter((e) => e.kind !== "stop")
        .map((entry) => ({ entry, division: g.label })),
    ) ?? [];
  const repeatedDivisions = [data, otherData].some((d) => {
    const names =
      d?.groups
        .filter((g) => g.entries.some((e) => e.kind === "stop"))
        .map((g) => (g.label === "Pedaal" ? "Pedal" : g.label)) ?? [];
    return new Set(names).size !== names.length;
  });
  const hasConflicts = Boolean(
    organ.technicalEvidence?.materialConflictCount ||
    organ.technicalEvidence?.facts?.some((f) =>
      f.conflictState.startsWith("material"),
    ) ||
    [
      organ.componentHierarchy,
      ...(organ.sourceSpecifications ?? []).map((s) => s.componentHierarchy),
    ]
      .flat(2)
      .some((g) =>
        g.items.some((c) =>
          c.sourceComparison?.fields.some((f) => f.status === "conflicting"),
        ),
      ),
  );

  return (
    <div className="specification-workspace" ref={surface}>
      <div
        className="specification-view-switch"
        role="group"
        aria-label="Specification view"
      >
        <button
          type="button"
          aria-pressed={view === "descriptions"}
          onClick={() => changeView("descriptions")}
        >
          <BookOpen size={17} aria-hidden="true" /> Descriptions by period
        </button>
        <button
          type="button"
          aria-pressed={view === "components"}
          onClick={() => changeView("components")}
        >
          Components &amp; source evidence
          {hasConflicts && (
            <span className="specification-differences">
              Source differences
            </span>
          )}
        </button>
      </div>
      {view === "components" ? (
        <div className="specification-record-evidence">
          <header>
            <h3>Components and source evidence</h3>
            <p>
              Explore full stop details, keyboards, pipe positions, tuning, and
              differences between sources. Each component set retains its own
              source. This evidence is not assigned to the selected historical
              description.
            </p>
            <button type="button" onClick={() => changeView("descriptions")}>
              Return to{" "}
              {comparison ? "period comparison" : selected.periodLabel}
            </button>
          </header>
          {descriptions.some((description) => description.coverage === "retained_source_transfer") && <p className="description-notice">This view includes retained source transfers. Their rows are not assigned to the separately recovered accounts. Open Descriptions by period to inspect each recovered stoplist and its source date.</p>}
          {components}
        </div>
      ) : (
        <div className="organ-descriptions">
          <aside
            className="description-sidebar"
            aria-label="Documented descriptions"
          >
            <header>
              Documented descriptions <span>{descriptions.length}</span>
            </header>
            {descriptions.map((d) => (
              <button
                key={d.id}
                type="button"
                className="description-option"
                aria-pressed={selected.id === d.id}
                onClick={() => select(d.id)}
              >
                <strong>
                  {d.periodLabel}
                  {selected.id === d.id && (
                    <Check size={16} aria-hidden="true" />
                  )}
                </strong>
                <span>{subject(d)}</span>
                <small>
                  {d.stopCount} {stopCountLabel(d)} · {d.source.source}
                </small>
              </button>
            ))}
            <p className="description-reading-note">
              Dates identify source descriptions. They do not establish
              uninterrupted material identity or continuous validity.
            </p>
          </aside>
          <div className="description-main" ref={main}>
            <div className="description-mobile-selector">
              <label htmlFor="organ-description">Period or description</label>
              <select
                id="organ-description"
                value={selected.id}
                onChange={(e) => select(e.target.value)}
              >
                {descriptions.map((d) => (
                  <option value={d.id} key={d.id}>
                    {d.periodLabel} · {subject(d)} · {d.source.source}
                  </option>
                ))}
              </select>
            </div>
            {requested && !descriptions.some((d) => d.id === requested) && (
              <p className="description-notice" role="status">
                The linked description is unavailable in this dataset. The
                available descriptions are listed here.
              </p>
            )}
            {parameters.get("descriptionRevision") &&
              parameters.get("descriptionRevision") !== selected.revision && (
                <p className="description-notice" role="status">
                  The linked revision is unavailable in this dataset. You are
                  viewing its current processing revision.
                </p>
              )}
            {comparison &&
              parameters.get("compareRevision") &&
              parameters.get("compareRevision") !== comparison.revision && (
                <p className="description-notice" role="status">
                  The linked comparison revision is unavailable. The comparison
                  uses the revision in this dataset.
                </p>
              )}
            <header className="description-heading">
              <div>
                <span className={`description-badge ${selected.kind}`}>
                  {selected.kind === "main" ? (
                    <BookOpen size={15} aria-hidden="true" />
                  ) : (
                    <Clock3 size={15} aria-hidden="true" />
                  )}
                  {comparison ? "Comparison" : subject(selected)}
                </span>
                <h3>
                  {comparison
                    ? "Two descriptions, side by side"
                    : selected.periodLabel}
                </h3>
                <p>
                  {selected.source.source} ·{" "}
                  {selected.kind === "main"
                    ? "Source listing"
                    : "Historical or alternative account"}
                </p>
              </div>
              <div className="description-actions">
                {descriptions.length > 1 && (
                  <button
                    type="button"
                    onClick={() =>
                      updateView({
                        description: selected.id,
                        compare: comparison
                          ? null
                          : descriptions.find((d) => d.id !== selected.id)!.id,
                        compareRevision: null,
                        component: null,
                        pipe: null,
                      })
                    }
                  >
                    <ArrowLeftRight size={16} aria-hidden="true" />
                    {comparison ? "Back to stoplist" : "Compare periods"}
                  </button>
                )}
                <button
                  type="button"
                  onClick={copy}
                  aria-label="Copy link to selected description"
                >
                  <Link2 size={16} aria-hidden="true" />
                </button>
              </div>
            </header>
            <span className="description-announcement" role="status">
              {notice}
            </span>
            {comparison && (
              <div className="description-compare-control">
                <label htmlFor="comparison-description">
                  Compare {selected.periodLabel} with
                </label>
                <select
                  id="comparison-description"
                  value={comparison.id}
                  onChange={(e) =>
                    updateView({
                      compare: e.target.value,
                      compareRevision: null,
                    })
                  }
                >
                  {descriptions
                    .filter((d) => d.id !== selected.id)
                    .map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.periodLabel} · {subject(d)} · {d.source.source}
                      </option>
                    ))}
                </select>
              </div>
            )}
            <div className="description-notice">
              <Info size={17} aria-hidden="true" />
              <span>
                {comparison
                  ? "Highlighted entries differ in wording or occur only in that list. A difference does not establish when a physical stop was added, removed, or replaced."
                  : contextNote(selected)}
              </span>
            </div>
            <ConfigurationChronology description={selected} />
            <SourceAccountEvidence description={selected} />
            {comparison && <section aria-label="Comparison account evidence"><h4>{comparison.periodLabel}</h4><ConfigurationChronology description={comparison} /><SourceAccountEvidence description={comparison} /></section>}
            {error ? (
              <div role="alert" className="description-error">
                <p>{error}</p>
                <button type="button" onClick={() => setAttempt((n) => n + 1)}>
                  Retry description
                </button>
              </div>
            ) : !data ||
              data.id !== selected.id ||
              data.revision !== selected.revision ||
              (comparison &&
                (!otherData ||
                  otherData.id !== comparison.id ||
                  otherData.revision !== comparison.revision)) ? (
              <p role="status" className="description-loading">
                Loading source description…
              </p>
            ) : (
              <>
                {comparison && otherData ? (
                  <>
                    <div className="description-compare-summary">
                      {[data, otherData].map((d) => (
                        <div key={d.id}>
                          <span>{d.periodLabel}</span>
                          <strong>
                            {d.stopCount} <small>{stopCountLabel(d)}</small>
                          </strong>
                          <small>
                            {subject(d)} · {d.source.source}
                          </small>
                        </div>
                      ))}
                    </div>
                    {repeatedDivisions ? (
                      <>
                        <p className="description-notice">
                          Some division names repeat. Every group is shown
                          separately; automatic alignment and difference
                          highlighting are unavailable for these lists.
                        </p>
                        <div className="description-unaligned">
                          {[data, otherData].map((d) => (
                            <section key={d.id}>
                              <h4>{d.periodLabel}</h4>
                              {d.groups
                                .filter((g) =>
                                  g.entries.some((e) => e.kind === "stop"),
                                )
                                .map((g, i) => (
                                  <section key={i}>
                                    <h4>{g.label}</h4>
                                    {entries(d, g)}
                                  </section>
                                ))}
                            </section>
                          ))}
                        </div>
                      </>
                    ) : (
                      comparisonNames.map((name) => {
                        const group = (d: SpecificationDescriptionDetail) =>
                          d.groups.find(
                            (g) =>
                              (g.label === "Pedaal" ? "Pedal" : g.label) ===
                              name,
                          );
                        const pairs = [data, otherData];
                        return (
                          <section
                            className="description-compare-division"
                            key={name}
                          >
                            <h4>{name}</h4>
                            <div>
                              {pairs.map((d, i) => {
                                const g = group(d);
                                const other = group(pairs[1 - i]);
                                const keys = new Set(
                                  other?.entries
                                    .filter((e) => e.kind === "stop")
                                    .map(entryKey) ?? [],
                                );
                                return (
                                  <div key={d.id}>
                                    <header>
                                      <strong>{d.periodLabel}</strong>
                                      <small>{d.source.source}</small>
                                    </header>
                                    {g ? (
                                      entries(d, g, keys)
                                    ) : (
                                      <p>
                                        No corresponding division was supplied.
                                      </p>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </section>
                        );
                      })
                    )}
                    <p className="description-footnote">
                      Spelling variants remain distinct. Pedal and Pedaal are
                      aligned for display; this does not identify shared
                      physical pipes.
                    </p>
                  </>
                ) : (
                  <>
                    <div className="description-metrics">
                      <span>
                        <strong>{data.stopCount}</strong> {stopCountLabel(data)}
                      </span>
                      <span>
                        <strong>{stopGroups.length}</strong> divisions with
                        stops
                      </span>
                      <OriginalSource description={data} />
                    </div>
                    <div className="description-list-heading">
                      <h4>Stoplist</h4>
                      <span>Select a stop for details and source evidence</span>
                    </div>
                    {stopGroups.length ? (
                      <div className="description-divisions">
                        {stopGroups.map((g, i) => (
                          <section key={`${g.label}-${i}`} aria-label={g.label}>
                            <header>
                              <div>
                                <h4>{g.label}</h4>
                                <span>
                                  {
                                    g.entries.filter((e) => e.kind === "stop")
                                      .length
                                  }{" "}
                                  stop
                                  {g.entries.filter((e) => e.kind === "stop")
                                    .length === 1
                                    ? ""
                                    : "s"}
                                </span>
                              </div>
                              {g.compass && (
                                <small>Source compass · {g.compass}</small>
                              )}
                            </header>
                            {entries(data, g)}
                          </section>
                        ))}
                      </div>
                    ) : (
                      <p className="description-empty">
                        This source description contains no usable stop entries.
                        Its attribution and any separate technical facts remain
                        available below.
                      </p>
                    )}
                    {auxiliaries.length > 0 && (
                      <details className="description-disclosure">
                        <summary>
                          Other specification entries{" "}
                          <span>{auxiliaries.length}</span>
                        </summary>
                        <div className="description-auxiliaries">
                          {auxiliaries.map(({ entry, division }) => (
                            <button
                              type="button"
                              key={entry.id}
                              onClick={() => openEntry(data, entry, division)}
                            >
                              {entry.label}
                              <small>{division}</small>
                            </button>
                          ))}
                        </div>
                      </details>
                    )}
                    <SourceReportedTotals facts={data.technicalFacts} />
                    {data.technicalFacts.length > 0 && (
                      <details className="description-disclosure">
                        <summary>Technical facts from this description</summary>
                        <dl className="description-technical">
                          {data.technicalFacts.map((f) => (
                            <div key={f.id}>
                              <dt>{f.label}</dt>
                              <dd>
                                {f.family === "temperament" ? (
                                  <a href={temperamentSearchUrl(f.value)}>{f.value}</a>
                                ) : f.value}
                              </dd>
                            </div>
                          ))}
                        </dl>
                        <p>
                          These assertions belong to the selected source
                          account. Missing values are not inherited from another
                          period.
                        </p>
                      </details>
                    )}
                    <details className="description-disclosure">
                      <summary>Source and dating</summary>
                      <p>{data.sourceHeading}</p>
                      <p>
                        {contextNote(data)}{" "}
                        {["partial", "partial_structured_stops"].includes(data.coverage)
                          ? "The source identifies partial coverage."
                          : "Completeness beyond the captured source entries is unspecified."}
                      </p>
                      <OriginalSource description={data} />
                      <dl>
                        <dt>Source record</dt>
                        <dd>{data.source.id}</dd>
                        <dt>Description revision</dt>
                        <dd>
                          <code>{data.revision}</code>
                        </dd>
                        <dt>Evidence locations</dt>
                        {data.sourcePaths.map((p) => (
                          <dd key={p}>
                            <code>{p}</code>
                          </dd>
                        ))}
                      </dl>
                    </details>
                    <p className="description-footnote">
                      Counts describe source entries. Mixtures remain single
                      stops; no physical pipe total or present condition is
                      inferred.
                    </p>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      )}
      <dialog
        className="description-dialog"
        ref={dialog}
        onClose={() => setEvidence(null)}
        aria-labelledby="description-evidence-title"
      >
        {evidence && (
          <>
            <header>
              <div>
                <span className="description-badge">
                  Source entry · {evidence.description.periodLabel}
                </span>
                <h3 id="description-evidence-title">
                  {evidence.entry.label}
                  {evidence.entry.pitch ? ` ${sourcePitchLabel(evidence.entry.pitch)}` : ""}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setEvidence(null)}
                aria-label="Close source details"
              >
                <X size={20} aria-hidden="true" />
              </button>
            </header>
            <p>
              {evidence.division} · {subject(evidence.description)}
            </p>
            <blockquote>{evidence.entry.wording}</blockquote>
            <p>{contextNote(evidence.description)}</p>
            {evidence.entry.dates.length > 0 && (
              <p>
                Dates on this entry: {evidence.entry.dates.join(" / ")}. These
                do not date the whole specification.
              </p>
            )}
            <details className="description-disclosure">
              <summary>Exact evidence locations</summary>
              <p>{evidence.description.source.id}</p>
              {evidence.entry.sourcePaths.map((p) => (
                <p key={p}>
                  <code>{p}</code>
                </p>
              ))}
              {evidence.entry.recoveredFromHeading && (
                <p>
                  This entry was preserved in the division heading and recovered
                  during normalization.
                </p>
              )}
              <p>
                <code>{evidence.description.sourceRevision}</code>
              </p>
            </details>
            <OriginalSource description={evidence.description} />
          </>
        )}
      </dialog>
    </div>
  );
}
