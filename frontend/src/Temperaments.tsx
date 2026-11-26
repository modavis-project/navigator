import "./temperaments.css";
import { ChevronLeft, ChevronRight, Map as MapIcon, Search, SlidersHorizontal } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  fetchTemperament,
  fetchTemperamentOrgans,
  fetchTemperaments,
  type TuningOccurrenceScope,
  type TuningSystemDetail,
  type TuningSystemList,
  type TuningSystemOrganLinks,
  type TuningSystemSummary,
} from "./api";
import { EmptyState, Pill, SectionHead } from "./catalogPresentation";
import { formatFieldValue, formatInteger, friendlyLabel } from "./formatting";
import { LoadingContent } from "./LoadingContent";
import { positiveRouteInt } from "./routeParameters";
import { TemperamentComparison } from "./temperamentComparison";
import {
  MAX_OCCURRENCE_FILTER, MAX_TEMPERAMENT_COMPARISON, occurrenceRangeIssue, occurrenceScope, occurrenceSort,
  readTemperamentComparison, temperamentCatalogueHref, temperamentDetailHref, temperamentOrganHref,
} from "./temperamentOccurrences";
import { TemperamentSearchNotice } from "./temperamentSearch";
import { useUiLocale } from "./uiLocale";
import "./temperamentOccurrences.css";

function readTemperamentCatalogueFilters() {
  const params = new URLSearchParams(window.location.search);
  const scope = params.get("scope");
  const queryScope: "identity" | "evidence" | undefined = scope === "identity" || scope === "evidence" ? scope : undefined;
  return {
    queryValue: params.get("q") || "",
    queryScope,
    groupKey: params.get("group_key") || "",
    precision: params.get("precise_variant") === "true" ? "precise" : params.get("precise_variant") === "false" ? "rounded" : "",
    commentary: params.get("commentary_available") === "true" ? "available" : params.get("commentary_available") === "false" ? "missing" : "",
    commentaryQuery: params.get("commentary_q") || "",
    offset: positiveRouteInt(params.get("offset"), 0, 100_000),
    sort: occurrenceSort(params.get("sort")),
    match: occurrenceScope(params.get("occurrence_scope")),
    minimum: params.get("min_occurrences") ?? "",
    maximum: params.get("max_occurrences") ?? "",
  };
}

