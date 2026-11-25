"""Exercise real public API, export identity, and independent database barriers."""
from dataclasses import replace
import hashlib

import psycopg

from navigator_app.db import connect
from navigator_app.fixture_contract import AUTHORITY, RELEASE


def require(value, message):
    if not value:
        raise AssertionError(message)


def verify_application(app, fixture):
    client = app.test_client()
    routes = ["/api/health/live", "/api/health/ready", "/api/status", "/api/release-context",
              "/api/organs", "/api/organs/facets", "/api/organs?q=Chapel",
              "/api/organs?source=fixture-a", "/api/organs?limit=1", "/api/organs?limit=1&offset=1",
              "/api/organs?q=no-such-fixture-organ", "/api/organs/TEST-0001-A",
              "/api/organs/TEST-0001-A/citation", "/api/organs/TEST-0001-A/sources",
              "/api/organs/TEST-0001-A/specification", "/api/organs/TEST-0001-A/history",
              "/api/organs/TEST-0001-A/related", "/api/organs/TEST-0001-A/media",
              "/api/organs/TEST-0002-B", "/api/persons", "/api/entities/people/TEST-0003-C",
              "/api/events", "/api/places/TEST-0004-D", "/api/id/MDVS:ENTY:TEST-0001-A",
              "/api/id/MDVS:ENTY:TEST-0001-A/publication-status",
              "/api/public/sources/fixture:a", "/api/exports/organ/TEST-0001-A"]
    receipt = []
    responses = {}
    for route in routes:
        response = client.get(route)
        require(response.status_code == 200, f"{route} returned {response.status_code}")
        require(response.headers.get("X-Content-Type-Options") == "nosniff", "Missing MIME protection")
        if route in ("/api/health/live", "/api/health/ready", "/api/status"):
            require(response.headers.get("Cache-Control") == "no-store", f"{route} must report live status")
        elif route == "/api/release-context":
            require(response.cache_control.private and response.cache_control.no_cache,
                    "The release context must be revalidated before reuse")
            etag = response.headers.get("ETag")
            require(etag, "The release context must provide a cache validator")
            unchanged = client.get(route, headers={"If-None-Match": etag})
            require(unchanged.status_code == 304 and not unchanged.data,
                    "The release context validator must avoid sending an unchanged document")
        responses[route] = response.get_json()
        for forbidden in (fixture.private_canary, fixture.reader_password, fixture.admin_password):
            require(forbidden.encode() not in response.data, "Response contains a private canary or credential")
        receipt.append({"path": route, "status": response.status_code,
                        "sha256": hashlib.sha256(response.data).hexdigest()})
    require(responses["/api/status"]["counts"]["organs"] == 2, "Fixture organ count differs")
    for route in ("/api/health/ready", "/api/status", "/api/release-context"):
        require("entity_exports" in responses[route]["capabilities"],
                f"{route} must advertise the available entity export interface")
    require(responses["/api/organs?q=Chapel"]["total"] == 1, "Search must select the fixture organ")
    require(responses["/api/organs?q=no-such-fixture-organ"]["total"] == 0, "Empty search must stay empty")
    require(responses["/api/organs?source=fixture-a"]["total"] == 1, "Source filter differs")
    first, second = responses["/api/organs?limit=1"], responses["/api/organs?limit=1&offset=1"]
    require(first["total"] == second["total"] == 2 and len(first["items"]) == len(second["items"]) == 1,
            "Pagination count differs")
    require(first["items"][0]["id"] != second["items"][0]["id"], "Pagination repeated an organ")
    specification = responses["/api/organs/TEST-0001-A/specification"]
    require(len(specification["sourceSpecifications"]) == 2, "Conflicting source accounts were collapsed")
    facts = specification["technicalEvidence"]["facts"]
    require({(fact["sourceRecordId"], fact["normalizedNumber"]) for fact in facts}
            == {("fixture:a", 10), ("fixture:b", 12)}, "Conflicting source totals were changed")
    history = responses["/api/organs/TEST-0001-A/history"]
    require(history["activities"][0]["date"] == "1888–1892", "Approximate date range was changed")
    require(history["activities"][0]["sourceOnly"] and history["activities"][0]["mappingKind"] == "source_only",
            "Source-only event wording was promoted to a controlled type")
    context = responses["/api/release-context"]
    require(bool(context.get("readSnapshot")), "The release context must identify the current cache snapshot")
    require(context["fixture"]["synthetic"] and context["readOnly"] and not context["publicationAuthorized"], "Fixture identity was lost")
    publication = responses["/api/id/MDVS:ENTY:TEST-0001-A/publication-status"]
    require(publication["status"] == "synthetic_fixture" and not publication["publicationAuthorized"],
            "Synthetic identity is incorrectly advertised as published")
    citation = responses["/api/organs/TEST-0001-A/citation"]["citation"]
    require(citation["dataset"]["version"] == RELEASE and citation["canonicalUrl"].startswith(AUTHORITY), "Citation uses a real POD identity")
    require(len(citation["sourceHashes"]) == 2, "Citation omits source hashes")
    export_path = f"/dataset/pod/version/{RELEASE}/entity/TEST-0001-A.modavis.jsonld"
    exported = client.get(export_path)
    require(exported.status_code == 200, f"Entity export returned {exported.status_code}")
    for forbidden in (fixture.private_canary, fixture.reader_password, fixture.admin_password):
        require(forbidden.encode() not in exported.data, "Export contains a private canary or credential")
    require(RELEASE.encode() in exported.data and AUTHORITY.encode() in exported.data, "Export fixture identity differs")
    require(exported.headers.get("X-MODAVIS-Publication-State") == "prepared", "Export publication state differs")
    require(client.get(export_path, headers={"If-None-Match": exported.headers["ETag"]}).status_code == 304, "Export cache validator differs")
    for method, path, expected in [("get", "/api/organs/unknown", 404), ("post", "/api/organs", 405),
            ("post", "/api/contributions", (404, 405)), ("get", "/api/internal-docs", 404),
            ("get", "/api/map/summary.json?country=fixture", 400), ("get", "/api/research/context", 503)]:
        response = getattr(client, method)(path)
        require(response.status_code in (expected if isinstance(expected, tuple) else (expected,)),
                f"Boundary {method} {path} returned {response.status_code}")
        require(response.headers.get("Cache-Control") == "no-store", "Error response must not be cached")
    statements = ["UPDATE release_1_5_public.organ SET label='unexpected'", "CREATE TABLE public.unexpected(id int)",
                  "CREATE TEMP TABLE unexpected(id int)", "SELECT * FROM fixture_private_canary.record"]
    # A role cannot write even after explicitly disabling the transaction default.
    for statement in statements:
        with psycopg.connect(fixture.settings.db_dsn, autocommit=True) as connection:
            connection.execute("SET default_transaction_read_only=off")
            try:
                connection.execute(statement)
            except psycopg.errors.InsufficientPrivilege:
                pass
            else:
                raise AssertionError("Read-only role unexpectedly allowed a write")
    # The application also rejects accidental use of a writer credential.
    writer = replace(fixture.settings, db_user=fixture.admin["user"], db_password=fixture.admin_password)
    try:
        with connect(writer) as connection:
            connection.execute(statements[0])
    except psycopg.errors.ReadOnlySqlTransaction:
        pass
    else:
        raise AssertionError("Public application transaction unexpectedly allowed a write")
    with connect(fixture.settings) as connection:
        require(connection.execute("SELECT count(*) AS n FROM release_1_5_public.organ").fetchone()["n"] == 2, "Read-only probes changed the fixture")
    return {"checks": {"api": True, "searchAndEmpty": True, "filtersAndPagination": True,
                       "uncertaintyAndSourceAccounts": True, "citationAndExportBinding": True,
                       "cacheValidation": True, "restrictedRoutes": True, "privateCanary": True,
                       "roleReadOnly": True, "applicationReadOnly": True},
            "apiResponses": receipt, "exportSha256": hashlib.sha256(exported.data).hexdigest()}
