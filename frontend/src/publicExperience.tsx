import { ParticipantIdentityNote } from "./eventParticipation";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { ArrowRight, BookOpen, Check, Clipboard, History, Link2, Music2, X } from "lucide-react";
import type { OrganDetail, SpecificationDescription } from "./api";
import "./publicExperience.css";

export function NavigatorMark() {
  return <svg className="navigator-mark" viewBox="0 0 40 40" aria-hidden="true" focusable="false">
    <path d="M5 31V18M12.5 31V11M20 31V5M27.5 31V11M35 31V18" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
    <path d="m10 35 10-8 10 8M20 27v9" fill="none" stroke="#d7b772" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>;
}

export function stableRecordUrl(id: string): string {
  const match = /^MDVS:(ENTY|LOCN|NAME):(.+)$/.exec(id);
  if (!match) return "";
  const segments: Record<string, string> = { ENTY: "entity", LOCN: "location", NAME: "name" };
  return `https://w3id.org/modavis/${segments[match[1]]}/${encodeURIComponent(match[2])}`;
}

export function IdentifierCopy({ id, url }: { id: string; url?: string }) {
  const [state, setState] = useState<"idle" | "copied" | "error">("idle");
  const stableUrl = url || stableRecordUrl(id);
  const target = stableUrl || id;
  const targetLabel = stableUrl ? "w3id URL" : "identifier";
  useEffect(() => { if (state === "idle") return; const timer = window.setTimeout(() => setState("idle"), 2200); return () => window.clearTimeout(timer); }, [state]);
  return <button className="identifier-copy" type="button" title={`Copy ${targetLabel}: ${target}`} aria-label={`Copy ${targetLabel} for ${id}`} onClick={async () => {
    try { await navigator.clipboard.writeText(target); setState("copied"); } catch { setState("error"); }
  }}><span>{id}</span>{state === "copied" ? <Check size={13} /> : stableUrl ? <Link2 size={13} /> : <Clipboard size={13} />}<span className="sr-only" role="status">{state === "copied" ? `${stableUrl ? "Stable URL" : "Identifier"} copied` : state === "error" ? `Could not copy. ${targetLabel}: ${target}` : ""}</span></button>;
}

export function PublicModal({ title, children, onClose, wide = false }: { title: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const label = useId();
  useEffect(() => {
    const dialog = ref.current;
    const previous = document.activeElement as HTMLElement | null;
    dialog?.showModal();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { dialog?.close(); document.body.style.overflow = overflow; previous?.focus(); };
  }, []);
  return <dialog ref={ref} className={`public-modal${wide ? " public-modal-wide" : ""}`} aria-labelledby={label} onCancel={(event) => { event.preventDefault(); onClose(); }} onClick={(event) => { if (event.target === event.currentTarget) { const box = event.currentTarget.getBoundingClientRect(); if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) onClose(); } }}>
    <header><h2 id={label}>{title}</h2><button type="button" className="icon-button" aria-label={`Close ${title}`} onClick={onClose} autoFocus><X size={20} /></button></header>
    <div className="public-modal-content">{children}</div>
  </dialog>;
}

const text = (value: unknown) => typeof value === "string" || typeof value === "number" ? String(value) : "";
function participants(item: Record<string, unknown>): Array<{ name: string; role: string; url: string; mdvsId: string; resolutionState: string }> {
  return (Array.isArray(item.participants) ? item.participants : []).filter((value): value is Record<string, unknown> => !!value && typeof value === "object").map(value => ({ name: text(value.name || value.wording), role: text((value.activities as string[] | undefined)?.[0] || value.role), url: text(value.pageUrl), mdvsId: text(value.mdvsId), resolutionState: text(value.resolutionState) }));
}
function ParticipantNames({ item }: { item: Record<string, unknown> }) {
  return <>{participants(item).map((person, index) => <span className="activity-person" key={`${person.name}:${index}`}>{person.url ? <a href={person.url}>{person.name}</a> : person.name}{person.role && <small>{person.role.replace(/_/g, " ")}</small>}<small><ParticipantIdentityNote participant={{ ...person, pageUrl: person.url }} /></small></span>)}</>;
}

