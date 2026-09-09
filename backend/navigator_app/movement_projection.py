from __future__ import annotations

from datetime import date
import json
import math
from pathlib import Path
from typing import Any, Mapping


SYNTHETIC_MOVEMENT_CONTRACT = "modavis.navigator.synthetic-movement-geojson/v1"
CANONICAL_MOVEMENT_CONTRACT = "modavis.navigator.canonical-movement-geojson/v1"
SYNTHETIC_MOVEMENT_LAYER_IDS = {
    "connector": "modavis-simulated-movement-connectors-v1",
    "origin": "modavis-simulated-movement-origins-v1",
    "destination": "modavis-simulated-movement-destinations-v1",
}
CANONICAL_MOVEMENT_LAYER_IDS = {
    "connector": "modavis-canonical-movement-connectors-v1",
    "origin": "modavis-canonical-movement-origins-v1",
    "destination": "modavis-canonical-movement-destinations-v1",
}
_FIXTURE_PATH = Path(__file__).with_name("synthetic_movement_fixtures.json")


def parse_temporal_instant(value: str | None) -> date | None:
    if value is None or not value.strip():
        return None
    normalized = value.strip()
    if len(normalized) == 4 and normalized.isdigit():
        normalized = f"{normalized}-07-01"
    try:
        return date.fromisoformat(normalized)
    except ValueError as exc:
        raise ValueError("datetime must be an ISO date or four-digit year") from exc


def synthetic_movement_geojson(*, temporal_instant: date | None = None) -> dict[str, Any]:
    fixture = json.loads(_FIXTURE_PATH.read_text(encoding="utf-8"))
    movements = fixture.get("movements") if isinstance(fixture.get("movements"), list) else []
    features: list[dict[str, Any]] = []
    included_movements = 0
    for movement in movements:
        if not isinstance(movement, Mapping) or not _movement_is_visible(movement, temporal_instant):
            continue
        origin = _endpoint(movement, "origin")
        destination = _endpoint(movement, "destination")
        if origin is None or destination is None:
            continue
        included_movements += 1
        common = _common_properties(movement)
        displacement_id = str(movement["displacementId"])
        features.extend(
            (
                _endpoint_feature(displacement_id, "origin", origin, common),
                _endpoint_feature(displacement_id, "destination", destination, common),
                {
                    "type": "Feature",
                    "id": f"{displacement_id}:schematic-connector",
                    "geometry": {
                        "type": "MultiLineString",
                        "coordinates": _segmented_connector(origin["coordinates"], destination["coordinates"]),
                    },
                    "properties": {
                        **common,
                        "featureKind": "schematic-connector",
                        "title": f"{common['subjectLabel']} — schematic relocation connector",
                        "geometrySemantics": "schematic-relationship-connector",
                        "pathSemantics": "connect-observations",
                        "routeKnown": False,
                        "routeGeometryStored": False,
                        "historicalRouteAssertion": False,
                        "playbackAllowed": False,
                    },
                },
            )
        )
    return {
        "type": "FeatureCollection",
        "features": features,
        "metadata": {
            "contract": SYNTHETIC_MOVEMENT_CONTRACT,
            "visibility": "local-restricted",
            "simulationOnly": True,
            "notForPublication": True,
            "temporalFilter": temporal_instant.isoformat() if temporal_instant else None,
            "movementCount": included_movements,
            "endpointCount": included_movements * 2,
            "schematicConnectorCount": included_movements,
            "routeGeometryStored": False,
            "historicalRouteAssertion": False,
            "coordinateOrder": "longitude,latitude",
        },
    }


def synthetic_movement_layers(collection: Mapping[str, Any]) -> list[dict[str, Any]]:
    return movement_layers(collection)


