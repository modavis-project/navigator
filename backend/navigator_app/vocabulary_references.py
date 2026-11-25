"""Read-only views over the original, manifest-verified published vocabularies.

The published RDF remains unchanged. SKOS concepts, schemes and ontology resources
retain their distinct kinds; browsing never assigns them to a POD instrument.
"""
from __future__ import annotations

import hashlib
import json
import unicodedata
from collections import Counter
from urllib.parse import urlencode

from flask import Response, jsonify, request
from rdflib import BNode, Graph, Literal, RDF, RDFS, URIRef
from rdflib.namespace import DCTERMS, OWL, SKOS

from .terminology import MEDIA


COLLECTIONS = {
    "network": ("vocab", "MODAVIS Ontology Network vocabularies", "0.1.0", "ontologyCommit",
                "Published concepts for instrument, component, event, evidence and representation roles."),
    "vao-0.6.0": ("vao/0.6.0/vocabulary", "VAO 0.6.0 vocabulary", "0.6.0", "vao06Commit",
                  "Terms used by the VAO manifest and its RDF projection."),
    "mmic": ("vao/profile/mmic/1.0.0/ontology", "MMIC 1.0.0 ontology", "1.0.0", "vao06Commit",
             "VAO terms for mechanical music carriers, observations and reading models."),
    "vao": ("vao/0.5.0/vocabulary", "VAO 0.5.0 vocabulary", "0.5.0", "vaoCommit",
            "The published 0.5.0 vocabulary retained for existing records and saved links."),
}
KINDS = {"concept", "scheme", "class", "property", "other", "all"}
BOUNDARY = "Published reference terminology. This view does not add POD source evidence, classify an organ or promote a candidate concept."


def normalized(value):
    return " ".join(unicodedata.normalize("NFC", value).casefold().split())


def short_uri(value):
    return value.rsplit("#", 1)[-1].rstrip("/").rsplit("/", 1)[-1]


def literal_value(value):
    if isinstance(value, Literal):
        return {"kind": "literal", "value": str(value), "language": value.language,
                "datatype": str(value.datatype) if value.datatype else None}
    return {"kind": "blank" if isinstance(value, BNode) else "uri", "value": str(value)}


