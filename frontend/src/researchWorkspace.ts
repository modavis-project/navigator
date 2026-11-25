export const WORKSPACE_SCHEMA = 'modavis.research-workspace/v2';
const LEGACY_SCHEMA = 'modavis.research-workspace/v1';
export const WORKSPACE_KEY = 'modavis.research-workspace.v1';
export const WORKSPACE_BACKUP_KEY = WORKSPACE_KEY + '.backup';
export const WORKSPACE_EVENT = 'modavis:workspace-changed';
export const MAX_WORKSPACE_BYTES = 128 * 1024;
export const MAX_RECORDS = 12;
export const MAX_ORGANS = 4;
export const MAX_VIEWS = 20;
export const MAX_ACCOUNTS = 2;

export type WorkspaceRecord = {kind: string; id: string; title: string; url: string};
export type WorkspaceAccount = {id: string; revision: string; title: string; organ?: string; url: string};
type BindingDescription = {snapshot: string; collectionTitle: string; version?: string; resource?: string};
export const publishedVocabularyCollections = ['network', 'vao', 'vao-0.6.0', 'mmic'] as const;
type PublishedVocabularyCollection = typeof publishedVocabularyCollections[number];
export function isPublishedVocabularyCollection(value: unknown): value is PublishedVocabularyCollection {
  return publishedVocabularyCollections.some(collection => collection === value);
}
export type VocabularyBinding = BindingDescription & (
  | {kind: 'controlled'; collection: 'modavis_activity_types' | 'modavis_person_terminology'}
  | {kind: 'candidate'; collection: 'registry'; publicCoreSha256: string; researchIndexSha256: string}
  | {kind: 'published'; collection: PublishedVocabularyCollection}
  | {kind: 'omaro'; collection: 'omaro'}
);
export type WorkspaceView = {id: string; title: string; url: string; savedAt: string; count?: number; unit?: string; binding?: VocabularyBinding};
export type NewWorkspaceView = Omit<WorkspaceView, 'id' | 'savedAt'>;
export type WorkspaceSaveResult = {saved: true; persisted: boolean; message: string};
export type WorkspaceViewRequest = {view: NewWorkspaceView; resolve: (result: WorkspaceSaveResult) => void; reject: (error: Error) => void};
export type ResearchWorkspaceState = {
  schema: typeof WORKSPACE_SCHEMA;
  name: string;
  snapshot?: string;
  assessment?: string;
  records: WorkspaceRecord[];
  accounts: WorkspaceAccount[];
  views: WorkspaceView[];
  updatedAt: string;
};
const HASH = /^[a-f0-9]{64}$/;
const KINDS = new Set(['organ', 'person', 'organization', 'actor', 'place', 'event', 'literature', 'score', 'temperament', 'virtual_instrument']);
const PRIVATE = /(?:password|secret|authorization|cookie|api[_-]?key|access[_-]?token|refresh[_-]?token|signature|^sig$|^token$|^x-amz-|^x-goog-)/i;
const PUBLIC_PATH = /^(?:\/(?:organs|persons|people|organizations|names|places|events|literature|scores|temperaments|virtual-instruments|vocab|map|pod-explorer|pipe-positions|source|about|documentation|id|entity)(?:\/|$)|\/use-cases(?:\/|$)|\/$)/;

function text(value: unknown, label: string, max = 240): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\u0000-\u001f]/.test(value)) throw new Error(`Invalid ${label}.`);
  return value.trim();
}
function hash(value: unknown, label: string): string {
  if (typeof value !== 'string' || !HASH.test(value)) throw new Error(`An exact ${label} is required.`);
  return value;
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid workspace record.');
  return value as Record<string, unknown>;
}
function array(value: unknown, maximum: number): unknown[] {
  if (!Array.isArray(value) || value.length > maximum) throw new Error('Workspace exceeds its saved-item limit.');
  return value;
}
function date(value: unknown, label: string): string {
  const result = text(value, label, 40);
  if (!/^\d{4}-\d{2}-\d{2}T/.test(result) || !Number.isFinite(Date.parse(result))) throw new Error(`Invalid ${label}.`);
  return result;
}
function unique<T>(items: T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  for (const item of items) {
    const id = key(item);
    if (seen.has(id)) throw new Error('The workspace contains duplicate entries.');
    seen.add(id);
  }
  return items;
}

