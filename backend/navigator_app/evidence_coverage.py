"""Explicit evidence availability for every field in a bounded public record."""

from __future__ import annotations
from collections import Counter
from collections.abc import Mapping
import hashlib
import json

CONTRACT = "modavis.public-field-evidence-coverage/v1"
MAX_FIELDS = 20000
EVIDENCE_KEYS = {
    "summaryEvidence",
    "identityEvidence",
    "coordinateEvidence",
    "quantityFieldEvidence",
    "sourceFragment",
    "sourceComponentQualification",
    "interpretationEvidence",
    "evidence",
}
SOURCE_KEYS = {"sourceRecordId", "source_record_id", "sourceId"}


def field_evidence_coverage(record, *, release_version):
    """Availability is not truth, independence, or field-level attribution.

    Source context alone is explicitly weaker than a source locator. Existing
    receipts stay in the record; this index never invents missing provenance.
    """
    if not isinstance(record, Mapping):
        raise ValueError("Public record must be an object")
    fields = []

    def walk(value, pointer, context=None, depth=0):
        if depth > 40 or len(fields) >= MAX_FIELDS:
            raise ValueError("Evidence coverage exceeds its bounded profile")
        if isinstance(value, Mapping) and value:
            context = dict(context or {})
            evidence = [key for key in sorted(EVIDENCE_KEYS) if value.get(key)]
            sources = [
                str(value[key])
                for key in sorted(SOURCE_KEYS)
                if isinstance(value.get(key), (str, int)) and value[key]
            ]
            if evidence:
                context.update(
                    state="evidence_context_available",
                    evidencePointers=[pointer + "/" + key for key in evidence],
                    scope="containing_object_not_individual_field",
                )
            elif sources and context.get("state") != "evidence_context_available":
                context.update(
                    state="source_context_only",
                    scope="containing_object_not_individual_field",
                )
            if sources:
                context["sourceReferences"] = sources
            for key, child in sorted(value.items()):
                escaped = str(key).replace("~", "~0").replace("/", "~1")
                walk(child, pointer + "/" + escaped, context, depth + 1)
        elif isinstance(value, list) and value:
            for index, child in enumerate(value):
                walk(child, pointer + "/" + str(index), context, depth + 1)
        else:
            fields.append(
                {
                    "pointer": pointer,
                    **(
                        context
                        or {
                            "state": "unavailable",
                            "scope": "no_field_evidence_mapping_in_public_record",
                        }
                    ),
                    "valuePresent": value not in (None, "", [], {}),
                }
            )

    walk(record, "")
    encoded = json.dumps(
        record,
        sort_keys=True,
        ensure_ascii=False,
        separators=(",", ":"),
        allow_nan=False,
    ).encode()
    return {
        "contract": CONTRACT,
        "releaseVersion": release_version,
        "recordSha256": hashlib.sha256(encoded).hexdigest(),
        "fieldCount": len(fields),
        "states": dict(sorted(Counter(f["state"] for f in fields).items())),
        "fields": fields,
        "complete": True,
        "qualification": "Context availability only; no automatic field attribution, independent corroboration or historical truth claim.",
    }
