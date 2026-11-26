import { ParticipantIdentityNote } from "./eventParticipation";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { ArrowRight, Check, Clipboard, Link2, X } from "lucide-react";
import type { OrganDetail, SpecificationDescription } from "./api";
import { useUiLocale } from "./uiLocale";
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
  const { t } = useUiLocale();
  const [state, setState] = useState<"idle" | "copied" | "error">("idle");
  const stableUrl = url || stableRecordUrl(id);
  const target = stableUrl || id;
  const copyLabel = stableUrl ? t("record.identifier.copyUrl", "Copy record URL", "URL des Datensatzes kopieren") : t("record.identifier.copyId", "Copy identifier", "Kennung kopieren");
  const copiedLabel = stableUrl ? t("record.identifier.copiedUrl", "Record URL copied", "URL des Datensatzes kopiert") : t("record.identifier.copiedId", "Identifier copied", "Kennung kopiert");
  useEffect(() => { if (state === "idle") return; const timer = window.setTimeout(() => setState("idle"), 2200); return () => window.clearTimeout(timer); }, [state]);
  return <button className="identifier-copy" type="button" title={`${copyLabel}: ${target}`} aria-label={`${copyLabel} · ${id}`} onClick={async () => {
    try { await navigator.clipboard.writeText(target); setState("copied"); } catch { setState("error"); }
  }}><span>{id}</span>{state === "copied" ? <Check size={13} /> : stableUrl ? <Link2 size={13} /> : <Clipboard size={13} />}<span className="sr-only" role="status">{state === "copied" ? copiedLabel : state === "error" ? t("record.identifier.copyError", "Could not copy {target}.", "{target} konnte nicht kopiert werden.", { target }) : ""}</span></button>;
}

