from contextlib import contextmanager
from types import SimpleNamespace
from urllib.parse import unquote

import pytest
from werkzeug.datastructures import MultiDict

from navigator_app import public_areas
from navigator_app.public_repository import PublicReleaseRepository


LOWER_SAXONY = "locadmin:6d7c300a7d6c613086981f120595002474fa100ae6a77df8"
HAMBURG = "locadmin:hamburg"
WINTERHUDE = "locadmin:a26265a2d2ef46e15626e6f6c7ccd860da006ea57738dca2"


def indexed_area(identifier, title, role, support=1, **hierarchy):
    return {"identifier": identifier, "title": title, "role": role, "hierarchy": hierarchy, "support": support}


@pytest.fixture
def index():
    return public_areas.AreaIndex([
        indexed_area("locadmin:germany", "Deutschland", "country"),
        indexed_area(LOWER_SAXONY, "Niedersachsen", "region", country="Deutschland"),
        indexed_area("locadmin:unrelated", "Niedersachsen", "region", country="A different country"),
        indexed_area(HAMBURG, "Hamburg", "municipality", support=23, country="Deutschland"),
        indexed_area("locadmin:berks", "Hamburg", "municipality", county="Berks", country="United States"),
        indexed_area(WINTERHUDE, "Winterhude", "district", municipality="Hamburg", country="Deutschland"),
        indexed_area("locadmin:street", "Organ Street", "street", municipality="Hamburg"),
    ])


def test_lookup_uses_full_names_context_or_a_retained_identifier(index):
    for query in ("Hamburg Winterhude", "winterhude, Hamburg"):
        assert [(area.identifier, field) for area, field in index.matches(query, 6)] == [(WINTERHUDE, "context")]
    assert not index.matches("Hamburg Winter", 6)
    assert not index.matches("Organ Street", 6)
    assert [(area.identifier, field) for area, field in index.matches(WINTERHUDE, 6)] == [(WINTERHUDE, "identifier")]


def test_named_alias_and_ambiguous_names(index):
    [(saxony, field)] = index.matches("lower saxony", 6)
    assert field == "name"
    assert saxony.identifier == LOWER_SAXONY
    assert saxony.link() == {
        "id": LOWER_SAXONY, "title": "Niedersachsen", "type": "region",
        "context": "Deutschland", "url": "/areas/niedersachsen~bXwwCn1sYTCGmB8SBZUAJHT6EArmp334",
    }
    [(german_hamburg, _), (american_hamburg, _)] = index.matches("hamburg", 6)
    assert german_hamburg.identifier == HAMBURG
    assert american_hamburg.link()["context"] == "Berks, United States"
    assert [area.identifier for area, _ in index.matches("Hamburg Berks", 6)] == ["locadmin:berks"]


def test_short_route_retains_every_identifier_byte_and_survives_label_edits(index):
    area = index.by_id[WINTERHUDE]
    route = unquote(area.link()["url"].removeprefix("/areas/"))
    assert route == "winterhude~omJlotLvRuFWJub2x8zYYNoAbqV3ONyi"
    assert public_areas._identifier_from_route(route) == WINTERHUDE
    assert public_areas._identifier_from_route(route.replace("winterhude", "former-name")) == WINTERHUDE
    assert public_areas._identifier_from_route(route + "!") is None
    assert index.matches(route, 1) == [(area, "identifier")]


def test_finder_suggests_names_and_qualified_prefixes_without_broadening_discovery(index):
    for query in ("haMBurg Wint", "wInt Hamburg", "wint Hamburg Deutschland", "Winterhude, Hamburg, Deutschland"):
        assert [area.identifier for area, _ in index.suggest(query, 6)] == [WINTERHUDE]
    assert index.matches("Hamburg Wint", 6) == []
    assert index.suggest("w", 6) == []
    assert [area.identifier for area, _ in index.suggest("lower sax", 6)] == [LOWER_SAXONY]


