"""Read-only pipework presentation contract.

This adapter exposes source assertions and validated Processor derivations.
Exact stop positions receive stable functional references on demand without
being misrepresented as observed physical-pipe continuants.
"""

from __future__ import annotations

import hashlib
import json
import math
import re
from collections.abc import Mapping
from fractions import Fraction
from typing import Any


QUANTITY_LABELS = {
    "asserted_physical_pipe_count": "Physical pipes (source total)",
    "derived_pipe_position_count": "Functional pipe positions",
    "resolved_pipe_continuant_count": "Individually resolved pipes",
    "pipe_manifestation_count": "Documented pipe states",
}
ALLOWED_METHODS = {
    "source_asserted_total",
    "direct_inventory_count",
    "source_itemized_sum",
    "deterministic_rank_compass_expansion",
    "bounded_estimate",
    "unknown",
}

SHARED_RANK_MARKERS = re.compile(
    r"\b(?:ext(?:ension|ended)?|transmission|borrowed|shared|duplex|unit|"
    r"auszug|vorabzug|wechs(?:el)?register)\b",
    re.IGNORECASE,
)
NON_PIPE_CONTROL_MARKERS = re.compile(
    r"\b(?:tremulant|tremolo|zimbelstern|crescendo|schweller|"
    r"expression|ventil|combination|setter|tambor|drum|pajaritos|"
    r"birdsong|nightingale)\b",
    re.IGNORECASE,
)
EXPLICIT_RANK_COUNT_MARKER = re.compile(
    r"\b(?P<lower>\d+)\s*(?:[-–]\s*(?P<upper>\d+)\s*)?"
    r"(?:ranks?|rangs?|rows?|fach)\b",
    re.IGNORECASE,
)

LEGACY_PIPE_POSITION_REFERENCE_CONTRACT = "modavis.functional-pipe-position/v1"
LEGACY_PIPE_POSITION_REFERENCE_PREFIX = "pipepos:v1:"
PIPE_POSITION_REFERENCE_CONTRACT = "modavis.functional-pipe-position/v2"
PIPE_POSITION_REFERENCE_PREFIX = "pipepos:v2:"
PIPE_POSITION_DETAIL_CONTRACT = "modavis.functional-pipe-position-detail/v1"
PIPE_POSITION_REVISION_CONTRACT = "modavis.pipe-position-specification-revision/v1"
NOMINAL_PITCH_CONTRACT = "modavis.nominal-stop-pitch/v1"
NOTE_NAMES = ("C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B")


def _first_mapping(*values: Any) -> Mapping[str, Any]:
    return next((value for value in values if isinstance(value, Mapping)), {})


def _integer(value: Any) -> int | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, int) and value >= 0:
        return value
    if isinstance(value, str):
        normalized = re.sub(r"[\s,.']", "", value)
        if normalized.isdigit():
            return int(normalized)
    return None


def _quantity(raw: Mapping[str, Any]) -> dict[str, Any] | None:
    kind = str(raw.get("quantityKind") or raw.get("quantity_kind") or "")
    method = str(raw.get("derivationMethod") or raw.get("derivation_method") or "")
    if kind not in QUANTITY_LABELS or method not in ALLOWED_METHODS:
        return None
    exact = _integer(
        raw.get("exactCount") if "exactCount" in raw else raw.get("exact_count")
    )
    lower = _integer(
        raw.get("lowerBound") if "lowerBound" in raw else raw.get("lower_bound")
    )
    upper = _integer(
        raw.get("upperBound") if "upperBound" in raw else raw.get("upper_bound")
    )
    if exact is None and lower is None and upper is None:
        return None
    return {
        "kind": kind,
        "label": QUANTITY_LABELS[kind],
        "exactCount": exact,
        "lowerBound": lower,
        "upperBound": upper,
        "stateQualifier": str(
            raw.get("stateQualifier")
            or raw.get("state_qualifier")
            or "Unspecified documented state"
        ),
        "method": method,
        "formula": raw.get("formula"),
        "inclusions": list(raw.get("inclusions") or []),
        "exclusions": list(raw.get("exclusions") or []),
        "assumptions": list(raw.get("assumptions") or []),
        "sources": [
            dict(item)
            for item in (raw.get("sources") or [])
            if isinstance(item, Mapping)
        ],
    }


def _source_summary(source: Mapping[str, Any] | None) -> dict[str, Any] | None:
    value = source or {}
    summary = {
        "id": value.get("id"),
        "title": value.get("title") or value.get("source"),
        "url": value.get("url"),
    }
    return summary if any(summary.values()) else None


