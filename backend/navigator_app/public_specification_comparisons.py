"""Read-only comparisons of independently attributed specification assertions.

Value differences are evidence to inspect, never a claim that the source accounts
describe the same physical configuration. Missing values, qualified quantities
and captured row counts do not become competing source-reported quantities.
"""
from __future__ import annotations

from collections import defaultdict
from decimal import Decimal, InvalidOperation
import re
import unicodedata

from .temperament_evidence import (
    recognized_temperament_key, temperament_assertion_kind, temperament_comparison_key, temperament_wording_key,
    temperament_meanings_disagree,
)


def _text(value):
    return str(value).strip() if value is not None else ''


def _number(value):
    if value is None or isinstance(value, bool):
        return None
    try:
        number = Decimal(str(value))
    except (InvalidOperation, ValueError):
        return None
    return format(number.normalize(), 'f') if number.is_finite() else None


def _value(fact):
    qualification = fact.get('aggregateQualification') or {}
    status = qualification.get('status')
    display = _text(fact.get('displayValue', fact.get('value')))
    if status and status != 'source_reported':
        return 'qualified', f'{status}:{display}', display
    if fact.get('family') == 'temperament':
        kind = temperament_assertion_kind(display, fact.get('source'), fact.get('sourceRecordId'))
        key = temperament_comparison_key(display) if kind == 'wording' else temperament_wording_key(display)
        return kind, key, display
    number = _number(fact.get('normalizedNumber'))
    if number is not None:
        return 'number', number, display or number
    if display:
        # Deliberately no translation, punctuation removal, synonym matching or
        # accent folding: equal wording is not a semantic identity decision.
        key = re.sub(r'\s+', ' ', unicodedata.normalize('NFKC', display).casefold())
        return 'wording', key, display
    return 'missing', '', ''


