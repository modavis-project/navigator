"""Authored disposition fixtures with separate accounts and division evidence."""

from contextlib import contextmanager
import json
import sqlite3
from types import SimpleNamespace

from flask import Flask
import pytest

from navigator_app import research_dispositions, research_workbench


SNAPSHOT = "a" * 64
ASSESSMENT = "b" * 64
PAIR = ("Principal|8′", "Octave|4")


@pytest.fixture
def client(monkeypatch):
    db = sqlite3.connect(":memory:")
    db.row_factory = sqlite3.Row
    db.executescript("""
        attach ':memory:' as core;
        create table core.organ(mdvs_id text primary key,label text);
        create table core.source_membership(source_record_id text primary key,source_key text,source_url text);
        create table core.specification_description(description_id text primary key,organ_mdvs_id text,
            source_record_id text,description_kind text,source_heading text,period_label text,time_kind text,
            time_relation text,sort_year int,subject_kind text,realization text,coverage text,source_revision text,
            description_revision text,source_paths_json text,stop_count int,component_count int);
        create table core.specification_component(component_id text primary key,organ_mdvs_id text,
            source_record_id text,component_type text,label text,division_label text,pitch_label text,
            label_disclosure_state text,source_path text,detail_json text);
        create table core.specification_description_component(component_id text primary key,description_id text,
            division_label text,division_position int,position int,component_type text,label text,
            pitch_label text,source_wording text,source_paths_json text,detail_json text);
        create table term_occurrence(id text,kind text,search text,pitch text,description text,organ text,source text,
            division text,source_path text);
        create index term_kind_name on term_occurrence(kind,search,id);
        create table work_configuration(id text primary key,payload text);
    """)

    def account(organ, identifier, kind, coverage="structured_stops"):
        organ_id = "MDVS:ENTY:" + organ
        source = "source-" + identifier
        db.execute("insert or ignore into core.organ values (?,?)", (organ_id, organ))
        db.execute("insert into core.source_membership values (?,?,?)", (source, "test", f"https://example.test/{identifier}"))
        db.execute("insert into core.specification_description values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", (
            identifier, organ_id, source, kind, "Specification", "Before 1896", "relative", "before", 1896,
            "record_context", "reported", coverage, "source-revision", "revision-" + identifier, '["/specifications"]', 2, 3,
        ))
        db.execute("insert into work_configuration values (?,?)", (
            identifier, json.dumps({"chronology": {"configurationDateState": "source_heading"}}),
        ))
        return organ_id, source, identifier, kind

    def component(a, key, label, pitch, division, division_position, path, **detail):
        organ, source, description, kind = a
        if kind == "main":
            db.execute("insert into core.specification_component values (?,?,?,?,?,?,?,?,?,?)",
                       (key, organ, source, "stop", label, division, pitch, "retained", path, json.dumps(detail)))
        else:
            db.execute("insert into core.specification_description_component values (?,?,?,?,?,?,?,?,?,?,?)",
                       (key, description, division, division_position, 1, "stop", label, pitch,
                        label + " " + pitch, json.dumps([path]), json.dumps(detail)))
        wording = label if kind == "main" else f"{label} {pitch}′"
        db.execute("insert into term_occurrence values (?,?,?,?,?,?,?,?,?)",
                   (key, "stops", wording.casefold(), pitch, description, organ, source, division, path))

    main = account("A", "main", "main")
    component(main, "main-p", "Principal 8′", "8'", "Great", 0, "specifications.manuals[0].stops[0]", raw_str="8′ Principal")
    component(main, "main-o", "Octave", "4", "Great", 0, "specifications.manuals[0].stops[1]")
    alternative = account("B", "alternative", "alternative")
    component(alternative, "alt-p", "Principal", "8", "Great", 1, "/old/Great/1")
    component(alternative, "alt-o", "Octave", "4", "Great", 2, "/old/Great/2")
    component(alternative, "alt-p4", "Principal", "4", "Great", 2, "/old/Great/3")
    component(account("C", "split-p", "main"), "split-p", "Principal", "8", "Great", 0, "specifications.stops[0]")
    component(account("C", "split-o", "main"), "split-o", "Octave", "4", "Great", 0, "specifications.stops[0]")
    unnamed = account("D", "unnamed", "alternative")
    component(unnamed, "un-p", "Principal", "8", "Unspecified division", 0, "/old/unnamed/1")
    component(unnamed, "un-o", "Octave", "4", "Unspecified division", 0, "/old/unnamed/2")
    recovered = account("E", "recovered", "main", "retained_source_transfer")
    for label, pitch, suffix in (("Principal", "8", "1"), ("Octave", "4", "2")):
        component(recovered, "r-" + suffix, label, pitch, "Great", 0,
                  "specifications.raw_spec#chars=" + suffix,
                  contract="modavis.annotated-stop-row-recovery/v1",
                  sourceHeading={"start": 0}, sourceFragment={"sourcePath": "specifications.raw_spec"},
                  sourceRowWording=f"{pitch}′ {label}")
    db.execute("pragma query_only=on")

    @contextmanager
    def connect(*args):
        yield db

    work = SimpleNamespace(
        connect=connect, assert_binding=lambda: None,
        manifest={"core": {"sha256": SNAPSHOT}, "index": {"sha256": "index-sha"}},
        binding=lambda: {"publicCoreSha256": SNAPSHOT, "occurrenceAssessmentSha256": ASSESSMENT},
    )
    monkeypatch.setenv("NAVIGATOR_WORKBENCH_MANIFEST", "authored")
    monkeypatch.setattr(research_workbench, "Workbench", lambda *args: work)
    app = Flask(__name__)
    research_workbench.register_workbench(app, None, None)
    yield app.test_client()
    db.close()


