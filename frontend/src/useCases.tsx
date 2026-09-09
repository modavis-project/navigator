import { ResearchWorkbench } from "./researchWorkbench";
import { OrganologicalResearch } from "./organologicalResearch";
import { ArrowRight, BarChart3, BookOpen, ChevronLeft, ChevronRight, Database, Flame, MapPin, Network, Search } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { DalmatiaFireUseCase, DALMATIA_FIRE_PATH } from "./dalmatiaFireUseCase";
import "./publicStories.css";

const STORIES = [
  { slug: "regional-organ-stop-names", title: "Organ stop names by region and tradition", category: "Terminology", icon: BookOpen, summary: "Compare documented stop names, pitch labels and regional distributions without treating similar names as identical sounds." },
  { slug: "organ-corpus-coverage", title: "Organ corpus coverage and documentation gaps", category: "Coverage", icon: Database, summary: "See which sources and types of documentation shape the catalogue, and where missing evidence limits a comparison." },
  { slug: "documented-organ-lifecycles", title: "Documented organ lifecycles", category: "History", icon: BarChart3, summary: "Follow construction, rebuilding and restoration through dated activities and separately attributed organ descriptions." },
  { slug: "builder-workshop-networks", title: "Builder and workshop networks", category: "People and organisations", icon: Network, summary: "Explore documented connections between builders, workshops and organs, then inspect the source records behind them." },
];

type Row = { label: string; count: number; href?: string; sourceOnly?: number };
type Example = { id: string; title: string; href: string };
type Builder = { id: string; label: string; href: string; organCount: number; sourceRecords: number; organs: Example[] };
type StoryData = {
  contract: string; releaseVersion: string; publicCoreSha256: string; generatedAt: string;
  counts: Record<string, number>;
  coverage: { sourceCoverage: Array<{ label: string; records: number; organs: number }>; singleSourceOrgans: number; multipleSourceOrgans: number; features: Row[] };
  history: { datedAssertions: number; undatedAssertions: number; assertionsWithParticipants: number; alternativeDescriptions: number; types: Row[]; centuries: Row[]; examples: Example[] };
  networks: { linkedOrganCount: number; actorCount: number; associationCount: number; builders: Builder[] };
  stops: { entries: number; names: number; sourceRecords: number; unassignedCountryEntries: number; countries: Row[]; method: string };
};
type Stop = { label: string; count: number; countries: Record<string, number>; forms: Row[]; pitches: Row[]; examples: Array<{ id: string; href: string }> };
const number = (value: number) => value.toLocaleString("en-GB");

function useJson<T>(path: string | null) {
  const [value, setValue] = useState<T | null>(null);
  const [loadedPath, setLoadedPath] = useState<string | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!path) return;
    const controller = new AbortController();
    setError(""); setValue(null);
    fetch(path, { signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error("The story data could not be loaded. Please reload this page.");
      return response.json() as Promise<T>;
    }).then(data => { if (!controller.signal.aborted) { setValue(data); setLoadedPath(path); } }).catch(error => { if (!controller.signal.aborted) setError(String(error.message)); });
    return () => controller.abort();
  }, [path]);
  return { value: loadedPath === path ? value : null, error };
}

