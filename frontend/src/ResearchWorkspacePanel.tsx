import {useEffect, useRef, useState} from 'react';
import {createPortal} from 'react-dom';
import {ArrowDownToLine, ArrowUpFromLine, Bookmark, Check, ChevronRight, FolderOpen, GitCompareArrows, Plus, Trash2, X} from 'lucide-react';
import {accountComparisonUrl, bindWorkspaceDataset, createReferenceWorkspace, createWorkspace, keepAccount, keepRecord, MAX_WORKSPACE_BYTES, organComparisonUrl, parseWorkspace, readWorkspace, retainView, ResearchWorkspaceState, validateWorkspace, WORKSPACE_EVENT, WorkspaceAccount, WorkspaceRecord, WorkspaceView, NewWorkspaceView, writeWorkspace} from './researchWorkspace';
import {resolveVocabularyWorkspaceView, vocabularyEvidenceHref} from './vocabularyWorkspace';
import {useUiLocale, type UiLocale, type UiText} from './uiLocale';
import {workbenchResultCount} from './workbenchLabels';
import './researchWorkspace.css';

type Binding = {publicCoreSha256: string; occurrenceAssessmentSha256?: string; sourceReleaseVersion?: string};
type ViewSaveResult = {saved: true; persisted: boolean; message: string};
type ViewSaveRequest = {view: NewWorkspaceView; resolve: (result: ViewSaveResult) => void; reject: (error: Error) => void};
type WorkspaceNotice = [...Parameters<UiText>, englishDiagnostic?: string];
const message = (id: string, en: string, de: string, values?: WorkspaceNotice[3]): WorkspaceNotice =>
  ['workspace.' + id, en, de, values];
const memoryOnlyMessage = message('storage.memoryOnly',
  'Kept in this open workspace. Browser storage is unavailable; export the workspace file to retain your work.',
  'Die Änderung ist im geöffneten Arbeitsbereich verfügbar. Der Browserspeicher ist nicht verfügbar. Exportieren Sie die Arbeitsbereichsdatei, um Ihre Arbeit zu sichern.');
const unreadable = message('storage.unreadableBeforeWrite',
  'The existing browser workspace could not be read. Import a verified file or explicitly start a new workspace before replacing it.',
  'Der vorhandene Arbeitsbereich im Browser konnte nicht gelesen werden. Importieren Sie eine geprüfte Datei oder starten Sie ausdrücklich einen neuen Arbeitsbereich, bevor Sie ihn ersetzen.');
const loadingSnapshot = message('snapshot.loading', 'The research snapshot is still loading.', 'Der Datenstand für die Recherche wird noch geladen.');
const updateFailed = message('update.failed', 'The workspace could not be updated.', 'Der Arbeitsbereich konnte nicht aktualisiert werden. Prüfen Sie Ihre Eingaben und den Datenstand.');
const saveFailed = message('view.failed', 'The view could not be saved.', 'Die Ansicht konnte nicht gespeichert werden. Prüfen Sie den Link und die angeforderte Version.');

class WorkspaceActionError extends Error {
  constructor(readonly notice: WorkspaceNotice) { super(notice[4] || notice[1]); }
}

function errorNotice(error: unknown, fallback: WorkspaceNotice): WorkspaceNotice {
  if (error instanceof WorkspaceActionError) return error.notice;
  return error instanceof Error
    ? [fallback[0], fallback[1], fallback[2], fallback[3], error.message]
    : fallback;
}

function noticeText(notice: WorkspaceNotice, {t, locale}: {t: UiText; locale: UiLocale}): string {
  const [id, english, german, values, diagnostic] = notice;
  return locale === 'en' && diagnostic ? diagnostic : t(id, english, german, values);
}

function persistenceNotice(persisted: boolean, success: WorkspaceNotice): WorkspaceNotice {
  return persisted ? success : memoryOnlyMessage;
}

export function workspacePersistenceMessage(persisted: boolean, success: string): string {
  return persisted ? success : memoryOnlyMessage[1];
}

/** A failed browser write must preserve the open copy without claiming durability. */
export function persistWorkspaceSnapshot(value: ResearchWorkspaceState, update: (value: ResearchWorkspaceState) => void,
  write: (value: ResearchWorkspaceState) => unknown = writeWorkspace, origin = location.origin): boolean {
  const verified = validateWorkspace(value, origin);
  update(verified);
  try { write(verified); return true; } catch { return false; }
}

export function sameWorkspaceLocation(left: string, right: string): boolean {
  const a = new URL(left, 'https://navigator.modavis.org'), b = new URL(right, 'https://navigator.modavis.org');
  a.searchParams.sort(); b.searchParams.sort();
  return a.origin === b.origin && a.pathname === b.pathname && a.search === b.search && a.hash === b.hash;
}

const resourceKind = {
  controlled: ['Controlled vocabulary', 'Kontrolliertes Vokabular'],
  candidate: ['Candidate terminology', 'Terminologievorschläge'],
  published: ['Published reference', 'Veröffentlichte Referenz'],
  omaro: ['OMARO reference', 'OMARO-Referenz'],
} as const;
const recordKinds: Record<string, [string, string]> = {
  organ: ['organ', 'Orgel'], person: ['person', 'Person'], organization: ['organization', 'Organisation'],
  actor: ['actor', 'Akteur'], place: ['place', 'Ort'], event: ['event', 'Ereignis'],
  literature: ['literature', 'Literatur'], score: ['score', 'Noten'], temperament: ['temperament', 'Stimmungssystem'],
  virtual_instrument: ['virtual instrument', 'Virtuelles Instrument'],
};

