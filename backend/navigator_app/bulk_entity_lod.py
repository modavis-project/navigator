"""Deterministic release-wide RDF exports for non-organ public entities."""

from __future__ import annotations

from collections import defaultdict
from collections.abc import Mapping, Sequence
from concurrent.futures import ProcessPoolExecutor, as_completed
from datetime import datetime, timezone
import gzip
import json
import os
from pathlib import Path
import shutil
import sqlite3
from typing import Any
from urllib.parse import quote

from .bulk_lod import (
    _nt_lines,
    _policy,
    canonical_json,
    parsed,
    remove_appledouble,
    sha256,
    write_json,
    write_text,
)
from .entity_exports import profile_graphs


CONTRACT = "modavis.complete-release-entity-lod/v1"
SHARD_CONTRACT = "modavis.complete-release-entity-lod-shard/v1"
STATE_CONTRACT = "modavis.complete-release-entity-lod-build-state/v1"
PROFILES = {
    "modavis": {
        "label": "MODAVIS Ontology Network",
        "profileUri": "https://w3id.org/modavis/ontology/0.1.0/",
    },
    "cidoc": {
        "label": "CIDOC CRM 7.1.3",
        "profileUri": "https://cidoc-crm.org/get-last-official-release",
    },
    "edm": {
        "label": "Europeana Data Model",
        "profileUri": "https://pro.europeana.eu/page/edm-documentation",
    },
}
DOMAINS = {
    "actors": {"table": "actor", "idColumn": "mdvs_id"},
    "places": {"table": "place_detail", "idColumn": "mdvs_id"},
    "names": {"table": "structured_name", "idColumn": "name_mdvs_id"},
    "virtual_instruments": {"table": "virtual_instrument", "idColumn": "mdvs_id"},
}
DOMAIN_COVERAGE_KEYS = {
    "actors": (
        "actorNames", "actorAliases", "actorSuppressions",
        "externalIdentifiers", "temporalAssertions", "organLinks",
        "organRelationEvidence", "sourceAssertions",
        "musiXploraRelationAppearances",
    ),
    "places": (
        "nameVariants", "sourceHierarchyNodes", "providerHierarchyNodes",
        "providerBindings", "administrativeNodes", "containmentRelations",
        "placeAssertions", "canonicalAssertionLinks", "placesWithCoordinates",
    ),
    "names": ("actorNameLinks",),
    "virtual_instruments": (
        "detailPayloads", "sourcePayloadLeaves", "sourceUrls",
        "organRelations", "acceptedOrganRelations", "unresolvedOrganRelations",
    ),
}


def _source(row: Mapping[str, Any]) -> dict[str, Any]:
    return {
        "id": row.get("source_record_id"),
        "source": row.get("source_key"),
        "url": row.get("source_url"),
    }


def _json_leaf_count(value: Any) -> int:
    if isinstance(value, Mapping):
        return sum(_json_leaf_count(item) for item in value.values())
    if isinstance(value, (list, tuple)):
        return sum(_json_leaf_count(item) for item in value)
    return int(value is not None)


def _external_place_url(provider_id: Any) -> str | None:
    parts = str(provider_id or "").split(":")
    if (
        len(parts) == 3 and parts[0] == "osm"
        and parts[1] in {"node", "way", "relation"} and parts[2].isdigit()
    ):
        return f"https://www.openstreetmap.org/{parts[1]}/{parts[2]}"
    return None


def _xsd_datetime(value: Any) -> str | None:
    if value in (None, ""):
        return None
    text = str(value).strip().replace(" ", "T", 1)
    if len(text) >= 3 and text[-3] in {"+", "-"} and text[-2:].isdigit():
        text += ":00"
    return text


from .coordinate_evidence import interpretations


