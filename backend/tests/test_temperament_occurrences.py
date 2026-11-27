from contextlib import contextmanager
from threading import Lock
from types import SimpleNamespace

import pytest

from navigator_app import public_repository
from navigator_app.public_repository import PublicReleaseRepository
from navigator_app.public_specification_comparisons import compare_technical_facts
from navigator_app.temperament_lookup import search_temperaments
from navigator_app.temperament_occurrences import EXACT, FAMILY, TemperamentOccurrenceMatcher


def record(record_id, title):
    return {
        "id": record_id,
        "tuningId": record_id,
        "label": record_id,
        "title": title,
        "groupKey": "test",
        "precision": {"isPreciseVariant": record_id.endswith("_g")},
        "commentary": {"available": False},
    }


CATALOGUE = [
    record("1h53", "53-stufige Temperatur 1"),
    record("1h53_g", "53-stufige Temperatur 1 genauer"),
    record("2h53_g", "53-stufige Temperatur 2 genauer"),
    record("2hKi1", "Kirnberger 1"),
    record("2hKi2", "Kirnberger 2"),
    record("5hKi3Kn", "Kirnberger 3 (nach Kellner)"),
    record("5hVal", "Vallotti"),
    record("5hVal_g", "Vallotti genauer"),
    record("5hValB", "Vallotti/Barca"),
    record("5hWe3", "Werckmeister 3"),
    record("5hWe3_g", "Werckmeister 3 genauer"),
    record("4hWe4No", "Werckmeister 4 (nach Norrback)"),
    record("5hwoKn", "wohltemperiert (nach Kellner)"),
    record("7hgl", "gleichstufig"),
    record("7hgl_g", "gleichstufig genauer"),
]


@pytest.mark.parametrize(("wording", "matches"), [
    ("1h53_g", {"1h53_g": EXACT}),
    ("53–stufige TEMPERATUR 1 genauer", {"1h53_g": EXACT}),
    ("53-stufige Temperatur 1", {"1h53": FAMILY, "1h53_g": FAMILY}),
    ("Kirnberger II", {"2hKi2": EXACT}),
    ("Kirnberger III", {"5hKi3Kn": FAMILY}),
    ("Werckmeister III (modified)", {"5hWe3": FAMILY, "5hWe3_g": FAMILY}),
    ("Werckmeister II", {}),
    ("Werckmeister 30", {}),
    ("Werckmeister 1691", {"5hWe3": FAMILY, "5hWe3_g": FAMILY, "4hWe4No": FAMILY}),
    ("Other (Werckmeister III)", {}),
    ("unrelatedwerckmeister", {}),
    ("Valotti", {"5hVal": FAMILY, "5hVal_g": FAMILY}),
    ("Vallotti/Barca (modified)", {"5hValB": FAMILY}),
    ("Equal temperament", {"7hgl": FAMILY, "7hgl_g": FAMILY}),
    ("Equal at 440.0 Hz", {"7hgl": FAMILY, "7hgl_g": FAMILY}),
    ("Kellner", {"5hwoKn": FAMILY}),
    ("Bach-Kellner", {}),
    ("Non-equal temperament", {}),
    ("31-step equal temperament", {}),
    ("Unequal temperament", {}),
])
def test_source_wording_classification(wording, matches):
    assert TemperamentOccurrenceMatcher(CATALOGUE).match(wording) == matches


def test_source_language_alias_is_discoverable_without_asserting_identity():
    lookup = search_temperaments("Equal temperament", CATALOGUE, identity_only=True)
    assert lookup.ids == {"7hgl", "7hgl_g"}
    assert lookup.interpretation["kind"] == "related"


