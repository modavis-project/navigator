import { ArrowRight, BarChart3, BookOpen, ChevronLeft, ChevronRight, Database, Flame, MapPin, Network, Search } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { DalmatiaFireUseCase, DALMATIA_FIRE_PATH } from "./dalmatiaFireUseCase";
import { LoadingContent } from "./LoadingContent";
import { OrganologicalResearch } from "./organologicalResearch";
import { ResearchWorkbench } from "./researchWorkbench";
import { useUiLocale, type UiLocale } from "./uiLocale";
import "./publicStories.css";

const STORIES = [
  {
    slug: "regional-organ-stop-names", icon: BookOpen,
    title: ["Organ stop names by region and tradition", "Registerbezeichnungen nach Region und Tradition"],
    category: ["Terminology", "Terminologie"],
    summary: [
      "Compare documented stop names, pitch labels and regional distributions. Similar names can denote different sounds.",
      "Vergleichen Sie überlieferte Registerbezeichnungen, Fußtonlagen und ihre regionale Verteilung. Ähnlich benannte Register können unterschiedlich klingen.",
    ],
  },
  {
    slug: "organ-corpus-coverage", icon: Database,
    title: ["Organ corpus coverage and documentation gaps", "Abdeckung und Dokumentationslücken im Orgelkorpus"],
    category: ["Coverage", "Datenabdeckung"],
    summary: [
      "See which sources and types of documentation shape the catalogue, and where gaps limit comparisons.",
      "Erfahren Sie, welche Quellen und Belege den Katalog prägen und wo Dokumentationslücken den Vergleich einschränken.",
    ],
  },
  {
    slug: "documented-organ-lifecycles", icon: BarChart3,
    title: ["Documented organ lifecycles", "Dokumentierte Orgelgeschichten"],
    category: ["History", "Orgelgeschichte"],
    summary: [
      "Follow construction, rebuilding and restoration through dated accounts and compare separately attributed organ descriptions.",
      "Verfolgen Sie Bau, Umbau und Restaurierung anhand datierter Belege und vergleichen Sie Orgelbeschreibungen aus verschiedenen Quellen.",
    ],
  },
  {
    slug: "builder-workshop-networks", icon: Network,
    title: ["Builder and workshop networks", "Netzwerke von Orgelbauern und Werkstätten"],
    category: ["People and organisations", "Personen und Organisationen"],
    summary: [
      "Explore documented connections between builders, workshops and organs, then inspect the source records behind them.",
      "Entdecken Sie belegte Verbindungen zwischen Orgelbauern, Werkstätten und Instrumenten und lesen Sie die zugehörigen Quellenbelege.",
    ],
  },
] as const;

const FIRE_TITLE = ["Pipe organs and 2026 fires in Dalmatia", "Pfeifenorgeln und Brände in Dalmatien 2026"] as const;

type Row = { label: string; count: number; href?: string; sourceOnly?: number; sourceLabel?: string };
type Example = { id: string; title: string; href: string };
type StoryData = {
  releaseVersion: string; publicCoreSha256: string; generatedAt: string;
  counts: Record<string, number>;
  coverage: { sourceCoverage: Array<{ label: string; records: number; organs: number }>; multipleSourceOrgans: number; features: Row[] };
  history: { datedAssertions: number; undatedAssertions: number; assertionsWithParticipants: number; alternativeDescriptions: number; types: Row[]; centuries: Row[]; examples: Example[] };
  networks: { linkedOrganCount: number; actorCount: number; associationCount: number };
  stops: { entries: number; names: number; sourceRecords: number; unassignedCountryEntries: number; countries: Row[]; method: string };
};
type Stop = { label: string; count: number; countries: Record<string, number>; forms: Row[]; pitches: Row[]; examples: Array<{ id: string; href: string }> };

