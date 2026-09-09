from __future__ import annotations

import base64
import hashlib
import json
import math
from collections import defaultdict
from typing import Any, Iterable, Mapping
from urllib.parse import quote

from .movement_projection import movement_layers


GEOLIBRE_PROJECT_VERSION = "0.1.0"
GEOLIBRE_RUNTIME_VERSION = "2.8.0"
GEOLIBRE_RUNTIME_COMMIT = "477e9cfb4e0cdde0623007bf98b97f6cfb401493"
MAP_LAYER_ID = "modavis-reviewed-current-places-v1"
FALLBACK_MAP_LAYER_ID = "modavis-locality-fallback-places-v1"
OPENFREEMAP_STYLE = "https://tiles.openfreemap.org/styles/positron"
MAP_SITE_GROUP_CONTRACT = "modavis.navigator.map-site-group/v1"
MAP_SITE_GROUP_ID_PREFIX = "mapsite:v1:"
COMPACT_EXACT_SELECTION_TOLERANCE = 2e-5
ORGAN_CONTEXT_BUILDER_EXACT_LAYER_ID = "modavis-organ-context-builder-exact-v1"
ORGAN_CONTEXT_BUILDER_FALLBACK_LAYER_ID = "modavis-organ-context-builder-fallback-v1"
ORGAN_CONTEXT_BUILDER_ORIGIN_LAYER_ID = "modavis-organ-context-builder-origin-v1"
ACTOR_CONTEXT_LAYER_PREFIX = "modavis-actor-context-activity-v1-"
PUBLIC_MAP_VECTOR_SOURCE_LAYER = "organ_sites"
PUBLIC_MAP_INITIAL_VIEW = {
    "center": [8.8, 50.2],
    "zoom": 3.35,
    "bearing": 0,
    "pitch": 0,
}


def parse_bbox(value: str | None) -> tuple[float, float, float, float] | None:
    if value is None or not value.strip():
        return None
    parts = [part.strip() for part in value.split(",")]
    if len(parts) != 4:
        raise ValueError("bbox must contain min_longitude,min_latitude,max_longitude,max_latitude")
    try:
        minimum_longitude, minimum_latitude, maximum_longitude, maximum_latitude = map(float, parts)
    except ValueError as exc:
        raise ValueError("bbox values must be finite numbers") from exc
    values = (minimum_longitude, minimum_latitude, maximum_longitude, maximum_latitude)
    if not all(math.isfinite(item) for item in values):
        raise ValueError("bbox values must be finite numbers")
    if not (-180 <= minimum_longitude < maximum_longitude <= 180):
        raise ValueError("bbox longitude bounds are invalid")
    if not (-90 <= minimum_latitude < maximum_latitude <= 90):
        raise ValueError("bbox latitude bounds are invalid")
    return values


def parse_coordinate_scope(value: str | None) -> str:
    scope = str(value or "exact").strip().lower()
    if scope not in {"all", "exact", "fallback"}:
        raise ValueError("precision must be one of all, exact, fallback")
    return scope


def parse_country_code(value: str | None) -> str | None:
    country_code = str(value or "").strip().upper()
    if not country_code:
        return None
    if len(country_code) != 2 or not country_code.isalpha():
        raise ValueError("country must be a two-letter ISO country code")
    return country_code


def encode_map_site_group_id(
    *,
    kind: str,
    longitude: float | None = None,
    latitude: float | None = None,
    provider: str | None = None,
    provider_place_id: str | None = None,
    precision: str | None = None,
) -> str:
    """Create a stable opaque identifier for a display-only map site group."""
    if kind == "exact":
        lon = _finite_number(longitude)
        lat = _finite_number(latitude)
        if lon is None or lat is None:
            raise ValueError("exact map site groups require finite coordinates")
        return f"{MAP_SITE_GROUP_ID_PREFIX}e:{lon.hex()}:{lat.hex()}"
    elif kind == "fallback":
        normalized_provider = str(provider or "").strip().lower()
        normalized_place_id = str(provider_place_id or "").strip()
        normalized_precision = str(precision or "").strip().lower()
        if not normalized_provider or not normalized_place_id or not normalized_precision:
            raise ValueError(
                "fallback map site groups require provider, provider place id, and precision"
            )
        encoded_place_id = base64.urlsafe_b64encode(
            normalized_place_id.encode("utf-8")
        ).decode("ascii").rstrip("=")
        return (
            f"{MAP_SITE_GROUP_ID_PREFIX}f:{normalized_provider}:"
            f"{normalized_precision}:{encoded_place_id}"
        )
    else:
        raise ValueError("map site group kind must be exact or fallback")
    raise AssertionError("unreachable map site group encoder state")


