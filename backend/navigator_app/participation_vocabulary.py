"""References for explicitly recorded roles in the independent MODAVIS edition."""

import json
from functools import lru_cache
from pathlib import Path


@lru_cache(maxsize=1)
def _role_references():
    path = Path(__file__).with_name("terminology_data") / "participation_roles.json"
    data = json.loads(path.read_bytes())
    references = {
        "builder": {
            "code": "activity_role.builder",
            "labels": {"en": "Builder", "de": "Erbauer"},
            "href": data["existingRoles"]["builder"],
        },
    }
    for term in data["concepts"]:
        for role in term["recordedRoles"]:
            references[role] = {
                "code": term["code"],
                "labels": term["labels"],
                "href": f"/vocab/editions/modavis/person-terms/{term['id']}",
            }
    return references


def recorded_participation_roles():
    """Return the exact role codes that can link from the public read model."""
    return sorted(_role_references())


def participation_role_reference(role):
    """Use the recorded role field. Activities and relationship labels are separate."""
    code = role.strip().lower() if isinstance(role, str) else ""
    reference = _role_references().get(code)
    if reference:
        return {**reference, "recordedCode": code}
    return None