/** Portable public navigation only; never import an external or operator URL. */
export function workspaceUrl(value: unknown, origin = 'https://navigator.modavis.org'): string {
  const raw = text(value, 'public link', 6000);
  const url = new URL(raw, origin);
  if ((url.origin !== new URL(origin).origin && url.origin !== 'https://navigator.modavis.org') || url.username || url.password || !PUBLIC_PATH.test(url.pathname)) throw new Error('Only public Navigator links can be retained.');
  if (!['https:', 'http:'].includes(url.protocol)) throw new Error('Invalid public link.');
  if ([...url.searchParams].some(([key, val]) => PRIVATE.test(key) || /^(?:file:|\/Users\/|\/Volumes\/|\/work\d?\/)/i.test(val))) throw new Error('Credential or local-file parameters cannot be retained.');
  if (url.hash && !/^#[A-Za-z0-9:_-]{0,100}$/.test(url.hash)) throw new Error('Invalid navigation fragment.');
  return url.pathname + url.search + url.hash;
}

function absoluteResource(value: unknown): string {
  const uri = text(value, 'reference identifier', 2048);
  if (/\s/.test(uri)) throw new Error('Invalid reference identifier.');
  try {
    const parsed = new URL(uri);
    if (!['http:', 'https:', 'urn:'].includes(parsed.protocol) || parsed.username || parsed.password || (parsed.protocol === 'urn:' && !parsed.pathname)) throw new Error();
  } catch { throw new Error('An exact absolute reference identifier is required.'); }
  return uri;
}

/** Check a named resource pin against its navigation context, never the POD pin. */
export function validateVocabularyBinding(value: unknown, link: string): VocabularyBinding {
  const b = object(value), url = new URL(link, 'https://navigator.modavis.org');
  const kind = b.kind, collection = b.collection;
  const extra = kind === 'candidate' ? ['publicCoreSha256', 'researchIndexSha256'] : [];
  if (Object.keys(b).some(key => !['kind', 'collection', 'snapshot', 'collectionTitle', 'version', 'resource', ...extra].includes(key))) throw new Error('Unsupported vocabulary binding field.');
  const snapshot = hash(b.snapshot, 'vocabulary snapshot');
  const collectionTitle = text(b.collectionTitle, 'collection title', 240);
  const version = b.version === undefined ? undefined : text(b.version, 'collection version', 100);
  const resource = b.resource === undefined ? undefined : text(b.resource, 'term identifier', 2048);
  if (resource && /[\u0000-\u0020\u007f]/.test(resource)) throw new Error('Invalid retained term identifier.');
  const params = url.searchParams;
  const exactPin = (key: string, expected: string) => {
    if (params.getAll(key).length !== 1 || params.get(key) !== expected) throw new Error('The retained vocabulary binding and link disagree.');
  };
  exactPin('snapshot', snapshot);
  const common = {snapshot, collectionTitle, ...(version ? {version} : {}), ...(resource ? {resource} : {})};
  let allowed: string[], selectedResource: string | null = null;
  let candidateDependencies: {publicCoreSha256: string; researchIndexSha256: string} | undefined;
  if (kind === 'controlled' && ['modavis_activity_types', 'modavis_person_terminology'].includes(String(collection))) {
    const scoped = url.pathname.match(/^\/vocab\/([^/]+)(?:\/concepts\/([^/]+))?\/?$/);
    if (scoped && decodeURIComponent(scoped[1]) === collection) selectedResource = scoped[2] ? decodeURIComponent(scoped[2]) : null;
    else throw new Error('A controlled vocabulary binding requires its exact scheme or concept route.');
    allowed = ['q', 'offset', 'limit', 'language_code', 'snapshot'];
  } else if (kind === 'candidate' && collection === 'registry' && /^\/vocab\/registry\/?$/.test(url.pathname)) {
    const publicCoreSha256 = hash(b.publicCoreSha256, 'candidate public data snapshot');
    const researchIndexSha256 = hash(b.researchIndexSha256, 'candidate research index snapshot');
    exactPin('coreSnapshot', publicCoreSha256); exactPin('indexSnapshot', researchIndexSha256);
    candidateDependencies = {publicCoreSha256, researchIndexSha256};
    selectedResource = params.get('concept');
    const schemes = ['action', 'windchest', 'stop-designation', 'division-designation'].map(code => 'urn:modavis:terminology-seed:' + code);
    if (params.has('scheme') && !schemes.includes(params.get('scheme')!)) throw new Error('The retained candidate scheme is unavailable.');
    if (selectedResource !== null && !/^urn:modavis:terminology-seed:[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(selectedResource)) throw new Error('An exact candidate identifier is required.');
    allowed = ['scheme', 'q', 'language', 'offset', 'limit', 'snapshot', 'concept', 'coreSnapshot', 'indexSnapshot'];
  } else if (kind === 'published' && isPublishedVocabularyCollection(collection) && /^\/vocab\/reference\/?$/.test(url.pathname)) {
    if ((params.get('collection') ?? 'network') !== collection) throw new Error('The retained published collection and link disagree.');
    selectedResource = params.has('uri') ? absoluteResource(params.get('uri')) : null;
    allowed = ['collection', 'uri', 'q', 'kind', 'scheme', 'language', 'offset', 'limit', 'snapshot'];
  } else if (kind === 'omaro' && collection === 'omaro' && /^\/vocab\/omaro\/?$/.test(url.pathname)) {
    if (!['instruments', 'hs', 'ontology'].includes(params.get('collection') ?? 'instruments')) throw new Error('The retained OMARO collection is unavailable.');
    selectedResource = params.has('uri') ? absoluteResource(params.get('uri')) : null;
    allowed = ['collection', 'uri', 'q', 'language', 'resolution', 'offset', 'limit', 'snapshot'];
  } else throw new Error('Unsupported vocabulary binding or collection route.');
  for (const key of params.keys()) {
    if (!allowed.includes(key) || params.getAll(key).length !== 1) throw new Error('Unsupported or repeated retained vocabulary parameter.');
    const entry = params.get(key)!;
    if (entry.length > (key === 'uri' || key === 'scheme' ? 2048 : 500) || /[\u0000-\u001f\u007f]/.test(entry)) throw new Error('Invalid retained vocabulary parameter.');
    if (key === 'offset' || key === 'limit') {
      const minimum = key === 'offset' ? 0 : 1, maximum = key === 'offset' ? 100000 : kind === 'controlled' ? 500 : 100;
      if (!/^\d+$/.test(entry) || !Number.isSafeInteger(Number(entry)) || Number(entry) < minimum || Number(entry) > maximum) throw new Error('Invalid retained vocabulary page bounds.');
    }
  }
  if (selectedResource !== null && resource === undefined) throw new Error('An exact retained term identifier is required for this detail view.');
  if (resource !== undefined && selectedResource !== resource) throw new Error('The retained term identifier and link disagree.');
  // Titles and versions are display descriptions. The exact route, resource and
  // digest are the binding; source membership is checked by the pinned reader.
  return {kind, collection, ...common, ...candidateDependencies} as VocabularyBinding;
}

export function createWorkspace(snapshot: string, assessment?: string, now = new Date().toISOString()): ResearchWorkspaceState {
  return {schema: WORKSPACE_SCHEMA, name: 'My research workspace', snapshot: hash(snapshot, 'dataset snapshot'), ...(assessment ? {assessment: hash(assessment, 'assessment snapshot')} : {}), records: [], accounts: [], views: [], updatedAt: now};
}

export function createReferenceWorkspace(now = new Date().toISOString()): ResearchWorkspaceState {
  return {schema: WORKSPACE_SCHEMA, name: 'My research workspace', records: [], accounts: [], views: [], updatedAt: now};
}

/** Attaching a verified POD context is explicit and never replaces an old one. */
export function bindWorkspaceDataset(state: ResearchWorkspaceState, snapshot: string, assessment?: string): ResearchWorkspaceState {
  const current = validateWorkspace(state), nextSnapshot = hash(snapshot, 'dataset snapshot');
  const nextAssessment = assessment === undefined ? undefined : hash(assessment, 'assessment snapshot');
  if (current.snapshot && (current.snapshot !== nextSnapshot || current.assessment !== nextAssessment)) throw new Error('This workspace belongs to another POD snapshot. Its binding has not been replaced.');
  return validateWorkspace({...current, snapshot: nextSnapshot, ...(nextAssessment ? {assessment: nextAssessment} : {})});
}

export function validateWorkspace(value: unknown, origin?: string): ResearchWorkspaceState {
  const x = object(value);
  if (![WORKSPACE_SCHEMA, LEGACY_SCHEMA].includes(String(x.schema))) throw new Error('This is not a supported Navigator workspace.');
  const snapshot = x.snapshot === undefined && x.schema === WORKSPACE_SCHEMA ? undefined : hash(x.snapshot, 'dataset snapshot');
  const assessment = x.assessment === undefined ? undefined : hash(x.assessment, 'assessment snapshot');
  if (!snapshot && assessment) throw new Error('An assessment requires its verified POD snapshot.');
  const boundUrl = (value: unknown) => {
    const result = workspaceUrl(value, origin), url = new URL(result, 'https://navigator.modavis.org');
    for (const [key, expected] of [['snapshot', snapshot], ['assessment', assessment]] as const) {
      if (url.searchParams.has(key) && (url.searchParams.getAll(key).length !== 1 || url.searchParams.get(key) !== expected)) throw new Error('A retained link belongs to a different snapshot or assessment.');
    }
    return result;
  };
  const records = unique(array(x.records, MAX_RECORDS).map(value => {
    const r = object(value), kind = text(r.kind, 'record kind', 30);
    if (!KINDS.has(kind)) throw new Error('Unsupported public record kind.');
    const rawId = text(r.id, 'record identifier', 220), id = kind === 'organ' ? 'MDVS:ENTY:' + rawId.replace(/^MDVS:ENTY:/, '') : rawId, url = boundUrl(r.url);
    if (kind === 'organ') {
      const route = new URL(url, 'https://navigator.modavis.org').pathname.match(/^\/organs\/([^/]+)\/?$/);
      if (!route || decodeURIComponent(route[1]).replace(/^MDVS:ENTY:/, '') !== id.replace(/^MDVS:ENTY:/, '')) throw new Error('The retained organ identifier and record link disagree.');
    }
    return {kind, id, title: text(r.title, 'record title', 600), url};
  }), r => r.kind + ':' + r.id);
  if (records.filter(r => r.kind === 'organ').length > MAX_ORGANS) throw new Error(`Retain up to ${MAX_ORGANS} organs for a bounded comparison.`);
  const accounts = unique(array(x.accounts, MAX_ACCOUNTS).map(value => {
    const a = object(value);
    const id = text(a.id, 'account identifier', 220), revision = hash(a.revision, 'account revision');
    const link = new URL(boundUrl(a.url), 'https://navigator.modavis.org'), params = link.searchParams;
    const route = link.pathname.match(/^\/organs\/([^/]+)\/?$/);
    if (!route) throw new Error('The retained account requires an organ link.');
    const organ = 'MDVS:ENTY:' + decodeURIComponent(route[1]).replace(/^MDVS:ENTY:/, '');
    if (params.getAll('description').length !== 1 || params.get('description') !== id || (params.has('descriptionRevision') && (params.getAll('descriptionRevision').length !== 1 || params.get('descriptionRevision') !== revision))) throw new Error('The retained account and description link disagree.');
    if (a.organ && organ !== 'MDVS:ENTY:' + text(a.organ, 'organ identifier', 220).replace(/^MDVS:ENTY:/, '')) throw new Error('The retained account and organ link disagree.');
    params.set('descriptionRevision', revision);
    return {id, revision, title: text(a.title, 'account title', 600), organ, url: link.pathname + link.search + link.hash};
  }), a => a.id);
  const views = unique(array(x.views, MAX_VIEWS).map(value => {
    const v = object(value);
    const count = v.count;
    if (count !== undefined && (typeof count !== 'number' || !Number.isSafeInteger(count) || count < 0)) throw new Error('Invalid retained result count.');
    if (x.schema === LEGACY_SCHEMA && v.binding !== undefined) throw new Error('Independent resource bindings require workspace version 2.');
    const url = v.binding === undefined ? boundUrl(v.url) : workspaceUrl(v.url, origin);
    const binding = v.binding === undefined ? undefined : validateVocabularyBinding(v.binding, url);
    if (!snapshot && !binding) throw new Error('An unbound view requires a verified POD snapshot.');
    return {id: text(v.id, 'view identifier', 100), title: text(v.title, 'view title', 600), url, savedAt: date(v.savedAt, 'saved date'), ...(binding ? {binding} : {}), ...(count !== undefined ? {count} : {}), ...(v.unit ? {unit: text(v.unit, 'count unit', 60)} : {})};
  }), v => v.id);
  if (!snapshot && (records.length || accounts.length)) throw new Error('POD records and accounts require a verified dataset snapshot.');
  const result: ResearchWorkspaceState = {schema: WORKSPACE_SCHEMA, name: text(x.name, 'workspace name', 100), ...(snapshot ? {snapshot} : {}), ...(assessment ? {assessment} : {}), records, accounts, views, updatedAt: date(x.updatedAt, 'updated date')};
  if (new Blob([JSON.stringify(result)]).size > MAX_WORKSPACE_BYTES) throw new Error('Workspace exceeds its byte budget.');
  return result;
}

export function parseWorkspace(contents: string, origin?: string): ResearchWorkspaceState {
  if (contents.length > MAX_WORKSPACE_BYTES) throw new Error('Workspace file is too large.');
  try { return validateWorkspace(JSON.parse(contents), origin); }
  catch (error) { throw new Error(error instanceof Error ? error.message : 'Invalid workspace file.'); }
}

export function keepRecord(state: ResearchWorkspaceState, value: WorkspaceRecord, origin?: string): ResearchWorkspaceState {
  const current = validateWorkspace(state, origin);
  if (!current.snapshot) throw new Error('A verified POD snapshot is required before retaining a record.');
  if (value.kind === 'organ') value = {...value, id:'MDVS:ENTY:' + value.id.replace(/^MDVS:ENTY:/, '')};
  const exists = current.records.find(r => r.kind === value.kind && r.id === value.id);
  if (!exists && current.records.length >= MAX_RECORDS) throw new Error(`Retain up to ${MAX_RECORDS} records; remove one before adding another.`);
  if (!exists && value.kind === 'organ' && current.records.filter(r => r.kind === 'organ').length >= MAX_ORGANS) throw new Error(`Retain up to ${MAX_ORGANS} organs; remove one before adding another.`);
  return validateWorkspace({...current, records: [...current.records.filter(r => r.kind !== value.kind || r.id !== value.id), value], updatedAt: new Date().toISOString()}, origin);
}

export function keepAccount(state: ResearchWorkspaceState, value: WorkspaceAccount, origin?: string): ResearchWorkspaceState {
  const current = validateWorkspace(state, origin);
  if (!current.snapshot) throw new Error('A verified POD snapshot is required before retaining a source account.');
  const existing = current.accounts.find(a => a.id === value.id);
  if (existing && existing.revision !== value.revision) throw new Error('This account is already retained at a different revision. Remove it explicitly before choosing another.');
  if (!existing && current.accounts.length >= MAX_ACCOUNTS) throw new Error(`Retain up to ${MAX_ACCOUNTS} source accounts.`);
  const verified = validateWorkspace({...current, accounts: [...current.accounts.filter(a => a.id !== value.id), value], updatedAt: new Date().toISOString()}, origin);
  for (const account of verified.accounts) {
    const url = new URL(account.url, 'https://navigator.modavis.org');
    url.searchParams.set('descriptionRevision', account.revision);
    account.url = url.pathname + url.search + url.hash;
  }
  return verified;
}

export function retainView(state: ResearchWorkspaceState, value: NewWorkspaceView, origin?: string): ResearchWorkspaceState {
  const current = validateWorkspace(state, origin);
  const url = workspaceUrl(value.url, origin);
  const id = 'view:' + url;
  const existing = current.views.find(v => v.url === url);
  if (!existing && current.views.length >= MAX_VIEWS) throw new Error(`Retain up to ${MAX_VIEWS} views; remove one before adding another.`);
  // A short deterministic URL hash is an interface key, never a scientific digest.
  let key = 2166136261;
  for (const char of id) key = Math.imul(key ^ char.charCodeAt(0), 16777619) >>> 0;
  return validateWorkspace({...current, views: [...current.views.filter(v => v.url !== url), {...value, url, id: 'view:' + key.toString(16), savedAt: new Date().toISOString()}], updatedAt: new Date().toISOString()}, origin);
}

export function accountComparisonUrl(state: ResearchWorkspaceState): string {
  if (!state.snapshot) throw new Error('A verified POD snapshot is required for account comparison.');
  if (state.accounts.length < 2) throw new Error('Retain two source accounts for comparison.');
  const [left, right] = state.accounts;
  const query = new URLSearchParams({view: 'compare', snapshot: state.snapshot, left: left.id, leftRevision: left.revision, right: right.id, rightRevision: right.revision});
  if (state.assessment) query.set('assessment', state.assessment);
  return '/use-cases/research-workbench?' + query;
}

export function organComparisonUrl(state: ResearchWorkspaceState): string {
  if (!state.snapshot) throw new Error('A verified POD snapshot is required for organ comparison.');
  const organs = state.records.filter(r => r.kind === 'organ');
  if (organs.length < 2) throw new Error('Retain at least two organ records for comparison.');
  const query = new URLSearchParams({view: 'organs', organs: organs.map(r => r.id).join(','), snapshot: state.snapshot});
  if (state.assessment) query.set('assessment', state.assessment);
  return '/use-cases/research-workbench?' + query;
}

export function signalWorkspaceChange(): void { window.dispatchEvent(new CustomEvent(WORKSPACE_EVENT)); }

export function readWorkspace(): ResearchWorkspaceState | null {
  const saved = localStorage.getItem(WORKSPACE_KEY);
  return saved ? parseWorkspace(saved, location.origin) : null;
}

export function writeWorkspace(value: ResearchWorkspaceState): ResearchWorkspaceState {
  const state = validateWorkspace(value, location.origin);
  const original = localStorage.getItem(WORKSPACE_KEY);
  if (original) {
    // Preserve the original file before the first persisted version upgrade.
    // A failed backup/write leaves the old primary value intact and surfaces as
    // a failed save; no optimistic success is emitted.
    let priorSchema: unknown;
    try { priorSchema = (JSON.parse(original) as {schema?: unknown})?.schema; } catch { /* Keep unreadable originals recoverable too. */ }
    if (priorSchema !== WORKSPACE_SCHEMA && localStorage.getItem(WORKSPACE_BACKUP_KEY) === null) localStorage.setItem(WORKSPACE_BACKUP_KEY, original);
  }
  localStorage.setItem(WORKSPACE_KEY, JSON.stringify(state));
  signalWorkspaceChange();
  return state;
}

export function addAccountToWorkspace(value: WorkspaceAccount): void {
  window.dispatchEvent(new CustomEvent('modavis:workspace-account', {detail: value}));
}

/** Resolve only after the workspace owner acknowledges actual persistence. */
export function addViewToWorkspace(view: NewWorkspaceView): Promise<WorkspaceSaveResult> {
  return new Promise((resolve, reject) => {
    const event = new CustomEvent<WorkspaceViewRequest>('modavis:workspace-view', {cancelable: true, detail: {view, resolve, reject}});
    if (window.dispatchEvent(event)) reject(new Error('The research workspace is not ready. Please try again.'));
  });
}
