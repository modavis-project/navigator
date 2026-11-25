#!/usr/bin/env python3
"""Check or serve an owned synthetic POD fixture, then remove its container."""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))


def clean_environment():
    # Optional research/renderer inputs must not be inherited from a real POD.
    allowed = {"PATH", "HOME", "TMPDIR", "LANG", "LC_ALL", "DOCKER_HOST", "DOCKER_CONTEXT", "DOCKER_CONFIG"}
    for key in list(os.environ):
        if key not in allowed:
            os.environ.pop(key)


def add_frontend(app):
    from flask import abort, send_from_directory
    dist = ROOT / "frontend/dist"
    if not (dist / "index.html").is_file():
        raise RuntimeError("Build the frontend first: npm ci && npm run build (in frontend)")

    @app.get("/")
    @app.get("/<path:path>")
    def frontend(path=""):
        if path.startswith(("api/", "dataset/", "resolve/", ".", "assets/")):
            if path.startswith("assets/"):
                return send_from_directory(dist, path)
            abort(404)
        if path in {"navigator.svg", "THIRD_PARTY_LICENSES.txt"}:
            return send_from_directory(dist, path)
        if path.startswith("geolibre/"):
            return ("<!doctype html><title>Optional map unavailable</title>"
                    "<p>This small fixture does not include the optional map runtime. "
                    "Catalogue and evidence pages remain available.</p>", 503,
                    {"Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store"})
        return send_from_directory(dist, "index.html")


def check(app, fixture):
    from tools.fixture_acceptance import verify_application
    return verify_application(app, fixture)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("check", "serve"), nargs="?", default="check")
    parser.add_argument("--image", help="Explicit locally available PostgreSQL 15 image; never pulled implicitly")
    parser.add_argument("--port", type=int, default=0, help="Loopback HTTP port; default selects a free port")
    parser.add_argument("--report", type=Path, help="Write a credential-free receipt")
    args = parser.parse_args(argv)
    clean_environment()
    from tools.fixture_support import DEFAULT_IMAGE, FixtureDatabase, verify_inputs
    from navigator_app.public_app import create_public_app
    from werkzeug.serving import make_server
    fixture = FixtureDatabase(args.image or DEFAULT_IMAGE)
    report = {"contract": "modavis.navigator.fixture-acceptance/v1", "status": "failed", "container": fixture.name}
    print(json.dumps({**report, "status": "starting", "processId": os.getpid()}), flush=True)
    try:
        with fixture:
            app = create_public_app(fixture.settings)
            if args.action == "serve":
                add_frontend(app)
            report.update(check(app, fixture), imageId=fixture.image_id, postgresVersion=fixture.server_version,
                          fixtureInputSha256=fixture.manifest["inputSha256"], ledgerSha256=fixture.ledger_sha256)
            if args.action == "serve":
                with make_server("127.0.0.1", args.port, app, threaded=True) as server:
                    report["url"] = f"http://127.0.0.1:{server.server_port}"
                    print(json.dumps({**report, "status": "serving", "containerRemoved": False}), flush=True)
                    try:
                        server.serve_forever()
                    except KeyboardInterrupt:
                        pass
            if verify_inputs() != fixture.manifest:
                raise RuntimeError("Fixture inputs changed during acceptance; run again from frozen inputs")
            report["status"] = "passed"
    except Exception as exc:
        report["errorType"] = type(exc).__name__
        # Database/OS errors may contain paths or credentials; do not serialize them.
        report["error"] = str(exc) if isinstance(exc, (AssertionError, RuntimeError, ValueError)) else "Fixture check failed"
    finally:
        report["containerRemoved"] = fixture.removed
        if args.report:
            args.report.parent.mkdir(parents=True, exist_ok=True)
            args.report.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
    print(json.dumps(report), flush=True)
    return int(report["status"] != "passed")


if __name__ == "__main__":
    raise SystemExit(main())
