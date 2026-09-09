import { Clipboard, ExternalLink, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import {
  fetchFunctionalPipePositions,
  type FunctionalPipePositionPage,
  type FunctionalPipePositionReference,
  type OrganComponent,
} from "./api";
import "./pipework.css";


function legacyPositionUrl(organId: string, componentId: string, referenceId: string): string {
  const search = new URLSearchParams({
    organ: organId,
    tab: "specification",
    component: componentId,
    pipe: referenceId,
  });
  return `/organs?${search.toString()}`;
}

function absoluteUrl(path: string): string {
  return new URL(path, window.location.origin).toString();
}

function signed(value: number, digits = 0): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(digits)}`;
}

function CopyReferenceButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className="secondary pipe-position-copy"
      type="button"
      onClick={() => {
        navigator.clipboard.writeText(value).then(() => {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1400);
        });
      }}
    >
      <Clipboard size={14} aria-hidden="true" /> {copied ? "Copied" : "Copy reference"}
    </button>
  );
}

export function PipePositionBrowser({
  component,
  initialReferenceId,
  organId,
  organTitle,
  onClose,
}: {
  component: OrganComponent;
  initialReferenceId?: string | null;
  organId: string;
  organTitle: string;
  onClose: () => void;
}) {
  const pageSize = 100;
  const [offset, setOffset] = useState(0);
  const [page, setPage] = useState<FunctionalPipePositionPage | null>(null);
  const [selected, setSelected] = useState<FunctionalPipePositionReference | null>(null);
  const [error, setError] = useState<string | null>(null);
  const requestKey = `${organId}:${component.id}:${offset}:${initialReferenceId || ""}`;

  useEffect(() => {
    let cancelled = false;
    setError(null);
    fetchFunctionalPipePositions(organId, component.id, {
      offset,
      limit: pageSize,
      referenceId: initialReferenceId,
    })
      .then((result) => {
        if (cancelled) return;
        setPage(result);
        setSelected(result.selected ?? (initialReferenceId ? null : result.items[0] ?? null));
      })
      .catch((cause: Error) => {
        if (!cancelled) setError(cause.message);
      });
    return () => {
      cancelled = true;
    };
  }, [requestKey]);

  const totalPages = Math.max(1, Math.ceil((page?.total ?? 0) / pageSize));
  const currentPage = Math.floor(offset / pageSize) + 1;
  const selectedUrl = useMemo(
    () => selected ? (selected.canonicalPath || legacyPositionUrl(organId, component.id, selected.id)) : null,
    [component.id, organId, selected],
  );

  function selectPosition(item: FunctionalPipePositionReference) {
    setSelected(item);
    const url = new URL(window.location.href);
    url.searchParams.set("component", component.id);
    url.searchParams.set("pipe", item.id);
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  }

  function close() {
    const url = new URL(window.location.href);
    url.searchParams.delete("pipe");
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
    onClose();
  }

  return (
    <div className="modal-backdrop pipe-position-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) close();
    }}>
      <section className="pipe-position-modal" role="dialog" aria-modal="true" aria-labelledby="pipe-position-title">
        <header>
          <div>
            <p className="eyebrow">Functional pipe positions</p>
            <h3 id="pipe-position-title">{component.label}</h3>
            <span>{organTitle}{component.pipeQuantity?.divisionLabel ? ` · ${component.pipeQuantity.divisionLabel}` : ""}</span>
          </div>
          <button type="button" className="icon-button" aria-label="Close pipe positions" onClick={close}><X size={19} /></button>
        </header>
        <div className="pipe-position-boundary" role="note">
          <strong>Referenceable derived positions</strong>
          <span>
            Each reference denotes one documented key × rank position. It can be cited or linked to a publication; it does not claim that a particular observed physical pipe has been identified.
          </span>
        </div>
        {error && <p className="notice error">{error}</p>}
        {!page && !error && <p className="notice">Loading positions…</p>}
        {page?.status === "unavailable" && (
          <p className="notice">Individual references require an exact compass and rank count; this stop currently has a bounded range only.</p>
        )}
        {page?.status === "available" && (
          <div className="pipe-position-layout">
            <div className="pipe-position-list-panel">
              <div className="pipe-position-list-head">
                <strong>{page.total.toLocaleString()} positions</strong>
                <span>Page {currentPage} of {totalPages}</span>
              </div>
              <div className="pipe-position-list" role="listbox" aria-label={`${component.label} positions`}>
                {page.items.map((item) => (
                  <button
                    type="button"
                    role="option"
                    aria-selected={selected?.id === item.id}
                    className={selected?.id === item.id ? "selected" : ""}
                    key={item.id}
                    onClick={() => selectPosition(item)}
                  >
                    <span>{item.actuationNote || `Key ${item.noteOrdinal}`}</span>
                    <strong>{item.registerLabel}{item.rankOrdinal > 1 || (component.pipeQuantity?.rankCountUpper ?? 1) > 1 ? ` · rank ${item.rankOrdinal}` : ""}</strong>
                    <small>{item.id}</small>
                  </button>
                ))}
              </div>
              {totalPages > 1 && (
                <div className="pipe-position-pagination">
                  <button type="button" className="secondary" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - pageSize))}>Previous</button>
                  <button type="button" className="secondary" disabled={offset + pageSize >= page.total} onClick={() => setOffset(offset + pageSize)}>Next</button>
                </div>
              )}
            </div>
            <aside className="pipe-position-detail">
              {selected ? (
                <>
                  <p className="eyebrow">Derived pipe-position entity</p>
                  <h4>{selected.label}</h4>
                  <code>{selected.id}</code>
                  <dl>
                    <div><dt>Actuation</dt><dd>{selected.actuationNote || `Key ${selected.noteOrdinal}`}{selected.actuationMidi != null ? ` · MIDI ${selected.actuationMidi}` : ""}</dd></div>
                    <div><dt>Rank position</dt><dd>{selected.rankOrdinal}</dd></div>
                    <div>
                      <dt>Sounding pitch</dt>
                      <dd>
                        {selected.soundingNote || "Not established for this rank"}
                        {selected.soundingMidi != null ? ` · MIDI ${selected.soundingMidi}` : ""}
                        {selected.soundingPitchStatus === "assumed_from_stop_designation" && page.nominalPitchRelation && (
                          <small className="pipe-position-assumption">
                            Assumed from the {page.nominalPitchRelation.pitchFeet.display}′ stop designation—not confirmed by frequency analysis.
                          </small>
                        )}
                      </dd>
                    </div>
                    {page.nominalPitchRelation && (
                      <div>
                        <dt>Nominal interval</dt>
                        <dd>
                          {signed(page.nominalPitchRelation.nearestSemitoneOffset)} semitones from the played key
                          {Math.abs(page.nominalPitchRelation.centsFromNearestTwelveTetSemitone) >= 0.01
                            ? ` · ${signed(page.nominalPitchRelation.centsFromNearestTwelveTetSemitone, 2)} cents from 12-TET`
                            : ""}
                        </dd>
                      </div>
                    )}
                    <div><dt>Derivation</dt><dd>{selected.formula}</dd></div>
                    <div><dt>Physical identity</dt><dd>Not asserted</dd></div>
                  </dl>
                  <p>
                    A document may target this stable functional-position reference. The displayed nominal pitch is an explicit stop-designation assumption, not acoustic confirmation. If item-level evidence later identifies the occupying physical pipe, that continuant is linked separately and can change across replacements.
                  </p>
                  <div className="pipe-position-actions">
                    {selectedUrl && <CopyReferenceButton value={absoluteUrl(selectedUrl)} />}
                    {selectedUrl && <a className="secondary" href={selectedUrl}><ExternalLink size={14} aria-hidden="true" /> Open full record</a>}
                  </div>
                </>
              ) : <p className="muted">Select a position to inspect its reference.</p>}
            </aside>
          </div>
        )}
      </section>
    </div>
  );
}