@pytest.fixture
def repository(monkeypatch):
    repo = object.__new__(PublicReleaseRepository)
    repo.settings = None
    repo._metadata_cache = {"public_place_detail_contract": "modavis.public-place-detail/v1"}
    repo._tuning_occurrence_cache = None
    repo._tuning_occurrence_cache_lock = Lock()
    repo._tuning_systems = lambda: CATALOGUE
    repo.get_tuning_system = lambda tuning_id, **kwargs: next(
        (record for record in CATALOGUE if record["id"] == tuning_id), None,
    )
    rows = [
        {"organ_mdvs_id": organ_id, "title": organ_id, "source_record_id": source_id,
         "source_value": wording, "country": "Germany"}
        for organ_id, source_id, wording in (
            ("A", "source-1", "Werckmeister III"),
            ("A", "source-2", "5hWe3"),
            ("B", "source-3", "Werckmeister III"),
            ("C", "source-4", "Kirnberger II"),
        )
    ]
    database_reads = []

    facts = [
        {"organ_mdvs_id": "B", "title": "B", "source_record_id": "source-3",
         "display_value": "  Werckmeister III ", "family": "temperament"},
        {"organ_mdvs_id": "D", "title": "D", "source_record_id": "sr:pipeorganmap:example",
         "source_key": "pipeorganmap", "display_value": "Equal at 440 Hz",
         "family": "temperament", "source_path": "specifications.temperament"},
        {"organ_mdvs_id": "E", "title": "E", "source_record_id": "sr:ohs:example",
         "display_value": "2", "family": "temperament"},
    ]

    def execute(sql, params=None):
        database_reads.append(sql)
        if "organ_temperament_assertion" in sql:
            result = rows
        elif ".technical_fact" in sql:
            result = facts
        else:
            assert ".place_assertion" in sql
            assert params == {"ids": ["D"]}
            result = [{
                "organ_mdvs_id": "D", "preferred_label": "Norwich Cathedral, Norwich, United Kingdom",
                "source_hierarchy_json": [{"role": "country", "value": "United Kingdom"}],
            }]
        return SimpleNamespace(fetchall=lambda: result)

    @contextmanager
    def connect(_settings):
        yield SimpleNamespace(execute=execute)

    monkeypatch.setattr(public_repository, "connect", connect)
    yield repo
    assert len(database_reads) == 3


def test_occurrence_counts_sort_filter_and_paginate_before_slicing(repository):
    desc = repository.list_tuning_systems(sort="occurrences_desc", min_occurrences=1, limit=1, query="Werckmeister")
    assert desc["total"] == 2
    assert desc["items"][0]["id"] == "5hWe3"
    assert desc["items"][0]["occurrences"] == {
        "total": 2, "exactVariantCount": 1, "familyWordingCount": 1,
    }
    asc = repository.list_tuning_systems(
        sort="occurrences_asc", occurrence_scope="family", min_occurrences=1, max_occurrences=2,
        limit=1, offset=1, query="Werckmeister",
    )
    assert asc["total"] == 2
    assert asc["items"][0]["id"] == "5hWe3_g"
    none_exact = repository.list_tuning_systems(query="Werckmeister", occurrence_scope="exact", max_occurrences=0)
    assert [item["id"] for item in none_exact["items"]] == ["5hWe3_g", "4hWe4No"]


def test_tuning_detail_and_map_share_disjoint_organ_cohorts(repository):
    all_organs = repository.list_organs_for_tuning_system("5hWe3", limit=1)
    assert all_organs["total"] == 2
    assert all_organs["scope"] == "all"
    assert all_organs["hasMore"]
    assert all_organs["exactVariantCount"] == all_organs["familyWordingCount"] == 1
    organ = all_organs["items"][0]
    assert organ["mdvsId"] == "A"
    assert organ["matchKind"] == EXACT
    assert {assertion["matchKind"] for assertion in organ["assertions"]} == {FAMILY, EXACT}
    for scope, organ_id in (("exact", "A"), ("family", "B")):
        filtered = repository.list_organs_for_tuning_system("5hWe3", scope=scope)
        assert filtered["total"] == 1
        assert filtered["scope"] == scope
        assert filtered["exactVariantCount"] == filtered["familyWordingCount"] == 1
        assert [item["mdvsId"] for item in filtered["items"]] == [organ_id]
        assert repository._temperament_organ_ids("5hWe3", scope) == (organ_id,)
        if scope == "family":
            assert len(filtered["items"][0]["assertions"]) == 1


