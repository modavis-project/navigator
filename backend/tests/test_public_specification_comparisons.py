from copy import deepcopy
import pytest

from navigator_app.public_aggregate_quality import qualify_public_fact
from navigator_app.public_specification_comparisons import assertion_status, compare_technical_facts, coverage_summary
from navigator_app.public_specifications import attach_facts, technical_facts


def fact(identifier, source, value, *, family='stop_total', number=None, path=None):
    return {'id': identifier, 'sourceRecordId': source, 'source': source.split(':')[0],
            'family': family, 'label': family, 'value': value, 'normalizedNumber': number,
            'sourcePath': path or f'specifications.{identifier}'}


def test_three_source_multiple_field_comparison_preserves_each_assertion_and_value_group():
    facts = [fact('a', 'provider:a', '100', number=100), fact('b', 'provider:b', '100.0', number=100.0),
             fact('c', 'other:c', '105', number=105),
             fact('d', 'provider:a', '3', family='manual_total', number=3),
             fact('e', 'provider:b', '4', family='manual_total', number=4),
             fact('f', 'other:c', '3', family='manual_total', number=3)]
    before = deepcopy(facts)
    annotated, groups = compare_technical_facts(facts, ['provider:a', 'provider:b', 'other:c', 'empty:d'])
    assert facts == before
    assert len(groups) == 2
    assert all(g['status'] == 'different_values' and g['crossSourceDifferences'] for g in groups)
    assert all(g['sameConfigurationEstablished'] is False and g['scope'] == 'source_record_assertions' for g in groups)
    stops = next(g for g in groups if g['family'] == 'stop_total')
    assert [v['factIds'] for v in stops['valueGroups']] == [['a', 'b'], ['c']]
    assert stops['missingSourceRecordIds'] == ['empty:d']
    assert {a['sourcePath'] for a in stops['assertions']} == {f'specifications.{x}' for x in 'abc'}
    assert all(f['comparisonGroupId'] == f"technical-field:{f['family']}" for f in annotated)


def test_repeated_assertions_within_one_record_do_not_become_cross_source_disagreement_with_a_blank():
    annotated, (group,) = compare_technical_facts([
        fact('first', 'source:a', '100', number=100), fact('second', 'source:a', '105', number=105),
        fact('missing', 'source:b', '  '),
    ], ['source:a', 'source:b'])
    assert group['status'] == 'different_values'
    assert group['withinSourceDifferences'] is True
    assert group['crossSourceDifferences'] is False
    assert group['missingSourceRecordIds'] == ['source:b']
    assert annotated[-1]['comparisonState'] == 'missing_value'
    assert len(group['assertions']) == 3


def test_zero_is_an_explicit_value_and_no_stop_rows_does_not_imply_reported_zero():
    zero = fact('zero', 'a', '0', number=0)
    _, (group,) = compare_technical_facts([zero, fact('missing', 'b', None)], ['a', 'b', 'c'])
    assert group['status'] == 'single_source'
    assert group['valueGroups'][0]['normalizedNumber'] == 0
    assert group['missingSourceRecordIds'] == ['b', 'c']
    assert coverage_summary(0, 15, [fact('summary', 'a', '105 jeux', family='source_summary')])['reportedZero'] is False
    assert coverage_summary(0, 0, [zero])['reportedZero'] is True


def test_qualified_totals_keep_their_wording_without_creating_numeric_conflicts():
    qualified = qualify_public_fact({**fact('bad', 'b', '41441', number=41441), 'summaryEvidence': {
        'aggregateQualification': {'contract': 'modavis.aggregate-quality/v1', 'status': 'suspect_source_total',
                                   'normalizedNumber': None, 'guidance': 'Questionable source quantity'}}})
    annotated, (group,) = compare_technical_facts([fact('good', 'a', '41', number=41), qualified])
    assert group['status'] == 'single_source'
    assert group['crossSourceDifferences'] is False
    assert group['valueGroups'][1]['kind'] == 'qualified'
    assert annotated[1]['comparisonState'] == 'qualified_value'
    assert annotated[1]['value'] == '41441 (questionable source value)'
    assert not coverage_summary(0, 0, [qualified])['reportedZero']


def test_words_and_numbers_are_not_compared_as_equivalent_quantities():
    _, (group,) = compare_technical_facts([fact('a', 'a', 'about 100'), fact('b', 'b', '100', number=100)])
    assert group['status'] == 'not_comparable'
    assert group['crossSourceDifferences'] is False


