"""Acceptance fixture binding; never an accepted POD release identity."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

RELEASE = "0.0.0-fixture"
CONTRACT = "modavis.navigator.synthetic-fixture/v1"
AUTHORITY = "https://example.invalid/modavis-fixture"


def validate_fixture(settings, policy, metadata):
    path = Path(settings.public_database_manifest_path or "")
    if not path.is_file():
        raise ValueError("Synthetic fixture requires its bound manifest")
    raw = path.read_bytes()
    manifest = json.loads(raw)
    if (manifest.get("contract") != CONTRACT or manifest.get("synthetic") is not True
            or manifest.get("releaseVersion") != RELEASE
            or manifest.get("canonicalAuthority") != AUTHORITY
            or metadata.get("fixture_manifest_sha256") != hashlib.sha256(raw).hexdigest()):
        raise ValueError("Synthetic fixture manifest binding differs")
    if (policy.publication_state != "prepared" or policy.release_version != RELEASE
            or policy.canonical_id_base != AUTHORITY
            or policy.resolver_base != AUTHORITY or policy.data_base != AUTHORITY
            or policy.human_base != AUTHORITY
            or metadata.get("fixture_profile") != CONTRACT):
        raise ValueError("Synthetic fixture requires prepared state and reserved example authority")
    return {"contract": CONTRACT, "synthetic": True,
            "manifestSha256": hashlib.sha256(raw).hexdigest(),
            "inputSha256": manifest["inputSha256"], "attribution": manifest["attribution"]}