const COUNTRY_CODES: Record<string, string> = {
  Argentina: "AR", Australia: "AU", Austria: "AT", Belgium: "BE", Brazil: "BR", Canada: "CA",
  China: "CN", Croatia: "HR", "Czech Republic": "CZ", Denmark: "DK", Estonia: "EE", Finland: "FI",
  France: "FR", Germany: "DE", Greece: "GR", Hungary: "HU", Iceland: "IS", Ireland: "IE",
  Israel: "IL", Italy: "IT", Japan: "JP", Latvia: "LV", Lithuania: "LT", Luxembourg: "LU",
  Malta: "MT", Mexico: "MX", Netherlands: "NL", "New Zealand": "NZ", Norway: "NO", Peru: "PE",
  Poland: "PL", Portugal: "PT", Romania: "RO", Russia: "RU", Slovakia: "SK", Slovenia: "SI",
  "South Africa": "ZA", "South Korea": "KR", Spain: "ES", Sweden: "SE", Switzerland: "CH",
  Taiwan: "TW", "United Kingdom": "GB", "United States": "US",
};
const germanRegions = new Intl.DisplayNames("de-DE", { type: "region" });
function countryLabel(label: string, locale: UiLocale) {
  return locale === "de" && COUNTRY_CODES[label] ? germanRegions.of(COUNTRY_CODES[label]) ?? label : label;
}

const ACTIVITY_LABELS: Record<string, string> = {
  Construction: "Neubau", "Construction Or Rebuild": "Bau oder Umbau", Restoration: "Restaurierung",
  "Organ Work": "Orgelarbeiten", Installation: "Aufstellung", Transfer: "Versetzung",
  "Original Construction": "Ursprünglicher Bau", Rebuild: "Umbau", Repair: "Reparatur",
  Reconstruction: "Rekonstruktion", Activity: "Tätigkeit", Rebuilding: "Umbau",
  Removal: "Abbau", Alteration: "Veränderung", Relocation: "Standortwechsel",
  "Source Documented Intervention": "Quellenbelegter Eingriff", Maintenance: "Wartung", Building: "Bau",
};

const COVERAGE_LABELS: Record<string, string> = {
  "Retained main stop entries": "Registereinträge in der Hauptdisposition",
  "Documented activities": "Dokumentierte Tätigkeiten",
  "Linked builder identity": "Verknüpfte Orgelbauer oder Werkstätten",
  "Alternative specification descriptions": "Weitere Dispositionsbeschreibungen",
  "Linked virtual instrument": "Verknüpftes virtuelles Instrument",
  "Attributed media reference": "Medienverweis mit Quellenbezug",
};

const COVERAGE_LINKS = new Map<string, string | undefined>([
  ["/map", "/map?precision=all"],
  ["/organs?media=yes", "/organs?media_state=available"],
  ["/organs?specification_state=stops", undefined],
]);

function useJson<T>(path: string | null) {
  const [result, setResult] = useState<{ path: string; value: T | null; error: boolean }>();
  useEffect(() => {
    if (!path) return;
    const controller = new AbortController();
    fetch(path, { signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error("Story data unavailable");
      return response.json() as Promise<T>;
    }).then(value => {
      if (!controller.signal.aborted) setResult({ path, value, error: false });
    }).catch(() => {
      if (!controller.signal.aborted) setResult({ path, value: null, error: true });
    });
    return () => controller.abort();
  }, [path]);
  return result?.path === path ? result : { value: null, error: false };
}

