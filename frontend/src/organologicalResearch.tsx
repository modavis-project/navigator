import {BuilderNetwork} from './researchExploration';
import { JsonEvidence } from "./JsonEvidence";
import { useEffect, useState } from "react";
import { useUiLocale, type UiLocale } from "./uiLocale";
import { LoadingContent } from "./LoadingContent";
import "./organologicalResearch.css";
import { ParticipantIdentityNote, ParticipantSourceEvidence } from "./eventParticipation";

type Item = Record<string, any>;
type Page = { items: Item[]; total: number; offset: number; hasMore: boolean; publicCoreSha256: string };
const enc = encodeURIComponent;
const DOSSIER_GERMAN: Record<string, string> = {
  "Current source listing": "Aktuelle Standortangabe laut Quelle",
  "Configuration date unestablished": "Datierung der Disposition ungeklärt",
  "Coverage: unspecified": "Umfang der Beschreibung nicht angegeben",
  "Physical state identity not established": "Übereinstimmung der baulichen Zustände ungeklärt",
  "retained source transfer": "übernommene Dispositionsbeschreibung",
  "organ_builder": "Orgelbauer",
  "original_builder": "Erbauer",
  "builder": "Orgelbauer",
  "construction": "Neubau",
  "rebuild": "Umbau",
  "restoration": "Restaurierung",
  "repair": "Reparatur",
  "transfer": "Versetzung",
  "stop": "Register",
  "coupler": "Koppel",
  "accessory": "Spielhilfe",
};

function evidenceTerm(value: string, locale: UiLocale) {
  if (locale === "de") {
    const bound = value.match(/^(Before|After|Until|Since) (\d{4})$/);
    if (bound) {
      const relation = { Before: "Vor", After: "Nach", Until: "Bis", Since: "Seit" }[bound[1]];
      return `${relation} ${bound[2]}`;
    }
    if (Object.prototype.hasOwnProperty.call(DOSSIER_GERMAN, value)) return DOSSIER_GERMAN[value];
  }
  return value.replace(/_/g, " ");
}
const actorHref = (id: string) => `/id/${enc(id)}`;

function useData<T>(url: string | null) {
  const [state, setState] = useState<{url: string; data?: T; error?: "snapshot" | "unavailable"}>();
  useEffect(() => {
    if (!url) return;
    const controller = new AbortController();
    const timer = setTimeout(() => fetch(url, {signal:controller.signal}).then(async r => {
      if (!r.ok) throw new Error(r.status === 503 ? "snapshot" : "unavailable");
      return await r.json() as T;
    }).then(data => {if (!controller.signal.aborted) setState({url,data});}).catch(e => {if (!controller.signal.aborted) setState({url,error:e.message === "snapshot" ? "snapshot" : "unavailable"});}),150);
    return () => {clearTimeout(timer);controller.abort();};
  }, [url]);
  return state?.url === url ? state : undefined;
}

function ResearchError({ snapshot }: { snapshot?: boolean }) {
  const { t } = useUiLocale();
  return <p role="alert">{snapshot
    ? t("story.builders.binding", "Research data is unavailable for this dataset snapshot.", "Zu diesem Datenstand sind die Forschungsdaten derzeit nicht verfügbar.")
    : t("story.builders.unavailable", "Research evidence could not be loaded.", "Die Forschungsbelege konnten nicht geladen werden.")}</p>;
}

function EventEvidence({ event }: { event: Item }) {
  const { locale, t } = useUiLocale();
  return <div className="research-event">
    <a href={event.href || `/events/${enc(event.event_id)}`}><strong>{event.controlled_event_type ? evidenceTerm(event.controlled_event_type, locale) : event.source_event_type || t("story.builders.sourceStatement", "Source statement", "Quellenangabe")}</strong></a>
    <p>{event.dates?.map((d: Item) => d.expression).filter(Boolean).join("; ") || t("story.builders.undated", "Undated", "Undatiert")} · {event.source_key}</p>
    {event.source_event_type && <p>{t("story.builders.wording", "Source wording", "Quellenwortlaut")}: {event.source_event_type}</p>}
    {event.narrative && <p>{event.narrative}</p>}
    <ul>{event.participants?.map((p: Item,i: number) => <li key={i}>{p.targetId ? <a href={actorHref(p.targetId)}>{p.wording}</a> : p.wording} · {p.role ? evidenceTerm(p.role, locale) : t("story.builders.roleUnknown", "Role unspecified", "Rolle nicht angegeben")}{!p.targetId && <> · {t("story.builders.unknown", "Identity unresolved or unknown", "Identität ungeklärt oder unbekannt")}</>}<ParticipantIdentityNote participant={p}/><ParticipantSourceEvidence participant={p}/></li>)}</ul>
    {event.source_url && <a href={event.source_url} target="_blank" rel="noreferrer">{t("story.builders.original", "Original source", "Originalquelle")}</a>}
  </div>;
}

