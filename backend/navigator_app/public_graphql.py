"""Bounded query-only GraphQL over the same publication-safe REST readers."""

from __future__ import annotations
import json
import re
import time
from flask import jsonify, request
from graphql import build_schema, parse, validate, execute_sync, GraphQLError
from graphql.language import ast
from .evidence_coverage import field_evidence_coverage
from .request_reliability import DEFAULT_PUBLIC_QUERY_BUDGET_SECONDS

SDL = """
enum EntityKind { organ person organization place name virtual_instrument }
type EvidenceSummary { fieldCount: Int!, unavailable: Int!, sourceContextOnly: Int!, evidenceContextAvailable: Int!, recordSha256: String! }
type Entity { id: ID!, kind: EntityKind!, title: String!, canonicalUri: String, evidence: EvidenceSummary! }
type OrganCard { id: ID!, title: String!, canonicalUri: String }
type OrganPage { total: Int!, items: [OrganCard!]! }
type Query { snapshot: String!, entity(kind: EntityKind!, id: ID!): Entity, organs(query: String, limit: Int = 20, offset: Int = 0): OrganPage! }
"""


def check_query(document):
    operations = [
        node
        for node in document.definitions
        if isinstance(node, ast.OperationDefinitionNode)
    ]
    if (
        len(operations) != 1
        or len(document.definitions) != 1
        or operations[0].operation.value != "query"
    ):
        raise ValueError(
            "Exactly one query operation is supported; mutations, subscriptions and fragments are unavailable"
        )
    count = 0

    def walk(node, depth=0):
        nonlocal count
        count += 1
        if count > 250 or depth > 14:
            raise ValueError("Query exceeds its structural budget")
        if isinstance(
            node, (ast.FragmentSpreadNode, ast.InlineFragmentNode, ast.DirectiveNode)
        ):
            raise ValueError(
                "Fragments and directives are unavailable in this bounded profile"
            )
        if isinstance(node, ast.FieldNode) and node.name.value.startswith("__"):
            raise ValueError("Introspection is unavailable in this bounded profile")
        for key in node.keys:
            child = getattr(node, key, None)
            if isinstance(child, ast.Node):
                walk(child, depth + 1)
            elif isinstance(child, tuple):
                for item in child:
                    if isinstance(item, ast.Node):
                        walk(item, depth + 1)

    walk(document)
    if len(operations[0].selection_set.selections) > 4:
        raise ValueError("At most four root fields are supported")