def build_pipework_read_model(
    payload: Mapping[str, Any],
    source: Mapping[str, Any] | None = None,
) -> dict[str, Any] | None:
    spec = _first_mapping(
        payload.get("specifications"),
        payload.get("specification"),
        payload.get("organ_specification"),
    )
    derivation = _first_mapping(
        spec.get("pipe_inventory_derivation"),
        spec.get("pipeInventoryDerivation"),
        payload.get("pipe_inventory_derivation"),
        payload.get("pipeInventoryDerivation"),
    )
    if derivation and not (
        derivation.get("contractVersion") == "modavis.pipe-inventory-derivation/v1"
        and derivation.get("physicalIdentitiesMinted") == 0
        and derivation.get("identityMintingAllowed") is False
        and derivation.get("projectionAllowed") is False
    ):
        derivation = {}
    quantities = [
        normalized
        for item in derivation.get("quantities", [])
        if isinstance(item, Mapping)
        if (normalized := _quantity(item)) is not None
    ]
    source_summary = _source_summary(source)
    if source_summary:
        for quantity in quantities:
            quantity["sources"] = [source_summary]

    snapshot = (
        payload.get("source_snapshot")
        if isinstance(payload.get("source_snapshot"), Mapping)
        else {}
    )
    pipe_value = (
        spec.get("pipe_count") if "pipe_count" in spec else spec.get("pipeCount")
    )
    if pipe_value is None and not isinstance(spec.get("pipes"), (list, Mapping)):
        pipe_value = spec.get("pipes")
    asserted = _integer(pipe_value if pipe_value is not None else snapshot.get("pipes"))
    if asserted is not None and not any(
        item["kind"] == "asserted_physical_pipe_count" for item in quantities
    ):
        quantities.insert(
            0,
            {
                "kind": "asserted_physical_pipe_count",
                "label": QUANTITY_LABELS["asserted_physical_pipe_count"],
                "exactCount": asserted,
                "lowerBound": None,
                "upperBound": None,
                "stateQualifier": str(
                    spec.get("pipe_count_state")
                    or "Source-described organ configuration"
                ),
                "method": "source_asserted_total",
                "formula": None,
                "inclusions": [],
                "exclusions": [],
                "assumptions": [
                    "Source total preserved without creating individual pipe identities"
                ],
                "sources": [source_summary] if source_summary else [],
            },
        )

    raw_pipes = (
        spec.get("pipes") or spec.get("pipe_list") or spec.get("pipe_rows") or []
    )
    explicit_pipes = raw_pipes if isinstance(raw_pipes, list) else []
    resolved_ids = sorted(
        {
            str(item.get("mdvs_id") or item.get("mdvsId"))
            for item in explicit_pipes
            if isinstance(item, Mapping)
            and str(item.get("mdvs_id") or item.get("mdvsId") or "").startswith(
                "MDVS:PIPE:"
            )
        }
    )
    if resolved_ids and not any(
        item["kind"] == "resolved_pipe_continuant_count" for item in quantities
    ):
        quantities.append(
            {
                "kind": "resolved_pipe_continuant_count",
                "label": QUANTITY_LABELS["resolved_pipe_continuant_count"],
                "exactCount": len(resolved_ids),
                "lowerBound": None,
                "upperBound": None,
                "stateQualifier": "Current read model",
                "method": "direct_inventory_count",
                "formula": "count(unique MDVS:PIPE identifiers)",
                "inclusions": resolved_ids,
                "exclusions": [],
                "assumptions": [],
                "sources": [source_summary] if source_summary else [],
            }
        )

    if not quantities:
        return None
    position_candidates = [
        {
            "candidateKey": item.get("candidateKey"),
            "rankKey": item.get("physicalRankKey"),
            "actuationNote": item.get("actuationNote"),
            "soundingNote": item.get("soundingNote"),
            "ordinal": item.get("ordinal"),
            "isMdvsIdentifier": False,
        }
        for item in derivation.get("positionCandidates", [])[:12]
        if isinstance(item, Mapping) and item.get("isMdvsIdentifier") is False
    ]
    source_value = source or {}
    return {
        "status": "available",
        "contractVersion": "modavis.navigator-pipework/v1",
        "quantities": quantities,
        "positionCandidates": position_candidates,
        "positionCandidateCount": _integer(derivation.get("positionCandidateCount"))
        or len(position_candidates),
        "source": {
            "id": source_value.get("id"),
            "title": source_value.get("title") or source_value.get("source"),
            "url": source_value.get("url"),
            "inputSha256": derivation.get("inputSha256"),
            "derivationSha256": derivation.get("derivationSha256"),
            "algorithm": derivation.get("algorithm"),
        },
        "sources": [source_summary] if source_summary else [],
        "identityPolicy": {
            "resolvedPhysicalPipeCount": len(resolved_ids),
            "aggregateCountsCreateIdentities": False,
            "positionCandidatesAreIdentifiers": False,
            "bulkIdentityMintingAllowed": False,
        },
        "performanceMode": "aggregate-first; individual positions are paginated/on-demand",
        "projectionAllowed": False,
    }


