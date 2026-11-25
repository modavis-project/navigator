"""Bounded comparisons of existing public records; no canonical mutation."""
from __future__ import annotations

import hashlib
import json
import sqlite3
from pathlib import Path
from urllib.parse import quote

from flask import jsonify, request

from .public_query_identity import semantic_query_identity

CONTRACT = "modavis.organ-research-comparison/v1"
MAX_ORGANS = 4
ACCOUNT_LIMIT = 100
ASSERTION_LIMIT = 100
EXPORT_RECORD_LIMIT = 50_000
QUERY_SHA256 = hashlib.sha256(Path(__file__).read_bytes()).hexdigest()


def _identifier(value):
    value = value.strip()
    if not value or len(value) > 100:
        raise ValueError("Invalid organ identifier")
    return value if value.startswith("MDVS:") else "MDVS:ENTY:" + value


def compare_organs(work, connection, identifiers, *, complete=False):
    ids = [_identifier(value) for value in identifiers]
    if not 2 <= len(ids) <= MAX_ORGANS or len(set(ids)) != len(ids):
        raise ValueError("Select two to four distinct organ records")
    binding = {**work.binding(), "workspaceQuerySha256": QUERY_SHA256}
    pins = "&snapshot=" + binding["publicCoreSha256"]
    if binding.get("occurrenceAssessmentSha256"):
        pins += "&assessment=" + binding["occurrenceAssessmentSha256"]
    result = []
    exported_records = 0
    for identifier in ids:
        organ = connection.execute("select mdvs_id,label from core.organ where mdvs_id=?", (identifier,)).fetchone()
        if organ is None:
            raise LookupError("A selected organ is unavailable in this snapshot")
        sources = [dict(row) for row in connection.execute(
            "select source_record_id,source_key from core.source_membership where organ_mdvs_id=? order by source_key,source_record_id", (identifier,))]
        by_source = {}
        for source in sources:
            item = by_source.setdefault(source["source_key"], {"source": source["source_key"], "sourceRecords": 0})
            item["sourceRecords"] += 1
        account_count = connection.execute("select count(*) from work_configuration where organ=?", (identifier,)).fetchone()[0]
        assertion_count = connection.execute("select count(*) from core.technical_fact where organ_mdvs_id=?", (identifier,)).fetchone()[0]
        exported_records += account_count + assertion_count
        if complete and exported_records > EXPORT_RECORD_LIMIT:
            raise OverflowError("Complete organ comparison exceeds 50,000 evidence records; choose fewer organs")
        accounts = []
        for row in connection.execute("select id,source,year,date_kind,coverage,payload from work_configuration where organ=? order by year is null,year,id limit ?", (identifier, account_count if complete else ACCOUNT_LIMIT)):
            payload = json.loads(row["payload"])
            revision = payload.get("description_revision")
            accounts.append({"id": row["id"], "revision": revision,
                "title": payload.get("source_heading") or payload.get("period_label") or "Source account",
                "period": payload.get("period_label"), "dateKind": row["date_kind"], "year": row["year"],
                "coverage": row["coverage"], "subject": payload.get("subject_kind"), "realization": payload.get("realization"),
                "sourceRecordId": row["source"],
                "source": next((source["source_key"] for source in sources if source["source_record_id"] == row["source"]), None),
                "href": "/organs/" + quote(identifier.removeprefix("MDVS:ENTY:"), safe="") + "?tab=specification&description=" + quote(row["id"], safe="") + ("&descriptionRevision=" + quote(revision, safe="") if revision else "")})
        event_count = connection.execute("select count(*) from work_event where organ=?", (identifier,)).fetchone()[0]
        dated_count = connection.execute("select count(*) from work_event where organ=? and start is not null", (identifier,)).fetchone()[0]
        assertions = []
        for row in connection.execute("select fact_id,family,display_value,source_record_id from core.technical_fact where organ_mdvs_id=? order by family,source_record_id,fact_id limit ?", (identifier, assertion_count if complete else ASSERTION_LIMIT)):
            assertions.append(dict(row))
        source_counts = [by_source[key] for key in sorted(by_source)]
        href = "/organs/" + quote(identifier.removeprefix("MDVS:ENTY:"), safe="")
        result.append({"id": identifier, "title": organ["label"], "href": href,
            "sourceRecords": len(sources), "sourceCollections": len(source_counts), "sources": source_counts,
            "configurationAccounts": account_count, "accounts": accounts, "accountsComplete": len(accounts) == account_count,
            "eventAssertions": event_count, "datedEventAssertions": dated_count,
            "technicalAssertions": assertion_count, "assertions": assertions, "assertionsComplete": len(assertions) == assertion_count,
            "allAccountsHref": "/use-cases/research-workbench?view=selection&section=configurations&organ=" + quote(identifier, safe="") + pins,
            "timelineHref": "/use-cases/research-workbench?view=timeline&organ=" + quote(identifier, safe="") + pins,
            "claimsHref": "/use-cases/research-workbench?view=claims&organ=" + quote(identifier, safe="") + pins})
    identity = semantic_query_identity("organ-comparison", {"organs": sorted(ids)}, bindings=binding, method=CONTRACT)
    return {**binding, "comparisonContract": CONTRACT, "semanticQuery": identity, "organs": result,
        "sourceCoverage": [{"source": source, "organs": [{"organ": organ["id"], "sourceRecords": next((item["sourceRecords"] for item in organ["sources"] if item["source"] == source), 0)} for organ in result]} for source in sorted({item["source"] for organ in result for item in organ["sources"]})],
        "unit": "existing public organ records and separately attributed source accounts",
        "method": "Compare documented coverage and retained source assertions. A source-record count does not establish independent corroboration. Missing account capture is not an absent instrument feature. Event assertions are not deduplicated historical events. No physical continuity, acoustic equivalence or actor identity is inferred.",
        "completeComparison": all(organ["accountsComplete"] and organ["assertionsComplete"] for organ in result),
        "limits": {"organs": MAX_ORGANS, "accountsPerOrgan": None if complete else ACCOUNT_LIMIT, "technicalAssertionsPerOrgan": None if complete else ASSERTION_LIMIT, "exportEvidenceRecords": EXPORT_RECORD_LIMIT}}