def search(client, *, stops=PAIR, snapshot=SNAPSHOT, export=False, **kwargs):
    return client.get("/api/workbench/dispositions" + ("/export" if export else ""),
                      query_string=[("snapshot", snapshot), *kwargs.items(), *(("stop", stop) for stop in stops)])


def test_scope_uses_one_exact_account_and_one_named_division(client):
    result = search(client).json
    assert [item["descriptionId"] for item in result["items"]] == ["main", "alternative", "unnamed", "recovered"]
    assert result["accountCount"] == result["organCount"] == result["total"] == 4
    named = search(client, scope="division").json
    assert [item["descriptionId"] for item in named["items"]] == ["main", "recovered"]
    assert named["unit"] == "named divisions"
    main, recovered = named["items"]
    assert main["accountHref"].endswith("description=main&descriptionRevision=revision-main")
    assert main["division"] == {"label": "Great", "position": 0}
    assert main["chronology"] == {"configurationDateState": "source_heading"}
    assert main["capturedStopRows"] == 2
    assert main["matches"][0]["rows"][0]["sourceWording"] == "8′ Principal"
    assert recovered["coverage"] == "retained_source_transfer"
    assert recovered["matches"][0]["rows"][0]["evidenceKind"] == "recovered"


def test_overlapping_criteria_require_distinct_witness_rows(client):
    result = search(client, stops=("Principal", "principal|8")).json
    (account,) = result["items"]
    assert account["descriptionId"] == "alternative"
    assert [match["witnessRowId"] for match in account["matches"]] == ["alt-p4", "alt-p"]
    assert search(client, stops=("Principal|8", "principal|8")).json["total"] == 0


def test_pagination_canonical_receipt_and_complete_export(client, monkeypatch):
    monkeypatch.setattr(research_dispositions, "PAGE_SIZE", 1)
    first = search(client)
    second = search(client, stops=("octave|4'", " PRINCIPAL | 8 "), page="1", assessment=ASSESSMENT)
    complete = search(client, export=True, page="2")
    for response in (first, second, complete):
        assert response.status_code == 200
        assert response.headers["X-Selection-SHA256"] == first.json["selectionSha256"]
    assert first.json["items"][0]["descriptionId"] == "main"
    assert second.json["items"][0]["descriptionId"] == "alternative"
    assert first.json["hasMore"] and not first.json["completeSelection"]
    assert complete.json["completeSelection"] and not complete.json["hasMore"]
    assert len(complete.json["items"]) == complete.json["total"] == 4
    assert "attachment" in complete.headers["Content-Disposition"]


def test_controls_reject_stale_unknown_and_budget_failures(client, monkeypatch):
    assert search(client, snapshot="c" * 64).status_code == 409
    assert search(client, snapshot="").status_code == 400
    assert search(client, stops=("Principal",)).status_code == 400
    assert search(client, stops=("", "Octave")).status_code == 400
    assert search(client, scope="organ").status_code == 400
    assert search(client, export=True, format="ro-crate").status_code == 400
    assert client.get("/api/workbench/terms?stop=Principal&stop=Octave").status_code == 400
    monkeypatch.setattr(research_dispositions, "MAX_EXPORT_RECORDS", 1)
    too_many = search(client, export=True)
    assert too_many.status_code == 422 and "items" not in too_many.json
    monkeypatch.setattr(research_dispositions, "MAX_MATCH_ROWS", 1)
    assert search(client).status_code == 422


def test_pitch_typography_preserves_mixed_fractions():
    assert {research_dispositions.pitch_key(value) for value in ("2⅔′", "2 2⁄3'", "2 2/3")} == {"2 2/3"}
    assert research_dispositions.pitch_key("2/3") != research_dispositions.pitch_key("2 2/3")
