import {
  Activity,
  ArrowLeft,
  BookOpen,
  Clipboard,
  ExternalLink,
  Gauge,
  Link2,
  Music2,
  Waves,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import {
  fetchFunctionalPipePositionDetail,
  type FunctionalPipePositionDetail,
} from "./api";
import "./pipework.css";


function signed(value: number, digits = 0): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(digits)}`;
}

function evidenceValue(value: number | string | null | undefined, unit?: string | null): string {
  if (value == null || value === "") return "Recorded without a normalized numeric value";
  return `${value}${unit ? ` ${unit}` : ""}`;
}

export function PipePositionDetailPage({
  componentId,
  organId,
  referenceId,
}: {
  componentId: string;
  organId: string;
  referenceId: string;
}) {
  const [detail, setDetail] = useState<FunctionalPipePositionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const requestKey = `${organId}:${componentId}:${referenceId}`;

  useEffect(() => {
    let cancelled = false;
    setDetail(null);
    setError(null);
    fetchFunctionalPipePositionDetail(organId, componentId, referenceId)
      .then((result) => {
        if (cancelled) return;
        setDetail(result);
        document.title = `${result.position.label} | MODAVIS Navigator`;
        if (result.canonicalPath && result.canonicalPath !== window.location.pathname) {
          window.history.replaceState({}, "", result.canonicalPath);
        }
      })
      .catch((cause: Error) => {
        if (!cancelled) setError(cause.message);
      });
    return () => {
      cancelled = true;
    };
  }, [requestKey]);

  const specificationUrl = useMemo(() => {
    const search = new URLSearchParams({
      organ: organId,
      tab: "specification",
      component: componentId,
      pipe: detail?.position.id || referenceId,
    });
    return `/organs?${search.toString()}`;
  }, [componentId, detail?.position.id, organId, referenceId]);

  if (error) {
    return (
      <section className="entity-section pipe-position-record-page">
        <a className="text-link-button pipe-position-record-back" href={specificationUrl}><ArrowLeft size={15} /> Back to specification</a>
        <div className="notice error" role="alert">This pipe-position reference could not be resolved: {error}</div>
      </section>
    );
  }
  if (!detail) return <p className="notice" role="status">Resolving functional pipe position…</p>;

  const { position } = detail;
  const canonicalUrl = new URL(detail.canonicalPath, window.location.origin).toString();
  const hasEvidence = detail.measurements.length + detail.occupancies.length + detail.relatedResources.length > 0;

  return (
    <article className="entity-section pipe-position-record-page" id="pipe-position-record" tabIndex={-1}>
      <nav className="pipe-position-breadcrumbs" aria-label="Pipe-position context">
        <a href={detail.organ.pageUrl || `/organs?organ=${encodeURIComponent(detail.organ.id)}`}>{detail.organ.title}</a>
        <span aria-hidden="true">›</span>
        <a href={specificationUrl}>{detail.register.divisionLabel || "Specification"}</a>
        <span aria-hidden="true">›</span>
        <a href={specificationUrl}>{detail.register.label || "Register"}</a>
        <span aria-hidden="true">›</span>
        <span>{position.actuationNote || `Key ${position.noteOrdinal}`}</span>
      </nav>

      <header className="pipe-position-record-hero">
        <div>
          <p className="eyebrow">Functional pipe position</p>
          <h1>{position.label}</h1>
          <p>{detail.organ.title}{detail.register.divisionLabel ? ` · ${detail.register.divisionLabel}` : ""}</p>
          <div className="pipe-position-record-badges" aria-label="Identity and evidence status">
            <span>Derived position</span>
            {position.soundingPitchStatus === "assumed_from_stop_designation" && <span>Nominal pitch assumed</span>}
            {detail.measurements.length > 0 && <span className="measured">Measured evidence available</span>}
            {detail.occupancies.length > 0 && <span className="physical">Physical occupancy documented</span>}
          </div>
        </div>
        <div className="pipe-position-record-actions">
          <button
            className="secondary"
            type="button"
            onClick={() => {
              navigator.clipboard.writeText(canonicalUrl).then(() => {
                setCopied(true);
                window.setTimeout(() => setCopied(false), 1400);
              });
            }}
          >
            <Clipboard size={15} aria-hidden="true" /> {copied ? "Copied" : "Copy permalink"}
          </button>
          <a className="secondary" href={specificationUrl}><ArrowLeft size={15} aria-hidden="true" /> Open in specification</a>
        </div>
      </header>

      <div className="pipe-position-record-grid">
        <section className="panel-block pipe-position-record-primary">
          <div className="section-heading">
            <h2>Position and pitch</h2>
            <span>The functional slot remains distinct from any physical pipe that occupies it.</span>
          </div>
          <dl className="pipe-position-record-facts">
            <div><dt>Actuation</dt><dd>{position.actuationNote || `Key ${position.noteOrdinal}`}{position.actuationMidi != null ? ` · MIDI ${position.actuationMidi}` : ""}</dd></div>
            <div><dt>Rank position</dt><dd>{position.rankOrdinal}</dd></div>
            <div>
              <dt>Nominal sounding pitch</dt>
              <dd>
                {position.soundingNote || "Not established"}{position.soundingMidi != null ? ` · MIDI ${position.soundingMidi}` : ""}
                {position.soundingPitchStatus === "assumed_from_stop_designation" && <small>Assumed from the stop designation; not confirmed by frequency analysis.</small>}
              </dd>
            </div>
            {detail.nominalPitchRelation && (
              <div>
                <dt>Nominal interval</dt>
                <dd>
                  {signed(detail.nominalPitchRelation.nearestSemitoneOffset)} semitones
                  {Math.abs(detail.nominalPitchRelation.centsFromNearestTwelveTetSemitone) >= 0.01
                    ? ` · ${signed(detail.nominalPitchRelation.centsFromNearestTwelveTetSemitone, 2)} cents from 12-TET`
                    : ""}
                </dd>
              </div>
            )}
            <div><dt>Physical pipe</dt><dd>{detail.occupancies.length > 0 ? `${detail.occupancies.length} documented occupancy record${detail.occupancies.length === 1 ? "" : "s"}` : "No physical identity asserted"}</dd></div>
          </dl>
          <div className="pipe-position-identity-boundary" role="note">
            <Music2 size={18} aria-hidden="true" />
            <div>
              <strong>A referenceable functional position</strong>
              <span>This record denotes one documented key × rank position. Replacement pipes can occupy it over time without becoming the same physical object.</span>
            </div>
          </div>
        </section>

        <aside className="panel-block pipe-position-record-identity">
          <div className="section-heading"><h2>Reference</h2></div>
          <code>{position.id}</code>
          <dl className="pipe-position-record-facts compact">
            <div><dt>Contract</dt><dd>{detail.contractVersion}</dd></div>
            <div><dt>Persistence</dt><dd>{detail.persistence.status === "virtual" ? "Generated on demand" : "Persisted because evidence is attached"}</dd></div>
            <div><dt>Specification revision</dt><dd><code>{detail.specificationRevisionSha256}</code></dd></div>
            <div><dt>Derivation</dt><dd>{position.formula || position.derivationMethod}</dd></div>
          </dl>
          {(position.referenceAliases ?? []).length > 0 && (
            <details>
              <summary>Earlier resolvable references</summary>
              {(position.referenceAliases ?? []).map((alias) => <code key={alias}>{alias}</code>)}
            </details>
          )}
        </aside>
      </div>

      {detail.measurements.length > 0 && (
        <section className="panel-block pipe-position-record-section">
          <div className="section-heading">
            <h2><Waves size={19} aria-hidden="true" /> Acoustic and physical measurements</h2>
            <span>Independent observations; they do not overwrite the nominal stop-designation assumption.</span>
          </div>
          <div className="pipe-position-evidence-cards">
            {detail.measurements.map((measurement) => (
              <article key={measurement.id}>
                <Gauge size={18} aria-hidden="true" />
                <div>
                  <strong>{measurement.property}</strong>
                  <span>{evidenceValue(measurement.value ?? measurement.rawValue, measurement.unit)}</span>
                  <small>
                    {measurement.uncertainty != null ? `Uncertainty ±${measurement.uncertainty}${measurement.unit ? ` ${measurement.unit}` : ""}` : "Uncertainty not supplied"}
                    {measurement.method ? ` · ${measurement.method}` : ""}
                  </small>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {detail.occupancies.length > 0 && (
        <section className="panel-block pipe-position-record-section">
          <div className="section-heading">
            <h2><Activity size={19} aria-hidden="true" /> Physical occupancy</h2>
            <span>Item-evidenced physical pipes and their time-scoped manifestations.</span>
          </div>
          <div className="pipe-position-evidence-cards">
            {detail.occupancies.map((occupancy) => (
              <article key={occupancy.id}>
                <Link2 size={18} aria-hidden="true" />
                <div>
                  <strong>{occupancy.physicalPipePageUrl ? <a href={occupancy.physicalPipePageUrl}>{occupancy.physicalPipeLabel}</a> : occupancy.physicalPipeLabel}</strong>
                  <span>{occupancy.evidenceStatus || "Documented occupancy"}</span>
                  {occupancy.pipeManifestationId != null && <small>Manifestation {occupancy.pipeManifestationId}</small>}
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {detail.relatedResources.length > 0 && (
        <section className="panel-block pipe-position-record-section">
          <div className="section-heading">
            <h2><BookOpen size={19} aria-hidden="true" /> Related research and resources</h2>
            <span>Publications and entities that explicitly target this position.</span>
          </div>
          <div className="pipe-position-evidence-cards">
            {detail.relatedResources.map((resource) => (
              <article key={resource.id}>
                <BookOpen size={18} aria-hidden="true" />
                <div>
                  <strong>{resource.pageUrl ? <a href={resource.pageUrl}>{resource.title} <ExternalLink size={13} aria-hidden="true" /></a> : resource.title}</strong>
                  <span>{resource.relation}</span>
                  <small>{resource.kind}</small>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {!hasEvidence && (
        <section className="panel-block pipe-position-record-empty">
          <Link2 size={20} aria-hidden="true" />
          <div>
            <strong>No item-level evidence is attached yet</strong>
            <span>The stable reference is ready for publications, measurements, recordings, and later physical-pipe occupancy evidence.</span>
          </div>
        </section>
      )}
    </article>
  );
}
