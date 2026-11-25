import hashlib

import pytest
from flask import Flask
from rdflib import Graph
from rdflib.namespace import SKOS, RDFS

from navigator_app.terminology import TerminologyCatalog
from navigator_app.vocabulary_references import VocabularyReferences, register_vocabulary_references


@pytest.fixture(scope="module")
def app():
    value = Flask(__name__)
    value.extensions["terminology_catalog"] = TerminologyCatalog()
    register_vocabulary_references(value)
    return value


def test_original_concepts_and_model_resources_keep_distinct_denominators(app):
    provider = app.extensions["vocabulary_references"]
    metadata = {value["id"]: value for value in provider.metadata()["collections"]}
    assert (metadata["network"]["count"], metadata["network"]["schemeCount"]) == (58, 13)
    assert (metadata["vao"]["count"], metadata["vao"]["schemeCount"]) == (21, 2)
    assert metadata["vao"]["kindCounts"]["class"] == 61
    assert metadata["vao"]["resourceCount"] > metadata["vao"]["count"]
    assert metadata["vao"]["quality"]["conceptsWithoutDefinition"] == 21
    assert metadata["vao"]["quality"]["conceptsWithoutScheme"] == 6
    assert metadata["network"]["quality"]["conceptsWithoutDefinition"] == 0
    assert metadata["network"]["quality"]["preferredLabelConflicts"] == 0


def test_concepts_paginate_completely_and_schema_objects_are_not_concepts(app):
    provider = app.extensions["vocabulary_references"]
    rows = []
    for offset in range(0, 58, 10):
        page = provider.search("network", {"offset": str(offset), "limit": "10"})
        rows.extend(page["items"])
        assert page["total"] == 58
    assert len({row["uri"] for row in rows}) == len(rows) == 58
    assert all(row["kind"] == "concept" for row in rows)
    classes = provider.search("vao", {"kind": "class"})
    assert classes["total"] == 61
    assert all(row["kind"] == "class" for row in classes["items"])


def test_scheme_membership_and_unassigned_source_concepts_are_preserved(app):
    provider = app.extensions["vocabulary_references"]
    page = provider.search("network", {})
    scheme = page["schemes"][0]["uri"]
    selected = provider.search("network", {"scheme": scheme})
    assert selected["total"] > 0
    assert all(scheme in row["schemes"] for row in selected["items"])
    unassigned = provider.search("vao", {"scheme": "unassigned"})
    assert unassigned["total"] == 6
    assert all(row["schemes"] == [] and row["definition"] is None for row in unassigned["items"])
    with pytest.raises(ValueError, match="scheme from this"):
        provider.search("network", {"scheme": "not-in-this-graph"})


def test_literal_search_and_source_language_are_not_invented(app):
    provider = app.extensions["vocabulary_references"]
    assert provider.search("network", {"q": "%"})["total"] == 0
    pipe = provider.search("network", {"q": "PIPE-ORGAN"})["items"]
    assert any(row["uri"].endswith("/pipe-organ") for row in pipe)
    for row in pipe:
        assert row["displayLabelBasis"] == "recorded label"
        assert any(label["value"] == row["label"] for label in row["labels"])


def test_detail_retains_direct_statements_and_whole_graph_downloads(app):
    provider = app.extensions["vocabulary_references"]
    uri = "https://w3id.org/modavis/vocab/instrument-type/pipe-organ"
    detail = provider.detail("network", uri)
    assert detail["resource"]["uri"] == uri
    assert any(row["predicate"] == str(SKOS.definition) for row in detail["statements"])
    assert any(row["predicate"] == str(SKOS.inScheme) for row in detail["relations"])
    assert "does not add POD source evidence" in detail["boundary"]
    with pytest.raises(LookupError):
        provider.detail("vao", uri)