export function HistoryTimeline({ items }: { items: Record<string, unknown>[] }) {
  return <div className="biography-timeline"><p className="muted">Dates and participants as documented by the sources. Separate assertions may describe the same activity.</p>
    <ol>{items.map((item, index) => <li key={text(item.id) || index}><time>{text(item.date) || "Undated"}</time><div><h3>{item.pageUrl ? <a href={text(item.pageUrl)}>{text(item.label || item.title)}</a> : text(item.label || item.title)}</h3><ParticipantNames item={item} />{item.source !== null && typeof item.source === "object" && <small>{text((item.source as Record<string, unknown>).source).replace(/^src:/, "")}</small>}{item.sourceOnly === true && <small>Source wording; no controlled type assigned</small>}</div></li>)}</ol>
    {!items.length && <p>No activities are documented in this record.</p>}
  </div>;
}

export function ActivityDiagrams({ items }: { items: Record<string, unknown>[] }) {
  const types = new Map<string, number>();
  const people = new Map<string, { count: number; name: string; url: string; mdvsId: string; resolutionState: string }>();
  const controlled = new Set<string>();
  for (const item of items) {
    const label = text(item.label || item.title || item.eventType) || "Other activity";
    types.set(label, (types.get(label) || 0) + 1);
    if (!item.sourceOnly) controlled.add(text(item.eventType));
    for (const person of participants(item)) {
      const source = item.source && typeof item.source === "object" ? text((item.source as Record<string, unknown>).id) : text(item.id);
      const key = person.mdvsId || person.url || `${source}:${person.name}:${person.resolutionState}`;
      const existing = people.get(key);
      people.set(key, { ...person, count: (existing?.count || 0) + 1 });
    }
  }
  const ordered = [...types].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const max = Math.max(1, ...types.values());
  return <div className="activity-diagrams"><div className="diagram-totals"><div><strong>{items.length}</strong><span>Documented activities</span></div><div><strong>{controlled.size}</strong><span>Controlled types</span></div><div><strong>{people.size}</strong><span>Participant records</span></div></div>
    <section><h3>Activities by type</h3><p className="muted">Counts describe source assertions, including repeated reports of the same event.</p><ul className="activity-bars">{ordered.map(([label, count]) => <li key={label}><span>{label}</span><meter min={0} max={max} value={count} aria-label={`${label}: ${count} assertions`} /><strong>{count}</strong></li>)}</ul></section>
    <section><h3>Recorded participants</h3><p className="muted">Canonical actors and unresolved source records remain separate; matching names alone do not establish one identity.</p>{people.size ? <ul className="activity-participant-counts">{[...people].sort((a, b) => b[1].count - a[1].count || a[0].localeCompare(b[0])).map(([key, value]) => <li key={key}><span>{value.url ? <a href={value.url}>{value.name}</a> : value.name}<ParticipantIdentityNote participant={{ ...value, pageUrl: value.url }} /></span><span>{value.count} {value.count === 1 ? "activity" : "activities"}</span></li>)}</ul> : <p>No participant names are recorded for these activities.</p>}</section>
  </div>;
}

export function RecoveredAccountTotals({ descriptions }: { descriptions: SpecificationDescription[] }) {
  const accounts = descriptions.filter(item => item.coverage !== "retained_source_transfer"
    && item.chronology?.contract === "modavis.source-account-recovery/v1" && item.chronology.accountSourceFacts?.length);
  if (!accounts.length) return null;
  return <section aria-label="Source account totals"><h4>Totals by source account</h4>
    {accounts.slice(0, 4).map(account => <div key={account.id}>
      <strong>{account.periodLabel}</strong>
      <dl>{account.chronology!.accountSourceFacts!.map((fact, index) => <div key={index}><dt>{fact.label}</dt><dd>{fact.value}</dd></div>)}</dl>
    </div>)}
    <p className="muted">Source-reported figures remain separate by account. Registers and transmissions are not summed, and no present-condition total is inferred.</p>
    {accounts.length > 4 && <p>{accounts.length - 4} more source accounts are available under Specifications.</p>}
  </section>;
}