class PublicCoreEntityReader:
    """Read complete public entity records in bounded SQLite batches."""

    def __init__(self, core: Path):
        uri = core.resolve().as_uri() + "?mode=ro&immutable=1"
        self.connection = sqlite3.connect(uri, uri=True)
        self.connection.row_factory = sqlite3.Row
        self.connection.execute("pragma query_only=on")

    def close(self) -> None:
        self.connection.close()

    @staticmethod
    def _marks(values: Sequence[str]) -> str:
        if not values:
            raise RuntimeError("an entity shard cannot be empty")
        return ",".join("?" for _ in values)

    def _rows(self, sql: str, values: Sequence[Any]) -> list[dict[str, Any]]:
        return [dict(row) for row in self.connection.execute(sql, values)]

    def records(
        self, domain: str, identifiers: Sequence[str],
    ) -> tuple[list[dict[str, Any]], dict[str, int]]:
        if domain == "actors":
            return self._actors(identifiers)
        if domain == "places":
            return self._places(identifiers)
        if domain == "names":
            return self._names(identifiers)
        if domain == "virtual_instruments":
            return self._virtual_instruments(identifiers)
        raise KeyError(domain)

    def _actors(
        self, identifiers: Sequence[str],
    ) -> tuple[list[dict[str, Any]], dict[str, int]]:
        marks = self._marks(identifiers)
        actors = self._rows(
            f"select * from actor where mdvs_id in ({marks}) order by mdvs_id",
            identifiers,
        )
        names = self._rows(
            f"""select an.actor_mdvs_id,n.* from actor_name an
                join structured_name n on n.name_mdvs_id=an.name_mdvs_id
                where an.actor_mdvs_id in ({marks})
                order by an.actor_mdvs_id,n.name_mdvs_id""",
            identifiers,
        )
        aliases = self._rows(
            f"select * from actor_alias where canonical_mdvs_id in ({marks}) order by canonical_mdvs_id,alias_mdvs_id",
            identifiers,
        )
        suppressions = self._rows(
            f"select * from actor_suppression where canonical_mdvs_id in ({marks}) order by canonical_mdvs_id,source_mdvs_id",
            identifiers,
        )
        external = self._rows(
            f"select * from actor_external_identifier where actor_mdvs_id in ({marks}) order by actor_mdvs_id,scheme_code,identifier_value",
            identifiers,
        )
        temporal = self._rows(
            f"select * from actor_temporal_assertion where actor_mdvs_id in ({marks}) order by actor_mdvs_id,temporality_mdvs_id",
            identifiers,
        )
        links = self._rows(
            f"""select b.*,o.label as organ_label from organ_builder b
                join organ o on o.mdvs_id=b.organ_mdvs_id
                where b.actor_mdvs_id in ({marks})
                order by b.actor_mdvs_id,b.organ_mdvs_id""",
            identifiers,
        )
        relations = self._rows(
            f"""select r.*,o.label as organ_label,m.source_key,m.source_url
                from organ_builder_relation r
                join organ o on o.mdvs_id=r.organ_mdvs_id
                left join public_source_record_metadata m on m.source_record_id=r.source_record_id
                where r.actor_mdvs_id in ({marks})
                order by r.actor_mdvs_id,r.relation_id""",
            identifiers,
        )
        assertions = self._rows(
            f"""select a.*,o.label as organ_label,m.source_url
                from organ_builder_assertion a
                left join organ o on o.mdvs_id=a.organ_mdvs_id
                left join public_source_record_metadata m on m.source_record_id=a.source_record_id
                where a.actor_mdvs_id in ({marks})
                order by a.actor_mdvs_id,a.assertion_id""",
            identifiers,
        )
        mxp = self._rows(
            f"""select r.*,source.actor_mdvs_id as source_actor_mdvs_id,
                       target.actor_mdvs_id as target_actor_mdvs_id
                from musixplora_relation r
                left join actor_external_identifier source
                  on source.scheme_code='extidtype:musixplora'
                 and source.identifier_value=r.source_mxp_id
                left join actor_external_identifier target
                  on target.scheme_code='extidtype:musixplora'
                 and target.identifier_value=r.target_mxp_id
                where source.actor_mdvs_id in ({marks})
                   or target.actor_mdvs_id in ({marks})
                order by r.edge_id""",
            (*identifiers, *identifiers),
        )
        by_actor: dict[str, dict[str, list[dict[str, Any]]]] = defaultdict(
            lambda: defaultdict(list)
        )
        identifier_set = set(identifiers)
        for key, rows in (
            ("names", names), ("aliases", aliases), ("suppressions", suppressions),
            ("external", external), ("temporal", temporal), ("links", links),
            ("relations", relations), ("assertions", assertions),
        ):
            actor_key = "canonical_mdvs_id" if key in {"aliases", "suppressions"} else "actor_mdvs_id"
            for row in rows:
                by_actor[str(row[actor_key])][key].append(row)
        mxp_appearances = 0
        for row in mxp:
            endpoints = {
                str(value) for value in (
                    row.get("source_actor_mdvs_id"), row.get("target_actor_mdvs_id")
                ) if value in identifier_set
            }
            for actor_id in endpoints:
                by_actor[actor_id]["mxp"].append(row)
                mxp_appearances += 1
        from .actor_link_evidence import read_evidence
        builder_evidence = read_evidence(self._rows, assertions)
        from .actor_label_evidence import read_evidence as read_labels
        label_evidence = read_labels(self._rows, identifiers)
        records = []
        for actor in actors:
            actor_id = str(actor["mdvs_id"])
            related = by_actor[actor_id]
            sources: dict[str, dict[str, Any]] = {}
            for row in (*related["assertions"], *related["relations"]):
                if row.get("source_record_id"):
                    sources[str(row["source_record_id"])] = _source(row)
            name_items = [{
                "mdvsId": row["name_mdvs_id"],
                "canonicalUri": row["canonical_uri"],
                "value": row["display_name"],
                "displayName": row["display_name"],
                "givenName": row.get("given_name"),
                "middleNames": row.get("middle_names"),
                "familyName": row.get("family_name"),
                "particle": row.get("particle"),
                "prefix": row.get("prefix"),
                "suffix": row.get("suffix"),
                "abbreviation": row.get("abbreviation"),
                "romanization": row.get("romanization"),
                "transliteration": row.get("transliteration"),
                "isNative": bool(row["is_native"]) if row.get("is_native") is not None else None,
                "verificationScore": row.get("verification_score"),
            } for row in related["names"]]
            identifiers_items = [{
                "id": row["identifier_mdvs_id"],
                "scheme": row["scheme_code"],
                "schemeLabel": row["scheme_label"],
                "value": row["identifier_value"],
                "url": row.get("identifier_url"),
            } for row in related["external"]]
            records.append({
                "id": actor_id,
                "mdvsId": actor_id,
                "canonicalUri": actor["canonical_uri"],
                "canonicalUrl": (
                    "/organizations/" if actor["actor_type"] == "organization" else "/people/"
                ) + actor_id.rsplit(":", 1)[-1],
                "labelInterpretations": [label_evidence[actor_id]] if actor_id in label_evidence else [],
                "title": actor["label"],
                "label": actor["label"],
                "entityType": actor["actor_type"],
                "identifiers": [{
                    "scheme": "MODAVIS", "value": actor_id,
                    "url": actor["canonical_uri"],
                }],
                "profile": {
                    "names": name_items,
                    "identifiers": identifiers_items,
                    "dates": [{
                        "id": row["temporality_mdvs_id"],
                        "kind": row.get("anchor_code"),
                        "label": row.get("anchor_label"),
                        "display": row.get("raw_expression"),
                        "start": row.get("start_date"),
                        "end": row.get("end_date"),
                        "startYear": row.get("start_year"),
                        "endYear": row.get("end_year"),
                    } for row in related["temporal"]],
                },
                "identityAliases": [{
                    "mdvsId": row["alias_mdvs_id"],
                    "aliasUri": row["alias_uri"],
                    "label": row.get("alias_label"),
                    "projectionId": row["projection_id"],
                    "evidenceSha256": row.get("evidence_sha256"),
                } for row in related["aliases"]],
                "identitySuppressions": [{
                    "mdvsId": row["source_mdvs_id"],
                    "outcome": row["outcome"],
                    "projectionId": row["projection_id"],
                    "evidenceSha256": row.get("evidence_sha256"),
                } for row in related["suppressions"]],
                "relationships": [{
                    "id": f"{actor_id}:{row['organ_mdvs_id']}",
                    "mdvsId": row["organ_mdvs_id"],
                    "label": row["organ_label"],
                    "relationType": "builder_of",
                    "assertionCount": row["assertion_count"],
                    "relationCount": row["relation_count"],
                } for row in related["links"]],
                "builderAssertions": [{
                    "id": row["assertion_id"],
                    "organMdvsId": row.get("organ_mdvs_id"),
                    "organLabel": row.get("organ_label"),
                    "sourceLabel": row.get("source_label"),
                    "preferredLabel": row.get("preferred_label"),
                    "actorType": row.get("actor_type"),
                    "relationRole": row.get("relation_role"),
                    "resolutionState": row.get("resolution_state"),
                    "sourceRecordId": row.get("source_record_id"),
                    "sourcePath": "builders",
                    "identityEvidence": builder_evidence.get(row["assertion_id"]),
                } for row in related["assertions"]],
                "organRelations": [{
                    "id": row["relation_id"],
                    "organMdvsId": row["organ_mdvs_id"],
                    "organLabel": row["organ_label"],
                    "sourceRecordId": row.get("source_record_id"),
                    "confidence": row.get("confidence"),
                    "rowHash": row.get("row_hash"),
                } for row in related["relations"]],
                "musiXploraRelations": [{
                    "id": row["edge_id"],
                    "sourceMxpId": row["source_mxp_id"],
                    "targetMxpId": row["target_mxp_id"],
                    "sourceActorMdvsId": row.get("source_actor_mdvs_id"),
                    "targetActorMdvsId": row.get("target_actor_mdvs_id"),
                    "roleCode": row.get("role_code"),
                    "roleLabel": row.get("role_label"),
                    "generation": row.get("generation"),
                    "generationLabel": row.get("generation_label"),
                    "relationCategory": row["relation_category"],
                    "canonicalRelationType": row["canonical_relation_type"],
                    "priorRelationCategory": row.get("prior_relation_category"),
                    "decisionState": row["decision_state"],
                    "evidenceSha256": row["evidence_sha256"],
                } for row in related["mxp"]],
                "sources": list(sources.values()),
                "sourceMentions": [{
                    "sourceRecordId": source["id"],
                    "sourceFamily": source["source"],
                    "sourceUrl": source["url"],
                } for source in sources.values()],
            })
        coverage = {
            "actorNames": len(names),
            "actorAliases": len(aliases),
            "actorSuppressions": len(suppressions),
            "externalIdentifiers": len(external),
            "temporalAssertions": len(temporal),
            "organLinks": len(links),
            "organRelationEvidence": len(relations),
            "sourceAssertions": len(assertions),
            "musiXploraRelationAppearances": mxp_appearances,
        }
        return records, coverage

    def _places(
        self, identifiers: Sequence[str],
    ) -> tuple[list[dict[str, Any]], dict[str, int]]:
        marks = self._marks(identifiers)
        places = self._rows(
            f"select * from place_detail where mdvs_id in ({marks}) order by mdvs_id",
            identifiers,
        )
        source_assertions = self._rows(
            f"""select p.*,r.route_id,r.route_kind,r.source_location_mdvs_id,
                       r.canonical_target_mdvs_id,r.canonical_status,
                       o.label as organ_label,m.source_url
                from place_route r join place_assertion p on p.assertion_id=r.assertion_id
                left join organ o on o.mdvs_id=p.organ_mdvs_id
                left join public_source_record_metadata m on m.source_record_id=p.source_record_id
                where r.source_location_mdvs_id in ({marks})
                order by r.source_location_mdvs_id,p.assertion_id""",
            identifiers,
        )
        canonical_assertions = self._rows(
            f"""select p.*,r.route_id,r.route_kind,r.source_location_mdvs_id,
                       r.canonical_target_mdvs_id,r.canonical_status,
                       o.label as organ_label,m.source_url
                from place_route r join place_assertion p on p.assertion_id=r.assertion_id
                left join organ o on o.mdvs_id=p.organ_mdvs_id
                left join public_source_record_metadata m on m.source_record_id=p.source_record_id
                where r.canonical_target_mdvs_id in ({marks})
                  and (r.source_location_mdvs_id is null
                       or r.canonical_target_mdvs_id<>r.source_location_mdvs_id)
                order by r.canonical_target_mdvs_id,p.assertion_id""",
            identifiers,
        )
        by_place: dict[str, list[dict[str, Any]]] = defaultdict(list)
        for row in source_assertions:
            row["appearanceKind"] = "source_location"
            by_place[str(row["source_location_mdvs_id"])].append(row)
        for row in canonical_assertions:
            row["appearanceKind"] = "canonical_target"
            by_place[str(row["canonical_target_mdvs_id"])].append(row)
        records = []
        coverage = {key: 0 for key in DOMAIN_COVERAGE_KEYS["places"]}
        coverage["placeAssertions"] = len(source_assertions)
        coverage["canonicalAssertionLinks"] = len(canonical_assertions)
        coordinate_evidence = interpretations(self._rows, "place", identifiers)
        for place in places:
            place_id = str(place["mdvs_id"])
            variants = parsed(place.get("name_variants_json"), [])
            source_hierarchy = parsed(place.get("source_hierarchy_json"), [])
            provider_hierarchy = parsed(place.get("provider_hierarchy_json"), [])
            bindings = parsed(place.get("provider_bindings_json"), [])
            admins = parsed(place.get("administrative_nodes_json"), [])
            containment = parsed(place.get("containment_relations_json"), [])
            for key, values in (
                ("nameVariants", variants), ("sourceHierarchyNodes", source_hierarchy),
                ("providerHierarchyNodes", provider_hierarchy), ("providerBindings", bindings),
                ("administrativeNodes", admins), ("containmentRelations", containment),
            ):
                coverage[key] += len(values)
            if place.get("latitude") is not None and place.get("longitude") is not None:
                coverage["placesWithCoordinates"] += 1
            assertions = by_place[place_id]
            sources = {
                str(row["source_record_id"]): _source(row)
                for row in assertions if row.get("source_record_id")
            }
            records.append({
                "id": place_id,
                "mdvsId": place_id,
                "canonicalUri": place["canonical_uri"],
                "canonicalUrl": "/places/" + place_id.rsplit(":", 1)[-1],
                "title": place["preferred_name"],
                "label": place["preferred_name"],
                "kind": "place",
                "placeType": place.get("place_kind"),
                "enrichmentOutcome": place.get("enrichment_outcome"),
                "coordinate": {
                    "latitude": place.get("latitude"),
                    "longitude": place.get("longitude"),
                    "precision": coordinate_evidence.get(place_id, {}).get("precision", place.get("coordinate_state")),
                    "source": place.get("coordinate_source"),
                    "confidence": place.get("coordinate_confidence"),
                },
                "coordinateEvidence": coordinate_evidence.get(place_id),
                "nameVariants": variants,
                "sourceHierarchy": source_hierarchy,
                "providerHierarchy": provider_hierarchy,
                "providerReferences": [{
                    **item,
                    "externalUrl": item.get("externalUrl") or _external_place_url(item.get("providerPlaceId")),
                } for item in bindings if isinstance(item, Mapping)],
                "administrativeNodes": admins,
                "containmentRelations": containment,
                "placeAssertions": [{
                    "id": row["assertion_id"],
                    "organMdvsId": row.get("organ_mdvs_id"),
                    "organLabel": row.get("organ_label"),
                    "activityMdvsId": row.get("activity_mdvs_id"),
                    "preferredLabel": row.get("preferred_label"),
                    "placeKind": row.get("place_kind"),
                    "temporalScope": row.get("temporal_scope"),
                    "relationRole": row.get("relation_role"),
                    "coordinateState": row.get("coordinate_state"),
                    "sourceRecordId": row.get("source_record_id"),
                    "sourceKey": row.get("source_key"),
                    "routeId": row.get("route_id"),
                    "routeKind": row.get("route_kind"),
                    "sourceLocationMdvsId": row.get("source_location_mdvs_id"),
                    "canonicalTargetMdvsId": row.get("canonical_target_mdvs_id"),
                    "canonicalStatus": row.get("canonical_status"),
                    "appearanceKind": row.get("appearanceKind"),
                    "sourcePath": "locations",
                } for row in assertions],
                "sources": list(sources.values()),
                "evidenceSha256": place.get("evidence_sha256"),
                "rowSha256": place.get("row_sha256"),
            })
        return records, coverage

    def _names(
        self, identifiers: Sequence[str],
    ) -> tuple[list[dict[str, Any]], dict[str, int]]:
        marks = self._marks(identifiers)
        names = self._rows(
            f"select * from structured_name where name_mdvs_id in ({marks}) order by name_mdvs_id",
            identifiers,
        )
        links = self._rows(
            f"""select an.name_mdvs_id,a.mdvs_id,a.canonical_uri,a.label,a.actor_type
                from actor_name an join actor a on a.mdvs_id=an.actor_mdvs_id
                where an.name_mdvs_id in ({marks})
                order by an.name_mdvs_id,a.mdvs_id""",
            identifiers,
        )
        from .actor_label_evidence import read_evidence as read_labels
        label_evidence = read_labels(self._rows, sorted({r["mdvs_id"] for r in links}))
        by_name: dict[str, list[dict[str, Any]]] = defaultdict(list)
        for row in links:
            by_name[str(row["name_mdvs_id"])].append(row)
        records = []
        for row in names:
            name_id = str(row["name_mdvs_id"])
            records.append({
                "id": name_id,
                "mdvsId": name_id,
                "canonicalUri": row["canonical_uri"],
                "canonicalUrl": "/names/" + name_id.rsplit(":", 1)[-1],
                "labelInterpretations": [label_evidence[i["mdvs_id"]] for i in by_name[name_id] if i["mdvs_id"] in label_evidence],
                "title": row["display_name"],
                "label": row["display_name"],
                "forms": {
                    "display": row["display_name"],
                    "canonical": row["display_name"],
                    "abbreviation": row.get("abbreviation"),
                    "romanization": row.get("romanization"),
                    "transliteration": row.get("transliteration"),
                },
                "nameComponents": {
                    "givenName": row.get("given_name"),
                    "middleNames": row.get("middle_names"),
                    "familyName": row.get("family_name"),
                    "particle": row.get("particle"),
                    "prefix": row.get("prefix"),
                    "suffix": row.get("suffix"),
                },
                "isNative": bool(row["is_native"]) if row.get("is_native") is not None else None,
                "verificationScore": row.get("verification_score"),
                "rowHash": row.get("row_hash"),
                "relatedEntities": [{
                    "mdvsId": item["mdvs_id"],
                    "canonicalUri": item["canonical_uri"],
                    "label": item["label"],
                    "kind": item["actor_type"],
                } for item in by_name[name_id]],
            })
        return records, {"actorNameLinks": len(links)}

    def _virtual_instruments(
        self, identifiers: Sequence[str],
    ) -> tuple[list[dict[str, Any]], dict[str, int]]:
        marks = self._marks(identifiers)
        instruments = self._rows(
            f"""select v.*,d.payload_json,d.source_evidence_sha256,d.row_sha256 as detail_row_sha256
                from virtual_instrument v
                left join virtual_instrument_detail d on d.vmi_mdvs_id=v.mdvs_id
                where v.mdvs_id in ({marks}) order by v.mdvs_id""",
            identifiers,
        )
        relations = self._rows(
            f"""select r.*,o.label as target_organ_title
                from organ_virtual_instrument r
                left join organ o on o.mdvs_id=r.organ_mdvs_id
                where r.vmi_mdvs_id in ({marks})
                order by r.vmi_mdvs_id,r.relation_id""",
            identifiers,
        )
        by_instrument: dict[str, list[dict[str, Any]]] = defaultdict(list)
        for row in relations:
            by_instrument[str(row["vmi_mdvs_id"])].append(row)
        coverage = {
            "detailPayloads": 0,
            "sourcePayloadLeaves": 0,
            "sourceUrls": 0,
            "organRelations": len(relations),
            "acceptedOrganRelations": sum(
                row["resolution_state"] == "accepted_canonical_organ_relation" for row in relations
            ),
            "unresolvedOrganRelations": sum(
                row["resolution_state"] != "accepted_canonical_organ_relation" for row in relations
            ),
        }
        records = []
        for row in instruments:
            payload = parsed(row.get("payload_json"), {})
            if payload:
                coverage["detailPayloads"] += 1
                coverage["sourcePayloadLeaves"] += _json_leaf_count(payload)
            evidence = dict(parsed(payload.get("evidence"), {}))
            urls = [
                str(value) for value in parsed(evidence.get("sourceUrls"), [])
                if value
            ]
            if not urls and evidence.get("sourceUrl"):
                urls = [str(evidence["sourceUrl"])]
            coverage["sourceUrls"] += len(urls)
            relation_descriptions = {
                str(item.get("rowSha256")): item
                for item in parsed(payload.get("relationDescriptions"), [])
                if isinstance(item, Mapping) and item.get("rowSha256")
            }
            relation_items = []
            for relation in by_instrument[str(row["mdvs_id"])]:
                relation_items.append({
                    "id": relation["relation_id"],
                    "targetOrganMdvsId": relation.get("organ_mdvs_id"),
                    "targetOrganTitle": relation.get("target_organ_title"),
                    "representedOrganLabel": relation.get("represented_organ_label"),
                    "relationTypeId": relation.get("relation_type_id"),
                    "confidence": relation.get("confidence"),
                    "resolutionState": relation["resolution_state"],
                    "rowSha256": relation.get("row_hash"),
                    **relation_descriptions.get(str(relation.get("row_hash")), {}),
                })
            vmi_id = str(row["mdvs_id"])
            records.append({
                "id": vmi_id,
                "mdvsId": vmi_id,
                "canonicalUri": row["canonical_uri"],
                "canonicalUrl": "/virtual-instruments/" + quote(vmi_id, safe=""),
                "title": row["canonical_title"],
                "label": row["canonical_title"],
                "relationConfidence": row.get("relation_confidence"),
                "firstObservedAt": _xsd_datetime(row.get("first_observed_at")),
                "lastObservedAt": _xsd_datetime(row.get("last_observed_at")),
                "rowHash": row.get("row_hash"),
                "sampledInstrumentName": payload.get("sampledInstrumentName"),
                "producer": payload.get("producer"),
                "kind": parsed(payload.get("kind"), {}),
                "availability": parsed(payload.get("availability"), {}),
                "platforms": parsed(payload.get("platforms"), {}),
                "physicalInstrument": parsed(payload.get("physicalInstrument"), {}),
                "technical": parsed(payload.get("technical"), {}),
                "canonical": parsed(payload.get("canonical"), {}),
                "notes": payload.get("notes"),
                "evidence": evidence,
                "relationships": {"canonicalOrganRelations": relation_items},
                "sources": [{
                    "id": f"vmi-source:{evidence.get('sourceKey') or 'catalog'}:{vmi_id}",
                    "source": evidence.get("sourceKey") or "virtual instrument catalog",
                    "url": evidence.get("sourceUrl"),
                }] if evidence else [],
                "sourcePayload": payload,
                "sourceEvidenceSha256": row.get("source_evidence_sha256"),
                "detailRowSha256": row.get("detail_row_sha256"),
            })
        return records, coverage


