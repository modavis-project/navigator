import {useEffect, useId, useRef, useState, type FormEvent} from 'react';
import {ArrowRight, Bookmark, ChevronLeft, ChevronRight, Download, Link as LinkIcon, Plus, X} from 'lucide-react';
import {JsonEvidence} from './JsonEvidence';
import {addAccountToWorkspace, addViewToWorkspace} from './researchWorkspace';
import {useUiLocale} from './uiLocale';

type Scope = 'account' | 'division';
type Criterion = {label: string; pitch: string | null};
type DraftRow = {key: number; label: string; pitch: string};
type Row = {
  id: string | number;
  position?: number | null;
  divisionPosition?: number | null;
  division?: string | null;
  label: string;
  pitch?: string | null;
  sourceWording?: string | null;
  sourcePaths?: unknown[];
  evidenceKind?: 'retained' | 'recovered';
};
type Match = {predicateIndex: number; witnessRowId: Row['id']; rows: Row[]};
type MatchAccount = {
  id: string;
  organId: string;
  organLabel: string;
  organHref: string;
  accountHref: string;
  descriptionId: string;
  descriptionRevision: string;
  sourceRecordId: string;
  sourceRevision?: string | null;
  source?: string | null;
  sourceUrl?: string | null;
  sourceHeading?: string | null;
  sourcePaths?: unknown[];
  periodLabel?: string | null;
  timeKind?: string | null;
  timeRelation?: string | null;
  coverage?: string | null;
  capturedStopRows?: number | null;
  capturedComponentRows?: number | null;
  subjectKind?: string | null;
  realization?: string | null;
  chronology?: Record<string, unknown> | null;
  division: {position: number | null; label: string} | null;
  matches: Match[];
};

export type DispositionResult = {
  publicCoreSha256: string;
  selectionSha256: string;
  filters: {scope: Scope; stop: Criterion[]};
  total: number;
  accountCount: number;
  organCount: number;
  offset: number;
  hasMore: boolean;
  items: MatchAccount[];
};

const MIN_STOPS = 2;
const MAX_STOPS = 4;
const MAX_LABEL = 100;
const MAX_PITCH = 24;
const WORKBENCH_PATH = '/use-cases/research-workbench';
const EXPORT_PATH = '/api/workbench/dispositions/export';

function draftRows(values: string[]): DraftRow[] {
  return Array.from({length: Math.max(MIN_STOPS, Math.min(MAX_STOPS, values.length))}, (_, key) => {
    const [label, ...pitch] = (values[key] || '').split('|');
    return {key, label, pitch: pitch.join('|')};
  });
}

function criterionLabel(criterion: Criterion): string {
  return criterion.pitch ? `${criterion.label} · ${criterion.pitch}` : criterion.label;
}

