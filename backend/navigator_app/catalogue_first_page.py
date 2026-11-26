"""Bind derived catalogue pages to the immutable public dataset."""

from hashlib import sha256
import json
import re
from typing import Any, Mapping


CATALOGUE_PAGE_VERSION = 1
_FIXITY = re.compile(r"[0-9a-f]{64}")


def catalogue_snapshot(binding: Mapping[str, Any]) -> str | None:
    fields = (
        "sourceReleaseVersion", "publicCoreSha256", "publicManifestSha256",
        "identifierLedgerSha256", "uriPolicyVersion",
    )
    snapshot = {key: binding.get(key) for key in fields}
    if not all(isinstance(snapshot[key], str) and _FIXITY.fullmatch(snapshot[key])
               for key in ("publicCoreSha256", "publicManifestSha256")):
        return None
    body = json.dumps(
        {"version": CATALOGUE_PAGE_VERSION, "snapshot": snapshot},
        sort_keys=True, separators=(",", ":"),
    )
    return sha256(body.encode()).hexdigest()