def _profile_filename(
    release: str, domain: str, profile: str, index: int, total: int,
) -> str:
    domain_name = domain.replace("_", "-")
    return (
        f"modavis-pod-{release}-complete-{domain_name}-{profile}-"
        f"part-{index:05d}-of-{total:05d}.nt.gz"
    )


def build_entity_shard(
    core: str,
    output: str,
    release: str,
    source_sha256: str,
    domain: str,
    index: int,
    total: int,
    identifiers: Sequence[str],
    uri_policy_version: str = "auto",
    verify_uri_migration: bool = False,
) -> dict[str, Any]:
    output_path = Path(output)
    reader = PublicCoreEntityReader(Path(core))
    policy = _policy(release, uri_policy_version)
    migration = {"recordCount": 0, "profileGraphCount": 0, "missingStatements": 0, "unexplainedStatements": 0}
    if verify_uri_migration and policy.policy_version != "2":
        raise RuntimeError("URI migration verification requires policy v2")
    handles: dict[str, Any] = {}
    raw_handles: dict[str, Any] = {}
    temporary_paths: dict[str, Path] = {}
    target_paths: dict[str, Path] = {}
    statement_counts = {profile: 0 for profile in PROFILES}
    try:
        for profile in PROFILES:
            target = output_path / _profile_filename(release, domain, profile, index, total)
            temporary = output_path / f".{target.name}.tmp-{os.getpid()}"
            target_paths[profile] = target
            temporary_paths[profile] = temporary
            raw = temporary.open("xb")
            raw_handles[profile] = raw
            handles[profile] = gzip.GzipFile(
                filename="", fileobj=raw, mode="wb", compresslevel=6, mtime=0
            )
        records, coverage = reader.records(domain, identifiers)
        if [record["mdvsId"] for record in records] != list(identifiers):
            raise RuntimeError(f"{domain} shard record identity/order mismatch")
        for record in records:
            kind = (
                str(record["entityType"]) if domain == "actors"
                else "place" if domain == "places"
                else "name" if domain == "names"
                else "virtual_instrument"
            )
            if verify_uri_migration:
                from .resource_validation import compare_uri_migration
                graphs, comparison = compare_uri_migration(kind, record, release)
                if any(item["missingStatements"] or item["unexplainedStatements"] for item in comparison.values()):
                    raise RuntimeError(f"URI migration changed facts for {record['mdvsId']}: {comparison}")
                migration["recordCount"] += 1
                migration["profileGraphCount"] += len(graphs)
            else:
                graphs = profile_graphs(kind, record, policy)
            if set(graphs) != set(PROFILES):
                raise RuntimeError(f"unexpected profiles for {domain}: {sorted(graphs)}")
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
    profiles = {
        profile: {
            "path": target.name,
            "mediaType": "application/n-triples",
            "contentEncoding": "gzip",
            "bytes": target.stat().st_size,
            "sha256": sha256(target),
            "statementCount": statement_counts[profile],
        }
        for profile, target in target_paths.items()
    }
    receipt = {
        "contract": SHARD_CONTRACT,
        "uriMigration": migration if verify_uri_migration else None,
        "releaseVersion": release,
        "uriPolicy": _policy(release, uri_policy_version).as_dict(),
        "sourcePublicCoreSha256": source_sha256,
        "domain": domain,
        "shardIndex": index,
        "shardCount": total,
        "firstMdvsId": identifiers[0],
        "lastMdvsId": identifiers[-1],
        "entityCount": len(identifiers),
        "coverage": coverage,
        "profiles": profiles,
    }
    write_json(output_path / f"{domain}-shard-{index:05d}.json", receipt)
    return receipt


