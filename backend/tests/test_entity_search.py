"""Execute the ranked SQL producer; its response also feeds the React tests.

The in-memory adapter changes only PostgreSQL placeholder/ILIKE syntax. No
preselected or already ranked pages are stubbed into the producer.
"""
from contextlib import contextmanager
import json
from pathlib import Path
import re
import sqlite3
from types import SimpleNamespace

import pytest
from werkzeug.datastructures import MultiDict

from navigator_app import public_discovery
from navigator_app.public_repository import PublicReleaseRepository

CONTRACT_PATH = Path(__file__).resolve().parents[2] / "fixtures/entity-search-contract.json"
CONTRACT = json.loads(CONTRACT_PATH.read_text())


@pytest.fixture
def corpus(monkeypatch):
    connection = sqlite3.connect(":memory:")
    connection.row_factory = sqlite3.Row
    connection.create_collation("C", lambda a, b: (a > b) - (a < b))
    connection.executescript("""
      ATTACH DATABASE ':memory:' AS release_1_5_public;
      CREATE TABLE release_1_5_public.organ(mdvs_id TEXT PRIMARY KEY,label TEXT,source_count INTEGER);
      CREATE TABLE release_1_5_public.organ_search_document(organ_mdvs_id TEXT PRIMARY KEY,search_text TEXT,place_text TEXT,builder_text TEXT,source_text TEXT);
      CREATE TABLE release_1_5_public.actor(mdvs_id TEXT PRIMARY KEY,label TEXT,actor_type TEXT);
      CREATE TABLE release_1_5_public.actor_search_document(actor_mdvs_id TEXT PRIMARY KEY,search_text TEXT);
      CREATE TABLE release_1_5_public.actor_directory_entry(canonical_actor_id TEXT,label TEXT,actor_type TEXT,search_text TEXT,organ_count INTEGER,publication_state TEXT);
      CREATE TABLE release_1_5_public.place(mdvs_id TEXT PRIMARY KEY,label TEXT,place_kind TEXT,organ_count INTEGER);
      CREATE TABLE release_1_5_public.documented_event(event_id TEXT PRIMARY KEY,organ_mdvs_id TEXT,controlled_event_type TEXT,source_event_type TEXT,source_key TEXT,source_record_id TEXT);
    """)

    class Adapter:
        def execute(self, sql, bound):
            sql = re.sub(r"%\((\w+)\)s", r":\1", sql).replace(" ILIKE ", " LIKE ")
            rows = [dict(row) for row in connection.execute(sql, bound)]
            return SimpleNamespace(fetchall=lambda: rows)

    @contextmanager
    def read(_settings):
        yield Adapter()

    monkeypatch.setattr(public_discovery, "connect", read)
    repo = SimpleNamespace(settings=None, _has_actor_directory=lambda: False,
                           snapshot_binding=lambda: {"publicCoreSha256": "a" * 64})

    def insert(table, rows):
        if rows:
            placeholders = ",".join("?" for _ in rows[0])
            connection.executemany(f"INSERT INTO release_1_5_public.{table} VALUES ({placeholders})", rows)

    def search(query="Chapel", limit=2, kinds=None):
        return PublicReleaseRepository.entity_search(repo, query=query, limit=limit, kinds=kinds)

    def filter_organs(query, builder=None):
        clauses, bound = PublicReleaseRepository._organ_filter_sql(query=query, builder=builder)
        sql = "SELECT o.mdvs_id FROM release_1_5_public.organ o WHERE " + " AND ".join(clauses)
        return {row["mdvs_id"] for row in Adapter().execute(sql, bound).fetchall()}

    yield SimpleNamespace(insert=insert, search=search, filter_organs=filter_organs, repo=repo)
    connection.close()


def populate_contract(corpus):
    corpus.insert("organ", [("MDVS:ENTY:TEST-0001-A", "Example Chapel Organ", 1),
                            ("MDVS:ENTY:TEST-0002-B", "Second Chapel Organ", 1),
                            ("MDVS:ENTY:TEST-0005-E", "Third Chapel Organ", 1)])
    corpus.insert("actor", [("MDVS:ENTY:TEST-0003-C", "Example Chapel Builder", "person"),
                            ("MDVS:ENTY:TEST-0004-D", "Second Chapel Builder", "person")])


