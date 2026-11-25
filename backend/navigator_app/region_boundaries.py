"""Viewport polygons reconciled to the selected immutable public area index."""

from collections import defaultdict
from functools import lru_cache
import gzip
import hashlib
import json
import math
from pathlib import Path
from threading import Lock

from flask import Response, jsonify, request
from shapely import get_coordinates, get_parts
from shapely.geometry import MultiPolygon, box, mapping, shape
from shapely.strtree import STRtree
from werkzeug.datastructures import MultiDict

from .public_areas import _name_key


BOUNDARY_VERSION = "2"
BOUNDARIES = Path(__file__).with_name(f"region_boundaries_v{BOUNDARY_VERSION}.json.gz")
MIN_ZOOM = (0, 5, 8, 10, 12)
MAX_FEATURES = 400
MAX_PAYLOAD = 480_000
ATTRIBUTION = {
    "natural-earth": {
        "source": "Natural Earth",
        "sourceUrl": "https://www.naturalearthdata.com/",
        "attribution": "Natural Earth · public domain",
        "licenseUrl": "https://www.naturalearthdata.com/about/terms-of-use/",
    },
    "bkg": {
        "source": "Bundesamt für Kartographie und Geodäsie",
        "sourceUrl": "https://www.bkg.bund.de",
        "attribution": "© BKG (2026) · dl-de/by-2-0 · simplified for display",
        "licenseUrl": "https://www.govdata.de/dl-de/by-2-0",
        "dataSourcesUrl": "https://sgx.geodatenzentrum.de/web_public/gdz/datenquellen/datenquellen_vg_nuts.pdf",
    },
    "hamburg-lgv": {
        "source": "Hamburg LGV",
        "sourceUrl": "https://suche.transparenz.hamburg.de/dataset/alkis-verwaltungsgrenzen-hamburg31",
        "attribution": "Freie und Hansestadt Hamburg, Landesbetrieb Geoinformation und Vermessung (LGV) · dl-de/by-2-0 · simplified for display",
        "licenseUrl": "https://www.govdata.de/dl-de/by-2-0",
    },
}


def validate_viewport(args: MultiDict[str, str]):
    keys = set(args)
    if not {"bbox", "zoom"} <= keys <= {"bbox", "zoom", "v"} or any(len(args.getlist(key)) != 1 for key in keys):
        raise ValueError("Provide one bounding box and one zoom level.")
    if args.get("v", BOUNDARY_VERSION) != BOUNDARY_VERSION:
        raise ValueError("Unknown administrative boundary version.")
    raw_bounds, raw_zoom = args["bbox"], args["zoom"]
    if len(raw_bounds) > 128 or len(raw_zoom) > 12:
        raise ValueError("Invalid map viewport.")
    try:
        west, south, east, north = bounds = tuple(map(float, raw_bounds.split(",")))
        zoom = float(raw_zoom)
    except ValueError as exc:
        raise ValueError("Invalid map viewport.") from exc
    if (not all(map(math.isfinite, (*bounds, zoom)))
            or not (-180 <= west <= 180 and -180 <= east <= 180 and west != east)
            or (west, east) == (180, -180)
            or not (-90 <= south < north <= 90) or not 0 <= zoom <= 24):
        raise ValueError("Invalid map viewport.")
    return bounds, int(zoom)


def index_identities(boundaries, area_index):
    """Require a unique area name, role and full provider ancestry."""
    by_identity = defaultdict(dict)
    for area in area_index.by_id.values():
        by_identity[(area.role, _name_key(area.title))][area.identifier] = area

    candidates = defaultdict(list)
    for boundary in boundaries:
        parents = [frozenset(map(_name_key, names)) for names in boundary["parents"]]
        matched = {}
        for role in boundary["roles"]:
            for name in boundary["names"]:
                for identifier, area in by_identity[(role, _name_key(name))].items():
                    if len(area.parents) == len(parents) and all(
                        _name_key(parent) in expected for parent, expected in zip(area.parents, parents)
                    ):
                        matched[identifier] = area
        if len(matched) == 1:
            identifier, area = next(iter(matched.items()))
            candidates[identifier].append((boundary, area))

    for matches in candidates.values():
        # Larger geographic tiers can share an identity with their city (e.g.
        # Hamburg). The same subject should remain available at the first tier.
        min_rank = min(boundary["rank"] for boundary, _ in matches)
        selected = [(boundary, area) for boundary, area in matches if boundary["rank"] == min_rank]
        if len(selected) == 1:
            yield selected[0]