export function DispositionForm({params, onSearch}: {
  params: URLSearchParams;
  onSearch: (stop: string[], scope: Scope) => void;
}) {
  const {t} = useUiLocale();
  const id = useId();
  const appliedStops = JSON.stringify(params.getAll('stop'));
  const appliedScope = params.get('scope') === 'division' ? 'division' : 'account';
  const [rows, setRows] = useState(() => draftRows(params.getAll('stop')));
  const [scope, setScope] = useState<Scope>(appliedScope);
  const [invalidRow, setInvalidRow] = useState<number | null>(null);
  const nextKey = useRef(MAX_STOPS);
  const nameInputs = useRef(new Map<number, HTMLInputElement>());
  const addButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setRows(draftRows(JSON.parse(appliedStops)));
    setScope(appliedScope);
    setInvalidRow(null);
  }, [appliedScope, appliedStops]);

  function edit(key: number, field: 'label' | 'pitch', value: string) {
    if (invalidRow === key) setInvalidRow(null);
    setRows(current => current.map(row => row.key === key ? {...row, [field]: value} : row));
  }

  function addRow() {
    const key = nextKey.current++;
    setRows(current => [...current, {key, label: '', pitch: ''}]);
    requestAnimationFrame(() => nameInputs.current.get(key)?.focus());
  }

  function removeRow(key: number) {
    if (invalidRow === key) setInvalidRow(null);
    setRows(current => current.filter(row => row.key !== key));
    requestAnimationFrame(() => addButton.current?.focus());
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const criteria = rows.map(row => ({...row, label: row.label.trim(), pitch: row.pitch.trim()}));
    const invalid = criteria.find(row => !row.label || /[|\u0000-\u001f\u007f]/.test(`${row.label}${row.pitch}`));
    if (invalid) {
      setInvalidRow(invalid.key);
      nameInputs.current.get(invalid.key)?.focus();
      return;
    }
    onSearch(criteria.map(row => `${row.label}|${row.pitch}`), scope);
  }

  return <form className="wb-filters wb-disposition-form" aria-labelledby={`${id}-criteria`} aria-describedby={`${id}-help`} onSubmit={submit}>
    <div className="wb-filter-heading">
      <span id={`${id}-criteria`}>{t('disposition.form.heading', 'Stop criteria', 'Registerkriterien')}</span>
      <small>{t('disposition.form.count', '{count} of 4 criteria', '{count} von 4 Kriterien', {count: rows.length})}</small>
    </div>
    <p id={`${id}-help`} className="wb-disposition-help">
      {t('disposition.form.help', 'Enter two to four recorded stop names. Add a pitch where it matters. Each criterion needs its own captured stop row.',
        'Geben Sie zwei bis vier in Quellen belegte Registernamen ein. Bei Bedarf können Sie die Fußtonlage angeben. Jedes Kriterium erfordert einen eigenen erfassten Registereintrag.')}
    </p>
    <div className="wb-disposition-criteria">
      {rows.map((row, index) => <fieldset className="wb-disposition-criterion" key={row.key}>
        <legend>{t('disposition.form.stopNumber', 'Stop {number}', 'Register {number}', {number: index + 1})}</legend>
        <label>{t('disposition.form.stopName', 'Recorded stop name', 'Überlieferter Registername')}
          <input ref={node => {if (node) nameInputs.current.set(row.key, node); else nameInputs.current.delete(row.key);}}
            type="text" required maxLength={MAX_LABEL} value={row.label} placeholder={index === 0 ? 'Principal' : index === 1 ? 'Octave' : undefined}
            aria-invalid={invalidRow === row.key || undefined} aria-describedby={invalidRow === row.key ? `${id}-error` : undefined}
            onChange={event => edit(row.key, 'label', event.target.value)}/>
        </label>
        <label>{t('disposition.form.pitch', 'Pitch (optional)', 'Fußtonlage (optional)')}
          <input type="text" maxLength={MAX_PITCH} value={row.pitch} placeholder={index === 0 ? '8′' : index === 1 ? '4′' : undefined}
            aria-invalid={invalidRow === row.key || undefined} aria-describedby={invalidRow === row.key ? `${id}-error` : undefined}
            onChange={event => edit(row.key, 'pitch', event.target.value)}/>
        </label>
        {index >= MIN_STOPS && <button type="button" className="wb-disposition-remove" onClick={() => removeRow(row.key)}>
          <X size={16} aria-hidden="true"/>{t('disposition.form.removeStop', 'Remove stop {number}', 'Register {number} entfernen', {number: index + 1})}
        </button>}
      </fieldset>)}
    </div>
    {invalidRow !== null && <p id={`${id}-error`} role="alert">
      {t('disposition.form.invalid', 'Enter a stop name and remove any vertical bars or control characters.',
        'Geben Sie einen Registernamen ein und entfernen Sie senkrechte Striche oder Steuerzeichen.')}
    </p>}
    <div className="wb-disposition-add"><button ref={addButton} type="button" disabled={rows.length >= MAX_STOPS} onClick={addRow}>
      <Plus size={17} aria-hidden="true"/>{t('disposition.form.addStop', 'Add a stop', 'Register hinzufügen')}
    </button></div>
    <fieldset className="wb-disposition-scope">
      <legend>{t('disposition.form.scope', 'Find the stops together', 'Gemeinsamer Nachweis der Register')}</legend>
      <label><input type="radio" name={`${id}-scope`} value="account" checked={scope === 'account'} onChange={() => setScope('account')}/>
        <span>{t('disposition.scope.account', 'In the same source account', 'In derselben Dispositionsbeschreibung')}
          <small>{t('disposition.scope.accountHelp', 'The stops can appear in different divisions of that account.',
            'Die Register können in verschiedenen Werken derselben Beschreibung stehen.')}</small></span></label>
      <label><input type="radio" name={`${id}-scope`} value="division" checked={scope === 'division'} onChange={() => setScope('division')}/>
        <span>{t('disposition.scope.division', 'In the same named division', 'Im selben benannten Werk')}
          <small>{t('disposition.scope.divisionHelp', 'All stops must occur in one named division of that account.',
            'Alle Register müssen in einem benannten Werk derselben Beschreibung stehen.')}</small></span></label>
    </fieldset>
    <div className="wb-filter-actions">
      <p>{t('disposition.form.boundary', 'The search uses recorded wording and captured rows for each account. Sources can describe historical configurations and proposed designs.',
        'Die Suche berücksichtigt die überlieferten Bezeichnungen und die erfassten Registereinträge jeder Beschreibung. Quellen können historische Zustände und Entwürfe dokumentieren.')}</p>
      <button type="submit" className="wb-apply">{t('disposition.form.submit', 'Find combinations', 'Kombinationen suchen')}<ArrowRight size={16} aria-hidden="true"/></button>
    </div>
  </form>;
}