def merge_pipework_read_models(
    *models: Mapping[str, Any] | None,
) -> dict[str, Any] | None:
    """Merge independently attributed read models without collapsing conflicts."""

    available = [
        model
        for model in models
        if isinstance(model, Mapping)
        and model.get("status") == "available"
        and model.get("projectionAllowed") is False
    ]
    if not available:
        return None
    quantities: list[dict[str, Any]] = []
    by_signature: dict[tuple[Any, ...], dict[str, Any]] = {}
    sources: list[dict[str, Any]] = []
    source_keys: set[tuple[Any, ...]] = set()
    positions: list[dict[str, Any]] = []
    position_keys: set[str] = set()
    for model in available:
        model_sources = [
            dict(item)
            for item in (model.get("sources") or [])
            if isinstance(item, Mapping)
        ]
        if not model_sources and isinstance(model.get("source"), Mapping):
            summary = _source_summary(model.get("source"))
            model_sources = [summary] if summary else []
        for item in model_sources:
            key = (item.get("id"), item.get("title"), item.get("url"))
            if key not in source_keys:
                source_keys.add(key)
                sources.append(item)
        for raw in model.get("quantities") or []:
            if not isinstance(raw, Mapping):
                continue
            item = dict(raw)
            signature = (
                item.get("kind"),
                item.get("exactCount"),
                item.get("lowerBound"),
                item.get("upperBound"),
                item.get("stateQualifier"),
                item.get("method"),
                item.get("formula"),
            )
            quantity_sources = [
                dict(source)
                for source in (item.get("sources") or model_sources)
                if isinstance(source, Mapping)
            ]
            if signature in by_signature:
                current = by_signature[signature]
                current_keys = {
                    (source.get("id"), source.get("title"), source.get("url"))
                    for source in current.get("sources") or []
                }
                current["sources"].extend(
                    source
                    for source in quantity_sources
                    if (source.get("id"), source.get("title"), source.get("url"))
                    not in current_keys
                )
                continue
            item["sources"] = quantity_sources
            by_signature[signature] = item
            quantities.append(item)
        for raw in model.get("positionCandidates") or []:
            if not isinstance(raw, Mapping):
                continue
            item = dict(raw)
            key = str(item.get("candidateKey") or item)
            if key not in position_keys:
                position_keys.add(key)
                positions.append(item)
    resolved = max(
        int((model.get("identityPolicy") or {}).get("resolvedPhysicalPipeCount") or 0)
        for model in available
    )
    return {
        "status": "available",
        "contractVersion": "modavis.navigator-pipework/v1",
        "quantities": quantities,
        "positionCandidates": positions[:12],
        "positionCandidateCount": max(
            int(model.get("positionCandidateCount") or 0) for model in available
        ),
        "source": sources[0] if sources else None,
        "sources": sources,
        "identityPolicy": {
            "resolvedPhysicalPipeCount": resolved,
            "aggregateCountsCreateIdentities": False,
            "positionCandidatesAreIdentifiers": False,
            "bulkIdentityMintingAllowed": False,
        },
        "performanceMode": "aggregate-first; individual positions are paginated/on-demand",
        "projectionAllowed": False,
    }


def _rank_bounds(value: Any) -> tuple[int, int] | None:
    """Return a conservative rank-count interval from a structured stop value."""

    if isinstance(value, bool) or value in (None, "", "false", "False"):
        return None
    if isinstance(value, int) and value > 0:
        return value, value
    match = re.fullmatch(r"\s*(\d+)\s*(?:[-–]\s*(\d+)\s*)?", str(value))
    if not match:
        return None
    lower = int(match.group(1))
    upper = int(match.group(2) or lower)
    return (lower, upper) if 0 < lower <= upper else None


def _explicit_rank_bounds(component: Mapping[str, Any]) -> tuple[int, int] | None:
    """Read an explicit rank count even when a source boolean is incorrect.

    Some transformed records preserve labels such as ``Mixture 4 ranks`` while
    carrying ``mixture: false``. The labelled count is still explicit source
    evidence; this helper never infers ranks merely from a mixture-like name.
    """

    detail = (
        component.get("detail") if isinstance(component.get("detail"), Mapping) else {}
    )
    structured = _rank_bounds(detail.get("mixture"))
    if structured is not None:
        return structured
    evidence = _stop_evidence_text(component)
    match = EXPLICIT_RANK_COUNT_MARKER.search(evidence)
    if not match:
        return None
    lower = int(match.group("lower"))
    upper = int(match.group("upper") or lower)
    return (lower, upper) if 0 < lower <= upper else None


def _stop_evidence_text(component: Mapping[str, Any]) -> str:
    detail = (
        component.get("detail") if isinstance(component.get("detail"), Mapping) else {}
    )
    values: list[str] = [str(component.get("label") or "")]
    for key in ("raw_str", "cleaned", "notes", "sharing_context"):
        value = detail.get(key)
        if isinstance(value, (list, tuple)):
            values.extend(str(item) for item in value)
        elif value is not None:
            values.append(str(value))
    comparison = component.get("sourceComparison")
    if isinstance(comparison, Mapping):
        for field in comparison.get("fields") or []:
            if not isinstance(field, Mapping):
                continue
            for assertion in field.get("assertions") or []:
                if isinstance(assertion, Mapping):
                    values.append(str(assertion.get("rawValue") or ""))
    return " ".join(values)


def _numeric_range(value: Any) -> tuple[int, int] | None:
    if not isinstance(value, (list, tuple)) or len(value) < 2:
        return None
    lower = _integer(value[0])
    upper = _integer(value[1])
    if lower is None or upper is None or lower > upper:
        return None
    return lower, upper


def _midi_note_label(value: int | None) -> str | None:
    if value is None or value < 0 or value > 127:
        return None
    return f"{NOTE_NAMES[value % 12]}{(value // 12) - 1}"


def _chromatic_note_label(value: int | None) -> str | None:
    if value is None:
        return None
    return f"{NOTE_NAMES[value % 12]}{(value // 12) - 1}"