class VocabularyReferences:
    def __init__(self, catalogue):
        self.catalogue = catalogue
        self.collections = {}
        for code, (source, title, version, source_commit, description) in COLLECTIONS.items():
            path = catalogue.aliases.get(source, source)
            document = catalogue.documents[path]
            graph = Graph().parse(data=catalogue.bytes[path, "ttl"], format="turtle")
            # The frozen bundles have named resources only. Refuse a future
            # anonymous graph here until deterministic blank-node handling exists.
            if any(isinstance(value, BNode) for triple in graph for value in triple):
                raise ValueError("Reference view requires a reviewed named-resource graph")
            records = {}
            for uri in sorted({subject for subject in graph.subjects() if isinstance(subject, URIRef)}, key=str):
                types = set(graph.objects(uri, RDF.type))
                kind = ("concept" if SKOS.Concept in types else "scheme" if SKOS.ConceptScheme in types
                        else "class" if types & {OWL.Class, RDFS.Class} else "property" if types & {
                            RDF.Property, OWL.ObjectProperty, OWL.DatatypeProperty, OWL.AnnotationProperty,
                            OWL.FunctionalProperty, OWL.InverseFunctionalProperty} else "other")
                labels = sorted([
                    {"value": str(value), "language": value.language, "role": role}
                    for predicate, role in [(SKOS.prefLabel, "preferred"), (SKOS.altLabel, "alternative"),
                                            (SKOS.hiddenLabel, "hidden"), (RDFS.label, "label")]
                    for value in graph.objects(uri, predicate) if isinstance(value, Literal)
                ], key=lambda value: (value["role"], value["language"] or "", value["value"]))
                definitions = [{"predicate": str(predicate), **literal_value(value)} for predicate in (SKOS.definition, RDFS.comment)
                               for value in sorted(graph.objects(uri, predicate), key=str)]
                preferred_languages = Counter(label["language"] or "und" for label in labels if label["role"] == "preferred")
                records[str(uri)] = {"uri": str(uri), "kind": kind, "labels": labels, "definitions": definitions,
                    "schemes": sorted(str(value) for value in graph.objects(uri, SKOS.inScheme)),
                    "notation": sorted(str(value) for value in graph.objects(uri, SKOS.notation)),
                    "labelConflicts": sorted(language for language, count in preferred_languages.items() if count > 1),
                    "search": normalized(" ".join([str(uri), *(label["value"] for label in labels), *(value["value"] for value in definitions)]))}
            concepts = [value for value in records.values() if value["kind"] == "concept"]
            self.collections[code] = {"graph": graph, "records": records, "document": document, "path": path,
                "metadata": {"id": code, "title": title, "description": description, "recordKind": "published_reference",
                    "href": "/vocab/reference?" + urlencode({"collection": code}), "count": len(concepts),
                    "countUnit": "published SKOS concepts", "schemeCount": sum(value["kind"] == "scheme" for value in records.values()),
                    "resourceCount": len(records), "kindCounts": dict(sorted(Counter(value["kind"] for value in records.values()).items())),
                    "languages": sorted({label["language"] for value in records.values() for label in value["labels"] if label["language"]}),
                    "quality": {"conceptsWithoutDefinition": sum(not value["definitions"] for value in concepts),
                        "conceptsWithoutScheme": sum(not value["schemes"] for value in concepts),
                        "preferredLabelConflicts": sum(bool(value["labelConflicts"]) for value in concepts)},
                    "snapshot": document["formats"]["ttl"]["sha256"], "manifestSha256": catalogue.digest,
                    "version": version, "license": "CC BY 4.0", "licenseUrl": "https://creativecommons.org/licenses/by/4.0/",
                    "attribution": "Dominik Ukolov and contributors", "sourcePage": document["html"],
                    "sourceCommit": catalogue.manifest["sources"][source_commit],
                    "availability": "available", "boundary": BOUNDARY,
                    "formats": [{"format": extension, "mediaType": MEDIA[extension], **record,
                        "href": f"/api/vocab/references/{code}/download/{extension}?snapshot={document['formats']['ttl']['sha256']}"}
                        for extension, record in sorted(document["formats"].items())]}}

    def metadata(self):
        return {"schema": "modavis.published-vocabulary-references/v1", "collections": [
            value["metadata"] for value in self.collections.values()], "boundary": BOUNDARY}

    def collection(self, code):
        if code not in self.collections:
            raise LookupError("Published vocabulary collection not found")
        return self.collections[code]

    def present(self, record, language="en"):
        labels = record["labels"]
        visible_labels = [label for label in labels if label["role"] != "hidden"]
        display = next((label for label in visible_labels if label["role"] == "preferred" and label["language"] == language), None)
        display = display or next((label for label in visible_labels if label["language"] == language), None)
        display = display or next((label for label in visible_labels if label["language"] == "en"), None)
        display = display or next(iter(visible_labels), None)
        definitions = record["definitions"]
        definition = next((value for value in definitions if value.get("language") == language), None)
        definition = definition or next((value for value in definitions if value.get("language") == "en"), None)
        definition = definition or next(iter(definitions), None)
        return {key: value for key, value in record.items() if key != "search"} | {
            "label": display["value"] if display else short_uri(record["uri"]),
            "displayLabelLanguage": display["language"] if display else None,
            "displayLabelBasis": "recorded label" if display else "URI local name; no recorded label",
            "definition": definition["value"] if definition else None,
            "definitionPredicate": definition.get("predicate") if definition else None,
            "definitionLanguage": definition.get("language") if definition else None}

    def search(self, code, args):
        collection = self.collection(code)
        language, kind = args.get("language", "en"), args.get("kind", "concept")
        if kind not in KINDS:
            raise ValueError("Unsupported reference resource kind")
        if language not in set(collection["metadata"]["languages"]) | {"en", "und"}:
            raise ValueError("Choose a recorded display language")
        offset, limit = args.get("offset", "0"), args.get("limit", "30")
        if not offset.isascii() or not offset.isdecimal() or int(offset) > 100000 or not limit.isascii() or not limit.isdecimal() or not 1 <= int(limit) <= 100:
            raise ValueError("Reference pagination requires offset 0–100000 and limit 1–100")
        offset, limit = int(offset), int(limit)
        scheme, query = args.get("scheme"), normalized(args.get("q", ""))
        if scheme and scheme != "unassigned" and collection["records"].get(scheme, {}).get("kind") != "scheme":
            raise ValueError("Choose a scheme from this published collection")
        records = [record for record in collection["records"].values() if (kind == "all" or record["kind"] == kind)
                   and (not scheme or (not record["schemes"] if scheme == "unassigned" else scheme in record["schemes"]))
                   and (not query or query in record["search"])]
        items = [self.present(record, language) for record in records]
        items.sort(key=lambda value: (normalized(value["label"]), value["uri"]))
        return {"collection": collection["metadata"], "snapshot": collection["metadata"]["snapshot"],
            "query": args.get("q", ""), "language": language, "kind": kind, "items": items[offset:offset+limit],
            "schemes": [self.present(record, language) for record in collection["records"].values() if record["kind"] == "scheme"],
            "total": len(items), "offset": offset, "limit": limit, "hasMore": offset + limit < len(items), "boundary": BOUNDARY}

    def detail(self, code, uri, language="en"):
        collection = self.collection(code)
        record = collection["records"].get(uri)
        if record is None:
            raise LookupError("Resource not found in this published vocabulary")
        graph, subject = collection["graph"], URIRef(uri)
        statements = [{"predicate": str(predicate), **literal_value(value)}
                      for predicate, value in sorted(graph.predicate_objects(subject), key=lambda row: (str(row[0]), str(row[1]), getattr(row[1], "language", "") or ""))]
        predicates = {SKOS.broader, SKOS.narrower, SKOS.related, SKOS.exactMatch, SKOS.closeMatch, SKOS.inScheme, SKOS.topConceptOf,
                      RDFS.domain, RDFS.range, RDFS.subClassOf, RDFS.subPropertyOf, OWL.inverseOf,
                      OWL.equivalentClass, OWL.equivalentProperty}
        relations = []
        for source, predicate, target in graph:
            if predicate not in predicates or (source != subject and target != subject):
                continue
            other = target if source == subject else source
            if not isinstance(other, URIRef):
                continue
            related = collection["records"].get(str(other))
            relations.append({"predicate": str(predicate), "direction": "outgoing" if source == subject else "incoming",
                              "uri": str(other), "label": self.present(related, language)["label"] if related else short_uri(str(other)),
                              "inCollection": related is not None})
        relations.sort(key=lambda value: (value["predicate"], value["direction"], value["uri"]))
        return {"collection": collection["metadata"], "resource": self.present(record, language),
                "statements": statements, "relations": relations, "snapshot": collection["metadata"]["snapshot"],
                "boundary": BOUNDARY, "evidenceScope": "All retained direct RDF statements about this resource; original whole-graph downloads retain incoming and all other statements."}