export function WorkspaceSavedView({view, podMatches, onRemove}: {view: WorkspaceView; podMatches: boolean; onRemove: () => void}) {
  const {t, intlLocale} = useUiLocale();
  const binding = view.binding;
  const canOpen = Boolean(binding) || podMatches;
  const evidence = vocabularyEvidenceHref(view);
  const savedAt = new Date(view.savedAt).toLocaleDateString(intlLocale);
  const saved = view.count === undefined
    ? t('workspace.view.savedDate', 'Saved {date}', 'Gespeichert am {date}', {date: savedAt})
    : t('workspace.view.savedCountDate', '{count} · Saved {date}', '{count} · Gespeichert am {date}',
      {count: workbenchResultCount(view.count, view.unit || 'results', t), date: savedAt});
  return <article className={binding ? 'rw-bound-view' : undefined}><div>
    {binding && <span className="rw-kind">{t(`workspace.resource.${binding.kind}`, resourceKind[binding.kind][0], resourceKind[binding.kind][1])}</span>}
    {canOpen ? <a href={view.url}>{view.title}<ChevronRight size={16} aria-hidden="true"/></a> : <strong>{view.title}</strong>}
    {binding && <small className="rw-resource-context">{t('workspace.resource.context', '{collection} · {version}', '{collection} · {version}', {
      collection: binding.collectionTitle,
      version: binding.version || t('workspace.resource.snapshotShort', 'Snapshot {hash}', 'Datenstand {hash}', {hash: binding.snapshot.slice(0, 12)}),
    })}</small>}
    <small>{saved}</small>
    {binding && <details className="rw-resource-binding">
      <summary>{t('workspace.resource.binding', 'Exact reference and version binding', 'Referenz und genaue Versionsbindung')}</summary>
      <dl>
        <div><dt>{t('workspace.resource.collection', 'Collection', 'Sammlung')}</dt><dd><code>{binding.collection}</code></dd></div>
        {binding.resource && <div><dt>{t('workspace.resource.identifier', 'Term or resource', 'Begriff oder Ressource')}</dt><dd><code>{binding.resource}</code></dd></div>}
        <div><dt>{binding.kind === 'published'
          ? t('workspace.resource.turtleHash', 'Source Turtle SHA-256', 'SHA-256 der Turtle-Quelldatei')
          : t('workspace.resource.snapshotHash', 'Snapshot SHA-256', 'SHA-256 des Datenstands')}</dt><dd><code>{binding.snapshot}</code></dd></div>
        {binding.kind === 'candidate' && <>
          <div><dt>{t('workspace.resource.coreHash', 'Mapped POD public core', 'Zugeordneter öffentlicher POD-Kerndatensatz')}</dt><dd><code>{binding.publicCoreSha256}</code></dd></div>
          <div><dt>{t('workspace.resource.indexHash', 'Occurrence index', 'Vorkommensindex')}</dt><dd><code>{binding.researchIndexSha256}</code></dd></div>
        </>}
      </dl>
      <p>{t('workspace.resource.reopen', 'Reopens the retained collection and filters. If this version is unavailable, the reader keeps the requested link and explains the mismatch.',
        'Öffnet die gespeicherte Sammlung mit den zugehörigen Filtern. Ist diese Version nicht verfügbar, bleibt der angeforderte Link erhalten und die Ansicht erläutert die Abweichung.')}</p>
      {evidence && <a className="rw-reference-evidence" href={evidence}>{t('workspace.resource.evidence', 'Evidence JSON', 'Belege als JSON')}</a>}
    </details>}
  </div><button className="rw-icon" aria-label={t('workspace.view.remove', 'Remove saved view {title}', 'Gespeicherte Ansicht {title} entfernen', {title: view.title})} onClick={onRemove}><Trash2 size={15} aria-hidden="true"/></button></article>;
}