export function TemperamentsSection({ publicDatasetProfile }: { publicDatasetProfile: boolean }) {
  const { t } = useUiLocale();
  const [filters, setFilters] = useState(readTemperamentCatalogueFilters);
  const { queryValue, queryScope, groupKey, precision, commentary, commentaryQuery, offset, sort, match, minimum, maximum } = filters;
  const updateFilters = (change: Partial<typeof filters>) => setFilters((current) => ({ ...current, ...change, offset: 0 }));
  const setOffset = (next: number) => setFilters((current) => ({ ...current, offset: next }));
  const rangeIssue = occurrenceRangeIssue(minimum, maximum);
  const requestKey = JSON.stringify(filters);
  const [selectedIds, setSelectedIds] = useState(() => readTemperamentComparison(new URLSearchParams(window.location.search)));
  const [result, setResult] = useState<{ key: string; data: TuningSystemList } | null>(null);
  const list = result?.key === requestKey ? result.data : null;
  const [error, setError] = useState<string | null>(null);
  const pageSize = 6;
  useEffect(() => {
    setError(null);
    if (rangeIssue) return;
    const request = new AbortController();
    fetchTemperaments({
      mode: "surface",
      query: queryValue,
      queryScope,
      groupKey: groupKey || undefined,
      preciseVariant: precision === "" ? undefined : precision === "precise",
      commentaryAvailable: commentary === "" ? undefined : commentary === "available",
      commentaryQuery: commentaryQuery || undefined,
      limit: pageSize,
      offset,
      sort,
      occurrenceScope: match,
      minOccurrences: minimum === "" ? undefined : Number(minimum),
      maxOccurrences: maximum === "" ? undefined : Number(maximum),
      signal: request.signal,
    })
      .then((data) => {
        if (!request.signal.aborted) {
          setResult({ key: requestKey, data });
        }
      })
      .catch((err: Error) => {
        if (!request.signal.aborted) setError(err.message);
      });
    return () => request.abort();
  }, [commentary, commentaryQuery, groupKey, match, maximum, minimum, offset, precision, queryScope, queryValue, rangeIssue, requestKey, sort]);
  useEffect(() => {
    const onBack = () => {
      setFilters(readTemperamentCatalogueFilters());
      setSelectedIds(readTemperamentComparison(new URLSearchParams(window.location.search)));
    };
    window.addEventListener("popstate", onBack);
    return () => window.removeEventListener("popstate", onBack);
  }, []);
  useEffect(() => {
    const url = new URL(window.location.href);
    if (!/^\/temperaments\/?$/.test(url.pathname)) return;
    const update = (key: string, value: string) => value ? url.searchParams.set(key, value) : url.searchParams.delete(key);
    update("q", queryValue);
    update("scope", queryScope || "");
    update("group_key", groupKey);
    update("precise_variant", precision ? String(precision === "precise") : "");
    update("commentary_available", commentary ? String(commentary === "available") : "");
    update("commentary_q", commentaryQuery);
    update("offset", offset ? String(offset) : "");
    update("sort", sort === "catalogue" ? "" : sort);
    update("occurrence_scope", match === "all" ? "" : match);
    update("min_occurrences", minimum);
    update("max_occurrences", maximum);
    update("compare", selectedIds.join(","));
    if (url.href !== window.location.href) window.history.replaceState(window.history.state, "", url);
  }, [commentary, commentaryQuery, groupKey, match, maximum, minimum, offset, precision, queryScope, queryValue, selectedIds, sort]);
  const catalogueQuery = new URLSearchParams(window.location.search);
  if (selectedIds.length) catalogueQuery.set("compare", selectedIds.join(","));
  else catalogueQuery.delete("compare");
  const catalogueHref = temperamentCatalogueHref(`/temperaments?${catalogueQuery}`);
  const facets = result?.data.facets;
  const publicProjection = publicDatasetProfile || Boolean(result?.data.source?.publicProjection);
  const visibleItems = useMemo(() => new Map((list?.items ?? []).map(item => [item.tuningId || item.id, item])), [list]);
  const toggleSelected = (item: TuningSystemSummary) => {
    const id = item.tuningId || item.id;
    setSelectedIds((current) => {
      if (current.includes(id)) return current.filter(value => value !== id);
      if (current.length >= MAX_TEMPERAMENT_COMPARISON) return current;
      return [...current, id];
    });
  };
  return (
    <section className="entity-section research-evidence-browser temperaments-browser" id="temperaments" tabIndex={-1}>
      <SectionHead
        headingLevel={1}
        eyebrow={t("tuning.catalogue.eyebrow", "Tuning systems", "Stimmungssysteme")}
        title={t("tuning.catalogue.title", "Historical temperaments", "Historische Stimmungen")}
        detail={<>
          {list ? t("tuning.catalogue.total", "{total, plural, one {# temperament} other {# temperaments}}", "{total, plural, one {# Stimmungssystem} other {# Stimmungssysteme}}", { total: list.total })
            : t("tuning.catalogue.loading", "Loading temperaments…", "Stimmungssysteme werden geladen …")}
          {" · "}<a href="https://bund-deutscher-orgelbaumeister.de/lexikon-der-stimmungen/">Bund Deutscher Orgelbaumeister</a>
        </>}
      />
      <div className="research-evidence-controls temperaments-controls aligned-catalogue-controls">
        <label className="temperaments-search">
          <span>{t("tuning.catalogue.search", "Search temperament systems", "Stimmungssysteme durchsuchen")}</span>
          <span className="search-field">
            <Search size={18} aria-hidden="true" />
            <input value={queryValue} onChange={(event) => updateFilters({ queryValue: event.target.value })} placeholder={t("tuning.catalogue.searchHint", "e.g. Kirnberger or 2hKi2", "z. B. Kirnberger oder 2hKi2")} />
          </span>
        </label>
        <label className="temperaments-search">
          <span>{publicProjection ? t("tuning.catalogue.literature", "Search cited literature", "Zitierte Literatur durchsuchen") : t("tuning.catalogue.searchNotes", "Search commentary and literature", "Erläuterungen und Literatur durchsuchen")}</span>
          <span className="search-field">
            <Search size={18} aria-hidden="true" />
            <input value={commentaryQuery} onChange={(event) => updateFilters({ commentaryQuery: event.target.value })} placeholder={t("tuning.catalogue.referenceHint", "Author or title", "Autor oder Titel")} />
          </span>
        </label>
        <label>
          <span>{t("tuning.catalogue.group", "Group", "Gruppe")}</span>
          <select value={groupKey} onChange={(event) => updateFilters({ groupKey: event.target.value })}>
            <option value="">{t("tuning.catalogue.allGroups", "All groups", "Alle Gruppen")}</option>
            {groupKey && !facets?.groups.some((item) => item.value === groupKey) && <option value={groupKey}>{groupKey.replace("gruppe_", "Group ")}</option>}
            {(facets?.groups ?? []).map((item) => <option key={item.value} value={item.value}>{temperamentGroupLabel(item)} ({item.count})</option>)}
          </select>
        </label>
        <label>
          <span>{t("tuning.catalogue.precision", "Precision", "Genauigkeit")}</span>
          <select value={precision} onChange={(event) => updateFilters({ precision: event.target.value })}>
            <option value="">{t("tuning.catalogue.allPrecision", "All variants", "Alle Fassungen")}</option>
            <option value="rounded">{t("tuning.catalogue.rounded", "Rounded values", "Gerundete Werte")}</option>
            <option value="precise">{t("tuning.catalogue.precise", "Precise variants", "Genauere Fassungen")}</option>
          </select>
        </label>
        <label>
          <span>{t("tuning.catalogue.commentary", "Commentary", "Erläuterungen")}</span>
          <select value={commentary} onChange={(event) => updateFilters({ commentary: event.target.value })}>
            <option value="">{t("tuning.catalogue.anyCommentary", "Any availability", "Mit oder ohne Erläuterungen")}</option>
            <option value="available">{t("tuning.catalogue.hasCommentary", "Commentary available", "Mit Erläuterungen")}</option>
            <option value="missing">{t("tuning.catalogue.noCommentary", "No commentary", "Ohne Erläuterungen")}</option>
          </select>
        </label>
      </div>
      <section className="tuning-occurrence-controls" aria-labelledby="tuning-occurrences-title">
        <div>
          <h2 id="tuning-occurrences-title">{t("tuning.catalogue.occurrences", "Organ occurrences", "Belege in Orgeldatensätzen")}</h2>
          <p>{t("tuning.catalogue.occurrenceHint", "Sort and filter by distinct organ records in the selected evidence category. Related wording can point to several catalogue entries, so their counts can overlap.", "Die Sortierung und Filterung zählen jeden Orgeldatensatz in der gewählten Belegkategorie einmal. Verwandte Angaben können auf mehrere Katalogeinträge verweisen. Daher können sich die zugehörigen Mengen überschneiden.")}</p>
        </div>
        <div className="tuning-occurrence-inputs">
          <label>{t("tuning.catalogue.sort", "Sort by", "Sortieren nach")}<select value={sort} onChange={(event) => updateFilters({ sort: occurrenceSort(event.target.value) })}>
            <option value="catalogue">{t("tuning.catalogue.order", "Catalogue order", "Katalogreihenfolge")}</option>
            <option value="occurrences_desc">{t("tuning.catalogue.most", "Most linked organ records", "Anzahl verknüpfter Orgeldatensätze (absteigend)")}</option>
            <option value="occurrences_asc">{t("tuning.catalogue.fewest", "Fewest linked organ records", "Anzahl verknüpfter Orgeldatensätze (aufsteigend)")}</option>
          </select></label>
          <label>{t("tuning.catalogue.evidence", "Evidence counted", "Belegkategorie")}<select value={match} onChange={(event) => updateFilters({ match: occurrenceScope(event.target.value) })}>
            <option value="all">{t("tuning.catalogue.allEvidence", "All linked organs", "Alle verknüpften Orgeldatensätze")}</option>
            <option value="exact">{t("tuning.catalogue.exactEvidence", "Exact wording", "Eindeutig zuordenbarer Wortlaut")}</option>
            <option value="family">{t("tuning.catalogue.relatedEvidence", "Related wording only", "Nur verwandter Wortlaut")}</option>
          </select></label>
          <label>{t("tuning.catalogue.minimum", "Minimum organ records", "Mindestzahl der Orgeldatensätze")}<input type="number" min="0" max={MAX_OCCURRENCE_FILTER} step="1" placeholder={t("tuning.catalogue.anyCount", "Any", "Beliebig")} value={minimum} aria-invalid={Boolean(rangeIssue)} onChange={(event) => updateFilters({ minimum: event.target.value })} /></label>
          <label>{t("tuning.catalogue.maximum", "Maximum organ records", "Höchstzahl der Orgeldatensätze")}<input type="number" min="0" max={MAX_OCCURRENCE_FILTER} step="1" placeholder={t("tuning.catalogue.anyCount", "Any", "Beliebig")} value={maximum} aria-invalid={Boolean(rangeIssue)} onChange={(event) => updateFilters({ maximum: event.target.value })} /></label>
        </div>
        {rangeIssue && <p role="alert">{rangeIssue === "invalid"
          ? t("tuning.catalogue.invalidRange", "Use whole numbers from 0 to 1,000,000 for the organ count.", "Für die Anzahl der Orgeldatensätze ganze Zahlen von 0 bis 1.000.000 eingeben.")
          : t("tuning.catalogue.invertedRange", "Minimum organs cannot exceed maximum organs.", "Die Mindestanzahl darf die Höchstanzahl nicht überschreiten.")}</p>}
      </section>
      {list && list.source?.rowCount === 0 && (
        <p className="notice">{t("tuning.catalogue.noSource", "BDO temperament records are not present in the shared Aggregator source-record table yet.", "Stimmungssysteme des BDO sind in diesem Datenstand noch nicht enthalten.")}</p>
      )}
      {list?.query === queryValue && <TemperamentSearchNotice interpretation={list.searchInterpretation} />}
      {queryScope === "identity" && queryValue && (
        <p className="muted">
          {t("tuning.catalogue.identityScope", "Searching temperament names and identifiers for “{query}”.", "Bezeichnungen und Kennungen von Stimmungen werden nach „{query}“ durchsucht.", { query: queryValue })}{" "}
          <button type="button" className="text-link-button" onClick={() => updateFilters({ queryScope: undefined })}>{t("tuning.catalogue.includeNotes", "Include commentary and literature references", "Erläuterungen und Literaturhinweise einbeziehen")}</button>
        </p>
      )}
      {queryScope === "evidence" && queryValue && (
        <p className="muted">
          {t("tuning.catalogue.sourceScope", "Matching the source wording “{query}” to catalogue records.", "Der Quellenwortlaut „{query}“ wird mit den Katalogeinträgen abgeglichen.", { query: queryValue })}{" "}
          <button type="button" className="text-link-button" onClick={() => updateFilters({ queryScope: undefined })}>{t("tuning.catalogue.fullSearch", "Search catalogue text instead", "Stattdessen den Katalogtext durchsuchen")}</button>
        </p>
      )}
      {error && <div className="notice error" role="alert"><p>{t("tuning.catalogue.loadError", "The temperament catalogue could not be loaded.", "Der Katalog der Stimmungssysteme konnte nicht geladen werden.")}</p><code lang="en">{error}</code></div>}
      <TemperamentComparison ids={selectedIds} visible={visibleItems} catalogueHref={catalogueHref}
        onRemove={id => setSelectedIds(current => current.filter(value => value !== id))} onClear={() => setSelectedIds([])} />
      {!rangeIssue && !error && <TemperamentsResultList catalogueHref={catalogueHref} response={list} selectedIds={selectedIds} onToggleSelected={toggleSelected} />}
      {list && (offset > 0 || list.total > pageSize) && (
        <nav className="catalog-pagination" aria-label={t("tuning.catalogue.pages", "Temperament result pages", "Ergebnisseiten für Stimmungssysteme")}>
          <button type="button" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - pageSize))}><ChevronLeft size={16} /> {t("tuning.catalogue.previous", "Previous", "Zurück")}</button>
          <span aria-live="polite">{list.items.length ? t("tuning.catalogue.pageRange", "{from, number}–{to, number} of {total, number}", "{from, number}–{to, number} von {total, number}", { from: offset + 1, to: offset + list.items.length, total: list.total }) : t("tuning.catalogue.emptyPage", "No records on this page", "Keine Datensätze auf dieser Seite")}</span>
          <button type="button" disabled={offset + pageSize >= list.total} onClick={() => setOffset(offset + pageSize)}>{t("tuning.catalogue.next", "Next", "Weiter")} <ChevronRight size={16} /></button>
        </nav>
      )}
    </section>
  );
}