def canonical_movement_geojson(
    movements: list[Mapping[str, Any]],
    *,
    temporal_instant: date | None = None,
    movement_id: str | None = None,
    movement_type: str | None = None,
) -> dict[str, Any]:
    features: list[dict[str, Any]] = []
    included = 0
    exact_pairs = 0
    fallback_pairs = 0
    route_assertion_count = 0
    stored_route_geometry_count = 0
    available_types: set[str] = set()
    for movement in movements:
        classification = str(movement.get("classification") or "")
        if classification:
            available_types.add(classification)
        if movement_id and movement.get("eventMdvsId") != movement_id:
            continue
        if movement_type and classification != movement_type:
            continue
        if not _canonical_movement_is_visible(movement, temporal_instant):
            continue
        origin = _canonical_endpoint(movement, "origin")
        destination = _canonical_endpoint(movement, "destination")
        if origin is None or destination is None:
            continue
        included += 1
        route_assertion_count += int(
            movement.get("historicalRouteAssertion") is True
        )
        stored_route_geometry_count += int(
            movement.get("routeGeometryStored") is True
        )
        if origin["coordinatePrecision"] == destination["coordinatePrecision"] == "venue":
            exact_pairs += 1
        else:
            fallback_pairs += 1
        common = _canonical_common_properties(
            movement,
            origin=origin,
            destination=destination,
        )
        displacement_id = str(movement["displacementId"])
        features.extend(
            (
                _canonical_endpoint_feature(displacement_id, "origin", origin, common),
                _canonical_endpoint_feature(
                    displacement_id, "destination", destination, common
                ),
                {
                    "type": "Feature",
                    "id": f"{displacement_id}:schematic-connector",
                    "geometry": {
                        "type": "MultiLineString",
                        "coordinates": _segmented_connector(
                            origin["coordinates"], destination["coordinates"]
                        ),
                    },
                    "properties": {
                        **common,
                        "featureKind": "schematic-connector",
                        "title": (
                            f"{common['subjectLabel']} — documented relocation"
                        ),
                        "geometrySemantics": "schematic-relationship-connector",
                        "pathSemantics": "connect-documented-observations",
                        "routeKnown": common["routeKnown"],
                        "routeGeometryStored": common["routeGeometryStored"],
                        "historicalRouteAssertion": common[
                            "historicalRouteAssertion"
                        ],
                        "playbackAllowed": bool(
                            common.get("earliest") and common.get("latest")
                        ),
                    },
                },
            )
        )
    return {
        "type": "FeatureCollection",
        "features": features,
        "metadata": {
            "contract": CANONICAL_MOVEMENT_CONTRACT,
            "visibility": "public",
            "simulationOnly": False,
            "canonicalProjection": True,
            "temporalFilter": temporal_instant.isoformat()
            if temporal_instant
            else None,
            "movementId": movement_id,
            "movementType": movement_type,
            "movementCount": included,
            "exactEndpointPairCount": exact_pairs,
            "fallbackEndpointPairCount": fallback_pairs,
            "endpointCount": included * 2,
            "schematicConnectorCount": included,
            "movementTypes": sorted(value for value in available_types if value),
            "routeGeometryStored": stored_route_geometry_count > 0,
            "storedRouteGeometryCount": stored_route_geometry_count,
            "historicalRouteAssertion": route_assertion_count > 0,
            "historicalRouteAssertionCount": route_assertion_count,
            "coordinateOrder": "longitude,latitude",
        },
    }


