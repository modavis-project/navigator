"""Catalogue discovery from source wording, without asserting tuning identity."""

from __future__ import annotations

import re
import unicodedata
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import Any


_SPELLINGS = {"valotti": "vallotti", "weckmeister": "werckmeister", "neidhard": "neidhardt"}
_GENERIC_PREFIXES = {
    "temperament", "temperatur", "stimmung", "genauer", "nach", "eine",
    "einen", "fuer", "the", "with", "modified", "modifiziert",
}
_ROMAN = {
    tens + units: str(t * 10 + u)
    for t, tens in enumerate(("", "x", "xx", "xxx"))
    for u, units in enumerate(("", "i", "ii", "iii", "iv", "v", "vi", "vii", "viii", "ix"))
    if tens or units
}
_FAMILY_ALIASES = {
    ("equal", "temperament"): "gleichstufig",
    ("meantone",): "mitteltonig",
    ("mean", "tone"): "mitteltonig",
    ("middentoonstemming",): "mitteltonig",
}


def _fold(value: Any) -> str:
    text = unicodedata.normalize("NFKD", str(value or "").casefold()).replace("ß", "ss")
    return "".join(c for c in text if not unicodedata.combining(c))


def temperament_wording_tokens(value: Any, *, normalize: bool = True) -> list[tuple[str, int]]:
    depth = 0
    result = []
    for match in re.finditer(r"[a-z0-9]+|[()\[\]{}]", _fold(value)):
        token = match.group()
        if token in "([{":
            depth += 1
        elif token in ")]}":
            depth = max(0, depth - 1)
        else:
            if normalize:
                token = _SPELLINGS.get(token, token)
                # Numerals identify variants after a name. A single-letter
                # search must retain its ordinary substring behaviour.
                previous = result[-1][0] if result else ""
                if re.fullmatch(r"[a-z]{4,}", previous) and previous not in _GENERIC_PREFIXES:
                    token = _ROMAN.get(token, token)
            result.append((token, depth))
    return result


def temperament_family_wording(tokens: list[tuple[str, int]]) -> list[tuple[str, int]]:
    """Normalize attested class names for discovery and related matches."""
    normalized: list[tuple[str, int]] = []
    index = 0
    while index < len(tokens):
        word, depth = tokens[index]
        for names, target in _FAMILY_ALIASES.items():
            # The unqualified name for 12-tone equal temperament may also
            # appear within a different or explicitly negated tuning.
            if target == "gleichstufig" and index:
                continue
            if tokens[index:index + len(names)] == [(name, depth) for name in names]:
                normalized.append((target, depth))
                index += len(names)
                break
        else:
            normalized.append((word, depth))
            index += 1
    return normalized


def _key(value: Any, *, normalize: bool = True) -> str:
    return " ".join(token for token, _ in temperament_wording_tokens(value, normalize=normalize))


def _contains(text: str, query: str) -> bool:
    # A numbered name such as Werckmeister 3 must not match Werckmeister 30.
    return bool(re.search(re.escape(query) + (r"(?!\d)" if query[-1:].isdigit() else ""), text))


def _identity(item: Mapping[str, Any]) -> str:
    return " ".join(str(item.get(key) or "") for key in ("id", "tuningId", "label", "title"))


@dataclass(frozen=True)
class TemperamentSearch:
    ids: frozenset[str]
    interpretation: dict[str, Any] | None = None


def search_temperaments(
    query: str | None,
    items: Sequence[Mapping[str, Any]],
    *,
    identity_only: bool = False,
) -> TemperamentSearch:
    original = str(query or "").strip()
    tokens = temperament_wording_tokens(original)
    query_key = " ".join(token for token, _ in tokens)
    if not query_key:
        return TemperamentSearch(frozenset(str(item["id"]) for item in items) if not original else frozenset())

    def haystack(item: Mapping[str, Any]) -> str:
        return _identity(item) if identity_only else str(item.get("searchText") or _identity(item))

    literal_key = _key(original, normalize=False)
    literal = frozenset(
        str(item["id"]) for item in items
        if _contains(_key(haystack(item), normalize=False), literal_key)
    )
    normalized = frozenset(
        str(item["id"]) for item in items
        if _contains(_key(_identity(item)), query_key)
        or (not identity_only and _contains(_key(haystack(item), normalize=False), query_key))
    )
    if normalized:
        display_query = next((str(item["title"]) for item in items
                              if _key(item.get("title")) == query_key), query_key)
        interpretation = None if literal == normalized else {
            "originalQuery": original, "queries": [display_query], "kind": "normalized",
        }
        return TemperamentSearch(normalized, interpretation)
    if literal:
        return TemperamentSearch(literal)

    family_query = " ".join(token for token, _ in temperament_family_wording(tokens))
    if family_query != query_key:
        family = search_temperaments(family_query, items, identity_only=identity_only)
        if family.ids:
            return TemperamentSearch(family.ids, {
                "originalQuery": original, "queries": [family_query], "kind": "related",
            })

    # Match the longest catalogue-name fragments in the source. Keep known
    # parenthetical variants; a name appearing only inside a comment is not
    # a second proposed temperament.
    matches: dict[tuple[int, int], str] = {}
    source_words = [token for token, _ in tokens]
    for item in items:
        title = str(item.get("title") or "")
        title_words = [token for token, _ in temperament_wording_tokens(title)]
        if not title_words or not re.fullmatch(r"[a-z]{4,}", title_words[0]):
            continue
        if title_words[0] in _GENERIC_PREFIXES:
            continue
        display_words = re.findall(r"[^\W_]+", title, flags=re.UNICODE)
        for start, (_, depth) in enumerate(tokens):
            if depth:
                continue
            length = 0
            while (length < len(title_words) and start + length < len(tokens)
                   and source_words[start + length] == title_words[length]):
                length += 1
            if length:
                matches[(start, start + length)] = " ".join(display_words[:length])
    spans = [
        span for span in matches
        if not any(other != span and other[0] <= span[0] and other[1] >= span[1] for other in matches)
    ]
    queries = list(dict.fromkeys(matches[span] for span in sorted(spans)))
    keys = [_key(term) for term in queries]
    related = frozenset(
        str(item["id"]) for item in items
        if any(_contains(_key(_identity(item)), key) for key in keys)
    )
    return TemperamentSearch(related, {
        "originalQuery": original, "queries": queries, "kind": "related",
    } if related else None)