function RelativeAccountEvidence({item}: {item: Item}) {
  const { locale, t } = useUiLocale();
  const scope = item.sourceRelativeContext;
  return <>
    {scope && <p>{t("story.builders.undatedConfiguration", "The source places the configuration {time}. Its exact year is unknown.", "Die Quelle datiert die Disposition {time}. Das genaue Jahr ist unbekannt.", {
      time: evidenceTerm(`${scope.temporalRelation.charAt(0).toUpperCase()}${scope.temporalRelation.slice(1)} ${scope.boundaryYear}`, locale),
    })}</p>}
    {item.eventAssociations?.map((association: Item) => <p key={association.eventId}>
      <a href={`/events/${enc(association.eventId)}`}>
        {association.temporalRelation === "before"
          ? t("story.builders.associationBefore", "Account before this documented event", "Quellenbeschreibung vor diesem dokumentierten Ereignis")
          : association.temporalRelation === "after"
            ? t("story.builders.associationAfter", "Account after this documented event", "Quellenbeschreibung nach diesem dokumentierten Ereignis")
            : t("story.builders.associationRelated", "Related documented event", "Zugehöriges dokumentiertes Ereignis")}
      </a>
      {" · "}{t("story.builders.associationContext", "The relationship gives historical context. Cause and continuity of the organ’s physical state remain open.", "Der Bezug dient der historischen Einordnung. Ursache und bauliche Kontinuität bleiben offen.")}
    </p>)}
  </>;
}

function AccountComparison({items}: {items: Item[]}) {
  const { t } = useUiLocale();
  return <section className="research-comparison"><h3>{t("story.builders.accounts", "Separate source accounts", "Getrennte Quellenbeschreibungen")}</h3><p>{t("story.builders.accountMethod", "Comparison does not establish authorship, equivalent physical states or acoustic identity. No absent stops are inferred.", "Zuschreibung, bauliche Übereinstimmung und klangliche Identität bedürfen eigener Belege. Register werden nur berücksichtigt, wenn die Quelle sie nennt.")}</p><div className="research-account-grid">{items.map(item => <Account key={item.description_id} item={item}/>)}</div></section>;
}
function Account({item}: {item: Item}) {
  const { t, locale, formatNumber } = useUiLocale();
  const result=useData<{description: Item}>(item.apiUrl+`?revision=${enc(item.description_revision)}`);
  const d=result?.data?.description;
  return <article><h4>{item.organLabel}</h4><p>{item.source_heading} · {evidenceTerm(item.period_label, locale)}</p><p>{item.qualification.map((value: string) => evidenceTerm(value, locale)).join(" · ")}</p><RelativeAccountEvidence item={item}/>
    {result?.error && <ResearchError snapshot={result.error === "snapshot"}/>}{!result && <LoadingContent label={t("story.builders.loadingAccount", "Loading the source account…", "Die Quellenbeschreibung wird geladen …")} />}
    {d && <><p>{t("story.builders.entries", "Recorded stop entries: {stops}. Division groups: {groups}. The figures count entries in the source.", "Erfasste Registereinträge: {stops}. Werkgruppen: {groups}. Gezählt werden die Einträge der Quelle.", {
      stops: formatNumber(d.groups.reduce((count: number, group: Item) => count + group.entries.filter((entry: Item) => entry.kind === "stop").length, 0)),
      groups: formatNumber(d.groups.length),
    })}</p>
      {d.groups.map((g: Item,i: number) => <details key={i}><summary>{g.label} · {t("story.builders.groupCount", "{count, plural, one {# entry} other {# entries}}", "{count, plural, one {# Eintrag} other {# Einträge}}", { count: g.entries.length })}</summary><ul>{g.entries.map((e: Item) => <li key={e.id}>{e.wording || e.label} {e.pitch && ` · ${e.pitch}′`} · {evidenceTerm(e.kind, locale)}</li>)}</ul></details>)}
      <p>{t("story.builders.source", "Source", "Quelle")}: {d.source?.source} · {d.source?.id}</p></>}
    <a href={item.href}>{t("story.builders.openSpec", "Open specification and full evidence", "Disposition und vollständige Belege öffnen")}</a></article>;
}