def expected_domain_coverage(core: Path) -> dict[str, dict[str, int]]:
    reader = PublicCoreEntityReader(core)
    connection = reader.connection
    actor_queries = {
        "actorNames": "select count(*) from actor_name",
        "actorAliases": "select count(*) from actor_alias",
        "actorSuppressions": """select count(*) from actor_suppression s
            join actor a on a.mdvs_id=s.canonical_mdvs_id""",
        "externalIdentifiers": "select count(*) from actor_external_identifier",
        "temporalAssertions": "select count(*) from actor_temporal_assertion",
        "organLinks": "select count(*) from organ_builder",
        "organRelationEvidence": "select count(*) from organ_builder_relation",
        "sourceAssertions": "select count(*) from organ_builder_assertion where actor_mdvs_id is not null",
        "musiXploraRelationAppearances": """select coalesce(sum(
            case when source.actor_mdvs_id is not null then 1 else 0 end +
            case when target.actor_mdvs_id is not null
                       and (source.actor_mdvs_id is null
                            or target.actor_mdvs_id<>source.actor_mdvs_id) then 1 else 0 end
          ),0)
          from musixplora_relation r
          left join actor_external_identifier source
            on source.scheme_code='extidtype:musixplora' and source.identifier_value=r.source_mxp_id
          left join actor_external_identifier target
            on target.scheme_code='extidtype:musixplora' and target.identifier_value=r.target_mxp_id""",
    }
    place_queries = {
        "nameVariants": "select coalesce(sum(json_array_length(name_variants_json)),0) from place_detail",
        "sourceHierarchyNodes": "select coalesce(sum(json_array_length(source_hierarchy_json)),0) from place_detail",
        "providerHierarchyNodes": "select coalesce(sum(json_array_length(provider_hierarchy_json)),0) from place_detail",
        "providerBindings": "select coalesce(sum(json_array_length(provider_bindings_json)),0) from place_detail",
        "administrativeNodes": "select coalesce(sum(json_array_length(administrative_nodes_json)),0) from place_detail",
        "containmentRelations": "select coalesce(sum(json_array_length(containment_relations_json)),0) from place_detail",
        "placeAssertions": "select count(*) from place_route where source_location_mdvs_id is not null",
        "canonicalAssertionLinks": """select count(*) from place_route
            where canonical_target_mdvs_id is not null
              and (source_location_mdvs_id is null
                   or canonical_target_mdvs_id<>source_location_mdvs_id)""",
        "placesWithCoordinates": "select count(*) from place_detail where latitude is not null and longitude is not null",
    }
    result = {
        "actors": {key: int(connection.execute(sql).fetchone()[0]) for key, sql in actor_queries.items()},
        "places": {key: int(connection.execute(sql).fetchone()[0]) for key, sql in place_queries.items()},
        "names": {"actorNameLinks": int(connection.execute("select count(*) from actor_name").fetchone()[0])},
    }
    vmi_rows = connection.execute("select payload_json from virtual_instrument_detail").fetchall()
    payloads = [parsed(row[0], {}) for row in vmi_rows]
    relation_counts = dict(connection.execute(
        "select resolution_state,count(*) from organ_virtual_instrument group by resolution_state"
    ))
    result["virtual_instruments"] = {
        "detailPayloads": len(vmi_rows),
        "sourcePayloadLeaves": sum(_json_leaf_count(value) for value in payloads),
        "sourceUrls": sum(
            len(parsed(_map.get("sourceUrls"), [])) if parsed(_map.get("sourceUrls"), [])
            else int(bool(_map.get("sourceUrl")))
            for value in payloads for _map in [parsed(value.get("evidence"), {})]
        ),
        "organRelations": sum(int(value) for value in relation_counts.values()),
        "acceptedOrganRelations": int(relation_counts.get("accepted_canonical_organ_relation", 0)),
        "unresolvedOrganRelations": sum(
            int(value) for key, value in relation_counts.items()
            if key != "accepted_canonical_organ_relation"
        ),
    }
    reader.close()
    return result


