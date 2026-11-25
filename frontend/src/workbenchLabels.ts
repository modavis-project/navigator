import type {UiText} from './uiLocale';

const EVIDENCE_TERMS: Record<string, string> = {
  stops: 'Register', divisions: 'Werke', activities: 'Tätigkeiten', events: 'Ereignisse',
  exact: 'genau', approximate: 'ungefähr', year: 'Jahresangabe', century: 'Jahrhundert', range: 'Zeitraum',
  expression: 'Datierung in Quellenschreibweise', relative: 'relative Datierung', qualified_period: 'Zeitraum mit Einschränkung',
  document_date: 'Dokumentdatum', source_listing: 'Quelleneintrag', conflicting_or_undated: 'widersprüchlich oder undatiert',
  undated: 'undatiert', partial: 'teilweise erfasst', partial_structured_stops: 'Register teilweise strukturiert erfasst',
  retained_source_transfer: 'übernommene Quellenangaben', structured_components: 'Bauteile strukturiert erfasst',
  structured_stops: 'Register strukturiert erfasst', technical_facts_only: 'nur technische Angaben', unspecified: 'keine Angabe',
  organ: 'Orgel', earlier_instrument: 'früheres Instrument', reported: 'in der Quelle beschrieben', documented: 'dokumentiert',
  proposed: 'Entwurf', realized: 'ausgeführt', builder: 'Orgelbauer', participant: 'Beteiligter',
  before: 'vor', after: 'nach',
  construction: 'Neubau', restoration: 'Restaurierung', relocation: 'Versetzung', rebuilding: 'Umbau',
  extension: 'Erweiterung', repair: 'Reparatur', maintenance: 'Wartung',
  exclude_conflicts: 'bewertete Konflikte ausschließen', conflicts_only: 'nur bewertete Konflikte',
  temporally_compatible: 'innerhalb der belegten Lebenszeit',
};

export function workbenchEvidenceLabel(value: string | null | undefined, t: UiText): string {
  if (!value) return t('workbench.evidence.unspecified', 'Unspecified', 'Keine Angabe');
  const german = EVIDENCE_TERMS[value];
  return german ? t(`workbench.evidence.${value}`, value.replace(/_/g, ' '), german) : value;
}

const UNITS: Record<string, [string, string, string]> = {
  'event assertions': ['event assertion', 'Ereignisaussage', 'Ereignisaussagen'],
  'configuration accounts': ['configuration account', 'Dispositionsbeschreibung', 'Dispositionsbeschreibungen'],
  'organ records': ['organ record', 'Orgeldatensatz', 'Orgeldatensätze'],
  'ordered event pairs': ['ordered event pair', 'chronologisch geordnetes Ereignispaar', 'chronologisch geordnete Ereignispaare'],
  'source occurrences': ['source occurrence', 'Vorkommen in einer Quelle', 'Vorkommen in Quellen'],
  'attribution occurrences': ['attribution occurrence', 'Zuschreibung', 'Zuschreibungen'],
  results: ['result', 'Ergebnis', 'Ergebnisse'],
};

export function workbenchResultCount(count: number, unit: string, t: UiText): string {
  const labels = UNITS[unit];
  if (!labels) return t('workbench.count.unknown', '{count, number} {unit}', '{count, number} {unit}', {count, unit});
  const [singular, german, germanPlural] = labels;
  return t(`workbench.count.${unit}`, `{count, plural, one {# ${singular}} other {# ${unit}}}`,
    `{count, plural, one {# ${german}} other {# ${germanPlural}}}`, {count});
}
