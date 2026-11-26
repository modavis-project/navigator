"""Whole-request budgets, safe failures and immutable bounded caches."""
from contextlib import contextmanager
import json
import sqlite3
import time
from types import SimpleNamespace

from flask import Flask, jsonify
import pytest
from psycopg import OperationalError
from psycopg.errors import QueryCanceled
from psycopg_pool import PoolTimeout

from navigator_app import db
from navigator_app import public_repository
from navigator_app.capability_health import register_capability_health
from navigator_app.config import Settings
from navigator_app.public_query_cache import BoundedQueryCache, snapshot_cached
from navigator_app.public_query_identity import SnapshotBindingChanged, semantic_query_identity
from navigator_app.public_read_cache import SNAPSHOT_HEADER, public_read_snapshot, register_public_read_cache
from navigator_app.public_repository import PublicReleaseRepository
from navigator_app.request_reliability import register_request_reliability


def test_ranked_organ_pages_reuse_database_order_and_exact_counts(monkeypatch):
    repo = PublicReleaseRepository(Settings())
    monkeypatch.setattr(repo, "_stop_total_expression", lambda: "max(normalized_number)::int")
    monkeypatch.setattr(repo, "_has_entity_exports", lambda: False)
    order = ("organ-c", "organ-a", "organ-b", "organ-d")
    matched = ("organ-d", "organ-a", "organ-c")
    index_reads = []
    hydrated = []

    class Connection:
        def execute(self, sql, params):
            if "rank_limit" in params:
                assert "sc.stop_count desc nulls last, lower(o.label), o.mdvs_id" in sql
                index_reads.append(sql)
                return ({"mdvs_id": key} for key in order)
            if "page_ids" in params:
                assert "with ordinality" in sql and "order by o.catalogue_position" in sql
                hydrated.append(params["page_ids"])
                return SimpleNamespace(fetchall=lambda: params["page_ids"])
            assert "select o.mdvs_id" in sql
            return ({"mdvs_id": key} for key in matched)

    connection = Connection()
    assert repo._list_organ_page(connection, "", {"limit": 2, "offset": 0}, "stops") == (4, ["organ-c", "organ-a"])
    assert repo._list_organ_page(connection, "", {"limit": 2, "offset": 2}, "stops") == (4, ["organ-b", "organ-d"])
    assert repo._list_organ_page(connection, "where selected", {"limit": 2, "offset": 1}, "stops") == (3, ["organ-a", "organ-d"])
    assert repo._list_organ_page(connection, "where selected", {"limit": 2, "offset": 3}, "stops") == (3, [])
    assert len(index_reads) == 1
    assert hydrated == [["organ-c", "organ-a"], ["organ-b", "organ-d"], ["organ-a", "organ-d"]]


def test_oversized_organ_order_uses_the_regular_bounded_query(monkeypatch):
    repo = PublicReleaseRepository(Settings())
    monkeypatch.setattr(repo, "_stop_total_expression", lambda: "max(normalized_number)::int")
    monkeypatch.setattr(repo, "_has_entity_exports", lambda: False)
    monkeypatch.setattr(public_repository, "STOP_ORDER_MAX_ROWS", 2)
    rank_attempts = []

    class Connection:
        def execute(self, sql, params):
            if "rank_limit" in params:
                assert params["rank_limit"] == 3
                rank_attempts.append(sql)
                return ({"mdvs_id": key} for key in ("organ-c", "organ-a", "organ-b"))
            if "count(*)::int as count" in sql:
                return SimpleNamespace(fetchone=lambda: {"count": 3})
            assert "limit %(limit)s offset %(offset)s" in sql
            return SimpleNamespace(fetchall=lambda: ["organ-a"])

    connection = Connection()
    query = {"limit": 1, "offset": 1}
    assert repo._list_organ_page(connection, "", query, "stops") == (3, ["organ-a"])
    assert repo._list_organ_page(connection, "", query, "stops") == (3, ["organ-a"])
    assert len(rank_attempts) == 1


