from copy import deepcopy
import hashlib
import io
import json
from pathlib import Path
import subprocess
import sys
from types import SimpleNamespace
from zipfile import ZipFile

from flask import Flask, jsonify
import pytest

from navigator_app import research_package as module

SNAPSHOT = "a" * 64


def selection():
    return {"publicCoreSha256": SNAPSHOT, "selectionSha256": "b" * 64,
            "querySha256": "c" * 64, "filters": {"section": "events", "actor": "fixture-person"},
            "total": 61, "items": [{"id": str(i), "evidence": {"label": f"Event {i}", "source_url": "https://example.org/source"}} for i in range(61)],
            "offset": 0, "completeSelection": True, "hasMore": False,
            "method": "Recorded source assertions; historical independence is unestablished."}


def build(payload=None, **kwargs):
    options = dict(endpoint="/api/workbench/selection/export", query={"snapshot": SNAPSHOT, "section": "events"},
                   snapshot=SNAPSHOT, license_name="CC0-1.0", issued="2026-09-23")
    options.update(kwargs)
    return module.build_package(selection() if payload is None else payload, **options)


def test_full_membership_zip64_fixity_and_offline_replay(tmp_path):
    content, digest = build()
    assert hashlib.sha256(content).hexdigest() == digest
    assert build()[0] == content
    assert build(query={"snapshot": SNAPSHOT, "section": "events", "page": "9", "format": "ro-crate"})[0] == content
    with ZipFile(io.BytesIO(content)) as archive:
        assert all(member.extract_version >= 45 for member in archive.infolist())
        result = json.loads(archive.read("selection.json"))
        assert len(result["items"]) == 61 and result["items"][-1]["id"] == "60"
        for line in archive.read("checksums.sha256").decode().splitlines():
            sha, name = line.split("  ", 1)
            assert hashlib.sha256(archive.read(name)).hexdigest() == sha
        archive.extractall(tmp_path)
    replay = subprocess.run([sys.executable, str(tmp_path / "replay.py")], capture_output=True, check=True)
    assert json.loads(replay.stdout) == result
    (tmp_path / "selection.json").write_text("changed")
    failed = subprocess.run([sys.executable, str(tmp_path / "replay.py")], capture_output=True)
    assert failed.returncode != 0 and b"fixity failed" in failed.stderr


@pytest.mark.parametrize("change", [{"completeSelection": False}, {"hasMore": True}, {"offset": 50}, {"total": 62}])
def test_partial_membership_is_not_packaged(change):
    with pytest.raises(ValueError, match="complete selection"):
        build({**selection(), **change})


@pytest.mark.parametrize("private", [{"api_key": "placeholder"}, {"visibility": "restricted"},
                                    {"url": "https://example.org/?access_token=placeholder"},
                                    {"path": "file:///private/input.json"}])
def test_private_or_credential_fields_are_refused(private):
    payload = selection()
    payload["items"][0]["evidence"] = private
    with pytest.raises(ValueError):
        build(payload)


def test_stale_snapshot_license_and_byte_budget_fail_closed(monkeypatch):
    with pytest.raises(RuntimeError, match="exact current"):
        build(snapshot="0" * 64)
    with pytest.raises(RuntimeError, match="unavailable"):
        build(license_name="")
    monkeypatch.setattr(module, "MAX_PAYLOAD_BYTES", 100)
    with pytest.raises(OverflowError, match="byte budget"):
        build()


def test_complete_route_and_stale_binding_are_enforced():
    app = Flask(__name__)
    app.config["RESEARCH_PACKAGE_LICENSE"] = "CC0-1.0"
    binding_checks = []
    def assert_binding():
        binding_checks.append(True)
    app.extensions["research_workbench"] = SimpleNamespace(
        assert_binding=assert_binding, binding=lambda: {"publicCoreSha256": SNAPSHOT})
    @app.get("/api/workbench/selection/export")
    def export():
        return jsonify(selection())
    @app.get("/api/workbench/selection")
    def page():
        return jsonify({**selection(), "completeSelection": False})
    module.register_research_packages(app)
    client = app.test_client()
    ok = client.get("/api/workbench/selection/export", query_string={"snapshot": SNAPSHOT, "format": "ro-crate"})
    assert ok.status_code == 200 and ok.mimetype == "application/zip"
    assert hashlib.sha256(ok.data).hexdigest() == ok.headers["X-Content-SHA256"]
    assert len(binding_checks) == 2
    bad = client.get("/api/workbench/selection/export?format=ro-crate&snapshot=old")
    assert bad.status_code == 409 and bad.is_json
    partial = client.get("/api/workbench/selection", query_string={"snapshot": SNAPSHOT, "format": "ro-crate"})
    assert partial.status_code == 400
    assert client.get("/api/workbench/selection/export").is_json


def test_changed_snapshot_during_packaging_returns_no_archive():
    app = Flask(__name__)
    app.config["RESEARCH_PACKAGE_LICENSE"] = "CC0-1.0"
    checks = []
    def changed():
        checks.append(True)
        if len(checks) > 1:
            raise RuntimeError("Snapshot changed")
    app.extensions["research_workbench"] = SimpleNamespace(assert_binding=changed, binding=lambda: {"publicCoreSha256": SNAPSHOT})
    app.add_url_rule("/api/workbench/selection/export", view_func=lambda: jsonify(selection()))
    module.register_research_packages(app)
    response = app.test_client().get("/api/workbench/selection/export", query_string={"format": "ro-crate", "snapshot": SNAPSHOT})
    assert response.status_code == 409 and response.mimetype == "application/json"


def test_organ_comparison_package_refuses_incomplete_nested_evidence():
    payload = {'publicCoreSha256':SNAPSHOT, 'comparisonContract':'modavis.organ-research-comparison/v1', 'completeComparison':False,
               'organs':[{'accountsComplete':False,'assertionsComplete':True}]}
    with pytest.raises(ValueError,match='complete organ comparison'):
        build(payload)
