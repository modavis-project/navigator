"""Validate one bounded native Turtle/N-Triples export without network or writes."""

import argparse
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
from rdflib import Graph
from navigator_app.export_validation import validate_native_export


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("graph", type=Path)
    parser.add_argument("--format", choices=("turtle", "nt"), default="turtle")
    args = parser.parse_args()
    with args.graph.open("rb") as stream:
        data = stream.read(16 * 1024 * 1024 + 1)
    if len(data) > 16 * 1024 * 1024:
        parser.error("graph exceeds 16 MiB proof budget")
    result = validate_native_export(Graph().parse(data=data, format=args.format))
    print(json.dumps(result, indent=2, sort_keys=True))
    return 0 if result["accepted"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
