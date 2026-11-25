"""Offline, non-vacuous conformance for a pinned native export profile."""

from __future__ import annotations
import hashlib
import json
from pathlib import Path
from importlib.metadata import version
from rdflib import Graph, Namespace, RDF
from .entity_exports import exact_nt_lines

SH = Namespace("http://www.w3.org/ns/shacl#")
DCT = Namespace("http://purl.org/dc/terms/")
ASSETS = Path(__file__).parent / "validation_data"


def validate_native_export(graph):
    from pyshacl import validate

    manifest = json.loads((ASSETS / "source-manifest.json").read_text())
    subset = (ASSETS / "exchange-subset.ttl").read_bytes()
    if hashlib.sha256(subset).hexdigest() != manifest["subsetSha256"]:
        raise ValueError("Pinned shape checksum mismatch")
    shapes = Graph().parse(data=subset, format="turtle")
    native = (ASSETS / "native-export.ttl").read_bytes()
    shapes.parse(data=native, format="turtle")
    targets = {}
    for shape in set(shapes.subjects(RDF.type, SH.NodeShape)):
        focus = set()
        for target in shapes.objects(shape, SH.targetClass):
            focus.update(graph.subjects(RDF.type, target))
        for target in shapes.objects(shape, SH.targetSubjectsOf):
            focus.update(graph.subjects(target, None))
        targets[str(shape)] = len(focus)
    roots = set(graph.subjects(DCT.isPartOf, None))
    nonvacuous = bool(roots) and any(targets.values())
    conforms, report, _ = validate(
        graph,
        shacl_graph=shapes,
        inference="none",
        advanced=False,
        allow_warnings=False,
        allow_infos=False,
    )
    failures = [
        {
            "focus": str(report.value(item, SH.focusNode) or ""),
            "path": str(report.value(item, SH.resultPath) or ""),
            "message": str(report.value(item, SH.resultMessage) or ""),
            "severity": str(report.value(item, SH.resultSeverity) or ""),
        }
        for item in report.subjects(RDF.type, SH.ValidationResult)
    ]
    digest = hashlib.sha256(
        ("\n".join(sorted(exact_nt_lines(graph))) + "\n").encode()
    ).hexdigest()
    return {
        "profile": manifest["profile"],
        "accepted": bool(conforms and nonvacuous),
        "shaclConforms": bool(conforms),
        "nonVacuous": nonvacuous,
        "rootCount": len(roots),
        "targets": targets,
        "tripleCount": len(graph),
        "graphSha256": digest,
        "shapeSha256": hashlib.sha256(subset + native).hexdigest(),
        "upstreamSourceManifestSha256": hashlib.sha256(
            (ASSETS / "source-manifest.json").read_bytes()
        ).hexdigest(),
        "validator": {
            "pyshacl": version("pyshacl"),
            "rdflib": version("rdflib"),
            "inference": "none",
        },
        "failures": failures,
        "scope": manifest["scope"],
    }
