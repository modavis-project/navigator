import { ChevronDown } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { publicGetJson, type EventTypeFacet } from "./api";
import { useUiLocale } from "./uiLocale";
import "./eventTypePicker.css";

interface ActivityLookup {
  concepts: Array<{ code: string; href: string; preferredLabel: string; labels: Array<{ languageCode?: string; label: string }> }>;
  wordings: Array<{ label: string; href: string; englishGloss?: string | null }>;
  eventFacets?: Array<{ code: string; conceptCode?: string; sourceWording?: string }>;
}

type PickerOption = {
  value: string;
  label: string;
  searchLabels: string[];
  count?: number;
  note?: string;
  href?: string;
};

const searchKey = (text: string) => text.normalize("NFKD").toLowerCase().replace(/\p{M}/gu, "").replace(/ß/g, "ss").trim().replace(/\s+/gu, " ");
const wordingKey = (text: string) => text.normalize("NFC").toLowerCase().replace(/ß/g, "ss").trim().replace(/\s+/gu, " ");

export function EventTypePicker({ facets, value, onChange, publicProjection, concept, conceptLabel, onClearConcept }: {
  facets: EventTypeFacet[];
  value: string;
  onChange: (value: string) => void;
  publicProjection: boolean;
  concept: string;
  conceptLabel: string;
  onClearConcept: () => void;
}) {
  const { t, locale, intlLocale, formatNumber } = useUiLocale();
  const [showOptions, setShowOptions] = useState(false);
  const [draft, setDraft] = useState("");
  const [active, setActive] = useState<string | null>(null);
  const [requestedLookup, setRequestedLookup] = useState(Boolean(value || concept));
  const [lookup, setLookup] = useState<ActivityLookup>();
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const id = useId();
  const allTypes = t("event.catalogue.allTypes", "All event types", "Alle Ereignistypen");

  useEffect(() => {
    if (!publicProjection || !requestedLookup) return;
    const controller = new AbortController();
    publicGetJson<ActivityLookup>("/api/vocab/activity-lookup", controller.signal)
      .then((data) => {
        if (!controller.signal.aborted && Array.isArray(data?.concepts) && Array.isArray(data?.wordings)) setLookup(data);
      })
      .catch(() => { /* Facet filtering remains available when vocabulary evidence is unavailable. */ });
    return () => controller.abort();
  }, [publicProjection, requestedLookup]);

  const options = useMemo(() => {
    const evidence = new Map(lookup?.eventFacets?.map((item) => [item.code, item]));
    const concepts = new Map(lookup?.concepts.map((item) => [item.code, item]));
    const wordings = new Map(lookup?.wordings.map((item) => [wordingKey(item.label), item]));
    const sorted = [...facets.slice(0, 8), ...facets.slice(8).sort((a, b) =>
      (a.displayName || a.name).localeCompare(b.displayName || b.name, intlLocale))];
    const entries: PickerOption[] = sorted.map((facet) => {
      const record = evidence.get(facet.code);
      const concept = concepts.get(record?.conceptCode || "");
      const wording = record?.sourceWording ? wordings.get(wordingKey(record.sourceWording)) : undefined;
      const label = record?.sourceWording || facet.displayName || facet.name;
      const conceptLabel = concept?.labels.find((label) => label.languageCode === locale)?.label || concept?.preferredLabel;
      const gloss = locale === "en" ? wording?.englishGloss : undefined;
      const note = gloss
        ? t("event.types.englishGloss", "{gloss} · English gloss", "{gloss} · englische Übersetzung", { gloss })
        : wording ? t("event.types.sourceWording", "Recorded source wording", "Erfasster Quellenwortlaut") : conceptLabel;
      return {
        value: facet.code, label, count: facet.count,
        searchLabels: [label, facet.name, facet.code, ...(concept?.labels.map((label) => label.label) || []), ...(wording?.englishGloss ? [wording.englishGloss] : [])],
        note: note && searchKey(note) !== searchKey(label) ? note : undefined,
        href: concept?.href || wording?.href || facet.vocabularyUrl || undefined,
      };
    });
    return [{ value: "", label: allTypes, searchLabels: [allTypes] }, ...entries];
  }, [facets, lookup, allTypes, intlLocale, locale, t]);

  const matches = useMemo(() => {
    const key = searchKey(draft);
    if (!key) return options;
    const groups: PickerOption[][] = [[], [], []];
    for (const option of options) {
      const labels = option.searchLabels.map(searchKey);
      if (labels.includes(key)) groups[0].push(option);
      else if (labels.some((value) => value.startsWith(key))) groups[1].push(option);
      else if (labels.some((value) => value.includes(key))) groups[2].push(option);
    }
    return groups.flat();
  }, [draft, options]);
  const selected = options.find((option) => option.value === value);
  const activeIndex = matches.findIndex((option) => option.value === active);
  const activeOption = showOptions && activeIndex >= 0 ? `${id}-option-${activeIndex}` : undefined;
  const optionText = (option: PickerOption) => option.count == null ? option.label : `${option.label} (${formatNumber(option.count)})`;

  useEffect(() => {
    if (activeOption) document.getElementById(activeOption)?.scrollIntoView({ block: "nearest" });
  }, [activeOption]);

  const open = () => {
    setRequestedLookup(true);
    setShowOptions(true);
    setDraft("");
    setActive(null);
  };
  const close = () => {
    setShowOptions(false);
    setActive(null);
  };
  const choose = (option: PickerOption) => {
    onChange(option.value);
    close();
  };
  const handleKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) return;
    switch (event.key) {
      case "ArrowDown":
      case "ArrowUp": {
        event.preventDefault();
        const forward = event.key === "ArrowDown";
        if (!showOptions) open();
        const visible = showOptions ? matches : options;
        const count = visible.length;
        const step = forward ? 1 : -1;
        const current = showOptions ? activeIndex : -1;
        const next = current < 0 ? (forward ? 0 : count - 1) : (current + count + step) % count;
        setActive(visible[next]?.value ?? null);
        break;
      }
      case "Escape":
        if (showOptions) {
          event.preventDefault();
          close();
        }
        break;
      case "Enter":
        if (showOptions) {
          event.preventDefault();
          const match = matches[activeIndex] || (matches.length === 1 ? matches[0] : undefined);
          if (match) choose(match);
        }
        break;
    }
  };
  return <div className="event-type-control">
    <label htmlFor={id}><span>{t("event.catalogue.type", "Event type", "Ereignistyp")}</span></label>
    <div className="event-type-picker">
      <div className="event-filter-input">
        <input
          id={id}
          ref={input}
          role="combobox"
          aria-expanded={showOptions}
          aria-controls={`${id}-options`}
          aria-activedescendant={activeOption}
          aria-autocomplete="list"
          aria-describedby={`${id}-help`}
          autoComplete="off"
          value={showOptions ? draft : selected ? optionText(selected) : value}
          placeholder={t("event.types.search", "Search event types", "Ereignistypen suchen")}
          onClick={() => { if (!showOptions) open(); }}
          onChange={(event) => {
            setRequestedLookup(true);
            setShowOptions(true);
            setDraft(event.target.value);
            setActive(null);
            if (list.current) list.current.scrollTop = 0;
          }}
          onFocus={() => { if (!showOptions) open(); }}
          onBlur={close}
          onKeyDown={handleKey}
        />
        <button type="button" tabIndex={-1} aria-label={showOptions ? t("event.types.hide", "Hide event types", "Ereignistypen ausblenden") : t("event.types.show", "Show event types", "Ereignistypen anzeigen")}
          aria-expanded={showOptions} aria-controls={`${id}-options`}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            if (showOptions) close();
            else {
              open();
              input.current?.focus();
            }
          }}><ChevronDown size={16} aria-hidden="true" /></button>
      </div>
      <div className="event-type-popup" hidden={!showOptions}>
        <ul id={`${id}-options`} ref={list} role="listbox" aria-label={t("event.types.options", "Event type options", "Verfügbare Ereignistypen")}>
          {showOptions && matches.map((option, index) => <li id={`${id}-option-${index}`} key={option.value} role="option"
            aria-selected={option.value === value} data-active={index === activeIndex || undefined}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => choose(option)}>
            <span>{optionText(option)}</span>{option.note && <small>{option.note}</small>}
          </li>)}
        </ul>
        <div className="event-type-matches" role="status">{showOptions && (matches.length
          ? t("event.types.matches", "{count, plural, one {# option} other {# options}}", "{count, plural, one {# Auswahlmöglichkeit} other {# Auswahlmöglichkeiten}}", { count: matches.length })
          : t("event.types.none", "No event types match.", "Keine passenden Ereignistypen."))}</div>
      </div>
    </div>
    <small id={`${id}-help`}>
      {selected?.href
        ? <a href={selected.href}>{t("event.types.selectedTerm", "Read about this term", "Informationen zu diesem Begriff")}</a>
        : <a href="/vocab/modavis_activity_types">{t("event.catalogue.browseTerms", "Browse definitions and source terms", "Definitionen und Quellenbegriffe ansehen")}</a>}
    </small>
    {concept && <div className="event-concept-filter">
      <small>{t("event.types.linkedConcept", "Linked concept", "Verknüpfter Begriff")} <a href={`/vocab/modavis_activity_types/concepts/${encodeURIComponent(concept)}`}>{lookup?.concepts.find((item) => item.code === concept)?.labels.find((label) => label.languageCode === locale)?.label || conceptLabel || concept}</a></small>
      <button type="button" onClick={onClearConcept}>{t("event.types.clearConcept", "Remove concept filter", "Begriffsfilter entfernen")}</button>
    </div>}
  </div>;
}
