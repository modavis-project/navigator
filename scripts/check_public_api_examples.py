"""Verify representative public API examples against a local POD preview."""

import argparse
import json
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urlsplit
from urllib.request import Request, urlopen


ORGAN = "7PDZ-MDM0-0"


def check(condition, message):
    if not condition:
        raise ValueError(message)


def run(base):
    def read(path, query=(), payload=None, status=200):
        url = base + path + ("?" + urlencode(query) if query else "")
        request = Request(
            url,
            data=None if payload is None else json.dumps(payload).encode(),
            headers={"Accept": "application/json", "Content-Type": "application/json"},
        )
        try:
            response = urlopen(request, timeout=35)
        except HTTPError as error:
            response = error
        with response:
            check(response.status == status, f"{path} returned HTTP {response.status}, expected {status}")
            check(response.headers.get_content_type() == "application/json", f"{path} did not return JSON")
            return json.load(response)

    with urlopen(base + "/navigator-api.md", timeout=10) as response:
        check(response.read(256).startswith(b"# MODAVIS Navigator public API"), "API reference download is missing")

    search = read("/api/entities/search", {"q": "Leipzig", "kinds": "organs,places", "limit": 5})
    check(len(search["items"]) == 5 and search["hasMore"], "Ranked search example returned an unexpected page")
    page = read("/api/organs", {"q": "Leipzig", "sort": "stops", "limit": 10, "offset": 10})
    check(page["offset"] == 10 and page["limit"] == len(page["items"]) == 10, "Catalogue pagination differed")
    read("/api/entities/search", {"q": "Leipzig", "limit": 51}, status=400)

    manifest = read(f"/api/exports/organ/{ORGAN}")
    turtle = next(item["url"] for item in manifest["native"] if item["key"] == "turtle")
    check(turtle.startswith("/dataset/pod/version/"), "Turtle link is not versioned")
    with urlopen(base + turtle, timeout=20) as response:
        check(response.headers.get_content_type() == "text/turtle" and response.read(1), "Turtle download failed")
    evidence = read(f"/api/exports/organ/{ORGAN}/evidence")
    check(evidence["complete"] and evidence["fieldCount"] == len(evidence["fields"]), "Evidence coverage is incomplete")

    snapshot = read("/api/workbench/context")["publicCoreSha256"]
    filters = [("snapshot", snapshot), ("scope", "account"), ("stop", "Vox Humana|8"), ("stop", "Quintadena|16")]
    dispositions = read("/api/workbench/dispositions", filters)
    exported = read("/api/workbench/dispositions/export", filters)
    check(exported["completeSelection"] and exported["total"] == len(exported["items"]) > 0, "Disposition export is incomplete")
    check(exported["selectionSha256"] == dispositions["selectionSha256"], "Disposition example did not retain its selection identity")

    payload = {
        "snapshot": snapshot,
        "operationName": "OrganAndPage",
        "query": """
          query OrganAndPage($id: ID!, $text: String!) {
            entity(kind: organ, id: $id) { id title canonicalUri }
            organs(query: $text, limit: 5, offset: 0) {
              total
              items { id title canonicalUri }
            }
          }
        """,
        "variables": {"id": ORGAN, "text": "Huy-Aderstedt"},
    }
    graphql = read("/api/graphql", payload=payload)
    check(graphql["data"]["entity"]["id"] == "MDVS:ENTY:" + ORGAN, "GraphQL returned the wrong entity")
    organs = graphql["data"]["organs"]
    check(organs["total"] == 1 and [row["id"] for row in organs["items"]] == ["MDVS:ENTY:BBMX-RT3R-R"],
          "GraphQL returned the wrong catalogue page")
    check(graphql["extensions"]["snapshot"] == snapshot, "GraphQL returned the wrong snapshot")
    wrong_snapshot = ("1" if snapshot.startswith("0") else "0") + snapshot[1:]
    read("/api/graphql", payload={**payload, "snapshot": wrong_snapshot}, status=409)
    print("API reference, search, pagination, exports, dispositions, GraphQL and error responses passed.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base", default="http://127.0.0.1:5280", help="local Navigator origin")
    base = parser.parse_args().base.rstrip("/")
    url = urlsplit(base)
    if (url.scheme != "http" or url.hostname not in {"localhost", "127.0.0.1", "::1"}
            or url.path or url.query or url.fragment or url.username or url.password):
        parser.error("--base must be a local HTTP origin")
    try:
        run(base)
    except (URLError, ValueError, KeyError, StopIteration, TimeoutError) as error:
        parser.exit(1, f"Public API example check failed: {error}\n")


if __name__ == "__main__":
    main()