def movement_layers(collection: Mapping[str, Any]) -> list[dict[str, Any]]:
    features = collection.get("features") if isinstance(collection.get("features"), list) else []
    metadata = (
        collection.get("metadata")
        if isinstance(collection.get("metadata"), Mapping)
        else {}
    )
    simulation = metadata.get("simulationOnly") is True
    contract = (
        SYNTHETIC_MOVEMENT_CONTRACT if simulation else CANONICAL_MOVEMENT_CONTRACT
    )
    layer_ids = (
        SYNTHETIC_MOVEMENT_LAYER_IDS if simulation else CANONICAL_MOVEMENT_LAYER_IDS
    )
    grouped = {
        "connector": [item for item in features if _feature_kind(item) == "schematic-connector"],
        "origin": [item for item in features if _feature_kind(item) == "endpoint" and _feature_role(item) == "origin"],
        "destination": [item for item in features if _feature_kind(item) == "endpoint" and _feature_role(item) == "destination"],
    }
    styles = {
        "connector": _style(fill="#d97706", stroke="#d97706", width=3, opacity=0.58, radius=5),
        "origin": _style(fill="#2563eb", stroke="#ffffff", width=2, opacity=0.95, radius=9),
        "destination": _style(fill="#b91c1c", stroke="#ffffff", width=2, opacity=0.95, radius=9),
    }
    names = {
        "connector": (
            "SIMULATION — schematic relocation connectors (not routes)"
            if simulation
            else "Documented relocation relationships (not routes)"
        ),
        "origin": (
            "SIMULATION — documented origin observations"
            if simulation
            else "Documented relocation origins"
        ),
        "destination": (
            "SIMULATION — documented destination observations"
            if simulation
            else "Documented relocation destinations"
        ),
    }
    return [
        {
            "id": layer_ids[kind],
            "name": names[kind],
            "type": "geojson",
            "source": {"type": "geojson"},
            "visible": True,
            "opacity": 1,
            "style": styles[kind],
            "metadata": {
                "contract": contract,
                "visibility": "local-restricted" if simulation else "public",
                "simulationOnly": simulation,
                "notForPublication": simulation,
                "canonicalProjection": not simulation,
                "routeGeometryStored": False,
                "historicalRouteAssertion": False,
            },
            "geojson": {"type": "FeatureCollection", "features": grouped[kind]},
        }
        for kind in ("connector", "origin", "destination")
    ]


def _canonical_movement_is_visible(
    movement: Mapping[str, Any], instant: date | None
) -> bool:
    if instant is None:
        return True
    earliest = movement.get("earliest")
    latest = movement.get("latest")
    if not earliest and not latest:
        return False
    try:
        start = date.fromisoformat(str(earliest or latest))
        end = date.fromisoformat(str(latest or earliest))
    except ValueError:
        return False
    return start <= instant <= end


def _canonical_endpoint(
    movement: Mapping[str, Any], role: str
) -> dict[str, Any] | None:
    endpoint = (
        movement.get(role)
        if isinstance(movement.get(role), Mapping)
        else {}
    )
    coordinates = endpoint.get("coordinates")
    if not isinstance(coordinates, list) or len(coordinates) != 2:
        return None
    try:
        longitude, latitude = float(coordinates[0]), float(coordinates[1])
    except (TypeError, ValueError):
        return None
    if not all(math.isfinite(item) for item in (longitude, latitude)):
        return None
    return {
        **endpoint,
        "coordinates": [longitude, latitude],
        "coordinatePrecision": str(endpoint.get("coordinatePrecision") or "unknown"),
    }