function TemperamentsResultList({
  catalogueHref,
  onToggleSelected,
  response,
  selectedIds,
}: {
  catalogueHref: string;
  onToggleSelected: (item: TuningSystemSummary) => void;
  response: TuningSystemList | null;
  selectedIds: string[];
}) {
  const { t } = useUiLocale();
  if (!response) return <LoadingContent kind="cards" className="temperaments-list" label={t("tuning.results.loading", "Loading temperament systems…", "Stimmungssysteme werden geladen …")} />;
  if (response.items.length === 0) return <EmptyState icon={<SlidersHorizontal size={22} />} title={t("tuning.results.none", "No temperaments", "Keine Stimmungen gefunden")} body={t("tuning.results.empty", "No BDO temperament systems match the current filters.", "Keine Stimmungssysteme des BDO entsprechen den aktuellen Filtern.")} />;
  return (
    <div className="temperaments-list">
      {response.items.map((item) => (
        <TemperamentCard
          key={item.id}
          catalogueHref={catalogueHref}
          item={item}
          selected={selectedIds.includes(item.tuningId || item.id)}
          selectionDisabled={!selectedIds.includes(item.tuningId || item.id) && selectedIds.length >= MAX_TEMPERAMENT_COMPARISON}
          onToggleSelected={onToggleSelected}
        />
      ))}
    </div>
  );
}

