"""Deterministic complete-organ records and release-wide RDF shards."""

from __future__ import annotations

from collections import defaultdict
from collections.abc import Iterable, Mapping, Sequence
from concurrent.futures import ProcessPoolExecutor, as_completed
from datetime import datetime, timezone
import gzip
import hashlib
import json
import math
import os
from pathlib import Path
import re
import shutil
import sqlite3
from typing import Any

from rdflib import BNode, Graph

from .entity_exports import exact_nt_lines, profile_graphs
from .uri_policy import UriPolicy


CONTRACT = "modavis.complete-release-lod/v1"
SHARD_CONTRACT = "modavis.complete-release-lod-shard/v1"
STATE_CONTRACT = "modavis.complete-release-lod-build-state/v1"
PROFILES = {
    "modavis": {
        "label": "MODAVIS Ontology Network",
        "profileUri": "https://w3id.org/modavis/ontology/0.1.0/",
    },
    "cidoc": {
        "label": "CIDOC CRM 7.1.3",
        "profileUri": "https://cidoc-crm.org/get-last-official-release",
    },
    "pon": {
        "label": "Polifonia Ontology Network Organs 1.0",
        "profileUri": "https://w3id.org/polifonia/ontology/organs/1.0/",
    },
    "edm": {
        "label": "Europeana Data Model",
        "profileUri": "https://pro.europeana.eu/page/edm-documentation",
    },
}
COVERAGE_KEYS = (
    "sourceRecords",
    "builderAssertions",
    "placeAssertions",
    "coordinateAssertions",
    "specificationDescriptions",
    "descriptionComponents",
    "specificationComponents",
    "technicalFacts",
    "materialConflicts",
    "events",
    "eventParticipants",
    "eventPlaces",
    "mediaReferences",
    "virtualInstrumentRelations",
)


