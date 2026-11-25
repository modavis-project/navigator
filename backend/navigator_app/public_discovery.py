"""Ranked, literal discovery over the existing publication-safe projections."""
from __future__ import annotations

from collections import Counter
from itertools import zip_longest
from urllib.parse import quote

from .db import connect
from .public_query_identity import (
    MAX_SEARCH_TEXT_LENGTH, literal_match_sql, literal_pattern, literal_search_patterns,
    normalize_search_text, semantic_query_identity,
)

SCHEMA = "release_1_5_public"
METHOD = "modavis.literal-ranked-discovery/v4"
DISCOVERY_AREA_LIMIT = 3
KINDS = ("organs", "people", "places", "events")
LABELS = {"organs": "Pipe organs", "people": "People and builders", "places": "Places",
          "events": "Documented event assertions"}


def validate_discovery_query(args):
    allowed = {"q", "limit", "kinds"}
    if set(args) - allowed:
        raise ValueError("Unsupported discovery parameter")
    if any(len(values) != 1 for _, values in args.lists()):
        raise ValueError("Repeated discovery parameter")
    query = normalize_search_text(args.get("q"))
    if len(query) > MAX_SEARCH_TEXT_LENGTH:
        raise ValueError("Search text exceeds 200 characters")
    raw_limit = args.get("limit", "12")
    if len(raw_limit) > 2 or not raw_limit.isascii() or not raw_limit.isdigit() or not 1 <= int(raw_limit) <= 50:
        raise ValueError("Search limit must be between 1 and 50")
    kinds = tuple(args.get("kinds", ",".join(KINDS)).split(","))
    if not kinds or len(set(kinds)) != len(kinds) or set(kinds) - set(KINDS):
        raise ValueError("Unknown or repeated discovery kind")
    return query, int(raw_limit), tuple(kind for kind in KINDS if kind in kinds)


def _definition(kind, actor_directory):
    if kind == "organs":
        return {
            "from": f"{SCHEMA}.organ o LEFT JOIN {SCHEMA}.organ_search_document sd ON sd.organ_mdvs_id=o.mdvs_id",
            "id": "o.mdvs_id", "label": "o.label", "prefix": "MDVS:ENTY:",
            "fields": [("place", "sd.place_text"), ("builder", "sd.builder_text"),
                       ("source", "sd.source_text"), ("search_text", "sd.search_text")],
            "extra": "o.source_count AS source_count", "where": "true",
        }
    if kind == "people" and actor_directory:
        return {"from": f"{SCHEMA}.actor_directory_entry a", "id": "a.canonical_actor_id",
                "label": "a.label", "prefix": "MDVS:ENTY:", "fields": [("search_text", "a.search_text")],
                "extra": "a.actor_type AS actor_type, a.organ_count AS organ_count",
                "where": "a.publication_state='canonical'"}
    if kind == "people":
        return {"from": f"{SCHEMA}.actor a LEFT JOIN {SCHEMA}.actor_search_document sd ON sd.actor_mdvs_id=a.mdvs_id",
                "id": "a.mdvs_id", "label": "a.label", "prefix": "MDVS:ENTY:",
                "fields": [("search_text", "sd.search_text")],
                "extra": "a.actor_type AS actor_type", "where": "true"}
    if kind == "places":
        return {"from": f"{SCHEMA}.place p", "id": "p.mdvs_id", "label": "p.label", "prefix": "MDVS:LOCN:",
                "fields": [], "extra": "p.place_kind AS place_kind, p.organ_count AS organ_count", "where": "true"}
    if kind == "events":
        return {"from": f"{SCHEMA}.documented_event e LEFT JOIN {SCHEMA}.organ o ON o.mdvs_id=e.organ_mdvs_id",
                "id": "e.event_id", "label": "replace(coalesce(e.controlled_event_type,e.source_event_type,'documented event'),'_',' ')",
                "prefix": "MDVS:ACTI:",
                "fields": [("organ_title", "o.label"), ("source_event_type", "e.source_event_type"),
                           ("controlled_event_type", "e.controlled_event_type"), ("organ_identifier", "e.organ_mdvs_id")],
                "extra": "e.organ_mdvs_id AS organ_id, o.label AS organ_label, e.source_key AS source_key, e.source_record_id AS source_record_id",
                "where": "true"}
    raise ValueError("Unsupported discovery kind")