def _positive_fraction(value: Any) -> Fraction | None:
    if isinstance(value, bool) or value is None:
        return None
    if isinstance(value, Mapping):
        numerator = value.get("numerator")
        denominator = value.get("denominator")
        if (
            isinstance(numerator, int)
            and not isinstance(numerator, bool)
            and isinstance(denominator, int)
            and not isinstance(denominator, bool)
            and denominator > 0
        ):
            result = Fraction(numerator, denominator)
            return result if 0 < result <= 256 else None
        return None
    text = (
        str(value)
        .strip()
        .replace("′", "")
        .replace("’", "")
        .replace("'", "")
        .replace(",", ".")
    )
    mixed = re.fullmatch(r"(\d+)\s+(\d+)/(\d+)", text)
    if mixed:
        denominator = int(mixed.group(3))
        if denominator == 0:
            return None
        result = Fraction(int(mixed.group(1)), 1) + Fraction(
            int(mixed.group(2)), denominator
        )
        return result if 0 < result <= 256 else None
    simple = re.fullmatch(r"(\d+)/(\d+)", text)
    if simple:
        denominator = int(simple.group(2))
        if denominator == 0:
            return None
        result = Fraction(int(simple.group(1)), denominator)
        return result if 0 < result <= 256 else None
    try:
        result = Fraction(text)
    except (ValueError, ZeroDivisionError):
        return None
    return result if 0 < result <= 256 else None


def _pitch_display(value: Fraction) -> str:
    whole, remainder = divmod(value.numerator, value.denominator)
    if not remainder:
        return str(whole)
    fraction = f"{remainder}/{value.denominator}"
    return f"{whole} {fraction}" if whole else fraction


def _component_has_pitch_conflict(component: Mapping[str, Any]) -> bool:
    comparison = component.get("sourceComparison")
    if not isinstance(comparison, Mapping):
        return False
    return any(
        isinstance(field, Mapping)
        and field.get("field") == "pitch"
        and field.get("status") == "conflicting"
        for field in (comparison.get("fields") or [])
    )


def _multiple_explicit_pitch_designations(detail: Mapping[str, Any]) -> bool:
    raw = str(detail.get("raw_str") or detail.get("cleaned") or "")
    matches = re.findall(
        r"(?:\d+\s+\d+/\d+|\d+/\d+|\d+(?:[.,]\d+)?)\s*(?:['′’]|ft\b|feet\b)",
        raw,
        re.IGNORECASE,
    )
    return len(matches) > 1


def derive_nominal_sounding_pitch(
    component: Mapping[str, Any],
    *,
    exact_rank_count: int,
) -> dict[str, Any] | None:
    """Return an explicitly assumed nominal interval for a safe stop case."""

    if exact_rank_count != 1 or _component_has_pitch_conflict(component):
        return None
    detail = (
        component.get("detail") if isinstance(component.get("detail"), Mapping) else {}
    )
    if _multiple_explicit_pitch_designations(detail):
        return None
    length_value = detail.get("length")
    length = _positive_fraction(length_value)
    fraction = _positive_fraction(detail.get("fractal"))
    if length is None:
        pitch_feet = fraction
    elif fraction is not None and "/" not in str(length_value):
        pitch_feet = length + fraction
    else:
        pitch_feet = length
    if pitch_feet is None:
        return None
    ratio = Fraction(8, 1) / pitch_feet
    exact_semitones = 12 * math.log2(float(ratio))
    nearest_semitone = round(exact_semitones)
    return {
        "contractVersion": NOMINAL_PITCH_CONTRACT,
        "status": "assumed_from_stop_designation",
        "pitchFeet": {
            "numerator": pitch_feet.numerator,
            "denominator": pitch_feet.denominator,
            "decimal": round(float(pitch_feet), 8),
            "display": _pitch_display(pitch_feet),
        },
        "frequencyRatioToEightFoot": {
            "numerator": ratio.numerator,
            "denominator": ratio.denominator,
            "decimal": round(float(ratio), 8),
        },
        "nearestSemitoneOffset": nearest_semitone,
        "centsFromNearestTwelveTetSemitone": round(
            (exact_semitones - nearest_semitone) * 100,
            4,
        ),
        "sourceBasis": "nominal_stop_pitch_designation",
        "frequencyAnalysisConfirmed": False,
        "physicalLengthMeasured": False,
        "assumption": (
            "Nominal sounding pitch is inferred from the stop's pitch designation "
            "relative to 8-foot unison; no frequency analysis confirms it."
        ),
    }


def _pipe_position_reference_id(
    identity_material: Mapping[str, Any],
    *,
    prefix: str = PIPE_POSITION_REFERENCE_PREFIX,
) -> str:
    encoded = json.dumps(
        identity_material,
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
    ).encode("utf-8")
    return f"{prefix}{hashlib.sha256(encoded).hexdigest()[:32]}"


