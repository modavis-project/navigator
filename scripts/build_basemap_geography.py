"""Prepare the public-domain Natural Earth reference layers used by Navigator."""

import argparse
import json
import unicodedata
from pathlib import Path


def rounded_coordinates(value):
    if isinstance(value, list):
        return [rounded_coordinates(item) for item in value]
    return round(value, 4) or 0


def feature(geometry, **properties):
    return {
        "type": "Feature",
        "properties": properties,
        "geometry": {
            "type": geometry["type"],
            "coordinates": rounded_coordinates(geometry["coordinates"]),
        },
    }


def render_geography(source):
    def read(name):
        return json.loads((source / f"ne_{name}.geojson").read_bytes())["features"]

    geographic_features = []
    for kind in ("land", "lakes"):
        geographic_features.extend(
            feature(item["geometry"], kind=kind) for item in read(f"50m_{kind}")
        )

    for item in read("50m_admin_0_boundary_lines_land"):
        boundary_kind = item["properties"]["FEATURECLA"]
        kind = "border" if boundary_kind.startswith("International boundary") else "disputed-border"
        geographic_features.append(feature(item["geometry"], kind=kind))

    for item in read("50m_admin_0_countries"):
        props = item["properties"]
        longitude, latitude = props["LABEL_X"], props["LABEL_Y"]
        if not (-180 <= longitude <= 180 and -90 <= latitude <= 90):
            continue
        geographic_features.append(feature(
            {"type": "Point", "coordinates": [longitude, latitude]},
            kind="country",
            name=props["NAME_EN"] or props["NAME"],
            minzoom=props["MIN_LABEL"],
            maxzoom=props["MAX_LABEL"],
        ))

    for item in read("10m_populated_places_simple"):
        props = item["properties"]
        name = props["name"] or props["nameascii"]
        if not name or props["pop_max"] <= 0:
            continue
        geographic_features.append(feature(
            item["geometry"],
            kind="city",
            name=unicodedata.normalize("NFC", name),
            minzoom=props["min_zoom"],
            population=props["pop_max"],
        ))

    return {"type": "FeatureCollection", "features": geographic_features}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path, help="directory with the five Natural Earth GeoJSON files")
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    data = render_geography(args.source)
    args.output.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