function downloadWorkspace(state: ResearchWorkspaceState) {
  const blob = new Blob([JSON.stringify(validateWorkspace(state, location.origin), null, 2) + '\n'], {type: 'application/json'});
  const link = document.createElement('a'), url = URL.createObjectURL(blob);
  link.href = url; link.download = 'modavis-research-workspace.json'; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function WorkspaceTabs({tab,counts,onChange}: {tab:'views'|'records'|'accounts';counts:{views:number;records:number;accounts:number};onChange:(tab:'views'|'records'|'accounts')=>void}) {
  const {t, formatNumber} = useUiLocale();
  const labels = {views: ['Saved views', 'Gespeicherte Ansichten'], records: ['Records', 'Datensätze'], accounts: ['Accounts', 'Quellenbeschreibungen']} as const;
  return <nav className="rw-tabs" aria-label={t('workspace.tabs.label', 'Retained workspace items', 'Gespeicherte Einträge im Arbeitsbereich')}>{(['views','records','accounts'] as const).map(name=><button type="button" key={name} aria-pressed={tab===name} aria-controls={tab===name?'rw-'+name:undefined} onClick={()=>onChange(name)}><span>{t(`workspace.tabs.${name}`, labels[name][0], labels[name][1])}</span><b>{formatNumber(counts[name])}</b></button>)}</nav>;
}

export function ResearchWorkspace({mobileAnchor = null}: {mobileAnchor?: HTMLElement | null} = {}) {
  const {t, locale, formatNumber} = useUiLocale();
  const presentation = {t, locale};
  const translator = useRef(presentation);
  translator.current = presentation;
  const [state, setState] = useState<ResearchWorkspaceState | null>(null);
  const [binding, setBinding] = useState<Binding | null>(null);
  const [undo, setUndo] = useState<ResearchWorkspaceState | null>(null);
  const [open, setOpen] = useState(false), [notice, setNotice] = useState<WorkspaceNotice | null>(null), [bindingError, setBindingError] = useState<WorkspaceNotice | null>(null);
  const [saving, setSaving] = useState(false), [memoryOnly, setMemoryOnly] = useState(false);
  const memoryOnlyRef = useRef(false), unreadableRef = useRef(false), saveRequest = useRef<AbortController | null>(null);
  const [tab, setTab] = useState<'views' | 'records' | 'accounts'>('views');
  const closeRef = useRef<HTMLButtonElement>(null), dialogRef = useRef<HTMLDivElement>(null), importRef = useRef<HTMLInputElement>(null), previousFocus = useRef<HTMLElement | null>(null);
  const stateRef = useRef(state), bindingRef = useRef(binding), bindingErrorRef = useRef(bindingError);
  stateRef.current = state; bindingRef.current = binding; bindingErrorRef.current = bindingError;
  const matching = !!(state?.snapshot && binding && state.snapshot === binding.publicCoreSha256 && state.assessment === binding.occurrenceAssessmentSha256);

  function persist(value: ResearchWorkspaceState): boolean {
    if (unreadableRef.current) throw new WorkspaceActionError(unreadable);
    memoryOnlyRef.current = false;
    const persisted = persistWorkspaceSnapshot(value, verified => {
      stateRef.current = verified; setState(verified);
    }, writeWorkspace, location.origin);
    memoryOnlyRef.current = !persisted; setMemoryOnly(!persisted);
    return persisted;
  }
  function show() { previousFocus.current = document.activeElement as HTMLElement; setOpen(true); }
  function close() { setOpen(false); requestAnimationFrame(() => previousFocus.current?.focus()); }
  function current(independent = false) {
    if (unreadableRef.current) throw new WorkspaceActionError(unreadable);
    const saved = stateRef.current;
    if (independent) return saved || createReferenceWorkspace();
    const active = bindingRef.current;
    if (!active) throw new WorkspaceActionError(bindingErrorRef.current || loadingSnapshot);
    return saved ? bindWorkspaceDataset(saved, active.publicCoreSha256, active.occurrenceAssessmentSha256)
      : createWorkspace(active.publicCoreSha256, active.occurrenceAssessmentSha256);
  }
  function retainResolvedView(view: NewWorkspaceView) {
    const persisted = persist(retainView(current(Boolean(view.binding)), view, location.origin));
    const directory = /^\/vocab\/?$/.test(new URL(view.url, location.origin).pathname);
    const success = directory
      ? message('view.directorySaved', 'Vocabulary directory bookmark saved. Open a collection to retain its exact evidence and version.',
        'Das Lesezeichen zur Vokabularübersicht wurde gespeichert. Öffnen Sie eine Sammlung, um ihre Belege und die genaue Version zu speichern.')
      : view.binding
        ? message('view.referenceSaved',
          'Saved “{title}” with {collection}{hasVersion, select, yes {, version {version}} other {}}. Its filters and evidence link are retained.',
          '„{title}“ wurde mit {collection}{hasVersion, select, yes {, Version {version}} other {}} gespeichert. Die Filter und der Link zu den Belegen bleiben erhalten.',
          {title: view.title, collection: view.binding.collectionTitle, hasVersion: view.binding.version ? 'yes' : 'no', version: view.binding.version || ''})
        : message('view.podSaved', 'Saved “{title}” with its exact POD dataset. Its filters and evidence link are retained.',
          '„{title}“ wurde mit dem genauen POD-Datenstand gespeichert. Die Filter und der Link zu den Belegen bleiben erhalten.', {title: view.title});
    return {persisted, notice: persistenceNotice(persisted, success)};
  }
  function safely(action: () => void) { try { action(); } catch (error) { setNotice(errorNotice(error, updateFailed)); } }

  useEffect(() => {
    try { const saved = readWorkspace(); stateRef.current = saved; setState(saved); }
    catch {
      unreadableRef.current = true;
      setNotice(message('storage.unreadable', 'The saved workspace is unreadable. Import a verified workspace file or start a new workspace.',
        'Der gespeicherte Arbeitsbereich konnte nicht gelesen werden. Importieren Sie eine geprüfte Arbeitsbereichsdatei oder starten Sie einen neuen Arbeitsbereich.'));
    }
    let disposed = false;
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 10000);
    const snapshotUnavailable = message('snapshot.unavailable', 'A verified research snapshot is unavailable.', 'Ein geprüfter Datenstand für die Recherche ist nicht verfügbar.');
    fetch('/api/workbench/context', {signal: controller.signal, cache: 'no-store'})
      .then(async response => { const data = await response.json(); if (!response.ok) throw new Error(data.error || 'A verified research snapshot is unavailable.'); return data; })
      .then(data => { if (!disposed) { setBinding(data); setBindingError(null); } })
      .catch(error => {
        if (disposed) return;
        setBindingError(controller.signal.aborted
          ? message('snapshot.timeout', 'The research snapshot could not be reached. Reload the page to retry.',
            'Der Datenstand für die Recherche war nicht erreichbar. Laden Sie die Seite neu, um es erneut zu versuchen.')
          : errorNotice(error, snapshotUnavailable));
      }).finally(() => clearTimeout(timer));
    const changed = () => {
      if (memoryOnlyRef.current) {
        setNotice(message('storage.unsavedBeforeReload', 'The open workspace contains changes that could not be stored. Export it before loading another browser copy.',
          'Der geöffnete Arbeitsbereich enthält Änderungen, die nicht gespeichert werden konnten. Exportieren Sie ihn, bevor Sie eine andere Kopie aus dem Browser laden.'));
        return;
      }
      try { const saved = readWorkspace(); stateRef.current = saved; setState(saved); }
      catch {
        unreadableRef.current = true;
        setNotice(message('storage.readFailed', 'The workspace could not be read. Export your current work before closing.',
          'Der Arbeitsbereich konnte nicht gelesen werden. Exportieren Sie Ihre aktuelle Arbeit vor dem Schließen.'));
      }
    };
    const opened = () => show();
    const record = (event: Event) => { show(); safely(() => { const value = (event as CustomEvent).detail as WorkspaceRecord; if (value.kind === 'view') { const result = retainResolvedView({title:value.title, url:value.url}); setTab('views'); setNotice(result.notice); } else { const persisted = persist(keepRecord(current(), value, location.origin)); setTab('records'); setNotice(persistenceNotice(persisted, message('record.saved', 'Record retained with this dataset snapshot.', 'Der Datensatz wurde mit diesem Datenstand gespeichert.'))); } }); };
    const account = (event: Event) => { show(); setTab('accounts'); safely(() => { const value = (event as CustomEvent).detail as WorkspaceAccount; const persisted = persist(keepAccount(current(), value, location.origin)); setNotice(persistenceNotice(persisted, message('account.saved', 'Source account and exact revision retained.', 'Die Quellenbeschreibung wurde mit ihrer genauen Version gespeichert.'))); }); };
    const view = (event: Event) => {
      const request = (event as CustomEvent<ViewSaveRequest>).detail;
      if (!request || typeof request.resolve !== 'function' || typeof request.reject !== 'function') return;
      event.preventDefault();
      try {
        const result = retainResolvedView(request.view);
        setTab('views'); setNotice(result.notice);
        request.resolve({saved: true, persisted: result.persisted, message: noticeText(result.notice, translator.current)});
      }
      catch (error) {
        request.reject(new Error(noticeText(errorNotice(error,
          message('view.termFailed', 'The term could not be retained.', 'Der Eintrag konnte nicht gespeichert werden. Prüfen Sie den Link und die angeforderte Version.')), translator.current)));
      }
    };
    window.addEventListener(WORKSPACE_EVENT, changed); window.addEventListener('storage', changed); window.addEventListener('modavis:workspace-open', opened); window.addEventListener('modavis:workspace-add', record); window.addEventListener('modavis:workspace-account', account); window.addEventListener('modavis:workspace-view', view);
    return () => { disposed = true; controller.abort(); clearTimeout(timer); window.removeEventListener(WORKSPACE_EVENT, changed); window.removeEventListener('storage', changed); window.removeEventListener('modavis:workspace-open', opened); window.removeEventListener('modavis:workspace-add', record); window.removeEventListener('modavis:workspace-account', account); window.removeEventListener('modavis:workspace-view', view); saveRequest.current?.abort(); };
  }, []);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden'; closeRef.current?.focus();
    const keys = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); close(); }
      if (event.key !== 'Tab') return;
      const items = [...(dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not([type="hidden"]):not(:disabled),select:not(:disabled),summary,[tabindex="0"]') || [])].filter(item => item.getClientRects().length);
      const first = items[0], last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', keys);
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener('keydown', keys); };
  }, [open]);

  async function saveView() {
    if (saveRequest.current) return;
    const controller = new AbortController(); saveRequest.current = controller; setSaving(true);
    const url = location.pathname + location.search + location.hash;
    try {
      const vocabulary = /^\/vocab(?:\/|$)/.test(location.pathname);
      const directory = /^\/vocab\/?$/.test(location.pathname);
      let capture = vocabulary && !directory
        ? document.querySelector('[data-vocabulary-workspace-url]')?.getAttribute('data-vocabulary-workspace-url') : url;
      if (!capture) throw new WorkspaceActionError(message('view.evidencePending',
        'This vocabulary view has not loaded verified evidence. Wait for the record to load or repair its requested version before saving.',
        'Für diese Vokabularansicht sind noch keine geprüften Belege geladen. Warten Sie, bis der Datensatz geladen ist, oder korrigieren Sie die angeforderte Version vor dem Speichern.'));
      if(vocabulary&&!directory){const exact=new URL(capture,location.origin);exact.hash=location.hash;capture=exact.pathname+exact.search+exact.hash;}
      const view = vocabulary ? await resolveVocabularyWorkspaceView(capture, controller.signal)
        : {title: document.title.replace(/\s*\|\s*MODAVIS Navigator$/, ''), url};
      if (controller.signal.aborted) return;
      const currentUrl = location.pathname + location.search + location.hash;
      if (!sameWorkspaceLocation(url, currentUrl) && !sameWorkspaceLocation(capture, currentUrl) && !sameWorkspaceLocation(view.url, currentUrl)) throw new WorkspaceActionError(message('view.changed',
        'The page changed before it could be saved. Save the current view again.',
        'Die Seite hat sich vor dem Speichern geändert. Speichern Sie die aktuelle Ansicht erneut.'));
      const result = retainResolvedView(view); setTab('views'); setNotice(result.notice);
    } catch (error) { if (!controller.signal.aborted) setNotice(errorNotice(error, saveFailed)); }
    finally { if (saveRequest.current === controller) { saveRequest.current = null; setSaving(false); } }
  }
  function keepCurrentOrgan() { safely(() => { const match = location.pathname.match(/^\/organs\/([^/]+)\/?$/); if (!match) throw new WorkspaceActionError(message('record.openOrganFirst', 'Open an organ record first, then retain it here.', 'Öffnen Sie zuerst einen Orgeldatensatz, um ihn hier zu speichern.')); const id = decodeURIComponent(match[1]); const persisted = persist(keepRecord(current(), {kind: 'organ', id: id.startsWith('MDVS:') ? id : 'MDVS:ENTY:' + id, title: document.querySelector('.organ-hero h1,.organ-hero h2')?.textContent || document.title.split(' — ')[0], url: location.pathname}, location.origin)); setTab('records'); setNotice(persistenceNotice(persisted, message('record.organSaved', 'Organ retained for comparison.', 'Die Orgel wurde für den Vergleich gespeichert.'))); }); }
  function remove(kind: 'views' | 'records' | 'accounts', id: string, recordKind?: string) { if (state) { setUndo(state); const persisted = persist({...state, [kind]: state[kind].filter(item => item.id !== id || (kind === 'records' && (item as WorkspaceRecord).kind !== recordKind)), updatedAt: new Date().toISOString()}); setNotice(persistenceNotice(persisted, message('item.removed', 'Item removed. Undo is available until the next replacement.', 'Der Eintrag wurde entfernt. Sie können dies rückgängig machen, bis der Arbeitsbereich erneut ersetzt wird.'))); } }
  function openComparison(kind: 'accounts' | 'organs') { safely(() => { const active = current(), url = kind === 'accounts' ? accountComparisonUrl(active) : organComparisonUrl(active); location.assign(url); }); }
  async function importFile(file?: File) {
    if (!file) return;
    if (file.size > MAX_WORKSPACE_BYTES) {
      setNotice(message('import.tooLarge', 'Workspace file exceeds 128 KiB.', 'Die Arbeitsbereichsdatei ist größer als 128 KiB.'));
      return;
    }
    try {
      const imported = parseWorkspace(await file.text(), location.origin);
      setUndo(stateRef.current); unreadableRef.current = false;
      const persisted = persist(imported);
      const success = !imported.snapshot
        ? message('import.references', 'Workspace imported. Independent vocabulary versions are retained; no POD dataset is attached.',
          'Der Arbeitsbereich wurde importiert. Er enthält die eigenständigen Vokabularversionen und ist ohne Bindung an einen POD-Datenstand.')
        : imported.snapshot === binding?.publicCoreSha256 && imported.assessment === binding?.occurrenceAssessmentSha256
          ? message('import.current', 'Workspace imported. Its exact dataset, account revisions and independent vocabulary bindings are retained.',
            'Der Arbeitsbereich wurde importiert. Der genaue Datenstand, die Versionen der Quellenbeschreibungen und die eigenständigen Vokabularbindungen bleiben erhalten.')
          : message('import.otherSnapshot', 'Workspace imported from another POD snapshot. POD links stay locked; separately pinned vocabulary references can still be reopened.',
            'Der Arbeitsbereich aus einem anderen POD-Datenstand wurde importiert. Die POD-Links bleiben gesperrt. Vokabularreferenzen mit eigener Versionsbindung lassen sich weiterhin öffnen.');
      setNotice(persistenceNotice(persisted, success));
    } catch (error) {
      setNotice(errorNotice(error, message('import.failed', 'Workspace import failed.', 'Der Arbeitsbereich konnte nicht importiert werden. Prüfen Sie, ob die Datei ein gültiger Navigator-Arbeitsbereich ist.')));
    }
    if (importRef.current) importRef.current.value = '';
  }

  const organCount = state?.records.filter(record => record.kind === 'organ').length || 0;
  const accountCount = state?.accounts.length || 0;
  const currentOrgan = /^\/organs\/[^/]+\/?$/.test(location.pathname);
  const canSavePod = !!binding && (!state?.snapshot || matching);
  const vocabularyPage = /^\/vocab(?:\/|$)/.test(location.pathname);
  const canSave = !saving && (vocabularyPage || canSavePod);
  const title = t('workspace.title', 'Research workspace', 'Recherche-Arbeitsbereich');
  const status = !state?.snapshot
    ? t('workspace.snapshot.referencesOnly', 'References only', 'Nur Referenzen')
    : matching
      ? t('workspace.snapshot.current', 'Current POD dataset', 'Aktueller POD-Datenstand')
      : !binding && !bindingError
        ? t('workspace.snapshot.checking', 'Checking dataset…', 'Datenstand wird geprüft …')
        : t('workspace.snapshot.retained', 'Retained POD snapshot', 'Gespeicherter POD-Datenstand');
  const captureHint = vocabularyPage
    ? /^\/vocab\/?$/.test(location.pathname)
      ? t('workspace.capture.directory', 'Saves a navigation bookmark. Open a collection to retain its exact evidence and version.',
        'Speichert ein Lesezeichen zur Navigation. Öffnen Sie eine Sammlung, um ihre Belege und die genaue Version zu speichern.')
      : t('workspace.capture.reference', 'Retains the displayed collection’s own version, selected term, filters and evidence link.',
        'Speichert die Version der angezeigten Sammlung, den ausgewählten Eintrag, die Filter und den Link zu den Belegen.')
    : t('workspace.capture.pod', 'Includes this view’s filters and POD dataset snapshot.',
      'Speichert die Filter dieser Ansicht und den zugehörigen POD-Datenstand.');
  return <>
    {mobileAnchor && createPortal(<button type="button" className="rw-launcher" onClick={show} aria-label={title} title={title} aria-haspopup="dialog" aria-expanded={open}>
      <FolderOpen size={18} aria-hidden="true"/>
      <span className="rw-launcher-short">{t('workspace.shortTitle', 'Workspace', 'Arbeitsbereich')}</span>
      {state && <b aria-hidden="true">{formatNumber(state.views.length + state.records.length + state.accounts.length)}</b>}
    </button>, mobileAnchor)}
    {open && <div className="rw-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) close(); }}>
      <div className="rw-panel" role="dialog" aria-modal="true" aria-labelledby="rw-title" aria-describedby="rw-description" ref={dialogRef}>
        <header className="rw-header">
          <div>
            <p>{memoryOnly
              ? t('workspace.storage.openCopy', 'Open workspace copy', 'Geöffnete Arbeitskopie')
              : t('workspace.storage.browser', 'Saved in this browser', 'In diesem Browser gespeichert')}</p>
            <h2 id="rw-title">{title}</h2>
          </div>
          <button ref={closeRef} className="rw-icon" onClick={close} aria-label={t('workspace.close', 'Close research workspace', 'Recherche-Arbeitsbereich schließen')}><X size={20}/></button>
        </header>
        <div className="rw-body">
          <p id="rw-description" className="rw-intro">{t('workspace.intro',
            'Keep a question, collect its evidence, return to its exact dataset and reference versions.',
            'Halten Sie eine Fragestellung fest, sammeln Sie die zugehörigen Belege und kehren Sie zu den genauen Daten- und Referenzversionen zurück.')}</p>
          {bindingError && <p className="rw-notice rw-warning" role="status">{noticeText(bindingError, presentation)}</p>}
          {state && <details className="rw-identity">
            <summary>
              <span><strong>{state.name}</strong><small>{t('workspace.identity', 'Name and version bindings', 'Name und Versionsbindungen')}</small></span>
              <span className={!state.snapshot || matching ? 'rw-snapshot' : 'rw-snapshot rw-stale'}>{matching && <Check size={13} aria-hidden="true"/>}{status}</span>
            </summary>
            <div className="rw-settings-fields">
              <label>{t('workspace.name', 'Workspace name', 'Name des Arbeitsbereichs')}
                <input value={state.name} maxLength={100} onChange={event => setState({...state, name: event.target.value})} onBlur={() => safely(() => persist(validateWorkspace(state, location.origin)))}/>
              </label>
              {state.snapshot
                ? <p>{t('workspace.snapshot.pod', 'POD dataset snapshot', 'POD-Datenstand')} <code>{state.snapshot}</code></p>
                : <p>{t('workspace.snapshot.none', 'No POD dataset is attached. Saved vocabulary references retain their own exact collection versions.',
                  'Dieser Arbeitsbereich ist ohne Bindung an einen POD-Datenstand. Gespeicherte Vokabularreferenzen behalten die genauen Versionen ihrer Sammlungen.')}</p>}
              {state.assessment && <p>{t('workspace.snapshot.assessment', 'Assessment snapshot', 'Stand der Zuordnungsbewertung')} <code>{state.assessment}</code></p>}
            </div>
          </details>}
          {state?.snapshot && binding && !matching && <p className="rw-notice rw-warning" role="alert">{t('workspace.snapshot.mismatch',
            'The POD records and accounts belong to another dataset or assessment snapshot. Export them before explicitly starting a workspace for the current dataset. Separately pinned vocabulary references can still be reopened; their versions are preserved.',
            'Die POD-Datensätze und Quellenbeschreibungen gehören zu einem anderen Datenstand oder Stand der Zuordnungsbewertung. Exportieren Sie sie, bevor Sie einen Arbeitsbereich für den aktuellen Datenstand starten. Vokabularreferenzen mit eigener Versionsbindung lassen sich in ihrer gespeicherten Version weiterhin öffnen.')}</p>}
          {memoryOnly && <p className="rw-notice rw-warning" role="alert">{noticeText(memoryOnlyMessage, presentation)}</p>}
          <div className="rw-capture">
            <span className="rw-kicker">{t('workspace.capture.page', 'Current page', 'Aktuelle Seite')}</span>
            <p title={document.title}>{document.title.replace(/\s*\|\s*MODAVIS Navigator$/, '')}</p>
            <div className="rw-actions">
              <button className="rw-save" onClick={saveView} disabled={!canSave}><Bookmark size={16} aria-hidden="true"/>{saving
                ? t('workspace.capture.saving', 'Saving exact view…', 'Ansicht und Versionsbindung werden gespeichert …')
                : t('workspace.capture.save', 'Save current view', 'Aktuelle Ansicht speichern')}</button>
              {currentOrgan && <button onClick={keepCurrentOrgan} disabled={!canSavePod}><Plus size={16} aria-hidden="true"/>{t('workspace.capture.organ', 'Keep this organ', 'Diese Orgel speichern')}</button>}
            </div>
            <small>{captureHint}</small>
          </div>
          {notice && (!memoryOnly || notice !== memoryOnlyMessage) && <p className="rw-notice" role="status">{noticeText(notice, presentation)}</p>}
          {undo && <button className="rw-undo" onClick={() => safely(() => {
            const persisted = persist(undo); setUndo(null);
            setNotice(persistenceNotice(persisted, message('undo.restored', 'Previous workspace restored.', 'Der vorherige Arbeitsbereich wurde wiederhergestellt.')));
          })}>{t('workspace.undo', 'Undo last removal or replacement', 'Letztes Entfernen oder Ersetzen rückgängig machen')}</button>}
          <WorkspaceTabs tab={tab} counts={{views:state?.views.length||0,records:state?.records.length||0,accounts:accountCount}} onChange={setTab}/>
          {tab === 'views' && <section id="rw-views" className="rw-items" aria-label={t('workspace.views.aria', 'Saved research views', 'Gespeicherte Rechercheansichten')}>
            <div className="rw-list-heading">
              <span>{t('workspace.views.title', 'Exact views, terms and filters', 'Ansichten, Begriffe und Filter mit Versionsbindung')}</span>
              <small>{t('workspace.views.count', '{count, number} / 20 saved', '{count, number} von 20 gespeichert', {count: state?.views.length || 0})}</small>
            </div>
            {!state?.views.length && <div className="rw-empty">
              <span className="rw-empty-icon"><Bookmark size={24} aria-hidden="true"/></span>
              <h3>{t('workspace.views.empty', 'Keep your next research question', 'Eine Rechercheansicht festhalten')}</h3>
              <p>{t('workspace.views.help', 'Apply filters or open a record, then save the current view above. Its link brings you back to the same evidence.',
                'Setzen Sie Filter oder öffnen Sie einen Datensatz und speichern Sie die aktuelle Ansicht oben. Der gespeicherte Link führt zu denselben Belegen zurück.')}</p>
            </div>}
            {state?.views.map(view => <WorkspaceSavedView key={view.id} view={view} podMatches={matching} onRemove={() => remove('views', view.id)}/>)}
          </section>}
          {tab === 'records' && <section id="rw-records" className="rw-items" aria-label={t('workspace.records.aria', 'Retained public records', 'Gespeicherte öffentliche Datensätze')}>
            <div className="rw-list-heading">
              <span>{t('workspace.records.title', 'Public records', 'Öffentliche Datensätze')}</span>
              <small>{t('workspace.records.count', '{count, number} / 4 organs', '{count, number} von 4 Orgeln', {count: organCount})}</small>
            </div>
            {!state?.records.length && <div className="rw-empty">
              <span className="rw-empty-icon"><FolderOpen size={24} aria-hidden="true"/></span>
              <h3>{t('workspace.records.empty', 'Collect records worth comparing', 'Datensätze für den Vergleich sammeln')}</h3>
              <p>{t('workspace.records.help', 'Open an organ and keep it here. Choose two to four organs to compare their documented source coverage.',
                'Öffnen Sie einen Orgeldatensatz und speichern Sie ihn hier. Vergleichen Sie die Quellenabdeckung von zwei bis vier Orgeln.')}</p>
              <a className="rw-browse" href="/organs">{t('workspace.records.browse', 'Browse the organ catalogue', 'Orgelkatalog durchsuchen')}<ChevronRight size={15} aria-hidden="true"/></a>
            </div>}
            {state?.records.map(record => {
              const kind = recordKinds[record.kind];
              return <article key={record.kind + ':' + record.id}>
                <div><span className="rw-kind">{kind ? t('workspace.record.kind.' + record.kind, kind[0], kind[1]) : record.kind}</span>
                  {matching ? <a href={record.url}>{record.title}<ChevronRight size={16} aria-hidden="true"/></a> : <strong>{record.title}</strong>}<code>{record.id}</code>
                </div>
                <button className="rw-icon" aria-label={t('workspace.record.remove', 'Remove retained record {title}', 'Gespeicherten Datensatz {title} entfernen', {title: record.title})} onClick={() => remove('records', record.id, record.kind)}><Trash2 size={15} aria-hidden="true"/></button>
              </article>;
            })}
            <div className="rw-comparison">
              <div><strong>{organCount >= 2
                ? t('workspace.records.ready', '{count, number} organs ready to compare', '{count, number} Orgeln stehen zum Vergleich bereit', {count: organCount})
                : t('workspace.records.required', '{count, plural, one {# more organ needed} other {# more organs needed}}',
                  '{count, plural, one {Noch # Orgel erforderlich} other {Noch # Orgeln erforderlich}}', {count: 2 - organCount})}</strong>
                <small>{t('workspace.records.compareScope', 'Compare source coverage and configuration accounts.', 'Quellenabdeckung und Dispositionsbeschreibungen vergleichen.')}</small>
              </div>
              <button className="rw-primary" disabled={!matching || organCount < 2} onClick={() => openComparison('organs')}><GitCompareArrows size={16} aria-hidden="true"/>{t('workspace.records.compare', 'Compare retained organs', 'Gespeicherte Orgeln vergleichen')}</button>
            </div>
          </section>}
          {tab === 'accounts' && <section id="rw-accounts" className="rw-items" aria-label={t('workspace.accounts.aria', 'Retained source accounts', 'Gespeicherte Quellenbeschreibungen')}>
            <div className="rw-list-heading">
              <span>{t('workspace.accounts.title', 'Exact account revisions', 'Genaue Versionen der Quellenbeschreibungen')}</span>
              <small>{t('workspace.accounts.count', '{count, number} / 2 selected', '{count, number} von 2 ausgewählt', {count: accountCount})}</small>
            </div>
            {!state?.accounts.length && <div className="rw-empty">
              <span className="rw-empty-icon"><GitCompareArrows size={24} aria-hidden="true"/></span>
              <h3>{t('workspace.accounts.empty', 'Bring two source accounts together', 'Zwei Quellenbeschreibungen zum Vergleich auswählen')}</h3>
              <p>{t('workspace.accounts.help', 'Use “Keep account” in configuration results. Each account retains its source and exact revision for the comparison.',
                'Wählen Sie in den Ergebnissen „Beschreibung speichern“. Für den Vergleich bleiben Quelle und genaue Version jeder Beschreibung erhalten.')}</p>
            </div>}
            {state?.accounts.map((account,index) => <article key={account.id}>
              <span className="rw-account-order" aria-hidden="true">{formatNumber(index+1)}</span>
              <div>{matching ? <a href={account.url}>{account.title}<ChevronRight size={16} aria-hidden="true"/></a> : <strong>{account.title}</strong>}
                <small title={account.revision}>{t('workspace.accounts.revision', 'Revision {hash}', 'Revision {hash}', {hash: account.revision.slice(0, 12)})}</small>
              </div>
              <button className="rw-icon" aria-label={t('workspace.accounts.remove', 'Remove retained account {title}', 'Gespeicherte Quellenbeschreibung {title} entfernen', {title: account.title})} onClick={() => remove('accounts', account.id)}><Trash2 size={15} aria-hidden="true"/></button>
            </article>)}
            <div className="rw-comparison">
              <div><strong>{accountCount === 2
                ? t('workspace.accounts.ready', 'Two accounts ready to compare', 'Zwei Quellenbeschreibungen stehen zum Vergleich bereit')
                : t('workspace.accounts.required', '{count, plural, one {# more account needed} other {# more accounts needed}}',
                  '{count, plural, one {Noch # Quellenbeschreibung erforderlich} other {Noch # Quellenbeschreibungen erforderlich}}', {count: 2 - accountCount})}</strong>
                <small>{t('workspace.accounts.compareScope', 'Separate evidence, pinned to retained revisions.', 'Getrennte Belege mit Bindung an die gespeicherten Versionen.')}</small>
              </div>
              <button className="rw-primary" disabled={!matching || accountCount !== 2} onClick={() => openComparison('accounts')}><GitCompareArrows size={16} aria-hidden="true"/>{t('workspace.accounts.compare', 'Compare retained accounts', 'Gespeicherte Quellenbeschreibungen vergleichen')}</button>
            </div>
          </section>}
        </div>
        <footer className="rw-footer">
          <div className="rw-file-actions">
            <button onClick={() => state && safely(() => downloadWorkspace(state))} disabled={!state}><ArrowDownToLine size={16} aria-hidden="true"/>{t('workspace.export', 'Export workspace', 'Arbeitsbereich exportieren')}</button>
            <button onClick={() => importRef.current?.click()}><ArrowUpFromLine size={16} aria-hidden="true"/>{t('workspace.import', 'Import workspace', 'Arbeitsbereich importieren')}</button>
            <input ref={importRef} type="file" accept="application/json,.json" hidden onChange={event => { void importFile(event.target.files?.[0]); }}/>
          </div>
          <details className="rw-manage">
            <summary>{t('workspace.files.title', 'Workspace files and options', 'Arbeitsbereichsdateien und Optionen')}</summary>
            <p className="rw-caption">{t('workspace.files.help', 'Export a portable file to continue elsewhere. Workspace files retain navigation and selected identifiers; complete research packages retain the selected evidence for offline replay.',
              'Exportieren Sie eine übertragbare Datei, um an anderer Stelle weiterzuarbeiten. Arbeitsbereichsdateien speichern Links und ausgewählte Identifikatoren. Vollständige Recherchepakete enthalten die ausgewählten Belege für die Wiederholung ohne Internetverbindung.')}</p>
            {binding && <button className="rw-reset" onClick={() => {
              setUndo(stateRef.current); unreadableRef.current = false;
              const persisted = persist(createWorkspace(binding.publicCoreSha256, binding.occurrenceAssessmentSha256));
              setNotice(persistenceNotice(persisted, message('reset.ready', 'A new workspace is ready. Previous exported files remain unchanged.', 'Der neue Arbeitsbereich ist bereit. Bereits exportierte Dateien behalten ihren bisherigen Inhalt.')));
            }}>{t('workspace.reset', 'Start new workspace', 'Neuen Arbeitsbereich starten')}</button>}
          </details>
        </footer>
      </div>
    </div>}
  </>;
}
