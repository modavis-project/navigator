"""Small, immutable vector-tile projection for the public organ map."""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Any, Iterable, Mapping

import mapbox_vector_tile


PUBLIC_MAP_TILE_CONTRACT = "modavis.navigator.public-map-vector-tile/v1"
PUBLIC_MAP_TILE_LAYER = "organ_sites"
PUBLIC_MAP_TILE_MAX_ZOOM = 14
PUBLIC_MAP_TILE_RAW_MIN_ZOOM = 12
WEB_MERCATOR_LATITUDE_LIMIT = 85.0511287798066
WEB_MERCATOR_RADIUS = 6_378_137.0
WEB_MERCATOR_HALF_WORLD = math.pi * WEB_MERCATOR_RADIUS


@dataclass(frozen=True)
class PublicMapTileBounds:
    longitude_min: float
    latitude_min: float
    longitude_max: float
    latitude_max: float
    projected_x_min: float
    projected_y_min: float
    projected_x_max: float
    projected_y_max: float

    @property
    def longitude_span(self) -> float:
        return self.longitude_max - self.longitude_min

    @property
    def projected_y_span(self) -> float:
        return self.projected_y_max - self.projected_y_min


def public_map_tile_grid_size(zoom: int) -> int | None:
    """Return the per-tile density grid, or ``None`` for individual sites."""
    if zoom < 0 or zoom > PUBLIC_MAP_TILE_MAX_ZOOM:
        raise ValueError(f"map tile zoom must be between 0 and {PUBLIC_MAP_TILE_MAX_ZOOM}")
    if zoom >= PUBLIC_MAP_TILE_RAW_MIN_ZOOM:
        return None
    if zoom <= 2:
        return 4
    if zoom <= 5:
        return 6
    if zoom <= 7:
        return 8
    if zoom <= 9:
        return 12
    return 16


def public_map_tile_bounds(zoom: int, tile_x: int, tile_y: int) -> PublicMapTileBounds:
    if zoom < 0 or zoom > PUBLIC_MAP_TILE_MAX_ZOOM:
        raise ValueError(f"map tile zoom must be between 0 and {PUBLIC_MAP_TILE_MAX_ZOOM}")
    tile_count = 2**zoom
    if not (0 <= tile_x < tile_count and 0 <= tile_y < tile_count):
        raise ValueError("map tile coordinates are outside the requested zoom")
    longitude_min = tile_x / tile_count * 360.0 - 180.0
    longitude_max = (tile_x + 1) / tile_count * 360.0 - 180.0
    latitude_max = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * tile_y / tile_count))))
    latitude_min = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * (tile_y + 1) / tile_count))))
    projected_x_min = -WEB_MERCATOR_HALF_WORLD + tile_x / tile_count * 2 * WEB_MERCATOR_HALF_WORLD
    projected_x_max = -WEB_MERCATOR_HALF_WORLD + (tile_x + 1) / tile_count * 2 * WEB_MERCATOR_HALF_WORLD
    projected_y_max = WEB_MERCATOR_HALF_WORLD - tile_y / tile_count * 2 * WEB_MERCATOR_HALF_WORLD
    projected_y_min = WEB_MERCATOR_HALF_WORLD - (tile_y + 1) / tile_count * 2 * WEB_MERCATOR_HALF_WORLD
    return PublicMapTileBounds(
        longitude_min=longitude_min,
        latitude_min=latitude_min,
        longitude_max=longitude_max,
        latitude_max=latitude_max,
        projected_x_min=projected_x_min,
        projected_y_min=projected_y_min,
        projected_x_max=projected_x_max,
        projected_y_max=projected_y_max,
    )


def web_mercator_xy(longitude: float, latitude: float) -> tuple[float, float]:
    longitude = max(-180.0, min(180.0, float(longitude)))
    latitude = max(
        -WEB_MERCATOR_LATITUDE_LIMIT,
        min(WEB_MERCATOR_LATITUDE_LIMIT, float(latitude)),
    )
    longitude_radians = math.radians(longitude)
    latitude_radians = math.radians(latitude)
    return (
        WEB_MERCATOR_RADIUS * longitude_radians,
        WEB_MERCATOR_RADIUS * math.asinh(math.tan(latitude_radians)),
    )


def encode_public_map_tile(
    rows: Iterable[Mapping[str, Any]],
    *,
    bounds: PublicMapTileBounds,
) -> bytes:
    features: list[dict[str, Any]] = []
    for row in rows:
        longitude = float(row["longitude"])
        latitude = float(row["latitude"])
        projected_x, projected_y = web_mercator_xy(longitude, latitude)
        entity_count = max(0, int(row.get("entity_count") or 0))
        group_count = max(1, int(row.get("group_count") or 1))
        aggregate = bool(row.get("aggregate"))
        coordinate_fallback = bool(row.get("coordinate_fallback"))
        properties: dict[str, Any] = {
            "aggregate": aggregate,
            "cluster": aggregate,
            "point_count": group_count,
            "entityCount": entity_count,
            "locationCount": max(0, int(row.get("location_count") or 0)),
            "visualWeight": round(math.log10(max(1, entity_count) + 1), 4),
            "coordinateFallback": coordinate_fallback,
            "coordinatePrecision": str(
                row.get("coordinate_precision")
                or ("locality" if coordinate_fallback else "venue")
            ),
        }
        if not aggregate:
            site_group_id = str(row.get("site_group_id") or "").strip()
            if not site_group_id:
                continue
            properties.update(
                {
                    "siteGroupId": site_group_id,
                    "title": str(row.get("title") or "Mapped organ site"),
                }
            )
        features.append(
            {
                "geometry": {
                    "type": "Point",
                    "coordinates": [projected_x, projected_y],
                },
                "properties": properties,
            }
        )
    return mapbox_vector_tile.encode(
        {"name": PUBLIC_MAP_TILE_LAYER, "features": features},
        default_options={
            "quantize_bounds": (
                bounds.projected_x_min,
                bounds.projected_y_min,
                bounds.projected_x_max,
                bounds.projected_y_max,
            ),
            "extents": 4096,
        },
    )
