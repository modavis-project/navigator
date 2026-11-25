"""Administrative context derived from the published place evidence."""

from base64 import urlsafe_b64decode, urlsafe_b64encode
from bisect import bisect_left
from collections import defaultdict
from dataclasses import dataclass
from heapq import nsmallest
import json
import math
import re
from threading import Lock
import unicodedata
from urllib.parse import quote

from .db import connect
from .map_tiles import WEB_MERCATOR_HALF_WORLD, web_mercator_xy
from .public_query_cache import BoundedQueryCache
from .public_query_identity import MAX_SEARCH_TEXT_LENGTH, normalize_search_text


SCHEMA = "release_1_5_public"
ROLES = ("country", "region", "county", "municipality", "town", "district", "locality")
AREA_ID = re.compile(r"locadmin:[a-z0-9]+(?::[a-z0-9_-]+)*")
AREA_DIGEST = re.compile(r"locadmin:([0-9a-f]{48})")
AREA_SLUG = re.compile(r"[\w-]{1,64}~([A-Za-z0-9_-]{32})")
CHILD_PAGE_SIZE = 12
ORGAN_PAGE_SIZE = 12
LOOKUP_LIMIT = 6
MAX_OFFSET = 1_000_000
INLINE_MAP_SITES = 160
AREA_MAP_CONTRACT = "modavis.navigator.public-area-map/v1"

# Names for these retained administrative nodes are display/search aliases.
AREA_ALIASES = {
    ("locadmin:6d7c300a7d6c613086981f120595002474fa100ae6a77df8", "region", "Niedersachsen"): ("Lower Saxony",),
}


def _name_key(text):
    return " ".join(normalize_search_text(text).replace(",", " ").casefold().split())


def _valid_area_id(identifier):
    return isinstance(identifier, str) and len(identifier) <= 120 and AREA_ID.fullmatch(identifier) is not None


def _identifier_from_route(value):
    if _valid_area_id(value):
        return value
    match = AREA_SLUG.fullmatch(value) if isinstance(value, str) else None
    if match:
        return "locadmin:" + urlsafe_b64decode(match[1]).hex()
    return None


def _area_url(identifier, title):
    match = AREA_DIGEST.fullmatch(identifier)
    if not match:
        return "/areas/" + quote(identifier, safe="")
    normalized = unicodedata.normalize("NFKC", title).casefold()
    slug = re.sub(r"[\W_]+", "-", normalized).strip("-")[:64].rstrip("-") or "area"
    token = urlsafe_b64encode(bytes.fromhex(match[1])).decode("ascii")
    return "/areas/" + quote(f"{slug}~{token}", safe="-~")


def _organ_link(organ):
    return {
        "id": organ["id"],
        "title": organ["title"],
        "url": "/organs/" + quote(organ["id"].removeprefix("MDVS:ENTY:"), safe="-._~"),
    }


@dataclass(frozen=True)
class Area:
    identifier: str
    title: str
    role: str
    parents: tuple[str, ...]
    support: int

    def link(self):
        return {
            "id": self.identifier,
            "title": self.title,
            "type": self.role,
            "context": ", ".join(self.parents),
            "url": _area_url(self.identifier, self.title),
        }