function TemperamentCard({
  catalogueHref,
  item,
  onToggleSelected,
  selected,
  selectionDisabled,
}: {
  catalogueHref: string;
  item: TuningSystemSummary;
  onToggleSelected: (item: TuningSystemSummary) => void;
  selected: boolean;
  selectionDisabled: boolean;
}) {
  const { t, formatNumber } = useUiLocale();
  const detailId = item.tuningId || item.sourceRecordId || item.id;
  const detailHref = temperamentDetailHref(detailId, catalogueHref);
  const group = item.groupLabel || item.groupTitle || item.groupKey || t("tuning.card.ungrouped", "No group recorded", "Keine Gruppe erfasst");
  const precision = item.precision.isPreciseVariant ? t("tuning.card.precise", "Precise", "Genau") : t("tuning.card.rounded", "Rounded", "Gerundet");
  return (
    <article className="temperament-card">
      <header className="temperament-card-title">
        <div>
          <small>{item.label || item.tuningId}</small>
          <h2><a href={detailHref}>{item.title}</a></h2>
          <p>{group}</p>
        </div>
        <button type="button" className={selected ? "mini-toggle selected" : "mini-toggle"} aria-pressed={selected} disabled={selectionDisabled} onClick={() => onToggleSelected(item)}>
          {selected ? t("tuning.card.selected", "Selected", "Ausgewählt") : t("tuning.card.compare", "Compare", "Vergleichen")}
        </button>
      </header>
      <ul className="temperament-card-meta">
        <li>{precision}</li>
        {item.toneOrder.length > 0 && <li>{t("tuning.card.tones", "{count, plural, one {# tone} other {# tones}}", "{count, plural, one {# Ton} other {# Töne}}", {count: item.toneOrder.length})}</li>}
        {item.literatureCount > 0 && <li>{t("tuning.card.references", "{count, plural, one {# reference} other {# references}}", "{count, plural, one {# Literaturangabe} other {# Literaturangaben}}", {count: item.literatureCount})}</li>}
      </ul>
      {item.centValues.length > 0 && (
        <figure className="temperament-card-profile">
          <figcaption>{t("tuning.card.chart", "Cent deviations", "Abweichungen in Cent")}</figcaption>
          <CentVectorSparkline values={item.centValues} labels={item.toneOrder} />
        </figure>
      )}
      {item.occurrences && (
        <ul className="temperament-card-counts" aria-label={t("tuning.card.occurrences", "Organ occurrences", "Belege in Orgeldatensätzen")}>
          <li><a href={temperamentOrganHref(detailId, "all", catalogueHref)}><strong>{formatNumber(item.occurrences.total)}</strong><span>{t("tuning.card.allOrgans", "linked organ records", "verknüpfte Orgeldatensätze")}</span></a></li>
          <li><a href={temperamentOrganHref(detailId, "exact", catalogueHref)}><strong>{formatNumber(item.occurrences.exactVariantCount)}</strong><span>{t("tuning.card.exact", "exact wording", "eindeutig zuordenbare Angaben")}</span></a></li>
          <li><a href={temperamentOrganHref(detailId, "family", catalogueHref)}><strong>{formatNumber(item.occurrences.familyWordingCount)}</strong><span>{t("tuning.card.related", "related only", "nur verwandte Angaben")}</span></a></li>
        </ul>
      )}
      <div className="temperament-card-foot">
        <details className="research-evidence-item-details">
          <summary>{t("tuning.card.disclosure", "Cent vector and source", "Centwerte und Quelle")}</summary>
          <div><span>{t("tuning.card.label", "Label", "Bezeichnung")}</span><code>{item.label || t("tuning.card.missing", "not recorded", "Nicht erfasst")}</code></div>
          <div><span>{t("tuning.card.title", "Title", "Titel")}</span><code>{item.title}</code></div>
          <div><span>{t("tuning.card.vector", "Cent vector", "Centwerte")}</span><code>{item.centstr || item.centVectorPreview || t("tuning.card.missing", "not recorded", "Nicht erfasst")}</code></div>
          <div><span>{t("tuning.card.commentary", "Commentary", "Erläuterungen")}</span><code>{item.commentary.available ? item.commentary.description || t("tuning.card.available", "available", "Vorhanden") : t("tuning.card.missing", "not recorded", "Nicht erfasst")}</code></div>
          <div><span>{t("tuning.card.sourceRecord", "Source record", "Quelldatensatz")}</span><code>{!item.publicProjection && item.sourceRecordId?.startsWith("sr:") ? <a href={`/source/${encodeURIComponent(item.sourceRecordId)}`}>{item.sourceRecordId}</a> : item.sourceRecordId || t("tuning.card.missing", "not recorded", "Nicht erfasst")}</code></div>
        </details>
        {(item.sourceUrl || item.commentaryUrl || (!item.publicProjection && item.sourceRecordId)) && <div className="temperament-card-links">
          {item.sourceUrl && <a href={item.sourceUrl} target="_blank" rel="noreferrer">{t("tuning.card.bdo", "Open BDO", "Beim BDO öffnen")}</a>}
          {item.commentaryUrl && <a href={item.commentaryUrl} target="_blank" rel="noreferrer">{t("tuning.card.commentary", "Commentary", "Erläuterungen")}</a>}
          {!item.publicProjection && item.sourceRecordId && <a href={`/source/${encodeURIComponent(item.sourceRecordId)}`}>{t("tuning.card.evidence", "Source evidence", "Quellenbeleg")}</a>}
        </div>}
      </div>
    </article>
  );
}

const TEMPERAMENT_DETAIL_TABS = [["overview", "Overview"], ["technical", "Technical"], ["organs", "Organs"]] as const;
type TemperamentDetailTab = (typeof TEMPERAMENT_DETAIL_TABS)[number][0];