def test_deadline_is_consumed_across_statements_and_connection_wait(monkeypatch):
    now = [100.0]
    monkeypatch.setattr(db.time, "monotonic", lambda: now[0])
    commands = []
    waits = []

    class Connection:
        @contextmanager
        def transaction(self):
            yield

        def execute(self, sql, args=None):
            commands.append((sql, args))
            return self

    class Pool:
        @contextmanager
        def connection(self, timeout):
            waits.append(timeout)
            now[0] += 2  # Pool wait consumes the same budget.
            yield Connection()

    monkeypatch.setattr(db, "_pool", lambda settings: Pool())
    token = db.query_deadline.set(110.0)
    try:
        with db.connect(None) as conn:
            conn.execute("SELECT first_read")
            now[0] += 5
            conn.execute("SELECT second_read")
            now[0] += 3
            with pytest.raises(TimeoutError):
                conn.execute("SELECT forbidden_after_expiry")
    finally:
        db.query_deadline.reset(token)
    assert waits == [10.0]
    assert commands[0][0] == "SET TRANSACTION READ ONLY"
    assert [args[0] for sql, args in commands if "set_config" in sql] == ["8000", "8000", "3000"]
    assert not any("forbidden_after_expiry" in sql for sql, _ in commands)


def test_sqlite_read_cancels_under_inherited_budget():
    connection = sqlite3.connect(":memory:")
    token = db.query_deadline.set(time.monotonic() + 0.005)
    try:
        db.constrain_sqlite_reads(connection, 60)
        with pytest.raises(sqlite3.OperationalError, match="interrupted"):
            connection.execute("WITH RECURSIVE n(x) AS (VALUES(1) UNION ALL SELECT x+1 FROM n WHERE x<100000000) SELECT sum(x) FROM n").fetchone()
    finally:
        db.query_deadline.reset(token)
        connection.close()


def app_with_route(action):
    app = Flask(__name__)
    app.config["TESTING"] = True
    register_request_reliability(app)
    app.add_url_rule("/api/read", "read", action)
    return app


@pytest.mark.parametrize("error,status,code", [
    (TimeoutError("private SQL"), 504, "query_timeout"),
    (QueryCanceled("private SQL"), 504, "query_timeout"),
    (PoolTimeout("postgresql://secret"), 503, "read_capacity_unavailable"),
    (OperationalError("password=private"), 503, "database_unavailable"),
    (sqlite3.OperationalError("interrupted"), 504, "query_timeout"),
    (SnapshotBindingChanged("/private/input"), 409, "snapshot_binding_changed"),
])
def test_failures_are_controlled_and_request_context_is_reset(error, status, code):
    def action():
        assert db.query_deadline.get() is not None
        raise error
    app = app_with_route(action)
    assert db.query_deadline.get() is None
    response = app.test_client().get("/api/read")
    assert response.status_code == status
    assert response.json["error"] == code
    assert response.headers["Cache-Control"] == "no-store"
    assert "private" not in response.get_data(as_text=True)
    assert "secret" not in response.get_data(as_text=True)
    assert db.query_deadline.get() is None


@pytest.mark.parametrize("header", ["0", "-1", "1.5", "x", "9" * 5000, "１２"])
def test_untrusted_timeout_header_is_bounded(header):
    app = app_with_route(lambda: jsonify(ok=True))
    response = app.test_client().get("/api/read", headers={"X-Request-Timeout-Ms": header})
    assert response.status_code == 400
    assert response.json["error"] == "invalid_request_budget"
    assert db.query_deadline.get() is None


def test_client_cannot_extend_budget_and_nested_context_is_preserved(monkeypatch):
    monkeypatch.setattr(db.time, "monotonic", lambda: 100.0)
    app = app_with_route(lambda: jsonify(deadline=db.query_deadline.get()))
    token = db.query_deadline.set(104.0)
    try:
        response = app.test_client().get("/api/read", headers={"X-Request-Timeout-Ms": "99999999"})
        assert response.json["deadline"] == 104.0
        assert db.query_deadline.get() == 104.0
        response = app.test_client().get("/api/read", headers={"X-Request-Timeout-Ms": "100"})
        assert response.json["deadline"] == 100.1
    finally:
        db.query_deadline.reset(token)