function CapturedStop({row}: {row: Row}) {
  const {t} = useUiLocale();
  return <div className="wb-disposition-stop">
    <strong>{row.sourceWording || row.label}</strong>
    <span>{[row.pitch, row.division].filter(Boolean).join(' · ') || t('disposition.result.stopDetailsMissing', 'Pitch and division unspecified', 'Fußtonlage und Werk nicht angegeben')}</span>
    {row.evidenceKind === 'recovered' && <small>{t('disposition.result.recovered', 'Recovered from the retained source', 'Nachträglich aus der erhaltenen Quelle erfasst')}</small>}
    {!!row.sourcePaths?.length && <details>
      <summary>{t('disposition.result.rowEvidence', 'Source reference for this row', 'Quellennachweis dieses Eintrags')}</summary>
      <JsonEvidence value={row.sourcePaths} label={t('disposition.result.rowEvidence', 'Source reference for this row', 'Quellennachweis dieses Eintrags')}/>
    </details>}
  </div>;
}

function AccountMatch({item, criteria}: {item: MatchAccount; criteria: Criterion[]}) {
  const {t} = useUiLocale();
  const title = item.sourceHeading || item.periodLabel || t('disposition.result.accountTitle', 'Source account', 'Dispositionsbeschreibung');
  return <article className="wb-disposition-match">
    <header>
      <p className="wb-kicker">{item.division ? t('disposition.result.division', 'Named division', 'Benanntes Werk') : t('disposition.result.account', 'Source account', 'Dispositionsbeschreibung')}</p>
      <h3><a href={item.organHref}>{item.organLabel}</a></h3>
      <p>{title}{item.division && <> · <strong>{item.division.label}</strong></>}</p>
      <p className="wb-source">
        <span className="wb-source-label">{t('disposition.result.source', 'Source', 'Quelle')}</span><span>{item.source || item.sourceRecordId}</span>
        {item.sourceUrl && <a href={item.sourceUrl} target="_blank" rel="noreferrer">{t('disposition.result.originalSource', 'Original source', 'Originalquelle')} ↗</a>}
      </p>
      <p className="wb-disposition-period">
        <span>{item.periodLabel ? t('disposition.result.period', 'Recorded period · {period}', 'Dokumentierter Zeitraum · {period}', {period: item.periodLabel})
          : t('disposition.result.periodUnknown', 'Date of the configuration unestablished', 'Datierung des beschriebenen Zustands ungeklärt')}</span>
        {item.timeKind === 'document_date' && <span>{t('disposition.result.documentDate', 'Document date', 'Datum des Dokuments')}</span>}
        {item.timeKind === 'source_listing' && <span>{t('disposition.result.listingDate', 'Source listing', 'Quelleneintrag')}</span>}
        {item.timeKind === 'relative' && <span>{t('disposition.result.relativeDate', 'Relative dating', 'Relative Datierung')}</span>}
        {item.realization === 'proposed' && <strong>{t('disposition.result.proposal', 'Proposed design', 'Entwurf')}</strong>}
        {item.subjectKind === 'earlier_instrument' && <strong>{t('disposition.result.earlier', 'Earlier organ', 'Früheres Instrument')}</strong>}
      </p>
    </header>
    <h4>{t('disposition.result.matchedStops', 'Captured stop rows matching the criteria', 'Passende erfasste Registereinträge')}</h4>
    <ol className="wb-disposition-witnesses">
      {item.matches.map(match => {
        const criterion = criteria[match.predicateIndex];
        const witness = match.rows.find(row => row.id === match.witnessRowId);
        const alternatives = match.rows.filter(row => row.id !== match.witnessRowId);
        return <li key={match.predicateIndex}>
          <p>{criterion ? criterionLabel(criterion) : t('disposition.result.criterion', 'Criterion {number}', 'Kriterium {number}', {number: match.predicateIndex + 1})}</p>
          {witness && <CapturedStop row={witness}/>}
          {alternatives.length > 0 && <details>
            <summary>{t('disposition.result.alternatives', '{count, plural, one {# other candidate row} other {# other candidate rows}}',
              '{count, plural, one {# weiterer passender Eintrag} other {# weitere passende Einträge}}', {count: alternatives.length})}</summary>
            {alternatives.map(row => <CapturedStop key={row.id} row={row}/>)}
          </details>}
        </li>;
      })}
    </ol>
    <div className="wb-disposition-account-actions">
      <a href={item.accountHref}>{t('disposition.result.openAccount', 'Open the exact source account', 'Dispositionsbeschreibung in dieser Fassung öffnen')}<ArrowRight size={16} aria-hidden="true"/></a>
      <button type="button" onClick={() => addAccountToWorkspace({
        id: item.descriptionId, revision: item.descriptionRevision, organ: item.organId, title, url: item.accountHref,
      })}><Bookmark size={16} aria-hidden="true"/>{t('disposition.result.keepAccount', 'Keep account', 'Beschreibung speichern')}</button>
    </div>
    <details>
      <summary>{t('disposition.result.identifiers', 'Source and revision details', 'Quellen- und Versionsdetails')}</summary>
      <JsonEvidence label={t('disposition.result.identifiers', 'Source and revision details', 'Quellen- und Versionsdetails')} value={{
        sourceRecordId: item.sourceRecordId, sourceRevision: item.sourceRevision, descriptionId: item.descriptionId,
        descriptionRevision: item.descriptionRevision, coverage: item.coverage, timeKind: item.timeKind,
        timeRelation: item.timeRelation, chronology: item.chronology, subjectKind: item.subjectKind, realization: item.realization,
        sourcePaths: item.sourcePaths, capturedStopRows: item.capturedStopRows, capturedComponentRows: item.capturedComponentRows,
      }}/>
    </details>
  </article>;
}

