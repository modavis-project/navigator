#!/usr/bin/env python3
"""Measure the built client and optionally verify byte-for-byte reproduction."""
import argparse
import gzip
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MAX_JAVASCRIPT_GZIP_BYTES = 300 * 1024
MAX_CLIENT_GZIP_BYTES = 600 * 1024


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
    client = [entry for entry in files if entry["path"].endswith((".js", ".css", ".html"))]
    return {"contract": "modavis.navigator.frontend-measurement/v1", "files": files,
            "clientGzipBytes": sum(entry["gzipBytes"] for entry in client),
            "largestJavaScriptGzipBytes": max((entry["gzipBytes"] for entry in files if entry["path"].endswith(".js")), default=0)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dist", type=Path, default=ROOT / "frontend/dist")
    parser.add_argument("--report", type=Path)
    parser.add_argument("--compare", type=Path, help="Earlier report; require every built file to match")
    args = parser.parse_args()
    report = measure(args.dist)
    if (report["largestJavaScriptGzipBytes"] > MAX_JAVASCRIPT_GZIP_BYTES
            or report["clientGzipBytes"] > MAX_CLIENT_GZIP_BYTES):
        raise SystemExit("Frontend exceeds the reviewed compressed-size budget (300 KiB largest JS / 600 KiB full client)")
    if args.compare and report != json.loads(args.compare.read_text()):
        raise SystemExit("Frontend output differs from the recorded build")
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
    print(json.dumps({key: value for key, value in report.items() if key != "files"}))


if __name__ == "__main__":
    main()
