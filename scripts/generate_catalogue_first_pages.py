"""Capture the default catalogue pages from a verified public POD reader."""

import argparse
import json
from pathlib import Path
import sys
from urllib.parse import urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
from navigator_app.catalogue_first_page import CATALOGUE_PAGE_VERSION, catalogue_snapshot


PAGES = {
    "organs": ("/api/organs?limit=50&offset=0&sort=stops&include_facets=0", 50),
    "people": ("/api/persons?limit=18&offset=0", 18),
    "events": ("/api/events?limit=12&offset=0", 12),
}
MAX_RESPONSE_BYTES = 2 * 1024 * 1024


class _NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def generate(origin: str, release: str, output: Path) -> None:
    source = urlsplit(origin)
    if (not source.hostname or source.username or source.password or source.query or source.fragment
            or source.path not in {"", "/"}
            or (source.scheme != "https" and not (source.scheme == "http" and source.hostname in {"127.0.0.1", "::1"}))):
        raise ValueError("Use an HTTPS origin or a loopback HTTP reader")
    base = origin.rstrip("/")
    opener = build_opener(_NoRedirect())

    def read(path):
        request = Request(base + path, headers={"Accept": "application/json", "Cache-Control": "no-cache"})
        with opener.open(request, timeout=45) as response:
            content = response.read(MAX_RESPONSE_BYTES + 1)
            if len(content) > MAX_RESPONSE_BYTES:
                raise ValueError(f"Catalogue response exceeds the size limit at {path}")
        return json.loads(content)

    before = read("/api/release-context")
    if (before.get("dataProfile") != "pod-1.5-public" or before.get("readOnly") is not True
            or before.get("releaseVersion") != release or not before.get("readSnapshot")):
        raise ValueError("The reader does not serve the expected verified public release")
    binding = read("/api/discovery/context").get("snapshot", {})
    digest = catalogue_snapshot(binding)
    if (not digest or binding.get("sourceReleaseVersion") != before.get("sourceReleaseVersion")
            or before.get("catalogueSnapshot", digest) != digest):
        raise ValueError("The catalogue reader has an inconsistent snapshot binding")

    pages = {}
    for page, (path, limit) in PAGES.items():
        result = read(path)
        total, items = result.get("total"), result.get("items")
        if (type(total) is not int or total < 0 or result.get("limit") != limit or result.get("offset") != 0
                or not isinstance(items, list) or len(items) != min(limit, total)):
            raise ValueError(f"The {page} response is incomplete")
        pages[page] = {
            "version": CATALOGUE_PAGE_VERSION, "catalogueSnapshot": digest,
            "page": page, "response": result,
        }
    if read("/api/release-context").get("readSnapshot") != before["readSnapshot"]:
        raise ValueError("The active release changed during catalogue generation")

    output.mkdir(parents=True)
    for page, payload in pages.items():
        (output / f"{page}.json").write_text(
            json.dumps(payload, ensure_ascii=False, separators=(",", ":"), sort_keys=True) + "\n",
            encoding="utf-8",
        )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--origin", required=True)
    parser.add_argument("--release", required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    generate(args.origin, args.release, args.output)


if __name__ == "__main__":
    main()
