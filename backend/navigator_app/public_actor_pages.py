"""Bounded actor collections over the accepted public projection; no canonical writes."""
import json
from functools import lru_cache
from urllib.parse import quote

from .db import connect
from .public_catalog_context import catalogue_path

SCHEMA = "release_1_5_public"


def relationship(mdvs_id, row):
    url = catalogue_path(row["mdvs_id"], "organs")
    return {"id": f"{mdvs_id}:{row['mdvs_id']}", "direction": "outgoing",
            "relationType": "builder_of", "relationLabel": "Builder of",
            "label": row["label"], "relationship": "Builder of", "kind": "Organ",
            "mdvsId": row["mdvs_id"], "entityPageUrl": url,
            "relatedLabel": row["label"], "relatedMdvsId": row["mdvs_id"], "relatedUrl": url,
            "evidenceSummary": f"{row['assertion_count']} source assertion(s)."}


def mention_rows(rows):
    mentions = {}
    for row in rows:
        source = row["source_record_id"]
        mention = mentions.setdefault(source, {
            "sourceRecordId": source, "sourceFamily": row["source_key"].removeprefix("src:"),
            "sourceIdentifier": source.rsplit(":", 1)[-1],
            "sourcePageUrl": f"/source/{quote(source, safe='')}",
            "sourceUrl": row["source_url"], "originalSourceUrl": row["source_url"],
            "relationshipCount": 0, "relatedItems": [],
        })
        mention["relationshipCount"] += row["assertion_count"]
        mention["relatedItems"].append({"label": row["label"],
            "url": catalogue_path(row["organ_mdvs_id"], "organs"),
            "kind": "Organ", "relationship": "Documented involvement"})
    return list(mentions.values())