def canonical_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(8 * 1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def write_json(path: Path, value: Any) -> None:
    temporary = path.with_name(f".{path.name}.tmp-{os.getpid()}")
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n")
    os.replace(temporary, path)


def write_text(path: Path, value: str) -> None:
    temporary = path.with_name(f".{path.name}.tmp-{os.getpid()}")
    temporary.write_text(value, encoding="utf-8", newline="\n")
    os.replace(temporary, path)


def remove_appledouble(root: Path) -> None:
    for path in root.iterdir():
        if path.is_file() and path.name.startswith("._"):
            path.unlink()


def parsed(value: Any, fallback: Any) -> Any:
    if isinstance(value, (dict, list)):
        return value
    try:
        return json.loads(value) if value else fallback
    except (TypeError, ValueError):
        return fallback


def _source(row: Mapping[str, Any]) -> dict[str, Any]:
    return {
        "id": row["source_record_id"],
        "source": row.get("source_key"),
        "url": row.get("source_url"),
    }


def _year_values(value: Any) -> list[int]:
    years: list[int] = []
    for item in parsed(value, []):
        if not isinstance(item, Mapping):
            continue
        for key in ("startYear", "endYear"):
            try:
                year = int(item.get(key))
            except (TypeError, ValueError):
                continue
            if year not in years:
                years.append(year)
    return years


def _date_expression(value: Any) -> str | None:
    expressions = []
    for item in parsed(value, []):
        if not isinstance(item, Mapping):
            continue
        expression = item.get("expression")
        if expression and str(expression) not in expressions:
            expressions.append(str(expression))
    return ", ".join(expressions) or None


def _component_item(row: Mapping[str, Any]) -> dict[str, Any]:
    detail = parsed(row.get("detail_json"), {})
    detail = dict(detail) if isinstance(detail, Mapping) else {}
    if row.get("division_label") and not detail.get("division"):
        detail["division"] = row["division_label"]
    if row.get("pitch_label") and not detail.get("pitch"):
        detail["pitch"] = row["pitch_label"]
    source = _source(row)
    return {
        "id": row["component_id"],
        "kind": row["component_type"],
        "label": row["label"],
        "wording": detail.get("raw_str") or row["label"],
        "pitch": row.get("pitch_label"),
        "detail": detail,
        "sourcePath": row.get("source_path"),
        "sourcePaths": [row["source_path"]] if row.get("source_path") else [],
        "source": source,
        "sources": [source],
    }


def _hierarchy(rows: Sequence[Mapping[str, Any]]) -> list[dict[str, Any]]:
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        grouped[str(row["component_type"])].append(_component_item(row))
    return [
        {
            "id": kind,
            "label": kind.replace("_", " ").title(),
            "count": len(items),
            "items": items,
        }
        for kind, items in sorted(grouped.items())
    ]


def _description_groups(rows: Sequence[Mapping[str, Any]]) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    groups: dict[tuple[int, str], dict[str, Any]] = {}
    other: list[dict[str, Any]] = []
    for row in rows:
        if row.get("description_component"):
            position = int(row.get("division_position") or 0)
            label = str(row.get("division_label") or "Unspecified division")
            key = (position, label)
            group = groups.setdefault(
                key,
                {"label": label, "compass": row.get("division_compass"), "entries": []},
            )
            detail = parsed(row.get("detail_json"), {})
            group["entries"].append({
                "id": row["component_id"],
                "kind": row["component_type"],
                "label": row["label"],
                "pitch": row.get("pitch_label"),
                "wording": row.get("source_wording") or row["label"],
                "sourcePaths": parsed(row.get("source_paths_json"), []),
                "dates": detail.get("dates", []) if isinstance(detail, Mapping) else [],
                "detail": detail,
            })
            continue
        item = _component_item(row)
        if row["component_type"] not in {"stop", "coupler", "accessory"}:
            other.append(item)
            continue
        pitch = row.get("pitch_label")
        label = str(row["label"])
        if pitch and row.get("source_key") == "orgbase":
            label = re.sub(
                r"\s+" + re.escape(str(pitch)) + r"\s*['′]?\s*[-–—]?\s*$",
                "",
                label,
            )
        detail = parsed(row.get("detail_json"), {})
        mixture = detail.get("mixture") if isinstance(detail, Mapping) else None
        if (
            mixture
            and str(mixture).lower() not in {"true", "false"}
            and not re.search(r"\b(?:[IVX]+|fach|ranks|sterk)\b", label)
        ):
            label += " · " + str(mixture) + " ranks"
        item.update(
            label=label,
            wording=detail.get("raw_str") or str(row["label"]),
        )
        label = str(row.get("division_label") or "Unspecified division")
        group = groups.setdefault((0, label), {"label": label, "compass": None, "entries": []})
        group["entries"].append(item)
    return [groups[key] for key in sorted(groups)], other


class PublicCoreOrganReader:
    """Read every public organ assertion from an immutable release SQLite file."""

    def __init__(self, core: Path):
        uri = core.resolve().as_uri() + "?mode=ro&immutable=1"
        self.connection = sqlite3.connect(uri, uri=True)
        self.connection.row_factory = sqlite3.Row
        self.connection.execute("pragma query_only=on")
        self.canonical_actor_ids = {
            str(row[0]) for row in self.connection.execute("select mdvs_id from actor")
        }

    def _activity_code(self, code):
        if not code or not str(code).startswith("MDVS:VOCB:"):
            return code if str(code or "").startswith("activitype:") else None
        if not hasattr(self, "_activity_codes"):
            self._activity_codes = {}
        if code not in self._activity_codes:
            rows = self._rows("select concept_code from vocabulary_concept where mdvs_id=? and scheme_code='modavis_activity_types'", (code,))
            self._activity_codes[code] = rows[0]["concept_code"] if rows else None
        return self._activity_codes[code]

    def close(self) -> None:
        self.connection.close()

    def _rows(self, sql: str, values: Sequence[Any]) -> list[dict[str, Any]]:
        return [dict(row) for row in self.connection.execute(sql, values)]

    def _is_canonical_actor(self, identifier: str) -> bool:
        return identifier in self.canonical_actor_ids

    def record(self, organ_id: str) -> tuple[dict[str, Any], dict[str, int]]:
        organ_rows = self._rows("select * from organ where mdvs_id=?", (organ_id,))
        organ_row = organ_rows[0] if organ_rows else None
        if organ_row is None:
            raise RuntimeError(f"organ disappeared from immutable core: {organ_id}")
        organ = dict(organ_row)
        sources = self._rows(
            "select * from source_membership where organ_mdvs_id=? order by source_key,source_record_id",
            (organ_id,),
        )
        source_index = {row["source_record_id"]: _source(row) for row in sources}
        coordinate_rows = self._rows(
            """select * from coordinate_assertion where organ_mdvs_id=? order by
               case marker_layer when 'current_exact' then 0 when 'current_fallback' then 1
                    when 'historical' then 2 else 3 end,source_organ_mdvs_id""",
            (organ_id,),
        )
        from .coordinate_evidence import interpretations
        coordinate_evidence = interpretations(self._rows, "organ", [r["source_organ_mdvs_id"] for r in coordinate_rows])
        place_rows = self._rows(
            """select * from place_assertion where organ_mdvs_id=? order by
               case when temporal_scope='current' then 0 else 1 end,assertion_id""",
            (organ_id,),
        )
        builders = self._rows(
            """select b.*,a.label,a.actor_type as canonical_actor_type from organ_builder_assertion b
               left join actor a on a.mdvs_id=b.actor_mdvs_id
               where b.organ_mdvs_id=? order by b.assertion_id""",
            (organ_id,),
        )
        from .actor_link_evidence import read_evidence
        builder_evidence = read_evidence(self._rows, builders)
        components = self._rows(
            """select * from specification_component where organ_mdvs_id=?
               and label_disclosure_state not like 'excluded_%'
               order by component_type,coalesce(division_label,''),source_record_id,source_path,component_id""",
            (organ_id,),
        )
        facts = self._rows(
            "select * from technical_fact where organ_mdvs_id=? order by family,label,fact_id",
            (organ_id,),
        )
        fact_evidence = {}
        if self._rows("select value from metadata where key=?", ("specification_summary_evidence_contract",)) == [{"value": "modavis.specification-summary-evidence/v1"}]:
            fact_evidence = {r["fact_id"]: json.loads(r["evidence_json"]) for r in self._rows(
                "select e.* from technical_fact_evidence e join technical_fact f using(fact_id) where f.organ_mdvs_id=?", (organ_id,))}
        descriptions = self._rows(
            """select * from specification_description where organ_mdvs_id=? order by
               case when description_kind='main' then 0 else 1 end,
               coalesce(sort_year,9999),description_id""",
            (organ_id,),
        )
        description_components = self._rows(
            """select c.*,1 as description_component from specification_description_component c
               join specification_description d on d.description_id=c.description_id
               where d.organ_mdvs_id=? order by c.description_id,c.division_position,c.position,c.component_id""",
            (organ_id,),
        )
        description_components_by_id: dict[str, list[dict[str, Any]]] = defaultdict(list)
        for row in description_components:
            description_components_by_id[row["description_id"]].append(row)
        components_by_source: dict[str, list[dict[str, Any]]] = defaultdict(list)
        for row in components:
            components_by_source[row["source_record_id"]].append(row)

        history = self._rows("select value from metadata where key=?", ("history_configuration_evidence_contract",)) == [{"value":"modavis.history-configuration-evidence/v1"}]
        chronology = {r["description_id"]:parsed(r["evidence_json"], {}) for r in self._rows("select c.* from configuration_evidence c join specification_description d using(description_id) where d.organ_mdvs_id=?", (organ_id,))} if history else {}
        representations = defaultdict(list)
        if history:
            for r in self._rows("select r.* from documented_event_representation r join documented_event e using(event_id) where e.organ_mdvs_id=? order by representation_id", (organ_id,)):
                representations[r["event_id"]].append(parsed(r["evidence_json"], {}))
        description_details: list[dict[str, Any]] = []
        for row in descriptions:
            source = source_index.get(row["source_record_id"], {
                "id": row["source_record_id"], "source": None, "url": None,
            })
            detail_rows = (
                components_by_source.get(row["source_record_id"], [])
                if row["description_kind"] == "main"
                else description_components_by_id.get(row["description_id"], [])
            )
            groups, other = _description_groups(detail_rows)
            description_details.append({
                "id": row["description_id"],
                "kind": row["description_kind"],
                "periodLabel": row["period_label"],
                "sourceHeading": row["source_heading"],
                "timeKind": row["time_kind"],
                "chronology": chronology.get(row["description_id"]),
                "timeRelation": row["time_relation"],
                "sortYear": row.get("sort_year"),
                "stateId": row.get("state_ref"),
                "sourcePaths": parsed(row.get("source_paths_json"), []),
                "source": source,
                "groups": groups,
                "otherComponents": other,
            })

        events = self._rows(
            """select e.*,c.participants_json,c.places_json from documented_event e
               left join documented_event_context c on c.event_id=e.event_id
               where e.organ_mdvs_id=? order by e.event_id""",
            (organ_id,),
        )
        interpretations = {}
        if self._rows("select value from metadata where key=?", ("event_interpretation_contract",)) == [{"value": "modavis.source-event-interpretation/v1"}]:
            interpretations = {r["event_id"]: r for r in self._rows(
                "select i.* from documented_event_interpretation i join documented_event e using(event_id) where e.organ_mdvs_id=?", (organ_id,))}
        from .public_relocations import load, movement_context
        movements = {}
        for item in load(self._rows, organ_id=organ_id):
            movements.setdefault(item["eventMdvsId"], []).append(item)
        event_items = []
        participant_count = 0
        event_place_count = 0
        for row in events:
            participants = parsed(row.get("participants_json"), [])
            places = parsed(row.get("places_json"), [])
            participant_count += len(participants)
            event_place_count += len(places)
            years = _year_values(row.get("date_values_json"))
            expression = _date_expression(row.get("date_values_json"))
            date_values = parsed(row.get("date_values_json"), [])
            start_date = next((d.get("startDate") for d in date_values if isinstance(d, dict) and d.get("startDate")), None)
            end_date = next((d.get("endDate") for d in reversed(date_values) if isinstance(d, dict) and d.get("endDate")), None)
            event_type = row.get("controlled_event_type") or row.get("source_event_type") or "documented_event"
            event_items.append({
                "id": row["event_id"],
                "title": str(event_type).replace("_", " ").title(),
                "label": str(event_type).replace("_", " ").title(),
                "eventType": event_type,
                "movement": movement_context(movements.get(row["event_id"], [])),
                "retainedRepresentations": representations.get(row["event_id"], []),
                "dateValues": parsed(row.get("date_values_json"), []),
                "type": {
                    "code": row.get("concept_code") or event_type,
                    "canonicalCode": self._activity_code(row.get("concept_code")),
                    "displayName": str(event_type).replace("_", " ").title(),
                },
                "when": {
                    "rawExpression": expression,
                    "start": start_date or (str(min(years)) if years else None),
                    "end": end_date or (str(max(years)) if years else None),
                },
                "description": interpretations.get(row["event_id"], {}).get("narrative"),
                "technicalFacts": parsed(interpretations.get(row["event_id"], {}).get("technical_facts_json"), []),
                "unresolvedAttributions": parsed(interpretations.get(row["event_id"], {}).get("unresolved_json"), []),
                "participants": [
                    {
                        **item,
                        "sourceActorMdvsId": item.get("targetId"),
                        "mdvsId": (
                            item.get("targetId")
                            if self._is_canonical_actor(item.get("targetId"))
                            else None
                        ),
                        "name": item.get("preferredLabel") or item.get("wording"),
                        "label": item.get("preferredLabel") or item.get("wording"),
                    }
                    for item in participants if isinstance(item, Mapping)
                ],
                "places": places,
                "source": source_index.get(row["source_record_id"], _source(row)),
            })

        media_rows = self._rows(
            """select * from public_media_reference where organ_mdvs_id=? order by
               case media_kind when 'image' then 0 when 'video' then 1 when 'audio' then 2 else 3 end,
               source_key,media_index,media_id""",
            (organ_id,),
        )
        media = [{
            "id": row["media_id"],
            "title": row.get("title"),
            "kind": row["media_kind"],
            "url": row.get("media_url"),
            "status": row["availability_state"],
            "sourceRecordId": row["source_record_id"],
            "source": row["source_key"],
            "sourceUrl": row.get("source_url"),
            "sourceCredit": row.get("source_credit"),
            "copyrightNotice": row.get("copyright_notice"),
            "filename": row.get("filename"),
        } for row in media_rows]
        vmis = self._rows(
            """select v.mdvs_id,v.canonical_uri,v.canonical_title,r.confidence,r.resolution_state
               from organ_virtual_instrument r join virtual_instrument v on v.mdvs_id=r.vmi_mdvs_id
               where r.organ_mdvs_id=? order by v.canonical_title,v.mdvs_id""",
            (organ_id,),
        )
        related_builders = []
        seen_builders: set[str] = set()
        for row in builders:
            key = str(row.get("actor_mdvs_id") or row.get("actor_route_id") or row["assertion_id"])
            if key in seen_builders:
                continue
            seen_builders.add(key)
            actor_type = row.get("canonical_actor_type") or row.get("actor_type") or "Actor"
            related_builders.append({
                "mdvsId": row.get("actor_mdvs_id"),
                "label": row.get("label") or row.get("preferred_label") or row.get("source_label"),
                "kind": actor_type,
                "relationship": row.get("relation_role") or "Builder",
                "pageUrl": (
                    f"/{'organizations' if actor_type == 'organization' else 'people'}/"
                    + str(row["actor_mdvs_id"]).rsplit(":", 1)[-1]
                    if row.get("actor_mdvs_id") else None
                ),
            })
        coordinate = coordinate_rows[0] if coordinate_rows else {}
        place = place_rows[0] if place_rows else {}
        technical_facts = [{
            "id": row["fact_id"],
            "family": row["family"],
            "label": row["label"],
            "displayValue": row.get("display_value"),
            "normalizedNumber": row.get("normalized_number"),
            "conflictState": row["conflict_state"],
            "sourceRecordId": row["source_record_id"],
            "source": source_index.get(row["source_record_id"], {}).get("source"),
            "sourceUrl": row.get("source_url"),
            "sourcePath": row.get("source_path"),
            "sourceWording": "\n".join(e["wording"] for e in fact_evidence.get(row["fact_id"], {}).get("evidence", [])) or row.get("display_value"),
            "summaryEvidence": fact_evidence.get(row["fact_id"]),
            "evidenceSha256": row.get("evidence_sha256"),
        } for row in facts]
        from .public_capture_comparison import restored_capture_comparison
        for item, row in zip(technical_facts, facts):
            comparison = restored_capture_comparison(row, components)
            if comparison:
                item["captureComparison"] = comparison
                item["capturedComponentCount"] = comparison["capturedRows"]
                if comparison["disagrees"]:item["conflictState"] = "material_technical_disagreement"
        from .public_aggregate_quality import qualify_public_fact
        technical_facts = [qualify_public_fact(f) for f in technical_facts]
        record = {
            "id": organ_id,
            "mdvsId": organ_id,
            "canonicalUri": organ["canonical_uri"],
            "canonicalUrl": "/organs/" + organ_id.rsplit(":", 1)[-1],
            "title": organ["label"],
            "label": organ["label"],
            "identifiers": [{"scheme": "MODAVIS", "value": organ_id, "url": organ["canonical_uri"]}],
            "sources": list(source_index.values()),
            "relatedEntities": related_builders,
            "builderAssertions": [{
                "id": row["assertion_id"],
                "mdvsId": row.get("actor_mdvs_id"),
                "label": row.get("label") or row.get("preferred_label") or row.get("source_label"),
                "sourceRecordId": row["source_record_id"],
                "sourceWording": row.get("source_label"),
                "sourcePath": "builders",
                "resolutionState": row.get("resolution_state"),
                "relationRole": row.get("relation_role"),
                "identityEvidence": builder_evidence.get(row["assertion_id"]),
            } for row in builders],
            "builder": related_builders[0]["label"] if related_builders else None,
            "builderMdvsId": related_builders[0].get("mdvsId") if related_builders else None,
            "builderUrl": related_builders[0].get("pageUrl") if related_builders else None,
            "location": place.get("preferred_label"),
            "placeMdvsId": place.get("place_mdvs_id"),
            "placeUrl": (
                "/places/" + str(place["place_mdvs_id"]).rsplit(":", 1)[-1]
                if place.get("place_mdvs_id") else None
            ),
            "coordinates": {
                "lat": coordinate.get("latitude"),
                "lon": coordinate.get("longitude"),
                "precision": coordinate.get("precision"),
                "state": coordinate.get("coordinate_state"),
                "source": coordinate.get("coordinate_source"),
            },
            "coordinateAssertions": [{
                "id": row["source_organ_mdvs_id"],
                "sourceOrganMdvsId": row["source_organ_mdvs_id"],
                "latitude": row.get("latitude"),
                "longitude": row.get("longitude"),
                "evidence": coordinate_evidence.get(row["source_organ_mdvs_id"]),
                "coordinateState": row.get("coordinate_state"),
                "markerLayer": row.get("marker_layer"),
                "precision": row.get("precision"),
                "source": row.get("coordinate_source"),
            } for row in coordinate_rows],
            "placeAssertions": [{
                "id": row["assertion_id"],
                "mdvsId": row.get("place_mdvs_id"),
                "label": row.get("preferred_label"),
                "temporalScope": row.get("temporal_scope"),
                "relationRole": row.get("relation_role"),
                "sourceRecordId": row["source_record_id"],
                "sourcePath": "locations",
            } for row in place_rows],
            "componentHierarchy": _hierarchy(components),
            "specificationDescriptionDetails": description_details,
            "technicalEvidence": {"facts": technical_facts},
            "timeline": event_items,
            "activities": event_items,
            "media": media,
            "virtualInstruments": {
                "items": [{
                    "id": row["mdvs_id"],
                    "canonicalUri": row["canonical_uri"],
                    "title": row["canonical_title"],
                    "relationshipState": row["resolution_state"],
                    "score": row.get("confidence"),
                } for row in vmis],
            },
        }
        coverage = {
            "sourceRecords": len(sources),
            "builderAssertions": len(builders),
            "placeAssertions": len(place_rows),
            "coordinateAssertions": len(coordinate_rows),
            "specificationDescriptions": len(descriptions),
            "descriptionComponents": len(description_components),
            "specificationComponents": len(components),
            "technicalFacts": len(facts),
            "materialConflicts": sum(row["conflict_state"] == "material_technical_disagreement" for row in facts),
            "events": len(events),
            "eventParticipants": participant_count,
            "eventPlaces": event_place_count,
            "mediaReferences": len(media_rows),
            "virtualInstrumentRelations": len(vmis),
        }
        return record, coverage


def _nt_lines(graph: Graph) -> list[str]:
    if any(isinstance(node, BNode) for triple in graph for node in triple):
        raise ValueError("Complete-corpus graphs require registered owner-scoped resources; blank nodes are not merge-safe")
    return exact_nt_lines(graph)


def _profile_filename(release: str, profile: str, index: int, total: int) -> str:
    return (
        f"modavis-pod-{release}-complete-{profile}-"
        f"part-{index:05d}-of-{total:05d}.nt.gz"
    )


def _policy(release: str, policy_version: str = "auto") -> UriPolicy:
    return UriPolicy.for_release(release, policy_version=policy_version)


def build_shard(
    core: str,
    output: str,
    release: str,
    source_sha256: str,
    index: int,
    total: int,
    organ_ids: Sequence[str],
    uri_policy_version: str = "auto",
    verify_uri_migration: bool = False,
) -> dict[str, Any]:
    output_path = Path(output)
    reader = PublicCoreOrganReader(Path(core))
    policy = _policy(release, uri_policy_version)
    migration = {"recordCount": 0, "profileGraphCount": 0, "missingStatements": 0, "unexplainedStatements": 0}
    if verify_uri_migration and policy.policy_version != "2":
        raise RuntimeError("URI migration verification requires policy v2")
    handles: dict[str, Any] = {}
    raw_handles: dict[str, Any] = {}
    temporary_paths: dict[str, Path] = {}
    target_paths: dict[str, Path] = {}
    statement_counts = {profile: 0 for profile in PROFILES}
    coverage = {key: 0 for key in COVERAGE_KEYS}
    try:
        for profile in PROFILES:
            target = output_path / _profile_filename(release, profile, index, total)
            temporary = output_path / f".{target.name}.tmp-{os.getpid()}"
            target_paths[profile] = target
            temporary_paths[profile] = temporary
            raw = temporary.open("xb")
            raw_handles[profile] = raw
            handles[profile] = gzip.GzipFile(
                filename="", fileobj=raw, mode="wb", compresslevel=6, mtime=0
            )
        for organ_id in organ_ids:
            record, record_coverage = reader.record(organ_id)
            for key in coverage:
                coverage[key] += record_coverage[key]
            if verify_uri_migration:
                from .resource_validation import compare_uri_migration
                graphs, comparison = compare_uri_migration("organ", record, release)
                if any(item["missingStatements"] or item["unexplainedStatements"] for item in comparison.values()):
                    raise RuntimeError(f"URI migration changed facts for {record['mdvsId']}: {comparison}")
                migration["recordCount"] += 1
                migration["profileGraphCount"] += len(graphs)
            else:
                graphs = profile_graphs("organ", record, policy)
            for profile, graph in graphs.items():
                lines = _nt_lines(graph)
                handles[profile].write(("\n".join(lines) + "\n").encode("utf-8"))
                statement_counts[profile] += len(lines)
        for profile in PROFILES:
            handles[profile].close()
            raw_handles[profile].close()
            os.replace(temporary_paths[profile], target_paths[profile])
    except Exception:
        for handle in handles.values():
            try:
                handle.close()
            except Exception:
                pass
        for handle in raw_handles.values():
            try:
                handle.close()
            except Exception:
                pass
        for path in temporary_paths.values():
            path.unlink(missing_ok=True)
        raise
    finally:
        reader.close()
    profiles = {}
    for profile, target in target_paths.items():
        profiles[profile] = {
            "path": target.name,
            "mediaType": "application/n-triples",
            "contentEncoding": "gzip",
            "bytes": target.stat().st_size,
            "sha256": sha256(target),
            "statementCount": statement_counts[profile],
        }
    receipt = {
        "contract": SHARD_CONTRACT,
        "uriMigration": migration if verify_uri_migration else None,
        "releaseVersion": release,
        "uriPolicy": _policy(release, uri_policy_version).as_dict(),
        "sourcePublicCoreSha256": source_sha256,
        "shardIndex": index,
        "shardCount": total,
        "firstOrganMdvsId": organ_ids[0],
        "lastOrganMdvsId": organ_ids[-1],
        "entityCount": len(organ_ids),
        "coverage": coverage,
        "profiles": profiles,
    }
    write_json(output_path / f"shard-{index:05d}.json", receipt)
    return receipt


def expected_coverage(core: Path) -> dict[str, int]:
    reader = PublicCoreOrganReader(core)
    connection = reader.connection
    values = {
        "sourceRecords": "select count(*) from source_membership",
        "builderAssertions": "select count(*) from organ_builder_assertion where organ_mdvs_id is not null",
        "placeAssertions": "select count(*) from place_assertion where organ_mdvs_id is not null",
        "coordinateAssertions": "select count(*) from coordinate_assertion",
        "specificationDescriptions": "select count(*) from specification_description",
        "descriptionComponents": "select count(*) from specification_description_component",
        "specificationComponents": "select count(*) from specification_component where label_disclosure_state not like 'excluded_%'",
        "technicalFacts": "select count(*) from technical_fact",
        "materialConflicts": "select count(*) from technical_fact where conflict_state='material_technical_disagreement'",
        "events": "select count(*) from documented_event",
        "eventParticipants": "select coalesce(sum(json_array_length(participants_json)),0) from documented_event_context",
        "eventPlaces": "select coalesce(sum(json_array_length(places_json)),0) from documented_event_context",
        "mediaReferences": "select count(*) from public_media_reference",
        "virtualInstrumentRelations": "select count(*) from organ_virtual_instrument where organ_mdvs_id is not null",
    }
    result = {key: int(connection.execute(sql).fetchone()[0]) for key, sql in values.items()}
    reader.close()
    return result


def _valid_existing_shard(receipt: Mapping[str, Any], output: Path, state: Mapping[str, Any]) -> bool:
    if (
        receipt.get("contract") != SHARD_CONTRACT
        or receipt.get("releaseVersion") != state["releaseVersion"]
        or receipt.get("uriPolicy") != state.get("uriPolicy")
        or receipt.get("sourcePublicCoreSha256") != state["sourcePublicCoreSha256"]
        or receipt.get("shardCount") != state["shardCount"]
    ):
        return False
    if state.get("verifyUriMigration") and (receipt.get("uriMigration") or {}).get("recordCount") != receipt.get("entityCount"):
        return False
    for profile in PROFILES:
        artifact = receipt.get("profiles", {}).get(profile, {})
        path = output / str(artifact.get("path") or "")
        if not path.is_file() or path.stat().st_size != artifact.get("bytes") or sha256(path) != artifact.get("sha256"):
            return False
    return True


def build_complete_release_lod(
    *,
    core: Path,
    output: Path,
    release: str,
    expected_core_sha256: str,
    created_at: str,
    records_per_shard: int = 10_000,
    workers: int = 1,
    resume: bool = False,
    minimum_free_gib: int = 30,
    uri_policy_version: str = "auto",
    source_release: str | None = None,
    verify_uri_migration: bool = False,
) -> dict[str, Any]:
    if not core.is_file() or not core.is_absolute():
        raise RuntimeError("an absolute public-core SQLite path is required")
    actual_core_sha256 = sha256(core)
    if actual_core_sha256 != expected_core_sha256:
        raise RuntimeError("public-core SHA-256 differs from the accepted input")
    if records_per_shard < 1 or workers < 1:
        raise RuntimeError("records per shard and workers must be positive")
    output_parent = next(parent for parent in (output, *output.parents) if parent.exists())
    if shutil.disk_usage(output_parent).free < minimum_free_gib * 1024**3:
        raise RuntimeError("destination would violate the configured free-space floor")
    state_path = output / "build-state.json"
    if output.exists() and not resume:
        raise RuntimeError("output already exists; pass resume only for this exact build")
    output.mkdir(parents=True, exist_ok=resume)
    uri = core.resolve().as_uri() + "?mode=ro&immutable=1"
    with sqlite3.connect(uri, uri=True) as connection:
        organ_ids = [row[0] for row in connection.execute("select mdvs_id from organ order by mdvs_id")]
        metadata = dict(connection.execute("select key,value from metadata"))
    if metadata.get("release_version") != (source_release or release):
        raise RuntimeError("requested release differs from public-core metadata")
    shards = [organ_ids[index:index + records_per_shard] for index in range(0, len(organ_ids), records_per_shard)]
    state = {
        "contract": STATE_CONTRACT,
        "sourceReleaseVersion": metadata["release_version"],
        "verifyUriMigration": verify_uri_migration,
        "releaseVersion": release,
        "uriPolicy": _policy(release, uri_policy_version).as_dict(),
        "sourcePublicCore": str(core),
        "sourcePublicCoreSha256": actual_core_sha256,
        "createdAt": created_at,
        "recordsPerShard": records_per_shard,
        "entityCount": len(organ_ids),
        "shardCount": len(shards),
        "profiles": list(PROFILES),
        "status": "building",
    }
    if resume:
        if not state_path.is_file():
            raise RuntimeError("resume requested without a build state")
        prior = json.loads(state_path.read_text())
        comparable = {key: state[key] for key in state if key != "status"}
        prior_comparable = {key: prior.get(key) for key in comparable}
        if prior_comparable != comparable:
            raise RuntimeError("build state does not match the requested inputs")
    else:
        write_json(state_path, state)

    receipts: dict[int, dict[str, Any]] = {}
    pending: list[tuple[int, Sequence[str]]] = []
    for index, ids in enumerate(shards, 1):
        receipt_path = output / f"shard-{index:05d}.json"
        if resume and receipt_path.is_file():
            receipt = json.loads(receipt_path.read_text())
            if _valid_existing_shard(receipt, output, state):
                receipts[index] = receipt
                continue
        pending.append((index, ids))

    arguments = [
        (str(core), str(output), release, actual_core_sha256, index, len(shards), ids, uri_policy_version, verify_uri_migration)
        for index, ids in pending
    ]
    if workers == 1:
        for arguments_for_shard in arguments:
            receipt = build_shard(*arguments_for_shard)
            receipts[int(receipt["shardIndex"])] = receipt
            print(f"complete LOD shard {receipt['shardIndex']}/{len(shards)}", flush=True)
    elif arguments:
        with ProcessPoolExecutor(max_workers=workers) as executor:
            futures = {executor.submit(build_shard, *values): values[4] for values in arguments}
            for future in as_completed(futures):
                receipt = future.result()
                receipts[int(receipt["shardIndex"])] = receipt
                print(f"complete LOD shard {receipt['shardIndex']}/{len(shards)}", flush=True)

    ordered = [receipts[index] for index in range(1, len(shards) + 1)]
    observed_coverage = {
        key: sum(int(receipt["coverage"][key]) for receipt in ordered)
        for key in COVERAGE_KEYS
    }
    expected = expected_coverage(core)
    if observed_coverage != expected:
        difference = {
            key: {"expected": expected[key], "observed": observed_coverage[key]}
            for key in expected if expected[key] != observed_coverage[key]
        }
        raise RuntimeError(f"relational coverage differs: {canonical_json(difference)}")
    profiles = {}
    for profile, metadata_profile in PROFILES.items():
        artifacts = [receipt["profiles"][profile] for receipt in ordered]
        profiles[profile] = {
            **metadata_profile,
            "syntax": "N-Triples 1.1",
            "mediaType": "application/n-triples",
            "contentEncoding": "gzip",
            "entityCount": len(organ_ids),
            "statementCount": sum(int(item["statementCount"]) for item in artifacts),
            "compressedBytes": sum(int(item["bytes"]) for item in artifacts),
            "parts": artifacts,
        }
    manifest = {
        "contract": CONTRACT,
        "sourceReleaseVersion": metadata["release_version"],
        "verifyUriMigration": verify_uri_migration,
        "releaseVersion": release,
        "uriPolicy": _policy(release, uri_policy_version).as_dict(),
        "createdAt": created_at,
        "status": "complete_local_candidate",
        "sourcePublicCore": {
            "filename": core.name,
            "bytes": core.stat().st_size,
            "sha256": actual_core_sha256,
        },
        "entityScope": {
            "kind": "pipe_organ",
            "entityCount": len(organ_ids),
            "firstMdvsId": organ_ids[0],
            "lastMdvsId": organ_ids[-1],
            "ordering": "canonical MODAVIS identifier ascending",
        },
        "coverage": {
            "expected": expected,
            "observed": observed_coverage,
            "complete": True,
        },
        "profiles": profiles,
        "shards": [f"shard-{index:05d}.json" for index in range(1, len(shards) + 1)],
        "determinism": {
            "gzipMtime": 0,
            "statementOrder": "entity identifier, then lexical N-Triples order",
            "compressionLevel": 6,
        },
        "publication": {"zenodoUploads": 0, "deployments": 0},
    }
    write_json(output / "manifest.json", manifest)
    write_text(output / "README.md", f"""# Complete linked-data exports for MODAVIS POD {release}

This directory contains the complete pipe-organ entity graphs derived from the
accepted public-core SQLite database. It covers all {len(organ_ids):,} canonical
organs and every publication-safe source membership, builder assertion, place
assertion, specification description and component, technical fact, documented
event, media reference, and virtual-instrument relationship associated with
those organs.

Each profile is split into {len(shards)} gzip-compressed N-Triples 1.1 files.
Concatenating the decompressed parts of one profile in numeric order produces a
valid release-wide N-Triples graph. Parts contain no blank nodes, so they can
also be loaded independently or in parallel without changing identity.

`manifest.json` records the source database hash, relational coverage totals,
statement counts, byte sizes, and SHA-256 values. The shard receipts bind every
part to its inclusive MODAVIS identifier interval. `SHA256SUMS` covers the
manifest, this document, all shard receipts, and every compressed graph part.

The files contain structured public facts and source references. They do not
contain raw source payloads, source prose, media bytes, credentials, or
operational data. Remote media URLs remain references to provider resources.
""")
    remove_appledouble(output)
    checksum_paths = [
        path for path in sorted(output.iterdir(), key=lambda item: item.name)
        if path.is_file()
        and not path.name.startswith("._")
        and path.name not in {"SHA256SUMS", "build-state.json"}
    ]
    write_text(
        output / "SHA256SUMS",
        "\n".join(f"{sha256(path)}  {path.name}" for path in checksum_paths) + "\n",
    )
    state["status"] = "complete"
    state["completedAt"] = datetime.now(timezone.utc).isoformat()
    state["manifestSha256"] = sha256(output / "manifest.json")
    state["checksumsSha256"] = sha256(output / "SHA256SUMS")
    write_json(state_path, state)
    remove_appledouble(output)
    return manifest