export function UseCasesArea() {
  const [route, setRoute] = useState(() => window.location.pathname + window.location.search);
  useEffect(() => { const sync = () => setRoute(window.location.pathname + window.location.search); window.addEventListener("popstate", sync); return () => window.removeEventListener("popstate", sync); }, []);
  const path = window.location.pathname.replace(/\/+$/, "");
  const fire = path === DALMATIA_FIRE_PATH;
  const story = STORIES.find(item => path === `/use-cases/${item.slug}`);
  const { value: data, error } = useJson<StoryData>(fire ? null : "/api/research/stories");
  useEffect(() => { if (!fire) document.title = `${story?.title || "Data stories"} | MODAVIS Navigator`; }, [story, fire]);
  if (path === "/use-cases/research-workbench") return <ResearchWorkbench />;
  if (fire) return <><p className="notice">Historical analytical snapshot: organ data from POD 1.5.5; fire observations through 3 September 2026. It does not represent the latest candidate or current fire conditions.</p><DalmatiaFireUseCase route={route} onNavigate={setRoute} /></>;
  if (!story && path !== "/use-cases") return <section className="story-page"><h1>Story not found</h1><a href="/use-cases">Browse data stories</a></section>;
  return <section className="story-page" id="use-cases" tabIndex={-1}>
    {story ? <><a className="catalog-back" href="/use-cases"><ChevronLeft size={17} /> All data stories</a><header className="story-hero"><p className="eyebrow">{story.category} · MODAVIS POD · {data?.releaseVersion || "Loading snapshot"}</p><h1>{story.title}</h1><p className="story-deck">{story.summary}</p></header></> : <header className="story-hero"><p className="eyebrow">MODAVIS data stories · Selected data snapshot</p><h1>Questions worth exploring</h1><p><a href="/use-cases/research-workbench">Open the organological research workbench →</a></p><p className="story-deck">Explore organs, their histories and their documentation. Each story connects its findings to the records and methods behind them.</p></header>}
    {error && <p className="notice" role="alert">{error}</p>}
    {!data && !error && <p role="status">Loading the release data…</p>}
    {data && (!story ? <StoryLanding data={data} /> : story.slug === "regional-organ-stop-names" ? <StopStory data={data} /> : story.slug === "organ-corpus-coverage" ? <CoverageStory data={data} /> : story.slug === "documented-organ-lifecycles" ? <LifecycleStory data={data} /> : <NetworkStory data={data} />)}
    {data && <details className="story-method"><summary>Dataset, method and reproducibility</summary><p>Figures come from MODAVIS Pipe Organ Dataset {data.releaseVersion}. Organ counts refer to canonical entities; source records and activity assertions are counted separately. Missing information means that evidence is absent from this release.</p><p>Prepared {new Date(data.generatedAt).toLocaleDateString("en-GB")} from the public core database.</p><p>Database SHA-256: <code>{data.publicCoreSha256}</code></p><a href="/api/research/stories" download>Download the story data</a><a href="/about/release">About the dataset</a></details>}
  </section>;
}

function StoryLanding({ data }: { data: StoryData }) {
  return <><div className="story-statistics"><Stat value={data.counts.organs} label="documented organs" /><Stat value={data.counts.sources} label="source collections" /><Stat value={data.counts.events} label="activity assertions" /></div><div className="story-grid">{STORIES.map(item => { const Icon = item.icon; return <a className="story-card" key={item.slug} href={`/use-cases/${item.slug}`}><Icon size={25} /><span className="eyebrow">{item.category}</span><h2>{item.title}</h2><p>{item.summary}</p><span>Explore the story <ArrowRight size={16} /></span></a>; })}<a className="story-card fire-story-card" href={DALMATIA_FIRE_PATH}><Flame size={25} /><span className="eyebrow">Geography and heritage</span><h2>Pipe organs and 2026 fires in Dalmatia</h2><p>Compare venue-precision organ locations with official EFFIS fire perimeters. Historical analysis: POD 1.5.5 and fire observations through 3 September 2026. This story is not recomputed from the selected candidate.</p><span>Explore the map <ArrowRight size={16} /></span></a></div><section className="story-callout"><MapPin size={24} /><div><h2>Continue with an organ</h2><p>Open a record to inspect its specifications, source history and related people.</p></div><a href="/organs">Browse organs <ArrowRight size={17} /></a></section></>;
}
function Stat({ value, label }: { value: number; label: string }) { return <div><strong>{number(value)}</strong><span>{label}</span></div>; }
function Bars({ rows, maximum, suffix = "" }: { rows: Row[]; maximum?: number; suffix?: string }) {
  const max = maximum || Math.max(1, ...rows.map(row => row.count));
  return <ul className="story-bars">{rows.map(row => <li key={`${row.label}:${row.sourceOnly}`}><div>{row.href ? <a href={row.href}>{row.label}</a> : <span>{row.label}{suffix}</span>}<strong>{number(row.count)}</strong></div><meter min={0} max={max} value={row.count} aria-label={`${row.label}: ${number(row.count)}`} />{row.sourceOnly === 1 && <small>Source wording</small>}</li>)}</ul>;
}
function StorySection({ title, children, id }: { title: string; children: ReactNode; id?: string }) { return <section className="story-section" id={id}><h2>{title}</h2>{children}</section>; }

