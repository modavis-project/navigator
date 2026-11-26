import gzip
import json
from pathlib import Path
from types import SimpleNamespace

import mapbox_vector_tile

from navigator_app.config import Settings
from navigator_app.public_app import create_public_app
from navigator_app.map_projection import (
    FALLBACK_MAP_LAYER_ID,
    MAP_LAYER_ID,
    NAVIGATOR_BASEMAP_STYLE,
    PUBLIC_MAP_DENSITY_FADE_END,
    PUBLIC_MAP_DENSITY_FADE_START,
    PUBLIC_MAP_MARKER_STYLE,
    PUBLIC_MAP_OVERVIEW_SITE_LIMIT,
    geolibre_project,
    public_map_marker_style,
    public_tiled_geolibre_project,
)
from navigator_app.map_tiles import (
    encode_public_map_tile,
    public_map_density_version,
    public_map_tile_bounds,
    public_map_tile_grid_size,
)


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


def test_density_and_circles_share_the_project_source_without_count_labels():
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
    layers = {layer["id"]: layer for layer in style["layers"]}
    density = layers[f"navigator-density-{MAP_LAYER_ID}"]
    circles = layers[f"navigator-marker-{MAP_LAYER_ID}"]
    overview = layers[f"navigator-marker-{MAP_LAYER_ID}-overview"]
    assert density["type"] == "heatmap"
    assert circles["type"] == "circle"
    assert circles["source"] == density["source"] == f"source-{MAP_LAYER_ID}"
    assert overview["source"] == density["source"]
    assert overview["maxzoom"] == PUBLIC_MAP_DENSITY_FADE_END
    assert overview["filter"] == ["<=", ["number", ["get", "point_count"], 1], PUBLIC_MAP_OVERVIEW_SITE_LIMIT]
    assert overview["paint"]["circle-opacity"][-4:] == [
        PUBLIC_MAP_DENSITY_FADE_START, 0.87, PUBLIC_MAP_DENSITY_FADE_END, 0,
    ]
    assert style["sources"][circles["source"]]["tiles"] == visible["source"]["tiles"] == [exact]
    assert density["paint"]["heatmap-weight"] == ["/", ["number", ["get", "point_count"], 1], 1000]
    assert density["maxzoom"] == PUBLIC_MAP_DENSITY_FADE_END
    assert density["paint"]["heatmap-opacity"][-4:] == [
        PUBLIC_MAP_DENSITY_FADE_START, 0.96, PUBLIC_MAP_DENSITY_FADE_END, 0,
    ]
    assert circles["paint"]["circle-opacity"][-4:-1] == [
        PUBLIC_MAP_DENSITY_FADE_START, 0, PUBLIC_MAP_DENSITY_FADE_END,
    ]
    assert circles["minzoom"] == PUBLIC_MAP_DENSITY_FADE_START
    assert f"navigator-count-{MAP_LAYER_ID}" not in layers
    layer_ids = list(layers)
    assert layer_ids.index(density["id"]) < layer_ids.index(circles["id"]) < layer_ids.index("label_city")
    assert layer_ids.index(density["id"]) < layer_ids.index(overview["id"]) < layer_ids.index("label_city")
    assert layer_ids.index(density["id"]) < layer_ids.index("waterway")

    # Area pages fit known bounds and keep their clickable circles available
    # even when a large region opens at overview zoom.
    project["metadata"]["areaId"] = "locadmin:example"
    area_style = public_map_marker_style(project=project, origin="http://localhost:8080")
    area_layers = {layer["id"]: layer for layer in area_style["layers"]}
    assert density["id"] not in area_layers
    assert overview["id"] not in area_layers
    assert "minzoom" not in area_layers[circles["id"]]
    assert area_layers[circles["id"]]["paint"]["circle-opacity"][0] == "case"


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


