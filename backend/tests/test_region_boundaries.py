import gzip
import json

from flask import Flask
from shapely.geometry import MultiPolygon, Point, box, mapping

from navigator_app.public_areas import AreaIndex
from navigator_app.region_boundaries import BOUNDARIES, BOUNDARY_VERSION, BoundaryIndex, geometry_bounds, register_region_boundaries


def area(identifier, role, title, **hierarchy):
    return {"identifier": identifier, "role": role, "title": title, "support": 1, "hierarchy": hierarchy}


def boundary(geometry, rank, names, roles, parents=()):
    label = geometry.representative_point()
    return {"source": "natural-earth", "rank": rank, "names": names, "roles": roles,
            "parents": parents, "label": [label.x, label.y], "geometry": mapping(geometry)}


def test_boundaries_require_unique_full_ancestry():
    areas = AreaIndex([
        area("locadmin:de", "country", "Deutschland"),
        area("locadmin:state", "region", "Niedersachsen", country="Deutschland"),
        area("locadmin:local", "municipality", "Oldenburg", region="Niedersachsen", country="Deutschland"),
        area("locadmin:other", "municipality", "Oldenburg", region="Schleswig-Holstein", country="Deutschland"),
        area("locadmin:ambiguous", "town", "Oldenburg", region="Niedersachsen", country="Deutschland"),
    ])
    geometries = [
        boundary(box(1, 1, 12, 12), 0, ["Deutschland", "Germany"], ["country"]),
        boundary(box(2, 2, 9, 9), 1, ["Lower Saxony", "Niedersachsen"], ["region"], [["Deutschland"]]),
        boundary(box(5, 5, 6, 6), 3, ["Oldenburg"], ["municipality"],
                 [["Niedersachsen"], ["Deutschland"]]),
        boundary(box(5, 6, 6, 7), 3, ["Oldenburg"], ["municipality", "town"],
                 [["Niedersachsen"], ["Deutschland"]]),
        boundary(box(4, 4, 5, 5), 3, ["Unknown"], ["municipality"],
                 [["Niedersachsen"], ["Deutschland"]]),
    ]
    index = BoundaryIndex(geometries, areas)
    assert [record["id"] for record in index.records] == ["locadmin:de", "locadmin:state", "locadmin:local"]
    assert [record["id"] for record, geometry in zip(index.records, index.shapes)
            if geometry.covers(Point(5.5, 5.5))] == ["locadmin:de", "locadmin:state", "locadmin:local"]
    assert b'"id":"locadmin:local"' not in index.viewport((5, 5, 7, 7), 9)
    assert b'"id":"locadmin:local"' in index.viewport((5, 5, 7, 7), 10)
    assert b'"id":"locadmin:local"' not in index.viewport((8, 8, 9, 9), 10)


def test_wrapped_viewport_and_fit_bounds():
    pair = MultiPolygon([box(174, -18, 180, -16), box(-180, -18, -177, -16)])
    assert geometry_bounds(pair) == [174, -18, 183, -16]
    areas = AreaIndex([area("locadmin:fiji", "country", "Fiji"), area("locadmin:elsewhere", "country", "Elsewhere")])
    index = BoundaryIndex([
        boundary(pair, 0, ["Fiji"], ["country"]),
        boundary(box(15, -18, 20, -16), 0, ["Elsewhere"], ["country"]),
    ], areas)
    assert b'"id":"locadmin:fiji"' in index.viewport((171, -20, -165, -13), 5)
    assert b'"id":"locadmin:elsewhere"' not in index.viewport((171, -20, -165, -13), 5)


def test_shipped_boundaries_distinguish_city_from_land_and_keep_repaired_polygons():
    land = "Freie Hansestadt Bremen"
    areas = AreaIndex([
        area("locadmin:bremen:land", "region", land, country="Deutschland"),
        area("locadmin:bremen:city", "municipality", "Bremen", region=land, country="Deutschland"),
        area("locadmin:bremerhaven", "municipality", "Bremerhaven", region=land, country="Deutschland"),
        area("locadmin:homonym", "municipality", "Bremen", country="Deutschland"),
        area("locadmin:schleswig", "region", "Schleswig-Holstein", country="Deutschland"),
        area("locadmin:stuttgart", "municipality", "Stuttgart", region="Baden-Württemberg", country="Deutschland"),
        area("locadmin:finland", "country", "Suomi"),
        area("locadmin:uusimaa", "region", "Uusimaa", country="Suomi"),
        area("locadmin:syddanmark", "region", "Region Syddanmark", country="Danmark"),
    ])
    with gzip.open(BOUNDARIES, "rt", encoding="utf-8") as stream:
        index = BoundaryIndex(json.load(stream), areas)
    by_area = {item["id"]: geometry for item, geometry in zip(index.records, index.shapes)}
    assert "locadmin:homonym" not in by_area

    # The Land covers both cities, but each city's polygon covers only itself.
    bremen, bremerhaven = Point(8.807, 53.075), Point(8.580, 53.548)
    assert by_area["locadmin:bremen:land"].covers(bremen) and by_area["locadmin:bremen:land"].covers(bremerhaven)
    assert by_area["locadmin:bremen:city"].covers(bremen) and not by_area["locadmin:bremen:city"].covers(bremerhaven)
    assert by_area["locadmin:bremerhaven"].covers(bremerhaven) and not by_area["locadmin:bremerhaven"].covers(bremen)
    view = (8.40, 52.93, 9.05, 53.66)
    assert b'"id":"locadmin:bremen:city"' not in index.viewport(view, 7)
    assert b'"id":"locadmin:bremen:city"' in index.viewport(view, 8)

    assert by_area["locadmin:schleswig"].covers(Point(10.123, 54.321))  # Kiel
    assert by_area["locadmin:stuttgart"].covers(Point(9.180, 48.777))
    vantaa = Point(25.037, 60.294)
    assert by_area["locadmin:finland"].covers(vantaa)
    assert by_area["locadmin:uusimaa"].covers(vantaa)
    assert by_area["locadmin:syddanmark"].covers(Point(10.388, 55.395))  # Odense


def test_region_endpoint_limits_queries_and_reuses_the_same_representation():
    app = Flask(__name__)
    register_region_boundaries(app, lambda: AreaIndex([area("locadmin:de", "country", "Deutschland")]))
    client = app.test_client()
    url = "/api/map/regions.geojson?bbox=5,46,16,56&zoom=3"
    response = client.get(url)
    assert response.status_code == 200
    assert response.content_type == "application/geo+json"
    assert [item["id"] for item in response.json["features"]] == ["locadmin:de"]
    assert client.get(url, headers={"If-None-Match": response.headers["ETag"]}).status_code == 304
    assert client.get(f"{url}&v={BOUNDARY_VERSION}").data == response.data
    for query in ("", "?bbox=1,2,nan,4&zoom=3", "?bbox=1,2,3,4&zoom=25",
                  "?bbox=1,2,3,4&zoom=3&zoom=5", "?bbox=1,4,3,2&zoom=3",
                  "?bbox=1,2,3,4&zoom=3&v=unknown"):
        assert client.get("/api/map/regions.geojson" + query).status_code == 400