class AreaIndex:
    def __init__(self, rows):
        self.by_id = {}
        self.by_name = defaultdict(list)
        for row in rows:
            identifier, role, title = row["identifier"], row["role"], row["title"]
            if not _valid_area_id(identifier) or not title or role not in ROLES or identifier in self.by_id:
                continue
            hierarchy = row["hierarchy"] or {}
            parents = tuple(dict.fromkeys(
                hierarchy[parent_role] for parent_role in reversed(ROLES[:ROLES.index(role)])
                if hierarchy.get(parent_role) and hierarchy[parent_role] != title
            ))
            area = Area(identifier, title, role, parents, row["support"])
            self.by_id[identifier] = area
            aliases = AREA_ALIASES.get((identifier, role, title), ())
            for name in (title, *aliases):
                self.by_name[_name_key(name)].append(area)
        self.name_keys = sorted(self.by_name)
        self.parent_keys = {}
        for area in self.by_id.values():
            parents = [_name_key(parent) for parent in area.parents]
            self.parent_keys[area.identifier] = frozenset(
                [*parents, *(" ".join(parents[:count]) for count in range(2, len(parents) + 1))]
            )

    @staticmethod
    def sort_key(area):
        return (ROLES.index(area.role), _name_key(area.title), area.parents, area.identifier)

    @classmethod
    def search_key(cls, area):
        return (-area.support, *cls.sort_key(area))

    def matches(self, query, limit):
        identifier = _identifier_from_route(query)
        if identifier:
            area = self.by_id.get(identifier)
            return [(area, "identifier")] if area else []
        needle = _name_key(query)
        if not needle:
            return []
        exact = sorted(self.by_name.get(needle, ()), key=self.search_key)
        if exact:
            return [(area, "name") for area in exact[:limit]]
        words = needle.split()
        qualified = {}
        for split in range(1, len(words)):
            left, right = " ".join(words[:split]), " ".join(words[split:])
            for name, parent in ((left, right), (right, left)):
                for area in self.by_name.get(name, ()):
                    if parent in self.parent_keys[area.identifier]:
                        qualified[area.identifier] = area
        return [(area, "context") for area in sorted(qualified.values(), key=self.search_key)[:limit]]

    def suggest(self, query, limit):
        exact = self.matches(query, limit)
        if exact:
            return exact
        needle = _name_key(query)
        if len(needle) < 2:
            return []
        names = self._prefix(needle)
        matches = {area.identifier: area for area in names}
        words = needle.split()
        for split in range(1, len(words)):
            left, right = " ".join(words[:split]), " ".join(words[split:])
            for prefix, parent in ((left, right), (right, left)):
                if len(prefix) < 2:
                    continue
                for area in self._prefix(prefix):
                    if parent in self.parent_keys[area.identifier]:
                        matches[area.identifier] = area
        return [(area, "prefix") for area in nsmallest(limit, matches.values(), key=self.search_key)]

    def _prefix(self, prefix):
        for position in range(bisect_left(self.name_keys, prefix), len(self.name_keys)):
            name = self.name_keys[position]
            if not name.startswith(prefix):
                break
            yield from self.by_name[name]

    def linked(self, identifiers):
        return [self.by_id[identifier] for identifier in identifiers if identifier in self.by_id]


class PublicAreas:
    def __init__(self, settings):
        self.settings = settings
        self._index = None
        self._index_lock = Lock()
        self._map_data = BoundedQueryCache(max_entries=48, max_bytes=4 * 1024 * 1024, ttl=600)

    def index(self):
        # The repository serves one immutable public snapshot. Load the compact
        # label index once, so frequent search requests never rescan place JSON.
        if self._index is not None:
            return self._index
        with self._index_lock:
            if self._index is None:
                with connect(self.settings) as conn:
                    available = conn.execute(
                        "select to_regclass(%s) is not null as available", (f"{SCHEMA}.place_detail",)
                    ).fetchone()["available"]
                    rows = conn.execute(AREA_INDEX_SQL).fetchall() if available else []
                self._index = AreaIndex(rows)
            return self._index

    def search(self, query, limit):
        if not query:
            return []
        return self.index().matches(query, limit)

    def suggest(self, query, limit):
        return self.index().suggest(query, limit) if query else []

    def resolve(self, identifier):
        identifier = _identifier_from_route(identifier)
        if identifier is None:
            return None
        return self.index().by_id.get(identifier)

    def detail(self, identifier, *, child_offset, organ_offset):
        area = self.resolve(identifier)
        if not area:
            return None
        index = self.index()
        with connect(self.settings) as conn:
            row = conn.execute(AREA_DETAIL_SQL, {
                "identifier": area.identifier, "organ_offset": organ_offset, "organ_limit": ORGAN_PAGE_SIZE,
                "inline_limit": INLINE_MAP_SITES,
            }).fetchone()
        map_data = row["map_data"]
        self._remember_map_data(area.identifier, map_data)
        parents = sorted(index.linked(row["parents"]), key=index.sort_key)
        children = sorted(index.linked(row["children"]), key=lambda child: (_name_key(child.title), child.identifier))
        organs = [_organ_link(organ) for organ in row["organs"]]
        return {
            **area.link(),
            "parents": [parent.link() for parent in parents],
            "statistics": {"organs": row["organ_count"], "places": row["place_count"], "mappedSites": row["site_count"]},
            "mapCoordinates": {"exact": map_data["exact_group_count"], "fallback": map_data["fallback_group_count"]},
            "children": {
                "items": [child.link() for child in children[child_offset:child_offset + CHILD_PAGE_SIZE]],
                "total": len(children), "offset": child_offset, "limit": CHILD_PAGE_SIZE,
            },
            "organs": {"items": organs, "total": row["organ_count"], "offset": organ_offset, "limit": ORGAN_PAGE_SIZE},
        }

    def map_data(self, area):
        cached = self._map_data.get(area.identifier)
        if cached is not None:
            return json.loads(cached)
        with connect(self.settings) as conn:
            value = conn.execute(AREA_MAP_SQL, {
                "identifier": area.identifier, "inline_limit": INLINE_MAP_SITES,
            }).fetchone()
        self._remember_map_data(area.identifier, value)
        return value

    def filtered_map_counts(self, area, organ_clauses, params):
        # The map catalogue and region summary use the same organ predicates.
        # Begin with recorded area members rather than testing each world site.
        where = " and ".join(organ_clauses)
        with connect(self.settings) as conn:
            return conn.execute(f"""
                with {_AREA_PLACES}, {_AREA_CURRENT_LINKS}, {_AREA_SITE_MEMBERS},
                mapped_members as materialized (
                    select m.site_group_id, m.organ_mdvs_id, g.coordinate_fallback
                    from area_site_members m
                    join {SCHEMA}.map_site_group g on g.site_group_id = m.site_group_id
                    join {SCHEMA}.organ o on o.mdvs_id = m.organ_mdvs_id
                    where {where}
                )
                select count(distinct site_group_id) filter(where coordinate_fallback = 0) as exact_group_count,
                       count(distinct site_group_id) filter(where coordinate_fallback = 1) as fallback_group_count,
                       {_MAPPED_ORGAN_COUNTS}
                from mapped_members
                """, {**params, "identifier": area.identifier}).fetchone()

    def _remember_map_data(self, identifier, value):
        self._map_data.put(identifier, json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode())

    def map_site(self, area, site_group_id):
        with connect(self.settings) as conn:
            rows = conn.execute(AREA_SITE_SQL, {
                "identifier": area.identifier, "site_group_id": site_group_id,
                "limit": ORGAN_PAGE_SIZE,
            }).fetchall()
        if not rows:
            return None
        return {
            "items": [_organ_link(organ) for organ in rows],
            "total": rows[0]["total"],
        }