export function DispositionResults({data, page, onPage}: {data: DispositionResult; page: number; onPage: (page: number) => void}) {
  const {t} = useUiLocale();
  const {scope, stop} = data.filters;
  const accountCount = t('disposition.result.accountCount', '{count, plural, one {# matching account} other {# matching accounts}}',
    '{count, plural, one {# passende Beschreibung} other {# passende Beschreibungen}}', {count: data.accountCount});
  const organCount = t('disposition.result.organCount', '{count, plural, one {# organ record} other {# organ records}}',
    '{count, plural, one {# Orgeldatensatz} other {# Orgeldatensätze}}', {count: data.organCount});
  const divisionCount = t('disposition.result.divisionCount', '{count, plural, one {# matching named division} other {# matching named divisions}}',
    '{count, plural, one {# passendes benanntes Werk} other {# passende benannte Werke}}', {count: data.total});
  return <div className="wb-disposition-results">
    <h2>{t('disposition.result.heading', 'Documented stop combinations', 'Dokumentierte Registerkombinationen')}</h2>
    <p className="wb-disposition-count" role="status">{(scope === 'division' ? [divisionCount, accountCount, organCount] : [accountCount, organCount]).join(' · ')}</p>
    <ul className="wb-disposition-applied" aria-label={t('disposition.result.applied', 'Applied stop criteria', 'Angewandte Registerkriterien')}>
      {stop.map((criterion, index) => <li key={index}>{criterionLabel(criterion)}</li>)}
    </ul>
    {data.total === 0 ? <div className="wb-empty wb-no-results">
      <h3>{t('disposition.result.empty', 'No matching combinations', 'Keine passenden Kombinationen')}</h3>
      <p>{t('disposition.result.emptyHelp', 'Try a spelling found in the sources, leave a pitch open, or search within the same account.',
        'Versuchen Sie eine in den Quellen belegte Schreibweise, lassen Sie eine Fußtonlage offen oder erweitern Sie die Suche auf die gesamte Beschreibung.')}</p>
    </div> : <>
      {data.items.map(item => <AccountMatch key={item.id} item={item} criteria={stop}/>)}
      {(page > 0 || data.hasMore) && <nav className="wb-pagination" aria-label={t('disposition.result.pages', 'Disposition result pages', 'Ergebnisseiten der Dispositionssuche')}>
        <span>{data.items.length > 0
          ? t('disposition.result.range', '{start}–{end} of {total}', '{start}–{end} von {total}', {start: data.offset + 1, end: data.offset + data.items.length, total: data.total})
          : t('disposition.result.emptyPage', 'No results on this page', 'Keine Ergebnisse auf dieser Seite')}</span>
        <div>
          <button type="button" disabled={page <= 0} onClick={() => onPage(page - 1)}><ChevronLeft size={16} aria-hidden="true"/>{t('disposition.result.previous', 'Previous', 'Zurück')}</button>
          <button type="button" disabled={!data.hasMore} onClick={() => onPage(page + 1)}>{t('disposition.result.next', 'Next', 'Weiter')}<ChevronRight size={16} aria-hidden="true"/></button>
        </div>
      </nav>}
    </>}
    <details className="wb-context">
      <summary>{t('disposition.result.method', 'How to read this evidence', 'Hinweise zur Einordnung der Belege')}</summary>
      <p>{t('disposition.result.methodSummary', 'Each match assigns a different captured stop row to each criterion within the selected scope. Coverage varies by account. Source spelling, dates and proposed designs remain separately attributable.',
        'Jeder Treffer ordnet jedem Kriterium einen eigenen erfassten Registereintrag im gewählten Suchbereich zu. Der Erfassungsumfang variiert je nach Beschreibung. Schreibweisen, Datierungen und Entwürfe bleiben ihren Quellen zugeordnet.')}</p>
      <p>{t('disposition.result.selectionIdentity', 'Selection SHA-256', 'SHA-256 der Auswahl')} <code>{data.selectionSha256}</code></p>
    </details>
  </div>;
}

