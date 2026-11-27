import { useEffect, useId, useState, type KeyboardEvent } from "react";
import { publicGetJson } from "./api";
import { useUiLocale } from "./uiLocale";

type Concept = { code: string; preferredLabel: string; labels: { label: string; languageCode: string }[]; definition?: string; definitionDe?: string; href: string };
type Wording = { key: string; label: string; englishGloss?: string; occurrences: number; href: string };
type Lookup = { concepts: Concept[]; wordings: Wording[] };
type Match = { kind: "concept" | "wording"; title: string; subtitle?: string; href: string; count?: number; rank: number };
const fold = (value: string) => value.normalize("NFKD").replace(/\p{Mark}/gu, "").toLocaleLowerCase().replace(/ß/g, "ss").trim().replace(/\s+/g, " ");

export function useActivityVocabularyLookup(enabled: boolean, snapshot?: string) {
  const [state, setState] = useState<{ key: string; data?: Lookup; error?: boolean }>();
  const endpoint = "/api/vocab/activity-lookup" + (snapshot ? "?" + new URLSearchParams({ snapshot }) : "");
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    publicGetJson<Lookup>(endpoint, controller.signal).then(data => {
      if (!controller.signal.aborted) setState({ key: endpoint, data });
    }).catch(() => {
      if (!controller.signal.aborted) setState({ key: endpoint, error: true });
    });
    return () => controller.abort();
  }, [enabled, endpoint]);
  return state?.key === endpoint ? state : undefined;
}

export function activityMatches(lookup: Lookup | undefined, query: string, language: string) {
  if (!lookup || !fold(query)) return [];
  const needle = fold(query);
  const rank = (labels: string[], extra: string[] = []) => {
    const keys = labels.map(fold);
    return keys.includes(needle) ? 0 : keys.some(key => key.startsWith(needle)) ? 1
      : keys.some(key => key.includes(needle)) ? 2 : extra.some(key => fold(key).includes(needle)) ? 3 : 4;
  };
  const results: Match[] = [
    ...lookup.concepts.map((term): Match => {
      const exact = term.labels.find(label => fold(label.label) === needle);
      const title = exact?.label || term.labels.find(label => label.languageCode === language)?.label || term.preferredLabel;
      return { kind: "concept", title, subtitle: term.labels.find(label => label.label !== title)?.label, href: term.href,
        rank: rank([...term.labels.map(label => label.label), term.code], [term.definition || "", term.definitionDe || ""]) };
    }),
    ...lookup.wordings.map((term): Match => ({ kind: "wording", title: term.label, subtitle: term.englishGloss,
      href: term.href, count: term.occurrences, rank: rank([term.label, term.englishGloss || ""]) })),
  ];
  return results.filter(result => result.rank < 4)
    .sort((a, b) => a.rank - b.rank || a.title.localeCompare(b.title, language));
}

export function ActivityVocabularyInput({ value, onChange, label, placeholder, snapshot, name }: {
  value: string; onChange: (value: string) => void; label: string; placeholder?: string; snapshot?: string; name?: string;
}) {
  const { locale } = useUiLocale();
  const de = locale === "de";
  const [focused, setFocused] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [composing, setComposing] = useState(false);
  const [cursor, setCursor] = useState(-1);
  const inputId = useId();
  const listId = useId();
  const started = focused && !dismissed && !composing && fold(value).length >= 2;
  const lookup = useActivityVocabularyLookup(started, snapshot);
  const ranked = activityMatches(lookup?.data, value, locale);
  const groups = [
    { kind: "concept", label: de ? "Kontrollierte Begriffe" : "Controlled concepts", items: ranked.filter(item => item.kind === "concept").slice(0, 4) },
    { kind: "wording", label: de ? "Quellenwortlaut" : "Recorded source wording", items: ranked.filter(item => item.kind === "wording").slice(0, 4) },
  ];
  const matches = groups.flatMap(group => group.items);
  const open = started && matches.length > 0;
  function keyboard(event: KeyboardEvent<HTMLInputElement>) {
    if (composing || event.nativeEvent.isComposing) return;
    if (event.key === "Escape" && started) {
      event.preventDefault(); setDismissed(true); setCursor(-1);
    }
    if (!open) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const next = event.key === "ArrowDown" ? (cursor + 1) % matches.length : (cursor <= 0 ? matches.length - 1 : cursor - 1);
      setCursor(next);
      document.getElementById(listId + "-" + next)?.scrollIntoView({ block: "nearest" });
    }
    if (event.key === "Enter" && matches[cursor]) {
      event.preventDefault(); location.assign(matches[cursor].href);
    }
  }
  return <div className="vr-lookup">
    <label htmlFor={inputId}>{label}</label>
    <input id={inputId} type="search" name={name} value={value} maxLength={200} placeholder={placeholder} role="combobox"
      aria-autocomplete="list" aria-expanded={open} aria-controls={open ? listId : undefined}
      aria-activedescendant={open && matches[cursor] ? listId + "-" + cursor : undefined}
      onFocus={() => { setFocused(true); setDismissed(false); }}
      onBlur={() => { setFocused(false); setCursor(-1); }}
      onCompositionStart={() => setComposing(true)} onCompositionEnd={() => setComposing(false)}
      onKeyDown={keyboard} onChange={event => { onChange(event.target.value); setCursor(-1); setDismissed(false); }} />
    {open && <div role="listbox" id={listId} className="vr-suggestions" aria-label={de ? "Vorschläge" : "Vocabulary suggestions"}>
      {groups.filter(group => group.items.length).map(group => <div role="group" aria-label={group.label} key={group.kind}>
        <p aria-hidden="true">{group.label}</p>
        {group.items.map(match => {
          const index = matches.indexOf(match);
          return <div key={match.href} id={listId + "-" + index} role="option" aria-selected={cursor === index}
            onMouseDown={event => event.preventDefault()} onClick={() => location.assign(match.href)}>
            <strong>{match.title}</strong>{match.subtitle && <span>{match.subtitle}</span>}
            {match.count != null && <span>{match.count.toLocaleString(locale)} {de ? "Belege" : "assertions"}</span>}
          </div>;
        })}
      </div>)}
    </div>}
    <span role="status" className="sr-only">{open ? (de ? `${matches.length} Vorschläge` : `${matches.length} suggestions`) : ""}</span>
  </div>;
}