function CoverageStory({ data }: { data: StoryData }) {
  const coverage = data.coverage;
  const [measure, setMeasure] = useState<"organs" | "records">("organs");
  return <><div className="story-statistics"><Stat value={data.counts.organs} label="canonical organs" /><Stat value={data.counts.sourceRecords} label="supporting source records" /><Stat value={coverage.multipleSourceOrgans} label="organs in multiple collections" /></div><p className="story-lead">Documentation is uneven. A large catalogue brings many instruments into view, but a comparison still depends on which records contain the evidence your question needs.</p><div className="story-columns"><StorySection title="What is documented?"><Bars rows={coverage.features} maximum={data.counts.organs} /><p className="muted">Features overlap: one organ can appear in several bars. Unrecorded evidence is not proof that a feature never existed.</p></StorySection><StorySection title="How collections shape the catalogue"><label className="story-filter">Compare by<select value={measure} onChange={event => setMeasure(event.target.value as typeof measure)}><option value="organs">Canonical organs</option><option value="records">Source records</option></select></label><Bars rows={coverage.sourceCoverage.map(row => ({ label: row.label, count: row[measure], href: `/organs?source=${encodeURIComponent(row.label)}` }))} /><p className="muted">Collection totals overlap where records describe the same canonical organ. They must not be added to estimate unique instruments.</p></StorySection></div><StorySection title="Choose an evidence-rich starting point"><div className="story-link-grid"><a href="/organs?min_sources=2">Compare several sources <ArrowRight size={16} /></a><a href="/organs?conflict_scope=material">Inspect technical disagreements <ArrowRight size={16} /></a><a href="/organs?location_state=coordinates">Explore venue-precision locations <ArrowRight size={16} /></a></div></StorySection></>;
}

function LifecycleStory({ data }: { data: StoryData }) {
  const history = data.history;
  const [controlled, setControlled] = useState(false);
  return <><div className="story-statistics"><Stat value={history.datedAssertions} label="dated activity assertions" /><Stat value={history.assertionsWithParticipants} label="activities with named participants" /><Stat value={history.alternativeDescriptions} label="alternative specification descriptions" /></div><p className="story-lead">An organ biography is assembled from accounts of building, alteration, repair and movement. Each source contributes a view of that history; a date alone does not establish that two descriptions refer to the same physical state.</p><div className="story-columns"><StorySection title="What kinds of activity are reported?"><label className="story-check"><input type="checkbox" checked={controlled} onChange={event => setControlled(event.target.checked)} /> Show controlled types only</label><Bars rows={history.types.filter(row => !controlled || !row.sourceOnly)} /><p className="muted">The most frequent activity types in the release. Several assertions can document the same event.</p></StorySection><StorySection title="When are activities documented?"><Bars rows={history.centuries.map(row => ({ ...row, label: `${row.label}${[11, 12, 13].includes(Number(row.label) % 100) ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[Number(row.label) % 10] || "th"} century` }))} /><p className="muted">For ranges, the earliest recorded bound determines the century. {number(history.undatedAssertions)} assertions have no usable year. These counts do not establish an organ&apos;s age.</p></StorySection></div><StorySection title="Read a biography alongside its specifications" id="alternative-descriptions"><p>The main description, earlier descriptions and descriptions of other instruments stay separate. Dates, source references and named participants help establish what can be compared.</p><div className="story-link-grid">{history.examples.map(example => <a key={example.id} href={example.href}><strong>{example.title}</strong><span>Open history and specification descriptions <ArrowRight size={16} /></span></a>)}</div></StorySection></>;
}