def test_adaptive_overview_only_increases_sampling_at_broad_zooms():
    assert [public_map_tile_grid_size(z) for z in range(6)] == [5, 5, 5, 8, 8, 8]
    assert [public_map_tile_grid_size(z, density_version="1") for z in range(6)] == [10, 10, 10, 14, 14, 8]
    assert [public_map_tile_grid_size(z, density_version="2") for z in range(6)] == [48, 48, 64, 64, 64, 20]
    assert public_map_tile_grid_size(5, density_version="2") == 2 * public_map_tile_grid_size(6)
    for zoom in range(6, 15):
        assert public_map_tile_grid_size(zoom, density_version="2") == public_map_tile_grid_size(zoom)
    assert public_map_tile_grid_size(12, density_version="2") is None

    assert public_map_density_version(4, "1") == "1"
    assert public_map_density_version(5, "1") is None
    assert public_map_density_version(5, "2") == "2"
    assert public_map_density_version(6, "2") is None
    assert public_map_density_version(3, "unknown") is None


def test_overview_tile_versions_preserve_filters_and_cached_detail_tiles():
    calls = []

    def tiles(**arguments):
        calls.append(arguments)
        return [{"longitude": 10, "latitude": 50, "group_count": 12, "aggregate": True}]

    repository = SimpleNamespace(
        assert_ready=lambda: {},
        public_map_tile_features=tiles,
        public_areas=SimpleNamespace(resolve=lambda identifier: SimpleNamespace(identifier=identifier)),
    )
    app = create_public_app(Settings(uri_release_version="1.6.0"), repository=repository)
    app.config["TESTING"] = True
    client = app.test_client()

    world = "/api/map/tiles/3/4/2.mvt?release=1.6.0&precision=exact&q=Hannover&source=fixture"
    for variant in ("", "&density=1", "&density=2", "&density=2"):
        assert client.get(world + variant).status_code == 200
    assert [call["density_version"] for call in calls] == [None, "1", "2"]
    assert all(call["query"] == "Hannover" and call["source"] == "fixture" for call in calls)

    local = "/api/map/tiles/12/2161/1323.mvt?release=1.6.0"
    plain_tile = client.get(local)
    density_tile = client.get(local + "&density=2")
    assert plain_tile.status_code == density_tile.status_code == 200
    assert plain_tile.data == density_tile.data
    assert len(calls) == 4 and calls[-1]["density_version"] is None

    area_tile = client.get("/api/areas/locadmin:test/map/tiles/3/4/2.mvt?release=1.6.0&density=2")
    assert area_tile.status_code == 200
    assert calls[-1]["area_identifier"] == "locadmin:test"
    assert calls[-1]["density_version"] is None


def test_filtered_tiled_project_uses_site_bounds_and_preserves_virtual_instrument_filter():
    bounds = [-73.968, 41.398, -73.968, 41.398]
    calls = []

    def summary(**filters):
        calls.append(filters)
        return {"bounds": bounds, "groupCount": 1, "exactGroupCount": 1} if filters["virtual_instrument"] else {}

    repository = SimpleNamespace(assert_ready=lambda: {}, public_map_summary=summary)
    app = create_public_app(Settings(uri_release_version="1.6.0"), repository=repository)
    app.config["TESTING"] = True
    client = app.test_client()
    selection = client.get("/api/map/project.geolibre.json?markers=2&precision=all&virtual_instrument=yes")
    assert selection.status_code == 200
    assert calls[-1]["virtual_instrument"] == "yes"
    project = selection.get_json()
    assert project["mapView"]["bbox"] == bounds
    assert project["mapView"]["center"] == bounds[:2]
    assert project["metadata"]["groupCount"] == 1
    assert "virtual_instrument=yes" in project["basemapStyleUrl"]
    assert all("virtual_instrument=yes" in layer["source"]["tiles"][0] for layer in project["layers"])
    fitted_style = client.get(project["basemapStyleUrl"]).get_json()
    circles = [layer for layer in fitted_style["layers"] if layer["id"].startswith("navigator-marker-")]
    assert circles and all("minzoom" not in layer for layer in circles)

    general = client.get("/api/map/project.geolibre.json?markers=2")
    assert general.status_code == 200
    assert "bbox" not in general.get_json()["mapView"]


