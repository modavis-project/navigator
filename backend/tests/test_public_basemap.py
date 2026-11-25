import json
from pathlib import Path

import mapbox_vector_tile

from navigator_app.map_projection import (
    MAP_LAYER_ID,
    NAVIGATOR_BASEMAP_STYLE,
    PUBLIC_MAP_MARKER_STYLE,
    geolibre_project,
    public_map_marker_style,
    public_tiled_geolibre_project,
)
from navigator_app.map_tiles import encode_public_map_tile, public_map_tile_bounds


PUBLIC = Path(__file__).resolve().parents[2] / "frontend" / "public"


def test_public_map_projects_share_the_local_basemap():
    projects = [
        public_tiled_geolibre_project(
            exact_tile_url="/api/map/tiles/{z}/{x}/{y}.mvt?precision=exact",
            fallback_tile_url="/api/map/tiles/{z}/{x}/{y}.mvt?precision=fallback",
            summary={},
        ),
        geolibre_project(movement_collection={"type": "FeatureCollection", "features": []}),
    ]
    for project in projects:
        assert project["basemapStyleUrl"] == NAVIGATOR_BASEMAP_STYLE
        assert project["basemapVisible"] is True


def test_world_map_contains_local_geography_and_glyphs():
    style = json.loads((PUBLIC / NAVIGATOR_BASEMAP_STYLE.lstrip("/")).read_bytes())
    layers = {layer["id"]: layer for layer in style["layers"]}
    assert layers["background"]["paint"]["background-color"] != layers["navigator-land"]["paint"]["fill-color"]
    assert style["sources"]["openmaptiles"]["url"] == "/basemap/openfreemap/v2/planet"
    assert style["sprite"].startswith("/basemap/")
    assert style["glyphs"].startswith("/basemap/")

    local = style["sources"]["navigator-geography"]
    assert local["type"] == "geojson"
    assert local["data"].startswith("/basemap/")
    features = json.loads((PUBLIC / local["data"].lstrip("/")).read_bytes())["features"]
    kinds = {feature["properties"]["kind"] for feature in features}
    assert kinds == {"land", "lakes", "border", "disputed-border", "country", "city"}
    assert "/basemap/assets-v2/NOTICE.txt" in local["attribution"]

    for kind, layer_id, example in (
        ("city", "navigator-cities", "Hamburg"),
        ("country", "navigator-countries", "Germany"),
    ):
        layer = layers[layer_id]
        assert layer["source"] == "navigator-geography"
        font, = layer["layout"]["text-font"]
        names = {item["properties"]["name"] for item in features if item["properties"]["kind"] == kind}
        assert example in names
        ranges = {ord(letter) // 256 * 256 for name in names for letter in name}
        for start in ranges:
            url = style["glyphs"].format(fontstack=font, range=f"{start}-{start + 255}")
            assert (PUBLIC / url.lstrip("/")).is_file()


def test_counted_styles_share_the_project_source_and_hide_the_second_paint_layer():
    exact = "/api/map/tiles/{z}/{x}/{y}.mvt?precision=exact&release=1.6.0&markers=2"
    fallback = exact.replace("exact", "fallback")
    project = public_tiled_geolibre_project(
        exact_tile_url=exact,
        fallback_tile_url=fallback,
        coordinate_scope="exact",
        summary={},
        basemap_style_url=PUBLIC_MAP_MARKER_STYLE + "?precision=exact",
    )
    style = public_map_marker_style(project=project, origin="http://localhost:8080")
    visible, hidden = project["layers"]
    assert visible["style"]["fillOpacity"] == 0
    assert visible["style"]["strokeWidth"] == 0
    assert style["sprite"].startswith("http://localhost:8080/basemap/")
    assert f"source-{hidden['id']}" not in style["sources"]
    circles, labels = (layer for layer in style["layers"] if layer["id"] in {
        f"navigator-marker-{MAP_LAYER_ID}", f"navigator-count-{MAP_LAYER_ID}",
    })
    assert circles["source"] == labels["source"] == f"source-{MAP_LAYER_ID}"
    assert style["sources"][circles["source"]]["tiles"] == visible["source"]["tiles"] == [exact]
    assert labels["filter"] == [">", ["get", "point_count"], 1]
    assert labels["layout"]["text-field"] == ["get", "clusterLabel"]
    layer_ids = [layer["id"] for layer in style["layers"]]
    assert layer_ids.index(circles["id"]) < layer_ids.index(labels["id"]) < layer_ids.index("label_city")
    assert circles["paint"]["circle-opacity"][-1][-2] < 0.25


def test_cluster_labels_count_sites_while_individual_markers_keep_their_identity():
    common = {"longitude": 10, "latitude": 50, "coordinate_precision": "venue", "entity_count": 1675}
    body = encode_public_map_tile(
        [
            {**common, "aggregate": True, "group_count": 1200},
            {**common, "aggregate": False, "site_group_id": "mapsite:example"},
        ],
        bounds=public_map_tile_bounds(0, 0, 0),
    )
    cluster, site = [
        feature["properties"] for feature in mapbox_vector_tile.decode(body)["organ_sites"]["features"]
    ]
    assert cluster["clusterLabel"] == "1.2k"
    assert cluster["point_count"] == 1200
    assert cluster["entityCount"] == 1675
    assert "siteGroupId" not in cluster
    assert "clusterLabel" not in site
    assert site["siteGroupId"] == "mapsite:example"
    assert site["markerRadius"] < cluster["markerRadius"]