def area_map_view(bounds):
    west, south, east, north = bounds
    _, min_y = web_mercator_xy(west, south)
    _, max_y = web_mercator_xy(east, north)
    # Fit a narrow embedded viewport, including its controls. The same view
    # remains comfortably framed when the embed has more room.
    longitude_fraction = (east - west) / 360
    latitude_fraction = (max_y - min_y) / (2 * WEB_MERCATOR_HALF_WORLD)
    zoom = math.log2(250 / (512 * max(longitude_fraction, latitude_fraction, 1e-10)))
    return {
        "center": [(west + east) / 2, (south + north) / 2],
        "zoom": round(max(1.5, min(14, zoom)), 2),
        "bearing": 0,
        "pitch": 0,
    }


def validate_lookup(args):
    if set(args) - {"q"} or len(args.getlist("q")) > 1:
        raise ValueError("Use a single area search query.")
    query = normalize_search_text(args.get("q"))
    if len(query) > MAX_SEARCH_TEXT_LENGTH:
        raise ValueError(f"Area search is limited to {MAX_SEARCH_TEXT_LENGTH} characters.")
    return query


def area_page_offsets(args):
    if set(args) - {"child_offset", "organ_offset"}:
        raise ValueError("Unsupported area filter.")
    offsets = {}
    for key in ("child_offset", "organ_offset"):
        values = args.getlist(key)
        if not values:
            offsets[key] = 0
            continue
        value = values[0]
        if (len(values) != 1 or not value.isascii() or not value.isdecimal()
                or len(value) > len(str(MAX_OFFSET)) or int(value) > MAX_OFFSET):
            raise ValueError("Invalid area page offset.")
        offsets[key] = int(value)
    return offsets


AREA_INDEX_SQL = f"""
    select node->>'nodeId' as identifier, node->>'preferredName' as title,
           node->>'role' as role, node->'hierarchy' as hierarchy, count(*) as support
    from {SCHEMA}.place_detail d
    cross join lateral jsonb_array_elements(d.administrative_nodes_json::jsonb) entries(node)
    where d.administrative_nodes_json <> '[]'
    group by identifier, title, role, hierarchy
    order by identifier, support desc, title, role, hierarchy
"""


