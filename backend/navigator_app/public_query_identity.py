"""Additive semantic query receipts; never a replacement for a v1 digest."""
from __future__ import annotations

import hashlib
import json
import unicodedata
from collections.abc import Iterable, Mapping

CONTRACT = "modavis.semantic-query/v2"
MAX_SEARCH_TEXT_LENGTH = 200


class SnapshotBindingChanged(RuntimeError):
    """An immutable application's manifest changed after it was selected."""


def normalize_search_text(value: str | None) -> str:
    """Preserve literal wording, punctuation and interior spaces."""
    return unicodedata.normalize("NFC", str(value or "").strip())


def literal_pattern(value: str | None, *, prefix: bool = False) -> str:
    text = normalize_search_text(value).replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return ("" if prefix else "%") + text + "%"


def literal_search_patterns(value: str, key: str) -> dict[str, str]:
    """Bind whitespace-separated terms for a bounded, literal text search."""
    value = normalize_search_text(value)
    terms = value.split() if len(value) <= MAX_SEARCH_TEXT_LENGTH else []
    if len(terms) < 2:
        return {key: literal_pattern(value)}
    return {f"{key}_{index}": literal_pattern(term) for index, term in enumerate(terms)}


def literal_match_sql(column: str, keys: Iterable[str]) -> str:
    return " AND ".join(f"{column} ILIKE %({key})s ESCAPE '\\'" for key in keys)


def semantic_query_identity(route: str, parameters: Mapping, *, bindings: Mapping, method: str) -> dict:
    """Hash the caller's validated semantic operands and explicit dependencies.

    The caller owns route defaults, identifier aliases and case sensitivity.
    Presentation/pagination fields must be excluded by that route's registry;
    this shared function deliberately does not guess which keys are semantic.
    """
    body = {"contract": CONTRACT, "route": route, "parameters": dict(parameters),
            "bindings": dict(bindings), "method": method}
    encoded = json.dumps(body, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False).encode()
    sha = hashlib.sha256(encoded).hexdigest()
    return {**body, "sha256": sha, "id": "sha256:" + sha}