def compare_technical_facts(facts, source_record_ids=()):
    """Return annotated copies and multi-way groups, preserving every assertion."""
    by_family = defaultdict(list)
    for fact in facts:
        by_family[str(fact['family'])].append(fact)
    known_sources = set(map(str, source_record_ids))
    groups = []
    annotations = {}
    for family, family_facts in sorted(by_family.items()):
        group_id = f'technical-field:{family}'
        values = {}
        source_values = defaultdict(lambda: defaultdict(set))
        assertions = []
        present_sources = set()
        for fact in family_facts:
            kind, key, display = _value(fact)
            source_id = str(fact.get('sourceRecordId') or '')
            if kind != 'missing':
                present_sources.add(source_id)
                value_group = values.setdefault((kind, key), {
                    'key': f'{kind}:{key}', 'kind': kind, 'value': display,
                    'normalizedNumber': fact.get('normalizedNumber') if kind == 'number' else None,
                    'factIds': [], 'sourceRecordIds': [],
                })
                value_group['factIds'].append(fact['id'])
                if source_id not in value_group['sourceRecordIds']:
                    value_group['sourceRecordIds'].append(source_id)
            if kind in {'number', 'wording'}:
                source_values[source_id][kind].add(key)
            assertions.append({
                'factId': fact['id'], 'sourceRecordId': source_id,
                'source': fact.get('source'), 'sourceUrl': fact.get('sourceUrl'),
                'sourcePath': fact.get('sourcePath'), 'displayValue': display,
                'sourceWording': fact.get('sourceWording', display),
                'normalizedNumber': fact.get('normalizedNumber'),
                'valueKind': kind, 'qualificationStatus': (fact.get('aggregateQualification') or {}).get('status'),
                'qualificationGuidance': fact.get('qualificationGuidance'),
                'capturedComponentCount': fact.get('capturedComponentCount'),
                'comparisonKind': fact.get('comparisonKind'),
                'comparison': fact.get('comparison'),
                'captureComparison': fact.get('captureComparison'),
            })
        usable = [v for v in values.values() if v['kind'] in {'number', 'wording'}]
        numeric_difference = sum(v['kind'] == 'number' for v in usable) > 1
        wording_difference = sum(v['kind'] == 'wording' for v in usable) > 1
        within = any(len(keys) > 1 for kinds in source_values.values() for keys in kinds.values())
        cross = any(
            left_id != right_id and kind in right_kinds and any(a != b for a in keys for b in right_kinds[kind])
            for left_id, left_kinds in source_values.items()
            for right_id, right_kinds in source_values.items()
            for kind, keys in left_kinds.items()
        )
        comparable_sources = set(source_values)
        has_codes = any(value['kind'] == 'source_code' for value in values.values())
        equivalent_wording = family == 'temperament' and len(usable) == 1 and len({
            temperament_wording_key(assertion['displayValue']) for assertion in assertions
            if assertion['valueKind'] == 'wording'
        }) > 1
        temperament_difference = family == 'temperament' and temperament_meanings_disagree(
            key for kind, key in values if kind == 'wording'
        )
        if numeric_difference or temperament_difference:
            state = 'different_values'
        elif wording_difference:
            state = 'different_wording'
        elif len({v['kind'] for v in usable}) > 1:
            state = 'not_comparable'
        elif has_codes:
            state = 'not_comparable' if usable else 'source_code_only'
        elif equivalent_wording:
            state = 'equivalent_wording'
        elif usable and len(comparable_sources) > 1:
            state = 'matching_values'
        elif usable:
            state = 'single_source'
        elif values:
            state = 'qualified_values'
        else:
            state = 'unavailable'
        for assertion in assertions:
            kind = assertion['valueKind']
            same_kind = [v for v in usable if v['kind'] == kind]
            if kind == 'qualified':
                assertion_state = 'qualified_value'
            elif kind == 'missing':
                assertion_state = 'missing_value'
            elif kind == 'source_code':
                assertion_state = 'source_code'
            elif len(same_kind) > 1:
                assertion_state = 'different_values' if kind == 'number' or temperament_difference else 'different_wording'
            elif has_codes:
                assertion_state = 'not_comparable'
            elif equivalent_wording:
                assertion_state = 'equivalent_wording'
            elif same_kind and len(same_kind[0]['sourceRecordIds']) > 1:
                assertion_state = 'matching_values'
            elif len({v['kind'] for v in usable}) > 1:
                assertion_state = 'not_comparable'
            else:
                assertion_state = 'single_source'
            annotations[assertion['factId']] = {
                'comparisonGroupId': group_id,
                'comparisonState': assertion_state,
            }
            if family == 'temperament':
                annotations[assertion['factId']]['valueKind'] = kind
                if kind == 'wording' and (key := recognized_temperament_key(assertion['displayValue'])):
                    annotations[assertion['factId']]['temperamentComparisonKey'] = key
        groups.append({
            'id': group_id, 'family': family, 'label': family_facts[0]['label'],
            'status': state, 'assertions': assertions, 'valueGroups': list(values.values()),
            'missingSourceRecordIds': sorted(known_sources - present_sources),
            'withinSourceDifferences': within, 'crossSourceDifferences': cross,
            'scope': 'source_record_assertions', 'sameConfigurationEstablished': False,
        })
    return [{**fact, **annotations[fact['id']]} for fact in facts], groups


def coverage_summary(stop_count, component_count, facts=()):
    totals = [f for f in facts if f['family'] == 'stop_total']
    return {
        'capturedStopRows': stop_count, 'capturedComponentRows': component_count,
        'reportedStopTotals': totals,
        'sourceSummaries': [f for f in facts if f['family'] in {'source_summary', 'manual_summary'}],
        'reportedZero': any(_value(f)[0] == 'number' and _number(f.get('normalizedNumber')) == '0' for f in totals),
    }


def assertion_status(assertions):
    """Legacy pitch/temperament status, including differences within one record."""
    nonempty = [a for a in assertions if _text(a.get('value'))]
    if not nonempty:
        return 'unavailable'
    values = {re.sub(r'\s+', ' ', unicodedata.normalize('NFKC', _text(a['value'])).casefold()) for a in nonempty}
    if len(values) > 1:
        return 'sources_differ'
    return 'single_source' if len({a['sourceRecordId'] for a in nonempty}) == 1 else 'agreement'