def _canonical_common_properties(
    movement: Mapping[str, Any],
    *,
    origin: Mapping[str, Any],
    destination: Mapping[str, Any],
) -> dict[str, Any]:
    properties = {
        "simulation": False,
        "canonicalProjection": True,
        "displacementId": movement.get("displacementId"),
        "eventMdvsId": movement.get("eventMdvsId"),
        "eventUrl": movement.get("eventUrl"),
        "subjectId": movement.get("subjectId"),
        "subjectLabel": movement.get("subjectLabel"),
        "subjectUrl": movement.get("subjectUrl"),
        "classification": movement.get("classification"),
        "earliest": movement.get("earliest"),
        "latest": movement.get("latest"),
        "rawDateExpression": movement.get("rawDateExpression"),
        "temporalPrecision": movement.get("temporalPrecision"),
        "temporalCertainty": movement.get("temporalCertainty"),
        "confidence": movement.get("confidence"),
        "evidenceId": movement.get("evidenceId"),
        "evidenceUrl": movement.get("evidenceUrl"),
        "evidenceSourcePath": movement.get("evidenceSourcePath"),
        "evidenceSummary": movement.get("evidenceSummary"),
        "routeKnown": movement.get("routeKnown") is True,
        "routeGeometryStored": movement.get("routeGeometryStored") is True,
        "historicalRouteAssertion": (
            movement.get("historicalRouteAssertion") is True
        ),
    }
    for role, endpoint in (("origin", origin), ("destination", destination)):
        prefix = role
        coordinates = endpoint.get("coordinates")
        properties[f"{prefix}PlaceId"] = endpoint.get("placeId")
        properties[f"{prefix}PlaceUrl"] = endpoint.get("placeUrl")
        properties[f"{prefix}Label"] = endpoint.get("label")
        properties[f"{prefix}CoordinatePrecision"] = endpoint.get(
            "coordinatePrecision"
        )
        properties[f"{prefix}CoordinateFallback"] = (
            endpoint.get("coordinateFallback") is True
            or (
                endpoint.get("coordinateFallback") is None
                and endpoint.get("coordinatePrecision") != "venue"
            )
        )
        properties[f"{prefix}CoordinateState"] = endpoint.get("coordinateState")
        properties[f"{prefix}CoordinateEvidence"] = endpoint.get(
            "coordinateEvidence"
        )
        properties[f"{prefix}TemporalRole"] = endpoint.get("temporalRole")
        properties[f"{prefix}PlaceRouteId"] = endpoint.get("placeRouteId")
        if isinstance(coordinates, list) and len(coordinates) == 2:
            properties[f"{prefix}Longitude"] = coordinates[0]
            properties[f"{prefix}Latitude"] = coordinates[1]
    return properties


def _canonical_endpoint_feature(
    displacement_id: str,
    role: str,
    endpoint: Mapping[str, Any],
    common: Mapping[str, Any],
) -> dict[str, Any]:
    return {
        "type": "Feature",
        "id": f"{displacement_id}:{role}",
        "geometry": {"type": "Point", "coordinates": endpoint["coordinates"]},
        "properties": {
            **common,
            "featureKind": "endpoint",
            "endpointRole": role,
            "placeId": endpoint.get("placeId"),
            "placeUrl": endpoint.get("placeUrl"),
            "title": endpoint.get("label"),
            "coordinatePrecision": endpoint.get("coordinatePrecision"),
            "coordinateFallback": (
                endpoint.get("coordinateFallback") is True
                or (
                    endpoint.get("coordinateFallback") is None
                    and endpoint.get("coordinatePrecision") != "venue"
                )
            ),
            "coordinateState": endpoint.get("coordinateState"),
            "coordinateEvidence": endpoint.get("coordinateEvidence"),
            "temporalRole": endpoint.get("temporalRole"),
            "placeRouteId": endpoint.get("placeRouteId"),
            "uncertaintyRadiusM": endpoint.get("uncertaintyRadiusM"),
            "longitude": endpoint["coordinates"][0],
            "latitude": endpoint["coordinates"][1],
            "geometrySemantics": (
                "documented-venue-observation"
                if endpoint.get("coordinatePrecision") == "venue"
                else "documented-place-with-approximate-locality-anchor"
            ),
            "pathSemantics": "none",
            "observed": True,
        },
    }


def _movement_is_visible(movement: Mapping[str, Any], instant: date | None) -> bool:
    if instant is None:
        return True
    temporality = movement.get("temporality") if isinstance(movement.get("temporality"), Mapping) else {}
    try:
        earliest = date.fromisoformat(str(temporality.get("earliest")))
        latest = date.fromisoformat(str(temporality.get("latest")))
    except ValueError:
        return False
    return earliest <= instant <= latest