export function OrganLanding({ organ, onOpenTab }: { organ: OrganDetail; onOpenTab: (tab: "specification" | "history" | "identifiers" | "related") => void }) {
  const descriptions = organ.specificationDescriptions || [];
  const main = descriptions.find(item => item.kind === "main");
  const alternatives = descriptions.filter(item => item.kind === "alternative");
  const recovered = alternatives.some(item => item.chronology?.contract === "modavis.source-account-recovery/v1");
  const facts = organ.publicProfile?.sections?.find(item => item.key === "overview")?.items || [];
  const stopFact = facts.find(item => item.label === "Source-reported stops" || item.label === "Documented stops");
  const stopValue = text(stopFact?.value);
  const mainStops = /^\d+$/.test(stopValue) ? stopValue : null;
  const stopGuidance = stopValue && !mainStops ? stopValue : null;
  const events = organ.timeline || [];
  const recent = events.filter(item => item.date && item.date !== "Undated").slice(-3).reverse();
  const link = (tab: "specification" | "history" | "identifiers" | "related", label: string) => <a className="landing-detail-link" href={`${organ.canonicalUrl}?tab=${tab}`} onClick={event => { if (!event.metaKey && !event.ctrlKey && !event.shiftKey && event.button === 0) { event.preventDefault(); onOpenTab(tab); } }}>{label}<ArrowRight size={16} /></a>;
  return <div className="organ-landing">
    <div className="organ-landing-grid">
      <section className="organ-landing-card instrument-landing-card"><div className="landing-kicker"><Music2 size={18} /><h3>The instrument</h3></div>{mainStops ? <p className="landing-feature-number"><strong>{mainStops}</strong> {stopFact?.label === "Source-reported stops" ? "source-reported" : "documented"} stops</p> : <p role={stopGuidance ? "note" : undefined}>{stopGuidance || "Explore the documented specification and its source descriptions."}</p>}
        <RecoveredAccountTotals descriptions={descriptions} />
        <p>{recovered ? "Source accounts keep specifications and their date wording separate. They do not establish distinct physical instruments." : alternatives.length > 0 ? `${alternatives.length} additional ${alternatives.length === 1 ? "description preserves" : "descriptions preserve"} other periods or instruments documented at this site.` : main ? "The main source description records the instrument’s disposition." : "Technical details are available where supplied by the sources."}</p>
        {descriptions.length > 0 && <div className="landing-description-periods">{descriptions.slice(0, 4).map(item => <span key={item.id}>{item.periodLabel || (item.kind === "main" ? "Main description" : "Additional description")}</span>)}</div>}
        {link("specification", "Explore specifications")}
      </section>
      <section className="organ-landing-card"><div className="landing-kicker"><History size={18} /><h3>Its history</h3></div>{organ.documentedStateSummary?.yearLabel && <p className="landing-history-range">{organ.documentedStateSummary.yearLabel}</p>}
        {recent.length > 0 ? <ol className="landing-milestones">{recent.map((item, index) => <li key={text(item.id) || index}><time>{text(item.date)}</time><div><strong>{text(item.label || item.title)}</strong><ParticipantNames item={item} /></div></li>)}</ol> : <p>No dated activities are recorded in the current sources.</p>}
        {link("history", `Read the history${events.length ? ` · ${events.length} records` : ""}`)}
      </section>
      <section className="organ-landing-card"><div className="landing-kicker"><BookOpen size={18} /><h3>Explore the sources</h3></div><p>{organ.sourceCount} {organ.sourceCount === 1 ? "collection documents" : "collections document"} this organ.</p><ul className="landing-source-links">{organ.sources.map(source => <li key={source.id}>{source.url ? <a href={source.url} target="_blank" rel="noreferrer">{source.source.replace(/^src:/, "")}</a> : source.source.replace(/^src:/, "")}</li>)}</ul>{link("identifiers", "Sources and identifiers")}</section>
    </div>
    {(organ.virtualInstruments?.linked || 0) > 0 && <section className="organ-virtual-highlight"><Music2 size={24} /><div><h3>Play a virtual version</h3><p>{organ.virtualInstruments!.linked} virtual {organ.virtualInstruments!.linked === 1 ? "instrument is" : "instruments are"} linked to this organ. Explore the editions, software and documented relationship.</p></div>{link("related", "View virtual instruments")}</section>}
  </div>;
}

export function SearchValueLink({ section, name = "q", value, query }: { section: "scores" | "literature"; name?: string; value: string; query?: string }) {
  return <a href={`/${section}?${new URLSearchParams({ [name]: query || value })}`}>{value}</a>;
}

export function CopyText({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(false);
  return <><button className="secondary" type="button" onClick={async () => { try { await navigator.clipboard.writeText(value); setCopied(true); setError(false); } catch { setError(true); } }}>{copied ? <Check size={15} /> : <Clipboard size={15} />}{copied ? "Copied" : label}</button>{error && <span role="status">Select and copy the text below.</span>}</>;
}