def decode_map_site_group_id(value: str) -> dict[str, Any]:
    """Validate and decode a display-only map site group identifier."""
    text = str(value or "").strip()
    if not text.startswith(MAP_SITE_GROUP_ID_PREFIX):
        raise ValueError("invalid map site group identifier")
    encoded = text[len(MAP_SITE_GROUP_ID_PREFIX) :]
    if encoded.startswith("e:"):
        parts = encoded.split(":")
        if len(parts) != 3:
            raise ValueError("invalid exact map site group identifier")
        try:
            longitude = float.fromhex(parts[1])
            latitude = float.fromhex(parts[2])
        except ValueError as exc:
            raise ValueError("invalid exact map site group identifier") from exc
        if not (
            math.isfinite(longitude)
            and math.isfinite(latitude)
            and -180 <= longitude <= 180
            and -90 <= latitude <= 90
        ):
            raise ValueError("invalid exact map site group coordinates")
        return {"kind": "exact", "longitude": longitude, "latitude": latitude}
    if encoded.startswith("f:"):
        parts = encoded.split(":", 3)
        if len(parts) != 4:
            raise ValueError("invalid fallback map site group identifier")
        provider, precision, encoded_place_id = parts[1:]
        try:
            provider_place_id = base64.urlsafe_b64decode(
                encoded_place_id + ("=" * ((4 - len(encoded_place_id) % 4) % 4))
            ).decode("utf-8")
        except (ValueError, UnicodeDecodeError) as exc:
            raise ValueError("invalid fallback map site group identifier") from exc
        if not provider or not precision or not provider_place_id:
            raise ValueError("invalid fallback map site group identifier")
        return {
            "kind": "fallback",
            "provider": provider,
            "provider_place_id": provider_place_id,
            "precision": precision,
        }
    # Compatibility with the pre-checkpoint JSON-shaped v1 development identifier.
    try:
        payload = json.loads(
            base64.urlsafe_b64decode(
                encoded + ("=" * ((4 - len(encoded) % 4) % 4))
            ).decode("utf-8")
        )
    except (ValueError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ValueError("invalid map site group identifier") from exc
    if not isinstance(payload, dict):
        raise ValueError("invalid map site group identifier")
    kind = payload.get("kind")
    if kind == "exact":
        try:
            longitude = float.fromhex(str(payload["longitudeHex"]))
            latitude = float.fromhex(str(payload["latitudeHex"]))
        except (KeyError, ValueError) as exc:
            raise ValueError("invalid exact map site group identifier") from exc
        if not (
            math.isfinite(longitude)
            and math.isfinite(latitude)
            and -180 <= longitude <= 180
            and -90 <= latitude <= 90
        ):
            raise ValueError("invalid exact map site group coordinates")
        return {"kind": "exact", "longitude": longitude, "latitude": latitude}
    if kind == "fallback":
        provider = str(payload.get("provider") or "").strip().lower()
        provider_place_id = str(payload.get("providerPlaceId") or "").strip()
        precision = str(payload.get("precision") or "").strip().lower()
        if not provider or not provider_place_id or not precision:
            raise ValueError("invalid fallback map site group identifier")
        return {
            "kind": "fallback",
            "provider": provider,
            "provider_place_id": provider_place_id,
            "precision": precision,
        }
    raise ValueError("invalid map site group identifier")


def localizer_places_geojson(
    items: Iterable[Mapping[str, Any]],
    *,
    bbox: tuple[float, float, float, float] | None = None,
    coordinate_scope: str = "all",
) -> dict[str, Any]:
    coordinate_scope = parse_coordinate_scope(coordinate_scope)
    features = []
    for item in items:
        review_status = str(item.get("review_status") or item.get("certainty") or "").lower()
        if review_status not in {"approved", "auto_approved"}:
            continue
        coordinates = item.get("coordinates") if isinstance(item.get("coordinates"), Mapping) else {}
        longitude = _finite_number(coordinates.get("lon") if coordinates else item.get("longitude"))
        latitude = _finite_number(coordinates.get("lat") if coordinates else item.get("latitude"))
        if longitude is None or latitude is None or not (-180 <= longitude <= 180 and -90 <= latitude <= 90):
            continue
        coordinate_fallback = bool(item.get("coordinate_fallback"))
        if coordinate_scope == "exact" and coordinate_fallback:
            continue
        if coordinate_scope == "fallback" and not coordinate_fallback:
            continue
        if bbox is not None and not _point_in_bbox(longitude, latitude, bbox):
            continue

        source_record_id = str(item.get("source_record_id") or "").strip()
        resolution_id = str(item.get("resolution_id") or item.get("id") or "").strip()
        if not source_record_id or not resolution_id:
            continue
        organ_mdvs_id = str(item.get("organ_mdvs_id") or _organ_mdvs_id(source_record_id))
        normalized_place = item.get("normalizedPlace") if isinstance(item.get("normalizedPlace"), Mapping) else {}
        provider = item.get("provider") if isinstance(item.get("provider"), Mapping) else {}
        label = str(
            normalized_place.get("label")
            or item.get("normalized_place_label")
            or item.get("title")
            or item.get("location")
            or source_record_id
        )
        projected = bool(item.get("projected"))
        coordinate_precision = str(
            item.get("coordinate_precision")
            or ("locality" if coordinate_fallback else "venue")
        )
        features.append(
            {
                "type": "Feature",
                "id": organ_mdvs_id,
                "geometry": {"type": "Point", "coordinates": [longitude, latitude]},
                "properties": {
                    "title": label,
                    "organMdvsId": organ_mdvs_id,
                    "navigatorUrl": f"/id/{quote(organ_mdvs_id, safe='')}",
                    "sourceRecordId": source_record_id,
                    "sourceId": item.get("source_id"),
                    "resolutionId": resolution_id,
                    "reviewStatus": review_status,
                    "confidence": _finite_number(item.get("confidence")),
                    "canonicalProjection": projected,
                    "coordinateFallback": coordinate_fallback,
                    "coordinatePrecision": coordinate_precision,
                    "fallbackReason": item.get("fallback_reason") if coordinate_fallback else None,
                    "fallbackAnchorLabel": item.get("fallback_anchor_label") if coordinate_fallback else None,
                    "evidenceState": (
                        "locality-fallback"
                        if coordinate_fallback
                        else "canonical-projected"
                        if projected
                        else "source-backed-reviewed"
                    ),
                    "geometrySemantics": (
                        "approximate-location-anchor-not-venue"
                        if coordinate_fallback
                        else "observed-current-or-latest-place"
                    ),
                    "historicalMovementSemantics": "none",
                    "provider": provider.get("name") or item.get("provider_name"),
                    "providerPlaceId": provider.get("placeId") or item.get("provider_place_id"),
                    "coordinateAttribution": "© OpenStreetMap contributors",
                },
            }
        )
    features.sort(key=lambda feature: str(feature["id"]))
    exact_count = sum(
        not bool((feature.get("properties") or {}).get("coordinateFallback"))
        for feature in features
    )
    fallback_count = len(features) - exact_count
    return {
        "type": "FeatureCollection",
        "features": features,
        "metadata": {
            "contract": "modavis.navigator.reviewed-place-geojson/v1",
            "visibility": "local-restricted",
            "owner": "Processor Localizer",
            "coordinateOrder": "longitude,latitude",
            "geometrySemantics": "current-or-latest-place-only",
            "historicalMovementSemantics": "not-asserted",
            "featureCount": len(features),
            "exactCoordinateCount": exact_count,
            "fallbackCoordinateCount": fallback_count,
            "coordinateScope": coordinate_scope,
        },
    }


def public_places_geojson(
    items: Iterable[Mapping[str, Any]],
    *,
    bbox: tuple[float, float, float, float] | None = None,
    coordinate_scope: str = "all",
) -> dict[str, Any]:
    """Project public exact/fallback points without routine processing state."""
    collection = localizer_places_geojson(
        items, bbox=bbox, coordinate_scope=coordinate_scope
    )
    private_keys = {
        "sourceRecordId",
        "sourceId",
        "resolutionId",
        "reviewStatus",
        "confidence",
        "evidenceState",
        "provider",
        "providerPlaceId",
    }
    for feature in collection["features"]:
        properties = feature.get("properties") or {}
        for key in private_keys:
            properties.pop(key, None)
    collection["metadata"].update(
        {
            "contract": "modavis.navigator.public-place-geojson/v2",
            "visibility": "public",
            "owner": "Navigator canonical release",
        }
    )
    return collection


def public_site_groups_geojson(
    items: Iterable[Mapping[str, Any]],
    *,
    coordinate_scope: str = "all",
    compact: bool = False,
) -> dict[str, Any]:
    """Serialize pre-grouped public map sites without expanding their members."""
    coordinate_scope = parse_coordinate_scope(coordinate_scope)
    items = list(items)
    ambiguous_exact_group_ids: set[str] = set()
    if compact and coordinate_scope != "fallback":
        buckets: dict[tuple[int, int], list[tuple[float, float, str]]] = defaultdict(list)
        for item in items:
            if bool(item.get("coordinate_fallback")):
                continue
            coordinates = (
                item.get("coordinates")
                if isinstance(item.get("coordinates"), Mapping)
                else {}
            )
            longitude = _finite_number(
                coordinates.get("lon") if coordinates else item.get("longitude")
            )
            latitude = _finite_number(
                coordinates.get("lat") if coordinates else item.get("latitude")
            )
            group_id = str(item.get("site_group_id") or "").strip()
            if longitude is None or latitude is None or not group_id:
                continue
            bucket = (
                math.floor(longitude / COMPACT_EXACT_SELECTION_TOLERANCE),
                math.floor(latitude / COMPACT_EXACT_SELECTION_TOLERANCE),
            )
            for longitude_offset in (-1, 0, 1):
                for latitude_offset in (-1, 0, 1):
                    for other_longitude, other_latitude, other_group_id in buckets.get(
                        (bucket[0] + longitude_offset, bucket[1] + latitude_offset),
                        [],
                    ):
                        if (
                            abs(longitude - other_longitude)
                            <= COMPACT_EXACT_SELECTION_TOLERANCE
                            and abs(latitude - other_latitude)
                            <= COMPACT_EXACT_SELECTION_TOLERANCE
                        ):
                            ambiguous_exact_group_ids.update((group_id, other_group_id))
            buckets[bucket].append((longitude, latitude, group_id))
    features: list[dict[str, Any]] = []
    exact_entity_count = 0
    fallback_entity_count = 0
    exact_location_count = 0
    fallback_location_count = 0
    for item in items:
        coordinate_fallback = bool(item.get("coordinate_fallback"))
        if coordinate_scope == "exact" and coordinate_fallback:
            continue
        if coordinate_scope == "fallback" and not coordinate_fallback:
            continue
        coordinates = item.get("coordinates") if isinstance(item.get("coordinates"), Mapping) else {}
        longitude = _finite_number(coordinates.get("lon") if coordinates else item.get("longitude"))
        latitude = _finite_number(coordinates.get("lat") if coordinates else item.get("latitude"))
        if longitude is None or latitude is None:
            continue
        group_id = str(item.get("site_group_id") or "").strip()
        if not group_id:
            continue
        entity_count = max(0, int(item.get("entity_count") or 0))
        location_count = max(0, int(item.get("location_count") or 0))
        coordinate_precision = str(
            item.get("coordinate_precision")
            or ("locality" if coordinate_fallback else "venue")
        )
        if compact:
            # The project layer already carries precision/fallback semantics and
            # the bounded group endpoint supplies its card. Keep only values
            # that differ from those layer defaults. Features retain a native
            # id only when their coordinate cannot select one group safely.
            properties: dict[str, Any] = {}
            if coordinate_fallback:
                properties["coordinateFallback"] = True
            if entity_count != 1:
                properties["entityCount"] = entity_count
            default_precision = "locality" if coordinate_fallback else "venue"
            if coordinate_precision != default_precision:
                properties["coordinatePrecision"] = coordinate_precision
        else:
            properties = {
                "siteGroupId": group_id,
                "entityCount": entity_count,
                "locationCount": location_count,
                "coordinateFallback": coordinate_fallback,
                "coordinatePrecision": coordinate_precision,
            }
        if not compact:
            properties["title"] = str(
                item.get("title") or item.get("normalized_place_label") or "Mapped places"
            )
        representative_organ_mdvs_id = str(
            item.get("representative_organ_mdvs_id") or ""
        ).strip()
        if representative_organ_mdvs_id and not compact:
            properties["representativeOrganMdvsId"] = representative_organ_mdvs_id
            properties["navigatorUrl"] = (
                f"/id/{quote(representative_organ_mdvs_id, safe='')}"
            )
        feature: dict[str, Any] = {
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [longitude, latitude]},
            "properties": properties,
        }
        if compact and (
            coordinate_fallback or group_id in ambiguous_exact_group_ids
        ):
            feature["id"] = group_id
        features.append(feature)
        if coordinate_fallback:
            fallback_entity_count += entity_count
            fallback_location_count += location_count
        else:
            exact_entity_count += entity_count
            exact_location_count += location_count
    features.sort(
        key=lambda feature: str((feature.get("properties") or {}).get("siteGroupId"))
    )
    exact_group_count = sum(
        not bool((feature.get("properties") or {}).get("coordinateFallback"))
        for feature in features
    )
    fallback_group_count = len(features) - exact_group_count
    return {
        "type": "FeatureCollection",
        "features": features,
        "metadata": {
            "contract": "modavis.navigator.public-map-site-geojson/v1",
            "siteGroupContract": MAP_SITE_GROUP_CONTRACT,
            "visibility": "public",
            "owner": "Navigator canonical release",
            "coordinateOrder": "longitude,latitude",
            "coordinateScope": coordinate_scope,
            "featureCount": len(features),
            "exactGroupCount": exact_group_count,
            "fallbackGroupCount": fallback_group_count,
            "exactEntityCount": exact_entity_count,
            "fallbackEntityCount": fallback_entity_count,
            "exactLocationCount": exact_location_count,
            "fallbackLocationCount": fallback_location_count,
            "groupingSemantics": {
                "exact": "shared persisted exact coordinate; identities remain distinct",
                "fallback": "shared provider, provider place identifier, and precision",
            },
            "geometrySemantics": {
                "exact": "co-located-exact-venue-results",
                "fallback": "approximate-location-anchor-not-venue",
            },
            "coordinateAttribution": "© OpenStreetMap contributors",
        },
    }