def test_detail_returns_distinct_counts_and_independent_pages(index, monkeypatch):
    observed_queries = []

    class Connection:
        def execute(self, sql, bound):
            observed_queries.append((sql, bound))
            return SimpleNamespace(fetchone=lambda: {
                "parents": ["locadmin:germany"], "children": [WINTERHUDE],
                "organ_count": 2, "place_count": 1, "site_count": 1,
                "map_data": {"group_count": 1, "exact_group_count": 1, "fallback_group_count": 0, "inline_groups": []},
                "organs": [{"id": "MDVS:ENTY:TEST-0001-A", "title": "Example Organ"}],
            })

    @contextmanager
    def read(_settings):
        yield Connection()

    monkeypatch.setattr(public_areas, "connect", read)
    areas = public_areas.PublicAreas(None)
    areas._index = index
    area = areas.detail(HAMBURG, child_offset=1, organ_offset=1)
    assert area["statistics"] == {"organs": 2, "places": 1, "mappedSites": 1}
    assert area["mapCoordinates"] == {"exact": 1, "fallback": 0}
    assert area["children"] == {"items": [], "total": 1, "offset": 1, "limit": 12}
    assert area["organs"] == {
        "items": [{"id": "MDVS:ENTY:TEST-0001-A", "title": "Example Organ", "url": "/organs/TEST-0001-A"}],
        "total": 2, "offset": 1, "limit": 12,
    }
    assert [parent["title"] for parent in area["parents"]] == ["Deutschland"]
    assert observed_queries[0][1] == {
        "identifier": HAMBURG, "organ_offset": 1, "organ_limit": 12, "inline_limit": public_areas.INLINE_MAP_SITES,
    }
    assert areas.map_data(index.by_id[HAMBURG]) == {
        "group_count": 1, "exact_group_count": 1, "fallback_group_count": 0, "inline_groups": [],
    }
    assert areas.detail("unknown", child_offset=0, organ_offset=0) is None
    assert len(observed_queries) == 1


@pytest.mark.parametrize("args", [
    [("q", "a"), ("q", "b")], [("unknown", "area")], [("q", "x" * 201)],
])
def test_lookup_rejects_ambiguous_or_unbounded_queries(args):
    with pytest.raises(ValueError):
        public_areas.validate_lookup(MultiDict(args))


@pytest.mark.parametrize("args", [
    [("organ_offset", "-1")], [("organ_offset", "0"), ("organ_offset", "1")],
    [("child_offset", "1000001")], [("child_offset", "１")], [("q", "area")],
])
def test_detail_rejects_invalid_page_offsets(args):
    with pytest.raises(ValueError):
        public_areas.area_page_offsets(MultiDict(args))


def test_area_view_fits_documented_extent_without_an_inferred_polygon():
    bounds = [9.9842, 53.5849, 10.0221, 53.6085]
    view = public_areas.area_map_view(bounds)
    assert view["center"] == [(bounds[0] + bounds[2]) / 2, (bounds[1] + bounds[3]) / 2]
    assert 11 < view["zoom"] <= 14
    assert public_areas.area_map_view([9.9842, 53.5849, 9.9842, 53.5849])["zoom"] == 14


def test_map_area_summary_counts_distinct_organs_at_selected_precision(index):
    area = index.by_id[WINTERHUDE]
    organ_counts = {
        "mapped_organ_count": 6, "exact_mapped_organ_count": 5, "fallback_mapped_organ_count": 3,
    }
    repo = PublicReleaseRepository.__new__(PublicReleaseRepository)
    repo.public_areas = SimpleNamespace(
        resolve=index.by_id.get,
        map_data=lambda _area: {
            "exact_group_count": 4, "fallback_group_count": 2, "mapped_organ_counts": organ_counts,
        },
    )
    exact = repo.public_map_area_summary(WINTERHUDE, coordinate_scope="exact")
    fallback = repo.public_map_area_summary(WINTERHUDE, coordinate_scope="fallback")
    all_sites = repo.public_map_area_summary(WINTERHUDE, coordinate_scope="all")
    assert exact["area"] == area.link()
    assert exact["countsScope"] == "documented_area_membership"
    assert (exact["groupCount"], exact["mappedOrganCount"], exact["fallbackGroupCount"]) == (4, 5, 0)
    assert (fallback["groupCount"], fallback["mappedOrganCount"], fallback["exactGroupCount"]) == (2, 3, 0)
    # One organ can be at multiple sites or have both precision classes.
    assert (all_sites["groupCount"], all_sites["mappedOrganCount"]) == (6, 6)
    assert repo.public_map_area_summary("locadmin:unknown", coordinate_scope="all") is None


def test_map_area_summary_reuses_map_catalogue_filters(index):
    repo = PublicReleaseRepository.__new__(PublicReleaseRepository)
    calls = []

    def counts(area, clauses, params):
        calls.append((area.identifier, clauses, params))
        return {"exact_group_count": 1, "fallback_group_count": 0, "exact_mapped_organ_count": 2}

    repo.public_areas = SimpleNamespace(resolve=index.by_id.get, filtered_map_counts=counts)
    summary = repo.public_map_area_summary(WINTERHUDE, coordinate_scope="exact", query="Organ", source="fixture")
    assert (summary["groupCount"], summary["mappedOrganCount"]) == (1, 2)
    identifier, clauses, params = calls[0]
    assert identifier == WINTERHUDE
    assert any("organ_search_document" in clause for clause in clauses)
    assert any("source_membership" in clause for clause in clauses)
    assert params["source"] == "fixture"