def test_populated_search_matches_shared_frontend_rendering_contract(corpus):
    populate_contract(corpus)
    response = corpus.search()
    assert response == CONTRACT["response"]
    assert response["total"] > response["returned"]
    assert response["counts"]["canonicalActors"] == 2
    assert response["counts"]["candidateEntities"] == 0


def test_bounded_search_groups_contain_only_returned_membership(corpus):
    populate_contract(corpus)
    response = corpus.search(limit=1)
    assert response["total"] == 5
    assert response["returned"] == 1
    assert response["hasMore"]
    assert response["groups"] == [{"id": "organs", "label": "Pipe organs", "count": 1, "total": 3, "items": response["items"]}]


def test_empty_search_has_no_invented_groups_or_matching_counts(corpus):
    response = corpus.search()
    assert response["items"] == response["groups"] == []
    assert response["total"] == response["returned"] == 0
    assert not response["hasMore"]
    assert set(response["counts"].values()) == {0}


def test_exact_and_prefix_matches_are_ranked_before_limit(corpus):
    corpus.insert("organ", [(f"MDVS:ENTY:{i:04}", f"A {i} WestPoint", 1) for i in range(80)] + [
        ("MDVS:ENTY:ZZZZ", "WestPoint", 1), ("MDVS:ENTY:ZZZY", "WestPoint Chapel", 1)])
    result = corpus.search("WestPoint", limit=2)
    assert result["total"] == 82
    assert [(item["targetId"], item["searchRank"]) for item in result["items"]] == [("MDVS:ENTY:ZZZZ", 1), ("MDVS:ENTY:ZZZY", 2)]
    assert result["items"][0]["match"]["label"] == "Exact name"
    for query in ("ZZZZ", "mdvs:enty:zzzz"):
        item = corpus.search(query, limit=1)["items"][0]
        assert item["targetId"] == "MDVS:ENTY:ZZZZ"
        assert item["searchRank"] == 0


def test_location_terms_match_in_any_order_without_displacing_phrase_matches(corpus):
    target = "MDVS:ENTY:S8E6-3W8Q-Q"
    organs = [
        (target, "Bodelschwingh-Kirche (Winterhude-Uhlenhorst), Hamburg, Hamburg, Germany", 1),
        ("MDVS:ENTY:EXACT", "Hamburg Winterhude", 1),
        ("MDVS:ENTY:PREFIX", "Hamburg Winterhude Chapel", 1),
        ("MDVS:ENTY:PHRASE", "Chapel of Hamburg Winterhude", 1),
        ("MDVS:ENTY:EVIDENCE", "A Chapel", 1),
        ("MDVS:ENTY:PARTIAL", "A Chapel in Hamburg", 1),
    ]
    corpus.insert("organ", organs)
    documents = []
    for identity, title, _ in organs:
        place = "Winterhude, Hamburg" if identity == "MDVS:ENTY:EVIDENCE" else ""
        documents.append((identity, f"{title} {place}", place, "Example Builder", ""))
    corpus.insert("organ_search_document", documents)
    expected = [organs[1][0], organs[2][0], organs[3][0], target, organs[4][0]]
    result = corpus.search("hamburg winterhude", limit=5, kinds=("organs",))
    assert result["total"] == 5
    assert [item["targetId"] for item in result["items"]] == expected
    assert result["items"][3]["url"] == "/organs/S8E6-3W8Q-Q"
    assert result["items"][3]["match"]["label"] == "Name contains all search terms"
    assert result["items"][4]["match"]["field"] == "place"
    assert corpus.filter_organs("hamburg winterhude", "Example Builder") == set(expected)
    assert corpus.filter_organs("hamburg winterhude", "Builder Example") == set()
    assert corpus.filter_organs("winterhude hamburg") == set(expected)
    assert target in corpus.filter_organs("Hamburg Hamburg")


