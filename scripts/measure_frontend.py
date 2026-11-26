#!/usr/bin/env python3
"""Measure the built client and optionally verify byte-for-byte reproduction."""
import argparse
import gzip
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MAX_JAVASCRIPT_GZIP_BYTES = 300 * 1024
MAX_CLIENT_GZIP_BYTES = 616 * 1024
MAX_INITIAL_ASSET_GZIP_BYTES = 384 * 1024
MAX_REGION_MAP_GZIP_BYTES = 11 * 1024
MAX_MAP_VIEWER_GZIP_BYTES = 420 * 1024
REGION_MAP_ASSET = re.compile(r"(?:assets/map(?:Regions|Markers)-[A-Za-z0-9_-]+\.(?:js|css)|geolibre-region-bridge\.mjs)")
MAP_VIEWER_ASSET = re.compile(r"(?:map-viewer\.html|assets/(?:map-viewer|maplibre-gl-worker)-[A-Za-z0-9_-]+\.(?:js|css))")
HTML_ASSET_PATH = re.compile(r'\b(?:src|href)="(/assets/[^"]+\.(?:js|css))"')


def measure(directory):
    files = []
    for path in sorted(directory.rglob("*")):
        if path.is_file():
            content = path.read_bytes()
            files.append({"path": path.relative_to(directory).as_posix(), "bytes": len(content),
                          "gzipBytes": len(gzip.compress(content, mtime=0)),
                          "sha256": hashlib.sha256(content).hexdigest()})
    if not any(entry["path"] == "index.html" for entry in files):
        raise ValueError("A built frontend index.html is required")
    initial_assets = {path.lstrip("/") for path in HTML_ASSET_PATH.findall((directory / "index.html").read_text(encoding="utf-8"))}
    if not initial_assets or not initial_assets.issubset(entry["path"] for entry in files):
        raise ValueError("The built frontend index.html requires a valid script and stylesheet inventory")
    client = [entry for entry in files if entry["path"].endswith((".js", ".mjs", ".css", ".html"))]
    return {"contract": "modavis.navigator.frontend-measurement/v1", "files": files,
            "clientGzipBytes": sum(entry["gzipBytes"] for entry in client),
            "initialAssetGzipBytes": sum(entry["gzipBytes"] for entry in client if entry["path"] in initial_assets),
            "regionMapGzipBytes": sum(entry["gzipBytes"] for entry in client if REGION_MAP_ASSET.fullmatch(entry["path"])),
            "mapViewerGzipBytes": sum(entry["gzipBytes"] for entry in client if MAP_VIEWER_ASSET.fullmatch(entry["path"])),
            "largestJavaScriptGzipBytes": max((entry["gzipBytes"] for entry in client if entry["path"].endswith((".js", ".mjs"))), default=0)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dist", type=Path, default=ROOT / "frontend/dist")
    parser.add_argument("--report", type=Path)
    parser.add_argument("--compare", type=Path, help="Earlier report; require every built file to match")
    args = parser.parse_args()
    report = measure(args.dist)
    region_bytes = report["regionMapGzipBytes"]
    viewer_bytes = report["mapViewerGzipBytes"]
    if (report["largestJavaScriptGzipBytes"] > MAX_JAVASCRIPT_GZIP_BYTES
            or report["initialAssetGzipBytes"] > MAX_INITIAL_ASSET_GZIP_BYTES
            or report["clientGzipBytes"] - region_bytes - viewer_bytes > MAX_CLIENT_GZIP_BYTES
            or region_bytes > MAX_REGION_MAP_GZIP_BYTES
            or viewer_bytes > MAX_MAP_VIEWER_GZIP_BYTES):
        raise SystemExit(
            f"Frontend exceeds the compressed-size budget ({MAX_JAVASCRIPT_GZIP_BYTES // 1024} KiB largest JS / "
            f"{MAX_INITIAL_ASSET_GZIP_BYTES // 1024} KiB initial assets, {MAX_CLIENT_GZIP_BYTES // 1024} KiB app, "
            f"{MAX_REGION_MAP_GZIP_BYTES // 1024} KiB map interaction, "
            f"{MAX_MAP_VIEWER_GZIP_BYTES // 1024} KiB map viewer)"
        )
    if args.compare:
        earlier = json.loads(args.compare.read_text())
        earlier.setdefault("initialAssetGzipBytes", report["initialAssetGzipBytes"])
        earlier.setdefault("regionMapGzipBytes", 0)
        earlier.setdefault("mapViewerGzipBytes", 0)
        if report != earlier:
            raise SystemExit("Frontend output differs from the recorded build")
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
    print(json.dumps({key: value for key, value in report.items() if key != "files"}))


if __name__ == "__main__":
    main()
