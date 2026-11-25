import {useId} from "react";
import type {OrganTechnicalComparisonGroup} from "./api";
import {relatedActionGroups, technicalComparisonHasDifference} from "./sourceComparisonPresentation";
import {specificationFieldLabel, technicalCaptureRowsLabel, technicalComparisonText} from "./specificationLabels";
import {useUiLocale} from "./uiLocale";
import "./sourceComparisons.css";

export function TechnicalSourceComparisons({groups, idPrefix = "technical-comparison"}: {groups: OrganTechnicalComparisonGroup[]; idPrefix?: string}) {
  const {t, formatNumber} = useUiLocale();
  const label = useId();
  const relatedActions = relatedActionGroups(groups);
  if (!groups.length) return null;
  const fieldLabel = (group: OrganTechnicalComparisonGroup) => specificationFieldLabel(t, group.family, group.label);
  const displayValue = (value: unknown) => value == null || value === ""
    ? t("organ.technical.notStated", "Not stated", "Nicht angegeben") : String(value);
  const originalSource = t("organ.technical.originalSource", "Open original source", "Originalquelle öffnen");
  const sourceRecord = t("organ.technical.sourceRecord", "Source record", "Quelldatensatz");
  return <section className="technical-source-comparisons" aria-labelledby={label}>
    <h4 id={label}>{t("organ.technical.compare.title", "Compare technical assertions by field", "Technische Quellenangaben nach Feld vergleichen")}</h4>
    <p>{t("organ.technical.compare.scope", "Every source record keeps its own claims. Matching values do not establish the same configuration or present condition. Missing information is not a zero or a disagreement.", "Jeder Quelldatensatz behält seine eigenen Angaben. Übereinstimmende Werte belegen weder dieselbe Disposition noch den heutigen Zustand. Fehlende Angaben entsprechen weder dem Wert null noch einer Abweichung.")}</p>
    {relatedActions.length > 0 && <details id={idPrefix + "-action-context"} className="technical-field-comparison has-differences related-action-comparison">
      <summary><span>
        <strong>{t("organ.technical.compare.actionTitle", "Action descriptions need comparison", "Angaben zur Traktur im Zusammenhang prüfen")}</strong>
        <small>{t("organ.technical.compare.actionScope", "General transmission wording and specific key/stop action fields have different scopes", "Allgemeine Trakturbeschreibungen und Angaben zur Spiel- oder Registertraktur haben unterschiedliche Geltungsbereiche")}</small>
      </span></summary>
      <p>{t("organ.technical.compare.actionNote", "Review these related claims together. They may use divergent wording, but their scopes differ; this view does not automatically equate them or decide which describes the organ’s present condition.", "Prüfen Sie diese Angaben im Zusammenhang. Ihr Wortlaut kann abweichen und ihre Geltungsbereiche sind verschieden. Die Ansicht setzt sie nicht gleich und entscheidet nicht, welche Angabe den heutigen Zustand der Orgel beschreibt.")}</p>
      {relatedActions.map(group => <section key={group.id}>
        <h5>{fieldLabel(group)}</h5>
        {group.assertions.map(assertion => <article key={assertion.factId}>
          <strong>{displayValue(assertion.displayValue)}</strong>
          <p>{assertion.source} · <code>{assertion.sourceRecordId}</code></p>
          <code>{assertion.sourcePath}</code>
          {assertion.sourceUrl && <a href={assertion.sourceUrl} target="_blank" rel="noreferrer">{originalSource}</a>}
        </article>)}
      </section>)}
    </details>}
    {groups.map(group => {
      const field = fieldLabel(group);
      const sourceCount = new Set(group.assertions.map(a => a.sourceRecordId)).size;
      return <details id={idPrefix + "-" + group.family} className={"technical-field-comparison" + (technicalComparisonHasDifference(group) ? " has-differences" : "")} key={group.id}>
        <summary><span><strong>{field}</strong><small>{technicalComparisonText(t, group)} · {t("organ.technical.compare.counts", "{assertions, plural, one {# assertion} other {# assertions}} · {sources, plural, one {# source record} other {# source records}}", "{assertions, plural, one {# Angabe} other {# Angaben}} · {sources, plural, one {# Quelldatensatz} other {# Quelldatensätze}}", {assertions:group.assertions.length,sources:sourceCount})}</small></span></summary>
        {relatedActions.includes(group) && <button type="button" className="field-comparison-link" onClick={() => revealTechnicalComparison("action-context", idPrefix)}>{t("organ.technical.compare.actionLink", "Compare related action descriptions", "Zugehörige Angaben zur Traktur vergleichen")}</button>}
        {group.withinSourceDifferences && <p role="note">{t("organ.technical.compare.withinSource", "This field also has different assertions within the same source record. Each assertion is retained below.", "Auch innerhalb desselben Quelldatensatzes gibt es zu diesem Feld abweichende Angaben. Sie sind unten einzeln aufgeführt.")}</p>}
        <div className="technical-comparison-values" aria-label={t("organ.technical.compare.values", "{field} reported values", "Werte laut Quelle zum Feld „{field}“", {field})}>
          {group.valueGroups.map(value => <div key={value.key}>
            <strong>{displayValue(value.value)}</strong>
            <span>{t("organ.technical.compare.valueCounts", "{assertions, plural, one {# assertion} other {# assertions}} from {sources, plural, one {# source record} other {# source records}}", "{assertions, plural, one {# Angabe} other {# Angaben}} aus {sources, plural, one {# Quelldatensatz} other {# Quelldatensätzen}}", {assertions:value.factIds.length,sources:value.sourceRecordIds.length})}</span>
            {value.kind === "qualified" && <small>{t("organ.technical.compare.qualified", "Qualified; retained separately from comparable values", "Angabe mit Einschränkungen. Sie bleibt von vergleichbaren Werten getrennt.")}</small>}
            {value.kind === "source_code" && <small>{t("organ.technical.compare.opaque", "Source code with no verified temperament label", "Quellencode ohne bestätigte Stimmungsbezeichnung")}</small>}
          </div>)}
        </div>
        <div className="technical-comparison-scroll"><table>
          <caption>{t("organ.technical.compare.caption", "{field}: all source assertions", "Alle Quellenangaben zum Feld „{field}“", {field})}</caption>
          <thead><tr>
            <th scope="col">{sourceRecord}</th>
            <th scope="col">{t("organ.technical.compare.value", "Reported value", "Wert laut Quelle")}</th>
            <th scope="col">{t("organ.technical.compare.evidence", "Evidence and qualification", "Belege und Einschränkungen")}</th>
          </tr></thead>
          <tbody>{group.assertions.map(assertion => <tr key={assertion.factId}>
            <th scope="row">{assertion.source || sourceRecord}<code>{assertion.sourceRecordId}</code></th>
            <td>
              <strong>{displayValue(assertion.displayValue)}</strong>
              {assertion.valueKind === "missing" && <small>{t("organ.technical.compare.noValue", "No value captured", "Kein Wert erfasst")}</small>}
              {assertion.valueKind === "source_code" && <small>{t("organ.technical.compare.code", "Uninterpreted source code", "Nicht interpretierter Quellencode")}</small>}
              {assertion.comparisonKind === "source_summary_vs_captured_rows" && <p role="note">
                <strong>{technicalCaptureRowsLabel(t, group.family)}: {assertion.capturedComponentCount == null ? t("organ.technical.unavailable", "Unavailable", "Nicht verfügbar") : formatNumber(assertion.capturedComponentCount)}</strong>
                <small>{t("organ.technical.compare.captureNote", "Summary and captured list differ within this source record. The row count is capture coverage, not another reported organ total.", "Zusammenfassung und erfasste Liste weichen innerhalb dieses Quelldatensatzes voneinander ab. Die Zahl der Zeilen beschreibt den Erfassungsumfang. Sie ist keine weitere Angabe zur Gesamtzahl.")}</small>
              </p>}
              {assertion.sourceWording && assertion.sourceWording !== assertion.displayValue && <p>{assertion.sourceWording}</p>}
            </td>
            <td>
              {assertion.qualificationGuidance && <p>{assertion.qualificationGuidance}</p>}
              {assertion.qualificationStatus && <small>{assertion.qualificationStatus.replace(/_/g, " ")}</small>}
              <code>{assertion.sourcePath || t("organ.technical.compare.noSourcePath", "Exact source path unavailable", "Genaue Fundstelle in der Quelle nicht verfügbar")}</code>
              {assertion.sourceUrl && <a href={assertion.sourceUrl} target="_blank" rel="noreferrer">{originalSource}</a>}
            </td>
          </tr>)}</tbody>
        </table></div>
        {group.missingSourceRecordIds.length > 0 && <details className="technical-missing-sources">
          <summary>{t("organ.technical.compare.missing", "No captured assertion in {count, plural, one {# other source record} other {# other source records}}", "Keine Angabe erfasst in {count, plural, one {# weiteren Quelldatensatz} other {# weiteren Quelldatensätzen}}", {count:group.missingSourceRecordIds.length})}</summary>
          <ul>{group.missingSourceRecordIds.map(id => <li key={id}><code>{id}</code></li>)}</ul>
        </details>}
      </details>;
    })}
  </section>;
}

export function revealTechnicalComparison(family: string, idPrefix = "technical-comparison") {
  const target = document.getElementById(idPrefix + "-" + family);
  if (!(target instanceof HTMLDetailsElement)) return;
  for (let parent = target.parentElement; parent; parent = parent.parentElement) {
    if (parent instanceof HTMLDetailsElement) parent.open = true;
  }
  target.open = true;
  const summary = target.querySelector("summary");
  summary?.focus();
  target.scrollIntoView({block: "nearest", behavior: "smooth"});
}