export function PublicModal({ title, children, onClose, wide = false }: { title: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  const { t } = useUiLocale();
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
    <header><h2 id={label}>{title}</h2><button type="button" className="icon-button" aria-label={t("organ.publicModal.close", "Close {title}", "„{title}“ schließen", {title})} onClick={onClose} autoFocus><X size={20} /></button></header>
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
  const { t } = useUiLocale();
  return <div className="biography-timeline"><p className="muted">{t("organ.history.timeline.scope", "Dates and participants as documented by the sources. Separate assertions may describe the same activity.", "Datierungen und Beteiligte laut Quellen. Mehrere Angaben können dieselbe Tätigkeit betreffen.")}</p>
    <ol>{items.map((item, index) => <li key={text(item.id) || index}><time>{text(item.date) || t("organ.history.timeline.undated", "Undated", "Undatiert")}</time><div><h3>{item.pageUrl ? <a href={text(item.pageUrl)}>{text(item.label || item.title)}</a> : text(item.label || item.title)}</h3><ParticipantNames item={item} />{item.source !== null && typeof item.source === "object" && <small>{text((item.source as Record<string, unknown>).source).replace(/^src:/, "")}</small>}{item.sourceOnly === true && <small>{t("organ.history.timeline.sourceOnly", "Source wording; no controlled type assigned", "Quellenwortlaut ohne Zuordnung zu einem kontrollierten Typ")}</small>}</div></li>)}</ol>
    {!items.length && <p>{t("organ.history.timeline.empty", "No activities are documented in this record.", "In diesem Datensatz sind keine Tätigkeiten dokumentiert.")}</p>}
  </div>;
}

export function ActivityDiagrams({ items }: { items: Record<string, unknown>[] }) {
  const { t, formatNumber } = useUiLocale();
  const types = new Map<string, number>();
  const people = new Map<string, { count: number; name: string; url: string; mdvsId: string; resolutionState: string }>();
  const controlled = new Set<string>();
  for (const item of items) {
    const label = text(item.label || item.title || item.eventType) || t("organ.activities.diagrams.other", "Other activity", "Weitere Tätigkeit");
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
  return <div className="activity-diagrams"><div className="diagram-totals"><div><strong>{formatNumber(items.length)}</strong><span>{t("organ.activities.diagrams.documented", "Documented activities", "Dokumentierte Tätigkeiten")}</span></div><div><strong>{formatNumber(controlled.size)}</strong><span>{t("organ.activities.diagrams.controlled", "Controlled types", "Kontrollierte Typen")}</span></div><div><strong>{formatNumber(people.size)}</strong><span>{t("organ.activities.diagrams.participantRecords", "Participant records", "Datensätze zu Beteiligten")}</span></div></div>
    <section><h3>{t("organ.activities.diagrams.types", "Activities by type", "Tätigkeiten nach Typ")}</h3><p className="muted">{t("organ.activities.diagrams.scope", "Counts describe source assertions, including repeated reports of the same event.", "Gezählt werden Angaben aus Quellen. Mehrere Angaben können dasselbe Ereignis betreffen.")}</p><ul className="activity-bars">{ordered.map(([label, count]) => <li key={label}><span>{label}</span><meter min={0} max={max} value={count} aria-label={t("organ.activities.diagrams.meter", "{label}: {count, plural, one {# assertion} other {# assertions}}", "{label}: {count, plural, one {# Angabe} other {# Angaben}}", {label,count})} /><strong>{formatNumber(count)}</strong></li>)}</ul></section>
    <section><h3>{t("organ.activities.diagrams.participants", "Recorded participants", "Erfasste Beteiligte")}</h3><p className="muted">{t("organ.activities.diagrams.identityScope", "Canonical actors and unresolved source records remain separate; matching names alone do not establish one identity.", "Kanonische Akteure und Quelldatensätze ohne geklärte Zuordnung bleiben getrennt. Übereinstimmende Namen allein belegen keine gemeinsame Identität.")}</p>{people.size ? <ul className="activity-participant-counts">{[...people].sort((a, b) => b[1].count - a[1].count || a[0].localeCompare(b[0])).map(([key, value]) => <li key={key}><span>{value.url ? <a href={value.url}>{value.name}</a> : value.name}<ParticipantIdentityNote participant={{ ...value, pageUrl: value.url }} /></span><span>{t("organ.activities.diagrams.participantCount", "{count, plural, one {# activity} other {# activities}}", "{count, plural, one {# Tätigkeit} other {# Tätigkeiten}}", {count:value.count})}</span></li>)}</ul> : <p>{t("organ.activities.diagrams.noNames", "No participant names are recorded for these activities.", "Für diese Tätigkeiten sind keine Namen von Beteiligten erfasst.")}</p>}</section>
  </div>;
}

export function RecoveredAccountTotals({ descriptions }: { descriptions: SpecificationDescription[] }) {
  const { t } = useUiLocale();
  const accounts = descriptions.filter(item => item.coverage !== "retained_source_transfer"
    && item.chronology?.contract === "modavis.source-account-recovery/v1" && item.chronology.accountSourceFacts?.length);
  if (!accounts.length) return null;
  return <section aria-label={t("organ.accountTotals.aria", "Source account totals", "Zahlenangaben aus den Quellen")}><h4>{t("organ.accountTotals.heading", "Totals by source account", "Summen nach Quellenbeschreibung")}</h4>
    {accounts.slice(0, 4).map(account => <div key={account.id}>
      <strong>{account.periodLabel}</strong>
      <p className="account-total-source">{account.source.url ? <a href={account.source.url} target="_blank" rel="noreferrer">{account.source.source.replace(/^src:/, "")}</a> : account.source.source.replace(/^src:/, "")}{account.sourceHeading && ` · ${account.sourceHeading}`}</p>
      <dl>{account.chronology!.accountSourceFacts!.map((fact, index) => <div key={index}><dt>{fact.label}</dt><dd>{fact.value}</dd></div>)}</dl>
    </div>)}
    <p className="muted">{t("organ.accountTotals.scope", "Figures are shown separately for each source account. Totals are not inferred across accounts, across registers and transmissions, or for the organ’s present condition.", "Die Zahlen stehen getrennt nach Quellenbeschreibung. Aus ihnen wird keine gemeinsame Summe für Register und Transmissionen, für mehrere Quellen oder für den heutigen Zustand abgeleitet.")}</p>
    {accounts.length > 4 && <p>{t("organ.accountTotals.more", "{count, plural, one {# more source account is} other {# more source accounts are}} available under Specification.", "Im Abschnitt „Disposition“ {count, plural, one {steht # weitere Quellenbeschreibung} other {stehen # weitere Quellenbeschreibungen}}.", { count: accounts.length - 4 })}</p>}
  </section>;
}

export function BuilderAttribution({ organ }: { organ: OrganDetail }) {
  const { t, formatNumber } = useUiLocale();
  const summary = organ.builderSummary;
  if (!organ.builder && !summary?.label) return null;
  const qualification = summary?.selectionBasis === "most_documented_association"
    ? t("organ.builder.attribution.mostDocumented", "The summary names the builder most frequently associated with this organ in the sources. This alone does not establish who originally built the organ or who last worked on it.", "Hier steht der Orgelbauer, der in den Quellen am häufigsten mit dieser Orgel in Verbindung gebracht wird. Daraus allein geht nicht hervor, wer die Orgel ursprünglich gebaut oder zuletzt daran gearbeitet hat.")
    : summary?.qualification || t("organ.builder.attribution.general", "Consult the source evidence to see which work is attributed to each builder and when it took place.", "Aus den Quellenangaben geht hervor, welchem Orgelbauer welche Arbeiten und Datierungen zugeschrieben werden.");
  const unknown = t("organ.builder.attribution.unknown", "Not recorded", "Nicht erfasst");
  return <details className="builder-attribution">
    <summary>{t("organ.builder.attribution.heading", "Builder attribution and dates", "Zuschreibung und Datierung der Orgelbauarbeiten")}</summary>
    <p>{qualification}</p>
    {summary && <dl>
      <div><dt>{t("organ.builder.attribution.actorCount", "Associated actor records", "Verknüpfte Datensätze zu Beteiligten")}</dt><dd>{summary.documentedActorCount == null ? unknown : formatNumber(summary.documentedActorCount)}</dd></div>
      <div><dt>{t("organ.builder.attribution.assertionCount", "Supporting source assertions", "Zugrunde liegende Quellenangaben")}</dt><dd>{summary.assertionCount == null ? unknown : formatNumber(summary.assertionCount)}</dd></div>
      <div><dt>{t("organ.builder.attribution.role", "Role in this summary", "Rolle in der Zusammenfassung")}</dt><dd>{summary.role || t("organ.builder.attribution.noRole", "No single role established", "Keine eindeutige Rolle belegt")}</dd></div>
      <div><dt>{t("organ.builder.attribution.period", "Period in this summary", "Zeitraum in der Zusammenfassung")}</dt><dd>{summary.period || t("organ.builder.attribution.noPeriod", "See the dated source evidence", "Siehe Datierungen in den Quellenangaben")}</dd></div>
    </dl>}
    <a href={summary?.claimsUrl || `/use-cases/research-workbench?view=claims&organ=${encodeURIComponent(organ.mdvsId)}`}>{t("organ.builder.attribution.claims", "Read the source evidence", "Quellenangaben ansehen")}</a>
  </details>;
}

export function OrganLanding({ organ, onOpenTab }: { organ: OrganDetail; onOpenTab: (tab: "specification" | "history" | "identifiers" | "related") => void }) {
  const { t } = useUiLocale();
  const descriptions = organ.specificationDescriptions || [];
  const recoveredCount = descriptions.filter(item => item.chronology?.contract === "modavis.source-account-recovery/v1").length;
  const historyPending = Boolean(organ.deferredSections?.history && !organ.loadedSections?.history);
  const recent = (organ.timeline || []).filter(item => item.date && item.date !== "Undated").slice(-3).reverse();
  const recordPath = organ.pageUrl || organ.canonicalUrl;
  const link = (tab: "specification" | "history" | "identifiers", label: string) => <a className="landing-detail-link" href={recordPath + (recordPath.includes("?") ? "&" : "?") + "tab=" + tab} onClick={event => { if (!event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey && event.button === 0) { event.preventDefault(); onOpenTab(tab); } }}>{label}<ArrowRight size={16} aria-hidden="true" /></a>;
  return <div className="organ-landing">
    <div className="organ-landing-grid">
      {descriptions.length > 0 && <section className="organ-landing-section"><h3>{t("organ.landing.specifications", "Specification accounts", "Disposition laut Quellen")}</h3>
        <ul className="landing-description-periods">{descriptions.slice(0, 4).map(item => <li key={item.id}>{item.periodLabel || (item.kind === "main" ? t("organ.landing.main", "Main description", "Hauptbeschreibung") : t("organ.landing.additional", "Additional description", "Weitere Beschreibung"))}</li>)}</ul>
        {recoveredCount > 0 && <p>{t("organ.landing.recoveredCount", "{count, plural, one {# recovered specification account} other {# recovered specification accounts}} retained from the sources.", "Aus den Quellen {count, plural, one {wurde # Dispositionsbeschreibung erschlossen} other {wurden # Dispositionsbeschreibungen erschlossen}}.", { count: recoveredCount })}</p>}
        <RecoveredAccountTotals descriptions={descriptions} />
        {descriptions.length > 1 && <p>{t("organ.landing.accountScope", "Descriptions can concern different periods or instruments at this site. Establishing whether they concern the same instrument requires additional evidence.", "Die Beschreibungen können sich auf verschiedene Zeiträume oder Instrumente an diesem Standort beziehen. Ob sie dieselbe Orgel betreffen, muss gesondert belegt werden.")}</p>}
        {link("specification", t("organ.landing.openSpecifications", "View specifications", "Disposition ansehen"))}
      </section>}
      <section className="organ-landing-section"><h3>{t("organ.landing.history", "Dated activities", "Datierte Tätigkeiten")}</h3>
        {recent.length > 0 ? <ol className="landing-milestones">{recent.map((item, index) => <li key={text(item.id) || index}><time>{text(item.date)}</time><div><strong>{text(item.label || item.title)}</strong><ParticipantNames item={item} /></div></li>)}</ol> : <p>{historyPending ? t("organ.landing.historyPending", "Open the history for the activities and dates documented in the sources.", "Tätigkeiten und Datierungen laut Quellen stehen im Abschnitt „Geschichte“.") : t("organ.landing.noDates", "The available sources record no dated activities.", "In den verfügbaren Quellen sind keine datierten Tätigkeiten erfasst.")}</p>}
        {link("history", t("organ.landing.openHistory", "Read the history", "Geschichte ansehen"))}
      </section>
      {organ.sources.length > 0 && <section className="organ-landing-section"><h3>{t("organ.landing.sources", "Source records", "Quelldatensätze")}</h3><ul className="landing-source-links">{organ.sources.map((source, index) => <li key={source.id + ":" + index}>{source.url ? <a href={source.url} target="_blank" rel="noreferrer">{source.source.replace(/^src:/, "")}</a> : source.source.replace(/^src:/, "")}</li>)}</ul>{link("identifiers", t("organ.landing.openSources", "Sources and identifiers", "Quellen und Kennungen"))}</section>}
    </div>
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