export function UseCasesArea() {
  const { locale, intlLocale, t } = useUiLocale();
  const [route, setRoute] = useState(() => window.location.pathname + window.location.search);
  useEffect(() => {
    const sync = () => setRoute(window.location.pathname + window.location.search);
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);
  const path = window.location.pathname.replace(/\/+$/, "");
  const fire = path === DALMATIA_FIRE_PATH;
  const workbench = path === "/use-cases/research-workbench";
  const story = STORIES.find(item => path === `/use-cases/${item.slug}`);
  const title = story ? t(`story.${story.slug}.title`, story.title[0], story.title[1]) : t("story.index.title", "Data stories", "Datenberichte");
  const { value: data, error } = useJson<StoryData>(story || path === "/use-cases" ? "/api/research/stories" : null);

  useEffect(() => {
    if (!fire && !workbench) document.title = `${title} | MODAVIS Navigator`;
  }, [title, fire, workbench]);

  if (workbench) return <ResearchWorkbench />;
  if (fire) return <>
    <p className="notice">{t("story.fire.snapshot", "Historical analysis based on POD 1.5.5 and fire observations through 3 September 2026.", "Historische Auswertung auf Grundlage des POD 1.5.5 und der bis zum 3. September 2026 erfassten Brände.")}</p>
    <DalmatiaFireUseCase route={route} onNavigate={setRoute} />
  </>;
  if (!story && path !== "/use-cases") return <section className="story-page">
    <h1>{t("story.notFound", "Story not found", "Datenbericht nicht gefunden")}</h1>
    <a href="/use-cases">{t("story.browse", "Browse data stories", "Datenberichte ansehen")}</a>
  </section>;

  return <section className="story-page" id="use-cases" tabIndex={-1}>
    {story ? <>
      <a className="catalog-back" href="/use-cases"><ChevronLeft size={17} aria-hidden="true" /> {t("story.back", "All data stories", "Alle Datenberichte")}</a>
      <header className="story-hero">
        <p className="eyebrow">{t(`story.${story.slug}.category`, story.category[0], story.category[1])}{data && ` · MODAVIS POD ${data.releaseVersion}`}</p>
        <h1>{title}</h1>
        <p className="story-deck">{t(`story.${story.slug}.summary`, story.summary[0], story.summary[1])}</p>
      </header>
    </> : <header className="story-hero">
      <h1>{title}</h1>
      <p className="story-deck">{t("story.index.summary", "Explore organs, their histories and their documentation. Each story links its findings to the records and methods behind them.", "Die Berichte beleuchten Orgeln, ihre Geschichte und die Quellen, die darüber Auskunft geben. Zu jedem Ergebnis finden Sie die zugehörigen Belege und den Weg der Auswertung.")}</p>
      {data && <p className="eyebrow">{t("story.index.snapshot", "Data snapshot", "Datenstand")} · MODAVIS POD {data.releaseVersion}</p>}
    </header>}
    {error && <p className="notice" role="alert">{t("story.error", "The story data could not be loaded. Please reload the page.", "Die Daten für diesen Bericht konnten nicht geladen werden. Bitte laden Sie die Seite neu.")}</p>}
    {!data && !error && <LoadingContent label={t("story.loading", "Loading the release data…", "Die Daten des POD werden geladen …")} />}
    {data && (!story ? <StoryLanding data={data} /> : story.slug === "regional-organ-stop-names" ? <StopStory data={data} /> : story.slug === "organ-corpus-coverage" ? <CoverageStory data={data} /> : story.slug === "documented-organ-lifecycles" ? <LifecycleStory data={data} /> : <NetworkStory data={data} />)}
    {data && <details className="story-method">
      <summary>{t("story.method.title", "Dataset, method and reproducibility", "Datengrundlage und Nachvollziehbarkeit")}</summary>
      <p>{t("story.method.scope", "Figures come from MODAVIS Pipe Organ Dataset {version}. Organ counts refer to canonical records. Source records and activity assertions are counted separately. Gaps describe the evidence available in this release.", "Die Zahlen stammen aus dem MODAVIS Pipe Organ Dataset {version}. Orgeln werden anhand ihrer kanonischen Datensätze gezählt. Quelldatensätze und Angaben zu Tätigkeiten werden getrennt ausgewiesen. Dokumentationslücken beziehen sich auf die Beleglage in dieser Version.", { version: data.releaseVersion })}</p>
      <p>{t("story.method.prepared", "Analysis prepared on {date}.", "Auswertung erstellt am {date}.", { date: new Intl.DateTimeFormat(intlLocale, { dateStyle: "long", timeZone: "UTC" }).format(new Date(data.generatedAt)) })}</p>
      <p>{t("story.method.checksum", "Database SHA-256", "SHA-256-Prüfsumme der Datenbank")}: <code>{data.publicCoreSha256}</code></p>
      <a href="/api/research/stories" download>{t("story.method.download", "Download the story data", "Datengrundlage herunterladen")}</a>
      <a href="/about/release">{t("story.method.dataset", "About the dataset", "Über die Daten")}</a>
    </details>}
  </section>;
}

function StoryLanding({ data }: { data: StoryData }) {
  const { t } = useUiLocale();
  return <>
    <div className="story-statistics">
      <Stat value={data.counts.organs} label={t("story.index.organs", "documented organs", "dokumentierte Orgeln")} />
      <Stat value={data.counts.sources} label={t("story.index.collections", "source collections", "Quellensammlungen")} />
      <Stat value={data.counts.events} label={t("story.index.events", "activity assertions", "Angaben zu Tätigkeiten")} />
    </div>
    <div className="story-grid">
      {STORIES.map(({ slug, icon: Icon, title, category, summary }) => (
        <a className="story-card" key={slug} href={`/use-cases/${slug}`}>
          <Icon size={25} aria-hidden="true" />
          <span className="eyebrow">{t(`story.${slug}.category`, category[0], category[1])}</span>
          <h2>{t(`story.${slug}.title`, title[0], title[1])}</h2>
          <p>{t(`story.${slug}.summary`, summary[0], summary[1])}</p>
          <span>{t("story.index.open", "Read the story", "Bericht lesen")} <ArrowRight size={16} aria-hidden="true" /></span>
        </a>
      ))}
      <a className="story-card fire-story-card" href={DALMATIA_FIRE_PATH}>
        <Flame size={25} aria-hidden="true" />
        <span className="eyebrow">{t("story.fire.category", "Geography and heritage", "Geografie und Kulturerbe")}</span>
        <h2>{t("story.fire.title", ...FIRE_TITLE)}</h2>
        <p>{t("story.fire.summary", "Compare precise venue locations with official EFFIS fire perimeters. The historical analysis uses POD 1.5.5 and fire observations through 3 September 2026.", "Vergleichen Sie genaue Orgelstandorte mit den amtlichen Brandflächen des EFFIS. Die historische Auswertung beruht auf dem POD 1.5.5 und den bis zum 3. September 2026 erfassten Bränden.")}</p>
        <span>{t("story.fire.open", "Explore the map", "Karte erkunden")} <ArrowRight size={16} aria-hidden="true" /></span>
      </a>
    </div>
    <section className="story-callout"><MapPin size={24} aria-hidden="true" /><div>
      <h2>{t("story.index.record", "Continue with an organ", "Eine Orgel im Detail ansehen")}</h2>
      <p>{t("story.index.recordDetails", "Open a record to inspect its specifications, history and associated people.", "In den Orgeldatensätzen finden Sie Dispositionen, geschichtliche Angaben und beteiligte Personen.")}</p>
    </div><a href="/organs">{t("story.index.browseOrgans", "Browse organs", "Orgelkatalog öffnen")} <ArrowRight size={17} aria-hidden="true" /></a></section>
  </>;
}

function Stat({ value, label }: { value: number; label: string }) {
  const { formatNumber } = useUiLocale();
  return <div><strong>{formatNumber(value)}</strong><span>{label}</span></div>;
}

function Bars({ rows, maximum }: { rows: Row[]; maximum?: number }) {
  const { t, formatNumber } = useUiLocale();
  const max = maximum || Math.max(1, ...rows.map(row => row.count));
  return <ul className="story-bars">{rows.map(row => <li key={row.href || row.label}>
    <div>{row.href ? <a href={row.href}>{row.label}</a> : <span>{row.label}</span>}<strong>{formatNumber(row.count)}</strong></div>
    <meter min={0} max={max} value={row.count} aria-label={row.label} />
    {row.sourceOnly === 1 && <small>{t("story.chart.sourceWording", "Source designation", "Quellenbezeichnung")}{row.sourceLabel && <>: <span lang="en">{row.sourceLabel}</span></>}</small>}
  </li>)}</ul>;
}

function StorySection({ title, children, id }: { title: string; children: ReactNode; id?: string }) {
  return <section className="story-section" id={id}><h2>{title}</h2>{children}</section>;
}

function CoverageStory({ data }: { data: StoryData }) {
  const { t, locale } = useUiLocale();
  const { coverage } = data;
  const [measure, setMeasure] = useState<"organs" | "records">("organs");
  const features = coverage.features.map(row => ({
    ...row,
    label: row.label === "Current map coordinates"
      ? t("story.coverage.mapped", "Mapped positions in current source records", "Kartierte Standorte laut aktueller Quellenangabe")
      : locale === "de" ? COVERAGE_LABELS[row.label] ?? row.label : row.label,
    href: row.href && COVERAGE_LINKS.has(row.href) ? COVERAGE_LINKS.get(row.href) : row.href,
  }));
  return <>
    <div className="story-statistics">
      <Stat value={data.counts.organs} label={t("story.coverage.organs", "canonical organ records", "kanonische Orgeldatensätze")} />
      <Stat value={data.counts.sourceRecords} label={t("story.coverage.records", "supporting source records", "zugehörige Quelldatensätze")} />
      <Stat value={coverage.multipleSourceOrgans} label={t("story.coverage.multiple", "organs in multiple collections", "Orgeln in mehreren Sammlungen")} />
    </div>
    <p className="story-lead">{t("story.coverage.lead", "Documentation is uneven. Comparisons depend on whether records contain the evidence needed for a question.", "Die Orgeln sind unterschiedlich gut dokumentiert. Ob ein Vergleich möglich ist, hängt davon ab, ob die Quellen genug Belege für die jeweilige Fragestellung liefern.")}</p>
    <div className="story-columns">
      <StorySection title={t("story.coverage.features", "What is documented?", "Was ist dokumentiert?")}>
        <Bars rows={features} maximum={data.counts.organs} />
        <p className="muted">{t("story.coverage.overlap", "Each bar counts organ records. One record can appear in several bars. Documentation gaps leave the historical question open.", "Jeder Balken zählt Orgeldatensätze. Ein Datensatz kann zu mehreren Kategorien gehören. Fehlende Angaben lassen die historische Frage offen.")}</p>
        <p className="muted">{t("story.coverage.precision", "Mapped positions include exact sites and approximate localities. The catalogue links below open particular kinds of evidence.", "Kartierte Standorte umfassen genaue Standorte und ungefähre Ortsangaben. Die folgenden Kataloglinks führen zu einzelnen Belegarten.")}</p>
      </StorySection>
      <StorySection title={t("story.coverage.collections", "How collections shape the catalogue", "Welche Sammlungen prägen den Katalog?")}>
        <label className="story-filter">{t("story.coverage.compare", "Compare by", "Zählweise")}
          <select value={measure} onChange={event => setMeasure(event.target.value as typeof measure)}>
            <option value="organs">{t("story.coverage.organMode", "Canonical organ records", "Kanonische Orgeldatensätze")}</option>
            <option value="records">{t("story.coverage.sourceMode", "Source records", "Quelldatensätze")}</option>
          </select>
        </label>
        <Bars rows={coverage.sourceCoverage.map(row => ({ label: row.label, count: row[measure], href: `/organs?source=${encodeURIComponent(row.label)}` }))} />
        <p className="muted">{t("story.coverage.collectionOverlap", "Several collections may describe the same organ. The sum of their counts can therefore exceed the number of distinct instruments.", "Mehrere Sammlungen können dieselbe Orgel beschreiben. Ihre Summen können daher über der Zahl der erfassten Instrumente liegen.")}</p>
      </StorySection>
    </div>
    <StorySection title={t("story.coverage.start", "Continue with the records", "Mit den Datensätzen weiterarbeiten")}>
      <div className="story-link-grid">
        <a href="/use-cases/research-workbench?view=selection&amp;section=organs">{t("story.coverage.selection", "Build a source-based organ selection", "Orgeln nach Quellen auswählen")} <ArrowRight size={16} aria-hidden="true" /></a>
        <a href="/organs?conflict_scope=material">{t("story.coverage.disagreement", "Inspect conflicting technical descriptions", "Widersprüchliche technische Angaben prüfen")} <ArrowRight size={16} aria-hidden="true" /></a>
        <a href="/organs?location_state=coordinates">{t("story.coverage.locations", "Browse organs with exact current positions", "Orgeln mit genauer aktueller Standortangabe ansehen")} <ArrowRight size={16} aria-hidden="true" /></a>
        <a href="/organs?specification_state=stops">{t("story.coverage.stops", "Browse organs with stop entries across specifications", "Orgeln mit Registereinträgen in den erfassten Dispositionen ansehen")} <ArrowRight size={16} aria-hidden="true" /></a>
      </div>
    </StorySection>
  </>;
}

function LifecycleStory({ data }: { data: StoryData }) {
  const { locale, t, formatNumber } = useUiLocale();
  const { history } = data;
  const [controlled, setControlled] = useState(false);
  const types = history.types.filter(row => !controlled || !row.sourceOnly).map(row => ({
    ...row,
    label: locale === "de" ? ACTIVITY_LABELS[row.label] ?? row.label : row.label,
    sourceLabel: locale === "de" && row.sourceOnly ? row.label : undefined,
  }));
  const centuries = history.centuries.map(row => ({
    ...row,
    label: t("story.history.century", "{century, selectordinal, one {#st} two {#nd} few {#rd} other {#th}} century", "{century, selectordinal, other {#.}} Jahrhundert", { century: Number(row.label) }),
  }));
  return <>
    <div className="story-statistics">
      <Stat value={history.datedAssertions} label={t("story.history.dated", "dated activity assertions", "datierte Angaben zu Tätigkeiten")} />
      <Stat value={history.assertionsWithParticipants} label={t("story.history.participants", "activity assertions with named participants", "Angaben zu Tätigkeiten mit namentlich genannten Beteiligten")} />
      <Stat value={history.alternativeDescriptions} label={t("story.history.alternatives", "additional specification descriptions", "weitere Dispositionsbeschreibungen")} />
    </div>
    <p className="story-lead">{t("story.history.lead", "Accounts of construction, alteration, repair and relocation tell the history of an organ. Each source contributes its own perspective. An identical date alone cannot establish that two descriptions refer to the same condition of the instrument.", "Berichte über Bau, Umbau, Reparatur und Versetzung erzählen die Geschichte einer Orgel. Jede Quelle trägt ihre eigene Sicht bei. Ein übereinstimmendes Datum allein reicht nicht aus, um zwei Beschreibungen demselben Zustand des Instruments zuzuordnen.")}</p>
    <div className="story-columns">
      <StorySection title={t("story.history.activities", "What kinds of activity are reported?", "Welche Tätigkeiten sind belegt?")}>
        <label className="story-check"><input type="checkbox" checked={controlled} onChange={event => setControlled(event.target.checked)} /> {t("story.history.controlled", "Show only standardised activity types", "Nur Tätigkeitsarten aus dem kontrollierten Vokabular anzeigen")}</label>
        <Bars rows={types} maximum={Math.max(1, ...history.types.map(row => row.count))} />
        <p className="muted">{t("story.history.frequency", "The bars show the most frequent activity types. Several source assertions can describe the same event.", "Die Balken zeigen die häufigsten Tätigkeitsarten. Mehrere Quellenbelege können sich auf dasselbe Ereignis beziehen.")}</p>
      </StorySection>
      <StorySection title={t("story.history.period", "When are activities documented?", "Für welche Zeiten gibt es Belege?")}>
        <Bars rows={centuries} />
        <p className="muted">{t("story.history.dates", "For date ranges, the earliest stated year determines the century. {undated} assertions lack a usable year. These figures describe the dates in the evidence.", "Bei Zeitspannen bestimmt das früheste angegebene Jahr die Zuordnung zum Jahrhundert. Für {undated} Angaben liegt kein verwendbares Jahr vor. Die Zahlen beschreiben die Datierung der Belege.", { undated: formatNumber(history.undatedAssertions) })}</p>
      </StorySection>
    </div>
    <StorySection title={t("story.history.compare", "Read a history alongside its specifications", "Orgelgeschichte und Disposition zusammen lesen")} id="alternative-descriptions">
      <p>{t("story.history.compareEvidence", "The main description, historical descriptions and accounts of other instruments remain separate. Dates, source references and named participants help establish what can be compared.", "Die Hauptbeschreibung, frühere Beschreibungen und Angaben zu anderen Instrumenten werden getrennt geführt. Datierungen, Quellenverweise und genannte Beteiligte helfen zu beurteilen, welche Angaben sich vergleichen lassen.")}</p>
      <div className="story-link-grid">{history.examples.map(example => <a key={example.id} href={example.href}>
        <strong>{example.title}</strong>
        <span>{t("story.history.open", "Open the organ history", "Orgelgeschichte öffnen")} <ArrowRight size={16} aria-hidden="true" /></span>
      </a>)}</div>
    </StorySection>
  </>;
}

function NetworkStory({ data }: { data: StoryData }) {
  const { t } = useUiLocale();
  return <>
    <div className="story-statistics">
      <Stat value={data.networks.actorCount} label={t("story.network.people", "linked people and organisations", "verknüpfte Personen und Organisationen")} />
      <Stat value={data.networks.linkedOrganCount} label={t("story.network.organs", "organs linked to builders", "Orgeln mit Verweisen auf Orgelbauer")} />
      <Stat value={data.networks.associationCount} label={t("story.network.associations", "distinct organ–builder links", "einzelne Verknüpfungen zwischen Orgeln und Orgelbauern")} />
    </div>
    <OrganologicalResearch />
  </>;
}

function StopStory({ data }: { data: StoryData }) {
  const { locale, t, formatNumber } = useUiLocale();
  const [country, setCountry] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Stop | null>(null);
  const endpoint = new URLSearchParams({ q: query, country, page: String(page) });
  const { value: stopData, error } = useJson<{ items: Stop[]; publicCoreSha256: string; total: number; offset: number; hasMore: boolean }>(`/api/research/stop-names?${endpoint}`);
  const rows = stopData?.items ?? [];
  const resetResults = () => { setPage(0); setSelected(null); };

  return <>
    <div className="story-statistics">
      <Stat value={data.stops.entries} label={t("story.stops.entries", "documented stop entries", "dokumentierte Registereinträge")} />
      <Stat value={data.stops.names} label={t("story.stops.normalized", "normalised names for comparison", "vereinheitlichte Bezeichnungen für den Vergleich")} />
      <Stat value={data.stops.sourceRecords} label={t("story.stops.sources", "supporting source records", "zugehörige Quelldatensätze")} />
    </div>
    <p className="story-lead">{t("story.stops.lead", "A stop name documents the terminology used. Compare the places where it is recorded, the pitch labels, original spellings and source specifications.", "Eine Registerbezeichnung belegt den Sprachgebrauch in der Quelle. Vergleichen Sie die Fundorte, Fußtonlagen, überlieferten Schreibweisen und zugehörigen Dispositionen.")}</p>
    <div className="story-filter-row">
      <label className="story-filter">{t("story.stops.country", "Country in the source location", "Land laut Standortangabe der Quelle")}
        <select value={country} onChange={event => { setCountry(event.target.value); resetResults(); }}>
          <option value="">{t("story.stops.all", "All documented entries", "Alle belegten Einträge")}</option>
          {data.stops.countries.map(row => <option key={row.label} value={row.label}>{countryLabel(row.label, locale)} · {formatNumber(row.count)}</option>)}
        </select>
      </label>
      <label className="story-filter">{t("story.stops.search", "Find a stop name", "Registerbezeichnung suchen")}
        <div className="story-search"><Search size={17} aria-hidden="true" />
          <input type="search" value={query} onChange={event => { setQuery(event.target.value); resetResults(); }} placeholder="Principal, Prestant, Bourdon …" />
        </div>
      </label>
    </div>
    {error && <p role="alert">{t("story.stops.error", "Stop names could not be loaded. Please reload the page.", "Die Registerbezeichnungen konnten nicht geladen werden. Bitte laden Sie die Seite neu.")}</p>}
    {!stopData && !error && <LoadingContent label={t("story.stops.loading", "Loading stop names…", "Die Registerbezeichnungen werden geladen …")} />}
    {stopData && (stopData.publicCoreSha256 !== data.publicCoreSha256
      ? <p role="alert">{t("story.stops.mismatch", "The stop-name index belongs to a different data snapshot. Please reload the page.", "Das Verzeichnis der Registerbezeichnungen gehört zu einem anderen Datenstand. Bitte laden Sie die Seite neu.")}</p>
      : <div className="story-columns">
        <StorySection title={t("story.stops.matches", "{count, plural, one {# matching name} other {# matching names}}", "{count, plural, one {# passende Bezeichnung} other {# passende Bezeichnungen}}", { count: stopData.total })}>
          <div className="story-table-wrap"><table className="story-table">
            <thead><tr>
              <th scope="col">{t("story.stops.name", "Name", "Registerbezeichnung")}</th>
              <th scope="col">{t("story.stops.entryCount", "Entries", "Einträge")}{country && ` · ${countryLabel(country, locale)}`}</th>
              <th scope="col">{t("story.stops.pitch", "Pitch examples", "Beispiele für Fußtonlagen")}</th>
            </tr></thead>
            <tbody>{rows.map(row => <tr key={row.label}>
              <td><button className="text-link-button" type="button" aria-pressed={selected?.label === row.label} onClick={() => setSelected(row)}>{row.label}</button></td>
              <td>{formatNumber(country ? row.countries[country] : row.count)}</td>
              <td>{row.pitches.slice(0, 3).map(pitch => pitch.label).join(" · ") || "—"}</td>
            </tr>)}</tbody>
          </table></div>
          {!rows.length && <p>{t("story.stops.empty", "No names match these filters.", "Keine Registerbezeichnung entspricht diesen Filtern.")}</p>}
          {rows.length > 0 && <nav className="story-pagination" aria-label={t("story.stops.pagination", "Stop name results", "Seiten der Registersuche")}>
            <button type="button" disabled={!page} onClick={() => { setPage(page - 1); setSelected(null); }}><ChevronLeft size={16} aria-hidden="true" /> {t("story.stops.previous", "Previous", "Zurück")}</button>
            <span>{t("story.stops.range", "{first}–{last} of {total}", "{first}–{last} von {total}", { first: formatNumber(stopData.offset + 1), last: formatNumber(stopData.offset + rows.length), total: formatNumber(stopData.total) })}</span>
            <button type="button" disabled={!stopData.hasMore} onClick={() => { setPage(page + 1); setSelected(null); }}>{t("story.stops.next", "Next", "Weiter")} <ChevronRight size={16} aria-hidden="true" /></button>
          </nav>}
        </StorySection>
        <aside className="story-side-card"><h2>{selected?.label || t("story.stops.inspect", "Inspect a name", "Eine Bezeichnung untersuchen")}</h2>
          {selected ? <>
            <h3>{t("story.stops.forms", "Most frequent recorded forms", "Häufigste überlieferte Schreibweisen")}</h3>
            <Bars rows={selected.forms} />
            <h3>{t("story.stops.distribution", "Distribution by country", "Verteilung nach Ländern")}</h3>
            <Bars rows={Object.entries(selected.countries).map(([label, count]) => ({ label: countryLabel(label, locale), count })).sort((a, b) => b.count - a.count).slice(0, 10)} />
            <h3>{t("story.stops.examples", "Examples from documented specifications", "Beispiele aus überlieferten Dispositionen")}</h3>
            <div className="story-link-grid">{selected.examples.map(example => <a key={example.id} href={example.href}>{example.id.replace("MDVS:ENTY:", "")} <ArrowRight size={16} aria-hidden="true" /></a>)}</div>
            <p className="muted">{t("story.stops.exampleScope", "Examples and the country chart cover the full corpus. The country filter applies to the results table.", "Die Beispiele und die Länderverteilung beziehen sich auf das gesamte Korpus. Der Länderfilter gilt für die Ergebnistabelle.")}</p>
          </> : <p>{t("story.stops.select", "Choose a name to see spellings, counts by country and links to documented specifications.", "Wählen Sie eine Bezeichnung aus, um Schreibweisen, Häufigkeiten nach Land und Links zu überlieferten Dispositionen zu sehen.")}</p>}
        </aside>
      </div>)}
    <details className="story-method">
      <summary>{t("story.stops.method", "How names and regions are compared", "Vergleich von Registerbezeichnungen und Regionen")}</summary>
      <p>{locale === "en" ? data.stops.method : "Für den Vergleich der Quellenbezeichnungen werden Groß- und Kleinschreibung sowie Leerzeichen vereinheitlicht. Eine Fußtonlage am Ende der Bezeichnung wird nur entfernt, wenn sie mit der separat erfassten Fußtonlage übereinstimmt. Maßgeblich ist das Land laut der aktuellen Standortangabe im selben Quelldatensatz. Widersprüchliche oder nicht zuordenbare Angaben bleiben ohne Land. Registereinträge aus Hauptdispositionen verschiedener Quellen bleiben getrennte Beobachtungen. Historische und weitere Dispositionsbeschreibungen behandelt der Bericht zur Orgelgeschichte."}</p>
      <p>{t("story.stops.unassigned", "{count} entries have no unambiguous country in this comparison. Locations describe source coverage and do not establish a builder’s nationality or musical tradition.", "{count} Einträge lassen sich in diesem Vergleich keinem Land eindeutig zuordnen. Die Verteilung zeigt die räumliche Abdeckung der Quellen. Daraus lässt sich weder die Nationalität eines Orgelbauers noch eine musikalische Tradition ableiten.", { count: formatNumber(data.stops.unassignedCountryEntries) })}</p>
      <a href="/api/research/stop-names/download" download>{t("story.stops.download", "Download all normalised names", "Alle vereinheitlichten Bezeichnungen herunterladen")}</a>
    </details>
  </>;
}