_AREA_CONTAINMENT = """
    position(%(identifier)s in d.administrative_nodes_json) > 0
    and exists (
        select from jsonb_array_elements(d.containment_relations_json::jsonb) as entries(relation)
        where relation->>'relationKind' = 'place_administrative_containment'
          and relation->>'parentNodeId' = %(identifier)s
    )
"""

_AREA_PLACE_SOURCE = f"from {SCHEMA}.place_detail d where {_AREA_CONTAINMENT}"

_AREA_PLACES = f"""
    area_places as materialized (
        select d.mdvs_id
        {_AREA_PLACE_SOURCE}
    )
"""

# The area page also reads its administrative edges; map counts only need IDs.
_AREA_PLACES_WITH_CONTAINMENT = f"""
    area_places as materialized (
        select d.mdvs_id, d.containment_relations_json::jsonb as containment
        {_AREA_PLACE_SOURCE}
    )
"""

_AREA_CURRENT_LINKS = f"""
    matched_assertions as (
        select place.mdvs_id, p.assertion_id
        from area_places place
        join {SCHEMA}.place_assertion p on p.place_mdvs_id = place.mdvs_id
        union
        select place.mdvs_id, r.assertion_id
        from area_places place
        join {SCHEMA}.place_route r on r.source_location_mdvs_id = place.mdvs_id
        union
        select place.mdvs_id, r.assertion_id
        from area_places place
        join {SCHEMA}.place_route r on r.canonical_target_mdvs_id = place.mdvs_id
    ),
    current_links as materialized (
        select distinct match.mdvs_id, p.organ_mdvs_id, r.route_id
        from matched_assertions match
        join {SCHEMA}.place_assertion p on p.assertion_id = match.assertion_id
        left join {SCHEMA}.place_route r on r.assertion_id = match.assertion_id
        where p.temporal_scope = 'current' and p.organ_mdvs_id is not null
    )
"""

_AREA_SITE_MEMBERS = f"""
    area_site_members as (
        select distinct m.site_group_id, m.organ_mdvs_id, m.source_organ_mdvs_id, m.title
        from (select distinct organ_mdvs_id, route_id from current_links where route_id is not null) links
        join {SCHEMA}.coordinate_assertion c on c.organ_mdvs_id = links.organ_mdvs_id
            and c.place_route_id = links.route_id and c.marker_layer in ('current_exact', 'current_fallback')
        join {SCHEMA}.map_site_member m on m.source_organ_mdvs_id = c.source_organ_mdvs_id
            and m.organ_mdvs_id = c.organ_mdvs_id and m.marker_layer = c.marker_layer
    )
"""

# A tile already has a geographic index on its candidate map groups. Test
# their members against the same place assertions without rescanning all
# administrative nodes in the release for every viewport tile.
AREA_MAP_MEMBER_EXISTS = f"""
    exists (
        select from {SCHEMA}.coordinate_assertion c
        join {SCHEMA}.place_assertion p on p.organ_mdvs_id = c.organ_mdvs_id and p.temporal_scope = 'current'
        join {SCHEMA}.place_route r on r.assertion_id = p.assertion_id and r.route_id = c.place_route_id
        where c.source_organ_mdvs_id = m.source_organ_mdvs_id and c.organ_mdvs_id = m.organ_mdvs_id
          and c.marker_layer = m.marker_layer and c.marker_layer in ('current_exact', 'current_fallback')
          and exists (
              select from {SCHEMA}.place_detail d
              where d.mdvs_id in (p.place_mdvs_id, r.source_location_mdvs_id, r.canonical_target_mdvs_id)
                and {_AREA_CONTAINMENT}
          )
    )
"""

_MAPPED_ORGAN_COUNTS = """
    count(distinct organ_mdvs_id) as mapped_organ_count,
    count(distinct organ_mdvs_id) filter(where coordinate_fallback = 0) as exact_mapped_organ_count,
    count(distinct organ_mdvs_id) filter(where coordinate_fallback = 1) as fallback_mapped_organ_count
"""