def test_native_all_precision_style_reuses_one_tile_source_for_both_precision_classes():
    repository = SimpleNamespace(assert_ready=lambda: {})
    app = create_public_app(Settings(uri_release_version="1.6.0"), repository=repository)
    app.config["TESTING"] = True
    client = app.test_client()
    style_url = PUBLIC_MAP_MARKER_STYLE + "?release=1.6.0&precision=all&q=Winterhude"
    style = client.get(style_url + "&source_layout=combined").get_json()
    site_sources = {key: value for key, value in style["sources"].items() if key.startswith("source-modavis-")}
    assert set(site_sources) == {"source-modavis-combined-places-v1"}
    tile_url, = site_sources["source-modavis-combined-places-v1"]["tiles"]
    assert "precision=all" in tile_url
    assert "q=Winterhude" in tile_url

    layers = {layer["id"]: layer for layer in style["layers"]}
    density = layers[f"navigator-density-{MAP_LAYER_ID}"]
    assert density["source"] in site_sources
    assert "filter" not in density
    assert f"navigator-density-{FALLBACK_MAP_LAYER_ID}" not in layers
    for layer_id, fallback in ((MAP_LAYER_ID, False), (FALLBACK_MAP_LAYER_ID, True)):
        precision_filter = ["==", ["get", "coordinateFallback"], fallback]
        layer = layers[f"navigator-marker-{layer_id}"]
        assert layer["source"] in site_sources
        assert layer["filter"] == precision_filter
        overview = layers[f"navigator-marker-{layer_id}-overview"]
        assert overview["source"] in site_sources
        assert overview["filter"][:2] == ["all", precision_filter]

    legacy = client.get(style_url).get_json()
    assert f"source-{MAP_LAYER_ID}" in legacy["sources"]
    assert f"source-{FALLBACK_MAP_LAYER_ID}" in legacy["sources"]
    assert "source-modavis-combined-places-v1" not in legacy["sources"]


def test_native_precision_changes_keep_tile_and_overview_sources():
    app = create_public_app(Settings(uri_release_version="1.6.0"), repository=SimpleNamespace(assert_ready=lambda: {}))
    client = app.test_client()
    projection = PUBLIC_MAP_MARKER_STYLE + "?release=1.6.0&source_layout=combined&basemap_detail=viewport-v1&precision="
    styles = {scope: client.get(projection + scope).get_json() for scope in ("all", "exact", "fallback")}

    all_sources = styles["all"]["sources"]
    overview = all_sources["navigator-geography"]["data"]
    assert overview == "/basemap/assets-v2/geography-overview-v1.geojson"
    raw = (PUBLIC / overview.lstrip("/")).read_bytes()
    assert len(gzip.compress(raw)) < 200 * 1024
    features = json.loads(raw)["features"]
    assert {item["properties"]["kind"] for item in features} == {"land", "lakes", "border", "disputed-border", "country", "city"}
    assert {"Egypt", "Morocco", "Russia"}.issubset({
        item["properties"].get("name") for item in features
    })
    assert all_sources["openmaptiles"]["minzoom"] == 5
    for scope, layer_id in (("exact", MAP_LAYER_ID), ("fallback", FALLBACK_MAP_LAYER_ID)):
        assert styles[scope]["sources"] == all_sources
        layers = [layer for layer in styles[scope]["layers"] if layer["type"] == "heatmap"]
        assert [layer["id"] for layer in layers] == [f"navigator-density-{layer_id}"]
        assert layers[0]["filter"] == ["==", ["get", "coordinateFallback"], scope == "fallback"]
