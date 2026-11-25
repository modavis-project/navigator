"""Temperament assertions, with source codes separated from comparable wording."""

from __future__ import annotations

import re
import unicodedata
from collections.abc import Iterable, Mapping, Sequence
from typing import Any

from .temperament_lookup import temperament_wording_tokens

def temperament_wording_key(value: Any) -> str:
    return " ".join(unicodedata.normalize("NFKC", str(value if value is not None else "")).casefold().split())


def temperament_assertion_kind(
    value: Any, source: str | None = None, source_record_id: str | None = None,
) -> str:
    wording = temperament_wording_key(value)
    if not wording:
        return "missing"
    source_key = str(source or "").casefold().removeprefix("src:")
    if (source_key == "ohs" or str(source_record_id or "").startswith("sr:ohs:")) and re.fullmatch(r"\d+", wording):
        return "source_code"
    return "wording"


_EQUAL = re.compile(
    r"(?:equal(?: temperament)?|gleichstufig(?:e temperatur)?|gelijkzwevend(?:e stemming)?)"
    r"(?: at \d+(?:[.,]\d+)?\s*hz(?: hz)?)?"
)
_UNEQUAL = {
    "unequal", "unequal temperament", "non-equal temperament", "non equal temperament",
    "onevenredig zwevend", "ongelijkzwevend", "ungleichstufig",
}
_MEANTONE = {"meantone", "mean tone", "middentoonstemming", "mitteltönig"}
_WELL_TEMPERED = {"well-tempered", "well tempered", "wohltemperiert"}
_NAME_ALIASES = {"valotti": "vallotti", "vallotti": "vallotti",
                 "weckmeister": "werckmeister", "werckmeister": "werckmeister"}


def temperament_comparison_key(value: Any) -> str:
    return recognized_temperament_key(value) or temperament_wording_key(value)


def recognized_temperament_key(value: Any) -> str | None:
    wording = temperament_wording_key(value)
    if _EQUAL.fullmatch(wording):
        return "class:equal"
    if wording in _UNEQUAL:
        return "class:unequal"
    if wording in _MEANTONE:
        return "class:meantone"
    if wording in _WELL_TEMPERED:
        return "class:well-tempered"
    tokens = [token for token, _ in temperament_wording_tokens(wording)]
    if (len(tokens) == 2 and tokens[0] == "kirnberger"
            and re.fullmatch(r"\d{1,2}[a-z]?", tokens[1])):
        return f"variant:{tokens[0]}:{tokens[1]}"
    return _NAME_ALIASES.get(wording)


def temperament_meanings_disagree(keys: Iterable[str]) -> bool:
    values = set(keys)
    if "class:equal" in values and values & {
        "class:unequal", "class:meantone",
    }:
        return True
    return sum(value.startswith("variant:kirnberger:") for value in values) > 1


def summarize_temperament_assertions(assertions: Sequence[Mapping[str, Any]]) -> tuple[str, str | None]:
    wordings = [assertion for assertion in assertions if assertion["valueKind"] == "wording"]
    codes = any(assertion["valueKind"] == "source_code" for assertion in assertions)
    if not wordings:
        return ("source_code_only" if codes else "unavailable"), None
    meanings = {temperament_comparison_key(assertion["value"]) for assertion in wordings}
    if len(meanings) > 1:
        return ("sources_differ" if temperament_meanings_disagree(meanings) else "different_wording"), None
    preferred = wordings[0]["value"]
    if codes:
        return "not_comparable", preferred
    if len({temperament_wording_key(assertion["value"]) for assertion in wordings}) > 1:
        return "equivalent_wording", preferred
    return ("agreement" if len({assertion["sourceRecordId"] for assertion in wordings}) > 1 else "single_source"), preferred


def merge_temperament_rows(
    structured: Iterable[Mapping[str, Any]], facts: Iterable[Mapping[str, Any]],
) -> list[dict[str, Any]]:
    """Retain source wording and deduplicate technical facts mirrored by a structured assertion."""
    rows = []
    seen = set()
    for row in structured:
        rows.append(dict(row))
        seen.add((row.get("organ_mdvs_id"), row["source_record_id"], temperament_wording_key(row["source_value"])))
    for row in facts:
        if row["family"] != "temperament":
            continue
        value = row.get("display_value")
        if not temperament_wording_key(value) and row.get("normalized_number") is not None:
            value = str(row["normalized_number"])
        wording = temperament_wording_key(value)
        key = (row.get("organ_mdvs_id"), row["source_record_id"], wording)
        if wording and key not in seen:
            rows.append({**row, "source_value": value})
            seen.add(key)
    return rows