function NetworkStory({ data }: { data: StoryData }) {
  return <><div className="story-statistics"><Stat value={data.networks.actorCount} label="linked people and organisations" /><Stat value={data.networks.linkedOrganCount} label="organs with builder links" /><Stat value={data.networks.associationCount} label="distinct organ–builder associations" /></div><p><a href="/use-cases/research-workbench">Open the reproducible research workbench: selections, comparisons, terminology and source evidence →</a></p><OrganologicalResearch /></>;
}

function StopStory({ data }: { data: StoryData }) {
  const [country, setCountry] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Stop | null>(null);
  const { value: stopData, error } = useJson<{ items: Stop[]; publicCoreSha256: string; total: number; hasMore: boolean }>(`/api/research/stop-names?q=${encodeURIComponent(query)}&country=${encodeURIComponent(country)}&page=${page}`);
  const rows = stopData?.items || [];

  useEffect(() => { setPage(0); setSelected(null); }, [country, query]);
  return <><div className="story-statistics"><Stat value={data.stops.entries} label="documented stop entries" /><Stat value={data.stops.names} label="comparison names" /><Stat value={data.stops.sourceRecords} label="supporting source records" /></div><p className="story-lead">A stop name is evidence of terminology, not a complete acoustic description. Explore where a name is recorded, then compare its pitches, literal forms and source specifications.</p><div className="story-filter-row"><label className="story-filter">Country in the source location<select value={country} onChange={event => setCountry(event.target.value)}><option value="">All documented entries</option>{data.stops.countries.map(row => <option key={row.label} value={row.label}>{row.label} · {number(row.count)}</option>)}</select></label><label className="story-filter">Find a stop name<div className="story-search"><Search size={17} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Principal, Prestant, Bourdon…" /></div></label></div>{error && <p role="alert">{error}</p>}{!stopData && !error && <p role="status">Loading stop names…</p>}{stopData && stopData.publicCoreSha256 !== data.publicCoreSha256 ? <p role="alert">The stop-name data belongs to a different release. Please reload the page.</p> : stopData && <div className="story-columns"><StorySection title={`${number(stopData.total)} matching names`}><div className="story-table-wrap"><table className="story-table"><thead><tr><th>Name</th><th>Entries{country ? ` · ${country}` : ""}</th><th>Pitch examples</th></tr></thead><tbody>{rows.map(row => <tr key={row.label}><td><button className="text-link-button" type="button" onClick={() => setSelected(row)}>{row.label}</button></td><td>{number(country ? row.countries[country] : row.count)}</td><td>{row.pitches.slice(0, 3).map(pitch => pitch.label).join(" · ") || "—"}</td></tr>)}</tbody></table></div>{!rows.length && <p>No names match these filters.</p>}<nav className="story-pagination" aria-label="Stop name results"><button type="button" disabled={!page} onClick={() => setPage(page - 1)}><ChevronLeft size={16} /> Previous</button><span>{rows.length ? `${page * 20 + 1}–${Math.min(stopData.total, (page + 1) * 20)} of ${number(stopData.total)}` : "0 results"}</span><button type="button" disabled={!stopData.hasMore} onClick={() => setPage(page + 1)}>Next <ChevronRight size={16} /></button></nav></StorySection><aside className="story-side-card"><h2>{selected?.label || "Inspect a name"}</h2>{selected ? <><h3>Most frequent recorded forms</h3><Bars rows={selected.forms} /><h3>Country distribution</h3><Bars rows={Object.entries(selected.countries).map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count).slice(0, 10)} /><h3>Specification examples</h3><div className="story-link-grid">{selected.examples.map(example => <a key={example.id} href={example.href}>{example.id.replace("MDVS:ENTY:", "")} <ArrowRight size={16} /></a>)}</div><p className="muted">Examples illustrate this name across the full corpus; the selected country filters the frequency table.</p></> : <p>Select a name to see literal forms, country counts and links to source specifications.</p>}</aside></div>}<details className="story-method"><summary>How names and regions are compared</summary><p>{data.stops.method}</p><p>{number(data.stops.unassignedCountryEntries)} entries remain without an unambiguous country in this comparison. Country does not establish a builder&apos;s nationality or a musical tradition.</p><a href="/api/research/stop-names/download" download>Download all comparison names</a></details></>;
}
