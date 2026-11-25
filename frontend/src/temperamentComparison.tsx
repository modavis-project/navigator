import { useEffect, useId, useState } from "react";
import { fetchTemperament, type TuningSystemSummary } from "./api";
import { MAX_TEMPERAMENT_COMPARISON, temperamentDetailHref } from "./temperamentOccurrences";
import { useUiLocale } from "./uiLocale";

export function TemperamentComparison({
  ids, visible, catalogueHref, onRemove, onClear,
}: {
  ids: string[];
  visible: ReadonlyMap<string, TuningSystemSummary>;
  catalogueHref: string;
  onRemove: (id: string) => void;
  onClear: () => void;
}) {
  const { t, formatNumber } = useUiLocale();
  const heading = useId();
  const [loaded, setLoaded] = useState<ReadonlyMap<string, TuningSystemSummary>>(new Map());
  const [failed, setFailed] = useState<ReadonlySet<string>>(new Set());
  const [attempt, setAttempt] = useState(0);
  const [feedback, setFeedback] = useState<"copied" | "address" | null>(null);
  useEffect(() => {
    setLoaded(previous => {
      const next = new Map<string, TuningSystemSummary>();
      for (const id of ids) {
        const item = visible.get(id) ?? previous.get(id);
        if (item) next.set(id, item);
      }
      return next.size !== previous.size || [...next].some(([id, item]) => previous.get(id) !== item)
        ? next : previous;
    });
  }, [ids, visible]);
  const unresolved = ids.filter(id => !loaded.has(id) && !visible.has(id));
  const missingKey = unresolved.join(",");
  useEffect(() => {
    if (!missingKey) return;
    const pending = missingKey.split(",");
    const controller = new AbortController();
    setFailed(new Set());
    void Promise.allSettled(pending.map(id => fetchTemperament(id, "surface", controller.signal))).then(results => {
      if (controller.signal.aborted) return;
      const successful = new Map<string, TuningSystemSummary>();
      const unavailable = new Set<string>();
      results.forEach((result, index) => {
        const id = pending[index];
        if (result.status === "fulfilled" && (result.value.tuningId || result.value.id) === id) {
          successful.set(id, result.value);
        } else unavailable.add(id);
      });
      setLoaded(previous => new Map([...previous, ...successful]));
      setFailed(unavailable);
    });
    return () => controller.abort();
  }, [attempt, missingKey]);
  useEffect(() => setFeedback(null), [catalogueHref]);

  const items = ids.flatMap(id => {
    const item = visible.get(id) ?? loaded.get(id);
    return item ? [item] : [];
  });
  const tones = Array.from(new Set(items.flatMap(item => item.toneOrder)));
  const share = async () => {
    try {
      await navigator.clipboard.writeText(new URL(catalogueHref, window.location.origin).href);
      setFeedback("copied");
    } catch { setFeedback("address"); }
  };
  const formatCent = (item: TuningSystemSummary, tone: string) => {
    const index = item.toneOrder.indexOf(tone);
    const value = index < 0 ? null : item.centValues[index];
    return typeof value === "number" && Number.isFinite(value)
      ? formatNumber(value, { maximumFractionDigits: 12, signDisplay: "exceptZero" })
      : "—";
  };

  if (ids.length === 0) return null;
  return <section className="panel-block temperament-compare" aria-labelledby={heading}>
    <div className="temperament-compare-head">
      <div>
        <h2 id={heading}>{t("tuning.compare.title", "Temperament comparison", "Stimmungen vergleichen")}</h2>
        <p>{t("tuning.compare.count", "{count, number} of {maximum, number} selected. Your selection stays with you as you browse.", "{count, number} von {maximum, number} ausgewählt. Die Auswahl bleibt beim Blättern und Filtern erhalten.", { count: ids.length, maximum: MAX_TEMPERAMENT_COMPARISON })}</p>
      </div>
      <div className="temperament-compare-actions">
        <button type="button" className="text-link-button" onClick={() => void share()}>{t("tuning.compare.copy", "Copy comparison link", "Vergleichslink kopieren")}</button>
        <button type="button" className="text-link-button" onClick={onClear}>{t("tuning.compare.clear", "Clear comparison", "Auswahl leeren")}</button>
      </div>
    </div>
    <ul className="temperament-compare-selection">
      {ids.map(id => {
        const item = visible.get(id) ?? loaded.get(id);
        const title = item?.title ?? id;
        return <li key={id}>
          {item ? <a href={temperamentDetailHref(id, catalogueHref)}>{title}</a> : <span>{title}</span>}
          {!item && <small>{failed.has(id)
            ? t("tuning.compare.unavailable", "Record unavailable", "Datensatz nicht verfügbar")
            : t("tuning.compare.loading", "Loading record…", "Datensatz wird geladen …")}</small>}
          <button type="button" onClick={() => onRemove(id)} aria-label={t("tuning.compare.removeNamed", "Remove {title} from comparison", "{title} aus dem Vergleich entfernen", { title })}>
            {t("tuning.compare.remove", "Remove", "Entfernen")}
          </button>
        </li>;
      })}
    </ul>
    {unresolved.some(id => failed.has(id)) && <button type="button" className="text-link-button" onClick={() => setAttempt(value => value + 1)}>
      {t("tuning.compare.retry", "Retry unavailable records", "Nicht verfügbare Datensätze erneut laden")}
    </button>}
    <p aria-live="polite" className="temperament-compare-feedback">
      {feedback === "copied" ? t("tuning.compare.copied", "Comparison link copied.", "Vergleichslink kopiert.")
        : feedback === "address" ? t("tuning.compare.address", "Copy the address from your browser to share this comparison.", "Zum Teilen des Vergleichs die Adresse aus dem Browser kopieren.") : null}
    </p>
    {items.length > 1 && <div className="temperament-table-wrap" role="region" tabIndex={0} aria-labelledby={heading}>
      <table className="temperament-data-table temperament-comparison-table">
        <caption>{t("tuning.compare.caption", "Catalogue cent values by tone", "Centwerte des Katalogs nach Ton")}</caption>
        <thead><tr><th scope="col">{t("tuning.compare.tone", "Tone", "Ton")}</th>
          {items.map(item => <th scope="col" key={item.id}>{item.title}<small>{item.tuningId || item.id}</small></th>)}
        </tr></thead>
        <tbody>{tones.map(tone => <tr key={tone}><th scope="row">{tone}</th>
          {items.map(item => <td key={item.id}><code>{formatCent(item, tone)}</code></td>)}
        </tr>)}</tbody>
      </table>
    </div>}
  </section>;
}