def _pipe_position_specification_revision(
    organ_id: str,
    component: Mapping[str, Any],
    quantity: Mapping[str, Any],
    nominal_pitch_relation: Mapping[str, Any] | None,
) -> str:
    """Hash only the documented facts that define the functional position set."""

    detail = (
        component.get("detail") if isinstance(component.get("detail"), Mapping) else {}
    )
    source_rows = [
        {
            "id": item.get("id"),
            "source": item.get("source"),
            "sourcePath": item.get("sourcePath"),
            "inputSha256": item.get("inputSha256"),
        }
        for item in (component.get("sources") or [])
        if isinstance(item, Mapping)
    ]
    revision_material = {
        "contract": PIPE_POSITION_REVISION_CONTRACT,
        "organId": organ_id,
        "componentId": component.get("id"),
        "componentKind": component.get("kind"),
        "componentLabel": component.get("label"),
        "sourcePath": component.get("sourcePath"),
        "division": detail.get("division"),
        "pitchDesignation": {
            "length": detail.get("length"),
            "fraction": detail.get("fractal"),
            "mixture": detail.get("mixture"),
        },
        "positionSet": {
            "noteCount": quantity.get("noteCount"),
            "rankCountLower": quantity.get("rankCountLower"),
            "rankCountUpper": quantity.get("rankCountUpper"),
            "actuationRange": quantity.get("actuationRange"),
            "method": quantity.get("method"),
            "formula": quantity.get("formula"),
        },
        "nominalPitchRelation": dict(nominal_pitch_relation or {}),
        "sources": sorted(
            source_rows,
            key=lambda item: json.dumps(item, ensure_ascii=False, sort_keys=True),
        ),
    }
    encoded = json.dumps(
        revision_material,
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
    ).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def pipe_position_canonical_path(
    organ_id: str,
    component_id: str,
    reference_id: str,
) -> str:
    from urllib.parse import quote

    return (
        f"/organs/{quote(organ_id, safe='')}/components/{quote(component_id, safe='')}"
        f"/pipe-positions/{quote(reference_id, safe='')}"
    )


