"""Shared read model for restored, explicitly qualified historical endpoints."""
import json
from urllib.parse import quote

CONTRACT='modavis.public-relocation-evidence/v1'

ENDPOINT_ROLES = ("origin", "destination")
ENDPOINT_FILTERS = frozenset((*ENDPOINT_ROLES, "either", "both"))
MAP_FILTERS = frozenset(("mapped", "unresolved"))
EVENT_ROUTE_FILTERS = ENDPOINT_FILTERS | MAP_FILTERS


def _qualified_endpoint(value):
    if not value or not (title := (value.get("label") or "").strip()):
        return None
    precision = {
        "locality": "Approximate locality",
        "venue": "Venue coordinates",
        "exact_venue": "Venue coordinates",
        "unresolved": "Coordinates unresolved",
    }.get(value.get("coordinatePrecision"), "Qualified coordinates")
    evidence = value.get("coordinateEvidence")
    return {
        **value,
        "title": title,
        "pageUrl": value.get("placeUrl"),
        "coordinateEvidence": " · ".join(filter(None, (precision, evidence))),
    }


def transfer_endpoints(movements, places):
    """Collect attested roles for one event while keeping their source wording."""
    by_role = {role: {} for role in ENDPOINT_ROLES}
    for item in movements:
        for role in ENDPOINT_ROLES:
            if endpoint := _qualified_endpoint(item.get(role)):
                by_role[role].setdefault(endpoint["title"], {
                    key: endpoint[key] for key in ("title", "pageUrl", "coordinatePrecision", "coordinates", "sourcePath")
                    if key in endpoint
                })
    for place in places:
        role, wording = place.get("role"), (place.get("wording") or "").strip()
        if role in by_role and wording:
            target = place.get("targetId") or ""
            by_role[role].setdefault(wording, {
                "title": wording,
                "pageUrl": "/places/" + quote(target.removeprefix("MDVS:LOCN:"), safe="-._~") if target.startswith("MDVS:LOCN:") else None,
                "sourcePath": place.get("evidencePath"),
                "coordinatePrecision": "unresolved",
            })
    return {role: list(endpoints.values()) for role, endpoints in by_role.items()}


def matches_endpoint_filter(endpoints, choice):
    if choice in ENDPOINT_ROLES:
        return bool(endpoints[choice])
    if choice == "both":
        return all(endpoints.values())
    return any(endpoints.values())


def movement_context(items):
    if not items:
        return {"status": "unresolved"}
    mapped = next((item for item in items if item["status"] == "linked_complete_route"), None)
    shown = mapped or items[0]
    return {
        "status": "mapped" if mapped else "unresolved",
        "routeAvailable": bool(mapped),
        "movements": items,
        **{role: _qualified_endpoint(shown.get(role)) for role in ENDPOINT_ROLES},
        "summary": shown["evidenceSummary"],
        "mapUrl": "/map?mode=events&movement=" + shown["eventMdvsId"],
    }

def load(rows,organ_id=None,event_ids=None):
    if rows('select value from metadata where key=?',('public_relocation_evidence_contract',))!=[{'value':CONTRACT}]:return []
    query='select payload_json from relocation_evidence';args=()
    if organ_id:query+=' where organ_mdvs_id=?';args=(organ_id,)
    query+=' order by activity_id'
    values=[json.loads(r['payload_json']) for r in rows(query,args)]
    return [x for x in values if event_ids is None or x['eventMdvsId'] in event_ids]
