"""Match documented organ source wording to catalogue tuning systems."""

from __future__ import annotations

import re
from collections import defaultdict
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import Any
from urllib.parse import quote

from .temperament_evidence import temperament_assertion_kind, temperament_comparison_key
from .temperament_lookup import temperament_family_wording, temperament_wording_tokens


EXACT = "exact_variant"
FAMILY = "family_wording"
OCCURRENCE_SCOPE_KINDS = {"exact": EXACT, "family": FAMILY}

_TITLE_QUALIFIER = re.compile(r"\s*[(\[{'’/]|\s+(?:modifiziert|abgeändert|gemildert|vereinfacht)\b", re.I)
_VARIANT = re.compile(r"\d+[a-z]?|t\d+")
_YEAR = re.compile(r"(?:1\d{3}|20\d{2})")

Words = tuple[str, ...]


def _words(value: Any) -> Words:
    return tuple(word for word, _ in temperament_wording_tokens(value))


def _catalogue_family(title: str) -> tuple[Words, str | None]:
    words = _words(_TITLE_QUALIFIER.split(title, maxsplit=1)[0])
    for index, word in enumerate(words[1:], start=1):
        if _VARIANT.fullmatch(word):
            return words[:index], word
    return words, None


@dataclass(frozen=True)
class _CatalogueVariant:
    id: str
    base_title: Words
    ordinal: str | None


class TemperamentOccurrenceMatcher:
    """Separate precise record references from related source wording."""

    def __init__(self, records: Sequence[Mapping[str, Any]]) -> None:
        self.records = {str(record["id"]): record for record in records}
        self._identifiers: dict[Words, set[str]] = defaultdict(set)
        self._titles: dict[Words, set[str]] = defaultdict(set)
        self._base_titles: dict[Words, set[str]] = defaultdict(set)
        self._families: dict[Words, list[_CatalogueVariant]] = defaultdict(list)
        self._families_by_first_word: dict[str, list[Words]] = defaultdict(list)
        for record_id, record in self.records.items():
            for value in (record_id, record.get("tuningId"), record.get("sourceRecordId")):
                key = _words(value)
                if key:
                    self._identifiers[key].add(record_id)
            label = _words(record.get("label"))
            if label:
                self._titles[label].add(record_id)
            title = str(record.get("title") or "")
            title_words = _words(title)
            if not title_words:
                continue
            self._titles[title_words].add(record_id)
            base_title = title_words
            if title_words[-1] == "genauer":
                title = title.rsplit(maxsplit=1)[0] if len(title_words) > 1 else ""
                base_title = title_words[:-1]
            self._base_titles[base_title].add(record_id)
            family, ordinal = _catalogue_family(title)
            if family:
                self._families[family].append(_CatalogueVariant(record_id, base_title, ordinal))
        for family in self._families:
            self._families_by_first_word[family[0]].append(family)

    def match(
        self, source_value: Any, source: str | None = None, source_record_id: str | None = None,
    ) -> dict[str, str]:
        if temperament_assertion_kind(source_value, source, source_record_id) != "wording":
            return {}
        tokens = temperament_wording_tokens(source_value)
        source_words = tuple(word for word, _ in tokens)
        if not source_words:
            return {}
        if ids := self._identifiers.get(source_words):
            return self._classify_complete(ids)
        if base_ids := self._base_titles.get(source_words):
            # Paired rounded and precise catalogue entries share a title stem.
            # Source wording with that stem does not select a precision.
            title_ids = self._titles.get(source_words, set())
            ids = base_ids | title_ids
            kind = EXACT if len(ids) == 1 and title_ids else FAMILY
            return {record_id: kind for record_id in ids}
        if ids := self._titles.get(source_words):
            return self._classify_complete(ids)
        # The BDO catalogue distinguishes Kellner's well-tempered system
        # from the reconstruction of Kirnberger III also attributed to him.
        if source_words in {("kellner",), ("kellner", "modified")}:
            return {"5hwoKn": FAMILY} if "5hwoKn" in self.records else {}
        broad_family = {"class:equal": "gleichstufig", "class:well-tempered": "wohltemperiert"}.get(
            temperament_comparison_key(source_value)
        )
        if broad_family:
            return {variant.id: FAMILY for variant in self._families.get((broad_family,), ())}

        tokens = temperament_family_wording(tokens)
        source_words = tuple(word for word, _ in tokens)
        related: set[str] = set()
        for start, (word, depth) in enumerate(tokens):
            if depth:
                continue
            for family in self._families_by_first_word.get(word, ()):
                end = start + len(family)
                if source_words[start:end] != family:
                    continue
                variants = self._families[family]
                qualified = [
                    variant for variant in variants
                    if len(variant.base_title) > len(family)
                    and source_words[start:start + len(variant.base_title)] == variant.base_title
                ]
                if qualified:
                    longest = max(len(variant.base_title) for variant in qualified)
                    related.update(variant.id for variant in qualified if len(variant.base_title) == longest)
                    continue
                ordinal = tokens[end][0] if end < len(tokens) and not tokens[end][1] else ""
                if _VARIANT.fullmatch(ordinal) and any(variant.ordinal for variant in variants):
                    if not _YEAR.fullmatch(ordinal) or any(_YEAR.fullmatch(variant.ordinal or "") for variant in variants):
                        variants = [variant for variant in variants if variant.ordinal == ordinal]
                related.update(variant.id for variant in variants)
        return {record_id: FAMILY for record_id in related}

    def catalog_url(
        self, source_value: Any, source: str | None = None, source_record_id: str | None = None,
    ) -> str | None:
        matches = self.match(source_value, source, source_record_id)
        if not matches:
            return None
        if len(matches) == 1:
            record_id, kind = next(iter(matches.items()))
            if kind == EXACT:
                return f"/temperaments/{quote(record_id, safe='')}"
        return f"/temperaments?q={quote(str(source_value).strip(), safe='')}&scope=evidence"

    @staticmethod
    def _classify_complete(ids: set[str]) -> dict[str, str]:
        kind = EXACT if len(ids) == 1 else FAMILY
        return {record_id: kind for record_id in ids}