_AREA_MAP_DATA = f"""
    grouped_sites as materialized (
        select g.site_group_id, g.latitude, g.longitude, g.coordinate_fallback, g.coordinate_precision,
               min(m.title) as title, min(m.organ_mdvs_id) as representative_organ_mdvs_id,
               count(distinct m.organ_mdvs_id) as entity_count, count(*) as location_count
        from area_site_members m
        join {SCHEMA}.map_site_group g on g.site_group_id = m.site_group_id
        group by g.site_group_id
    ),
    map_data as materialized (
        select count(*) as group_count,
               count(*) filter(where g.coordinate_fallback = 0) as exact_group_count,
               count(*) filter(where g.coordinate_fallback = 1) as fallback_group_count,
               coalesce(sum(g.entity_count) filter(where g.coordinate_fallback = 0), 0)::bigint as exact_entity_count,
               coalesce(sum(g.entity_count) filter(where g.coordinate_fallback = 1), 0)::bigint as fallback_entity_count,
               (select to_jsonb(counts) from (
                   select {_MAPPED_ORGAN_COUNTS}
                   from area_site_members m
                   join {SCHEMA}.map_site_group sites on sites.site_group_id = m.site_group_id
               ) counts) as mapped_organ_counts,
               array[min(g.longitude) filter(where g.coordinate_fallback = 0),
                     min(g.latitude) filter(where g.coordinate_fallback = 0),
                     max(g.longitude) filter(where g.coordinate_fallback = 0),
                     max(g.latitude) filter(where g.coordinate_fallback = 0)] as exact_bounds,
               array[min(g.longitude) filter(where g.coordinate_fallback = 1),
                     min(g.latitude) filter(where g.coordinate_fallback = 1),
                     max(g.longitude) filter(where g.coordinate_fallback = 1),
                     max(g.latitude) filter(where g.coordinate_fallback = 1)] as fallback_bounds,
               case when count(*) <= %(inline_limit)s then (
                   select coalesce(jsonb_agg(to_jsonb(m) order by m.site_group_id), '[]'::jsonb)
                   from grouped_sites m
               ) else null end as inline_groups
        from grouped_sites g
    )
"""

AREA_DETAIL_SQL = f"""
    with recursive {_AREA_PLACES_WITH_CONTAINMENT},
    administrative_edges as materialized (
        select distinct relation->>'childRef' as child_id, relation->>'parentNodeId' as parent_id
        from area_places
        cross join lateral jsonb_array_elements(containment) as entries(relation)
        where relation->>'relationKind' = 'administrative_parent'
          and relation->>'childRef' <> relation->>'parentNodeId'
    ),
    ancestors(identifier) as (
        select parent_id from administrative_edges where child_id = %(identifier)s
        union
        select edge.parent_id from administrative_edges edge
        join ancestors on edge.child_id = ancestors.identifier
        where edge.parent_id <> %(identifier)s
    ),
    {_AREA_CURRENT_LINKS},
    {_AREA_SITE_MEMBERS},
    {_AREA_MAP_DATA},
    organ_page as (
        select o.mdvs_id, o.label from {SCHEMA}.organ o
        join (select distinct organ_mdvs_id from current_links) links on links.organ_mdvs_id = o.mdvs_id
        order by lower(o.label), o.mdvs_id
        limit %(organ_limit)s offset %(organ_offset)s
    )
    select
        (select count(distinct organ_mdvs_id) from current_links) as organ_count,
        (select count(distinct mdvs_id) from current_links) as place_count,
        (select group_count from map_data) as site_count,
        (select to_jsonb(scope) from map_data scope) as map_data,
        array(select identifier from ancestors where identifier <> %(identifier)s) as parents,
        array(select child_id from administrative_edges where parent_id = %(identifier)s) as children,
        coalesce((
          select jsonb_agg(jsonb_build_object('id', mdvs_id, 'title', label) order by lower(label), mdvs_id)
          from organ_page
        ), '[]'::jsonb) as organs
"""

AREA_MAP_SQL = f"""
    with {_AREA_PLACES}, {_AREA_CURRENT_LINKS}, {_AREA_SITE_MEMBERS}, {_AREA_MAP_DATA}
    select * from map_data
"""

AREA_SITE_SQL = f"""
    select members.id, members.title, count(*) over() as total
    from (
        select distinct o.mdvs_id as id, o.label as title
        from {SCHEMA}.map_site_member m
        join {SCHEMA}.organ o on o.mdvs_id = m.organ_mdvs_id
        where m.site_group_id = %(site_group_id)s and {AREA_MAP_MEMBER_EXISTS}
    ) members
    order by lower(members.title), members.id
    limit %(limit)s
"""