def test_successful_export_preparation_past_deadline_becomes_error(monkeypatch):
    now = [100.0]
    monkeypatch.setattr(db.time, "monotonic", lambda: now[0])
    app = Flask(__name__)
    register_request_reliability(app)

    @app.get("/api/export")
    def export():
        assert db.query_deadline.get() == 125.0
        now[0] = 126.0
        return b"archive"

    response = app.test_client().get("/api/export")
    assert response.status_code == 504 and response.json["error"] == "query_timeout"
    assert response.headers["Cache-Control"] == "no-store"


@pytest.mark.parametrize("path,server_budget", [
    ("/api/workbench/dispositions", 25),
    ("/api/workbench/dispositions/export", 30),
    ("/api/workbench/selection", 10),
    ("/api/workbench/selection/export", 25),
])
def test_disposition_deadlines_are_bounded_and_route_specific(monkeypatch, path, server_budget):
    now = [100.0]
    monkeypatch.setattr(db.time, "monotonic", lambda: now[0])
    app = Flask(__name__)
    register_request_reliability(app)

    def selection():
        deadline = db.query_deadline.get()
        now[0] += 1
        return jsonify(deadline=deadline, items=[])

    app.add_url_rule(path, "selection", selection)
    client = app.test_client()
    response = client.get(path, headers={"X-Request-Timeout-Ms": "30001"})
    assert response.status_code == 200 and response.json["deadline"] == 100.0 + server_budget
    assert response.headers["X-MODAVIS-Query-Budget-Ms"] == str(server_budget * 1000)

    response = client.get(path, headers={"X-Request-Timeout-Ms": "100"})
    assert response.status_code == 504 and response.json["error"] == "query_timeout"
    assert response.headers["X-MODAVIS-Query-Budget-Ms"] == "100"
    assert "items" not in response.json


def test_area_detail_allows_cold_country_counts_without_extending_lookup():
    app = Flask(__name__)
    register_request_reliability(app)
    app.add_url_rule("/api/areas/<identifier>", "public_area", lambda identifier: jsonify(id=identifier))
    app.add_url_rule("/api/areas", "search_public_areas", lambda: jsonify(items=[]))
    client = app.test_client()
    assert client.get("/api/areas").headers["X-MODAVIS-Query-Budget-Ms"] == "10000"
    detail = "/api/areas/locadmin:example"
    assert client.get(detail).headers["X-MODAVIS-Query-Budget-Ms"] == "18000"
    response = client.get(detail, headers={"X-Request-Timeout-Ms": "9000"})
    assert response.headers["X-MODAVIS-Query-Budget-Ms"] == "9000"


@pytest.mark.parametrize("path,server_budget", [
    ("/api/organs", 10000),
    ("/api/explore", 10000),
    ("/api/entities/search", 10000),
    ("/api/workbench/compare", 25000),
    ("/api/workbench/account/example", 25000),
    ("/api/research-exploration/network/export", 25000),
])
def test_package_format_does_not_extend_non_package_reads(path, server_budget):
    app = Flask(__name__)
    register_request_reliability(app)
    app.add_url_rule(path, "read", lambda: jsonify(ok=True))
    response = app.test_client().get(path, query_string={"format": "ro-crate"})
    assert response.headers["X-MODAVIS-Query-Budget-Ms"] == str(server_budget)


@pytest.mark.parametrize("target", [
    "/api/entities/search?q=%00",
    "/api/organs?q=valid&q=bad%00value",
    "/api/explore?bad%00key=valid",
])
def test_api_refuses_nul_query_parameters_before_reading(target):
    def forbidden():
        raise AssertionError("Invalid query reached the repository")

    app = Flask(__name__)
    app.config["TESTING"] = True
    register_request_reliability(app, SimpleNamespace(snapshot_binding=forbidden))
    app.add_url_rule(target.split("?", 1)[0], "read", forbidden)
    response = app.test_client().get(target)
    assert response.status_code == 400 and response.json["error"] == "invalid_query_text"
    assert response.headers["Cache-Control"] == "no-store"
    assert db.query_deadline.get() is None


