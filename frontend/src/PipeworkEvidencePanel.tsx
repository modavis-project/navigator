import { ChevronDown, Hash, Info } from "lucide-react";

import type { PipeworkQuantity, PipeworkReadModel } from "./api";
import "./pipework.css";


function countLabel(quantity: PipeworkQuantity): string {
  if (quantity.exactCount != null) return quantity.exactCount.toLocaleString();
  if (quantity.lowerBound != null && quantity.upperBound != null) {
    return `${quantity.lowerBound.toLocaleString()}–${quantity.upperBound.toLocaleString()}`;
  }
  if (quantity.lowerBound != null) return `≥${quantity.lowerBound.toLocaleString()}`;
  if (quantity.upperBound != null) return `≤${quantity.upperBound.toLocaleString()}`;
  return "—";
}

function methodLabel(value: string): string {
  return value.replace(/_/g, " ").replace(/^./, (character: string) => character.toUpperCase());
}

function compactList(values: unknown[]): string {
  return values
    .slice(0, 5)
    .map((value) => typeof value === "string" ? value : JSON.stringify(value))
    .join("; ");
}

export function PipeworkEvidencePanel({ pipework }: { pipework?: PipeworkReadModel | null }) {
  if (!pipework || pipework.status !== "available") return null;
  const asserted = pipework.quantities.filter((quantity) => quantity.kind === "asserted_physical_pipe_count");
  const primary = asserted[0] ?? pipework.quantities[0];
  const registerSummary = pipework.registerQuantitySummary;
  if (!primary && !registerSummary?.quantifiedRegisterCount) return null;
  const distinctAssertedTotals = new Set(
    asserted.map((quantity) => `${quantity.exactCount ?? ""}:${quantity.lowerBound ?? ""}:${quantity.upperBound ?? ""}`),
  );
  const sourceTotalsDiffer = distinctAssertedTotals.size > 1;
  const primaryValue = sourceTotalsDiffer
    ? `${asserted.length.toLocaleString()} source totals`
    : primary
    ? countLabel(primary)
    : `${registerSummary?.quantifiedRegisterCount.toLocaleString()} registers`;
  const primaryLabel = sourceTotalsDiffer
    ? "Sources report different physical-pipe totals"
    : primary
    ? (asserted.length > 0 ? "Source-reported physical-pipe total" : primary.label)
    : "Register quantities available";
  return (
    <section className="panel-block pipework-panel" aria-labelledby="pipework-heading">
      <details className="pipework-disclosure">
        <summary>
          <span className="pipework-summary-label">
            <Hash size={16} aria-hidden="true" />
            <span><b id="pipework-heading">Pipes</b><small>{primaryLabel}</small></span>
          </span>
          <strong>{primaryValue}</strong>
          <span className="pipework-summary-indicator">
            {sourceTotalsDiffer ? "Sources differ" : asserted.length > 0 ? "Source total" : "Calculated"}
            <Info size={15} aria-hidden="true" /> Details
            <ChevronDown size={15} aria-hidden="true" />
          </span>
        </summary>
        <div className="pipework-disclosure-body">
          {sourceTotalsDiffer && (
            <p className="pipework-source-difference" role="note">
              These totals describe independently attributed source configurations. None is silently selected as the
              current physical state.
            </p>
          )}
          {registerSummary && registerSummary.quantifiedRegisterCount > 0 && (
            <div className="pipework-register-summary">
              <strong>{registerSummary.quantifiedRegisterCount.toLocaleString()} of {registerSummary.registerCount.toLocaleString()} registers quantified</strong>
              <span>
                {registerSummary.nominalEstimateCount.toLocaleString()} nominal estimates
                {(registerSummary.sourceAssertedCount ?? 0) > 0
                  ? ` · ${registerSummary.sourceAssertedCount?.toLocaleString()} source-asserted stop counts`
                  : ""}
                {registerSummary.sharedOrExtendedCount > 0
                  ? ` · ${registerSummary.sharedOrExtendedCount.toLocaleString()} shared or extended ranks kept non-additive`
                  : ""}
              </span>
              <small>Select a register below to inspect its compass × rank calculation.</small>
              {(registerSummary.referenceablePositionCount ?? 0) > 0 && (
                <small>
                  {registerSummary.referenceablePositionCount?.toLocaleString()} functional positions can be opened and cited individually from their register details.
                </small>
              )}
              {(registerSummary.nominalPitchAssumptionRegisterCount ?? 0) > 0 && (
                <small>
                  {registerSummary.nominalPitchAssumptionRegisterCount?.toLocaleString()} register pitch relation{registerSummary.nominalPitchAssumptionRegisterCount === 1 ? " is" : "s are"} deterministically assumed from stop designations and labelled as unconfirmed by frequency analysis.
                </small>
              )}
            </div>
          )}
          {pipework.quantities.length > 0 && (
            <div className="pipework-methods" aria-label="Pipe quantity evidence">
              {pipework.quantities.map((quantity) => (
                <article key={`method:${quantity.kind}:${quantity.stateQualifier}:${quantity.exactCount ?? "range"}`}>
                  <header>
                    <span><b>{quantity.label}</b><small>{quantity.stateQualifier}</small></span>
                    <strong>{countLabel(quantity)}</strong>
                  </header>
                  <p>{methodLabel(quantity.method)}</p>
                  {quantity.sources && quantity.sources.length > 0 && (
                    <p className="pipework-sources">
                      {quantity.sources.map((source, index) => (
                        <span key={`${source.id || source.title}:${index}`}>
                          {index > 0 ? " · " : "Evidence: "}
                          {source.url ? (
                            <a href={source.url} target="_blank" rel="noreferrer">
                              {source.title || "Source"}
                            </a>
                          ) : (source.title || "Source")}
                        </span>
                      ))}
                    </p>
                  )}
                  {quantity.formula && <code>{quantity.formula}</code>}
                  {quantity.assumptions.length > 0 && <p><b>Assumptions:</b> {compactList(quantity.assumptions)}</p>}
                  {quantity.exclusions.length > 0 && <p><b>Excluded:</b> {compactList(quantity.exclusions)}</p>}
                </article>
              ))}
            </div>
          )}
          <p className="pipework-identity-boundary">
            {registerSummary?.quantifiedRegisterCount
              ? "Exact register estimates create stable references for functional pipe positions, not claims about observed physical objects. "
              : "Source totals describe a reported organ configuration; stop/register rows are controls and are not counted as physical pipes. "}
            Currently resolved physical pipe continuants: {pipework.identityPolicy.resolvedPhysicalPipeCount.toLocaleString()}.
          </p>
          {pipework.source?.derivationSha256 && (
            <p className="pipework-fixity">
              Derivation <code>{pipework.source.derivationSha256}</code>
              {pipework.source.algorithm?.version ? ` · algorithm ${pipework.source.algorithm.version}` : ""}
            </p>
          )}
          {pipework.positionCandidates.length > 0 && (
            <details className="pipework-positions">
              <summary><ChevronDown size={15} aria-hidden="true" /> Preview functional positions ({pipework.positionCandidateCount.toLocaleString()})</summary>
              <div className="pipework-position-table-wrap">
                <table>
                  <thead><tr><th>Rank</th><th>Actuation</th><th>Sounds</th><th>Ordinal</th><th>Identity</th></tr></thead>
                  <tbody>
                    {pipework.positionCandidates.map((position) => (
                      <tr key={position.candidateKey || `${position.rankKey}:${position.actuationNote}:${position.ordinal}`}>
                        <td>{position.rankKey || "Unspecified"}</td>
                        <td>{position.actuationNote || "Unspecified"}</td>
                        <td>{position.soundingNote || "Unspecified"}</td>
                        <td>{position.ordinal ?? 1}</td>
                        <td>Candidate position—not a pipe ID</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          )}
        </div>
      </details>
    </section>
  );
}