class PublicActorPagesMixin:
    @lru_cache(maxsize=1)
    def _has_actor_event_lookup(self):
        with connect(self.settings) as conn:
            row = conn.execute("SELECT to_regclass(%(index)s) AS name", {
                "index": f"{SCHEMA}.documented_event_context_participant_target_gin"}).fetchone()
        return bool(row and row["name"])

    def _actor_event_evidence(self, mdvs_id):
        if not self._has_actor_event_lookup() or not self._has_actor_directory():
            return None
        with connect(self.settings) as conn:
            counts = conn.execute(f"""
                SELECT count(*) AS event_count, count(distinct e.source_record_id) AS source_count
                FROM {SCHEMA}.documented_event e
                WHERE e.event_id IN (SELECT c.event_id FROM {SCHEMA}.documented_event_context c
                    WHERE c.participants_json::jsonb @> %(participant)s::jsonb)
                """, {"participant": json.dumps([{"targetId": mdvs_id}])}).fetchone()
            directory = conn.execute(f"""SELECT source_record_count FROM {SCHEMA}.actor_directory_entry
                WHERE entry_kind='canonical_actor' AND entry_id=%(id)s""", {"id": mdvs_id}).fetchone()
        return {"eventCount": int(counts["event_count"]), "sourceRecordCount": int(counts["source_count"]),
                "combinedSourceRecordCount": int(directory["source_record_count"]) if directory else None,
                "directoryUrl": f"/events?participant={quote(mdvs_id, safe='')}",
                "apiUrl": f"/api/events?participant={quote(mdvs_id, safe='')}",
                "scope": "Events with an established canonical participant target; source records may overlap builder mentions. Event representations are not necessarily distinct historical acts."}

    def _actor_collection_summary(self, mdvs_id):
        with connect(self.settings) as conn:
            relationships = conn.execute(f"""
                SELECT count(*) AS total, coalesce(sum(b.assertion_count),0) AS evidence
                FROM {SCHEMA}.organ_builder b JOIN {SCHEMA}.organ o ON o.mdvs_id=b.organ_mdvs_id
                WHERE b.actor_mdvs_id=%(id)s""", {"id": mdvs_id}).fetchone()
            sources = conn.execute(f"""
                SELECT a.source_key, count(distinct a.source_record_id) AS total
                FROM {SCHEMA}.organ_builder_assertion a
                JOIN {SCHEMA}.source_membership s ON s.source_record_id=a.source_record_id
                JOIN {SCHEMA}.organ o ON o.mdvs_id=a.organ_mdvs_id
                WHERE a.actor_mdvs_id=%(id)s GROUP BY a.source_key ORDER BY a.source_key
                """, {"id": mdvs_id}).fetchall()
        return {"relationshipCount": int(relationships["total"]),
                "evidenceCount": int(relationships["evidence"]),
                "sourceRecordCount": sum(int(row["total"]) for row in sources),
                "sourceCollections": [{"source": row["source_key"].removeprefix("src:"),
                                       "count": int(row["total"])} for row in sources]}

    def actor_collection_page(self, actor_id, collection, *, query="", limit=100, offset=0):
        if collection not in {"mentions", "relationships"}:
            raise ValueError("unknown actor collection")
        if not 1 <= limit <= 100 or not 0 <= offset <= 1_000_000 or len(query) > 200:
            raise ValueError("invalid actor pagination")
        resolved = self._resolve_actor_mdvs_id(actor_id)
        if not resolved:
            return None
        mdvs_id = resolved[0]
        params = {"id": mdvs_id, "query": query.strip().lower(), "limit": limit, "offset": offset}
        with connect(self.settings) as conn:
            if collection == "relationships":
                base = f"""FROM {SCHEMA}.organ_builder b
                    JOIN {SCHEMA}.organ o ON o.mdvs_id=b.organ_mdvs_id
                    WHERE b.actor_mdvs_id=%(id)s AND (%(query)s='' OR
                    strpos(lower(coalesce(o.label,'') || ' ' || o.mdvs_id || ' Builder of Organ'),%(query)s)>0)"""
                total = conn.execute(f"SELECT count(*) AS total {base}", params).fetchone()["total"]
                rows = conn.execute(f"""SELECT o.mdvs_id,o.label,b.assertion_count {base}
                    ORDER BY lower(o.label),o.mdvs_id LIMIT %(limit)s OFFSET %(offset)s""", params).fetchall()
                items = [relationship(mdvs_id, row) for row in rows]
            else:
                # Page distinct source records first, then retain every related item for those records.
                base = f"""FROM {SCHEMA}.organ_builder_assertion a
                    JOIN {SCHEMA}.source_membership s ON s.source_record_id=a.source_record_id
                    JOIN {SCHEMA}.organ o ON o.mdvs_id=a.organ_mdvs_id
                    WHERE a.actor_mdvs_id=%(id)s AND (%(query)s='' OR
                    strpos(lower(a.source_record_id || ' ' || a.source_key || ' ' ||
                        coalesce(o.label,'') || ' ' || o.mdvs_id || ' Organ Documented involvement'),%(query)s)>0)"""
                total = conn.execute(f"SELECT count(distinct a.source_record_id) AS total {base}", params).fetchone()["total"]
                rows = conn.execute(f"""WITH selected AS (
                    SELECT a.source_record_id,min(a.source_key) AS source_key {base}
                    GROUP BY a.source_record_id ORDER BY source_key,a.source_record_id
                    LIMIT %(limit)s OFFSET %(offset)s)
                    SELECT a.source_record_id,a.source_key,a.organ_mdvs_id,o.label,s.source_url,
                           count(*) AS assertion_count
                    FROM selected p JOIN {SCHEMA}.organ_builder_assertion a ON a.source_record_id=p.source_record_id
                    JOIN {SCHEMA}.source_membership s ON s.source_record_id=a.source_record_id
                    JOIN {SCHEMA}.organ o ON o.mdvs_id=a.organ_mdvs_id
                    WHERE a.actor_mdvs_id=%(id)s
                    GROUP BY a.source_record_id,a.source_key,a.organ_mdvs_id,o.label,s.source_url
                    ORDER BY a.source_key,a.source_record_id,a.organ_mdvs_id""", params).fetchall()
                items = mention_rows(rows)
        return {"items": items, "total": int(total), "limit": limit, "offset": offset,
                "query": query.strip(), "actorMdvsId": mdvs_id,
                "hasMore": offset + len(items) < int(total)}