def register_vocabulary_references(app):
    provider = VocabularyReferences(app.extensions["terminology_catalog"])
    app.extensions["vocabulary_references"] = provider

    def args_for(code, allowed):
        collection = provider.collection(code)
        if set(request.args) - allowed or any(len(request.args.getlist(key)) != 1 for key in request.args):
            raise ValueError("Use supported reference parameters once each")
        args = dict(request.args)
        if "language" in args and args["language"] not in set(collection["metadata"]["languages"]) | {"en", "und"}:
            raise ValueError("Choose a recorded display language")
        if any(len(value) > (2048 if key in {"uri", "scheme"} else 200) for key, value in args.items()):
            raise ValueError("Reference parameter exceeds its supported length")
        if any(not value or any(ord(character) < 32 for character in value) for key, value in args.items() if key != "q"):
            raise ValueError("Reference parameters must be nonempty and contain no control characters")
        if "snapshot" in args and args["snapshot"] != collection["metadata"]["snapshot"]:
            raise RuntimeError("This link identifies a different published vocabulary snapshot. The requested data has not been substituted.")
        return args

    def response(body, media_type="application/json", filename=None):
        body = body.encode("utf-8") if isinstance(body, str) else body
        result = Response(body, content_type=media_type)
        result.set_etag(hashlib.sha256(body).hexdigest())
        result.headers.update({"Cache-Control": "public, max-age=300", "X-Content-Type-Options": "nosniff"})
        if filename:
            result.headers["Content-Disposition"] = f'attachment; filename="{filename}"'
        return result.make_conditional(request)

    def json_response(value):
        return response(json.dumps(value, ensure_ascii=False, sort_keys=True, indent=2) + "\n")

    @app.get("/api/vocab/references")
    def vocabulary_references_metadata():
        if request.args:
            return jsonify({"error": "The reference directory has no query parameters"}), 400
        return json_response(provider.metadata())

    @app.get("/api/vocab/references/<code>")
    @app.get("/api/vocab/references/<code>/concept")
    @app.get("/api/vocab/references/<code>/download/<extension>")
    def vocabulary_reference(code, extension=None):
        try:
            if extension is not None:
                args_for(code, {"snapshot"})
                collection = provider.collection(code)
                if extension not in collection["document"]["formats"]:
                    raise LookupError("Reference distribution format not found")
                return response(provider.catalogue.bytes[collection["path"], extension], MEDIA[extension], f"{code}-{collection['metadata']['version']}.{extension}")
            if request.path.endswith("/concept"):
                args = args_for(code, {"uri", "language", "snapshot"})
                return json_response(provider.detail(code, args.get("uri", ""), args.get("language", "en")))
            return json_response(provider.search(code, args_for(code, {"q", "kind", "scheme", "language", "offset", "limit", "snapshot"})))
        except LookupError as error:
            result, status = jsonify({"error": str(error)}), 404
        except RuntimeError as error:
            result, status = jsonify({"error": str(error)}), 409
        except ValueError as error:
            result, status = jsonify({"error": str(error)}), 400
        result.headers["Cache-Control"] = "no-store"
        return result, status