export function TemperamentDetailPage({ tuningId }: { tuningId: string }) {
  const { t } = useUiLocale();
  const [activeTab, setActiveTab] = useState<TemperamentDetailTab>(() => {
    const tab = new URLSearchParams(window.location.search).get("tab");
    return tab === "technical" || tab === "organs" ? tab : "overview";
  });
  const [record, setRecord] = useState<TuningSystemDetail | null>(null);
  const [organLinks, setOrganLinks] = useState<TuningSystemOrganLinks | null>(null);
  const [organOffset, setOrganOffset] = useState(() => positiveRouteInt(new URLSearchParams(window.location.search).get("organ_offset"), 0, 100_000));
  const [organScope, setOrganScope] = useState(() => occurrenceScope(new URLSearchParams(window.location.search).get("match")));
  const [error, setError] = useState<string | null>(null);
  const [organError, setOrganError] = useState<string | null>(null);
  const tabListRef = useRef<HTMLDivElement>(null);
  const catalogueHref = temperamentCatalogueHref(new URLSearchParams(window.location.search).get("return_to"));
  const publicProjection = Boolean(record?.publicProjection);
  useEffect(() => {
    let cancelled = false;
    setRecord(null);
    setError(null);
    fetchTemperament(tuningId, "surface")
      .then((data) => {
        if (!cancelled) setRecord(data);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [tuningId]);
  useEffect(() => {
    if (record) document.title = `${record.title || record.label || tuningId} | MODAVIS Navigator`;
  }, [record, tuningId]);
  useEffect(() => {
    if (activeTab !== "organs") return;
    const request = new AbortController();
    setOrganError(null);
    fetchTemperamentOrgans(tuningId, 200, organOffset, organScope, request.signal)
      .then((data) => {
        if (request.signal.aborted) return;
        if ((data.scope ?? "all") !== organScope) {
          setOrganError("This source does not support the selected evidence filter.");
          return;
        }
        setOrganLinks(data);
      })
      .catch((err: Error) => {
        if (!request.signal.aborted) setOrganError(err.message);
      });
    return () => request.abort();
  }, [activeTab, organOffset, organScope, tuningId]);
  useEffect(() => {
    const restore = () => {
      const params = new URLSearchParams(window.location.search);
      const tab = params.get("tab");
      const restoredTab = tab === "technical" || tab === "organs" ? tab : "overview";
      setActiveTab(restoredTab);
      if (tabListRef.current?.contains(document.activeElement)) document.getElementById(`temperament-tab-${restoredTab}`)?.focus();
      setOrganScope(occurrenceScope(params.get("match")));
      setOrganOffset(positiveRouteInt(params.get("organ_offset"), 0, 100_000));
    };
    restore();
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, [tuningId]);
  const selectOrganEvidence = (scope: TuningOccurrenceScope, offset = 0) => {
    const url = new URL(window.location.href);
    setOrganScope(scope);
    setOrganOffset(offset);
    if (scope === "all") url.searchParams.delete("match");
    else url.searchParams.set("match", scope);
    if (offset) url.searchParams.set("organ_offset", String(offset));
    else url.searchParams.delete("organ_offset");
    if (url.href !== window.location.href) window.history.pushState(window.history.state, "", url);
  };
  const selectTab = (tab: TemperamentDetailTab) => {
    if (tab === activeTab) return;
    setActiveTab(tab);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", tab);
    window.history.pushState(window.history.state, "", url);
  };
  const tabContent = (
    <>
      {error && <p className="notice error" role="alert">{error}</p>}
      {!record && !error && <LoadingContent kind="article" label={t("tuning.detail.loading", "Loading temperament system…", "Stimmungssystem wird geladen …")} />}
      {record && (
        <>
          {activeTab === "overview" && (!publicProjection || record.commentary.description) && (
          <section className="public-evidence-summary source-public-summary temperament-summary">
            <div>
              <div className="public-evidence-summary-head">
                <div>
                  <p className="eyebrow">{record.source.name || "BDO Lexikon der Stimmungen"}</p>
                  <p>{record.commentary.description || "No commentary description is recorded for this temperament."}</p>
                </div>
                {!publicProjection && <span className="entity-state-chip entity-state-source">{record.evidenceLabel || "Temperament evidence"}</span>}
              </div>
              <div className="vocabulary-badges temperament-badges">
                <Pill>{record.label || record.tuningId || t("tuning.detail.bdoLabel", "BDO label", "BDO-Bezeichnung")}</Pill>
                <Pill>{record.groupLabel || record.groupKey || "ungrouped"}</Pill>
                <Pill>{record.precision.label}</Pill>
                <Pill>{record.commentary.available ? t("tuning.detail.commentary", "Commentary", "Erläuterungen") : "No commentary"}</Pill>
              </div>
            </div>
          </section>
          )}

          {activeTab === "overview" && (
            <>
          <TemperamentFingerprint labels={record.toneOrder} values={record.centValues} title={record.title} />
          <section className="panel-block">
            <h3>{t("tuning.detail.identity", "Identity and source links", "Kennungen und Quellenlinks")}</h3>
            <div className="identifier-summary">
              <div><span>{t("tuning.detail.bdoLabel", "BDO label", "BDO-Bezeichnung")}</span><strong>{record.label || "not recorded"}</strong></div>
              <div><span>{t("tuning.detail.tuningId", "Tuning ID", "Kennung des Stimmungssystems")}</span><strong>{record.tuningId || "not recorded"}</strong></div>
              {!publicProjection && <div><span>{t("tuning.detail.entityId", "Entity ID", "Entitätskennung")}</span><strong>{record.entityId || "not recorded"}</strong></div>}
              <div><span>{t("tuning.detail.group", "Group", "Gruppe")}</span><strong>{record.groupLabel || record.groupKey || "not recorded"}</strong></div>
              <div><span>{t("tuning.detail.precision", "Precision", "Genauigkeit")}</span><strong>{[record.precision.label, record.precision.variant].filter(Boolean).join(" / ")}</strong></div>
              <div><span>{t("tuning.detail.source", "Source record", "Quelldatensatz")}</span><strong>{!publicProjection && record.sourceRecordId?.startsWith("sr:") ? <a href={`/source/${encodeURIComponent(record.sourceRecordId)}`}>{record.sourceRecordId}</a> : record.sourceRecordId || "not recorded"}</strong></div>
              {!publicProjection && <div><span>Schema</span><strong>{[record.schema?.name, record.schema?.version || record.schema?.key].filter(Boolean).join(" / ") || "not recorded"}</strong></div>}
              {!publicProjection && <div><span>{t("tuning.detail.lastSeen", "Last seen", "Zuletzt erfasst")}</span><strong>{record.lastSeenAt || "not recorded"}</strong></div>}
            </div>
            <div className="research-evidence-actions">
              {record.sourceUrl && <a href={record.sourceUrl} target="_blank" rel="noreferrer">{t("tuning.detail.openBdo", "Open BDO tuning page", "Stimmung beim BDO öffnen")}</a>}
              {record.commentaryUrl && <a href={record.commentaryUrl} target="_blank" rel="noreferrer">{t("tuning.detail.openComment", "Open commentary page", "Erläuterungen öffnen")}</a>}
              {!publicProjection && record.sourceRecordId && <a href={`/source/${encodeURIComponent(record.sourceRecordId)}`}>{t("tuning.detail.evidence", "Source evidence", "Quellenbeleg")}</a>}
            </div>
          </section>
            </>
          )}

          {activeTab === "technical" && (
            <>
          <section className="panel-block">
            <h3>{t("tuning.detail.toneTable", "Tone order and cent values", "Tonfolge und Centwerte")}</h3>
            <CentVectorStrip values={record.centValues} labels={record.toneOrder} />
            <div className="temperament-table-wrap">
              <table className="temperament-data-table">
                <thead>
                  <tr><th>#</th><th>{t("tuning.detail.tone", "Tone", "Ton")}</th><th>{t("tuning.detail.centValue", "Cent value", "Centwert")}</th><th>{t("tuning.detail.absolute", "Absolute cents", "Absoluter Centwert")}</th><th>{t("tuning.detail.relative", "Relative to A", "Bezogen auf A")}</th></tr>
                </thead>
                <tbody>
                  {record.toneRows.map((row) => (
                    <tr key={`${row.index}:${row.tone}`}>
                      <td>{row.index + 1}</td>
                      <td>{row.tone}</td>
                      <td>{formatCents(row.cent)}</td>
                      <td>{formatCents(row.absoluteCent)}</td>
                      <td>{formatCents(row.relativeToA)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="temperament-interval-grid">
            <TemperamentIntervalTable title={t("tuning.detail.fifths", "Derived fifths", "Berechnete Quinten")} rows={record.derivedIntervals.fifths} columns={["from", "to", "cents"]} />
            <TemperamentIntervalTable title={t("tuning.detail.thirds", "Major thirds", "Große Terzen")} rows={record.derivedIntervals.majorThirds} columns={["from", "to", "cents"]} />
            <TemperamentIntervalTable title={t("tuning.detail.absolute", "Absolute cents", "Absoluter Centwert")} rows={record.derivedIntervals.absoluteCents} columns={["tone", "cents"]} />
            <TemperamentIntervalTable title={t("tuning.detail.relatives", "Values relative to A", "Werte bezogen auf A")} rows={record.derivedIntervals.relativeToA} columns={["tone", "cents"]} />
          </section>
            </>
          )}

          {activeTab === "overview" && !publicProjection && (
            <>
          <section className="panel-block">
            <h3>{t("tuning.detail.commentary", "Commentary", "Erläuterungen")}</h3>
            {record.commentarySections.length === 0 ? (
              <p className="notice">{t("tuning.detail.noComments", "No commentary sections were captured for this temperament.", "Zu dieser Stimmung wurden keine Erläuterungen erfasst.")}</p>
            ) : (
              <div className="temperament-commentary-sections">
                {record.commentarySections.map((section) => (
                  <article key={section.id}>
                    <h4>{section.label}</h4>
                    <p>{section.text}</p>
                  </article>
                ))}
              </div>
            )}
            {(record.commentary.literatureEntries || []).length > 0 && (
              <details className="research-evidence-item-details" open>
                <summary>Commentary literature text</summary>
                {(record.commentary.literatureEntries || []).map((entry, index) => <div key={`${entry}:${index}`}><span>{index + 1}</span><code>{entry}</code></div>)}
              </details>
            )}
          </section>
            </>
          )}

          {activeTab === "technical" && (
            <>
          <section className="panel-block">
            <h3>{t("tuning.detail.citations", "Literature citations", "Literaturangaben")}</h3>
            {record.literature.length === 0 ? (
              <p className="notice">{t("tuning.detail.noCitations", "No literature references were projected for this temperament.", "Zu dieser Stimmung stehen in dieser Ansicht keine Literaturangaben zur Verfügung.")}</p>
            ) : (
              <div className="temperament-literature-list">
                {record.literature.map((item, index) => (
                  <article key={`${item.entityId || item.citationText || "citation"}:${index}`}>
                    <strong>{item.citationText || item.entityId || "Citation"}</strong>
                    <span>{item.sourcePath || "literature"}</span>
                    <div className="research-evidence-actions">
                      {item.sourceUrl && <a href={item.sourceUrl} target="_blank" rel="noreferrer">{t("tuning.detail.openSource", "Open source", "Quelle öffnen")}</a>}
                      {!publicProjection && item.entityId && <a href={`/source/${encodeURIComponent(item.entityId)}`}>Reference entity</a>}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

          {!publicProjection && <section className="panel-block">
            <h3>Provenance documents and entity refs</h3>
            <div className="identifier-summary">
              <div><span>Raw documents</span><strong>{formatInteger(record.documents?.length ?? 0)}</strong></div>
              <div><span>Entity refs</span><strong>{formatInteger(record.entityRefs?.length ?? 0)}</strong></div>
              <div><span>Literature refs</span><strong>{formatInteger(record.literatureRefs?.length ?? 0)}</strong></div>
              <div><span>Link refs</span><strong>{formatInteger(record.linkRefs?.length ?? 0)}</strong></div>
              <div><span>Paradata events</span><strong>{formatInteger(record.events?.length ?? 0)}</strong></div>
            </div>
            <details className="research-evidence-item-details">
              <summary>Raw documents</summary>
              {(record.documents || []).map((document, index) => (
                <div key={String(document.id || index)}>
                  <span>{formatFieldValue(document.kind || document.originalKind || `Document ${index + 1}`)}</span>
                  <code>{formatFieldValue(document.url || document.storageUri || document.contentSha256 || "not recorded")}</code>
                </div>
              ))}
            </details>
            <details className="research-evidence-item-details">
              <summary>Projected entity refs</summary>
              {(record.entityRefs || []).map((ref, index) => (
                <div key={String(ref.id || index)}>
                  <span>{formatFieldValue(ref.entityType || `Entity ref ${index + 1}`)}</span>
                  <code>{formatFieldValue(ref.id || ref.sourcePath || "not recorded")}</code>
                </div>
              ))}
            </details>
          </section>}

          {!publicProjection && <section className="panel-block">
            <h3>Quality and source snapshot</h3>
            <details className="research-evidence-item-details" open>
              <summary>Quality</summary>
              <pre>{JSON.stringify(record.quality || {}, null, 2)}</pre>
            </details>
            <details className="research-evidence-item-details">
              <summary>Source snapshot</summary>
              <pre>{JSON.stringify(record.sourceSnapshot || {}, null, 2)}</pre>
            </details>
            <details className="research-evidence-item-details">
              <summary>Provenance</summary>
              <pre>{JSON.stringify(record.provenance || {}, null, 2)}</pre>
            </details>
          </section>}
            </>
          )}

          {activeTab === "organs" && (
            <TemperamentOrgansPanel
              data={organLinks?.temperament.id === record.id ? organLinks : null}
              error={organError}
              loading={organLinks?.offset !== organOffset || (organLinks.scope ?? "all") !== organScope}
              scope={organScope}
              onScope={selectOrganEvidence}
              onPage={(offset) => selectOrganEvidence(organScope, Math.max(0, offset))}
            />
          )}
        </>
      )}
    </>
  );
  return (
    <section className="entity-section research-evidence-browser temperament-detail" tabIndex={-1}>
      <a className="catalog-back evidence-route-back" href={catalogueHref}>
        {t("tuning.detail.return", "Back to temperaments", "Zurück zu den Stimmungen")}
      </a>
      <div className="evidence-dossier-head">
        <div>
          <p className="eyebrow">{record?.source.key === "types.tuning_system" ? "Controlled temperament concept" : "BDO temperament system"}</p>
          <h1>{record?.title || tuningId}</h1>
          <p>{record ? temperamentMetaLine(record) : "Loading temperament detail"}</p>
        </div>
        <div ref={tabListRef} className="evidence-mode-switch" role="tablist" aria-label={t("tuning.detail.tabs", "Temperament detail sections", "Abschnitte zu diesem Stimmungssystem")}>
          {TEMPERAMENT_DETAIL_TABS.map(([tab, label], index) => (
            <button
              key={tab}
              type="button"
              id={`temperament-tab-${tab}`}
              role="tab"
              aria-controls={`temperament-panel-${tab}`}
              aria-selected={activeTab === tab}
              tabIndex={activeTab === tab ? 0 : -1}
              className={activeTab === tab ? "selected" : ""}
              onClick={() => selectTab(tab)}
              onKeyDown={(event) => {
                if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
                const count = TEMPERAMENT_DETAIL_TABS.length;
                const nextIndex = event.key === "ArrowRight" ? (index + 1) % count
                  : event.key === "ArrowLeft" ? (index + count - 1) % count
                  : event.key === "Home" ? 0 : event.key === "End" ? count - 1 : -1;
                if (nextIndex < 0) return;
                event.preventDefault();
                const [next] = TEMPERAMENT_DETAIL_TABS[nextIndex];
                selectTab(next);
                document.getElementById(`temperament-tab-${next}`)?.focus();
              }}
            >{tab === "overview" ? t("tuning.detail.tabOverview", label, "Übersicht")
                : tab === "technical" ? t("tuning.detail.tabTechnical", label, "Technische Angaben")
                : t("tuning.detail.tabOrgans", label, "Orgeln")}</button>
          ))}
        </div>
      </div>
      {TEMPERAMENT_DETAIL_TABS.map(([tab]) => (
        <div
          key={tab}
          id={`temperament-panel-${tab}`}
          className="temperament-tab-panel"
          role="tabpanel"
          aria-labelledby={`temperament-tab-${tab}`}
          hidden={activeTab !== tab}
          tabIndex={activeTab === tab ? 0 : -1}
        >
          {activeTab === tab && tabContent}
        </div>
      ))}
    </section>
  );
}

function TemperamentOrgansPanel({
  data,
  error,
  loading,
  scope,
  onScope,
  onPage,
}: {
  data: TuningSystemOrganLinks | null;
  error: string | null;
  loading: boolean;
  scope: TuningOccurrenceScope;
  onScope: (scope: TuningOccurrenceScope) => void;
  onPage: (offset: number) => void;
}) {
  const { t, locale, formatNumber } = useUiLocale();
  const loadError = error && <div className="notice error" role="alert">
    <p>{t("tuning.organs.loadError", "Could not load linked organs.", "Verknüpfte Orgeldatensätze konnten nicht geladen werden.")}</p>
    <code lang="en">{error}</code>
  </div>;
  if (!data) return error
    ? loadError
    : <LoadingContent kind="rows" count={3} label={t("tuning.organs.loading", "Loading linked organs…", "Verknüpfte Orgeldatensätze werden geladen …")} />;
  return (
    <section className="panel-block temperament-organ-links">
      <div className="temperament-organ-links-head">
        <div>
          <h3>{t("tuning.organs.heading", "Organ records linked by source wording", "Über Quellenangaben verknüpfte Orgeldatensätze")}</h3>
          <p>{locale === "de"
            ? "Gezählt werden dokumentierte Angaben. Jeder Orgeldatensatz zählt pro Stimmungssystem einmal. Eindeutig zuordenbare Angaben haben Vorrang. Die Centwerte stammen aus dem BDO-Katalog."
            : data.evidenceBoundary}</p>
          <p>{t("tuning.organs.current", "Source wording does not verify an organ’s current tuning.", "Aus dem Wortlaut der Quellen lässt sich die heutige Stimmung einer Orgel nicht bestätigen.")}</p>
        </div>
        <div className="tuning-organ-scopes" role="group" aria-label={t("tuning.organs.filter", "Filter linked organs by evidence", "Verknüpfte Orgeldatensätze nach Belegkategorie filtern")}>
          {([
            ["all", t("tuning.organs.all", "All linked records", "Alle verknüpften Datensätze"), data.exactVariantCount + data.familyWordingCount],
            ["exact", t("tuning.organs.exact", "Exact wording", "Eindeutig zuordenbarer Wortlaut"), data.exactVariantCount],
            ["family", t("tuning.organs.related", "Related wording only", "Nur verwandter Wortlaut"), data.familyWordingCount],
          ] as const).map(([value, label, count]) => (
            <button type="button" key={value} aria-pressed={scope === value} onClick={() => onScope(value)}>{label} <strong>{formatNumber(count)}</strong></button>
          ))}
        </div>
      </div>
      {data.temperament.id && (data.exactVariantCount > 0 || data.familyWordingCount > 0) && (
        <nav className="temperament-organ-map-actions" aria-label={t("tuning.organs.mapHeading", "Map linked organ records", "Verknüpfte Orgeldatensätze auf der Karte")}>
          {data.exactVariantCount > 0 && (
            <a href={`/map?temperament=${encodeURIComponent(data.temperament.id)}&temperament_scope=exact&precision=all`}>
              <MapIcon size={16} aria-hidden="true" /> {t("tuning.organs.mapExact", "Map exact wording", "Eindeutig zuordenbare Angaben auf der Karte")}
            </a>
          )}
          {data.familyWordingCount > 0 && <a href={`/map?temperament=${encodeURIComponent(data.temperament.id)}&temperament_scope=family&precision=all`}>
            <MapIcon size={16} aria-hidden="true" /> {t("tuning.organs.mapRelated", "Map related wording", "Verwandte Angaben auf der Karte")}
          </a>}
          <span className="muted">{t("tuning.organs.mapCoverage", "Map results require a recorded location.", "Für die Karte muss ein Standort erfasst sein.")}</span>
        </nav>
      )}
      {error ? loadError
      : loading ? <LoadingContent kind="rows" count={3} label={t("tuning.organs.loading", "Loading linked organs…", "Verknüpfte Orgeldatensätze werden geladen …")} />
      : data.total === 0 ? (
        <p className="notice">{scope === "all" ? t("tuning.organs.noMatches", "No matching organ source wording was found in this POD snapshot.", "In diesem POD-Datenstand wurde kein passender Wortlaut in Orgeldatensätzen gefunden.") : t("tuning.organs.noneInScope", "No organ records match the selected evidence filter.", "Keine Orgeldatensätze entsprechen der gewählten Belegkategorie.")}</p>
      ) : (
        <div className="temperament-organ-evidence-groups">
          {data.groups.filter((group) => group.countries.length > 0).map((group) => (
            <section key={group.key} className={`temperament-organ-evidence-group ${group.key}`}>
              <div>
                <h4>{locale === "de" ? group.key === "exact_variant" ? "Eindeutig zuordenbare Angaben" : "Verwandte Stimmungsangaben" : group.label} <span>{formatNumber(group.total)}</span></h4>
                <p>{locale === "de" ? group.key === "exact_variant"
                  ? "Der Quellenwortlaut bezeichnet eindeutig diesen Katalogeintrag."
                  : "Der Quellenwortlaut verweist auf eine Gruppe, eine Abwandlung oder eine nicht näher bezeichnete Fassung."
                  : group.guidance}</p>
              </div>
              {group.countries.map((country) => (
                <details key={`${group.key}:${country.country}`} open={group.key === "exact_variant"}>
                  <summary>{country.country} <span>{formatNumber(country.count)}</span></summary>
                  <div className="temperament-organ-country-items">
                    {country.items.map((item) => (
                      <article key={item.mdvsId} className="temperament-organ-card">
                        <div>
                          <a className="temperament-organ-title" href={item.url}>{item.title}</a>
                          <span>{item.location || item.country}</span>
                          <code>{item.mdvsId}</code>
                        </div>
                        <details>
                          <summary>{t("tuning.organs.assertionCount", "{count, plural, one {# source assertion} other {# source assertions}}", "{count, plural, one {# Quellenangabe} other {# Quellenangaben}}", {count: item.assertions.length})}</summary>
                          <div className="temperament-organ-assertions">
                            {item.assertions.map((assertion, index) => (
                              <div key={`${assertion.sourceRecordId || assertion.source}:${index}`}>
                                <strong>{assertion.source}</strong>
                                <small>{assertion.matchKind === "exact_variant"
                                  ? t("tuning.organs.exact", "Exact wording", "Eindeutig zuordenbarer Wortlaut")
                                  : t("tuning.organs.relatedItem", "Related wording", "Verwandter Wortlaut")}</small>
                                <span>{assertion.sourceValue || t("tuning.organs.missingWording", "Temperament wording not recorded", "Stimmungsangabe nicht erfasst")}</span>
                                {assertion.sourceUrl && <a href={assertion.sourceUrl} target="_blank" rel="noreferrer">{t("tuning.organs.source", "Original source", "Originalquelle")}</a>}
                                {!data.publicProjection && assertion.sourceRecordId && <a href={`/source/${encodeURIComponent(assertion.sourceRecordId)}`}>{t("tuning.organs.evidence", "Source evidence", "Quellenbeleg")}</a>}
                              </div>
                            ))}
                          </div>
                        </details>
                      </article>
                    ))}
                  </div>
                </details>
              ))}
            </section>
          ))}
        </div>
      )}
      {!error && !loading && (data.offset > 0 || data.hasMore) && (
        <nav className="pagination-controls" aria-label={t("tuning.organs.pages", "Temperament organ pages", "Ergebnisseiten der verknüpften Orgeldatensätze")}>
          <button type="button" disabled={data.offset === 0} onClick={() => onPage(data.offset - data.limit)}>{t("tuning.organs.previous", "Previous", "Zurück")}</button>
          <span>{data.items.length ? t("tuning.organs.pageRange", "Showing {from, number}–{to, number} of {total, number}", "{from, number}–{to, number} von {total, number}", { from: data.offset + 1, to: data.offset + data.items.length, total: data.total }) : t("tuning.organs.emptyPage", "No records on this page", "Keine Datensätze auf dieser Seite")}</span>
          <button type="button" disabled={!data.hasMore} onClick={() => onPage(data.offset + data.limit)}>{t("tuning.organs.next", "Next", "Weiter")}</button>
        </nav>
      )}
    </section>
  );
}

function TemperamentIntervalTable({
  columns,
  rows,
  title,
}: {
  columns: string[];
  rows: Array<Record<string, string | number | null | undefined>>;
  title: string;
}) {
  const { t } = useUiLocale();
  return (
    <section className="panel-block temperament-interval-table">
      <h3>{title}</h3>
      {rows.length === 0 ? (
        <p className="notice">{t("tuning.interval.empty", "No values recorded.", "Keine Werte erfasst.")}</p>
      ) : (
        <div className="temperament-table-wrap">
          <table className="temperament-data-table">
            <thead>
              <tr>{columns.map((column) => <th key={column}>{friendlyLabel(column)}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={`${title}:${index}`}>
                  {columns.map((column) => <td key={column}>{column === "cents" ? formatCents(row[column] as number | null | undefined) : formatFieldValue(row[column])}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function temperamentVectorPairs(labels: string[], values: number[]) {
  const count = Math.min(labels.length || values.length, values.length);
  const closesCircle = count > 1 && labels[0] === labels[count - 1];
  return Array.from({ length: closesCircle ? count - 1 : count }, (_, index) => ({
    tone: labels[index] || String(index + 1),
    value: Number.isFinite(values[index]) ? values[index] : 0,
  }));
}

function CentVectorSparkline({ labels, values }: { labels: string[]; values: number[] }) {
  const pairs = temperamentVectorPairs(labels, values);
  const width = 260;
  const centerY = 27;
  const step = width / Math.max(1, pairs.length);
  const description = pairs.map((item) => `${item.tone} ${formatCents(item.value)} cents`).join(", ");
  return (
    <div className="cent-vector-sparkline" role="img" aria-label={`Cent deviations: ${description}`}>
      <svg viewBox={`0 0 ${width} 54`} aria-hidden="true" focusable="false">
        <line className="cent-vector-zero" x1="0" y1={centerY} x2={width} y2={centerY} />
        {pairs.map((item, index) => {
          const x = step * index + step / 2;
          const y = centerY - Math.max(-45, Math.min(45, item.value)) / 45 * 20;
          return <g key={`${item.tone}:${index}`}><line className={item.value < 0 ? "negative" : "positive"} x1={x} y1={centerY} x2={x} y2={y} /><circle className={item.value < 0 ? "negative" : "positive"} cx={x} cy={y} r="2.4"><title>{item.tone}: {formatCents(item.value)} cents</title></circle></g>;
        })}
      </svg>
    </div>
  );
}

function TemperamentFingerprint({ labels, title, values }: { labels: string[]; title: string; values: number[] }) {
  const pairs = temperamentVectorPairs(labels, values);
  const center = 120;
  const referenceRadius = 66;
  const deviationScale = 24;
  const point = (index: number, radius: number) => {
    const angle = -Math.PI / 2 + index * Math.PI * 2 / Math.max(1, pairs.length);
    return { x: center + Math.cos(angle) * radius, y: center + Math.sin(angle) * radius };
  };
  const points = pairs.map((item, index) => {
    const radius = referenceRadius + Math.max(-45, Math.min(45, item.value)) / 45 * deviationScale;
    return { ...item, ...point(index, radius), label: point(index, 99) };
  });
  const polygon = points.map((item) => `${item.x.toFixed(2)},${item.y.toFixed(2)}`).join(" ");
  const largest = [...pairs].sort((a, b) => Math.abs(b.value) - Math.abs(a.value))[0];
  const description = `Equal temperament is the reference circle. Points outside it are sharp and points inside it are flat, on a fixed minus 45 to plus 45 cent scale.${largest ? ` The largest deviation is ${formatCents(largest.value)} cents at ${largest.tone}.` : ""}`;
  return (
    <figure className="temperament-fingerprint panel-block" aria-labelledby="temperament-fingerprint-title">
      <div className="temperament-fingerprint-copy">
        <p className="eyebrow">Temperament fingerprint</p>
        <h3 id="temperament-fingerprint-title">Deviation around the circle of fifths</h3>
        <p>{description}</p>
        <div className="temperament-fingerprint-legend" aria-label="Deviation scale">
          <span><i className="flat" /> Flat −45</span>
          <span><i className="equal" /> Equal 0</span>
          <span><i className="sharp" /> Sharp +45</span>
        </div>
      </div>
      <svg className="temperament-fingerprint-chart" viewBox="0 0 240 240" role="img" aria-label={`${title}. ${description}`}>
        <title>{title} temperament fingerprint</title>
        <desc>{description}</desc>
        <circle className="temperament-fingerprint-guide inner" cx={center} cy={center} r={referenceRadius - deviationScale} />
        <circle className="temperament-fingerprint-reference" cx={center} cy={center} r={referenceRadius} />
        <circle className="temperament-fingerprint-guide outer" cx={center} cy={center} r={referenceRadius + deviationScale} />
        {pairs.map((item, index) => {
          const axis = point(index, referenceRadius + deviationScale);
          return <line key={`axis:${item.tone}:${index}`} className="temperament-fingerprint-axis" x1={center} y1={center} x2={axis.x} y2={axis.y} />;
        })}
        <polygon className="temperament-fingerprint-shape" points={polygon} />
        {points.map((item, index) => <g key={`${item.tone}:${index}`}>
          <circle className="temperament-fingerprint-point" cx={item.x} cy={item.y} r="4"><title>{item.tone}: {formatCents(item.value)} cents</title></circle>
          <text className="temperament-fingerprint-label" x={item.label.x} y={item.label.y}>{item.tone}</text>
        </g>)}
      </svg>
    </figure>
  );
}

function CentVectorStrip({ labels, values }: { labels: string[]; values: number[] }) {
  const maxAbs = Math.max(1, ...values.map((value) => Math.abs(value || 0)));
  return (
    <div className="cent-vector-strip">
      {values.map((value, index) => {
        const width = Math.max(4, Math.round((Math.abs(value || 0) / maxAbs) * 46));
        return (
          <div key={`${labels[index] || index}:${index}`} className="cent-vector-item">
            <span>{labels[index] || index + 1}</span>
            <div className="cent-vector-track" aria-hidden="true">
              <i className={(value || 0) < 0 ? "negative" : "positive"} style={{ width: `${width}%` }} />
            </div>
            <code>{formatCents(value)}</code>
          </div>
        );
      })}
    </div>
  );
}

function temperamentMetaLine(item: TuningSystemSummary): string {
  return [item.label || item.tuningId, item.groupLabel || item.groupKey, item.precision.label, item.commentary.available ? "commentary available" : "no commentary"].filter(Boolean).join(" · ");
}

function temperamentGroupLabel(item: { label?: string | null; value?: string | null; groupKey?: string | null }): string {
  return item.label || item.groupKey || item.value || "Ungrouped";
}

function formatCents(value?: number | null): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "not recorded";
  const formatted = Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
  return value > 0 ? `+${formatted}` : formatted;
}