def test_encoded_percent_text_is_not_treated_as_nul():
    response = app_with_route(lambda: jsonify(ok=True)).test_client().get("/api/read?q=%2500")
    assert response.status_code == 200


def test_cache_has_entry_byte_age_and_lru_limits():
    now = [0.0]
    cache = BoundedQueryCache(max_entries=2, max_bytes=10, ttl=2, clock=lambda: now[0])
    cache.put("a", b"111")
    cache.put("b", b"222")
    assert cache.get("a") == b"111"
    cache.put("c", b"333")
    assert cache.get("b") is None
    assert cache.bytes == 8
    cache.put("oversize-key", b"x")
    assert cache.get("oversize-key") is None
    now[0] = 3
    assert cache.get("missing") is None  # Expire all stale entries, not just the requested key.
    assert cache.bytes == 0 and not cache.entries


def test_cached_responses_are_snapshot_scoped_and_mutation_isolated():
    class Repo:
        def __init__(self):
            self.snapshot = "first"
            self.calls = 0
            self._public_query_cache = BoundedQueryCache()

        def snapshot_binding(self):
            return {"snapshot": self.snapshot}

        @snapshot_cached
        def read(self, query):
            self.calls += 1
            return {"items": [query], "snapshot": self.snapshot}

    repo = Repo()
    repo.read("chapel")["items"].append("changed")
    assert repo.read("chapel")["items"] == ["chapel"] and repo.calls == 1
    repo.snapshot = "second"
    assert repo.read("chapel")["snapshot"] == "second" and repo.calls == 2
    assert Repo().read("chapel")["snapshot"] == "first"


def test_public_read_cache_reuses_anonymous_reads_and_revalidates_on_pod_change():
    def setup(source):
        app = Flask(__name__)
        calls = []
        binding = {"sourceReleaseVersion": "1.6.0", "publicCoreSha256": source}
        snapshot = public_read_snapshot(binding, Settings(uri_release_version="1.6.0"))
        register_public_read_cache(app, snapshot)

        def read():
            calls.append(source)
            return jsonify(corpus=source)

        app.add_url_rule("/api/organs", "organ_list", read)
        app.add_url_rule("/api/release-context", "release_context", lambda: jsonify(readSnapshot=snapshot))
        return app, snapshot, calls

    app, snapshot, calls = setup("old")
    first_visit = app.test_client()
    release = first_visit.get("/api/release-context")
    assert release.headers["Cache-Control"] == "private, no-cache"
    assert release.json["readSnapshot"] == snapshot
    assert first_visit.get("/api/release-context", headers={"If-None-Match": release.headers["ETag"]}).status_code == 304

    headers = {SNAPSHOT_HEADER: snapshot}
    cold = first_visit.get("/api/organs?limit=1", headers=headers)
    assert "immutable" in cold.headers["Cache-Control"]
    assert {SNAPSHOT_HEADER, "Cookie", "Authorization"}.issubset(cold.vary)
    assert 'navigator-cache;desc="miss"' in cold.headers["Server-Timing"]
    headers["If-None-Match"] = cold.headers["ETag"]
    second_visit = app.test_client().get("/api/organs?limit=1", headers=headers)
    assert second_visit.status_code == 304
    assert 'navigator-cache;desc="hit"' in second_visit.headers["Server-Timing"]
    assert calls == ["old"]

    current, current_snapshot, _ = setup("new")
    assert current_snapshot != snapshot
    client = current.test_client()
    latest = client.get("/api/organs?limit=1", headers=headers)
    assert latest.json == {"corpus": "new"}
    assert latest.headers["Cache-Control"] == "private, no-cache"
    assert latest.headers["ETag"] != cold.headers["ETag"]
    assert "immutable" in client.get("/api/organs?limit=1", headers={SNAPSHOT_HEADER: current_snapshot}).headers["Cache-Control"]


