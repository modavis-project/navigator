from contextlib import contextmanager
from types import SimpleNamespace

import pytest

from navigator_app import public_repository
from navigator_app.public_relocations import matches_endpoint_filter, movement_context, transfer_endpoints
from navigator_app.public_repository import PublicReleaseRepository


UNMAPPED = {
    "eventMdvsId": "example:two-endpoints",
    "status": "endpoint_coordinates_unresolved",
    "evidenceSummary": "Source-reported endpoints",
    "origin": {"label": "Old church", "coordinatePrecision": "unresolved"},
    "destination": {"label": "New church", "coordinatePrecision": "unresolved"},
}


def test_documented_endpoints_preserve_source_roles_without_requiring_coordinates():
    places = [
        {"role": "destination", "wording": "Choir chapel", "targetId": "MDVS:LOCN:PLACE", "evidencePath": "history[0]"},
        {"role": "current", "wording": "Present church"},
        {"role": "origin", "wording": "  "},
    ]
    endpoints = transfer_endpoints([], places)
    assert endpoints == {
        "origin": [],
        "destination": [{
            "title": "Choir chapel", "pageUrl": "/places/PLACE", "sourcePath": "history[0]",
            "coordinatePrecision": "unresolved",
        }],
    }
    assert matches_endpoint_filter(endpoints, "either")
    assert matches_endpoint_filter(endpoints, "destination")
    assert not matches_endpoint_filter(endpoints, "origin")
    assert not matches_endpoint_filter(endpoints, "both")


def test_unmapped_movement_pair_qualifies_as_documented_and_prefers_a_mapped_pair_when_available():
    duplicated = [{"role": "origin", "wording": "Old church"}]
    endpoints = transfer_endpoints([UNMAPPED], duplicated)
    assert [item["title"] for item in endpoints["origin"]] == ["Old church"]
    assert matches_endpoint_filter(endpoints, "both")
    assert movement_context([UNMAPPED])["routeAvailable"] is False
    mapped = {
        **UNMAPPED,
        "status": "linked_complete_route",
        "origin": {"label": "Mapped origin", "coordinates": [3, 55]},
        "destination": {"label": "Mapped destination", "coordinates": [4, 54]},
    }
    context = movement_context([UNMAPPED, mapped])
    assert context["routeAvailable"]
    assert context["origin"]["title"] == "Mapped origin"


@pytest.mark.parametrize(("route", "selected_ids"), [
    ("origin", ["both", "origin"]),
    ("destination", ["both", "destination"]),
    ("either", ["both", "destination", "origin"]),
    ("both", ["both"]),
    ("mapped", ["both"]),
    ("unresolved", ["both"]),
])
def test_event_list_binds_route_and_endpoint_name_selection(monkeypatch, route, selected_ids):
    queries = []

    class Connection:
        def execute(self, sql, parameters):
            queries.append((sql, dict(parameters)))
            return SimpleNamespace(fetchone=lambda: {"count": 0}, fetchall=lambda: [])

    @contextmanager
    def connect(_):
        yield Connection()

    monkeypatch.setattr(public_repository, "connect", connect)
    repo = object.__new__(PublicReleaseRepository)
    repo.settings = None
    repo._public_event_facets = lambda: []
    repo._event_context = lambda rows: rows
    repo.public_relocation_movements = lambda: [{**UNMAPPED, "eventMdvsId": "both", "status": "linked_complete_route"}]
    repo._public_transfer_endpoints = lambda: {
        "origin": transfer_endpoints([], [{"role": "origin", "wording": "Memorial Hall"}]),
        "destination": transfer_endpoints([], [{"role": "destination", "wording": "St Anne’s"}]),
        "both": transfer_endpoints([UNMAPPED], []),
        "current": transfer_endpoints([], [{"role": "current", "wording": "Memorial Hall"}]),
    }
    result = repo.list_events(route=route, query="MEMORIAL")
    assert result["filters"]["route"] == route
    assert len(queries) == 2
    for sql, parameters in queries:
        assert "e.controlled_event_type='transfer'" in sql
        assert ("not (e.event_id=ANY(%(route_ids)s))" in sql) == (route == "unresolved")
        assert "or e.event_id=ANY(%(endpoint_name_ids)s)" in sql
        assert parameters["route_ids"] == selected_ids
        assert parameters["endpoint_name_ids"] == ["origin"]