def discovery_sql(kind, query, limit, *, actor_directory=False):
    """Return complete-count and pre-limit ranked page SQL plus bound values."""
    definition = _definition(kind, actor_directory)
    identity, label = definition["id"], definition["label"]
    query_id = query if query.upper().startswith("MDVS:") or query.startswith("event:") else definition["prefix"] + query
    if query_id.upper().startswith("MDVS:"):
        query_id = query_id.upper()
    bound = {"query": query, "query_id": query_id, "literal": literal_pattern(query),
             "prefix": literal_pattern(query, prefix=True), "limit": limit}
    patterns = literal_search_patterns(query, "literal")
    bound.update(patterns)

    def like(column):
        return literal_match_sql(column, patterns)

    exact_id = f"{identity}=%(query_id)s"
    exact_label = f"lower({label})=lower(%(query)s)"
    label_prefix = f"{label} ILIKE %(prefix)s ESCAPE '\\'"
    fields = [("title", label), *definition["fields"]]
    matches = [(name, like(column)) for name, column in fields]
    # Select identifiers from each narrow projection before joining evidence.
    # An OR over joined search documents and organs makes PostgreSQL scan and
    # materialize the entire publication for every count and every page.
    # UNION keeps exact labels/identifiers discoverable even without a document.
    if kind == "organs":
        candidates = (f"SELECT mdvs_id AS id FROM {SCHEMA}.organ WHERE mdvs_id=%(query_id)s OR {like('label')} "
                      f"UNION SELECT organ_mdvs_id AS id FROM {SCHEMA}.organ_search_document WHERE {like('search_text')}")
    elif kind == "people" and actor_directory:
        candidates = (f"SELECT canonical_actor_id AS id FROM {SCHEMA}.actor_directory_entry "
                      f"WHERE publication_state='canonical' AND (canonical_actor_id=%(query_id)s OR {like('label')} OR {like('search_text')})")
    elif kind == "people":
        candidates = (f"SELECT mdvs_id AS id FROM {SCHEMA}.actor WHERE mdvs_id=%(query_id)s OR {like('label')} "
                      f"UNION SELECT actor_mdvs_id AS id FROM {SCHEMA}.actor_search_document WHERE {like('search_text')}")
    elif kind == "places":
        candidates = f"SELECT mdvs_id AS id FROM {SCHEMA}.place WHERE mdvs_id=%(query_id)s OR {like('label')}"
    else:
        # Underscore replacement can only create new matches for text that
        # contains a space. For other terms the raw fields already cover
        # every match, except for the fallback label when both fields are null.
        event_label_match = like(label)
        if len(patterns) == 1 and " " not in query:
            fallback_match = like("'documented event'")
            event_label_match = f"(e.controlled_event_type IS NULL AND e.source_event_type IS NULL AND {fallback_match})"
        candidates = (f"SELECT e.event_id AS id FROM {SCHEMA}.documented_event e WHERE e.event_id=%(query_id)s "
                      f"OR {event_label_match} OR {like('e.source_event_type')} OR {like('e.controlled_event_type')} OR {like('e.organ_mdvs_id')} "
                      f"UNION SELECT e.event_id AS id FROM {SCHEMA}.organ o JOIN {SCHEMA}.documented_event e "
                      f"ON e.organ_mdvs_id=o.mdvs_id WHERE {like('o.label')}")
    selection = f"WITH candidate_ids AS ({candidates}) "
    joined = f"{definition['from']} JOIN candidate_ids c ON c.id={identity}"
    rank = f"CASE WHEN {exact_id} THEN 0 WHEN {exact_label} THEN 1 WHEN {label_prefix} THEN 2"
    if len(patterns) > 1:
        label_phrase = literal_match_sql(label, ("literal",))
        rank += f" WHEN {label_phrase} THEN 3 WHEN {like(label)} THEN 4 ELSE 5 END"
    else:
        rank += " ELSE 3 END"
    explanation = "CASE WHEN " + exact_id + " THEN 'identifier' " + " ".join(
        f"WHEN {sql} THEN '{name}'" for name, sql in matches
    ) + " ELSE 'search_text' END"
    count = selection + "SELECT count(*) AS total FROM candidate_ids"
    page = (selection + f"SELECT {identity} AS id, {label} AS title, {definition['extra']}, {rank} AS match_rank, "
            f"{explanation} AS match_field, count(*) OVER () AS matching_total FROM {joined} WHERE {definition['where']} "
            f"ORDER BY match_rank, lower({label}) COLLATE \"C\", {identity} COLLATE \"C\" LIMIT %(limit)s")
    return count, page, bound