def test_shared_cache_excludes_private_and_free_text_reads():
    app = Flask(__name__)
    register_public_read_cache(app, "current")
    calls = []

    def read():
        calls.append(len(calls) + 1)
        return jsonify(read=calls[-1])

    app.add_url_rule("/api/organs", "organ_list", read)
    client = app.test_client()
    assert client.get("/api/organs").json == {"read": 1}
    for extra in ({"Authorization": "Bearer example"}, {"X-Navigator-Actor-Id": "researcher"}):
        response = client.get("/api/organs", headers={SNAPSHOT_HEADER: "current", **extra})
        assert response.headers["Cache-Control"] == "no-store"
        assert response.json != {"read": 1}
    client.set_cookie("session", "example")
    assert client.get("/api/organs").headers["Cache-Control"] == "no-store"
    client.delete_cookie("session")
    assert client.get("/api/organs?mode=depth").headers["Cache-Control"] == "no-store"
    assert client.get("/api/organs?q=Oxford").json != client.get("/api/organs?q=Oxford").json
    assert client.get("/api/organs").json == {"read": 1}


def test_semantic_identity_is_key_order_stable_but_retains_all_operands():
    first = semantic_query_identity("selection", {"source": "a", "q": "Straße"}, bindings={"snapshot": "x"}, method="v1")
    same = semantic_query_identity("selection", {"q": "Straße", "source": "a"}, bindings={"snapshot": "x"}, method="v1")
    assert first == same
    for parameters, bindings, method in [({"source": "a", "q": "strasse"}, {"snapshot": "x"}, "v1"),
                                        ({"source": "a", "q": "Straße"}, {"snapshot": "y"}, "v1"),
                                        ({"source": "a", "q": "Straße"}, {"snapshot": "x"}, "v2")]:
        assert semantic_query_identity("selection", parameters, bindings=bindings, method=method)["sha256"] != first["sha256"]


def test_repository_manifest_change_and_removal_fail_closed(tmp_path):
    path = tmp_path / "manifest.json"
    path.write_text(json.dumps({"sourcePublicCore": {"sha256": "a" * 64}}))
    repo = object.__new__(PublicReleaseRepository)
    repo.settings = SimpleNamespace(public_database_manifest_path=str(path), public_source_release_version="1.6.0", identifier_ledger_sha256="b" * 64)
    repo.policy = SimpleNamespace(policy_version="2")
    repo._metadata_cache = {"public_core_sqlite_sha256": "a" * 64}
    original = repo.snapshot_binding()
    assert original["publicCoreSha256"] == "a" * 64
    path.write_text(json.dumps({"sourcePublicCore": {"sha256": "c" * 64}}))
    with pytest.raises(SnapshotBindingChanged):
        repo.snapshot_binding()
    path.unlink()
    with pytest.raises(SnapshotBindingChanged):
        repo.snapshot_binding()


def test_capability_health_optional_loss_does_not_disable_core(tmp_path, monkeypatch):
    for key in ("NAVIGATOR_WORKBENCH_MANIFEST", "NAVIGATOR_RESEARCH_INDEX", "NAVIGATOR_EXPLORATION_MANIFEST", "NAVIGATOR_OMARO_MANIFEST"):
        monkeypatch.delenv(key, raising=False)
    ledger = tmp_path / "ledger.csv"
    ledger.write_text("verified ledger")
    root = tmp_path / "research"
    root.mkdir()
    (root / "manifest.json").write_text("verified manifest")
    (root / "research.sqlite").write_text("verified fixture")
    app = Flask(__name__)
    app.extensions["organological_research"] = SimpleNamespace(root=root, manifest={"files": {"research.sqlite": {}}}, assert_binding=lambda: None)
    repo = SimpleNamespace(ping=lambda: True, snapshot_binding=lambda: {"snapshot": "x"})
    settings = SimpleNamespace(identifier_ledger_path=ledger)
    health = register_capability_health(app, repo, settings, {"ok": True, "capabilities": ["catalog", "map"]})
    document = health.document()
    assert document["ok"] and document["capabilityStates"]["researchIndex"]["available"]
    assert document["capabilityStates"]["workbench"]["status"] == "not_configured"
    (root / "research.sqlite").unlink()
    document = health.document()
    assert document["ok"] and document["capabilityStates"]["researchIndex"]["reason"] == "resource_missing"
    assert str(tmp_path) not in json.dumps(document)
    app.add_url_rule("/api/research/organ", "organ", lambda: jsonify(ok=True))
    assert app.test_client().get("/api/research/organ").status_code == 503
    ledger.write_text("changed ledger")
    assert not health.document()["ok"]


