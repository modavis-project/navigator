type Values = Record<string, unknown>;
type Pins = Partial<Record<'snapshot' | 'assessment' | 'leftRevision' | 'rightRevision', string>>;
const bindings = ['snapshot', 'assessment'];

const selection: Record<string, string[]> = {
  events: ['section', 'actor', 'other', 'organ', 'q', 'source', 'from', 'to', 'date', 'activity', 'role', 'identity'],
  sequences: ['section', 'actor', 'other', 'organ', 'q', 'source', 'from', 'to', 'date', 'activity', 'role', 'identity'],
  configurations: ['section', 'actor', 'organ', 'q', 'source', 'from', 'to', 'date', 'coverage'],
  organs: ['section', 'actor', 'other', 'organ', 'q', 'source'],
};
const comparison = ['left', 'leftRevision', 'right', 'rightRevision'];
const views: Record<string, string[]> = {
  terms: ['mode', 'q', 'concept', 'pitch', 'country', 'source', 'from', 'to'],
  occurrences: ['event', 'actor', 'native', 'organ', 'source', 'status', 'kind'],
  compare: comparison,
  timeline: ['organ'],
  claims: ['organ'],
  identities: [],
  organs: ['organs'],
  dispositions: ['stop', 'scope'],
};
const common = ['snapshot', 'assessment', 'view', 'page'];
const known = new Set([...common, ...comparison, 'format', 'revision',
  ...Object.values(selection).flat(), ...Object.values(views).flat()]);

/** Keep comparison presentation out of an unchanged membership request. */
export function workbenchRequestQuery(current: URLSearchParams, view: string): URLSearchParams {
  const next = new URLSearchParams(current);
  next.delete('view');
  if (view === 'selection') for (const key of comparison) next.delete(key);
  // Unknown operands remain present for explicit server-side refusal.
  next.sort();
  return next;
}

function copyParameter(from: URLSearchParams, to: URLSearchParams, key: string) {
  to.delete(key);
  for (const value of from.getAll(key)) to.append(key, value);
}

/** Fill absent pins only; supplied empty, repeated or stale pins need refusal. */
export function fillMissingWorkbenchPins(current: URLSearchParams, pins: Pins): URLSearchParams {
  const next = new URLSearchParams(current);
  for (const [key, value] of Object.entries(pins)) {
    if (value && !next.has(key)) next.set(key, value);
  }
  return next;
}

/** Change explicit UI state; loaded URLs reach API validation unchanged. */
export function transitionWorkbenchQuery(current: URLSearchParams, updates: Values, reset = false): URLSearchParams {
  const next = reset ? new URLSearchParams() : new URLSearchParams(current);
  const preservedPins = new Set(bindings);
  if (reset) for (const side of ['left', 'right']) {
    if (current.get(side) && current.get(side) === updates[side]) preservedPins.add(side + 'Revision');
  }
  // Form submissions replace filters, never the dataset supplied by the link.
  // Resubmitting the same account also keeps its exact revision operands.
  if (reset) for (const key of preservedPins) copyParameter(current, next, key);
  for (const [key, value] of Object.entries(updates)) {
    if (preservedPins.has(key) && current.has(key)) continue;
    if (key === 'stop' && Array.isArray(value)) {
      next.delete(key);
      for (const criterion of value) next.append(key, String(criterion));
    } else if (value === null || value === undefined || value === '') next.delete(key);
    else next.set(key, String(value));
  }
  const oldView = current.get('view') || 'selection';
  const newView = next.get('view') || 'selection';
  const section = next.get('section') || 'events';
  const changedView = newView !== oldView;
  const changedSection = newView === 'selection' && updates.section !== undefined
    && section !== (current.get('section') || 'events');
  if (!changedView && !changedSection) return next;

  const fields = newView === 'selection'
    ? [...(selection[section] || Object.values(selection).flat()), ...comparison]
    : views[newView];
  // Preserve invalid/unknown input for the server to reject, including an
  // unknown view. This helper is not a request sanitizer.
  if (!fields) return next;
  const allowed = new Set([...common, ...fields]);
  for (const key of [...next.keys()]) {
    if (known.has(key) && !allowed.has(key)) next.delete(key);
  }
  // These identically named controls refer to different research operands.
  if (changedView && (oldView === 'terms' || newView === 'terms') && !Object.prototype.hasOwnProperty.call(updates, 'q')) next.delete('q');
  if (changedView && (oldView === 'occurrences' || newView === 'occurrences') && !Object.prototype.hasOwnProperty.call(updates, 'source')) next.delete('source');
  next.set('page', '0');
  return next;
}

/** Remember visited tabs for this mounted workbench, without mixing API filters. */
export function rememberedWorkbenchQuery(
  current: URLSearchParams, updates: Values, remembered: Map<string, string>, reset = false,
): URLSearchParams {
  const remember = (view: string, params: URLSearchParams) => {
    remembered.set(view, params.toString());
    if (!['selection', 'compare'].includes(view)) return;
    const other = view === 'selection' ? 'compare' : 'selection';
    const prior = remembered.get(other);
    if (prior === undefined) return;
    const synchronized = new URLSearchParams(prior);
    // Keep one current comparison pair across the two compatible tabs, including
    // removals, even when the user visits another tab before returning.
    for (const key of comparison) copyParameter(params, synchronized, key);
    remembered.set(other, synchronized.toString());
  };
  let next = transitionWorkbenchQuery(current, updates, reset);
  const oldView = current.get('view') || 'selection';
  const newView = next.get('view') || 'selection';
  remember(oldView, current);
  const prior = remembered.get(newView);
  if (!reset && newView !== oldView && prior !== undefined) {
    const restored = new URLSearchParams(prior);
    for (const key of bindings) {
      if (!restored.has(key)) copyParameter(current, restored, key);
    }
    // Restore exact prior operands, including invalid ones for the API to reject.
    // Explicit updates and form resets still take precedence over memory.
    restored.set('view', newView);
    restored.set('page', '0');
    next = transitionWorkbenchQuery(restored, updates);
  }
  remember(newView, next);
  return next;
}