def test_numeric_disagreement_does_not_mark_an_uncomparable_wording_as_a_numeric_conflict():
    annotated, (group,) = compare_technical_facts([
        fact('a', 'a', '100', number=100), fact('b', 'b', '105', number=105), fact('c', 'c', 'about 100'),
    ])
    assert group['status'] == 'different_values'
    assert [a['comparisonState'] for a in annotated] == ['different_values', 'different_values', 'not_comparable']


def test_wording_variants_are_not_material_numeric_disagreements_and_signs_are_preserved():
    _, (group,) = compare_technical_facts([fact('a', 'a', 'Mechanical', family='action'), fact('b', 'b', 'Mechanisch', family='action')])
    assert group['status'] == 'different_wording'
    assert group['crossSourceDifferences'] is True
    _, (numeric,) = compare_technical_facts([fact('a', 'a', '-1', number=-1), fact('b', 'b', '1', number=1)])
    assert numeric['status'] == 'different_values'


def test_main_facts_are_not_inherited_by_dated_accounts_from_the_same_source():
    main = {'kind': 'main', 'source': {'id': 'a'}, 'stopCount': 107, 'componentCount': 137}
    historical = {'kind': 'alternative', 'source': {'id': 'a'}, 'stopCount': 87, 'componentCount': 87}
    other = {'kind': 'main', 'source': {'id': 'b'}, 'stopCount': 0, 'componentCount': 15}
    assertions = [fact('total', 'a', '105', number=105), fact('summary', 'b', '105 jeux', family='source_summary')]
    result = attach_facts([main, historical, other], assertions)
    assert result[0]['technicalFacts'][0]['comparisonKind'] == 'source_summary_vs_captured_rows'
    assert result[1]['technicalFacts'] == []
    assert result[1]['coverageSummary']['reportedStopTotals'] == []
    assert result[2]['coverageSummary']['capturedStopRows'] == 0
    assert result[2]['coverageSummary']['reportedZero'] is False
    assert 'comparisonKind' not in assertions[0]


def test_pitch_and_temperament_status_reports_within_record_divergence():
    assert assertion_status([{'sourceRecordId': 'a', 'value': '440'}, {'sourceRecordId': 'a', 'value': '442'}]) == 'sources_differ'
    assert assertion_status([{'sourceRecordId': 'a', 'value': '−1'}, {'sourceRecordId': 'b', 'value': '1'}]) == 'sources_differ'
    assert assertion_status([{'sourceRecordId': 'a', 'value': 'Equal'}, {'sourceRecordId': 'b', 'value': ' equal '}]) == 'agreement'
    assert assertion_status([{'sourceRecordId': 'a', 'value': '440'}, {'sourceRecordId': 'b', 'value': None}]) == 'single_source'


def test_account_summary_read_qualifies_all_source_assertions_once_before_comparison():
    class Result:
        def __init__(self, rows): self.rows = rows
        def fetchall(self): return self.rows
    class Connection:
        def __init__(self): self.calls = []
        def execute(self, sql, parameters):
            self.calls.append((sql, parameters))
            if 'select e.*' in sql:
                return Result([{'fact_id': 'suspect', 'evidence_json': {'aggregateQualification': {
                    'contract': 'modavis.aggregate-quality/v1', 'status': 'suspect_source_total',
                    'normalizedNumber': None, 'guidance': 'Review source wording'}}}])
            return Result([{'fact_id': key, 'family': 'stop_total', 'label': 'Stops', 'display_value': value,
                            'normalized_number': number, 'source_record_id': source, 'source_key': source,
                            'source_path': 'specifications.stop_total', 'evidence_sha256': key,
                            'conflict_state': 'none', 'source_url': None}
                           for key, source, value, number in [('usable', 'a', '10', 10), ('suspect', 'b', '10000', 10000)]])
    conn = Connection()
    facts = technical_facts(conn, 'organ', quality=True)
    assert len(conn.calls) == 2
    assert all(parameters == {'organ': 'organ'} for _, parameters in conn.calls)
    assert facts[0]['comparisonState'] == 'single_source'
    assert facts[1]['comparisonState'] == 'qualified_value'
    assert facts[1]['normalizedNumber'] is None
    assert facts[1]['sourceWording'] == '10000'


