"""Optional, receipt-bound coordinate interpretation on public read models."""
import json

CONTRACT = "modavis.place-coordinate-evidence/v1"


def interpretations(rows, kind, identifiers):
    if not identifiers or not rows("select value from metadata where key=? and value=?", ("place_coordinate_evidence_contract", CONTRACT)):
        return {}
    marks = ",".join("?" for _ in identifiers)
    return {row["subject_id"]: json.loads(row["evidence_json"]) for row in rows(
        f"select subject_id,evidence_json from coordinate_interpretation where subject_kind=? and subject_id in ({marks})",
        (kind, *identifiers),
    )}