def source_only_boundary_counts(core: Path) -> dict[str, int]:
    """Account for evidence that has no canonical entity in these domains."""
    reader = PublicCoreEntityReader(core)
    connection = reader.connection
    queries = {
        "actorSuppressionsWithoutCanonicalActor": """select count(*)
            from actor_suppression s left join actor a on a.mdvs_id=s.canonical_mdvs_id
            where a.mdvs_id is null""",
        "builderAssertionsWithoutCanonicalActor": """select count(*)
            from organ_builder_assertion where actor_mdvs_id is null""",
        "musiXploraRelationsWithoutCanonicalEndpoint": """select count(*)
            from musixplora_relation r
            where not exists(select 1 from actor_external_identifier i
                where i.scheme_code='extidtype:musixplora'
                  and i.identifier_value in (r.source_mxp_id,r.target_mxp_id))""",
        "placeRoutesWithoutIdentifiedPlace": """select count(*) from place_route
            where source_location_mdvs_id is null and canonical_target_mdvs_id is null""",
    }
    result = {key: int(connection.execute(sql).fetchone()[0]) for key, sql in queries.items()}
    reader.close()
    return result


def _valid_existing_shard(
    receipt: Mapping[str, Any], output: Path, state: Mapping[str, Any], domain: str,
) -> bool:
    if (
        receipt.get("contract") != SHARD_CONTRACT
        or receipt.get("releaseVersion") != state["releaseVersion"]
        or receipt.get("uriPolicy") != state.get("uriPolicy")
        or receipt.get("sourcePublicCoreSha256") != state["sourcePublicCoreSha256"]
        or receipt.get("domain") != domain
        or receipt.get("shardCount") != state["domains"][domain]["shardCount"]
    ):
        return False
    if state.get("verifyUriMigration") and (receipt.get("uriMigration") or {}).get("recordCount") != receipt.get("entityCount"):
        return False
    for profile in PROFILES:
        artifact = receipt.get("profiles", {}).get(profile, {})
        path = output / str(artifact.get("path") or "")
        if (
            not path.is_file() or path.stat().st_size != artifact.get("bytes")
            or sha256(path) != artifact.get("sha256")
        ):
            return False
    return True


