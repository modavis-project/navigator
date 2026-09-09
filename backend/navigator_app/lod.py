"""Conservative Release 1.5 linked-data projections for canonical organs.

These serializers expose read-only mapped views of an accepted MODAVIS organ
record.  They do not rewrite the normalized database, claim full conformance
with an external ingestion profile, or authorize publication of the private
Release 1.5 candidate.
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping
import hashlib
import json
from typing import Any
from urllib.parse import quote

from .resource_families import require_resource_family
from .uri_policy import UriPolicy, parse_identifier


CIDOC_PROFILE = {
    "key": "cidoc",
    "label": "CIDOC CRM",
    "version": "7.1.3",
    "profile": "https://cidoc-crm.org/get-last-official-release",
    "namespace": "http://www.cidoc-crm.org/cidoc-crm/",
    "mappingState": "bounded_read_only_projection",
}
PON_PROFILE = {
    "key": "pon",
    "label": "Polifonia Ontology Network — Organs",
    "version": "1.0",
    "profile": "https://w3id.org/polifonia/ontology/organs/1.0/",
    "namespace": "https://w3id.org/polifonia/ontology/organs/",
    "mappingState": "bounded_read_only_projection",
}
MODAVIS_PROFILE = {
    "key": "modavis",
    "label": "MODAVIS",
    "version": "1.5",
    "profile": "https://w3id.org/modavis/ontology/0.1.0/",
    "namespace": "https://w3id.org/modavis/ontology/0.1.0/",
    "mappingState": "native_release_projection",
}
MODAVIS_0153_PROFILE = {
    "key": "modavis",
    "label": "MODAVIS Ontology Network",
    "version": "0.1.0",
    "profile": "https://w3id.org/modavis/ontology/0.1.0",
    "namespace": "https://w3id.org/modavis/ontology/core#",
    "mappingState": "native_release_projection",
}
EDM_PROFILE = {
    "key": "edm",
    "label": "Europeana Data Model",
    "version": "Definition 5.2.8 / Mapping Guidelines 2.4",
    "profile": "https://pro.europeana.eu/page/edm-documentation",
    "namespace": "http://www.europeana.eu/schemas/edm/",
    "mappingState": "edm_compatible_preview_not_ingestion_package",
}
PROFILES = {
    item["key"]: item
    for item in (MODAVIS_PROFILE, CIDOC_PROFILE, PON_PROFILE, EDM_PROFILE)
}


def _supports_complete_entity_exports(release_version: str) -> bool:
    try:
        parts = tuple(int(part) for part in release_version.split("."))
    except ValueError:
        return False
    return parts >= (1, 5, 3)
STANDARD_ALIASES = {
    "modavis": "modavis",
    "native": "modavis",
    "cidoc": "cidoc",
    "cidoc-crm": "cidoc",
    "crm": "cidoc",
    "pon": "pon",
    "polifonia": "pon",
    "edm": "edm",
    "europeana": "edm",
}


def normalize_standard(value: str) -> str | None:
    return STANDARD_ALIASES.get(str(value or "").strip().lower())


def _first(*values: Any, fallback: Any = None) -> str | None:
    for value in values:
        if value not in (None, ""):
            text = str(value).strip()
            if text:
                return text
    return str(fallback).strip() if fallback not in (None, "") else None


def _list(value: Any) -> list[Any]:
    return list(value) if isinstance(value, (list, tuple)) else []


def _mapping(value: Any) -> Mapping[str, Any]:
    return value if isinstance(value, Mapping) else {}


def _compact(value: Any) -> Any:
    if isinstance(value, Mapping):
        result = {key: _compact(item) for key, item in value.items()}
        return {key: item for key, item in result.items() if item not in (None, "", [], {})}
    if isinstance(value, list):
        return [item for raw in value if (item := _compact(raw)) not in (None, "", [], {})]
    return value


def _base(base_url: str) -> str:
    return str(base_url or "").rstrip("/")


def _coerce_policy(*, policy: UriPolicy | None, base_url: str | None) -> UriPolicy:
    if policy is not None:
        if policy.policy_version not in {"1", "2"}:
            raise ValueError(f"unsupported URI policy version: {policy.policy_version}")
        return policy
    if base_url:
        explicit = _base(base_url)
        return UriPolicy(
            canonical_id_base=explicit,
            resolver_base=explicit,
            human_base=explicit,
            data_base=explicit,
            ontology_base="https://w3id.org/modavis/ontology/0.1.0/",
            dataset_uri=f"{explicit}/dataset/pod",
            dataset_version_uri=f"{explicit}/dataset/pod/version/1.5",
        )
    return UriPolicy()


def _blank_id(scope: str, value: Any) -> str:
    digest = hashlib.sha256(f"{scope}\0{value}".encode("utf-8")).hexdigest()[:20]
    return f"_:{scope}-{digest}"


def _organ_uri(organ: Mapping[str, Any], policy: UriPolicy) -> str:
    mdvs_id = _first(organ.get("mdvsId"), organ.get("id"), fallback="organ")
    return policy.identity_uri(str(mdvs_id))


def _entity_uri(mdvs_id: Any, page_url: Any, policy: UriPolicy, *, fallback: str) -> str:
    if mdvs_id:
        try:
            return policy.identity_uri(str(mdvs_id))
        except ValueError:
            pass
    if page_url:
        return f"{policy.human_base}{page_url}" if str(page_url).startswith("/") else str(page_url)
    return _blank_id("entity", fallback)


def _builders(organ: Mapping[str, Any], policy: UriPolicy) -> list[dict[str, Any]]:
    candidates: list[dict[str, Any]] = []
    header_label = _first(organ.get("builder"), organ.get("builderLabel"))
    if header_label:
        candidates.append(
            {
                "label": header_label,
                "mdvsId": _first(organ.get("builderMdvsId")),
                "pageUrl": _first(organ.get("builderUrl")),
                "actorType": "organization"
                if "/organizations/" in str(organ.get("builderUrl") or "")
                else "person",
            }
        )
    for item in _list(organ.get("related")):
        if not isinstance(item, Mapping):
            continue
        relation = " ".join(
            str(item.get(key) or "")
            for key in ("kind", "relationship", "relation", "roles")
        ).lower()
        if not any(token in relation for token in ("builder", "maker", "construction", "organ-building")):
            continue
        candidates.append(
            {
                "label": _first(item.get("label"), item.get("name"), fallback="Builder"),
                "mdvsId": _first(item.get("mdvsId"), item.get("id")),
                "pageUrl": _first(item.get("entityPageUrl"), item.get("pageUrl")),
                "actorType": "organization"
                if "/organizations/" in str(item.get("entityPageUrl") or item.get("pageUrl") or "")
                else "person",
            }
        )
    seen: set[tuple[str, str]] = set()
    result = []
    for index, item in enumerate(candidates):
        key = (str(item.get("mdvsId") or ""), str(item.get("label") or "").casefold())
        if key in seen:
            continue
        seen.add(key)
        result.append(
            {
                **item,
                "uri": _entity_uri(
                    item.get("mdvsId"),
                    item.get("pageUrl"),
                    policy,
                    fallback=f"actor:{index}:{item.get('label') or 'builder'}",
                ),
            }
        )
    return result


def _place(organ: Mapping[str, Any], policy: UriPolicy) -> dict[str, Any] | None:
    label = _first(organ.get("location"), organ.get("placeLabel"))
    mdvs_id = _first(organ.get("placeMdvsId"))
    page_url = _first(organ.get("placeUrl"))
    if not (label or mdvs_id):
        return None
    value = {
        "label": label or mdvs_id,
        "mdvsId": mdvs_id,
        "uri": _entity_uri(mdvs_id, page_url, policy, fallback=f"place:{label}"),
    }
    latitude = organ.get("latitude")
    longitude = organ.get("longitude")
    if latitude is not None and longitude is not None:
        value["latitude"] = latitude
        value["longitude"] = longitude
    return value


def _identifiers(organ: Mapping[str, Any]) -> list[dict[str, str]]:
    values: list[dict[str, str]] = []
    for item in _list(organ.get("identifiers")):
        if not isinstance(item, Mapping):
            continue
        identifier = _first(item.get("value"), item.get("identifier"))
        if identifier:
            values.append(
                {
                    "scheme": _first(item.get("scheme"), fallback="identifier"),
                    "value": identifier,
                }
            )
    mdvs_id = _first(organ.get("mdvsId"))
    if mdvs_id and not any(item["value"] == mdvs_id for item in values):
        values.insert(0, {"scheme": "MODAVIS", "value": mdvs_id})
    return values


def _profile_metadata(profile: Mapping[str, Any], policy: UriPolicy) -> dict[str, Any]:
    return {
        "standard": profile["label"],
        "profileVersion": profile["version"],
        "profileUri": profile["profile"],
        "mappingState": profile["mappingState"],
        "release": policy.release_version,
        "releaseState": (
            "public_release_active"
            if policy.publication_state == "active"
            else "private_stable_candidate"
        ),
        "publicationState": policy.publication_state,
        "publicationAuthorized": policy.publication_state == "active",
        "sourceModelMutation": False,
        "canonicalDataset": policy.dataset_uri,
        "datasetVersion": policy.dataset_version_uri,
        "uriPolicy": policy.policy_key,
    }


def modavis_jsonld(
    organ: Mapping[str, Any],
    *,
    policy: UriPolicy | None = None,
    base_url: str | None = None,
) -> dict[str, Any] | list[dict[str, Any]]:
    """Return the native, release-bound MODAVIS JSON-LD representation."""
    policy = _coerce_policy(policy=policy, base_url=base_url)
    if policy.policy_version == "2":
        from .entity_exports import serialize_entity
        body, _, _ = serialize_entity("organ", organ, "modavis", "jsonld", policy)
        return json.loads(body)

    organ_uri = _organ_uri(organ, policy)
    mdvs_id = _first(organ.get("mdvsId"), organ.get("id"), fallback="organ")
    modern = _supports_complete_entity_exports(policy.release_version)
    profile = MODAVIS_0153_PROFILE if modern else MODAVIS_PROFILE
    payload = {
        "@context": {
            "modavis": profile["namespace"],
            **({"modorgan": "https://w3id.org/modavis/ontology/organ#"} if modern else {}),
            "schema": "https://schema.org/",
            "dcterms": "http://purl.org/dc/terms/",
            "name": "schema:name",
            "identifier": "schema:identifier",
            "url": {"@id": "schema:url", "@type": "@id"},
            "isPartOf": {"@id": "dcterms:isPartOf", "@type": "@id"},
        },
        "@id": organ_uri,
        "@type": "modorgan:PipeOrgan" if modern else "modavis:PipeOrgan",
        "name": _first(organ.get("title"), organ.get("label"), fallback=mdvs_id),
        "identifier": [item["value"] for item in _identifiers(organ)],
        "url": policy.human_uri("organ", str(mdvs_id)),
        "isPartOf": policy.dataset_version_uri,
        "modavis:releaseVersion": policy.release_version,
        "modavis:publicationState": policy.publication_state,
        "_modavisMapping": _profile_metadata(profile, policy),
    }
    place = _place(organ, policy)
    if place:
        payload["schema:location"] = {
            "@id": place["uri"],
            "name": place["label"],
        }
    builders = _builders(organ, policy)
    if builders:
        payload["modavis:builder"] = [
            {"@id": item["uri"], "name": item["label"]} for item in builders
        ]
    return _compact(payload)


def cidoc_jsonld(
    organ: Mapping[str, Any],
    *,
    policy: UriPolicy | None = None,
    base_url: str | None = None,
) -> dict[str, Any] | list[dict[str, Any]]:
    policy = _coerce_policy(policy=policy, base_url=base_url)
    if policy.policy_version == "2":
        from .entity_exports import serialize_entity
        body, _, _ = serialize_entity("organ", organ, "cidoc", "jsonld", policy)
        return json.loads(body)

    crm = CIDOC_PROFILE["namespace"]
    organ_uri = _organ_uri(organ, policy)
    builders = _builders(organ, policy)
    place = _place(organ, policy)
    graph: list[dict[str, Any]] = []
    identifier_nodes = []
    for item in _identifiers(organ):
        node_uri = _blank_id("identifier", f"{organ_uri}:{item['scheme']}:{item['value']}")
        identifier_nodes.append({"@id": node_uri})
        graph.append(
            {
                "@id": node_uri,
                "@type": "crm:E42_Identifier",
                "rdfs:label": item["value"],
                "crm:P2_has_type": {"@value": item["scheme"]},
            }
        )
    production_uri = _blank_id("production", organ_uri)
    location_property = (
        "crm:P53_has_former_or_current_location"
        if policy.release_version == "1.5.1"
        and _mapping(organ.get("locationReadiness")).get("state") == "historical_coordinates"
        else "crm:P55_has_current_location"
    )
    organ_node: dict[str, Any] = {
        "@id": organ_uri,
        "@type": "crm:E22_Human-Made_Object",
        "rdfs:label": _first(organ.get("title"), fallback=organ.get("mdvsId")),
        "crm:P1_is_identified_by": identifier_nodes,
        "crm:P108i_was_produced_by": {"@id": production_uri} if builders else None,
        location_property: {"@id": place["uri"]} if place else None,
        "modavis:documentedStateSummary": organ.get("documentedStateSummary"),
    }
    graph.insert(0, _compact(organ_node))
    if builders:
        graph.append(
            {
                "@id": production_uri,
                "@type": "crm:E12_Production",
                "crm:P108_has_produced": {"@id": organ_uri},
                "crm:P14_carried_out_by": [{"@id": item["uri"]} for item in builders],
                "rdfs:label": f"Production of {_first(organ.get('title'), fallback='pipe organ')}",
            }
        )
        graph.extend(
            {
                "@id": item["uri"],
                "@type": "crm:E39_Actor",
                "rdfs:label": item["label"],
            }
            for item in builders
        )
    if place:
        graph.append(
            _compact(
                {
                    "@id": place["uri"],
                    "@type": "crm:E53_Place",
                    "rdfs:label": place["label"],
                    "schema:geo": {
                        "@type": "schema:GeoCoordinates",
                        "schema:latitude": place.get("latitude"),
                        "schema:longitude": place.get("longitude"),
                    }
                    if place.get("latitude") is not None
                    else None,
                }
            )
        )
    return _compact(
        {
            "@context": {
                "crm": crm,
                "modavis": policy.ontology_base,
                "rdfs": "http://www.w3.org/2000/01/rdf-schema#",
                "schema": "https://schema.org/",
            },
            "@graph": graph,
            "modavis:mappingProfile": _profile_metadata(CIDOC_PROFILE, policy),
        }
    )


_PON_COMPONENT_CLASSES = {
    "division": "organ:Division",
    "keyboard": "organ:Keyboard",
    "manual": "organ:ManualKeyboard",
    "pedal": "organ:PedalKeyboard",
    "stop": "organ:DivisionStop",
    "rank": "organ:StopRank",
    "pipe": "organ:Pipe",
    "wind system": "organ:WindSystem",
    "wind_system": "organ:WindSystem",
    "console": "organ:Console",
}


def _pon_components(organ: Mapping[str, Any], organ_uri: str) -> list[dict[str, Any]]:
    result = []
    for group in _list(organ.get("componentHierarchy")):
        if not isinstance(group, Mapping):
            continue
        for item in _list(group.get("items")):
            if not isinstance(item, Mapping):
                continue
            kind = str(_first(item.get("kind"), group.get("id"), fallback="component")).lower()
            class_name = _PON_COMPONENT_CLASSES.get(kind)
            if not class_name:
                continue
            component_id = _first(item.get("mdvsId"), item.get("id"), fallback=f"component-{len(result)}")
            result.append(
                {
                    "@id": _blank_id("component", f"{organ_uri}:{component_id}"),
                    "@type": class_name,
                    "rdfs:label": _first(item.get("label"), fallback=component_id),
                    "modavis:sourceComponentId": component_id,
                }
            )
    return result


def pon_jsonld(
    organ: Mapping[str, Any],
    *,
    policy: UriPolicy | None = None,
    base_url: str | None = None,
) -> dict[str, Any] | list[dict[str, Any]]:
    policy = _coerce_policy(policy=policy, base_url=base_url)
    if policy.policy_version == "2":
        from .entity_exports import serialize_entity
        body, _, _ = serialize_entity("organ", organ, "pon", "jsonld", policy)
        return json.loads(body)

    organ_uri = _organ_uri(organ, policy)
    builders = _builders(organ, policy)
    place = _place(organ, policy)
    components = _pon_components(organ, organ_uri)
    project_uri = _blank_id("project", organ_uri)
    role_nodes = []
    graph: list[dict[str, Any]] = []
    require_resource_family("role")
    builder_role_uri = f"{policy.dataset_version_uri}/role/organ-builder"
    if builders:
        graph.append(
            {
                "@id": builder_role_uri,
                "@type": "core:Role",
                "rdfs:label": "organ builder",
                "dcterms:isPartOf": {"@id": policy.dataset_version_uri},
            }
        )
    for index, builder in enumerate(builders):
        role_uri = _blank_id("agent-role", f"{project_uri}:{builder['uri']}:{index}")
        role_nodes.append({"@id": role_uri})
        graph.extend(
            [
                {
                    "@id": role_uri,
                    "@type": "core:AgentRole",
                    "arco:hasAgent": {"@id": builder["uri"]},
                    "arco:hasRole": {"@id": builder_role_uri},
                },
                {
                    "@id": builder["uri"],
                    "@type": "arco:Agent",
                    "rdfs:label": builder["label"],
                },
            ]
        )
    project = {
        "@id": project_uri,
        "@type": "arco:Project",
        "core:hasAgentRole": role_nodes,
        "arco:hasPlace": {"@id": place["uri"]} if place else None,
        "rdfs:label": f"Documented organ project for {_first(organ.get('title'), fallback='pipe organ')}",
    }
    pitch = _first(
        _mapping(_mapping(organ.get("technicalEvidence")).get("pitch")).get("preferredValue"),
        _mapping(organ.get("specification")).get("pitch"),
    )
    tuning = _first(
        _mapping(_mapping(organ.get("technicalEvidence")).get("temperament")).get("preferredValue"),
        _mapping(organ.get("specification")).get("tuning"),
    )
    graph.insert(
        0,
        _compact(
            {
                "@id": organ_uri,
                "@type": "organ:Organ",
                "rdfs:label": _first(organ.get("title"), fallback=organ.get("mdvsId")),
                "arco:isDescribedBy": {"@id": project_uri},
                "core:hasPart": [{"@id": item["@id"]} for item in components],
                "organ:hasPitch": pitch,
                "organ:hasTuning": tuning,
                "dcterms:identifier": [item["value"] for item in _identifiers(organ)],
            }
        ),
    )
    graph.append(_compact(project))
    graph.extend(components)
    if place:
        graph.append(
            {
                "@id": place["uri"],
                "@type": "arco:Place",
                "rdfs:label": place["label"],
            }
        )
    return _compact(
        {
            "@context": {
                "organ": PON_PROFILE["namespace"],
                "core": "https://w3id.org/polifonia/ontology/core/",
                "arco": "https://w3id.org/arco/ontology/core/",
                "dcterms": "http://purl.org/dc/terms/",
                "modavis": policy.ontology_base,
                "rdfs": "http://www.w3.org/2000/01/rdf-schema#",
            },
            "@graph": graph,
            "modavis:mappingProfile": _profile_metadata(PON_PROFILE, policy),
        }
    )


def edm_jsonld(
    organ: Mapping[str, Any],
    *,
    policy: UriPolicy | None = None,
    base_url: str | None = None,
) -> dict[str, Any] | list[dict[str, Any]]:
    policy = _coerce_policy(policy=policy, base_url=base_url)
    if policy.policy_version == "2":
        from .entity_exports import serialize_entity
        body, _, _ = serialize_entity("organ", organ, "edm", "jsonld", policy)
        return json.loads(body)

    organ_uri = _organ_uri(organ, policy)
    builders = _builders(organ, policy)
    place = _place(organ, policy)
    aggregation_uri = _blank_id("edm-aggregation", organ_uri)
    page_url = policy.human_uri("organ", str(organ.get("mdvsId") or organ.get("id") or ""))
    provided_cho = {
        "@id": organ_uri,
        "@type": "edm:ProvidedCHO",
        "dc:title": _first(organ.get("title"), fallback=organ.get("mdvsId")),
        "dc:type": "Pipe organ",
        "dc:identifier": [item["value"] for item in _identifiers(organ)],
        "dc:creator": [{"@id": item["uri"]} for item in builders],
        "dcterms:spatial": {"@id": place["uri"]} if place else None,
        "dc:date": _first(organ.get("dateLabel")),
    }
    graph: list[dict[str, Any]] = [
        _compact(provided_cho),
        {
            "@id": aggregation_uri,
            "@type": "ore:Aggregation",
            "edm:aggregatedCHO": {"@id": organ_uri},
            "edm:dataProvider": "MODAVIS Pipe Organ Dataset",
            "edm:provider": "MODAVIS",
            "edm:isShownAt": {"@id": page_url},
        },
    ]
    graph.extend(
        {
            "@id": item["uri"],
            "@type": "edm:Agent",
            "skos:prefLabel": item["label"],
        }
        for item in builders
    )
    if place:
        graph.append(
            _compact(
                {
                    "@id": place["uri"],
                    "@type": "edm:Place",
                    "skos:prefLabel": place["label"],
                    "wgs84:lat": place.get("latitude"),
                    "wgs84:long": place.get("longitude"),
                }
            )
        )
    return _compact(
        {
            "@context": {
                "dc": "http://purl.org/dc/elements/1.1/",
                "dcterms": "http://purl.org/dc/terms/",
                "edm": EDM_PROFILE["namespace"],
                "modavis": policy.ontology_base,
                "ore": "http://www.openarchives.org/ore/terms/",
                "skos": "http://www.w3.org/2004/02/skos/core#",
                "wgs84": "http://www.w3.org/2003/01/geo/wgs84_pos#",
            },
            "@graph": graph,
            "modavis:mappingProfile": _profile_metadata(EDM_PROFILE, policy),
        }
    )


def organ_jsonld(
    standard: str,
    organ: Mapping[str, Any],
    *,
    policy: UriPolicy | None = None,
    base_url: str | None = None,
) -> tuple[dict[str, Any] | list[dict[str, Any]], Mapping[str, Any]]:
    policy = _coerce_policy(policy=policy, base_url=base_url)
    normalized = normalize_standard(standard)
    if normalized == "modavis":
        profile = MODAVIS_0153_PROFILE if (policy.policy_version == "2" or _supports_complete_entity_exports(policy.release_version)) else MODAVIS_PROFILE
        return modavis_jsonld(organ, policy=policy), profile
    if normalized == "cidoc":
        return cidoc_jsonld(organ, policy=policy), CIDOC_PROFILE
    if normalized == "pon":
        return pon_jsonld(organ, policy=policy), PON_PROFILE
    if normalized == "edm":
        return edm_jsonld(organ, policy=policy), EDM_PROFILE
    raise KeyError(standard)


def alternate_links(
    organ_id: str,
    *,
    policy: UriPolicy | None = None,
    base_url: str | None = None,
) -> Iterable[str]:
    policy = _coerce_policy(policy=policy, base_url=base_url)
    reference = parse_identifier(str(organ_id))
    for key in ("modavis", "cidoc", "pon", "edm"):
        profile = MODAVIS_0153_PROFILE if key == "modavis" and (policy.policy_version == "2" or _supports_complete_entity_exports(policy.release_version)) else PROFILES[key]
        yield (
            f'<{policy.representation_uri(reference, profile=key)}>; rel="alternate"; '
            f'type="application/ld+json"; profile="{profile["profile"]}"'
        )
