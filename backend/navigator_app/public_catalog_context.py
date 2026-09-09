"""Read models for the additive, publication-safe catalogue context tables."""
from __future__ import annotations

from collections import Counter
from functools import lru_cache
import json
from urllib.parse import quote

from .db import connect

SCHEMA = "release_1_5_public"
CONTRACT = "modavis.public-catalog-context/v1"
EXPORT_CONTRACT = "modavis.public-entity-export/v1"


def decoded(value, fallback):
    if isinstance(value, (dict, list)):
        return value
    return json.loads(value) if value else fallback


def catalogue_path(mdvs_id: str, kind: str) -> str:
    return f"/{kind}/{quote(mdvs_id.rsplit(':', 1)[-1], safe='-._~')}"


class PublicCatalogContext:
    def release_resource_lookup(self, operation, key):
        from .public_export_reader import _PostgresRows
        from .release_resource_reader import ReleaseResourceReader
        with connect(self.settings) as conn, conn.transaction():
            conn.execute("SET LOCAL search_path TO release_1_5_public, pg_catalog")
            conn.execute("SET LOCAL transaction_read_only = on")
            return ReleaseResourceReader(_PostgresRows(conn)._rows).lookup(operation, key)

    def _has_catalog_context(self):
        return self._metadata().get("public_catalog_context_contract") == CONTRACT

    def _has_entity_exports(self):
        from .lod import _supports_complete_entity_exports
        if (getattr(self.policy, "policy_version", None) != "2"
                and not _supports_complete_entity_exports(
                    str(getattr(self.policy, "release_version", ""))
                )):
            return False
        return self._metadata().get("public_entity_export_contract") == EXPORT_CONTRACT

    def _event_context(self, rows):
        if not rows or not self._has_catalog_context():
            return rows
        with connect(self.settings) as conn:
            contexts = conn.execute(f"SELECT * FROM {SCHEMA}.documented_event_context WHERE event_id=ANY(%(ids)s)", {"ids": [r["event_id"] for r in rows]}).fetchall()
            interpretations = {}
            if self._metadata().get("event_interpretation_contract") == "modavis.source-event-interpretation/v1":
                interpretations = {r["event_id"]: r for r in conn.execute(
                    f"SELECT * FROM {SCHEMA}.documented_event_interpretation WHERE event_id=ANY(%(ids)s)",
                    {"ids": [r["event_id"] for r in rows]}).fetchall()}
            representations = {}
            if self._metadata().get("history_configuration_evidence_contract") == "modavis.history-configuration-evidence/v1":
                for r in conn.execute(f"SELECT * FROM {SCHEMA}.documented_event_representation WHERE event_id=ANY(%(ids)s) ORDER BY representation_id", {"ids":[r["event_id"] for r in rows]}).fetchall():
                    representations.setdefault(r["event_id"], []).append(decoded(r["evidence_json"], {}))
            by_event = {r["event_id"]: r for r in contexts}
            participants = {r["event_id"]: decoded(r["participants_json"], []) for r in contexts}
            targets = sorted({p["targetId"] for values in participants.values() for p in values if p.get("targetId")})
            actors = conn.execute(f"SELECT mdvs_id,label,actor_type FROM {SCHEMA}.actor WHERE mdvs_id=ANY(%(ids)s)", {"ids": targets}).fetchall() if targets else []
        actors = {a["mdvs_id"]: a for a in actors}
        source_actor_links = self._source_actor_links([r["source_record_id"] for r in rows])
        movements = {}
        for item in self.public_relocation_movements():
            movements.setdefault(item["eventMdvsId"], []).append(item)
        from .public_relocations import movement_context
        result = []
        for row in rows:
            context = by_event.get(row["event_id"], {})
            names = []
            for index, value in enumerate(participants.get(row["event_id"], [])):
                actor = actors.get(value.get("targetId"))
                name = value.get("preferredLabel") or value.get("wording") or (actor["label"] if actor else "")
                if not name:
                    continue
                names.append({
                    "sourceWording": value.get("sourceWording") or value.get("wording"),
                    "resolutionState": value.get("resolutionState"),
                    "evidenceSpans": value.get("evidenceSpans"),
                    "nameDerivation": value.get("nameDerivation"),
                    "identityEvidence": value.get("identityEvidence"),
                    "sourceNativeEvidence": value.get("sourceNativeEvidence"),
                    "extractionContract": value.get("extractionContract"),
                    "assertionState": value.get("assertionState"),
                    "id": f"{row['event_id']}:participant:{index}",
                    "name": name, "label": name, "title": name, "mdvsId": actor["mdvs_id"] if actor else None,
                    "pageUrl": self._actor_route(actor["mdvs_id"], actor["actor_type"]) if actor else source_actor_links.get((row["source_record_id"], row["organ_mdvs_id"], name)),
                    "role": value.get("role") or "participant",
                    "activities": value.get("activities") or [value.get("role") or "participant"],
                    "evidencePath": value.get("evidencePath"), "evidenceSha256": value.get("evidenceSha256"),
                })
            places = [{"name": p.get("wording"), "role": p.get("role"), "evidencePath": p.get("evidencePath")}
                      for p in decoded(context.get("places_json"), []) if p.get("wording")]
            interpretation = interpretations.get(row["event_id"], {})
            result.append({**row, "movement": movement_context(movements.get(row["event_id"], [])), "participants": names, "places": places,
                           "description": interpretation.get("narrative"),
                           "technicalFacts": decoded(interpretation.get("technical_facts_json"), []),
                           "unresolvedAttributions": decoded(interpretation.get("unresolved_json"), []),
                           "retainedRepresentations": representations.get(row["event_id"], [])})
        return result

    @lru_cache(maxsize=1)
    def public_relocation_movements(self):
        if self._metadata().get("public_relocation_evidence_contract") != "modavis.public-relocation-evidence/v1":return []
        with connect(self.settings) as c:
            return [decoded(r["payload_json"], {}) for r in c.execute(f"select payload_json from {SCHEMA}.relocation_evidence order by activity_id").fetchall()]

    def _actor_mentions(self, mdvs_id):
        with connect(self.settings) as conn:
            rows = conn.execute(f"""
                SELECT a.source_record_id,a.source_key,a.organ_mdvs_id,o.label,s.source_url,
                       count(*)::int AS assertion_count
                FROM {SCHEMA}.organ_builder_assertion a
                JOIN {SCHEMA}.source_membership s ON s.source_record_id=a.source_record_id
                JOIN {SCHEMA}.organ o ON o.mdvs_id=a.organ_mdvs_id
                WHERE a.actor_mdvs_id=%(id)s
                GROUP BY a.source_record_id,a.source_key,a.organ_mdvs_id,o.label,s.source_url
                ORDER BY a.source_key,a.source_record_id,a.organ_mdvs_id
            """, {"id": mdvs_id}).fetchall()
        mentions = {}
        for row in rows:
            source = row["source_record_id"]
            mention = mentions.setdefault(source, {
                "sourceRecordId": source, "sourceFamily": row["source_key"].removeprefix("src:"),
                "sourceIdentifier": source.rsplit(":", 1)[-1], "sourcePageUrl": f"/source/{quote(source, safe='')}",
                "sourceUrl": row["source_url"], "relationshipCount": 0, "relatedItems": [],
            })
            mention["relationshipCount"] += row["assertion_count"]
            mention["relatedItems"].append({"label": row["label"], "url": catalogue_path(row["organ_mdvs_id"], "organs"), "kind": "Organ", "relationship": "Documented involvement"})
        return list(mentions.values())

    def get_public_place(self, identifier):
        if self._has_entity_exports():
            return self._get_enriched_public_place(identifier)
        canonical = identifier if identifier.startswith("MDVS:LOCN:") else "MDVS:LOCN:" + identifier
        with connect(self.settings) as conn:
            rows = conn.execute(f"""SELECT p.*,o.label AS organ_label,
                    c.latitude,c.longitude,c.precision,c.marker_layer,c.coordinate_source
                FROM {SCHEMA}.place_assertion p
                JOIN {SCHEMA}.organ o ON o.mdvs_id=p.organ_mdvs_id
                LEFT JOIN LATERAL (
                    SELECT * FROM {SCHEMA}.coordinate_assertion c WHERE c.organ_mdvs_id=p.organ_mdvs_id
                    AND ((p.temporal_scope='current' AND c.marker_layer IN ('current_exact','current_fallback'))
                         OR (p.temporal_scope<>'current' AND c.marker_layer='historical'))
                    ORDER BY (c.marker_layer='current_exact') DESC,c.source_organ_mdvs_id LIMIT 1
                ) c ON true
                WHERE p.place_mdvs_id=%(canonical)s OR p.assertion_id=%(id)s
                ORDER BY p.preferred_label,p.organ_mdvs_id,p.assertion_id""",
                {"id": identifier, "canonical": canonical}).fetchall()
        if not rows:
            return None
        first = rows[0]
        mdvs_id = first.get("place_mdvs_id")
        organs = {}
        for row in rows:
            organs.setdefault(row["organ_mdvs_id"], {"id": row["organ_mdvs_id"], "title": row["organ_label"],
                "url": catalogue_path(row["organ_mdvs_id"], "organs"), "scope": row["temporal_scope"],
                "source": row["source_key"].removeprefix("src:")})
        return {"id": mdvs_id or first["assertion_id"], "mdvsId": mdvs_id,
                "title": first["preferred_label"], "kind": "Place" if mdvs_id else "Source location",
                "releaseVersion": self.policy.release_version,
                "scope": "canonical_place" if mdvs_id else "source_assertion",
                "description": "Organs documented at this place." if mdvs_id else "The venue or location named by this source. Its source record is retained separately from any independently identified place.",
                "organs": list(organs.values())[:200], "organCount": len(organs),
                "coordinate": ({"latitude": first["latitude"], "longitude": first["longitude"],
                    "precision": first["precision"], "source": first["coordinate_source"]}
                    if first.get("latitude") is not None else None),
                "sources": [{"id": row["source_record_id"], "label": row["source_key"].removeprefix("src:"),
                    "url": "/source/" + quote(row["source_record_id"], safe="")} for row in rows[:200]]}

    @staticmethod
    def _public_place_hierarchy(value):
        return [
            {
                "role": item.get("role"), "value": item.get("value"),
                "language": item.get("language"),
                "evidenceLayer": item.get("evidenceLayer"),
            }
            for item in decoded(value, []) if isinstance(item, dict) and item.get("value")
        ]

    @staticmethod
    def _public_provider_references(value):
        result = []
        for item in decoded(value, []):
            if not isinstance(item, dict) or not item.get("providerPlaceId"):
                continue
            provider_id = str(item["providerPlaceId"])
            external_url = item.get("externalUrl")
            parts = provider_id.split(":")
            if len(parts) == 3 and parts[0] == "osm" and parts[1] in {"node", "way", "relation"} and parts[2].isdigit():
                external_url = f"https://www.openstreetmap.org/{parts[1]}/{parts[2]}"
            result.append({
                "provider": item.get("provider"), "identifier": provider_id,
                "providerRelease": item.get("providerRelease"),
                "matchKind": item.get("evidenceKind") or "provider_observation",
                "externalUrl": external_url,
                "identityRelation": item.get("evidenceKind") or "geocoding_match",
                "sameAs": False,
            })
        return result

    def _place_coordinate_evidence(self, identifier):
        from .coordinate_evidence import interpretations
        from .public_export_reader import _PostgresRows
        with connect(self.settings) as conn:
            conn.execute(f"SET LOCAL search_path TO {SCHEMA}, pg_catalog")
            return interpretations(_PostgresRows(conn)._rows, "place", [identifier]).get(identifier)

    def _get_enriched_public_place(self, identifier):
        requested = str(identifier or "").strip()
        canonical = requested if requested.startswith("MDVS:LOCN:") else "MDVS:LOCN:" + requested
        with connect(self.settings) as conn:
            direct = conn.execute(
                f"SELECT * FROM {SCHEMA}.place_detail WHERE mdvs_id=%(canonical)s",
                {"canonical": canonical},
            ).fetchone()
            assertion = conn.execute(
                f"""SELECT p.*,r.source_location_mdvs_id,r.canonical_target_mdvs_id
                    FROM {SCHEMA}.place_assertion p
                    LEFT JOIN {SCHEMA}.place_route r ON r.assertion_id=p.assertion_id
                    WHERE p.assertion_id=%(id)s LIMIT 1""",
                {"id": requested},
            ).fetchone()
            target_id = (
                str(direct["mdvs_id"]) if direct else
                str(assertion.get("source_location_mdvs_id") or assertion.get("canonical_target_mdvs_id") or assertion.get("place_mdvs_id") or "") if assertion else ""
            )
            detail = direct
            if not detail and target_id:
                detail = conn.execute(
                    f"SELECT * FROM {SCHEMA}.place_detail WHERE mdvs_id=%(id)s",
                    {"id": target_id},
                ).fetchone()
            rows = conn.execute(
                f"""SELECT p.*,r.route_id,r.route_kind,r.source_location_mdvs_id,
                           r.canonical_target_mdvs_id,o.label AS organ_label
                    FROM {SCHEMA}.place_assertion p
                    JOIN {SCHEMA}.place_route r ON r.assertion_id=p.assertion_id
                    LEFT JOIN {SCHEMA}.organ o ON o.mdvs_id=p.organ_mdvs_id
                    WHERE p.assertion_id=%(requested)s
                       OR r.source_location_mdvs_id=%(target)s
                       OR r.canonical_target_mdvs_id=%(target)s
                       OR p.place_mdvs_id=%(target)s
                    ORDER BY p.preferred_label,p.organ_mdvs_id,p.assertion_id""",
                {"requested": requested, "target": target_id or canonical},
            ).fetchall()
        if not detail and not rows:
            return None
        first = detail or rows[0]
        mdvs_id = str(detail["mdvs_id"]) if detail else (target_id or rows[0].get("place_mdvs_id"))
        organs = {}
        for row in rows:
            if not row.get("organ_mdvs_id"):
                continue
            organs.setdefault(row["organ_mdvs_id"], {
                "id": row["organ_mdvs_id"], "title": row.get("organ_label") or row["organ_mdvs_id"],
                "url": catalogue_path(row["organ_mdvs_id"], "organs"), "scope": row["temporal_scope"],
                "source": row["source_key"].removeprefix("src:"),
            })
        source_hierarchy = self._public_place_hierarchy(detail.get("source_hierarchy_json") if detail else None)
        provider_hierarchy = self._public_place_hierarchy(detail.get("provider_hierarchy_json") if detail else None)
        provider_references = self._public_provider_references(detail.get("provider_bindings_json") if detail else None)
        variants = [
            {"name": item.get("name"), "kind": item.get("nameKind"), "language": item.get("language"), "evidenceLayer": item.get("evidenceLayer")}
            for item in decoded(detail.get("name_variants_json") if detail else None, [])
            if isinstance(item, dict) and item.get("name")
        ]
        coordinate_evidence = self._place_coordinate_evidence(mdvs_id)
        coordinate = None
        if detail and detail.get("latitude") is not None and detail.get("longitude") is not None:
            coordinate = {
                "latitude": float(detail["latitude"]), "longitude": float(detail["longitude"]),
                "precision": (coordinate_evidence or {}).get("precision", detail.get("coordinate_state") or "recorded"),
                "source": detail.get("coordinate_source"),
                "confidence": detail.get("coordinate_confidence"),
            }
        sources = {}
        for row in rows:
            sources.setdefault(row["source_record_id"], {
                "id": row["source_record_id"], "label": row["source_key"].removeprefix("src:"),
                "url": "/source/" + quote(row["source_record_id"], safe=""),
            })
        title = (detail.get("preferred_name") if detail else None) or first.get("preferred_label") or mdvs_id
        return {
            "id": mdvs_id or requested, "mdvsId": mdvs_id, "canonicalUri": detail.get("canonical_uri") if detail else None,
            "title": title, "kind": detail.get("place_kind") or first.get("place_kind") or "Place",
            "releaseVersion": self.policy.release_version,
            "scope": "identified_place" if detail else "source_assertion",
            "description": "A source-identified place with separately attributed source and geocoding evidence.",
            "identity": {
                "status": "existing_modavis_identifier" if mdvs_id else "source_assertion",
                "requestedIdentifier": requested, "canonicalMdvsId": mdvs_id,
                "providerIdentifiersAreIdentityClaims": False,
            },
            "names": variants, "sourceHierarchy": source_hierarchy,
            "providerHierarchy": provider_hierarchy, "providerReferences": provider_references,
            "coordinateEvidence": coordinate_evidence,
            "administrativeNodes": decoded(detail.get("administrative_nodes_json") if detail else None, []),
            "coordinate": coordinate, "enrichmentOutcome": detail.get("enrichment_outcome") if detail else None,
            "organs": list(organs.values())[:200], "organCount": len(organs),
            "sources": list(sources.values())[:200],
            "export": self.entity_export_manifest("place", mdvs_id) if mdvs_id else None,
        }

    def get_public_source(self, identifier):
        with connect(self.settings) as conn:
            row = conn.execute(f"""SELECT s.*,o.label AS organ_label
                FROM {SCHEMA}.source_membership s JOIN {SCHEMA}.organ o ON o.mdvs_id=s.organ_mdvs_id
                WHERE s.source_record_id=%(id)s""", {"id": identifier}).fetchone()
            if not row:
                return None
            counts = conn.execute(f"""SELECT
                (SELECT count(*)::int FROM {SCHEMA}.documented_event WHERE organ_mdvs_id=%(organ)s AND source_record_id=%(id)s) AS events,
                (SELECT count(*)::int FROM {SCHEMA}.specification_component WHERE organ_mdvs_id=%(organ)s AND source_record_id=%(id)s) AS components,
                (SELECT count(*)::int FROM {SCHEMA}.technical_fact WHERE organ_mdvs_id=%(organ)s AND source_record_id=%(id)s) AS facts""", {"id": identifier, "organ": row["organ_mdvs_id"]}).fetchone()
        return {"id": identifier, "title": row.get("collection_title") or row["source_key"].removeprefix("src:"),
                "sourceIdentifier": row["native_identifier"], "sourceUrl": row.get("source_url"),
                "organ": {"id": row["organ_mdvs_id"], "title": row["organ_label"], "url": catalogue_path(row["organ_mdvs_id"], "organs")},
                "counts": counts, "releaseVersion": self.policy.release_version,
                "structuredJsonUrl": f"/api/public/sources/{quote(identifier, safe='')}/structured.json" if self._has_entity_exports() else None}

    def get_public_source_projection(self, identifier):
        if not self._has_entity_exports():
            return None
        with connect(self.settings) as conn:
            metadata = conn.execute(
                f"SELECT * FROM {SCHEMA}.public_source_record_metadata WHERE source_record_id=%(id)s",
                {"id": identifier},
            ).fetchone()
            membership = conn.execute(
                f"SELECT * FROM {SCHEMA}.source_membership WHERE source_record_id=%(id)s",
                {"id": identifier},
            ).fetchone()
            if not metadata or not membership:
                return None
            organ = conn.execute(
                f"SELECT mdvs_id,label,canonical_uri FROM {SCHEMA}.organ WHERE mdvs_id=%(id)s",
                {"id": membership["organ_mdvs_id"]},
            ).fetchone()
            components = conn.execute(
                f"""SELECT component_id,component_type,label,division_label,
                           pitch_label,terminal_outcome,occurrence_count,detail_json,
                           evidence_sha256,decision_sha256
                    FROM {SCHEMA}.specification_component
                    WHERE source_record_id=%(id)s ORDER BY component_type,component_id""",
                {"id": identifier},
            ).fetchall()
            facts = conn.execute(
                f"""SELECT fact_id,family,label,display_value,normalized_number,
                           support_state,conflict_state,row_sha256
                    FROM {SCHEMA}.technical_fact WHERE source_record_id=%(id)s
                    ORDER BY family,fact_id""",
                {"id": identifier},
            ).fetchall()
            events = conn.execute(
                f"""SELECT event_id,source_event_type,controlled_event_type,concept_code,
                           mapping_kind,source_only,date_values_json,row_sha256
                    FROM {SCHEMA}.documented_event WHERE source_record_id=%(id)s
                    ORDER BY event_id""",
                {"id": identifier},
            ).fetchall()
            places = conn.execute(
                f"""SELECT p.assertion_id,p.preferred_label,p.place_kind,p.temporal_scope,
                           p.relation_role,p.coordinate_state,r.source_location_mdvs_id,
                           r.canonical_target_mdvs_id,p.row_sha256
                    FROM {SCHEMA}.place_assertion p LEFT JOIN {SCHEMA}.place_route r USING(assertion_id)
                    WHERE p.source_record_id=%(id)s ORDER BY p.assertion_id""",
                {"id": identifier},
            ).fetchall()
            builders = conn.execute(
                f"""SELECT a.assertion_id,a.source_label,a.preferred_label,a.actor_type,
                           a.relation_role,a.resolution_state,a.actor_mdvs_id,
                           actor.label AS actor_label,a.row_sha256
                    FROM {SCHEMA}.organ_builder_assertion a
                    LEFT JOIN {SCHEMA}.actor actor ON actor.mdvs_id=a.actor_mdvs_id
                    WHERE a.source_record_id=%(id)s ORDER BY a.assertion_id""",
                {"id": identifier},
            ).fetchall()
            media = conn.execute(
                f"""SELECT media_id,media_kind,media_url,title,source_credit,copyright_notice,
                           dates_json,filename,availability_state,delivery_state,row_sha256
                    FROM {SCHEMA}.public_media_reference WHERE source_record_id=%(id)s
                    ORDER BY media_kind,media_index,media_id""",
                {"id": identifier},
            ).fetchall()
        components = [dict(item) for item in components]
        facts = [dict(item) for item in facts]
        events = [dict(item) for item in events]
        places = [dict(item) for item in places]
        builders = [dict(item) for item in builders]
        media = [dict(item) for item in media]
        for item in components:
            item["detail_json"] = decoded(item.get("detail_json"), {})
        for item in events:
            item["date_values_json"] = decoded(item.get("date_values_json"), [])
        for item in media:
            item["dates_json"] = decoded(item.get("dates_json"), [])
        return {
            "$schema": self.policy.public_source_projection_schema_uri(),
            "contract": "modavis.public-source-projection/v1",
            "datasetVersion": self.policy.release_version,
            "source": {
                "recordId": metadata["source_record_id"], "key": metadata["source_key"],
                "nativeIdentifier": metadata.get("native_identifier"), "url": metadata.get("source_url"),
                "recordType": metadata.get("record_type"),
                "schema": {"key": metadata.get("schema_key"), "version": metadata.get("schema_version"), "hash": metadata.get("schema_hash")},
                "payloadSha256": metadata.get("payload_sha256"),
                "availableSections": decoded(metadata.get("section_manifest_json"), {}),
            },
            "entity": {"mdvsId": organ["mdvs_id"], "canonicalUri": organ["canonical_uri"], "label": organ["label"], "type": "pipe_organ"},
            "structured": {
                "builders": builders, "places": places, "events": events,
                "specifications": components, "technicalFacts": facts, "mediaReferences": media,
            },
            "rightsBoundary": {
                "rawPayloadIncluded": False, "sourceProseIncluded": False,
                "mediaBytesIncluded": False, "reviewOrWorkflowStateIncluded": False,
            },
        }

    def get_organ_media_bundle(self, organ_id):
        if not self._has_entity_exports():
            return self.empty_media_bundle()
        resolved = self._resolve_organ_mdvs_id(organ_id)
        if not resolved:
            return None
        with connect(self.settings) as conn:
            rows = conn.execute(
                f"""SELECT * FROM {SCHEMA}.public_media_reference
                    WHERE organ_mdvs_id=%(id)s ORDER BY
                    CASE media_kind WHEN 'image' THEN 0 WHEN 'video' THEN 1
                         WHEN 'audio' THEN 2 ELSE 3 END,source_key,media_index,media_id""",
                {"id": resolved[0]},
            ).fetchall()
        items = [{
            "id": row["media_id"], "mediaReferenceId": row["media_id"],
            "title": row.get("title") or f"{row['media_kind'].title()} reference",
            "kind": row["media_kind"], "url": row.get("media_url"), "thumbnailUrl": None,
            "status": row["availability_state"], "deliveryState": row["delivery_state"],
            "sourceRecordId": row["source_record_id"], "sourcePath": f"media.{row['media_kind']}",
            "source": row["source_key"], "sourceUrl": row.get("source_url"),
            "sourceCredit": row.get("source_credit"), "copyrightNotice": row.get("copyright_notice"),
            "dates": decoded(row.get("dates_json"), []), "filename": row.get("filename"),
            "hasByteBridge": False,
        } for row in rows]
        return {"media": items, "derivativeAssets": [], "items": items, "total": len(items),
                "rightsBoundary": {"mediaBytesIncluded": False, "remoteResourcesLoadOnlyAfterUserAction": True}}

    def complete_entity_export_record(self, kind, identifier):
        """Return an untruncated public record for linked-data serialization."""
        if self.policy.policy_version == "2":
            from .public_export_reader import complete_public_record
            with connect(self.settings) as connection:
                return complete_public_record(connection, kind, identifier)

        if kind in {"person", "organization"}:
            record = self.get_actor(identifier)
            if not record:
                return None
            actor_id = record["mdvsId"]
            with connect(self.settings) as conn:
                names = conn.execute(f"""SELECT n.* FROM {SCHEMA}.actor_name an
                    JOIN {SCHEMA}.structured_name n ON n.name_mdvs_id=an.name_mdvs_id
                    WHERE an.actor_mdvs_id=%(id)s ORDER BY n.name_mdvs_id""", {"id": actor_id}).fetchall()
                aliases = conn.execute(f"SELECT * FROM {SCHEMA}.actor_alias WHERE canonical_mdvs_id=%(id)s ORDER BY alias_mdvs_id", {"id": actor_id}).fetchall()
                suppressions = conn.execute(f"SELECT * FROM {SCHEMA}.actor_suppression WHERE canonical_mdvs_id=%(id)s ORDER BY source_mdvs_id", {"id": actor_id}).fetchall()
                links = conn.execute(f"""SELECT b.*,o.label AS organ_label FROM {SCHEMA}.organ_builder b
                    JOIN {SCHEMA}.organ o ON o.mdvs_id=b.organ_mdvs_id
                    WHERE b.actor_mdvs_id=%(id)s ORDER BY b.organ_mdvs_id""", {"id": actor_id}).fetchall()
                assertions = conn.execute(f"""SELECT a.*,o.label AS organ_label,m.source_url
                    FROM {SCHEMA}.organ_builder_assertion a
                    LEFT JOIN {SCHEMA}.organ o ON o.mdvs_id=a.organ_mdvs_id
                    LEFT JOIN {SCHEMA}.public_source_record_metadata m ON m.source_record_id=a.source_record_id
                    WHERE a.actor_mdvs_id=%(id)s ORDER BY a.assertion_id""", {"id": actor_id}).fetchall()
                relations = conn.execute(f"""SELECT r.*,o.label AS organ_label,m.source_key,m.source_url
                    FROM {SCHEMA}.organ_builder_relation r
                    JOIN {SCHEMA}.organ o ON o.mdvs_id=r.organ_mdvs_id
                    LEFT JOIN {SCHEMA}.public_source_record_metadata m ON m.source_record_id=r.source_record_id
                    WHERE r.actor_mdvs_id=%(id)s ORDER BY r.relation_id""", {"id": actor_id}).fetchall()
                mxp = conn.execute(f"""SELECT r.*,source.actor_mdvs_id AS source_actor_mdvs_id,
                           target.actor_mdvs_id AS target_actor_mdvs_id
                    FROM {SCHEMA}.musixplora_relation r
                    LEFT JOIN {SCHEMA}.actor_external_identifier source
                      ON source.scheme_code='extidtype:musixplora' AND source.identifier_value=r.source_mxp_id
                    LEFT JOIN {SCHEMA}.actor_external_identifier target
                      ON target.scheme_code='extidtype:musixplora' AND target.identifier_value=r.target_mxp_id
                    WHERE source.actor_mdvs_id=%(id)s OR target.actor_mdvs_id=%(id)s
                    ORDER BY r.edge_id""", {"id": actor_id}).fetchall()
            record["profile"]["names"] = [{
                "mdvsId": row["name_mdvs_id"], "canonicalUri": row["canonical_uri"],
                "value": row["display_name"], "displayName": row["display_name"],
                "givenName": row.get("given_name"), "middleNames": row.get("middle_names"),
                "familyName": row.get("family_name"), "particle": row.get("particle"),
                "prefix": row.get("prefix"), "suffix": row.get("suffix"),
                "abbreviation": row.get("abbreviation"), "romanization": row.get("romanization"),
                "transliteration": row.get("transliteration"),
                "isNative": bool(row["is_native"]) if row.get("is_native") is not None else None,
                "verificationScore": row.get("verification_score"),
            } for row in names]
            record["identityAliases"] = [{
                "mdvsId": row["alias_mdvs_id"], "aliasUri": row["alias_uri"],
                "label": row.get("alias_label"), "projectionId": row["projection_id"],
                "evidenceSha256": row.get("evidence_sha256"),
            } for row in aliases]
            record["identitySuppressions"] = [{
                "mdvsId": row["source_mdvs_id"], "outcome": row["outcome"],
                "projectionId": row["projection_id"], "evidenceSha256": row.get("evidence_sha256"),
            } for row in suppressions]
            record["relationships"] = [{
                "id": f"{actor_id}:{row['organ_mdvs_id']}", "mdvsId": row["organ_mdvs_id"],
                "label": row["organ_label"], "relationType": "builder_of",
                "assertionCount": row["assertion_count"], "relationCount": row["relation_count"],
            } for row in links]
            record["builderAssertions"] = [{
                "id": row["assertion_id"], "organMdvsId": row.get("organ_mdvs_id"),
                "organLabel": row.get("organ_label"), "sourceLabel": row.get("source_label"),
                "preferredLabel": row.get("preferred_label"), "actorType": row.get("actor_type"),
                "relationRole": row.get("relation_role"), "resolutionState": row.get("resolution_state"),
                "sourceRecordId": row.get("source_record_id"), "sourcePath": "builders",
            } for row in assertions]
            record["organRelations"] = [{
                "id": row["relation_id"], "organMdvsId": row["organ_mdvs_id"],
                "organLabel": row["organ_label"], "sourceRecordId": row.get("source_record_id"),
                "confidence": row.get("confidence"), "rowHash": row.get("row_hash"),
            } for row in relations]
            record["musiXploraRelations"] = [{
                "id": row["edge_id"], "sourceMxpId": row["source_mxp_id"],
                "targetMxpId": row["target_mxp_id"],
                "sourceActorMdvsId": row.get("source_actor_mdvs_id"),
                "targetActorMdvsId": row.get("target_actor_mdvs_id"),
                "roleCode": row.get("role_code"), "roleLabel": row.get("role_label"),
                "generation": row.get("generation"), "generationLabel": row.get("generation_label"),
                "relationCategory": row["relation_category"],
                "canonicalRelationType": row["canonical_relation_type"],
                "priorRelationCategory": row.get("prior_relation_category"),
                "decisionState": row["decision_state"], "evidenceSha256": row["evidence_sha256"],
            } for row in mxp]
            sources = {}
            for row in [*assertions, *relations]:
                if row.get("source_record_id"):
                    sources[row["source_record_id"]] = {
                        "id": row["source_record_id"], "source": row.get("source_key"),
                        "url": row.get("source_url"),
                    }
            record["sources"] = list(sources.values())
            return record
        if kind == "place":
            record = self.get_public_place(identifier)
            if not record or not record.get("mdvsId"):
                return record
            place_id = record["mdvsId"]
            with connect(self.settings) as conn:
                detail = conn.execute(f"SELECT * FROM {SCHEMA}.place_detail WHERE mdvs_id=%(id)s", {"id": place_id}).fetchone()
                assertions = conn.execute(f"""SELECT p.*,r.route_id,r.route_kind,r.source_location_mdvs_id,
                           r.canonical_target_mdvs_id,r.canonical_status,o.label AS organ_label,m.source_url
                    FROM {SCHEMA}.place_assertion p JOIN {SCHEMA}.place_route r USING(assertion_id)
                    LEFT JOIN {SCHEMA}.organ o ON o.mdvs_id=p.organ_mdvs_id
                    LEFT JOIN {SCHEMA}.public_source_record_metadata m ON m.source_record_id=p.source_record_id
                    WHERE r.source_location_mdvs_id=%(id)s OR r.canonical_target_mdvs_id=%(id)s
                       OR p.place_mdvs_id=%(id)s ORDER BY p.assertion_id""", {"id": place_id}).fetchall()
            if not detail:
                return record
            bindings = decoded(detail.get("provider_bindings_json"), [])
            provider_references = []
            for item in bindings:
                if not isinstance(item, dict):
                    continue
                value = dict(item)
                provider_id = str(item.get("providerPlaceId") or "")
                parts = provider_id.split(":")
                if len(parts) == 3 and parts[0] == "osm" and parts[1] in {"node", "way", "relation"} and parts[2].isdigit():
                    value["externalUrl"] = f"https://www.openstreetmap.org/{parts[1]}/{parts[2]}"
                provider_references.append(value)
            record.update({
                "placeType": detail.get("place_kind"),
                "enrichmentOutcome": detail.get("enrichment_outcome"),
                "coordinate": {
                    "latitude": detail.get("latitude"), "longitude": detail.get("longitude"),
                    "precision": (record.get("coordinateEvidence") or {}).get("precision", detail.get("coordinate_state")), "source": detail.get("coordinate_source"),
                    "confidence": detail.get("coordinate_confidence"),
                },
                "nameVariants": decoded(detail.get("name_variants_json"), []),
                "sourceHierarchy": decoded(detail.get("source_hierarchy_json"), []),
                "providerHierarchy": decoded(detail.get("provider_hierarchy_json"), []),
                "providerReferences": provider_references,
                "administrativeNodes": decoded(detail.get("administrative_nodes_json"), []),
                "containmentRelations": decoded(detail.get("containment_relations_json"), []),
                "evidenceSha256": detail.get("evidence_sha256"), "rowSha256": detail.get("row_sha256"),
            })
            record["placeAssertions"] = [{
                "id": row["assertion_id"], "organMdvsId": row.get("organ_mdvs_id"),
                "organLabel": row.get("organ_label"), "activityMdvsId": row.get("activity_mdvs_id"),
                "preferredLabel": row.get("preferred_label"), "placeKind": row.get("place_kind"),
                "temporalScope": row.get("temporal_scope"), "relationRole": row.get("relation_role"),
                "coordinateState": row.get("coordinate_state"), "sourceRecordId": row.get("source_record_id"),
                "sourceKey": row.get("source_key"), "routeId": row.get("route_id"),
                "routeKind": row.get("route_kind"), "sourceLocationMdvsId": row.get("source_location_mdvs_id"),
                "canonicalTargetMdvsId": row.get("canonical_target_mdvs_id"),
                "canonicalStatus": row.get("canonical_status"), "sourcePath": "locations",
            } for row in assertions]
            record["sources"] = list({row["source_record_id"]: {
                "id": row["source_record_id"], "source": row.get("source_key"), "url": row.get("source_url"),
            } for row in assertions if row.get("source_record_id")}.values())
            return record
        if kind == "name":
            record = self.get_structured_name(identifier)
            if not record:
                return None
            with connect(self.settings) as conn:
                row = conn.execute(f"SELECT * FROM {SCHEMA}.structured_name WHERE name_mdvs_id=%(id)s", {"id": record["mdvsId"]}).fetchone()
            if row:
                record["nameComponents"] = {
                    "givenName": row.get("given_name"), "middleNames": row.get("middle_names"),
                    "familyName": row.get("family_name"), "particle": row.get("particle"),
                    "prefix": row.get("prefix"), "suffix": row.get("suffix"),
                }
                record["rowHash"] = row.get("row_hash")
            return record
        if kind == "virtual_instrument":
            record = self.get_virtual_instrument(identifier)
            if not record:
                return None
            with connect(self.settings) as conn:
                row = conn.execute(f"""SELECT v.*,d.payload_json,d.source_evidence_sha256,
                           d.row_sha256 AS detail_row_sha256 FROM {SCHEMA}.virtual_instrument v
                    LEFT JOIN {SCHEMA}.virtual_instrument_detail d ON d.vmi_mdvs_id=v.mdvs_id
                    WHERE v.mdvs_id=%(id)s""", {"id": record["id"]}).fetchone()
            if row:
                payload = decoded(row.get("payload_json"), {})
                record.update({
                    "sourcePayload": payload, "relationConfidence": row.get("relation_confidence"),
                    "firstObservedAt": row.get("first_observed_at"), "lastObservedAt": row.get("last_observed_at"),
                    "rowHash": row.get("row_hash"), "sourceEvidenceSha256": row.get("source_evidence_sha256"),
                    "detailRowSha256": row.get("detail_row_sha256"),
                })
                evidence = record.get("evidence") or {}
                record["sources"] = [{
                    "id": f"vmi-source:{evidence.get('sourceKey') or 'catalog'}:{record['id']}",
                    "source": evidence.get("sourceKey") or "virtual instrument catalog",
                    "url": evidence.get("sourceUrl"),
                }] if evidence else []
            return record
        return None

    def entity_export_manifest(self, kind, mdvs_id):
        if not self._has_entity_exports() or not mdvs_id:
            return None
        family = "location" if kind == "place" else "name" if kind == "name" else "entity"
        token = str(mdvs_id).rsplit(":", 1)[-1]
        root = f"/dataset/pod/version/{self.policy.release_version}/{family}/{quote(token, safe='-._~')}"
        profiles = ["modavis", "cidoc", "edm"] + (["pon"] if kind == "organ" else [])
        formats = [
            {"key": "jsonld", "label": "JSON-LD", "mediaType": "application/ld+json", "extension": "jsonld"},
            {"key": "turtle", "label": "Turtle", "mediaType": "text/turtle", "extension": "ttl"},
            {"key": "ntriples", "label": "N-Triples", "mediaType": "application/n-triples", "extension": "nt"},
            {"key": "rdfxml", "label": "RDF/XML", "mediaType": "application/rdf+xml", "extension": "rdf"},
        ]
        page_kind = {
            "organ": "organs", "person": "people", "organization": "organizations",
            "place": "places", "virtual_instrument": "virtual-instruments", "name": "names",
        }.get(kind, "entities")
        datasheet_url = catalogue_path(str(mdvs_id), page_kind)
        datasheet_url += "?tab=export"
        return {
            "contract": EXPORT_CONTRACT, "entityKind": kind, "mdvsId": mdvs_id,
            "datasheetUrl": datasheet_url,
            "native": [{**fmt, "url": f"{root}.modavis.{fmt['extension']}"} for fmt in formats],
            "profiles": [{
                "key": profile,
                "label": {"modavis": "MODAVIS Ontology Network", "cidoc": "CIDOC CRM", "pon": "Polifonia Ontology Network", "edm": "Europeana Data Model"}[profile],
                "format": "RDF/XML" if profile == "edm" else "JSON-LD",
                "mediaType": "application/rdf+xml" if profile == "edm" else "application/ld+json",
                "url": f"{root}.{profile}.{'xml' if profile == 'edm' else 'jsonld'}",
            } for profile in profiles],
            "sourceDataUrl": f"/api/exports/{kind}/{quote(str(mdvs_id), safe='')}/sources",
            "versioned": True,
        }

    def get_entity_source_exports(self, kind, identifier):
        if not self._has_entity_exports():
            return None
        if kind == "organ":
            resolved = self._resolve_organ_mdvs_id(identifier)
            if not resolved:
                return None
            with connect(self.settings) as conn:
                rows = conn.execute(
                    f"""SELECT metadata.* FROM {SCHEMA}.source_membership membership
                        JOIN {SCHEMA}.public_source_record_metadata metadata
                          ON metadata.source_record_id=membership.source_record_id
                        WHERE membership.organ_mdvs_id=%(id)s
                        ORDER BY metadata.source_key,metadata.source_record_id""",
                    {"id": resolved[0]},
                ).fetchall()
            items = [{
                "sourceRecordId": row["source_record_id"], "sourceKey": row["source_key"],
                "nativeIdentifier": row.get("native_identifier"), "sourceUrl": row.get("source_url"),
                "schemaKey": row.get("schema_key"), "schemaVersion": row.get("schema_version"),
                "payloadSha256": row.get("payload_sha256"),
                "availableSections": decoded(row.get("section_manifest_json"), {}),
                "structuredJsonUrl": f"/api/public/sources/{quote(row['source_record_id'], safe='')}/structured.json",
            } for row in rows]
            return {"contract": EXPORT_CONTRACT, "entityKind": kind, "mdvsId": resolved[0], "items": items, "total": len(items),
                    "rightsBoundary": {"rawPayloadIncluded": False, "sourceProseIncluded": False}}
        if kind in {"person", "organization"}:
            resolved = self._resolve_actor_mdvs_id(identifier)
            if not resolved:
                return None
            with connect(self.settings) as conn:
                identifiers = conn.execute(
                    f"SELECT * FROM {SCHEMA}.actor_external_identifier WHERE actor_mdvs_id=%(id)s ORDER BY scheme_code,identifier_value",
                    {"id": resolved[0]},
                ).fetchall()
                dates = conn.execute(
                    f"SELECT * FROM {SCHEMA}.actor_temporal_assertion WHERE actor_mdvs_id=%(id)s ORDER BY start_year NULLS LAST,temporality_mdvs_id",
                    {"id": resolved[0]},
                ).fetchall()
            grouped = {}
            for row in identifiers:
                source = str(row["scheme_code"] or "identifier").casefold()
                grouped.setdefault(source, {"sourceKey": source, "identifiers": [], "temporalAssertions": [dict(item) for item in dates]})
                grouped[source]["identifiers"].append(dict(row))
            items = list(grouped.values())
            return {"contract": EXPORT_CONTRACT, "entityKind": kind, "mdvsId": resolved[0], "items": items, "total": len(items),
                    "rightsBoundary": {"rawPayloadIncluded": False, "sourceProseIncluded": False}}
        if kind == "place":
            place = self.get_public_place(identifier)
            if not place:
                return None
            items = [{**item, "structuredJsonUrl": f"/api/public/sources/{quote(item['id'], safe='')}/structured.json"} for item in place.get("sources") or []]
            return {"contract": EXPORT_CONTRACT, "entityKind": kind, "mdvsId": place.get("mdvsId"), "items": items, "total": len(items),
                    "rightsBoundary": {"rawPayloadIncluded": False, "sourceProseIncluded": False}}
        return {"contract": EXPORT_CONTRACT, "entityKind": kind, "mdvsId": identifier, "items": [], "total": 0,
                "rightsBoundary": {"rawPayloadIncluded": False, "sourceProseIncluded": False}}

    def _literature_access_links(self, identifier):
        if not self._has_catalog_context():
            return []
        with connect(self.settings) as conn:
            rows = conn.execute(f"SELECT url,link_kind,provider,verified_at FROM {SCHEMA}.literature_access_link WHERE literature_id=%(id)s ORDER BY CASE WHEN link_kind='public_pdf' THEN 0 ELSE 1 END,link_id", {"id": identifier}).fetchall()
        return [{"url": row["url"], "label": "Open digitized page" if row["link_kind"] == "iiif_viewer" else "Read or download PDF", "kind": row["link_kind"],
                 "verifiedAt": row["verified_at"], "access": "public"} for row in rows]

    @lru_cache(maxsize=1)
    def _public_vocabulary(self):
        if not self._has_catalog_context():
            return []
        with connect(self.settings) as conn:
            rows = conn.execute(f"SELECT payload_json FROM {SCHEMA}.vocabulary_concept ORDER BY scheme_code,concept_code").fetchall()
        concepts = [decoded(row["payload_json"], {}) for row in rows]
        for concept in concepts:
            concept.update(publicProjection=True, datasetVersion=self.policy.release_version, recordKind="governed_concept")
            # Language metadata comes from the frozen authoritative registry
            # projection. Numeric IDs alone cannot establish a language here.
            concept.setdefault("sourceMappingCount", None)
            concept.setdefault("mappingEvidenceState", "not_included")
        return concepts

    def public_vocabulary_schemes(self):
        groups = {}
        for concept in self._public_vocabulary():
            scheme = concept["scheme"]
            group = groups.setdefault(scheme["code"], {**scheme, "conceptCount": 0, "recordKind": "governed_scheme", "mappingCount": 0, "categoryCount": 0})
            group["conceptCount"] += 1
            if concept.get("sourceMappingCount") is None:
                group["mappingCount"] = None
            elif group["mappingCount"] is not None:
                group["mappingCount"] += concept["sourceMappingCount"]
            group["mappingEvidenceState"] = concept.get("mappingEvidenceState", "not_included")
            group["snapshot"] = {"metadataUrl": f"/api/vocab/snapshots/{scheme['code']}", "downloadBase": f"/api/vocab/snapshots/{scheme['code']}"}
        groups["modavis_entity_types"] = {"code": "modavis_entity_types", "name": "Public entity types", "version": self.policy.release_version, "conceptCount": 0, "categoryCount": 2, "mappingCount": None, "recordKind": "schema_categories", "description": "Person and organisation categories in the public schema; these are not governed vocabulary concepts."}
        return {"items": list(groups.values()), "total": len(groups)}

    def public_vocabulary_concepts(self, *, scheme=None, query="", limit=200, offset=0):
        values = self._public_vocabulary() + [self.public_vocabulary_concept(code) for code in ("person", "organization")]
        if scheme:
            values = [v for v in values if v["scheme"]["code"] == scheme]
        if query:
            values = [v for v in values if query.casefold() in " ".join([*(str(v.get(key) or "") for key in ("preferredLabel", "code", "definition")), *(str(label.get(key) or "") for label in v.get("labels", []) for key in ("label", "languageCode", "languageName", "languageEndonym"))]).casefold()]
        return {"items": values[offset:offset+limit], "total": len(values), "limit": limit, "offset": offset}

    def public_vocabulary_concept(self, identifier, *, scheme=None):
        if identifier in {"person", "organization"} and scheme in {None, "modavis_entity_types"}:
            # These are the public schema's record categories, not newly minted
            # SKOS identities. No identifier is invented for the registry entry.
            return {"code": identifier, "publicProjection": True, "recordKind": "schema_category", "sourceMappingCount": None, "datasetVersion": self.policy.release_version, "preferredLabel": "Person" if identifier == "person" else "Organisation",
                    "definition": "A person represented in the public actor catalogue." if identifier == "person" else "An organisation, company or workshop represented in the public actor catalogue.",
                    "scheme": {"code": "modavis_entity_types", "name": "Public entity types", "version": self.policy.release_version}, "labels": []}
        values = self._public_vocabulary()
        direct = [v for v in values if identifier in {v["code"], v.get("mdvsId")} and (not scheme or v["scheme"]["code"] == scheme)]
        if len(direct) == 1:
            return {**direct[0], "publicEventUsage": self.public_vocabulary_event_usage(direct[0]['code'])}
        # Historical event URLs used the projection's display type. Resolve
        # only the governed mappings actually retained by the release.
        with connect(self.settings) as conn:
            rows = conn.execute(f"""SELECT DISTINCT concept_code FROM {SCHEMA}.documented_event
                WHERE controlled_event_type=%(id)s AND source_only=0 AND concept_code NOT LIKE 'source-only:%%'""", {"id": identifier}).fetchall()
        codes = {row["concept_code"] for row in rows}
        matches = [v for v in values if (v["code"] in codes or v.get("mdvsId") in codes) and (not scheme or v["scheme"]["code"] == scheme)]
        return matches[0] if len(matches) == 1 else None

    @lru_cache(maxsize=1)
    def _public_vocabulary_event_usage(self):
        with connect(self.settings) as conn:
            return conn.execute(f"""SELECT coalesce(c.concept_code,m.concept_code,e.concept_code) AS concept_code,
                e.source_key,e.source_event_type,e.mapping_kind,count(*) AS occurrence_count,
                count(DISTINCT e.source_record_id) AS source_record_count,
                (array_agg(e.event_id ORDER BY e.event_id))[1:5] AS event_ids
                FROM {SCHEMA}.documented_event e
                LEFT JOIN {SCHEMA}.vocabulary_concept c ON c.concept_code=e.concept_code
                LEFT JOIN {SCHEMA}.vocabulary_concept m ON m.mdvs_id=e.concept_code
                WHERE e.source_only=0
                GROUP BY 1,e.source_key,e.source_event_type,e.mapping_kind ORDER BY 1,e.source_key,e.source_event_type,e.mapping_kind""").fetchall()

    def public_vocabulary_event_usage(self, code):
        identities = {code} | {c['mdvsId'] for c in self._public_vocabulary() if c['code'] == code and c.get('mdvsId')}
        rows = [r for r in self._public_vocabulary_event_usage() if r['concept_code'] in identities]
        return {"scope": "Current public documented-event mappings. These are processing assertions, separate from the authoritative source-term mapping registry.",
                "occurrenceCount": sum(r['occurrence_count'] for r in rows), "groupCount": len(rows), "groupsLimited": len(rows) > 30,
                "groups": [{"sourceKey": r['source_key'], "sourceWording": r['source_event_type'], "mappingKind": r['mapping_kind'],
                            "occurrenceCount": r['occurrence_count'], "sourceRecordCount": r['source_record_count'],
                            "eventUrls": [f"/events/{quote(event_id, safe='')}" for event_id in r['event_ids']]} for r in rows[:30]]}

    def public_vocabulary_snapshot(self, scheme):
        from .public_vocabulary import snapshot
        return snapshot([{**c, 'publicEventUsage': self.public_vocabulary_event_usage(c['code'])} for c in self._public_vocabulary() if c['scheme']['code'] == scheme], scheme)

    def public_vocabulary_source_term(self, identifier):
        matches = [(concept, mapping) for concept in self._public_vocabulary() for mapping in concept.get('sourceTermMappings', [])
                   if mapping.get('sourceTerm', {}).get('mdvsId') == identifier]
        if not matches:
            return None
        return {**matches[0][1]['sourceTerm'], 'mappingCount': len(matches),
                'mappings': [{**m, 'concept': {k: c.get(k) for k in ('mdvsId','code','definition','scheme')}} for c,m in matches]}

    @lru_cache(maxsize=1)
    def _public_vmi_catalog(self):
        extension = self._has_catalog_context()
        detail_select = "d.payload_json AS detail_json," if extension else ""
        detail_join = f"LEFT JOIN {SCHEMA}.virtual_instrument_detail d ON d.vmi_mdvs_id=vi.mdvs_id" if extension else ""
        with connect(self.settings) as conn:
            rows = conn.execute(f"""SELECT vi.*, {detail_select}
                coalesce((SELECT jsonb_agg(jsonb_build_object(
                    'targetOrganMdvsId',r.organ_mdvs_id,'targetOrganTitle',o.label,
                    'representedOrganLabel',r.represented_organ_label,'relationTypeId',r.relation_type_id,
                    'confidence',r.confidence,'resolutionState',r.resolution_state,'rowSha256',r.row_hash
                ) ORDER BY r.relation_id) FROM {SCHEMA}.organ_virtual_instrument r
                LEFT JOIN {SCHEMA}.organ o ON o.mdvs_id=r.organ_mdvs_id WHERE r.vmi_mdvs_id=vi.mdvs_id),'[]'::jsonb) AS organ_relations
                FROM {SCHEMA}.virtual_instrument vi {detail_join} ORDER BY vi.canonical_title,vi.mdvs_id""").fetchall()
        return [self._vmi_summary(row) for row in rows]

    def _list_public_virtual_instruments(self, *, query="", limit=30, offset=0, **filters):
        items = self._public_vmi_catalog()
        for old, new in (("access", "access_category"), ("license_class", "license_category"), ("availability", "catalog_status")):
            if filters.get(old) and not filters.get(new):
                filters[new] = filters[old]
        if filters.get("independently_distributed") == "all":
            filters.pop("independently_distributed")
        paths = {"producer": ("producer",), "platform": ("platforms", "all"), "access_category": ("availability", "accessCategory"),
                 "license_category": ("availability", "licenseCategory"), "catalog_status": ("availability", "catalogStatus"),
                 "country": ("physicalInstrument", "location", "country"), "granularity": ("kind", "granularity"),
                 "independently_distributed": ("kind", "independentlyDistributed"), "link_state": ("relationships", "linkState")}

        def at(item, path):
            value = item
            for key in path:
                value = value.get(key) if isinstance(value, dict) else None
            return value if isinstance(value, list) else [value] if value else []

        if query.strip():
            terms = query.casefold().split()
            items = [item for item in items if all(term in " ".join(str(item.get(k) or "") for k in ("id", "title", "sampledInstrumentName", "producer", "platforms")).casefold() for term in terms)]
        for key, path in paths.items():
            if filters.get(key):
                items = [item for item in items if filters[key] in at(item, path)]
        if filters.get("organ_link") in {"linked", "unlinked"}:
            items = [item for item in items if bool(item["relationships"]["organDecision"]["targets"]) == (filters["organ_link"] == "linked")]
        facet_paths = {"producers": (("producer",), "producer"), "platforms": (("platforms", "all"), "platform"),
                       "accessCategories": (("availability", "accessCategory"), "value"), "licenseCategories": (("availability", "licenseCategory"), "value"),
                       "availabilityStatuses": (("availability", "catalogStatus"), "value"), "countries": (("physicalInstrument", "location", "country"), "country"),
                       "linkStates": (("relationships", "linkState"), "value"), "granularities": (("kind", "granularity"), "value"),
                       "distributionStates": (("kind", "independentlyDistributed"), "value")}
        facets = {name: [{key: value, "value": value, "label": value, "count": count} for value, count in Counter(value for item in items for value in at(item, path)).most_common()]
                  for name, (path, key) in facet_paths.items()}
        facets.update({key: [] for key in ("downloadStates", "organOutcomes", "confidenceTiers", "matchMethods")})
        facets["sortOptions"] = [{"value": "title", "label": "Title"}]
        organ_ids = {target["mdvsId"] for item in items for target in item["relationships"]["organDecision"]["targets"]}
        return {"items": items[offset:offset+limit], "total": len(items), "limit": limit, "offset": offset,
                "counts": {"canonicalVmiInstruments": len(items), "distinctCanonicalOrganEntities": len(organ_ids), "linkedInstruments": sum(bool(i["relationships"]["organDecision"]["targets"]) for i in items)},
                "reviewQueues": [], "facets": facets, "matchingPolicy": {"state": "accepted_release_projection"},
                "releaseBoundary": {"targetRelease": self.policy.release_version, "dataProfile": "pod-1.5-public"}}