def build_register_pipe_position_page(
    organ_id: str,
    component_hierarchy: list[Mapping[str, Any]] | None,
    component_id: str,
    *,
    offset: int = 0,
    limit: int = 100,
    selected_reference_id: str | None = None,
) -> dict[str, Any] | None:
    """Create stable, paginated functional positions for one quantified stop.

    These references identify a derived position in the documented active
    specification.  They are deliberately not MDVS physical-pipe identifiers:
    a later replacement pipe may occupy the same position without changing the
    position reference.
    """

    component: Mapping[str, Any] | None = None
    for group in component_hierarchy or []:
        if not isinstance(group, Mapping) or group.get("id") != "stops":
            continue
        component = next(
            (
                item
                for item in (group.get("items") or [])
                if isinstance(item, Mapping)
                and str(item.get("id") or "") == component_id
            ),
            None,
        )
        if component is not None:
            break
    if component is None:
        return None
    quantity = component.get("pipeQuantity")
    if not isinstance(quantity, Mapping):
        return None
    note_count = _integer(quantity.get("noteCount"))
    rank_lower = _integer(quantity.get("rankCountLower"))
    rank_upper = _integer(quantity.get("rankCountUpper"))
    if (
        note_count is None
        or rank_lower is None
        or rank_upper is None
        or rank_lower != rank_upper
    ):
        return {
            "status": "unavailable",
            "reason": "exact_position_cardinality_not_established",
            "contractVersion": PIPE_POSITION_REFERENCE_CONTRACT,
            "organId": organ_id,
            "componentId": component_id,
            "items": [],
            "total": 0,
            "projectionAllowed": False,
        }

    total = note_count * rank_lower
    safe_offset = max(0, min(int(offset), total))
    safe_limit = max(1, min(int(limit), 200))
    actuation_range = _numeric_range(quantity.get("actuationRange"))
    actuation_start = actuation_range[0] if actuation_range is not None else None
    nominal_pitch_relation = quantity.get("nominalSoundingPitch")
    if not isinstance(nominal_pitch_relation, Mapping):
        nominal_pitch_relation = derive_nominal_sounding_pitch(
            component,
            exact_rank_count=rank_lower,
        )
    semitone_offset = (
        nominal_pitch_relation.get("nearestSemitoneOffset")
        if isinstance(nominal_pitch_relation, Mapping)
        else None
    )
    if not isinstance(semitone_offset, int) or isinstance(semitone_offset, bool):
        semitone_offset = None
    register_label = str(component.get("label") or "Register")
    division_label = str(quantity.get("divisionLabel") or "").strip() or None
    specification_revision_sha256 = _pipe_position_specification_revision(
        organ_id,
        component,
        quantity,
        nominal_pitch_relation if isinstance(nominal_pitch_relation, Mapping) else None,
    )
    state_qualifier = f"specification:{specification_revision_sha256}"

    def make_item(flat_ordinal: int) -> dict[str, Any]:
        note_ordinal = flat_ordinal // rank_lower + 1
        rank_ordinal = flat_ordinal % rank_lower + 1
        actuation_midi = (
            actuation_start + note_ordinal - 1 if actuation_start is not None else None
        )
        sounding_semitone = (
            actuation_midi + semitone_offset
            if actuation_midi is not None and semitone_offset is not None
            else None
        )
        sounding_midi = (
            sounding_semitone
            if sounding_semitone is not None and 0 <= sounding_semitone <= 127
            else None
        )
        legacy_identity_material = {
            "contract": LEGACY_PIPE_POSITION_REFERENCE_CONTRACT,
            "organId": organ_id,
            "componentId": component_id,
            "stateQualifier": "active_release_specification",
            "noteOrdinal": note_ordinal,
            "rankOrdinal": rank_ordinal,
        }
        identity_material = {
            "contract": PIPE_POSITION_REFERENCE_CONTRACT,
            "organId": organ_id,
            "componentId": component_id,
            "specificationRevisionSha256": specification_revision_sha256,
            "noteOrdinal": note_ordinal,
            "rankOrdinal": rank_ordinal,
        }
        reference_id = _pipe_position_reference_id(identity_material)
        legacy_reference_id = _pipe_position_reference_id(
            legacy_identity_material,
            prefix=LEGACY_PIPE_POSITION_REFERENCE_PREFIX,
        )
        position_label = f"{register_label} · {_midi_note_label(actuation_midi) or f'key {note_ordinal}'}"
        if rank_lower > 1:
            position_label += f" · rank {rank_ordinal}"
        return {
            "id": reference_id,
            "referenceAliases": [legacy_reference_id],
            "referenceKind": "derived_functional_pipe_position",
            "label": position_label,
            "organId": organ_id,
            "componentId": component_id,
            "registerLabel": register_label,
            "divisionLabel": division_label,
            "stateQualifier": state_qualifier,
            "specificationRevisionSha256": specification_revision_sha256,
            "noteOrdinal": note_ordinal,
            "rankOrdinal": rank_ordinal,
            "actuationMidi": actuation_midi,
            "actuationNote": _midi_note_label(actuation_midi),
            "soundingMidi": sounding_midi,
            "soundingSemitoneNumber": sounding_semitone,
            "soundingNote": _chromatic_note_label(sounding_semitone),
            "soundingPitchStatus": (
                "assumed_from_stop_designation"
                if sounding_semitone is not None
                else "not_established"
            ),
            "derivationMethod": "documented_compass_times_exact_rank_ordinal",
            "formula": str(quantity.get("formula") or ""),
            "evidenceStatus": "deterministically_derived",
            "physicalPipeIdentityEstablished": False,
            "projectionAllowed": False,
            "identityMaterial": identity_material,
            "canonicalPath": pipe_position_canonical_path(
                organ_id,
                component_id,
                reference_id,
            ),
        }

    items = [
        make_item(index)
        for index in range(safe_offset, min(total, safe_offset + safe_limit))
    ]
    selected = None
    if selected_reference_id:
        for index in range(total):
            candidate = make_item(index)
            if selected_reference_id in {
                candidate["id"],
                *candidate["referenceAliases"],
            }:
                selected = candidate
                break
    return {
        "status": "available",
        "contractVersion": PIPE_POSITION_REFERENCE_CONTRACT,
        "organId": organ_id,
        "componentId": component_id,
        "specificationRevisionSha256": specification_revision_sha256,
        "registerLabel": register_label,
        "divisionLabel": division_label,
        "offset": safe_offset,
        "limit": safe_limit,
        "total": total,
        "items": items,
        "selected": selected,
        "nominalPitchRelation": (
            dict(nominal_pitch_relation)
            if isinstance(nominal_pitch_relation, Mapping)
            else None
        ),
        "referencePolicy": {
            "referencesAreStable": True,
            "canonicalReferencesAreRevisionBound": True,
            "legacyV1ReferencesResolveToCanonicalV2": True,
            "referencesIdentifyFunctionalPositions": True,
            "referencesIdentifyObservedPhysicalPipes": False,
            "publicationLinksMayTargetReference": True,
            "physicalReplacementDoesNotChangePositionReference": True,
        },
        "projectionAllowed": False,
    }


def build_pipe_position_detail_record(
    page: Mapping[str, Any],
    *,
    organ: Mapping[str, Any] | None = None,
    persisted_context: Mapping[str, Any] | None = None,
) -> dict[str, Any] | None:
    """Build the sparse, record-like view for one exact functional position."""

    selected = page.get("selected")
    if not isinstance(selected, Mapping):
        return None
    context = persisted_context if isinstance(persisted_context, Mapping) else {}
    persisted = (
        context.get("position")
        if isinstance(context.get("position"), Mapping)
        else None
    )
    organ_value = organ if isinstance(organ, Mapping) else {}
    return {
        "status": "available",
        "contractVersion": PIPE_POSITION_DETAIL_CONTRACT,
        "position": dict(selected),
        "organ": {
            "id": organ_value.get("id") or page.get("organId"),
            "mdvsId": organ_value.get("mdvsId"),
            "title": organ_value.get("title") or page.get("organId"),
            "pageUrl": organ_value.get("pageUrl")
            or (f"/organs?organ={page.get('organId')}&tab=specification"),
        },
        "register": {
            "componentId": page.get("componentId"),
            "label": page.get("registerLabel"),
            "divisionLabel": page.get("divisionLabel"),
            "positionCount": page.get("total"),
        },
        "specificationRevisionSha256": page.get("specificationRevisionSha256"),
        "nominalPitchRelation": page.get("nominalPitchRelation"),
        "persistence": {
            "status": "persisted_with_evidence" if persisted else "virtual",
            "entity": dict(persisted) if persisted else None,
            "policy": "persist only when a position acquires evidence or relations",
        },
        "measurements": [
            dict(item)
            for item in (context.get("measurements") or [])
            if isinstance(item, Mapping)
        ],
        "occupancies": [
            dict(item)
            for item in (context.get("occupancies") or [])
            if isinstance(item, Mapping)
        ],
        "relatedResources": [
            dict(item)
            for item in (context.get("relatedResources") or [])
            if isinstance(item, Mapping)
        ],
        "displayPolicy": {
            "hideEmptyEvidenceSections": True,
            "nominalPitchIsMeasurement": False,
            "frequencyAnalysisMayConfirmNominalPitch": True,
            "physicalPipeIdentityRequiresItemEvidence": True,
        },
        "canonicalPath": selected.get("canonicalPath"),
        "projectionAllowed": False,
    }