def _endpoint(movement: Mapping[str, Any], role: str) -> dict[str, Any] | None:
    value = movement.get(role) if isinstance(movement.get(role), Mapping) else {}
    coordinates = value.get("coordinates") if isinstance(value.get("coordinates"), list) else []
    if len(coordinates) != 2:
        return None
    try:
        longitude, latitude = float(coordinates[0]), float(coordinates[1])
    except (TypeError, ValueError):
        return None
    if not all(math.isfinite(item) for item in (longitude, latitude)):
        return None
    if not (-180 <= longitude <= 180 and -90 <= latitude <= 90):
        return None
    return {
        "placeId": str(value.get("placeId") or ""),
        "label": str(value.get("label") or role),
        "coordinates": [longitude, latitude],
    }


def _common_properties(movement: Mapping[str, Any]) -> dict[str, Any]:
    temporality = movement.get("temporality") if isinstance(movement.get("temporality"), Mapping) else {}
    evidence = movement.get("evidence") if isinstance(movement.get("evidence"), Mapping) else {}
    return {
        "simulation": True,
        "notForPublication": True,
        "fixtureId": movement.get("fixtureId"),
        "displacementId": movement.get("displacementId"),
        "subjectId": movement.get("subjectId"),
        "subjectLabel": movement.get("subjectLabel"),
        "classification": movement.get("classification"),
        "earliest": temporality.get("earliest"),
        "latest": temporality.get("latest"),
        "rawDateExpression": temporality.get("rawExpression"),
        "temporalPrecision": temporality.get("precision"),
        "temporalCertainty": temporality.get("certainty"),
        "confidence": movement.get("confidence"),
        "evidenceId": evidence.get("evidenceId"),
        "evidenceSourcePath": evidence.get("sourcePath"),
        "evidenceSummary": evidence.get("summary"),
        "canonicalProjection": False,
    }


def _endpoint_feature(
    displacement_id: str,
    role: str,
    endpoint: Mapping[str, Any],
    common: Mapping[str, Any],
) -> dict[str, Any]:
    return {
        "type": "Feature",
        "id": f"{displacement_id}:{role}",
        "geometry": {"type": "Point", "coordinates": endpoint["coordinates"]},
        "properties": {
            **common,
            "featureKind": "endpoint",
            "endpointRole": role,
            "placeId": endpoint.get("placeId"),
            "title": endpoint.get("label"),
            "geometrySemantics": "synthetic-explicit-place-observation",
            "pathSemantics": "none",
            "routeKnown": False,
            "routeGeometryStored": False,
            "historicalRouteAssertion": False,
            "observed": True,
        },
    }


def _segmented_connector(origin: list[float], destination: list[float], segment_count: int = 18) -> list[list[list[float]]]:
    result: list[list[list[float]]] = []
    for index in range(0, segment_count, 2):
        start_fraction = index / segment_count
        end_fraction = (index + 1) / segment_count
        result.append([_interpolate(origin, destination, start_fraction), _interpolate(origin, destination, end_fraction)])
    return result


def _interpolate(origin: list[float], destination: list[float], fraction: float) -> list[float]:
    return [
        origin[0] + (destination[0] - origin[0]) * fraction,
        origin[1] + (destination[1] - origin[1]) * fraction,
    ]


def _feature_kind(feature: Any) -> str:
    properties = feature.get("properties") if isinstance(feature, Mapping) and isinstance(feature.get("properties"), Mapping) else {}
    return str(properties.get("featureKind") or "")


def _feature_role(feature: Any) -> str:
    properties = feature.get("properties") if isinstance(feature, Mapping) and isinstance(feature.get("properties"), Mapping) else {}
    return str(properties.get("endpointRole") or "")


def _style(*, fill: str, stroke: str, width: int, opacity: float, radius: int) -> dict[str, Any]:
    return {
        "minZoom": 0,
        "maxZoom": 24,
        "fillColor": fill,
        "strokeColor": stroke,
        "strokeWidth": width,
        "strokeWidthUnit": "pixels",
        "fillOpacity": opacity,
        "circleRadius": radius,
    }