export function OrganologicalResearch({initialActor}: {initialActor?: string}) {
  const { t, locale, formatNumber } = useUiLocale();
  const [actorId,setActor]=useState(initialActor || new URLSearchParams(location.search).get('actor') || "");
  const [search,setSearch]=useState("");const [actorPage,setActorPage]=useState(0);
  const [section,setSection]=useState("neighbors");const [other,setOther]=useState<Item>();
  const [query,setQuery]=useState("");const [page,setPage]=useState(0);const [compare,setCompare]=useState<Item[]>([]);
  const directory=useData<Page>(!initialActor ? `/api/research/actors?q=${enc(search)}&page=${actorPage}` : null);
  const overview=useData<Item>(actorId ? `/api/research/actors/${enc(actorId)}` : null);
  const result=useData<Page>(actorId ? `/api/research/actors/${enc(actorId)}/${section}?q=${enc(query)}&page=${page}${other && section!=="neighbors" && section!=="configurations" ? `&other=${enc(other.id)}` : ""}` : null);
  const data=result?.data;const actor=overview?.data?.actor;
  const mismatch=!!(data && overview?.data && data.publicCoreSha256!==overview.data.publicCoreSha256);
  const changeSection=(s: string) => {setSection(s);setPage(0);setQuery("");};
  useEffect(()=>{if(initialActor)return;const restore=()=>{const value=new URLSearchParams(location.search).get('actor')||'';setActor(value)};window.addEventListener('popstate',restore);return()=>window.removeEventListener('popstate',restore)},[initialActor]);
  const choose=(id: string) => {if(!initialActor){const p=new URLSearchParams(location.search);p.set('actor',id);p.set('networkPage','0');history.pushState({},'',location.pathname+'?'+p);window.dispatchEvent(new PopStateEvent('popstate'));}setActor(id);setPage(0);setOther(undefined);setCompare([]);setQuery("");setSection("neighbors");};
  return <section className="organological-research" aria-label={t("story.builders.dossier", "Builder research dossier", "Belege zum Orgelbau")}>
    <h2>{t("story.builders.dossier", "Builder research dossier", "Belege zum Orgelbau")}</h2><p><a href={`/use-cases/research-workbench?actor=${enc(actorId)}&section=events`}>{t("story.builders.workbench", "Open reproducible research, filters and downloads", "Recherche mit Filtern und Downloads öffnen")}</a></p><p>{t("story.builders.intro", "Explore documented work and compare the evidence behind connections.", "Hier können Sie dokumentierte Tätigkeiten einsehen und die Belege für Verbindungen vergleichen.")}</p>
    {!initialActor && <details open={!actorId}><summary>{t("story.builders.choose", "Choose any builder or organization", "Orgelbauer oder Werkstatt auswählen")}</summary><label>{t("story.builders.search", "Search builders", "Orgelbauer suchen")}<input value={search} onChange={e=>{setSearch(e.target.value);setActorPage(0);}} placeholder={t("story.builders.identityPlaceholder", "Name or MODAVIS identifier", "Name oder MODAVIS-Kennung")}/></label>
      {directory?.error && <ResearchError snapshot={directory.error === "snapshot"}/>}
      <div className="research-builder-results">{directory?.data?.items.map(a=><button key={a.id} onClick={()=>choose(a.id)}>{a.label} · {t("story.builders.organs", "{count, plural, one {# organ} other {# organs}}", "{count, plural, one {# Orgel} other {# Orgeln}}", { count: a.organ_count })}</button>)}</div>
      {directory?.data && <nav aria-label={t("story.builders.builderPages", "Builder search pages", "Ergebnisseiten der Orgelbauersuche")}><button disabled={!actorPage} onClick={()=>setActorPage(actorPage-1)}>{t("story.builders.previousBuilders", "Previous builders", "Vorherige Ergebnisse")}</button><span>{t("story.builders.matches", "{count, plural, one {# matching record} other {# matching records}}", "{count, plural, one {# passender Datensatz} other {# passende Datensätze}}", { count: directory.data.total })}</span><button disabled={!directory.data.hasMore} onClick={()=>setActorPage(actorPage+1)}>{t("story.builders.nextBuilders", "Next builders", "Weitere Ergebnisse")}</button></nav>}
    </details>}
    {overview?.error && <ResearchError snapshot={overview.error === "snapshot"}/>}
    {actor && <>{!initialActor&&<BuilderNetwork actor={actorId} onChoose={choose}/>}<h3><a href={actor.href}>{actor.label}</a></h3><p>{t("story.builders.actorCounts", "Associated organs: {organs} · Documented event assertions: {events} · Builder source records: {sources}", "Zugeordnete Orgeln: {organs} · Ereignisangaben: {events} · Quelldatensätze zum Orgelbau: {sources}", {
      organs: formatNumber(actor.organ_count), events: formatNumber(actor.eventCount), sources: formatNumber(actor.sourceCount),
    })}</p>
      <div className="research-section-buttons" aria-label={t("story.builders.sections", "Research sections", "Recherchebereiche")}>{[["neighbors",t("story.builders.neighbors", "Other builders", "Weitere Orgelbauer")],["organs",t("story.builders.organsTab", "Instruments and evidence", "Instrumente und Belege")],["events",t("story.builders.events", "Event participation", "Beteiligung an Ereignissen")],["configurations",t("story.builders.configurations", "Configuration accounts", "Dispositionsbeschreibungen")]].map(([id,label])=><button key={id} aria-pressed={section===id} onClick={()=>{changeSection(id);if(id==="neighbors"||id==="configurations")setOther(undefined);}}>{label}</button>)}</div>
      {other && <div className="research-peer"><p>{t("story.builders.comparison", "Comparison with", "Vergleich mit")} <a href={actorHref(other.id)}>{other.label}</a>. {other.audit && <strong>{t("story.builders.unresolved", "Identity correspondence remains unresolved; do not interpret this pair as distinct historical collaborators.", "Die Zuordnung der Identitäten ist ungeklärt. Ob es sich um zwei verschiedene Beteiligte handelt, lässt sich daraus nicht ableiten.")}</strong>}</p><button onClick={()=>changeSection("organs")}>{t("story.builders.shared", "Shared instruments", "Gemeinsame Instrumente")}</button><button onClick={()=>changeSection("events")}>{t("story.builders.joint", "Joint controlled events", "Gemeinsame klassifizierte Ereignisangaben")}</button><button onClick={()=>changeSection("sequences")}>{t("story.builders.earlierLater", "Earlier → later work", "Frühere und spätere Arbeiten")}</button><button onClick={()=>{const old={id:actor.id,label:actor.label,audit:other.audit};setActor(other.id);setOther(old);changeSection("sequences");}}>{t("story.builders.reverse", "Reverse direction", "Reihenfolge umkehren")}</button><button onClick={()=>{setOther(undefined);changeSection("neighbors");}}>{t("story.builders.clear", "Clear comparison", "Vergleich aufheben")}</button></div>}
      <p className="research-qualification">{section==="neighbors" ? t("story.builders.neighborsNote", "Shared instruments establish a catalogue connection, not collaboration, family ties, apprenticeship or company succession. Counts reflect documentation coverage.", "Gemeinsame Instrumente belegen eine Verbindung in den Katalogdaten. Zusammenarbeit, Verwandtschaft, Ausbildungsverhältnisse und Firmennachfolge erfordern eigene Belege. Die Zahlen spiegeln den Umfang der Dokumentation wider.") : section==="events" ? t("story.builders.eventsNote", "Joint participation means named actors in one controlled source event. It does not establish a partnership; repeated source assertions can describe the same event.", "Gemeinsame Beteiligung bedeutet, dass dieselbe klassifizierte Ereignisangabe beide Beteiligten nennt. Mehrere Quellenangaben können sich auf dasselbe historische Ereignis beziehen. Eine Zusammenarbeit erfordert weitere Belege.") : section==="sequences" ? t("story.builders.sequenceNote", "Earlier work by the selected actor → later work by the comparison actor. Only non-overlapping bounded dates qualify. These are pairs of event assertions, not proof of continuity of physical fabric or company succession.", "Verglichen werden frühere Tätigkeiten des ausgewählten Orgelbauers mit späteren Tätigkeiten der Vergleichsperson oder -werkstatt. Beide Zeiträume müssen begrenzt sein und dürfen sich nicht überschneiden. Bauliche Kontinuität oder Firmennachfolge erfordern weitere Belege.") : section==="configurations" ? t("story.builders.configurationNote", "These separate accounts come from source records that name this actor for this organ. This does not attribute every configuration to the actor. Retained transfers, partial accounts and unknown dates remain explicit.", "Die Beschreibungen stammen aus Quellen, die den Orgelbauer im Zusammenhang mit dieser Orgel nennen. Für die Zuschreibung einzelner Dispositionen sind eigene Belege nötig. Übernommene Angaben, Teilbeschreibungen und fehlende Datierungen sind gekennzeichnet.") : t("story.builders.organNote", "Original builder assertions are retained. Locations below describe current source listings, not historical workshop addresses or commission locations.", "Die ursprünglichen Angaben zum Orgelbau bleiben erhalten. Die Orte geben den aktuellen Stand der Quellen wieder. Historische Werkstatt- oder Auftragsorte sind getrennt zu belegen.")}</p>
      <label>{t("story.builders.filter", "Filter this section", "Diesen Bereich filtern")}<input value={query} onChange={e=>{setQuery(e.target.value);setPage(0);}} placeholder={section==="configurations" ? t("story.builders.configurationPlaceholder", "Organ, date or coverage wording", "Orgel, Datum oder Angabe zum Umfang") : t("story.builders.placeholder", "Organ, builder, event or identifier", "Orgel, Orgelbauer, Ereignis oder Kennung")}/></label>
      {result?.error && <ResearchError snapshot={result.error === "snapshot"}/>}{!result && <LoadingContent label={t("story.builders.loading", "Loading research evidence…", "Die Forschungsbelege werden geladen …")} />}{mismatch && <p role="alert">{t("story.builders.mismatch", "Research snapshot changed. Reload before comparing.", "Der Datenstand hat sich geändert. Bitte laden Sie die Seite neu, bevor Sie den Vergleich fortsetzen.")}</p>}
      {data && !mismatch && <><nav aria-label={t("story.builders.resultPages", "Research result pages", "Ergebnisseiten der Recherche")}><button disabled={!page} onClick={()=>setPage(page-1)}>{t("story.builders.previous", "Previous results", "Vorherige Ergebnisse")}</button><span role="status">{t("story.builders.results", "{count, plural, one {# result} other {# results}}", "{count, plural, one {# Ergebnis} other {# Ergebnisse}}", { count: data.total })}{data.total > 0 && ` · ${formatNumber(data.offset + 1)}–${formatNumber(data.offset + data.items.length)}`}</span><button disabled={!data.hasMore} onClick={()=>setPage(page+1)}>{t("story.builders.next", "Next results", "Weitere Ergebnisse")}</button></nav>
      {compare.length>0 && <AccountComparison items={compare}/>}
      <div className="research-results">{data.items.map((item,i)=><article key={item.id || item.description_id || item.event_id || i}>
        {section==="neighbors" ? <><h4><a href={item.href}>{item.label}</a></h4><p>{t("story.builders.peerCounts", "Shared organs: {organs} · Joint classified event assertions: {events}", "Gemeinsame Orgeln: {organs} · Gemeinsame klassifizierte Ereignisangaben: {events}", { organs: formatNumber(item.shared), events: formatNumber(item.joint) })}</p>{item.audit && <p className="research-qualification">{t("story.builders.identityAudit", "The link between these identities is unresolved.", "Die Zuordnung dieser Identitäten ist ungeklärt.")} <a href="/api/research/identity-audit">{t("story.builders.audit", "Inspect the evidence audit", "Prüfbericht zu den Belegen öffnen")}</a>.</p>}<button onClick={()=>{setOther(item);changeSection("organs");}}>{t("story.builders.compareEvidence", "Compare evidence", "Belege vergleichen")}</button></> :
        section==="organs" ? <><h4><a href={item.href}>{item.label}</a></h4><details><summary>{t("story.builders.builderEvidenceCount", "Builder evidence · {count, plural, one {# assertion} other {# assertions}}", "Belege zur Orgelbauertätigkeit · {count, plural, one {# Quellenangabe} other {# Quellenangaben}}", { count: item.assertions.length })}</summary>{item.assertions.map((a:Item)=><div key={a.assertion_id}><p><a href={actorHref(a.actor_mdvs_id)}>{a.source_label}</a> · {evidenceTerm(a.relation_role, locale)} · {a.source_key}</p><p>{t("story.builders.record", "Source record {id}", "Quelldatensatz {id}", { id: a.source_record_id })}</p><a href={`${item.href}?tab=identifiers`}>{t("story.builders.organSources", "View sources for this organ", "Quellen zu dieser Orgel ansehen")}</a><details><summary>{t("story.builders.originalAssertion", "Original assertion and provenance", "Ursprüngliche Angabe und Herkunft")}</summary><JsonEvidence value={a} label={t("story.builders.originalBuilder", "Original builder assertion", "Ursprüngliche Angabe zum Orgelbau")}/></details></div>)}{!item.assertions.length && <p>{t("story.builders.retained", "Association retained from canonical relation evidence; inspect the organ dossier.", "Die Zuordnung beruht auf den kanonischen Beziehungsdaten. Weitere Belege finden Sie im Orgeleintrag.")}</p>}</details><details><summary>{t("story.builders.currentLocations", "Current source-listed locations", "Aktuelle Standortangaben laut Quelle")}</summary>{item.locations.map((l:Item,j:number)=><p key={j}>{l.label} · {l.source}</p>)}</details></> :
        section==="events" ? <><h4><a href={item.organHref}>{item.organLabel}</a></h4><EventEvidence event={item}/></> :
        section==="sequences" ? <><h4><a href={item.organHref}>{item.organLabel}</a></h4><div className="research-account-grid"><EventEvidence event={item.earlier}/><EventEvidence event={item.later}/></div></> :
        <><h4><a href={item.href}>{item.organLabel}</a></h4><p>{item.source_heading} · {evidenceTerm(item.period_label, locale)}</p><p>{item.source_record_id}</p><p>{item.qualification.map((value: string) => evidenceTerm(value, locale)).join(" · ")}</p><RelativeAccountEvidence item={item}/><button disabled={compare.length>=2 && !compare.some(x=>x.description_id===item.description_id)} onClick={()=>setCompare(compare.some(x=>x.description_id===item.description_id) ? compare.filter(x=>x.description_id!==item.description_id) : [...compare,item])}>{compare.some(x=>x.description_id===item.description_id) ? t("story.builders.removeAccount", "Remove account", "Aus dem Vergleich entfernen") : t("story.builders.compareAccount", "Compare account", "Beschreibung vergleichen")}</button></>}
      </article>)}</div>{data.total===0 && <p>{t("story.builders.noMatch", "No qualifying evidence matches these filters. Absence here does not establish that a historical relationship did not exist.", "Für diese Filter sind keine passenden Belege erfasst. Historische Beziehungen können dennoch bestanden haben.")}</p>}</>}
      <details><summary>{t("story.builders.method", "Method, coverage and snapshot", "Methode und Datenstand")}</summary><p>{t("story.builders.methodDetail", "Every relationship is derived from retained source assertions and existing actor IDs. Ambiguous identities remain separate. Source records are not necessarily independent corroboration. Missing and contextual evidence is not silently converted to a historical relationship.", "Die Zuordnungen beruhen auf erhaltenen Quellenangaben und vorhandenen Kennungen. Mehrdeutige Identitäten bleiben getrennt. Quelldatensätze können voneinander abhängen. Historische Beziehungen setzen einen eindeutigen Beleg voraus.")}</p><p>{t("story.builders.checksum", "Database SHA-256", "SHA-256-Prüfsumme der Datenbank")}: {overview.data?.publicCoreSha256}</p><a href="/api/research/context">{t("story.builders.contextDownload", "Download research coverage and binding", "Datengrundlage und Angaben zum Datenstand herunterladen")}</a></details>
    </>}
  </section>;
}

export function ActorResearchPanel({actorId}: {actorId: string}) {
  const { t } = useUiLocale();
  const [open,setOpen]=useState(false);
  return <details className="actor-compact-details" onToggle={e=>setOpen(e.currentTarget.open)}><summary>{t("story.builders.panel", "Research builder connections and configurations", "Verbindungen im Orgelbau und Dispositionen untersuchen")}</summary>{open && <OrganologicalResearch initialActor={actorId}/>}</details>;
}
