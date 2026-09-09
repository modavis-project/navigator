"""Versioned JSON Schema for publication-safe source projections."""

from __future__ import annotations

from typing import Any

from .uri_policy import UriPolicy


def public_source_projection_schema(policy: UriPolicy) -> dict[str, Any]:
    """Return the immutable schema document bound to one dataset release."""
    schema_uri = policy.public_source_projection_schema_uri()
    row = {
        "type": "object",
        "additionalProperties": True,
    }
    return {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$id": schema_uri,
        "title": "MODAVIS public source projection 1.0",
        "description": (
            "Publication-safe structured data reconstructed from accepted source "
            "records. Raw payloads, source prose, media bytes, and workflow state "
            "are outside this contract."
        ),
        "type": "object",
        "additionalProperties": False,
        "required": [
            "$schema",
            "contract",
            "datasetVersion",
            "source",
            "entity",
            "structured",
            "rightsBoundary",
        ],
        "properties": {
            "$schema": {"const": schema_uri},
            "contract": {"const": "modavis.public-source-projection/v1"},
            "datasetVersion": {"const": policy.release_version},
            "source": {
                "type": "object",
                "additionalProperties": False,
                "required": ["recordId", "key", "availableSections"],
                "properties": {
                    "recordId": {"type": "string", "minLength": 1},
                    "key": {"type": "string", "minLength": 1},
                    "nativeIdentifier": {"type": ["string", "null"]},
                    "url": {"type": ["string", "null"], "format": "uri"},
                    "recordType": {"type": ["string", "null"]},
                    "schema": {
                        "type": "object",
                        "additionalProperties": False,
                        "properties": {
                            "key": {"type": ["string", "null"]},
                            "version": {"type": ["string", "null"]},
                            "hash": {"type": ["string", "null"]},
                        },
                    },
                    "payloadSha256": {
                        "type": ["string", "null"],
                        "pattern": "^[0-9a-f]{64}$",
                    },
                    "availableSections": {"type": "object"},
                },
            },
            "entity": {
                "type": "object",
                "additionalProperties": False,
                "required": ["mdvsId", "canonicalUri", "label", "type"],
                "properties": {
                    "mdvsId": {"type": "string", "minLength": 1},
                    "canonicalUri": {"type": "string", "format": "uri"},
                    "label": {"type": ["string", "null"]},
                    "type": {"const": "pipe_organ"},
                },
            },
            "structured": {
                "type": "object",
                "additionalProperties": False,
                "required": [
                    "builders",
                    "places",
                    "events",
                    "specifications",
                    "technicalFacts",
                    "mediaReferences",
                ],
                "properties": {
                    "builders": {"type": "array", "items": row},
                    "places": {"type": "array", "items": row},
                    "events": {"type": "array", "items": row},
                    "specifications": {"type": "array", "items": row},
                    "technicalFacts": {"type": "array", "items": row},
                    "mediaReferences": {"type": "array", "items": row},
                },
            },
            "rightsBoundary": {
                "type": "object",
                "additionalProperties": False,
                "required": [
                    "rawPayloadIncluded",
                    "sourceProseIncluded",
                    "mediaBytesIncluded",
                    "reviewOrWorkflowStateIncluded",
                ],
                "properties": {
                    "rawPayloadIncluded": {"const": False},
                    "sourceProseIncluded": {"const": False},
                    "mediaBytesIncluded": {"const": False},
                    "reviewOrWorkflowStateIncluded": {"const": False},
                },
            },
        },
    }