def test_organ_card_exposes_record_collection_and_builder_uncertainty_separately():
    repo = SimpleNamespace(source_release_version="1.6.0", policy=SimpleNamespace(release_version="1.6.0"))
    card = PublicReleaseRepository._organ_card(repo, {
        "mdvs_id": "MDVS:ENTY:EXAMPLE", "label": "Chapel", "source_count": 99,
        "source_record_count": 6, "source_collection_count": 2,
        "builder_label": "Restoration workshop", "builder_mdvs_id": "MDVS:ENTY:BUILDER",
        "builder_count": 3, "builder_assertion_count": 7,
    })
    assert card["sourceSummary"] == {"sourceRecords": 6, "collections": 2}
    assert card["summary"] == "Documented in 2 source collection(s)."
    assert card["sourceCount"] == 99  # Compatibility field is not silently redefined.
    assert card["builderSummary"]["role"] is None and card["builderSummary"]["period"] is None
    assert card["builderSummary"]["documentedActorCount"] == 3
    assert "does not establish" in card["builderSummary"]["qualification"]


@pytest.mark.parametrize(("release_version", "place_id", "assertion_id", "page_url"), [
    ("1.6.0", "MDVS:LOCN:EXAMPLE", "manifestation_location:r12:42", "/places/EXAMPLE"),
    ("1.6.0", None, "manifestation_location:r12:42", "/places/manifestation_location%3Ar12%3A42"),
    ("1.5.1", None, "manifestation_location:r12:42", None),
    ("1.6.0", None, None, None),
])
def test_organ_card_keeps_navigator_place_route_separate_from_uri(release_version, place_id, assertion_id, page_url):
    repo = SimpleNamespace(source_release_version=release_version, policy=SimpleNamespace(release_version=release_version))
    uri = "https://w3id.org/modavis/location/EXAMPLE" if place_id else None
    card = PublicReleaseRepository._organ_card(repo, {
        "mdvs_id": "MDVS:ENTY:EXAMPLE", "place_mdvs_id": place_id,
        "place_assertion_id": assertion_id, "place_url": uri,
    })
    assert card["placePageUrl"] == page_url
    assert card["placeMdvsId"] == place_id
    assert card["placeUrl"] == uri


def test_catalogue_query_and_builder_use_the_same_literal_operand():
    clauses, bound = PublicReleaseRepository._organ_filter_sql(query=r" A_%\B ", builder=r" A_%\B ")
    assert bound["query"] == bound["builder"] == r"%A\_\%\\B%"
    assert "sd.search_text" in clauses[0] and "sd.builder_text" in clauses[0]


def test_expired_workbench_budget_refuses_before_opening_any_file():
    from navigator_app.research_workbench import Workbench
    token = db.query_deadline.set(time.monotonic() - 1)
    try:
        with pytest.raises(TimeoutError):
            with Workbench.connect(SimpleNamespace(), budget=60):
                pytest.fail("Expired workbench read was opened")
    finally:
        db.query_deadline.reset(token)


def test_graphql_wrapped_cancellation_keeps_timeout_status(monkeypatch):
    from backend.tests.test_public_graphql import client, send
    from navigator_app import public_graphql
    c, _ = client()
    register_request_reliability(c.application)
    monkeypatch.setattr(public_graphql, "execute_sync", lambda *args, **kwargs: SimpleNamespace(errors=[SimpleNamespace(original_error=QueryCanceled("private SQL"))]))
    response = send(c, "{snapshot}")
    assert response.status_code == 504 and response.json["error"] == "query_timeout"
    assert db.query_deadline.get() is None
