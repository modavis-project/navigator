export const collections: Record<string, {endpoint: string; filters: Record<string, string>}> = {
  organs: {endpoint: '/api/organs', filters: {source: 'Source'}},
  actors: {endpoint: '/api/persons', filters: {source: 'Source', entity_class: 'Actor type', publication_state: 'Entry type'}},
  places: {endpoint: '/api/pod/places', filters: {kind: 'Place kind'}},
  events: {endpoint: '/api/events', filters: {source: 'Source', event_type: 'Event type'}},
  sources: {endpoint: '/api/pod/sources', filters: {source: 'Source'}},
  literature: {endpoint: '/api/literature', filters: {digitized: 'Digitized access', year_from: 'From year', year_to: 'Through year'}},
  scores: {endpoint: '/api/scores', filters: {format: 'Format', analysis_status: 'Pitch-range analysis'}},
  temperaments: {endpoint: '/api/temperaments', filters: {precise_variant: 'Precise variant'}},
  'virtual-instruments': {endpoint: '/api/virtual-instruments', filters: {organ_link: 'Organ relationship'}},
};
export const familyIds = [...Object.keys(collections), 'accounts', 'components', 'maps', 'media', 'vocabulary', 'research', 'data-access'];
export function explorerQuery(search: string) {
  const params = new URLSearchParams(search);
  const family = params.get('collection') || 'organs';
  if (!familyIds.includes(family)) throw new Error('Unknown POD collection. Choose a collection to begin.');
  const allowed = new Set(['collection', 'q', 'offset', ...Object.keys(collections[family]?.filters || {})]);
  for (const key of params.keys()) {
    if (!allowed.has(key)) throw new Error(`Unsupported collection filter: ${key}`);
    if (params.getAll(key).length !== 1) throw new Error(`Repeated collection filter: ${key}`);
    if ((params.get(key)?.length || 0) > 256) throw new Error('Collection filter exceeds 256 characters.');
  }
  const rawOffset = params.get('offset') || '0';
  if (!/^\d+$/.test(rawOffset) || Number(rawOffset) > 10000) throw new Error('Invalid collection page.');
  for (const key of ['year_from','year_to']) {
    const value = params.get(key);
    if (value && (!/^\d+$/.test(value) || Number(value)<1 || Number(value)>9999)) throw new Error('Year must be between 1 and 9999.');
  }
  if (params.get('year_from') && params.get('year_to') && Number(params.get('year_from'))>Number(params.get('year_to'))) throw new Error('Start year exceeds end year.');
  const enums: Record<string,string[]> = {entity_class:['person','organization'],publication_state:['canonical','source','all'],digitized:['true','false'],
    precise_variant:['true','false'],format:['pdf','musicxml','compressed_musicxml','midi','lilypond'],
    analysis_status:['available','not_analyzed'],organ_link:['linked','unlinked']};
  for (const [key, values] of Object.entries(enums)) {
    if (params.get(key) && !values.includes(params.get(key)!)) throw new Error(`Unsupported ${key} value.`);
  }
  const endpoint = collections[family]?.endpoint;
  const api = collectionRequestParams(params);
  api.set('limit', '12');
  api.set('offset', rawOffset);
  return {family, params, offset: Number(rawOffset), url: endpoint ? endpoint + '?' + api : null};
}

export function internalHref(value: unknown): string | undefined {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') && !value.includes('\\') ? value : undefined;
}

function collectionRequestParams(params: URLSearchParams): URLSearchParams {
  const query = new URLSearchParams(params);
  query.delete('collection');
  const eventType = query.get('event_type');
  if (eventType) query.set('type', eventType);
  query.delete('event_type');
  return query;
}

export function collectionFullUrl(path: string, params: URLSearchParams): string {
  const query = collectionRequestParams(params);
  if (path === '/scores') {
    query.set('evidence_strength', 'all');
    query.set('sort', 'evidence');
  }
  return path + (query.size ? '?' + query : '');
}

export function collectionCard(family: string, row: Record<string, any>) {
  const id = String(row.mdvsId || row.id || row.scoreId || row.literatureId || row.eventId || row.tuningId || '');
  let href = internalHref(row.url || row.pageUrl || row.detailUrl || row.canonicalUrl);
  if (family === 'literature') href = '/literature/' + encodeURIComponent(row.literatureId);
  if (family === 'scores') href = '/scores/' + encodeURIComponent(row.scoreId);
  if (family === 'temperaments') href = internalHref(row.urls?.temperament);
  if (family === 'events') href = internalHref(row.urls?.event || row.detailUrl || row.href) || (id ? '/events/' + encodeURIComponent(id) : undefined);
  const eventContext = family === 'events' ? [row.subject?.title, row.when?.rawExpression].filter(Boolean).join(' · ') : '';
  const description = String(eventContext || row.description || row.summary || row.composer || row.authorText || row.venue || row.organTitle || '');
  return {id, href, title: String(row.title || row.label || row.displayName || id),
    description: family === 'places' ? description.replace(/_/g, ' ') : description,
    qualifications: [row.source, row.qualification, row.publicationYear, row.publicationStateLabel, row.collection?.displayName || row.collection?.name,
      row.license?.name, row.evidence?.label || row.evidenceStrength, row.relationships?.linkState,
      row.ambitusStatus === 'available' ? 'Precomputed musical range' : null].filter(value => typeof value === 'string' || typeof value === 'number').map(String)};
}

export function collectionWorkspaceItem(family: string, row: Record<string, any>) {
  const card = collectionCard(family, row);
  const kinds: Record<string,string> = {organs:'organ',actors:'actor',places:'place',events:'event',sources:'view',
    literature:'literature',scores:'score',temperaments:'temperament','virtual-instruments':'virtual_instrument'};
  let kind = kinds[family];
  if (family === 'actors' && row.mdvsId && ['person','organization'].includes(row.entityClass)) kind = row.entityClass;
  if (!kind || !card.id || !card.href) return null;
  return {kind, id:card.id, title:card.title, url:card.href};
}