def apply_register_pipe_quantities(
    pipework: Mapping[str, Any] | None,
    component_hierarchy: list[Mapping[str, Any]] | None,
) -> tuple[dict[str, Any] | None, list[dict[str, Any]]]:
    """Attach transparent register-level nominal counts to the read model.

    The calculation uses the documented division compass and explicit rank
    count.  It never turns a stop control into a physical-rank identity and it
    declines a physical estimate for transmissions, extensions, and other
    shared-rank signals.
    """

    hierarchy = [
        dict(group)
        for group in (component_hierarchy or [])
        if isinstance(group, Mapping)
    ]
    division_compasses: dict[str, tuple[int, int]] = {}
    division_note_counts: dict[str, int] = {}
    division_compass_labels: dict[str, str] = {}
    for group in hierarchy:
        if group.get("id") not in {"divisions", "keyboards"}:
            continue
        for item in group.get("items") or []:
            if not isinstance(item, Mapping):
                continue
            detail = (
                item.get("detail") if isinstance(item.get("detail"), Mapping) else {}
            )
            compass = _numeric_range(detail.get("range"))
            label = str(item.get("label") or "").strip().casefold()
            observed_note_count = _integer(detail.get("observed_note_count"))
            if (
                label
                and compass
                and (group.get("id") == "divisions" or label not in division_compasses)
            ):
                division_compasses[label] = compass
            if (
                label
                and observed_note_count is not None
                and (
                    group.get("id") == "divisions" or label not in division_note_counts
                )
            ):
                division_note_counts[label] = observed_note_count
                if detail.get("observed_compass"):
                    division_compass_labels[label] = str(detail["observed_compass"])

    register_quantities: list[dict[str, Any]] = []
    updated_hierarchy: list[dict[str, Any]] = []
    for group in hierarchy:
        current_group = dict(group)
        current_items: list[dict[str, Any]] = []
        for raw_component in group.get("items") or []:
            if not isinstance(raw_component, Mapping):
                continue
            component = dict(raw_component)
            if group.get("id") != "stops":
                current_items.append(component)
                continue
            detail = (
                component.get("detail")
                if isinstance(component.get("detail"), Mapping)
                else {}
            )
            if (detail.get("quantityQualification") or {}).get("derivationAllowed") is False:
                component.pop("pipeQuantity", None)
                current_items.append(component)
                continue
            evidence_text = _stop_evidence_text(component)
            division = str(
                detail.get("division") or detail.get("werk") or detail.get("work") or ""
            ).strip()
            compass = division_compasses.get(division.casefold())
            note_count = (
                compass[1] - compass[0] + 1
                if compass
                else division_note_counts.get(division.casefold())
            )
            if note_count is None:
                notes = (
                    detail.get("note_count")
                    if detail.get("note_count") is not None
                    else detail.get("notes")
                )
                note_count = (
                    _integer(notes)
                    if not isinstance(notes, (list, tuple, Mapping))
                    else None
                )
            rank_bounds = _explicit_rank_bounds(component)
            rank_count_is_explicit = rank_bounds is not None
            if rank_bounds is None and (
                detail.get("length") is not None
                or detail.get("range_mapped") is not None
            ):
                rank_bounds = (1, 1)
                rank_count_is_explicit = True
            elif rank_bounds is None and detail.get("observed_pitch") is not None:
                rank_bounds = (1, 1)
            non_pipe_control = bool(NON_PIPE_CONTROL_MARKERS.search(evidence_text))
            shared_rank = bool(SHARED_RANK_MARKERS.search(evidence_text))
            source_pipe_count = _integer(
                detail.get("pipe_count")
                if detail.get("pipe_count") is not None
                else detail.get("pipeCount")
            )
            if non_pipe_control or (note_count is None and source_pipe_count is None):
                current_items.append(component)
                continue
            if note_count is not None and rank_bounds is None:
                current_items.append(component)
                continue
            lower = (
                note_count * rank_bounds[0]
                if note_count is not None and rank_bounds
                else None
            )
            upper = (
                note_count * rank_bounds[1]
                if note_count is not None and rank_bounds
                else None
            )
            nominal_pitch_relation = (
                derive_nominal_sounding_pitch(
                    component,
                    exact_rank_count=rank_bounds[0],
                )
                if rank_bounds and rank_bounds[0] == rank_bounds[1]
                else None
            )
            source_asserted = source_pipe_count is not None
            quantity = {
                "componentId": component.get("id"),
                "registerLabel": component.get("label"),
                "divisionLabel": division or None,
                "noteCount": note_count,
                "actuationRange": list(compass) if compass else None,
                "documentedCompass": division_compass_labels.get(division.casefold()),
                "rankCountLower": rank_bounds[0] if rank_bounds else None,
                "rankCountUpper": rank_bounds[1] if rank_bounds else None,
                "functionalPositionLower": lower,
                "functionalPositionUpper": upper,
                "nominalPhysicalPipeLower": source_pipe_count
                if source_asserted
                else None
                if shared_rank or not rank_count_is_explicit
                else lower,
                "nominalPhysicalPipeUpper": source_pipe_count
                if source_asserted
                else None
                if shared_rank or not rank_count_is_explicit
                else upper,
                "countState": (
                    "source_asserted_register_pipe_count"
                    if source_asserted
                    else "shared_or_extended_rank"
                    if shared_rank
                    else "nominal_register_estimate"
                    if rank_count_is_explicit
                    else "functional_positions_only"
                ),
                "method": (
                    "source_asserted_stop_pipe_count_with_documented_compass"
                    if source_asserted and note_count is not None
                    else "source_asserted_stop_pipe_count"
                    if source_asserted
                    else "division_compass_times_explicit_rank_count"
                    if rank_count_is_explicit
                    else "documented_division_compass_times_single_stop_actuation"
                ),
                "formula": (
                    f"{source_pipe_count} physical pipes asserted by the source"
                    + (
                        f"; {note_count} documented notes × "
                        + (
                            str(rank_bounds[0])
                            if rank_bounds and rank_bounds[0] == rank_bounds[1]
                            else f"{rank_bounds[0]}–{rank_bounds[1]}"
                        )
                        + (" rank" if rank_bounds and rank_bounds[1] == 1 else " ranks")
                        if note_count is not None and rank_bounds
                        else ""
                    )
                    if source_asserted
                    else f"{note_count} documented notes × "
                    + (
                        str(rank_bounds[0])
                        if rank_bounds[0] == rank_bounds[1]
                        else f"{rank_bounds[0]}–{rank_bounds[1]}"
                    )
                    + (" rank" if rank_bounds[1] == 1 else " ranks")
                ),
                "physicalRankIdentityEstablished": False,
                "additiveToOrganTotal": False,
                "projectionAllowed": False,
                "functionalPositionReferencesAvailable": bool(
                    note_count is not None
                    and rank_bounds
                    and rank_bounds[0] == rank_bounds[1]
                ),
                "functionalPositionReferenceContract": PIPE_POSITION_REFERENCE_CONTRACT,
                "nominalSoundingPitch": nominal_pitch_relation,
                "explanation": (
                    "The source explicitly states this stop's physical pipe count. Functional position references remain unavailable because no exact keyboard compass is documented."
                    if source_asserted and note_count is None
                    else "The source explicitly states this stop's physical pipe count; functional positions independently follow the documented compass."
                    if source_asserted
                    else "This register is marked as shared, transmitted, or extended; its playing positions do not establish a separate physical-pipe total."
                    if shared_rank
                    else "Functional positions derive from the source-documented division compass and this stop control. No physical-rank or physical-pipe count is asserted."
                    if not rank_count_is_explicit
                    else "Nominal speaking-pipe estimate from the documented division compass and rank count; sharing, borrowing, and historical state may change the physical total."
                ),
            }
            component["pipeQuantity"] = quantity
            register_quantities.append(quantity)
            current_items.append(component)
        current_group["items"] = current_items
        updated_hierarchy.append(current_group)

    if not register_quantities and pipework is None:
        return None, updated_hierarchy
    model = dict(
        pipework
        or {
            "status": "available",
            "quantities": [],
            "positionCandidates": [],
            "positionCandidateCount": 0,
            "sources": [],
            "identityPolicy": {
                "resolvedPhysicalPipeCount": 0,
                "aggregateCountsCreateIdentities": False,
                "positionCandidatesAreIdentifiers": False,
                "bulkIdentityMintingAllowed": False,
            },
            "performanceMode": "aggregate-first; individual positions are paginated/on-demand",
            "projectionAllowed": False,
        }
    )
    model["contractVersion"] = "modavis.navigator-pipework/v2"
    model["registerQuantities"] = register_quantities
    model["registerQuantitySummary"] = {
        "registerCount": sum(
            len(group.get("items") or [])
            for group in updated_hierarchy
            if group.get("id") == "stops"
        ),
        "quantifiedRegisterCount": len(register_quantities),
        "nominalEstimateCount": sum(
            item["countState"] == "nominal_register_estimate"
            for item in register_quantities
        ),
        "sourceAssertedCount": sum(
            item["countState"] == "source_asserted_register_pipe_count"
            for item in register_quantities
        ),
        "sharedOrExtendedCount": sum(
            item["countState"] == "shared_or_extended_rank"
            for item in register_quantities
        ),
        "referenceablePositionCount": sum(
            item["functionalPositionUpper"] or 0
            for item in register_quantities
            if item["functionalPositionReferencesAvailable"]
        ),
        "nominalPitchAssumptionRegisterCount": sum(
            1 for item in register_quantities if item.get("nominalSoundingPitch")
        ),
        "nonAdditive": True,
    }
    return model, updated_hierarchy