@pytest.mark.parametrize("suffix", [
    "?snapshot=", "?limit=0", "?offset=-1", "?offset=nan", "?limit=101",
    "?kind=made-up", "?language=made-up", "?q=a&q=b", "?private=1", "?scheme=",
])
def test_invalid_reference_queries_are_explicit(app, suffix):
    response = app.test_client().get("/api/vocab/references/network" + suffix)
    assert response.status_code == 400
    assert response.json["error"]
    assert response.headers["Cache-Control"] == "no-store"


def test_stale_snapshot_is_not_substituted_for_any_representation(app):
    client = app.test_client()
    for path in ["/api/vocab/references/network", "/api/vocab/references/network/concept", "/api/vocab/references/network/download/ttl"]:
        response = client.get(path + "?snapshot=" + "0" * 64)
        assert response.status_code == 409
        assert "not been substituted" in response.json["error"]


def test_downloads_are_exact_original_bytes_with_conditional_etags(app):
    client = app.test_client()
    provider = app.extensions["vocabulary_references"]
    for code in ("network", "vao"):
        metadata = provider.collection(code)["metadata"]
        for format in metadata["formats"]:
            response = client.get(format["href"])
            assert response.status_code == 200
            assert hashlib.sha256(response.data).hexdigest() == format["sha256"]
            assert len(response.data) == format["bytes"]
            assert client.get(format["href"], headers={"If-None-Match": response.headers["ETag"]}).status_code == 304
        graph = Graph().parse(data=client.get(f"/api/vocab/references/{code}/download/ttl").data, format="turtle")
        assert len(graph) == len(provider.collection(code)["graph"])
        first = client.get(f"/api/vocab/references/{code}")
        assert first.data == client.get(f"/api/vocab/references/{code}").data


def test_path_and_uri_parameters_never_select_files_or_remote_graphs(app):
    client = app.test_client()
    assert client.get("/api/vocab/references/unknown").status_code == 404
    assert client.get("/api/vocab/references/network/concept?uri=https://example.invalid/term").status_code == 404
    assert client.get("/api/vocab/references/network/download/exe").status_code == 404
    assert client.get("/api/vocab/references?offset=1").status_code == 400


def test_model_properties_expose_original_domain_and_range_navigation(app):
    provider = app.extensions["vocabulary_references"]
    uri = next(value for value in provider.collections["vao"]["records"] if value.endswith(("#scientific", "/scientific")))
    detail = provider.detail("vao", uri)
    outgoing = {row["predicate"]: row for row in detail["relations"] if row["direction"] == "outgoing"}
    assert outgoing[str(RDFS.domain)]["uri"].endswith(("#VirtualAcousticObject", "/VirtualAcousticObject"))
    assert outgoing[str(RDFS.range)]["uri"].endswith(("#ScientificRecordSet", "/ScientificRecordSet"))
    assert outgoing[str(RDFS.domain)]["inCollection"] is True
    assert outgoing[str(RDFS.range)]["inCollection"] is True


def test_vao_and_mmic_browsing_keeps_the_legacy_snapshot(app):
    client = app.test_client()
    old = '9e7ff939c54b7b390432b8d6374f1039987a4da5adfbbd5efd3f040065acb177'
    legacy = client.get('/api/vocab/references/vao?snapshot='+old)
    assert legacy.status_code == 200
    assert legacy.json['collection']['version'] == '0.5.0'
    for code, version, uri in [
        ('vao-0.6.0', '0.6.0', 'https://w3id.org/modavis/vao/ontology#specificationVersion'),
        ('mmic', '1.0.0', 'https://w3id.org/modavis/vao/mmic#PhysicalCarrier'),
    ]:
        term = client.get('/api/vocab/references/'+code+'/concept', query_string={'uri':uri})
        assert term.status_code == 200
        assert term.json['resource']['uri'] == uri
        assert term.json['collection']['version'] == version
        assert term.json['collection']['sourceCommit'] == '9d477213eab90defa75bef0f44e0d292a83e68d9'