def test_fact_only_wording_joins_the_same_evidence_cohort(repository):
    candidates = repository.list_tuning_systems(query="Equal at 440 Hz", query_scope="evidence")
    assert [item["id"] for item in candidates["items"]] == ["7hgl", "7hgl_g"]
    detail = repository.list_organs_for_tuning_system("7hgl", scope="family")
    assert detail["total"] == 1
    (organ,) = detail["items"]
    assert organ["country"] == "United Kingdom"
    assert organ["location"].startswith("Norwich Cathedral")
    assert organ["assertions"][0]["sourcePath"] == "specifications.temperament"
    assert repository.list_tuning_systems(query="Non-equal temperament", query_scope="evidence")["total"] == 0


@pytest.mark.parametrize(("values", "summary_status", "group_status"), [
    ([("Equal temperament", "orgbase"), ("Equal", "pipeorganmap")], "equivalent_wording", "equivalent_wording"),
    ([("Bach/Kellner", "orgbase"), ("5", "ohs")], "not_comparable", "not_comparable"),
    ([("2", "ohs")], "source_code_only", "source_code_only"),
    ([("Equal temperament", "orgbase"), ("Unequal", "pipeorganmap")], "sources_differ", "different_values"),
    ([("Kellner", "orgbase"), ("Bach-Kellner", "pipeorganmap")], "different_wording", "different_wording"),
])
def test_specification_and_fact_comparison_preserve_raw_wording(values, summary_status, group_status):
    repo = object.__new__(PublicReleaseRepository)
    repo._tuning_systems = lambda: CATALOGUE
    rows = [
        {"source_value": value, "source_key": source, "source_record_id": f"sr:{source}:{index}"}
        for index, (value, source) in enumerate(values)
    ]
    evidence = repo._organ_temperament_evidence(rows)
    assert evidence["status"] == summary_status
    assert [assertion["rawValue"] for assertion in evidence["assertions"]] == [value for value, _ in values]
    facts = [
        {"id": str(index), "family": "temperament", "label": "Temperament",
         "displayValue": assertion["rawValue"], "sourceRecordId": assertion["sourceRecordId"]}
        for index, assertion in enumerate(evidence["assertions"])
    ]
    annotated, (group,) = compare_technical_facts(facts)
    assert group["status"] == group_status
    if summary_status == "equivalent_wording":
        assert group["crossSourceDifferences"] is False
        assert [fact["temperamentComparisonKey"] for fact in annotated] == ["class:equal"] * 2
        assert evidence["catalogRelation"]["matchingRecordCount"] == 2
    for fact, assertion in zip(annotated, evidence["assertions"]):
        if assertion["source"] == "ohs":
            assert fact["valueKind"] == "source_code"
            assert "temperamentComparisonKey" not in fact
            assert assertion["catalogUrl"] is None
    if summary_status == "source_code_only":
        assert evidence["preferredValue"] is None
        assert evidence["catalogRelation"]["matchingRecordCount"] == 0


def test_organ_tuning_exposes_retained_bdo_url_only_for_exact_catalogue_relation():
    repo = object.__new__(PublicReleaseRepository)
    primary_url = "https://bund-deutscher-orgelbaumeister.de/stimmungen/template.htm?label=2hKi2"
    repo._tuning_systems = lambda: [
        {**item, "sourceUrl": primary_url} if item["id"] == "2hKi2" else item
        for item in CATALOGUE
    ]

    def relation(wording, source="orgbase"):
        return repo._organ_temperament_evidence([
            {"source_value": wording, "source_key": source, "source_record_id": f"sr:{source}:1"},
        ])["catalogRelation"]

    exact = relation("Kirnberger II")
    assert exact["exactRecordUrl"] == "/temperaments/2hKi2"
    assert exact["exactRecordSourceUrl"] == primary_url
    related = relation("Kirnberger II (modified)")
    assert related["state"] == "candidate_set"
    assert related["exactRecordSourceUrl"] is None
    assert relation("2", "ohs")["exactRecordSourceUrl"] is None