def _item(kind, row, query):
    identity, title = str(row["id"]), str(row["title"])
    rank, field = int(row["match_rank"]), row["match_field"]
    reason = {0: "Exact identifier", 1: "Exact name", 2: "Name starts with this text",
              4: "Name contains all search terms"}.get(rank)
    reason = reason or {"title": "Name contains this text", "place": "Place name in the organ evidence",
                        "builder": "Builder attribution", "source": "Source collection or identifier",
                        "organ_title": "Associated organ name", "organ_identifier": "Associated organ identifier",
                        "source_event_type": "Source event wording", "controlled_event_type": "Documented activity"}.get(field, "Public search text")
    route = {"organs": "organs", "people": "organizations" if row.get("actor_type") == "organization" else "people",
             "places": "places", "events": "events"}[kind]
    token = identity if kind == "events" else identity.rsplit(":", 1)[-1]
    source_place = kind == "places" and str(row.get("place_kind") or "").startswith("source_")
    result = {"kind": {"organs": "canonical_organ", "people": "canonical_actor", "places": "source_place" if source_place else "place", "events": "documented_event"}[kind],
              "entityType": {"organs": "organ", "people": row.get("actor_type") or "person", "places": "place", "events": "event"}[kind],
              "searchGroup": kind, "searchGroupLabel": LABELS[kind], "searchRank": rank,
              "targetId": identity, "mdvsId": identity, "title": title,
              "url": f"/{route}/{quote(token, safe='-._~')}",
              "match": {"field": field, "value": identity if rank == 0 else title if rank < 3 else query, "label": reason},
              "badges": [{"organs": "Organ", "people": "Organization" if row.get("actor_type") == "organization" else "Person",
                          "places": "Source location" if source_place else "Place", "events": "Source event assertion"}[kind]]}
    if kind == "organs":
        result["summary"] = "Public organ record with retained source evidence."
    elif kind == "events":
        result.update(summary="Documented assertion concerning " + (row.get("organ_label") or row["organ_id"]),
                      targetOrganMdvsId=row["organ_id"], targetOrganTitle=row.get("organ_label"),
                      sourceRecordId=row["source_record_id"])
    else:
        result["summary"] = (f"Documented association with {row['organ_count']} organ record(s)."
                             if row.get("organ_count") is not None else "Canonical identity with retained source evidence.")
        if source_place:
            result["summary"] += " Source-scoped location; inspect coordinate precision."
    return result


def _area_item(area, field):
    link = area.link()
    rank, label = {
        "identifier": (0, "Exact area identifier"),
        "name": (1, "Exact area name"),
        "context": (4, "Area name and administrative context"),
    }[field]
    return {
        "kind": "administrative_area", "entityType": "administrative_area",
        "searchGroup": "places", "searchGroupLabel": LABELS["places"], "searchRank": rank,
        "targetId": link["id"], "title": link["title"], "url": link["url"],
        "areaType": link["type"], "context": link["context"], "badges": [],
        "match": {"field": field, "value": link["title"], "label": label},
    }


def search_entities(repo, *, query, limit=12, kinds=KINDS):
    query = normalize_search_text(query)
    if len(query) > MAX_SEARCH_TEXT_LENGTH or set(kinds) - set(KINDS):
        raise ValueError("Invalid discovery query")
    limit = max(1, min(int(limit), 50))
    kinds = tuple(kind for kind in KINDS if kind in kinds)
    totals = dict.fromkeys(KINDS, 0)
    pages = []
    area_items = []
    if query:
        area_directory = getattr(repo, "public_areas", None)
        if "places" in kinds and area_directory is not None:
            area_items = [_area_item(area, field) for area, field in area_directory.search(query, DISCOVERY_AREA_LIMIT)]
        directory = repo._has_actor_directory() if "people" in kinds else False
        with connect(repo.settings) as connection:
            for kind in kinds:
                count_sql, page_sql, bound = discovery_sql(kind, query, limit, actor_directory=directory)
                rows = connection.execute(page_sql, bound).fetchall()
                totals[kind] = int(rows[0]["matching_total"]) if rows else 0
                page = [_item(kind, row, query) for row in rows]
                if kind == "places":
                    totals[kind] += len(area_items)
                    page = sorted(area_items + page, key=lambda item: item["searchRank"])[:limit]
                pages.append(page)
    # Equal-rank ties rotate through entity kinds, in deterministic SQL order.
    # Each source is ranked BEFORE LIMIT, so a distant exact name cannot be lost.
    candidates = [item for row in zip_longest(*pages) for item in row if item] if pages else []
    candidates.sort(key=lambda item: item["searchRank"])
    items = candidates[:limit]
    for position, item in enumerate(items, 1):
        item["globalSearchRank"] = position
    counts = Counter(item["searchGroup"] for item in items)
    total = sum(totals.values())
    binding = repo.snapshot_binding()
    return {"query": query, "items": items,
            "groups": [{"id": kind, "label": LABELS[kind], "count": counts[kind], "total": totals[kind],
                        "items": [item for item in items if item["searchGroup"] == kind]}
                       for kind in KINDS if counts[kind]],
            "total": total, "totalScope": "matching_records", "returned": len(items), "hasMore": len(items) < total,
            "limit": limit, "queryRequired": not bool(query), "searchedKinds": list(kinds),
            "excludedScopes": [{"scope": "source_mentions_and_vmi_candidates", "reason": "Separate evidence records, not canonical identity matches.",
                                "url": "/pod-explorer"},
                               {"scope": "private_records", "reason": "Only publication-safe projections are searched."}],
            "counts": {"organs": totals["organs"], "canonicalActors": totals["people"], "places": totals["places"],
                       "events": totals["events"], "candidateEntities": 0, "vmiCandidates": 0},
            "countScopes": {"organs": "canonical_organ_records", "canonicalActors": "canonical_actor_identities",
                            "places": "place_location_records_and_bounded_administrative_area_matches"
                            if area_items else "place_and_source_location_records", "events": "source_event_assertions"},
            "queryIdentity": semantic_query_identity("/api/entities/search", {"q": query, "kinds": list(kinds)},
                                                     bindings=binding, method=METHOD)}