def register_research_workspace(app):
    @app.get("/api/workbench/organ-comparison")
    def organ_comparison():
        from .research_workbench import validate_query
        work = app.extensions.get("research_workbench")
        if work is None:
            return jsonify({"error": "A verified research workbench is unavailable"}), 503
        try:
            work.assert_binding()
            values = validate_query("organ-comparison", request.args, work)
            if values.get("snapshot") and values["snapshot"] != work.manifest["core"]["sha256"]:
                return jsonify({"error": "Requested research snapshot unavailable"}), 409
            if values.get("assessment") and values["assessment"] != work.binding().get("occurrenceAssessmentSha256"):
                return jsonify({"error": "Requested identity assessment snapshot unavailable"}), 409
            identifiers = values.get("organs", "").split(",")
            with work.connect() as connection:
                result = compare_organs(work, connection, identifiers, complete=request.args.get("format") == "ro-crate")
            work.assert_binding()
            return jsonify(result)
        except OverflowError as error:
            return jsonify({"error": str(error)}), 413
        except LookupError as error:
            return jsonify({"error": str(error)}), 404
        except (ValueError, TypeError) as error:
            return jsonify({"error": str(error)}), 400
        except TimeoutError:
            raise
        except (RuntimeError, OSError):
            return jsonify({"error": "Research snapshot unavailable or changed"}), 409
        except sqlite3.OperationalError as error:
            if "interrupted" in str(error).lower() or "budget exhausted" in str(error).lower():
                raise TimeoutError("Organ comparison query budget exhausted") from error
            return jsonify({"error": "Comparison exceeded its query budget. Use a smaller selection."}), 503