def geolibre_project(
    feature_collection: Mapping[str, Any] | None = None,
    *,
    movement_collection: Mapping[str, Any] | None = None,
    coordinate_scope: str = "all",
    map_view: Mapping[str, Any] | None = None,
    summary: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    coordinate_scope = parse_coordinate_scope(coordinate_scope)
    feature_collection = feature_collection or {"type": "FeatureCollection", "features": []}
    features = feature_collection.get("features") if isinstance(feature_collection.get("features"), list) else []
    movement_features = (
        movement_collection.get("features")
        if movement_collection is not None and isinstance(movement_collection.get("features"), list)
        else []
    )
    computed_map_view = dict(map_view) if map_view is not None else _map_view([*features, *movement_features])
    exact_features = [
        feature
        for feature in features
        if not bool((feature.get("properties") or {}).get("coordinateFallback"))
    ]
    fallback_features = [
        feature
        for feature in features
        if bool((feature.get("properties") or {}).get("coordinateFallback"))
    ]
    exact_layer = {
        "id": MAP_LAYER_ID,
        "name": "Exact venue coordinates",
        "type": "geojson",
        "source": {"type": "geojson"},
        "visible": coordinate_scope in {"all", "exact"},
        "opacity": 1,
        "style": {
            "minZoom": 0,
            "maxZoom": 24,
            "fillColor": "#9b4d45",
            "strokeColor": "#ffffff",
            "strokeWidth": 2,
            "strokeWidthUnit": "pixels",
            "fillOpacity": 0.92,
            "circleRadius": 8,
            "pointRenderer": "cluster",
            "clusterRadius": 96,
            "clusterMaxZoom": 12,
        },
        "metadata": {
            "contract": "modavis.navigator.reviewed-place-geojson/v1",
            "visibility": "local-restricted",
            "geometrySemantics": "current-or-latest-place-only",
        },
        "geojson": {"type": "FeatureCollection", "features": exact_features},
    }

    fallback_layer = {
        "id": FALLBACK_MAP_LAYER_ID,
        "name": "Approximate locations",
        "type": "geojson",
        "source": {"type": "geojson"},
        "visible": coordinate_scope in {"all", "fallback"},
        "opacity": 0.78,
        "style": {
            "minZoom": 0,
            "maxZoom": 24,
            "fillColor": "#f2b84b",
            "strokeColor": "#6f4b00",
            "strokeWidth": 3,
            "strokeWidthUnit": "pixels",
            "fillOpacity": 0.48,
            "circleRadius": 9,
            "pointRenderer": "cluster",
            "clusterRadius": 104,
            "clusterMaxZoom": 12,
        },
        "metadata": {
            "contract": "modavis.navigator.coordinate-fallback-geojson/v1",
            "visibility": "public",
            "geometrySemantics": "approximate-location-anchor-not-venue",
            "precisionSemantics": "per-feature-coordinatePrecision",
        },
        "geojson": {
            "type": "FeatureCollection",
            "features": fallback_features,
        },
    }
    rendered_movement_layers = (
        movement_layers(movement_collection)
        if movement_collection is not None
        else []
    )
    layers = [exact_layer, fallback_layer, *rendered_movement_layers]
    styles = {item["id"]: item["style"] for item in layers}
    movement_metadata = movement_collection.get("metadata") if movement_collection and isinstance(movement_collection.get("metadata"), Mapping) else {}
    return {
        "version": GEOLIBRE_PROJECT_VERSION,
        "name": "MODAVIS reviewed organ places",
        "mapView": computed_map_view,
        "basemapStyleUrl": OPENFREEMAP_STYLE,
        "basemapVisible": True,
        "basemapOpacity": 1,
        "layers": layers,
        "styles": styles,
        "plugins": {"manifestUrls": [], "activePluginIds": [], "mapControlPositions": {}, "settings": {}},
        "metadata": {
            "contract": "modavis.navigator.geolibre-project/v1",
            "visibility": "local-restricted",
            "sourceOwner": "Processor Localizer",
            "geolibreVersion": GEOLIBRE_RUNTIME_VERSION,
            "geolibreCommit": GEOLIBRE_RUNTIME_COMMIT,
            "movementGeometryIncluded": False,
            "coordinateScope": coordinate_scope,
            "remoteGroupedSources": False,
            **(
                {
                    "exactCoordinateCount": int(summary.get("exactEntityCount") or 0),
                    "fallbackCoordinateCount": int(summary.get("fallbackEntityCount") or 0),
                    "exactGroupCount": int(summary.get("exactGroupCount") or 0),
                    "fallbackGroupCount": int(summary.get("fallbackGroupCount") or 0),
                }
                if summary is not None
                else {}
            ),
            "canonicalMovementGeometryIncluded": bool(
                rendered_movement_layers
                and movement_metadata.get("simulationOnly") is not True
                and int(movement_metadata.get("movementCount") or 0) > 0
            ),
            "schematicMovementConnectorsIncluded": bool(rendered_movement_layers),
            "simulatedMovementCount": (
                int(movement_metadata.get("movementCount") or 0)
                if movement_metadata.get("simulationOnly") is True
                else 0
            ),
            "canonicalMovementCount": (
                0
                if movement_metadata.get("simulationOnly") is True
                else int(movement_metadata.get("movementCount") or 0)
            ),
            "historicalRouteAssertion": False,
            **(
                {
                    "exactCoordinateCount": len(exact_features),
                    "fallbackCoordinateCount": len(fallback_features),
                }
                if summary is None
                else {}
            ),
        },
    }


def public_tiled_geolibre_project(
    *,
    exact_tile_url: str,
    fallback_tile_url: str,
    coordinate_scope: str = "exact",
    summary: Mapping[str, Any],
    map_view: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    """Build a tiny public project backed by zoom-dependent vector tiles.

    The source returns sparse density cells at broad scales and persisted site
    groups only at close scales. This keeps the initial project independent of
    catalog size while preserving the exact/fallback layer distinction.
    """
    coordinate_scope = parse_coordinate_scope(coordinate_scope)

    def layer(
        *,
        layer_id: str,
        name: str,
        tile_url: str,
        visible: bool,
        fallback: bool,
    ) -> dict[str, Any]:
        return {
            "id": layer_id,
            "name": name,
            "type": "vector-tiles",
            "source": {
                "type": "vector",
                "tiles": [tile_url],
                "sourceLayer": PUBLIC_MAP_VECTOR_SOURCE_LAYER,
                "sourceLayers": [PUBLIC_MAP_VECTOR_SOURCE_LAYER],
                "minzoom": 0,
                "maxzoom": 14,
                "bounds": [-180, -85.05112878, 180, 85.05112878],
            },
            "visible": visible,
            "opacity": 1,
            "style": {
                "minZoom": 0,
                "maxZoom": 24,
                "fillColor": "#d69a2d" if fallback else "#2f7169",
                "strokeColor": "#6f4b00" if fallback else "#f8f5ed",
                "strokeWidth": 1.1 if fallback else 0.8,
                "strokeWidthUnit": "pixels",
                "fillOpacity": 0.58 if fallback else 0.64,
                "circleRadius": 4,
                "pointRenderer": "single",
                "proportionalSizeEnabled": True,
                "proportionalSizeProperty": "visualWeight",
                "proportionalSizeMinValue": 0.3,
                "proportionalSizeMaxValue": 5.1,
                "proportionalSizeMinRadius": 3.0,
                "proportionalSizeMaxRadius": 17.0,
            },
            "metadata": {
                "contract": (
                    "modavis.navigator.coordinate-fallback-vector-tile/v1"
                    if fallback
                    else "modavis.navigator.public-map-vector-tile/v1"
                ),
                "visibility": "public",
                "sourceLayers": [PUBLIC_MAP_VECTOR_SOURCE_LAYER],
                "geometryType": "Point",
                "geometrySemantics": (
                    "approximate-location-anchor-not-venue"
                    if fallback
                    else "persisted-position-density-to-site-groups"
                ),
                "renderingSemantics": "density-cells-through-zoom-11; individual-sites-from-zoom-12",
                **({"precisionSemantics": "per-feature-coordinatePrecision"} if fallback else {}),
            },
            "capabilities": {
                "query": True,
                "create": False,
                "update": False,
                "delete": False,
                "export": False,
            },
        }

    exact_layer = layer(
        layer_id=MAP_LAYER_ID,
        name="Organ density · persisted positions",
        tile_url=exact_tile_url,
        visible=coordinate_scope in {"all", "exact"},
        fallback=False,
    )
    fallback_layer = layer(
        layer_id=FALLBACK_MAP_LAYER_ID,
        name="Organ density · approximate localities",
        tile_url=fallback_tile_url,
        visible=coordinate_scope in {"all", "fallback"},
        fallback=True,
    )
    layers = [exact_layer, fallback_layer]
    return {
        "version": GEOLIBRE_PROJECT_VERSION,
        "name": "MODAVIS organ geography",
        "mapView": dict(map_view or PUBLIC_MAP_INITIAL_VIEW),
        "basemapStyleUrl": OPENFREEMAP_STYLE,
        "basemapVisible": True,
        "basemapOpacity": 1,
        "layers": layers,
        "styles": {item["id"]: item["style"] for item in layers},
        "plugins": {
            "manifestUrls": [],
            "activePluginIds": [],
            "mapControlPositions": {},
            "settings": {},
        },
        "metadata": {
            "contract": "modavis.navigator.geolibre-tiled-project/v1",
            "visibility": "public",
            "sourceOwner": "Navigator public release",
            "geolibreVersion": GEOLIBRE_RUNTIME_VERSION,
            "geolibreCommit": GEOLIBRE_RUNTIME_COMMIT,
            "coordinateScope": coordinate_scope,
            "remoteGroupedSources": True,
            "renderingModel": "density-to-cluster-to-venue",
            "initialPayloadContainsGlobalFeatures": False,
            "tileMaxZoom": 14,
            "individualSiteMinZoom": 12,
            "exactCoordinateCount": int(summary.get("exactEntityCount") or 0),
            "fallbackCoordinateCount": int(summary.get("fallbackEntityCount") or 0),
            "exactGroupCount": int(summary.get("exactGroupCount") or 0),
            "fallbackGroupCount": int(summary.get("fallbackGroupCount") or 0),
            "movementGeometryIncluded": False,
            "canonicalMovementGeometryIncluded": False,
            "schematicMovementConnectorsIncluded": False,
            "simulatedMovementCount": 0,
            "canonicalMovementCount": 0,
            "historicalRouteAssertion": False,
            "canonicalMutationAllowed": False,
        },
    }



def organ_context_geolibre_project(
    current_collection: Mapping[str, Any],
    *,
    builder_collection: Mapping[str, Any] | None = None,
    movement_collection: Mapping[str, Any] | None = None,
    builder_origin: Mapping[str, Any] | None = None,
    organ_mdvs_id: str,
    organ_title: str,
    builder_label: str | None = None,
) -> dict[str, Any]:
    """Build a small, read-only project for one organ detail modal.

    Optional contextual layers are embedded once and start hidden. Navigator can
    therefore toggle them through GeoLibre's scripting bridge without reloading
    either the iframe or the global map catalogue.
    """
    current_features = _geojson_features(current_collection)
    movement_features = _geojson_features(movement_collection)
    project = geolibre_project(
        current_collection,
        movement_collection=movement_collection,
        coordinate_scope="all",
    )
    project["name"] = f"{organ_title} — organ context"
    # The modal opens on the subject alone. Optional context may widen the view
    # only after the visitor explicitly enables it.
    project["mapView"] = _map_view(current_features or movement_features)
    current_precision = str(
        ((current_features[0].get("properties") or {}).get("coordinatePrecision"))
        if current_features
        else "venue"
    )
    project["layers"][0]["name"] = (
        f"This organ — {current_precision}"
        if "source grid" in current_precision.lower()
        else "This organ — persisted venue"
    )
    project["layers"][0]["style"].update(
        {"fillColor": "#9b4d45", "circleRadius": 10, "pointRenderer": "single"}
    )
    project["layers"][1]["name"] = "This organ — approximate location"
    project["layers"][1]["style"].update(
        {"circleRadius": 10, "pointRenderer": "single"}
    )
    movement_layer_ids = {
        "modavis-canonical-movement-connectors-v1",
        "modavis-canonical-movement-origins-v1",
        "modavis-canonical-movement-destinations-v1",
    }
    for layer in project["layers"]:
        if layer.get("id") in movement_layer_ids:
            layer["visible"] = False

    builder_features = _geojson_features(builder_collection)
    current_ids = {
        str(
            (feature.get("properties") or {}).get("siteGroupId")
            or feature.get("id")
            or ""
        )
        for feature in current_features
    }
    builder_features = [
        feature
        for feature in builder_features
        if str(
            (feature.get("properties") or {}).get("siteGroupId")
            or feature.get("id")
            or ""
        ) not in current_ids
    ]
    builder_exact = [
        feature
        for feature in builder_features
        if not bool((feature.get("properties") or {}).get("coordinateFallback"))
    ]
    builder_fallback = [
        feature
        for feature in builder_features
        if bool((feature.get("properties") or {}).get("coordinateFallback"))
    ]
    project["layers"].extend(
        [
            _organ_context_point_layer(
                ORGAN_CONTEXT_BUILDER_EXACT_LAYER_ID,
                f"Other organs by {builder_label or 'the same builder'}",
                builder_exact,
                color="#277f78",
                visible=False,
                fallback=False,
            ),
            _organ_context_point_layer(
                ORGAN_CONTEXT_BUILDER_FALLBACK_LAYER_ID,
                "Same-builder approximate locations",
                builder_fallback,
                color="#d39a32",
                visible=False,
                fallback=True,
            ),
        ]
    )

    origin_feature = _builder_origin_feature(builder_origin, builder_label)
    project["layers"].append(
        _organ_context_point_layer(
            ORGAN_CONTEXT_BUILDER_ORIGIN_LAYER_ID,
            "Builder origin (musiXplora)",
            [origin_feature] if origin_feature else [],
            color="#6951a3",
            visible=False,
            fallback=False,
        )
    )
    project["styles"] = {
        layer["id"]: layer["style"]
        for layer in project["layers"]
        if isinstance(layer, Mapping) and isinstance(layer.get("style"), Mapping)
    }
    project["metadata"].update(
        {
            "contract": "modavis.navigator.organ-context-geolibre-project/v3",
            "visibility": "public",
            "sourceOwner": "Navigator canonical release",
            "organMdvsId": organ_mdvs_id,
            "organTitle": organ_title,
            "currentPlaceCount": len(current_features),
            "relocationCount": int(
                ((movement_collection or {}).get("metadata") or {}).get("movementCount")
                or 0
            ),
            "sameBuilderPlaceCount": len(builder_features),
            "sameBuilderExactPlaceCount": len(builder_exact),
            "sameBuilderFallbackPlaceCount": len(builder_fallback),
            "builderLabel": builder_label,
            "builderOriginAvailable": origin_feature is not None,
            "builderOrigin": dict(builder_origin or {}) if origin_feature else None,
            "layerIds": {
                "current": [MAP_LAYER_ID, FALLBACK_MAP_LAYER_ID],
                "relocations": sorted(movement_layer_ids),
                "sameBuilder": [
                    ORGAN_CONTEXT_BUILDER_EXACT_LAYER_ID,
                    ORGAN_CONTEXT_BUILDER_FALLBACK_LAYER_ID,
                ],
                "builderOrigin": [ORGAN_CONTEXT_BUILDER_ORIGIN_LAYER_ID],
            },
            "bounds": {
                "current": _feature_bounds(current_features),
                "relocations": _feature_bounds(
                    [*current_features, *movement_features]
                ),
                "sameBuilder": _feature_bounds([*current_features, *builder_features]),
                "builderOrigin": _feature_bounds(
                    [*current_features, *([origin_feature] if origin_feature else [])]
                ),
            },
            "historicalRouteAssertion": False,
            "canonicalMutationAllowed": False,
        }
    )
    for layer in project["layers"]:
        if isinstance(layer.get("metadata"), dict):
            layer["metadata"]["visibility"] = "public"
    return project


def actor_context_geolibre_project(
    activity_collections: Iterable[Mapping[str, Any]],
    *,
    actor_mdvs_id: str,
    actor_title: str,
) -> dict[str, Any]:
    """Build a bounded activity map for one canonical person or organization.

    Each supplied collection is an already filtered, public projection for one
    controlled activity class.  Keeping classes in separate layers lets the
    Navigator switch them instantly through GeoLibre without another database
    request or a reload of the iframe.
    """
    activity_items = [dict(item) for item in activity_collections if isinstance(item, Mapping)]
    all_features: list[Mapping[str, Any]] = []
    categories: list[dict[str, Any]] = []
    layers: list[dict[str, Any]] = []
    for index, item in enumerate(activity_items):
        collection = item.get("collection") if isinstance(item.get("collection"), Mapping) else {}
        features = _geojson_features(collection)
        all_features.extend(features)
        key = str(item.get("key") or f"activity-{index + 1}").strip()
        digest = hashlib.sha256(key.encode("utf-8")).hexdigest()[:12]
        layer_id = f"{ACTOR_CONTEXT_LAYER_PREFIX}{digest}"
        label = str(item.get("label") or key).strip()
        color = str(item.get("color") or "#4f6f78").strip()
        layers.append(
            _organ_context_point_layer(
                layer_id,
                label,
                features,
                color=color,
                visible=True,
                fallback=False,
            )
        )
        layers[-1]["metadata"].update(
            {
                "contract": "modavis.navigator.actor-context-layer/v1",
                "activityKey": key,
                "activityCode": item.get("code"),
                "activityLabel": label,
            }
        )
        categories.append(
            {
                "key": key,
                "code": item.get("code"),
                "label": label,
                "color": color,
                "layerId": layer_id,
                "mappedOrganCount": len(features),
                "targetOrganCount": int(item.get("targetOrganCount") or len(features)),
                "activityCount": int(item.get("activityCount") or len(features)),
                "bounds": _feature_bounds(features),
            }
        )

    # Reuse the public GeoLibre runtime contract and basemap, but replace the
    # global exact/fallback catalogue layers with this actor's bounded layers.
    project = geolibre_project(
        {"type": "FeatureCollection", "features": []},
        coordinate_scope="all",
    )
    project["name"] = f"{actor_title} — activity context"
    project["mapView"] = _map_view(all_features)
    project["layers"] = layers
    project["styles"] = {
        layer["id"]: layer["style"]
        for layer in layers
        if isinstance(layer.get("style"), Mapping)
    }
    project["metadata"].update(
        {
            "contract": "modavis.navigator.actor-context-geolibre-project/v1",
            "visibility": "public",
            "sourceOwner": "Navigator canonical release",
            "actorMdvsId": actor_mdvs_id,
            "actorTitle": actor_title,
            "categories": categories,
            "mappedOrganCount": len(
                {
                    str((feature.get("properties") or {}).get("organMdvsId") or feature.get("id") or "")
                    for feature in all_features
                    if isinstance(feature, Mapping)
                }
            ),
            "mappedFeatureCount": len(all_features),
            "bounds": _feature_bounds(all_features),
            "canonicalMutationAllowed": False,
            "historicalRouteAssertion": False,
        }
    )
    return project


def _geojson_features(collection: Mapping[str, Any] | None) -> list[Mapping[str, Any]]:
    if not isinstance(collection, Mapping):
        return []
    features = collection.get("features")
    return [item for item in features if isinstance(item, Mapping)] if isinstance(features, list) else []


def _organ_context_point_layer(
    layer_id: str,
    name: str,
    features: list[Mapping[str, Any]],
    *,
    color: str,
    visible: bool,
    fallback: bool,
) -> dict[str, Any]:
    return {
        "id": layer_id,
        "name": name,
        "type": "geojson",
        "source": {"type": "geojson"},
        "visible": visible,
        "opacity": 0.82 if fallback else 0.94,
        "style": {
            "minZoom": 0,
            "maxZoom": 24,
            "fillColor": color,
            "strokeColor": "#ffffff" if not fallback else "#6f4b00",
            "strokeWidth": 2 if not fallback else 3,
            "strokeWidthUnit": "pixels",
            "fillOpacity": 0.86 if not fallback else 0.48,
            "circleRadius": 7,
            # Context projects are bounded (<=5,000 sites) and opt-in. Render
            # their semantic site groups directly so every visible point is an
            # identifiable feature; the full catalogue retains native
            # low-zoom clustering for much larger collections.
            "pointRenderer": "single",
        },
        "metadata": {
            "contract": "modavis.navigator.organ-context-layer/v1",
            "visibility": "public",
            "coordinateFallback": fallback,
            "geometrySemantics": (
                "approximate-location-anchor-not-venue"
                if fallback
                else "source-backed-context-point"
            ),
        },
        "geojson": {"type": "FeatureCollection", "features": features},
    }


def _builder_origin_feature(
    origin: Mapping[str, Any] | None,
    builder_label: str | None,
) -> dict[str, Any] | None:
    if not isinstance(origin, Mapping):
        return None
    coordinates = origin.get("coordinates")
    if not isinstance(coordinates, Mapping):
        return None
    lon = _finite_number(coordinates.get("lon"))
    lat = _finite_number(coordinates.get("lat"))
    if lon is None or lat is None:
        return None
    return {
        "type": "Feature",
        "id": f"builder-origin:{origin.get('placeMdvsId') or builder_label or 'unknown'}",
        "geometry": {"type": "Point", "coordinates": [lon, lat]},
        "properties": {
            "featureKind": "builder-origin",
            "title": origin.get("label") or builder_label or "Builder origin",
            "builderLabel": builder_label,
            "placeMdvsId": origin.get("placeMdvsId"),
            "placeUrl": origin.get("placeUrl"),
            "relationship": origin.get("relationship"),
            "source": "musiXplora",
            "sourceRecordId": origin.get("sourceRecordId"),
        },
    }


def _feature_bounds(features: Iterable[Mapping[str, Any]]) -> list[float] | None:
    points: list[tuple[float, float]] = []
    for feature in features:
        geometry = feature.get("geometry") if isinstance(feature.get("geometry"), Mapping) else {}
        coordinates = geometry.get("coordinates")
        if geometry.get("type") == "Point" and isinstance(coordinates, list) and len(coordinates) == 2:
            lon = _finite_number(coordinates[0])
            lat = _finite_number(coordinates[1])
            if lon is not None and lat is not None:
                points.append((lon, lat))
        elif geometry.get("type") == "MultiLineString" and isinstance(coordinates, list):
            for segment in coordinates:
                if not isinstance(segment, list):
                    continue
                for coordinate in segment:
                    if isinstance(coordinate, list) and len(coordinate) == 2:
                        lon = _finite_number(coordinate[0])
                        lat = _finite_number(coordinate[1])
                        if lon is not None and lat is not None:
                            points.append((lon, lat))
    if not points:
        return None
    return [
        min(point[0] for point in points),
        min(point[1] for point in points),
        max(point[0] for point in points),
        max(point[1] for point in points),
    ]


def _map_view(features: list[Mapping[str, Any]]) -> dict[str, Any]:
    points: list[tuple[float, float]] = []
    for feature in features:
        geometry = feature.get("geometry") if isinstance(feature.get("geometry"), Mapping) else {}
        coordinates = geometry.get("coordinates") if isinstance(geometry.get("coordinates"), list) else []
        if geometry.get("type") == "Point" and len(coordinates) == 2:
            longitude = _finite_number(coordinates[0])
            latitude = _finite_number(coordinates[1])
            if longitude is not None and latitude is not None:
                points.append((longitude, latitude))
    if not points:
        return {"center": [15.2, 45.1], "zoom": 6, "bearing": 0, "pitch": 0}
    longitudes = [point[0] for point in points]
    latitudes = [point[1] for point in points]
    minimum_longitude, maximum_longitude = min(longitudes), max(longitudes)
    minimum_latitude, maximum_latitude = min(latitudes), max(latitudes)
    longitude_span = maximum_longitude - minimum_longitude
    latitude_span = maximum_latitude - minimum_latitude
    longitude_padding = max((maximum_longitude - minimum_longitude) * 0.12, 0.08)
    latitude_padding = max((maximum_latitude - minimum_latitude) * 0.12, 0.08)
    if len(points) == 1:
        zoom = 12
    else:
        longitude_zoom = math.log2(270 / max(longitude_span, 0.02))
        latitude_zoom = math.log2(128 / max(latitude_span, 0.02))
        zoom = round(max(1.5, min(12, longitude_zoom, latitude_zoom)), 2)
    return {
        "center": [
            round((minimum_longitude + maximum_longitude) / 2, 7),
            round((minimum_latitude + maximum_latitude) / 2, 7),
        ],
        "zoom": zoom,
        "bearing": 0,
        "pitch": 0,
        "bbox": [
            minimum_longitude - longitude_padding,
            minimum_latitude - latitude_padding,
            maximum_longitude + longitude_padding,
            maximum_latitude + latitude_padding,
        ],
    }


def _organ_mdvs_id(source_record_id: str) -> str:
    digest = hashlib.sha256(source_record_id.encode("utf-8")).hexdigest()[:12].upper()
    return f"MDVS:ORGN:{digest}"


def _finite_number(value: Any) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) else None


def _point_in_bbox(longitude: float, latitude: float, bbox: tuple[float, float, float, float]) -> bool:
    minimum_longitude, minimum_latitude, maximum_longitude, maximum_latitude = bbox
    return minimum_longitude <= longitude <= maximum_longitude and minimum_latitude <= latitude <= maximum_latitude