@pytest.mark.parametrize('captured,expected_mismatch', [(101, True), (0, False), (None, False)])
def test_public_bundle_does_not_label_missing_source_values_or_capture_mismatches_as_cross_source_conflicts(monkeypatch, captured, expected_mismatch):
    from contextlib import contextmanager
    from navigator_app.config import Settings
    from navigator_app import public_repository

    rows = [{
        'fact_id': identifier, 'source_record_id': source, 'family': 'stop_total', 'label': 'Stops',
        'display_value': value, 'normalized_number': number, 'captured_component_count': capture,
        'source_path': f'specifications.{identifier}', 'evidence_sha256': identifier,
        'support_state': 'source_backed', 'conflict_state': conflict,
    } for identifier, source, value, number, capture, conflict in [
        ('first', 'a', '100', 100, captured, 'material_technical_disagreement'),
        ('second', 'a', '105', 105, None, 'none'), ('missing', 'b', '', None, None, 'none'),
    ]]
    class Result:
        def __init__(self, rows): self.rows = rows
        def fetchall(self): return self.rows
    class Connection:
        def execute(self, sql, parameters):
            assert parameters == {'id': 'organ'}
            if '.specification_component' in sql: return Result([])
            if '.technical_fact ' in sql: return Result(rows)
            if '.source_membership' in sql: return Result([{'source_record_id': s, 'source_key': s, 'source_url': None} for s in ['a', 'b']])
            if '.organ_temperament_assertion' in sql: return Result([])
            raise AssertionError(sql)
    @contextmanager
    def connect(settings): yield Connection()
    monkeypatch.setattr(public_repository, 'connect', connect)
    repo = public_repository.PublicReleaseRepository(Settings())
    repo._metadata_cache = {}
    repo._resolve_organ_mdvs_id = lambda identifier: (identifier, None)
    repo._tuning_systems = lambda: []
    repo.get_organ_specification_descriptions = lambda identifier: []
    bundle = repo.get_organ_specification_bundle('organ')
    evidence = bundle['technicalEvidence']
    assert evidence['comparisonGroups'][0]['withinSourceDifferences'] is True
    assert evidence['comparisonGroups'][0]['crossSourceDifferences'] is False
    assert evidence['facts'][0]['comparisonKind'] == ('source_summary_vs_captured_rows' if expected_mismatch else None)
    assert evidence['comparisonGroups'][0]['assertions'][0]['capturedComponentCount'] == captured
    assert evidence['comparisonGroups'][0]['assertions'][0]['comparisonKind'] == evidence['facts'][0]['comparisonKind']
    assert evidence['facts'][1]['conflictState'] == 'none'
    assert evidence['facts'][2]['conflictState'] == 'none'
    assert evidence['materialConflictCount'] == 1
    assert evidence['captureMismatchCount'] == int(expected_mismatch)
    missing = next(s for s in bundle['sourceSpecifications'] if s['id'] == 'b')
    assert missing['parser']['sourceStopCount'] is None
    assert missing['stopListAvailability'] == 'no_captured_stop_rows'
    assert missing['coverageSummary']['reportedZero'] is False


@pytest.mark.parametrize('family', ['pitch_standard', 'temperament'])
def test_public_bundle_prefers_known_assertion_after_blank_without_inventing_a_difference(monkeypatch, family):
    from contextlib import contextmanager
    from navigator_app.config import Settings
    from navigator_app import public_repository

    rows = [{
        'fact_id': identifier, 'source_record_id': source, 'family': family, 'label': family,
        'display_value': value, 'normalized_number': None, 'source_path': f'specifications.{identifier}',
        'evidence_sha256': identifier, 'support_state': 'source_backed', 'conflict_state': 'none',
    } for identifier, source, value in [('blank', 'a', ''), ('known', 'b', '440')]]
    class Result:
        def __init__(self, rows): self.rows = rows
        def fetchall(self): return self.rows
    class Connection:
        def execute(self, sql, parameters):
            assert parameters == {'id': 'organ'}
            if '.specification_component' in sql: return Result([])
            if '.technical_fact ' in sql: return Result(rows)
            if '.source_membership' in sql: return Result([{'source_record_id': s, 'source_key': s, 'source_url': None} for s in ['a', 'b']])
            if '.organ_temperament_assertion' in sql:
                return Result([{'source_record_id': 'a', 'source_key': 'a', 'source_value': '', 'source_url': None}]) if family == 'temperament' else Result([])
            raise AssertionError(sql)
    @contextmanager
    def connect(settings): yield Connection()
    monkeypatch.setattr(public_repository, 'connect', connect)
    repo = public_repository.PublicReleaseRepository(Settings())
    repo._metadata_cache = {}
    repo._resolve_organ_mdvs_id = lambda identifier: (identifier, None)
    repo._tuning_systems = lambda: []
    repo.get_organ_specification_descriptions = lambda identifier: []
    bundle = repo.get_organ_specification_bundle('organ')
    evidence = bundle['technicalEvidence']['pitch' if family == 'pitch_standard' else 'temperament']
    assert evidence['status'] == 'single_source'
    assert evidence['preferredValue'] == '440'
    assert any(assertion['value'] == '' for assertion in evidence['assertions'])