@pytest.mark.parametrize("literal,other", [("A_B", "AXB"), ("A%B", "AXYB"), (r"A\B", "AB")])
def test_literal_wildcards_and_escape_across_every_kind(corpus, literal, other):
    corpus.insert("organ", [("MDVS:ENTY:O1", literal, 1), ("MDVS:ENTY:O2", other, 1)])
    corpus.insert("actor", [("MDVS:ENTY:A1", literal, "person"), ("MDVS:ENTY:A2", other, "person")])
    corpus.insert("place", [("MDVS:LOCN:P1", literal, "source_scoped_venue_grid_cell", 1), ("MDVS:LOCN:P2", other, "city", 1)])
    corpus.insert("documented_event", [("event:r05:one", "MDVS:ENTY:O2", None, literal, "example", "row1"),
                                       ("event:r05:two", "MDVS:ENTY:O2", None, other, "example", "row2")])
    result = corpus.search(literal, limit=10)
    assert result["total"] == 4
    assert result["counts"] == {"organs": 1, "canonicalActors": 1, "places": 1, "events": 1, "candidateEntities": 0, "vmiCandidates": 0}
    place = next(item for item in result["items"] if item["searchGroup"] == "places")
    assert place["kind"] == "source_place" and "Source-scoped" in place["summary"]
    event = corpus.search("event:r05:one", limit=1)["items"][0]
    assert event["searchRank"] == 0 and event["url"] == "/events/event%3Ar05%3Aone"
    assert corpus.search(f"absent {literal}", limit=10)["total"] == 0
    corpus.insert("organ", [("MDVS:ENTY:O3", f"{literal} Chapel", 1),
                            ("MDVS:ENTY:O4", f"{other} Chapel", 1)])
    assert [item["targetId"] for item in corpus.search(f"Chapel {literal}", kinds=("organs",))["items"]] == ["MDVS:ENTY:O3"]


def test_document_match_explains_builder_and_keeps_canonical_actor_scope(corpus):
    corpus.insert("organ", [("MDVS:ENTY:O1", "Chapel", 1)])
    corpus.insert("organ_search_document", [("MDVS:ENTY:O1", "Chapel Silbermann", "", "Silbermann", "")])
    corpus.insert("actor_directory_entry", [("MDVS:ENTY:A1", "Silbermann", "person", "Silbermann", 2, "canonical"),
                                            (None, "Silbermann source mention", "person", "Silbermann", 1, "source_mention")])
    corpus.repo._has_actor_directory = lambda: True
    result = corpus.search("Silbermann", limit=10)
    assert result["total"] == 2
    assert result["items"][0]["searchGroup"] == "people"
    assert result["items"][1]["match"]["field"] == "builder"
    assert result["excludedScopes"][0]["url"] == "/pod-explorer"


def test_event_discovery_preserves_normalized_and_fallback_wording(corpus):
    organ = "MDVS:ENTY:O1"
    corpus.insert("organ", [(organ, "Chapel", 1)])
    corpus.insert("documented_event", [
        ("event:r05:fallback", organ, None, None, "example", "row1"),
        ("event:r05:typed", organ, "organ_repair", "mending", "example", "row2"),
    ])
    for query, expected, title in (
        ("documented", "event:r05:fallback", "documented event"),
        ("organ repair", "event:r05:typed", "organ repair"),
        ("repair organ", "event:r05:typed", "organ repair"),
        ("repair", "event:r05:typed", "organ repair"),
        ("organ_repair", "event:r05:typed", "organ repair"),
    ):
        result = corpus.search(query, kinds=("events",))
        assert result["total"] == 1
        assert (result["items"][0]["targetId"], result["items"][0]["title"]) == (expected, title)


@pytest.mark.parametrize("pairs", [[("q", "x"), ("q", "y")], [("typo", "x")], [("limit", "0")], [("limit", "9" * 5000)], [("kinds", "people,people")]])
def test_discovery_rejects_ambiguous_or_unbounded_query(pairs):
    with pytest.raises(ValueError):
        public_discovery.validate_discovery_query(MultiDict(pairs))