def geometry_bounds(geometry):
    """Fit countries across the date line without including an entire world."""
    west, south, east, north = geometry.bounds
    if east - west > 180:
        longitudes = sorted({p[0] for p in get_coordinates(geometry)})
        cyclic = [*longitudes, longitudes[0] + 360]
        index = max(range(len(longitudes)), key=lambda i: cyclic[i + 1] - cyclic[i])
        if index != len(longitudes) - 1:
            west, east = cyclic[index + 1], cyclic[index] + 360
    return [round(value, 5) for value in (west, south, east, north)]


def rounded_coordinates(value):
    if isinstance(value, (tuple, list)):
        return [rounded_coordinates(item) for item in value]
    return round(value, 5) or 0


class BoundaryIndex:
    def __init__(self, boundaries, area_index):
        self.records = []
        self.shapes = []
        for boundary, area in index_identities(boundaries, area_index):
            geometry = shape(boundary["geometry"])
            self.shapes.append(geometry)
            self.records.append({
                **area.link(),
                **ATTRIBUTION[boundary["source"]],
                "rank": boundary["rank"],
                "bounds": geometry_bounds(geometry),
                "label": boundary["label"],
            })
        self.tree = STRtree(self.shapes)

    @lru_cache(maxsize=512)
    def feature(self, index, resolution):
        properties = self.records[index]
        original = self.shapes[index]
        geometry = original.simplify(resolution, preserve_topology=True)
        # At overview scales tiny detached islands can create visible points
        # where the source polygon would be smaller than a single map pixel.
        parts = list(get_parts(geometry))
        if len(parts) > 1:
            # Retain the main polygon even for very small countries.
            main = max(parts, key=lambda part: part.area)
            geometry = MultiPolygon([part for part in parts if part is main or part.area > resolution**2])
        feature = {
            "type": "Feature",
            "id": properties["id"],
            "properties": properties,
            "geometry": {"type": geometry.geom_type, "coordinates": rounded_coordinates(mapping(geometry)["coordinates"])},
        }
        return json.dumps(feature, ensure_ascii=False, separators=(",", ":")).encode()

    def viewport(self, bounds, zoom):
        west, south, east, north = bounds
        windows = [box(west, south, east, north)] if west < east else [
            box(west, south, 180, north), box(-180, south, east, north),
        ]
        candidates = {int(i) for window in windows for i in self.tree.query(window, predicate="intersects")}
        candidates = sorted(
            (i for i in candidates if zoom >= MIN_ZOOM[self.records[i]["rank"]]),
            key=lambda i: (-self.records[i]["rank"], -self.shapes[i].area, self.records[i]["id"]),
        )
        precision = 360 / (1024 * 2 ** min(zoom, 13))
        resolution = max(precision, .00015)
        parts = []
        size = 0
        for index in candidates[:MAX_FEATURES]:
            rank = self.records[index]["rank"]
            # A higher-level fallback should not acquire a detailed coastline
            # just because the viewport is currently focused on a small town.
            step = max(resolution, (.03, .012, .004, .0007, .00015)[rank])
            item = self.feature(index, step)
            size += len(item) + 1
            if size > MAX_PAYLOAD:
                break
            parts.append(item)
        return b'{"type":"FeatureCollection","features":[' + b",".join(parts) + b"]}"


def register_region_boundaries(app, area_index):
    index = None
    lock = Lock()

    @app.get("/api/map/regions.geojson")
    def public_map_regions():
        nonlocal index
        try:
            bounds, zoom = validate_viewport(request.args)
        except ValueError as exc:
            return jsonify({"error": "invalid_map_viewport", "detail": str(exc)}), 400
        if index is None:
            with lock:
                if index is None:
                    with gzip.open(BOUNDARIES, "rt", encoding="utf-8") as stream:
                        index = BoundaryIndex(json.load(stream), area_index())
        payload = index.viewport(bounds, zoom)
        response = Response(payload, content_type="application/geo+json")
        response.headers["Cache-Control"] = "public, max-age=300"
        response.set_etag(hashlib.sha256(payload).hexdigest(), weak=True)
        return response.make_conditional(request)