export function DispositionActions({data, params, exportLimit}: {data: DispositionResult; params: URLSearchParams; exportLimit?: number}) {
  const {t} = useUiLocale();
  const [busy, setBusy] = useState<'save' | 'download' | null>(null);
  const [feedback, setFeedback] = useState<{message: string; error?: boolean} | null>(null);
  const downloadRequest = useRef<AbortController | null>(null);
  const query = new URLSearchParams(params);
  const pageHref = `${WORKBENCH_PATH}?${query}`;
  query.delete('page');
  const selectionHref = `${WORKBENCH_PATH}?${query}`;
  query.delete('view');
  query.set('format', 'json');
  const canExport = exportLimit === undefined || data.total <= exportLimit;
  useEffect(() => () => downloadRequest.current?.abort(), []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(new URL(pageHref, location.origin).href);
      setFeedback({message: t('disposition.actions.copied', 'Research link copied.', 'Forschungslink kopiert.')});
    } catch {
      setFeedback({message: t('disposition.actions.copyError', 'Copy the pinned link from the browser address bar.', 'Kopieren Sie den Link aus der Adresszeile des Browsers.'), error: true});
    }
  }

  async function save() {
    setBusy('save');
    setFeedback(null);
    const title = t('disposition.actions.savedTitle', 'Stop combinations · {criteria}', 'Registerkombinationen · {criteria}',
      {criteria: data.filters.stop.map(criterionLabel).join(' / ')});
    try {
      const saved = await addViewToWorkspace({title, url: selectionHref, count: data.total,
        unit: data.filters.scope === 'division' ? t('disposition.actions.divisionUnit', 'named divisions', 'benannte Werke') : t('disposition.actions.accountUnit', 'configuration accounts', 'Dispositionsbeschreibungen')});
      setFeedback({message: saved.persisted
        ? t('disposition.actions.saved', 'Selection saved with its dataset and criteria.', 'Auswahl mit Datenstand und Kriterien gespeichert.')
        : t('disposition.actions.memoryOnly', 'Kept in the open workspace. Export the workspace to retain it beyond this session.',
          'Die Auswahl wurde im geöffneten Arbeitsbereich abgelegt. Exportieren Sie den Arbeitsbereich, um sie über diese Sitzung hinaus zu sichern.')});
    } catch (error) {
      setFeedback({message: t('disposition.actions.saveError', 'The selection could not be saved. {reason}', 'Die Auswahl konnte nicht gespeichert werden. {reason}',
        {reason: error instanceof Error ? error.message : ''}), error: true});
    } finally {
      setBusy(null);
    }
  }

  async function download() {
    const request = new AbortController();
    downloadRequest.current = request;
    setBusy('download');
    setFeedback(null);
    try {
      const response = await fetch(`${EXPORT_PATH}?${query}`, {signal: request.signal});
      if (response.status === 422) {
        setFeedback({message: t('disposition.actions.downloadNarrow', 'The selection exceeds the export limit. Add a pitch or refine the stop criteria.',
          'Die Auswahl überschreitet die Exportgrenze. Ergänzen Sie eine Fußtonlage oder präzisieren Sie die Registerkriterien.'), error: true});
        return;
      }
      if (!response.ok) throw new Error();
      const blob = await response.blob();
      if (request.signal.aborted) return;
      const href = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = href;
      link.download = 'modavis-disposition-selection.json';
      link.click();
      setTimeout(() => URL.revokeObjectURL(href), 1000);
      setFeedback({message: t('disposition.actions.downloaded', 'Complete selection downloaded.', 'Die vollständige Auswahl wurde heruntergeladen.')});
    } catch {
      if (!request.signal.aborted) setFeedback({message: t('disposition.actions.downloadError', 'The download failed. Retry the pinned selection.',
        'Der Download ist fehlgeschlagen. Rufen Sie die gebundene Auswahl erneut auf.'), error: true});
    } finally {
      if (!request.signal.aborted) setBusy(null);
      if (downloadRequest.current === request) downloadRequest.current = null;
    }
  }

  return <>
    <div className="wb-selection-actions wb-disposition-actions">
      <div>
        <button type="button" className="wb-link-action" onClick={() => void copy()}><LinkIcon size={16} aria-hidden="true"/>{t('disposition.actions.copy', 'Copy research link', 'Forschungslink kopieren')}</button>
        <a href={pageHref}>{t('disposition.actions.pinned', 'Pinned selection URL', 'Link zur gebundenen Auswahl')}</a>
      </div>
      <div>
        <button type="button" disabled={busy !== null} aria-busy={busy === 'save' || undefined} onClick={() => void save()}><Bookmark size={16} aria-hidden="true"/>
          {busy === 'save' ? t('disposition.actions.saving', 'Saving…', 'Wird gespeichert …') : t('disposition.actions.save', 'Save selection', 'Auswahl speichern')}
        </button>
        {canExport && <button type="button" disabled={busy !== null} aria-busy={busy === 'download' || undefined} onClick={() => void download()}><Download size={16} aria-hidden="true"/>
          {busy === 'download' ? t('disposition.actions.downloading', 'Preparing download…', 'Download wird vorbereitet …')
            : t('disposition.actions.download', 'Download complete selection · JSON', 'Vollständige Auswahl herunterladen · JSON')}
        </button>}
      </div>
    </div>
    {!canExport && <p>{t('disposition.actions.exportLimit', 'Narrow the selection to {limit, number} results to download it.',
      'Grenzen Sie die Auswahl für den Download auf {limit, number} Ergebnisse ein.', {limit: exportLimit})}</p>}
    {feedback && <p role={feedback.error ? 'alert' : 'status'} className="wb-feedback">{feedback.message}</p>}
  </>;
}