def build_complete_entity_lod(
    *,
    core: Path,
    output: Path,
    release: str,
    expected_core_sha256: str,
    created_at: str,
    records_per_shard: int = 5_000,
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
    entity_ids: dict[str, list[str]] = {}
    with sqlite3.connect(uri, uri=True) as connection:
        metadata = dict(connection.execute("select key,value from metadata"))
        for domain, config in DOMAINS.items():
            entity_ids[domain] = [
                str(row[0]) for row in connection.execute(
                    f"select {config['idColumn']} from {config['table']} order by {config['idColumn']}"
                )
            ]
    if metadata.get("release_version") != (source_release or release):
        raise RuntimeError("requested release differs from public-core metadata")
    domain_shards = {
        domain: [
            identifiers[index:index + records_per_shard]
            for index in range(0, len(identifiers), records_per_shard)
        ]
        for domain, identifiers in entity_ids.items()
    }
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
        "profiles": list(PROFILES),
        "domains": {
            domain: {"entityCount": len(entity_ids[domain]), "shardCount": len(shards)}
            for domain, shards in domain_shards.items()
        },
        "status": "building",
    }
    if resume:
        if not state_path.is_file():
            raise RuntimeError("resume requested without a build state")
        prior = json.loads(state_path.read_text())
        comparable = {key: state[key] for key in state if key != "status"}
        if {key: prior.get(key) for key in comparable} != comparable:
            raise RuntimeError("build state does not match the requested inputs")
    else:
        write_json(state_path, state)
    receipts: dict[tuple[str, int], dict[str, Any]] = {}
    pending: list[tuple[Any, ...]] = []
    for domain, shards in domain_shards.items():
        for index, identifiers in enumerate(shards, 1):
            receipt_path = output / f"{domain}-shard-{index:05d}.json"
            if resume and receipt_path.is_file():
                receipt = json.loads(receipt_path.read_text())
                if _valid_existing_shard(receipt, output, state, domain):
                    receipts[(domain, index)] = receipt
                    continue
            pending.append((
                str(core), str(output), release, actual_core_sha256,
                domain, index, len(shards), identifiers, uri_policy_version, verify_uri_migration,
            ))
    if workers == 1:
        for values in pending:
            receipt = build_entity_shard(*values)
            key = (str(receipt["domain"]), int(receipt["shardIndex"]))
            receipts[key] = receipt
            print(
                f"complete entity LOD {key[0]} shard {key[1]}/{receipt['shardCount']}",
                flush=True,
            )
    elif pending:
        with ProcessPoolExecutor(max_workers=workers) as executor:
            futures = {
                executor.submit(build_entity_shard, *values): (values[4], values[5])
                for values in pending
            }
            for future in as_completed(futures):
                receipt = future.result()
                key = (str(receipt["domain"]), int(receipt["shardIndex"]))
                receipts[key] = receipt
                print(
                    f"complete entity LOD {key[0]} shard {key[1]}/{receipt['shardCount']}",
                    flush=True,
                )
    expected = expected_domain_coverage(core)
    domains_manifest = {}
    all_receipt_names = []
    for domain, shards in domain_shards.items():
        ordered = [receipts[(domain, index)] for index in range(1, len(shards) + 1)]
        observed = {
            key: sum(int(receipt["coverage"][key]) for receipt in ordered)
            for key in DOMAIN_COVERAGE_KEYS[domain]
        }
        if observed != expected[domain]:
            difference = {
                key: {"expected": expected[domain][key], "observed": observed[key]}
                for key in expected[domain] if expected[domain][key] != observed[key]
            }
            raise RuntimeError(f"{domain} relational coverage differs: {canonical_json(difference)}")
        profiles = {}
        for profile, profile_metadata in PROFILES.items():
            artifacts = [receipt["profiles"][profile] for receipt in ordered]
            profiles[profile] = {
                **profile_metadata,
                "syntax": "N-Triples 1.1",
                "mediaType": "application/n-triples",
                "contentEncoding": "gzip",
                "entityCount": len(entity_ids[domain]),
                "statementCount": sum(int(item["statementCount"]) for item in artifacts),
                "compressedBytes": sum(int(item["bytes"]) for item in artifacts),
                "parts": artifacts,
            }
        receipt_names = [
            f"{domain}-shard-{index:05d}.json" for index in range(1, len(shards) + 1)
        ]
        all_receipt_names.extend(receipt_names)
        domains_manifest[domain] = {
            "entityCount": len(entity_ids[domain]),
            "firstMdvsId": entity_ids[domain][0],
            "lastMdvsId": entity_ids[domain][-1],
            "ordering": "canonical MODAVIS identifier ascending",
            "coverage": {
                "expected": expected[domain], "observed": observed, "complete": True,
            },
            "profiles": profiles,
            "shards": receipt_names,
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
        "domains": domains_manifest,
        "entityCount": sum(len(values) for values in entity_ids.values()),
        "sourceOnlyBoundary": {
            "counts": source_only_boundary_counts(core),
            "disposition": (
                "Retained in the complete organ/source-evidence graphs; no canonical "
                "place or actor identity is invented for unresolved source assertions."
            ),
        },
        "determinism": {
            "gzipMtime": 0,
            "statementOrder": "domain, entity identifier, then lexical N-Triples order",
            "compressionLevel": 6,
        },
        "publication": {"zenodoUploads": 0, "deployments": 0},
    }
    write_json(output / "manifest.json", manifest)
    domain_lines = "\n".join(
        f"- {domain.replace('_', ' ').title()}: {len(entity_ids[domain]):,} entities"
        for domain in DOMAINS
    )
    write_text(output / "README.md", f"""# Complete non-organ linked-data exports for MODAVIS POD {release}

This directory contains the complete public graphs for the release's places,
actors, structured names, and virtual instruments:

{domain_lines}

The MODAVIS profile preserves the complete public relational evidence for each
domain. Place graphs include source and provider hierarchies, OSM/provider
bindings, administrative nodes, containment, coordinates, routes, and source
assertions. Actor graphs include structured names, aliases, external
identifiers, temporal assertions, organ links, source evidence, and mapped
musiXplora relations. Name graphs preserve every structured component and
actor link. Virtual-instrument graphs preserve all source payload leaves plus
availability, platform, producer, physical-instrument, technical, and organ
relation semantics. CIDOC CRM and EDM profiles provide interoperable views of
the same canonical entities.

Each profile/domain combination is split into gzip-compressed N-Triples 1.1
parts. Concatenating the decompressed parts for one combination in numeric
order produces a valid graph. Parts contain no blank nodes and can be loaded
independently. `manifest.json`, per-shard receipts, and `SHA256SUMS` bind the
files to the immutable public-core SQLite database and exact coverage totals.

Source-only actor and place assertions that have no canonical public identity
remain in the complete organ/source-evidence graphs. Their exact counts are
recorded in `manifest.json`; this export does not invent entity identities for
ambiguous or unresolved source wording.

The files contain publication-safe structured data and source references. They
do not contain media bytes, credentials, raw operational state, or restricted
source payloads. No publication or deployment is performed by the builder.
""")
    remove_appledouble(output)
    checksum_paths = [
        path for path in sorted(output.iterdir(), key=lambda item: item.name)
        if path.is_file() and not path.name.startswith("._")
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