def register_public_graphql(app, repository, export_record):
    schema = build_schema(SDL)

    def canonical_uri(record, info):
        existing = record.get("canonicalUri")
        if existing:
            return existing
        resolve = getattr(repository, "resolve_mdvs_id", None)
        identifier = record.get("id")
        if not callable(resolve) or not identifier:
            return None
        identities = info.context.setdefault("canonicalUris", {})
        if identifier not in identities:
            # Four roots with up to fifty cards each remain supported. Resolve
            # only requested fields, once per identity, under the query deadline.
            if len(identities) >= 200:
                raise GraphQLError("Canonical identity resolution exceeds budget")
            verified = resolve(identifier)
            identities[identifier] = verified.get("canonicalUri") if verified else None
        return identities[identifier]

    def entity(_root, info, kind, id):
        if len(id) > 256:
            raise GraphQLError("Identifier exceeds budget")
        entities = info.context.setdefault("entities", {})
        key = (kind, id)
        if key in entities:
            return entities[key]
        record = export_record(repository, kind, id)
        if record is None:
            entities[key] = None
            return None
        projected = {
            "id": str(record.get("mdvsId") or record.get("id")),
            "kind": kind,
            "title": str(record.get("title") or record.get("label") or ""),
            "canonicalUri": record.get("canonicalUri") or record.get("identifierUri"),
            "_record": record,
        }
        entities[key] = projected
        return projected

    def entity_evidence(entity, _info):
        if "evidence" not in entity:
            coverage = field_evidence_coverage(
                entity["_record"], release_version=repository.policy.release_version
            )
            states = coverage["states"]
            entity["evidence"] = {
                "fieldCount": coverage["fieldCount"],
                "unavailable": states.get("unavailable", 0),
                "sourceContextOnly": states.get("source_context_only", 0),
                "evidenceContextAvailable": states.get("evidence_context_available", 0),
                "recordSha256": coverage["recordSha256"],
            }
        return entity["evidence"]

    def organs(_root, info, query=None, limit=20, offset=0):
        if (
            limit is None
            or offset is None
            or not 1 <= limit <= 50
            or not 0 <= offset <= 10000
            or (query is not None and len(query) > 256)
        ):
            raise GraphQLError("Invalid pagination or search budget")
        result = repository.list_organs(
            query=query, limit=limit, offset=offset, include_facets=False
        )
        return {
            "total": result["total"],
            "items": [
                {
                    "id": str(row.get("mdvsId") or row.get("id")),
                    "title": str(row.get("title") or row.get("label") or ""),
                    "canonicalUri": row.get("canonicalUri") or row.get("identifierUri"),
                }
                for row in result["items"]
            ],
        }

    schema.query_type.fields["entity"].resolve = entity
    schema.query_type.fields["organs"].resolve = organs
    schema.type_map["Entity"].fields["canonicalUri"].resolve = canonical_uri
    schema.type_map["Entity"].fields["evidence"].resolve = entity_evidence
    schema.type_map["OrganCard"].fields["canonicalUri"].resolve = canonical_uri
    schema.query_type.fields["snapshot"].resolve = lambda root, info: info.context[
        "snapshot"
    ]

    @app.after_request
    def graphql_cache_boundary(response):
        if request.endpoint == "public_graphql":
            response.headers["Cache-Control"] = "no-store"
        return response

    @app.post("/api/graphql")
    def public_graphql():
        if request.content_length is None or request.content_length > 32768:
            return jsonify({"error": "request_size_budget"}), 413
        payload = request.get_json(silent=True)
        if (
            not isinstance(payload, dict)
            or not isinstance(payload.get("query"), str)
            or len(payload["query"]) > 12000
        ):
            return jsonify({"error": "query_object_required"}), 400
        if set(payload) - {
            "query",
            "variables",
            "operationName",
            "snapshot",
        } or not isinstance(payload.get("variables", {}), dict):
            return jsonify({"error": "unsupported_request_fields"}), 400
        workbench = app.extensions.get("research_workbench")
        if workbench is None:
            return jsonify({"error": "pinned_snapshot_unavailable"}), 503
        try:
            workbench.assert_binding()
            snapshot = workbench.binding()["publicCoreSha256"]
            if (
                not re.fullmatch("[0-9a-f]{64}", snapshot)
                or payload.get("snapshot") != snapshot
            ):
                return jsonify({"error": "snapshot_mismatch"}), 409
            document = parse(payload["query"], max_tokens=1000)
            check_query(document)
            errors = validate(schema, document, max_errors=5)
            if errors:
                return jsonify(
                    {"errors": [{"message": e.message} for e in errors]}
                ), 400
        except (ValueError, RuntimeError, GraphQLError):
            return jsonify({"error": "query_or_snapshot_validation_failed"}), 400
        from .db import query_deadline

        deadline = query_deadline.get()
        if deadline is None:
            deadline = time.monotonic() + DEFAULT_PUBLIC_QUERY_BUDGET_SECONDS
        token = query_deadline.set(deadline)
        try:
            result = execute_sync(
                schema,
                document,
                variable_values=payload.get("variables"),
                operation_name=payload.get("operationName"),
                context_value={"snapshot": snapshot},
            )
            if result.errors:
                from psycopg.errors import QueryCanceled
                if time.monotonic() >= deadline or any(
                    isinstance(getattr(error, "original_error", None), (TimeoutError, QueryCanceled))
                    for error in result.errors
                ):
                    raise TimeoutError("GraphQL read budget exhausted")
                return jsonify(
                    {
                        "errors": [
                            {
                                "message": "Query execution refused or failed",
                                "path": e.path,
                            }
                            for e in result.errors
                        ]
                    }
                ), 400
            workbench.assert_binding()
            if time.monotonic() > deadline:
                raise TimeoutError("GraphQL read budget exhausted")
            if workbench.binding()["publicCoreSha256"] != snapshot:
                return jsonify({"error": "snapshot_changed"}), 409
            response = {
                "data": result.data,
                "extensions": {
                    "snapshot": snapshot,
                    "profile": "modavis.public-read-only-graphql/v1",
                },
            }
            if len(json.dumps(response).encode()) > 2 * 1024 * 1024:
                return jsonify({"error": "response_size_budget"}), 413
            return jsonify(response)
        except TimeoutError:
            raise
        except Exception:
            return jsonify({"error": "query_execution_failed"}), 503
        finally:
            query_deadline.reset(token)
