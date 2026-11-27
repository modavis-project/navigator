"""Minimal Flask application for the POD 1.5 public Zenodo database.

Only routes backed by publication-safe tables are registered.  This is a
runtime security boundary, not merely a UI mode.
"""

from __future__ import annotations

import gzip
import hashlib
import json
import math
import re
from collections.abc import Mapping
from dataclasses import replace
from pathlib import Path
from typing import Any
from urllib.parse import quote, unquote, urlencode
from xml.sax.saxutils import escape as xml_escape

from flask import Flask, Response, jsonify, make_response, request, send_file

from .identity_ledger import IdentityLedgerError
from .config import Settings
from .dataset_distributions import (
    DatasetDistributionCatalog,
    DatasetDistributionError,
    RDF_XML_MEDIA_TYPE,
    dataset_edm_rdfxml,
    dataset_jsonld,
    dataset_manifest_uri,
    dataset_resolution_data,
)
from .entity_exports import FORMAT_MEDIA_TYPES, serialize_entity
from .lod import alternate_links, normalize_standard, organ_jsonld
from .map_projection import (
    FALLBACK_MAP_LAYER_ID,
    PUBLIC_MAP_MARKER_STYLE,
    PUBLIC_MAP_STYLE_VERSION,
    actor_context_geolibre_project,
    geolibre_project,
    organ_context_geolibre_project,
    parse_bbox,
    parse_coordinate_scope,
    public_map_marker_style,
    public_tiled_geolibre_project,
    public_site_groups_geojson,
)
from .map_tiles import (
    PUBLIC_MAP_DENSITY_TILE_VERSION,
    PUBLIC_MAP_MARKER_VERSION,
    encode_public_map_tile,
    public_map_density_version,
    public_map_tile_bounds,
)
from .public_areas import AREA_MAP_CONTRACT, LOOKUP_LIMIT, area_map_view, area_page_offsets, validate_lookup
from .pipework import (
    build_pipe_position_detail_record,
    build_register_pipe_position_page,
)
from .public_repository import PROFILE, PublicReleaseRepository
from .public_relocations import EVENT_ROUTE_FILTERS
from .public_source_projection_schema import public_source_projection_schema
from .uri_policy import UriPolicy, parse_identifier
from .vocabulary_query import query_arguments, bounded_integer, require_snapshot, vocabulary_endpoint, byte_response


def _supports_complete_entity_exports(release_version: str) -> bool:
    try:
        parts = tuple(int(part) for part in release_version.split("."))
    except ValueError:
        return False
    return parts >= (1, 5, 3)


def _bounded(value: Any, default: int, minimum: int = 1, maximum: int = 100) -> int:
    try:
        return max(minimum, min(int(value), maximum))
    except (TypeError, ValueError):
        return default


def _optional_bool(value: Any) -> bool | None:
    if value is None or str(value).strip() == "":
        return None
    normalized = str(value).strip().casefold()
    if normalized in {"1", "true", "yes", "on", "available", "precise"}:
        return True
    if normalized in {"0", "false", "no", "off", "missing", "rounded"}:
        return False
    return None


_MAP_CATALOG_PARAMETERS = (
    "q", "builder", "source", "location_state", "conflict_scope",
    "specification_state", "event_type", "virtual_instrument", "temperament",
    "temperament_scope",
)


def _catalog_filters() -> dict[str, str | None]:
    return {
        ("query" if name == "q" else name): request.args.get(name) or None
        for name in _MAP_CATALOG_PARAMETERS
    }


def _map_summary_from_collection(collection: Mapping[str, Any]) -> dict[str, int]:
    metadata = (
        collection.get("metadata")
        if isinstance(collection.get("metadata"), Mapping)
        else {}
    )
    exact_groups = int(metadata.get("exactGroupCount") or 0)
    fallback_groups = int(metadata.get("fallbackGroupCount") or 0)
    exact_entities = int(metadata.get("exactEntityCount") or 0)
    fallback_entities = int(metadata.get("fallbackEntityCount") or 0)
    exact_locations = int(metadata.get("exactLocationCount") or 0)
    fallback_locations = int(metadata.get("fallbackLocationCount") or 0)
    return {
        "groupCount": exact_groups + fallback_groups,
        "entityCount": exact_entities + fallback_entities,
        "locationCount": exact_locations + fallback_locations,
        "exactGroupCount": exact_groups,
        "fallbackGroupCount": fallback_groups,
        "exactEntityCount": exact_entities,
        "fallbackEntityCount": fallback_entities,
        "exactLocationCount": exact_locations,
        "fallbackLocationCount": fallback_locations,
    }


def _requested_linked_data_profile(headers: Mapping[str, Any]) -> str | None:
    accept = str(headers.get("Accept") or "").lower()
    accept_profile = str(headers.get("Accept-Profile") or "").lower()
    profile_values = f"{accept_profile} {accept}"
    if "application/rdf+xml" in accept:
        return "edm"
    if "application/ld+json" not in accept and not accept_profile:
        return None
    if "polifonia" in profile_values or "/organs/" in profile_values:
        return "pon"
    if "europeana" in profile_values or "edm" in profile_values:
        return "edm"
    if "cidoc" in profile_values or "crm" in profile_values:
        return "cidoc"
    return "modavis"


def _identifier_redirect_response(
    target: str,
    *,
    status: int,
    data: Mapping[str, Any],
    policy: UriPolicy,
) -> Response:
    response = make_response(
        jsonify(
            {
                "status": status,
                "location": target,
                "canonicalUri": data.get("canonicalUri"),
                "canonicalRoute": data.get("canonicalRoute"),
                "publicationState": data.get("publicationState")
                or policy.publication_state,
            }
        ),
        status,
    )
    response.headers["Location"] = target
    response.headers["Vary"] = "Accept, Accept-Profile"
    response.headers["Cache-Control"] = "public, max-age=300"
    response.headers["X-MODAVIS-Publication-State"] = str(
        data.get("publicationState") or policy.publication_state
    )
    canonical_uri = str(data.get("canonicalUri") or target)
    response.headers.add("Link", f'<{canonical_uri}>; rel="canonical"')
    for representation in data.get("representations") or []:
        if not isinstance(representation, Mapping) or not representation.get("uri"):
            continue
        profile = str(representation.get("profile") or "modavis")
        profile_uri = str(
            representation.get("profileUri") or policy.profile_uri(profile)
        )
        response.headers.add(
            "Link",
            f'<{representation["uri"]}>; rel="alternate"; '
            f'type="{representation.get("mediaType") or "application/ld+json"}"; '
            f'profile="{profile_uri}"',
        )
    return response


def _dataset_resolution_data(
    policy: UriPolicy,
    *,
    versioned: bool,
    catalog: DatasetDistributionCatalog | None = None,
) -> dict[str, Any]:
    return dataset_resolution_data(policy, versioned=versioned, catalog=catalog)


def _dataset_jsonld(
    policy: UriPolicy,
    *,
    profile: str,
    versioned: bool,
    catalog: DatasetDistributionCatalog | None = None,
) -> dict[str, Any]:
    return dataset_jsonld(
        policy, profile=profile, versioned=versioned, catalog=catalog
    )


def _generic_identity_jsonld(
    resolution: Mapping[str, Any], *, profile: str, policy: UriPolicy
) -> dict[str, Any]:
    route_kind = str(resolution.get("canonicalRouteKind") or "entity")
    schema_types = {
        "person": "schema:Person",
        "organization": "schema:Organization",
        "place": "schema:Place",
        "event": "schema:Event",
        "name": "schema:DefinedTerm",
        "virtual_instrument": "schema:SoftwareApplication",
    }
    return {
        "@context": {
            "schema": "https://schema.org/",
            "dcterms": "http://purl.org/dc/terms/",
            "name": "schema:name",
            "identifier": "schema:identifier",
            "url": {"@id": "schema:url", "@type": "@id"},
            "isPartOf": {"@id": "dcterms:isPartOf", "@type": "@id"},
            "conformsTo": {"@id": "dcterms:conformsTo", "@type": "@id"},
        },
        "@id": resolution["canonicalUri"],
        "@type": schema_types.get(route_kind, "schema:Thing"),
        "name": resolution.get("title") or resolution.get("identityMdvsId"),
        "identifier": resolution.get("identityMdvsId"),
        "url": f'{policy.human_base}{resolution["canonicalRoute"]}',
        "isPartOf": policy.dataset_version_uri,
        "conformsTo": policy.profile_uri(profile),
        "schema:additionalProperty": {
            "@type": "schema:PropertyValue",
            "schema:name": "publicationState",
            "schema:value": policy.publication_state,
        },
    }


def _jsonld_response(
    payload: Mapping[str, Any],
    *,
    location: str,
    canonical_uri: str,
    profile_uri: str,
    publication_state: str,
) -> Response:
    response = jsonify(payload)
    response.content_type = f'application/ld+json; profile="{profile_uri}"'
    response.headers["Content-Location"] = location
    response.headers["Cache-Control"] = "public, max-age=300"
    response.headers["Vary"] = "Accept, Accept-Profile"
    response.headers["X-MODAVIS-Publication-State"] = publication_state
    response.headers.add("Link", f'<{canonical_uri}>; rel="canonical"')
    response.headers.add(
        "Link", f'<{profile_uri}>; rel="profile"; type="text/html"'
    )
    return response


def _rdfxml_response(
    payload: bytes,
    *,
    location: str,
    canonical_uri: str,
    profile_uri: str,
    publication_state: str,
) -> Response:
    response = Response(payload, content_type=f"{RDF_XML_MEDIA_TYPE}; charset=utf-8")
    response.headers["Content-Location"] = location
    response.headers["Cache-Control"] = "public, max-age=300"
    response.headers["Vary"] = "Accept, Accept-Profile"
    response.headers["X-MODAVIS-Publication-State"] = publication_state
    response.headers.add("Link", f'<{canonical_uri}>; rel="canonical"')
    response.headers.add(
        "Link", f'<{profile_uri}>; rel="profile"; type="text/html"'
    )
    return response


def create_public_app(
    settings: Settings,
    repository: PublicReleaseRepository | None = None,
    historical_repositories: Mapping[str, PublicReleaseRepository] | None = None,
) -> Flask:
    app = Flask(__name__)
    repo = repository or PublicReleaseRepository(settings)
    from .request_reliability import register_request_reliability
    register_request_reliability(app, repo)
    from .historical_renderers import register_historical_renderers
    pinned_renderers = register_historical_renderers(app, settings)
    from .versioned_response_cache import register_versioned_response_cache
    register_versioned_response_cache(app)
    from .organological_research import register_research
    register_research(app, settings, repo)
    from .research_workbench import register_workbench
    register_workbench(app, settings, repo)
    from .research_package import register_research_packages
    register_research_packages(app)
    from .vocabulary_usage import register_vocabulary_usage
    register_vocabulary_usage(app)
    from .research_exploration import register_exploration
    register_exploration(app)
    from .omaro_reference import register_omaro
    register_omaro(app)
    dataset_catalog = (
        DatasetDistributionCatalog.load(
            settings.dataset_distribution_manifest_path,
            roots={
                "organs": settings.dataset_distribution_organ_root,
                "entities": settings.dataset_distribution_entity_root,
            },
        )
        if settings.dataset_distribution_manifest_path
        else None
    )
    from .db import transient_read_connections
    with transient_read_connections():
        readiness = dict(repo.assert_ready())
    from .catalogue_first_page import catalogue_snapshot
    from .public_read_cache import public_read_snapshot, register_public_read_cache
    binding = repo.snapshot_binding() if hasattr(repo, "snapshot_binding") else {}
    read_snapshot = public_read_snapshot(binding, settings)
    initial_catalogue_snapshot = catalogue_snapshot(binding)
    if dataset_catalog and dataset_catalog.supports(settings.uri_release_version):
        source_release = settings.public_source_release_version or settings.uri_release_version
        if dataset_catalog.manifest.get("sourceReleaseVersion", settings.uri_release_version) != source_release:
            raise ValueError("dataset distributions and configured source release differ")
        distribution_readiness = dataset_catalog.availability(
            settings.uri_release_version
        )
        if settings.uri_publication_state == "active":
            distribution_readiness = dataset_catalog.assert_available(
                settings.uri_release_version
            )
        readiness["datasetDistributions"] = distribution_readiness
    distribution_catalogs = {settings.uri_release_version: dataset_catalog}
    release_history = dict(historical_repositories or {})
    if settings.public_release_history_path:
        history = json.loads(Path(settings.public_release_history_path).read_text(encoding="utf-8"))
        for version, entry in history.items():
            if version == settings.uri_release_version:
                raise ValueError("the active release cannot also be a historical release")
            historical = PublicReleaseRepository(replace(
                settings,
                db_name=entry["database"],
                # Historical readers use on-demand connections. Each database
                # otherwise leaves its own idle pool after a public lookup.
                db_pool_max_size=0,
                uri_release_version=version,
                public_source_release_version=entry.get("sourceReleaseVersion"),
                uri_policy_version=entry.get("uriPolicyVersion", "auto"),
                uri_policy_key=entry.get("uriPolicyKey", "auto"),
                identifier_ledger_path=entry["identifierLedgerPath"],
                identifier_ledger_sha256=entry["identifierLedgerSha256"],
                public_database_manifest_path=entry["manifestPath"],
                public_release_history_path=None,
            ))
            historical.assert_ready()
            release_history[version] = historical
            if entry.get("datasetDistributionManifestPath"):
                catalog = DatasetDistributionCatalog.load(
                    entry["datasetDistributionManifestPath"],
                    roots={"organs": entry.get("datasetDistributionOrganRoot"),
                           "entities": entry.get("datasetDistributionEntityRoot")},
                )
                if not catalog.supports(version):
                    raise ValueError("historical dataset distribution release differs")
                if catalog.manifest.get("sourceReleaseVersion", version) != entry.get("sourceReleaseVersion", version):
                    raise ValueError("historical dataset distribution source release differs")
                availability = (catalog.assert_available(version)
                                if settings.uri_publication_state == "active"
                                else catalog.availability(version))
                readiness.setdefault("historicalDatasetDistributions", {})[version] = availability
                distribution_catalogs[version] = catalog

    if not pinned_renderers.issubset(release_history):
        raise ValueError("pinned renderer lacks a bound historical repository")
    if pinned_renderers:
        readiness["pinnedHistoricalRenderers"] = sorted(pinned_renderers)

    def distribution_catalog(version):
        return distribution_catalogs.get(version)

    def release_repository(version: str):
        return repo if version == settings.uri_release_version else release_history.get(version)

    def export_record(version_repo, kind: str, identifier: str):
        if version_repo.policy.policy_version == "2":
            reader = getattr(version_repo, "complete_entity_export_record", None)
            if callable(reader):
                return reader(kind, identifier)
        if kind == "organ":
            surface = version_repo.get_organ_surface(identifier)
            if not surface:
                return None
            record = dict(surface)
            for reader_name in (
                "get_organ_specification_bundle",
                "get_organ_history_bundle",
                "get_organ_related_bundle",
                "get_organ_media_bundle",
                "get_organ_sources_bundle",
            ):
                reader = getattr(version_repo, reader_name, None)
                bundle = reader(identifier) if callable(reader) else None
                if isinstance(bundle, Mapping):
                    record.update(bundle)
            details = []
            description_reader = getattr(version_repo, "get_organ_specification_description", None)
            if callable(description_reader):
                for description in record.get("specificationDescriptions") or []:
                    if not isinstance(description, Mapping) or not description.get("id"):
                        continue
                    detail = description_reader(identifier, str(description["id"]))
                    if isinstance(detail, Mapping):
                        details.append(detail)
            record["specificationDescriptionDetails"] = details
            return record
        complete_reader = getattr(version_repo, "complete_entity_export_record", None)
        if callable(complete_reader):
            complete = complete_reader(kind, identifier)
            if complete:
                return complete
        if kind in {"person", "organization"}:
            return version_repo.get_actor(identifier)
        if kind == "place":
            return version_repo.get_public_place(identifier)
        if kind == "name":
            return version_repo.get_structured_name(identifier)
        if kind == "virtual_instrument":
            return version_repo.get_virtual_instrument(identifier)
        return None

    from .public_graphql import register_public_graphql
    register_public_graphql(app, repo, export_record)
    from .pod_capabilities import register_pod_capabilities
    register_pod_capabilities(app, repo)
    from .capability_health import register_capability_health
    capability_health = register_capability_health(app, repo, settings, readiness, dataset_catalog)

    def record_from_resolution(version_repo, resolved: Mapping[str, Any]):
        kind = str(resolved.get("canonicalRouteKind") or "entity")
        kind = "virtual_instrument" if kind in {"vmi", "virtual-instrument"} else kind
        identifier = str(resolved.get("identityMdvsId") or "")
        if kind == "virtual_instrument":
            route = str(resolved.get("canonicalRoute") or "")
            identifier = unquote(route.rsplit("/", 1)[-1]) or identifier
        record = export_record(version_repo, kind, identifier)
        if record:
            return kind, record
        # Some accepted identifier-ledger rows intentionally retain the older
        # generic ``entity`` route. Resolve their published type from the
        # release tables before serializing the representation.
        if kind in {"entity", "actor"}:
            organ = export_record(version_repo, "organ", identifier)
            if organ:
                return "organ", organ
            actor = version_repo.get_actor(identifier)
            if actor:
                actor_kind = str(actor.get("entityType") or "person")
                actor_kind = "organization" if actor_kind == "organization" else "person"
                return actor_kind, (export_record(version_repo, actor_kind, identifier)
                                    if version_repo.policy.policy_version == "2" else actor)
        return kind, None

    from .release_resources import register_release_resource_routes
    resolve_release_resource = register_release_resource_routes(
        app, release_repository, record_from_resolution, settings.uri_release_version,
    )
    from .terminology import register_terminology_routes
    register_terminology_routes(app)
    from .vocabulary_references import register_vocabulary_references
    register_vocabulary_references(app)
    from .vocabulary_editions import register_vocabulary_editions
    register_vocabulary_editions(app, repo)
    from .vocabulary_catalogue import register_vocabulary_catalogue
    register_vocabulary_catalogue(app, repo)
    from .region_boundaries import register_region_boundaries
    register_region_boundaries(app, lambda: repo.public_areas.index())

    @app.before_request
    def validate_map_filters():
        if not request.path.startswith("/api/map/"):
            return None
        unsupported = [key for key in (
            "country", "institution", "year_from", "year_to", "media_state",
            "min_sources", "evidence_state", "stop_count_bucket", "history_state", "media_kind",
        ) if request.args.get(key)]
        if unsupported:
            return jsonify({"error": "unsupported_map_filter", "filters": unsupported}), 400
        if request.args.get("temperament_scope") not in {None, "", "exact", "family"}:
            return jsonify({"error": "invalid_temperament_scope"}), 400
        return None

    from .public_query_cache import BoundedQueryCache
    map_tile_cache = BoundedQueryCache(max_entries=256, max_bytes=16 * 1024 * 1024, ttl=60)

    def cached_public_map_tile(
        zoom: int,
        tile_x: int,
        tile_y: int,
        coordinate_scope: str,
        catalog_filters: tuple[tuple[str, str | None], ...],
        *,
        density_version: str | None = None,
    ) -> bytes:
        binding = repo.snapshot_binding() if hasattr(repo, "snapshot_binding") else {}
        key = json.dumps([binding, zoom, tile_x, tile_y, coordinate_scope, catalog_filters, density_version], sort_keys=True)
        cached = map_tile_cache.get(key)
        if cached is not None:
            return cached
        bounds = public_map_tile_bounds(zoom, tile_x, tile_y)
        rows = repo.public_map_tile_features(
            zoom=zoom,
            tile_x=tile_x,
            tile_y=tile_y,
            coordinate_scope=coordinate_scope,
            density_version=density_version,
            **dict(catalog_filters),
        )
        body = encode_public_map_tile(rows, bounds=bounds)
        map_tile_cache.put(key, body)
        return body

    @app.after_request
    def public_headers(response: Response) -> Response:
        response.headers["X-MODAVIS-Data-Profile"] = PROFILE
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        if request.path.startswith("/api/"):
            response.headers.setdefault("Cache-Control", "private, no-cache")
        if (request.path.startswith(("/api/health/", "/api/auth/", "/api/admin/"))
                or request.path == "/api/status"
                or (request.path == "/api/release-context" and not read_snapshot)
                or (request.path.startswith("/api/") and request.method not in {"GET", "HEAD"})
                or response.status_code >= 400):
            response.headers["Cache-Control"] = "no-store"
        if (
            request.path in {
                "/api/map/places.geojson",
                "/api/map/project.geolibre.json",
                "/api/map/regions.geojson",
            }
            and response.status_code in {200, 304}
        ):
            response.vary.add("Accept-Encoding")
            if (response.status_code == 200 and request.accept_encodings["gzip"] > 0
                    and not response.headers.get("Content-Encoding")):
                body = response.get_data()
                if len(body) >= 16_384:
                    response.set_data(gzip.compress(body, compresslevel=5, mtime=0))
                    response.headers["Content-Encoding"] = "gzip"
        return response

    register_public_read_cache(app, read_snapshot)

    @app.get("/api/health/live")
    def live():
        return jsonify({"ok": True, "dataProfile": PROFILE})

    @app.get("/api/health/ready")
    def ready():
        current = capability_health.document()
        return jsonify(current), 200 if current["ok"] else 503

    @app.get("/api/health/capabilities")
    def capability_status():
        return jsonify(capability_health.document())

    @app.get("/api/status")
    def status():
        return jsonify(repo.database_status())

    @app.get("/api/release-context")
    def release_context():
        context = dict(repo.release_context())
        if read_snapshot:
            context["readSnapshot"] = read_snapshot
        if initial_catalogue_snapshot:
            context["catalogueSnapshot"] = initial_catalogue_snapshot
        return jsonify(context)

    @app.get("/sitemap.xml")
    def public_sitemap():
        base_url = settings.public_base_url.rstrip("/")
        paths = (
            "",
            "/organs",
            "/events",
            "/persons",
            "/map",
            "/vocab",
            "/literature",
            "/scores",
            "/temperaments",
            "/virtual-instruments",
            "/use-cases",
            "/applications",
            "/about/release",
            "/about/api",
        )
        urls = "\n".join(
            f"  <url><loc>{xml_escape(base_url + path)}</loc></url>"
            for path in paths
        )
        body = (
            '<?xml version="1.0" encoding="UTF-8"?>\n'
            '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
            f"{urls}\n"
            "</urlset>\n"
        )
        return Response(
            body,
            content_type="application/xml; charset=utf-8",
            headers={"Cache-Control": "public, max-age=3600"},
        )

    @app.get("/api/auth/me")
    def auth_me():
        return jsonify({"authenticated": False, "account": None, "csrfToken": None})

    @app.get("/api/uri-policy")
    def uri_policy():
        return jsonify(repo.policy.as_dict())

    @app.get("/api/explore")
    def explore():
        return jsonify(repo.explore(query=request.args.get("q") or "", limit=_bounded(request.args.get("limit"), 8)))

    @app.get("/api/entities/search")
    def entity_search():
        from .public_discovery import validate_discovery_query
        try:
            query, limit, kinds = validate_discovery_query(request.args)
        except ValueError as error:
            return jsonify({"error": "invalid_discovery_query", "message": str(error)}), 400
        return jsonify(repo.entity_search(query=query, limit=limit, kinds=kinds))

    @app.get("/api/discovery/context")
    def discovery_context():
        return jsonify(repo.discovery_context())

    @app.get("/api/organs")
    def organ_list():
        data = repo.list_organs(
            query=request.args.get("q") or None,
            source=request.args.get("source") or None,
            builder=request.args.get("builder") or None,
            location_state=request.args.get("location_state") or None,
            media_state=request.args.get("media_state") or None,
            conflict_scope=request.args.get("conflict_scope") or None,
            specification_state=request.args.get("specification_state") or None,
            event_type=request.args.get("event_type") or None,
            virtual_instrument=request.args.get("virtual_instrument") or None,
            sort=request.args.get("sort") or None,
            limit=_bounded(request.args.get("limit"), 30),
            offset=_bounded(request.args.get("offset"), 0, 0, 1_000_000),
            include_facets=request.args.get("include_facets") in {"1", "true"},
        )
        return jsonify(data)

    @app.get("/api/organs/facets")
    def organ_facets():
        return jsonify({"facets": repo.organ_facets()})

    @app.get("/api/organs/<path:organ_id>")
    def organ_detail(organ_id: str):
        organ = repo.get_organ_surface(organ_id)
        return (jsonify({"organ": organ}), 200) if organ else (jsonify({"error": "organ_not_found"}), 404)

    @app.get("/api/organs/<path:organ_id>/citation")
    def organ_citation(organ_id: str):
        citation = repo.get_organ_citation(organ_id)
        return (jsonify({"citation": citation}), 200) if citation else (jsonify({"error": "organ_not_found"}), 404)

    @app.get("/api/organs/<path:organ_id>/sources")
    def organ_sources(organ_id: str):
        data = repo.get_organ_sources_bundle(organ_id)
        return (jsonify(data), 200) if data else (jsonify({"error": "organ_not_found"}), 404)

    @app.get("/api/organs/<path:organ_id>/specification")
    def organ_specification(organ_id: str):
        data = repo.get_organ_specification_bundle(organ_id)
        return (jsonify(data), 200) if data else (jsonify({"error": "organ_not_found"}), 404)

    @app.get("/api/organs/<path:organ_id>/specification-descriptions/<description_id>")
    def organ_specification_description(organ_id: str, description_id: str):
        data = repo.get_organ_specification_description(organ_id, description_id)
        if not data:
            return jsonify({"error": "description_not_found"}), 404
        expected_revision = request.args.get("revision")
        if expected_revision and expected_revision != data["revision"]:
            return jsonify({"error": "description_revision_unavailable"}), 409
        response = jsonify({"description": data})
        response.set_etag(hashlib.sha256(response.get_data()).hexdigest())
        return response.make_conditional(request)

    @app.get("/api/organs/<path:organ_id>/pipe-positions")
    def organ_pipe_positions(organ_id: str):
        component_id = str(
            request.args.get("component_id")
            or request.args.get("componentId")
            or ""
        ).strip()
        if not component_id:
            return jsonify({"error": "component_id_required"}), 400
        data = repo.get_organ_specification_bundle(organ_id)
        if not data:
            return jsonify({"error": "organ_not_found"}), 404
        page = build_register_pipe_position_page(
            organ_id,
            data.get("componentHierarchy") or [],
            component_id,
            offset=_bounded(request.args.get("offset"), 0, 0, 1_000_000),
            limit=_bounded(request.args.get("limit"), 100, 1, 200),
            selected_reference_id=str(
                request.args.get("reference_id")
                or request.args.get("referenceId")
                or ""
            ).strip()
            or None,
        )
        if page is None:
            return jsonify({"error": "quantified_register_not_found"}), 404
        return jsonify(page)

    @app.get("/api/pipe-positions/<path:reference_id>")
    def pipe_position_detail(reference_id: str):
        organ_id = str(
            request.args.get("organ_id") or request.args.get("organId") or ""
        ).strip()
        component_id = str(
            request.args.get("component_id")
            or request.args.get("componentId")
            or ""
        ).strip()
        if not organ_id or not component_id:
            return jsonify({"error": "organ_id_and_component_id_required"}), 400
        data = repo.get_organ_specification_bundle(organ_id)
        if not data:
            return jsonify({"error": "organ_not_found"}), 404
        page = build_register_pipe_position_page(
            organ_id,
            data.get("componentHierarchy") or [],
            component_id,
            offset=0,
            limit=1,
            selected_reference_id=reference_id,
        )
        if page is None:
            return jsonify({"error": "quantified_register_not_found"}), 404
        if page.get("status") != "available" or not page.get("selected"):
            return jsonify({"error": "pipe_position_not_found"}), 404
        canonical_reference = str(page["selected"]["id"])
        evidence_reader = getattr(repo, "get_pipe_position_evidence", None)
        persisted_context = (
            evidence_reader(canonical_reference)
            if callable(evidence_reader)
            else None
        )
        organ = repo.get_organ_surface(organ_id)
        if isinstance(organ, Mapping) and not organ.get("pageUrl"):
            organ = {
                **organ,
                "pageUrl": f"/organs/{quote(organ_id, safe='')}?tab=specification",
            }
        detail = build_pipe_position_detail_record(
            page,
            organ=organ if isinstance(organ, Mapping) else None,
            persisted_context=persisted_context,
        )
        if detail is None:
            return jsonify({"error": "pipe_position_not_found"}), 404
        response = jsonify(detail)
        response.headers["Content-Location"] = str(detail.get("canonicalPath") or "")
        return response

    @app.get("/api/organs/<path:organ_id>/history")
    def organ_history(organ_id: str):
        data = repo.get_organ_history_bundle(organ_id)
        return (jsonify(data), 200) if data else (jsonify({"error": "organ_not_found"}), 404)

    @app.get("/api/organs/<path:organ_id>/related")
    def organ_related(organ_id: str):
        data = repo.get_organ_related_bundle(organ_id)
        return (jsonify(data), 200) if data else (jsonify({"error": "organ_not_found"}), 404)

    @app.get("/api/organs/<path:organ_id>/media")
    @app.get("/api/organs/<path:organ_id>/derivative-assets")
    def organ_media(organ_id: str):
        data = repo.get_organ_media_bundle(organ_id)
        return (jsonify(data), 200) if data is not None else (jsonify({"error": "organ_not_found"}), 404)

    @app.get("/api/organs/<path:organ_id>/contributions")
    def organ_contributions(organ_id: str):
        if not repo._resolve_organ_mdvs_id(organ_id):
            return jsonify({"error": "organ_not_found"}), 404
        return jsonify(repo.empty_contribution_bundle())

    @app.get("/api/places/<path:identifier>")
    def public_place(identifier: str):
        value = repo.get_public_place(identifier)
        return (jsonify(value), 200) if value else (jsonify({"error": "place_not_found"}), 404)

    @app.get("/api/areas")
    def search_public_areas():
        try:
            query = validate_lookup(request.args)
        except ValueError as exc:
            return jsonify({"error": "invalid_area_query", "message": str(exc)}), 400
        return jsonify({"items": [area.link() for area, _ in repo.public_areas.suggest(query, LOOKUP_LIMIT)]})

    @app.get("/api/areas/<identifier>")
    def public_area(identifier: str):
        try:
            offsets = area_page_offsets(request.args)
        except ValueError as exc:
            return jsonify({"error": "invalid_area_query", "message": str(exc)}), 400
        value = repo.get_public_area(identifier, **offsets)
        return (jsonify(value), 200) if value else (jsonify({"error": "area_not_found"}), 404)

    def area_map_payload(area, precision):
        data = repo.public_areas.map_data(area)
        scope = precision or ("exact" if data["exact_group_count"] else "fallback")
        site_count = data[f"{scope}_group_count"]
        if not site_count:
            return None
        summary = {
            "exactGroupCount": data["exact_group_count"],
            "fallbackGroupCount": data["fallback_group_count"],
            "exactEntityCount": data["exact_entity_count"],
            "fallbackEntityCount": data["fallback_entity_count"],
        }
        extent = data[f"{scope}_bounds"]
        view = area_map_view(extent)
        if data["inline_groups"] is not None:
            project = geolibre_project(
                public_site_groups_geojson(data["inline_groups"], coordinate_scope=scope),
                coordinate_scope=scope, summary=summary, map_view=view,
            )
            for layer in project["layers"]:
                fallback = layer["id"] == FALLBACK_MAP_LAYER_ID
                layer["style"].update(
                    fillColor="#c38b3e" if fallback else "#34756c", circleRadius=6,
                    clusterRadius=42, clusterMaxZoom=12,
                )
        else:
            map_api = f"/api/areas/{quote(area.identifier, safe='')}/map"

            def tile_url(scope):
                query = urlencode({"precision": scope, "release": settings.uri_release_version})
                return f"{map_api}/tiles/{{z}}/{{x}}/{{y}}.mvt?{query}"

            project = public_tiled_geolibre_project(
                exact_tile_url=tile_url("exact"), fallback_tile_url=tile_url("fallback"),
                coordinate_scope=scope, summary=summary, map_view=view,
                basemap_style_url=f"{map_api}/style.json?precision={scope}&style={PUBLIC_MAP_STYLE_VERSION}",
            )
            # Suppress requests for tiles that cannot contain a matching site.
            west, south, east, north = extent
            bounds = [max(-180, west - .01), max(-85.05112878, south - .01),
                      min(180, east + .01), min(85.05112878, north + .01)]
            for layer in project["layers"]:
                layer["source"]["bounds"] = bounds
        project["name"] = area.title
        project["metadata"].update(
            areaId=area.identifier, areaMapContract=AREA_MAP_CONTRACT, mappedSites=data["group_count"],
            visibleSites=site_count, dataProfile=PROFILE, visibility="public", sourceOwner="Navigator public release",
            canonicalMutationAllowed=False, administrativeBoundaryIncluded=False,
        )
        for layer in project["layers"]:
            layer["metadata"]["visibility"] = "public"
        return project

    @app.get("/api/areas/<identifier>/map/style.json", defaults={"as_style": True}, endpoint="public_area_map_style")
    @app.get("/api/areas/<identifier>/map.geolibre.json")
    def public_area_map(identifier: str, as_style: bool = False):
        precision = request.args.get("precision")
        if precision not in {None, "exact", "fallback"} or len(request.args.getlist("precision")) > 1:
            return jsonify({"error": "invalid_area_map_precision"}), 400
        area = repo.public_areas.resolve(identifier)
        if area is None:
            return jsonify({"error": "area_not_found"}), 404
        project = area_map_payload(area, precision)
        if not as_style:
            return (jsonify(project), 200) if project else (jsonify({"error": "area_map_has_no_sites"}), 404)
        if not project or not project["metadata"]["remoteGroupedSources"]:
            return jsonify({"error": "area_map_style_not_found"}), 404
        scheme = "https" if request.headers.get("X-Forwarded-Proto") == "https" else request.scheme
        return jsonify(public_map_marker_style(project=project, origin=f"{scheme}://{request.host}"))

    @app.get("/api/areas/<identifier>/map/tiles/<int:zoom>/<int:tile_x>/<int:tile_y>.mvt")
    def public_area_map_tile(identifier: str, zoom: int, tile_x: int, tile_y: int):
        if request.args.get("release") != settings.uri_release_version:
            return jsonify({"error": "dataset_release_not_found"}), 404
        area = repo.public_areas.resolve(identifier)
        if area is None:
            return jsonify({"error": "area_not_found"}), 404
        try:
            scope = parse_coordinate_scope(request.args.get("precision"))
            body = cached_public_map_tile(zoom, tile_x, tile_y, scope, (("area_identifier", area.identifier),))
        except ValueError as exc:
            return jsonify({"error": "invalid_map_tile", "detail": str(exc)}), 400
        response = Response(body, content_type="application/vnd.mapbox-vector-tile")
        response.headers["Cache-Control"] = "public, max-age=86400, immutable"
        response.set_etag(hashlib.sha256(body).hexdigest())
        return response.make_conditional(request)

    @app.get("/api/areas/<identifier>/map/sites/<path:site_group_id>")
    def public_area_map_site(identifier: str, site_group_id: str):
        if len(site_group_id) > 512:
            return jsonify({"error": "map_site_group_not_found"}), 404
        area = repo.public_areas.resolve(identifier)
        if area is None:
            return jsonify({"error": "area_not_found"}), 404
        value = repo.public_areas.map_site(area, site_group_id)
        return (jsonify(value), 200) if value else (jsonify({"error": "map_site_group_not_found"}), 404)

    @app.get("/api/public/sources/<path:identifier>")
    def public_source(identifier: str):
        value = repo.get_public_source(identifier)
        return (jsonify(value), 200) if value else (jsonify({"error": "source_not_found"}), 404)

    @app.get("/api/public/sources/<path:identifier>/structured.json")
    def public_source_projection(identifier: str):
        value = repo.get_public_source_projection(identifier)
        if value is None:
            return jsonify({"error": "source_projection_not_found"}), 404
        response = jsonify(value)
        response.headers["Content-Disposition"] = f'inline; filename="modavis-source-{hashlib.sha256(identifier.encode()).hexdigest()[:12]}.json"'
        return response

    @app.get("/api/exports/<kind>/<path:identifier>/evidence")
    def entity_evidence_coverage(kind: str, identifier: str):
        from .evidence_coverage import field_evidence_coverage
        record = export_record(repo, kind, identifier)
        if record is None:
            return jsonify({"error": "entity_not_found"}), 404
        try:
            result = field_evidence_coverage(record, release_version=repo.policy.release_version)
        except ValueError:
            return jsonify({"error": "evidence_coverage_budget_exceeded"}), 413
        response = jsonify(result)
        response.set_etag(hashlib.sha256(response.get_data()).hexdigest())
        return response.make_conditional(request)

    @app.get("/api/exports/<kind>/<path:identifier>/sources")
    def entity_source_exports(kind: str, identifier: str):
        if kind not in {"organ", "person", "organization", "place", "virtual_instrument", "name"}:
            return jsonify({"error": "entity_export_kind_not_found"}), 404
        value = repo.get_entity_source_exports(kind, identifier)
        return (jsonify(value), 200) if value is not None else (jsonify({"error": "entity_not_found"}), 404)

    @app.get("/api/exports/<kind>/<path:identifier>")
    def entity_export_manifest(kind: str, identifier: str):
        record = export_record(repo, kind, identifier)
        if not record:
            return jsonify({"error": "entity_not_found"}), 404
        manifest = record.get("export") or repo.entity_export_manifest(kind, record.get("mdvsId") or record.get("id"))
        return (jsonify(manifest), 200) if manifest else (jsonify({"error": "entity_export_not_available"}), 404)

    @app.get("/api/persons")
    def persons():
        try:
            data = repo.list_persons(
                query=request.args.get("q") or None,
                source=request.args.get("source") or None,
                publication_state=request.args.get("publication_state") or None,
                role=request.args.get("role") or None,
                entity_class=request.args.get("entity_class") or None,
                sort=request.args.get("sort") or None,
                limit=_bounded(request.args.get("limit"), 30),
                offset=_bounded(request.args.get("offset"), 0, 0, 1_000_000),
            )
        except ValueError as error:
            return jsonify({"error": "invalid_actor_directory_filter", "message": str(error)}), 400
        return jsonify(data)

    @app.get("/api/entities/<category>/<path:actor_id>")
    def actor_detail(category: str, actor_id: str):
        if category == "source-actors":
            actor = repo.get_source_actor(actor_id)
            return (jsonify({"actor": actor}), 200) if actor else (jsonify({"error": "source_actor_not_found"}), 404)
        if category not in {"people", "persons", "organizations", "institutions"}:
            return jsonify({"error": "entity_category_not_available"}), 404
        if request.args.get("view") not in {None, "", "full", "summary"}:
            return jsonify({"error": "unsupported_actor_view"}), 400
        actor = repo.get_actor(actor_id, summary=True) if request.args.get("view") == "summary" else repo.get_actor(actor_id)
        return (jsonify({"actor": actor}), 200) if actor else (jsonify({"error": "actor_not_found"}), 404)

    @app.get("/api/actors/<path:actor_id>/<collection>")
    def actor_collection(actor_id: str, collection: str):
        if collection not in {"mentions", "relationships"}:
            return jsonify({"error": "actor_collection_not_available"}), 404
        try:
            limit = int(request.args.get("limit", "100"))
            offset = int(request.args.get("offset", "0"))
            query = request.args.get("q", "")
            if not 1 <= limit <= 100 or not 0 <= offset <= 1_000_000 or len(query) > 200:
                raise ValueError("invalid pagination")
        except ValueError:
            return jsonify({"error": "invalid_actor_pagination"}), 400
        page = repo.actor_collection_page(actor_id, collection, query=query, limit=limit, offset=offset)
        return (jsonify(page), 200) if page is not None else (jsonify({"error": "actor_not_found"}), 404)

    @app.get("/api/entities/names/<path:name_id>")
    def structured_name(name_id: str):
        name = repo.get_structured_name(name_id)
        return (jsonify({"name": name}), 200) if name else (jsonify({"error": "name_not_found"}), 404)

    @app.get("/api/events")
    def event_list():
        try:
            year_from = int(request.args["year_from"]) if request.args.get("year_from") else None
            year_to = int(request.args["year_to"]) if request.args.get("year_to") else None
            if any(year is not None and not 1 <= year <= 2500 for year in (year_from, year_to)):
                raise ValueError("year out of range")
            if year_from is not None and year_to is not None and year_from > year_to:
                raise ValueError("year range reversed")
        except ValueError:
            return jsonify({"error": "invalid_event_year_range"}), 400
        if request.args.get("completeness"):
            return jsonify({"error": "unsupported_event_filter"}), 400
        participant = (request.args.get("participant") or "").strip()
        if participant and not re.fullmatch(r"(?:MDVS:ENTY:)?[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]", participant):
            return jsonify({"error": "participant_requires_canonical_actor_id"}), 400
        route = request.args.get("route") or None
        if route is not None and route not in EVENT_ROUTE_FILTERS:
            return jsonify({"error": "unsupported_event_route_filter"}), 400
        if request.args.get("sort") not in {None, "", "newest", "oldest", "type"}:
            return jsonify({"error": "unsupported_event_sort"}), 400
        concept = request.args.getlist("concept")
        if concept and (len(concept) != 1 or not re.fullmatch(r"[A-Za-z0-9._:-]{1,160}", concept[0])):
            return jsonify({"error": "invalid_event_concept"}), 400
        try:
            result = repo.list_events(
                query=request.args.get("q") or None,
                participant=participant or None,
                subject=request.args.get("subject") or None,
                event_type=request.args.get("type") or None,
                route=route,
                source=request.args.get("source") or None,
                year_from=year_from,
                year_to=year_to,
                sort=request.args.get("sort") or None,
                limit=_bounded(request.args.get("limit"), 30),
                offset=_bounded(request.args.get("offset"), 0, 0, 1_000_000),
                **({"event_concept": concept[0]} if concept else {}),
            )
        except LookupError:
            if not concept:
                raise
            return jsonify({"error": "activity_vocabulary_concept_not_found"}), 404
        return jsonify(result)

    @app.get("/api/events/<path:event_id>")
    def event_detail(event_id: str):
        event = repo.get_event(event_id)
        return (jsonify({"event": event}), 200) if event else (jsonify({"error": "event_not_found"}), 404)

    @app.get("/api/literature/status")
    def literature_status():
        return jsonify(repo.literature_status())

    @app.get("/api/literature")
    def literature_list():
        year = request.args.get("year")
        year_from = request.args.get("year_from") or year
        year_to = request.args.get("year_to") or year
        return jsonify(repo.list_literature(
            mode="surface",
            query=request.args.get("q") or request.args.get("query") or "",
            collection=request.args.get("collection") or None,
            year_from=_bounded(year_from, 0, 0, 9999) if year_from else None,
            year_to=_bounded(year_to, 0, 0, 9999) if year_to else None,
            publication_type=request.args.get("publication_type") or None,
            author=request.args.get("author") or None,
            venue=request.args.get("venue") or None,
            volume=request.args.get("volume") or None,
            container_type=request.args.get("container_type") or None,
            confidence=request.args.get("confidence") or None,
            digitized=_optional_bool(request.args.get("digitized")),
            sort=request.args.get("sort") or "newest",
            limit=_bounded(request.args.get("limit"), 40),
            offset=_bounded(request.args.get("offset"), 0, 0, 100_000),
        ))

    @app.get("/api/literature/<path:literature_id>")
    def literature_detail(literature_id: str):
        item = repo.get_literature(literature_id, mode="surface")
        return (jsonify({"mode": "surface", "literature": item}), 200) if item else (jsonify({"error": "literature_not_found"}), 404)

    @app.get("/api/scores")
    def digital_score_list():
        return jsonify(repo.list_digital_scores(
            mode="surface",
            query=request.args.get("q") or "",
            collection=request.args.get("collection") or None,
            format=request.args.get("format") or None,
            evidence_strength=request.args.get("evidence_strength") or None,
            analysis_status=request.args.get("analysis_status") or None,
            sort=request.args.get("sort") or "evidence",
            limit=_bounded(request.args.get("limit"), 40),
            offset=_bounded(request.args.get("offset"), 0, 0, 100_000),
        ))

    @app.get("/api/scores/<path:score_id>/assets/<path:asset_id>")
    def digital_score_asset_detail(score_id: str, asset_id: str):
        item = repo.get_digital_score_asset(score_id, asset_id, mode="surface")
        return (jsonify({"mode": "surface", "asset": item}), 200) if item else (jsonify({"error": "score_asset_not_found"}), 404)

    @app.get("/api/scores/<path:score_id>")
    def digital_score_detail(score_id: str):
        item = repo.get_digital_score(score_id, mode="surface")
        return (jsonify({"mode": "surface", "score": item}), 200) if item else (jsonify({"error": "score_not_found"}), 404)

    @app.get("/api/temperaments")
    def tuning_system_list():
        sort = request.args.get("sort", "catalogue")
        if sort not in {"catalogue", "occurrences_desc", "occurrences_asc"}:
            return jsonify({"error": "invalid_temperament_sort"}), 400
        occurrence_scope = request.args.get("occurrence_scope", "all")
        if occurrence_scope not in {"all", "exact", "family"}:
            return jsonify({"error": "invalid_occurrence_scope"}), 400
        try:
            minimum = bounded_integer(request.args, "min_occurrences", None, 0, 1_000_000)
            maximum = bounded_integer(request.args, "max_occurrences", None, 0, 1_000_000)
        except ValueError:
            return jsonify({"error": "invalid_occurrence_range"}), 400
        if minimum is not None and maximum is not None and minimum > maximum:
            return jsonify({"error": "invalid_occurrence_range"}), 400
        return jsonify(repo.list_tuning_systems(
            mode="surface",
            limit=_bounded(request.args.get("limit"), 40),
            offset=_bounded(request.args.get("offset"), 0, 0, 100_000),
            query=request.args.get("q") or None,
            group_key=request.args.get("group_key") or None,
            precise_variant=_optional_bool(request.args.get("precise_variant")),
            commentary_available=_optional_bool(request.args.get("commentary_available")),
            commentary_query=request.args.get("commentary_q") or None,
            query_scope=request.args.get("scope") or None,
            sort=sort,
            occurrence_scope=occurrence_scope,
            min_occurrences=minimum,
            max_occurrences=maximum,
        ))

    @app.get("/api/temperaments/<path:tuning_id>/organs")
    def tuning_system_organs(tuning_id: str):
        scope = request.args.get("scope", "all")
        if scope not in {"all", "exact", "family"}:
            return jsonify({"error": "invalid_occurrence_scope"}), 400
        data = repo.list_organs_for_tuning_system(
            tuning_id,
            limit=_bounded(request.args.get("limit"), 200, 1, 500),
            offset=_bounded(request.args.get("offset"), 0, 0, 100_000),
            scope=scope,
        )
        return (jsonify({"mode": "surface", "organs": data}), 200) if data else (jsonify({"error": "tuning_system_not_found"}), 404)

    @app.get("/api/temperaments/<path:tuning_id>")
    def tuning_system_detail(tuning_id: str):
        item = repo.get_tuning_system(tuning_id, mode="surface")
        return (jsonify({"mode": "surface", "temperament": item}), 200) if item else (jsonify({"error": "tuning_system_not_found"}), 404)

    @app.get("/api/virtual-instruments/status")
    def virtual_instrument_status():
        return jsonify({"available": True, "dataProfile": PROFILE, "readOnly": True})

    @app.get("/api/virtual-instruments")
    def virtual_instrument_list():
        unsupported = [key for key in ("confidence_tier", "organ_outcome", "match_method") if request.args.get(key)]
        if unsupported:
            return jsonify({"error": "filter_not_in_public_projection", "filters": unsupported, "guidance": "Historical investigation filters require private reconciliation evidence; use organ_link or link_state."}), 400
        return jsonify(repo.list_virtual_instruments(
            query=request.args.get("q") or "",
            limit=_bounded(request.args.get("limit"), 30),
            offset=_bounded(request.args.get("offset"), 0, 0, 1_000_000),
            **{key: request.args.get(key) for key in ("producer", "platform", "access_category", "license_category", "catalog_status", "country", "granularity", "independently_distributed", "link_state", "organ_link") if request.args.get(key)},
            access=request.args.get("access"), license_class=request.args.get("license_class"), availability=request.args.get("availability"),
        ))

    @app.get("/api/virtual-instruments/<path:entity_id>")
    def virtual_instrument_detail(entity_id: str):
        item = repo.get_virtual_instrument(entity_id)
        return (jsonify({"virtualInstrument": item}), 200) if item else (jsonify({"error": "virtual_instrument_not_found"}), 404)

    @app.get("/api/vocab/schemes")
    @vocabulary_endpoint
    def vocabulary_schemes():
        query_arguments(request.args, set())
        return jsonify(repo.public_vocabulary_schemes())

    @app.get("/api/vocab/releases")
    @vocabulary_endpoint
    def vocabulary_releases():
        values = query_arguments(request.args, {'limit','offset'})
        bounded_integer(values, 'limit', 30, 1, 500)
        bounded_integer(values, 'offset', 0, 0, 100000)
        return jsonify({"items": [], "total": 0, "scope": "Vocabulary concepts bundled with POD; no separate formal vocabulary release is included."})

    @app.get("/api/vocab/overview")
    @vocabulary_endpoint
    def vocabulary_overview():
        query_arguments(request.args, set())
        schemes = repo.public_vocabulary_schemes()["items"]
        return jsonify({"counts": {"schemes": sum(s.get('recordKind') == 'governed_scheme' for s in schemes), "concepts": sum(s["conceptCount"] for s in schemes), "schemaCategories": sum(s.get('categoryCount', 0) for s in schemes)}, "schemes": schemes})

    @app.get("/api/vocab/concepts")
    @vocabulary_endpoint
    def vocabulary_concepts():
        values = query_arguments(request.args, {'scheme_code','q','language','limit','offset','snapshot'}, pins={'snapshot'})
        if 'scheme_code' in values and values['scheme_code'] not in {item['code'] for item in repo.public_vocabulary_schemes()['items']}:
            raise LookupError('Vocabulary scheme is unavailable')
        pinned = repo.public_vocabulary_snapshot(values['scheme_code']) if values.get('scheme_code') else None
        if 'snapshot' in values and pinned is None:
            raise ValueError('Choose a controlled vocabulary scheme before binding its snapshot')
        if pinned:
            require_snapshot(values, pinned['contentSha256'])
        result = repo.public_vocabulary_concepts(scheme=values.get('scheme_code'), query=values.get('q', ''),
            language=values.get('language'), limit=bounded_integer(values, 'limit', 200, 1, 500), offset=bounded_integer(values, 'offset', 0, 0, 100000))
        editions = app.extensions.get('vocabulary_editions')
        if editions:
            result = {**result, 'items': [editions.project(item) for item in result['items']]}
        return jsonify({**result,
                        'contentSha256': pinned['contentSha256'] if pinned else None})

    @app.get("/api/vocab/concepts/<path:identifier>")
    @vocabulary_endpoint
    def vocabulary_concept(identifier):
        values = query_arguments(request.args, {'scheme_code','snapshot'}, pins={'snapshot'})
        concept = repo.public_vocabulary_concept(identifier, scheme=values.get('scheme_code'))
        if concept is None:
            raise LookupError('Vocabulary concept is unavailable')
        pinned = repo.public_vocabulary_snapshot(concept['scheme']['code'])
        if 'snapshot' in values and pinned is None:
            raise ValueError('Schema categories have no controlled vocabulary snapshot')
        if pinned:
            require_snapshot(values, pinned['contentSha256'])
        editions = app.extensions.get('vocabulary_editions')
        return jsonify({'concept': editions.project(concept) if editions else concept,
                        'contentSha256': pinned['contentSha256'] if pinned else None})

    @app.get("/api/vocab/source-terms/<path:identifier>")
    @vocabulary_endpoint
    def vocabulary_source_term(identifier):
        query_arguments(request.args, set())
        value = repo.public_vocabulary_source_term(identifier)
        return (jsonify({"sourceTerm": value}), 200) if value else (jsonify({"error": "source_term_not_in_public_snapshot"}), 404)

    @app.get("/api/vocab/snapshots/<scheme>")
    @vocabulary_endpoint
    def vocabulary_snapshot(scheme):
        values = query_arguments(request.args, {'snapshot'}, pins={'snapshot'})
        value = repo.public_vocabulary_snapshot(scheme)
        if value is None:
            raise LookupError('Vocabulary snapshot is unavailable')
        require_snapshot(values, value['contentSha256'])
        return byte_response(json.dumps(value, ensure_ascii=False, sort_keys=True, indent=2)+'\n', 'application/json', content_sha256=value['contentSha256'])

    @app.get("/api/vocab/snapshots/<scheme>.<format>")
    @vocabulary_endpoint
    def vocabulary_snapshot_download(scheme, format):
        from .public_vocabulary import serialize
        values = query_arguments(request.args, {'snapshot'}, pins={'snapshot'})
        value = repo.public_vocabulary_snapshot(scheme)
        if value is None or format not in {'json', 'jsonld', 'ttl', 'skos', 'csv'}:
            return jsonify({"error": "snapshot_format_not_found"}), 404
        require_snapshot(values, value['contentSha256'])
        body, media_type = serialize(value, format, repo.policy.canonical_id_base)
        return byte_response(body, media_type, filename=f'{scheme}-bundled.{format}', content_sha256=value['contentSha256'])

    @app.get("/api/map/places.geojson")
    def map_places():
        try:
            scope = parse_coordinate_scope(request.args.get("precision"))
            bbox = parse_bbox(request.args.get("bbox"))
        except ValueError as exc:
            return jsonify({"error": "invalid_map_filter", "detail": str(exc)}), 400
        rows = repo.public_map_site_groups(
            limit=_bounded(request.args.get("limit"), 250_000, 1, 250_000),
            coordinate_scope=scope, bbox=bbox, **_catalog_filters(),
        )
        return jsonify(public_site_groups_geojson(rows, coordinate_scope=scope, compact=request.args.get("compact") in {"1", "true"}))

    @app.get("/api/map/tiles/<int:zoom>/<int:tile_x>/<int:tile_y>.mvt")
    def map_tile(zoom: int, tile_x: int, tile_y: int):
        version = request.args.get("release")
        if version and version != settings.uri_release_version:
            return jsonify({"error": "dataset_release_not_found"}), 404
        try:
            scope = parse_coordinate_scope(request.args.get("precision"))
            body = cached_public_map_tile(
                zoom,
                tile_x,
                tile_y,
                scope,
                tuple(sorted(_catalog_filters().items())),
                density_version=public_map_density_version(zoom, request.args.get("density")),
            )
        except ValueError as exc:
            return jsonify({"error": "invalid_map_tile", "detail": str(exc)}), 400
        response = Response(body, content_type="application/vnd.mapbox-vector-tile")
        response.headers["Cache-Control"] = "public, max-age=86400, immutable" if version else "public, max-age=300"
        response.set_etag(hashlib.sha256(body).hexdigest())
        return response.make_conditional(request)

    @app.get("/api/map/summary.json")
    def map_summary():
        try:
            scope = parse_coordinate_scope(request.args.get("precision"))
        except ValueError as exc:
            return jsonify({"error": "invalid_map_filter", "detail": str(exc)}), 400
        return jsonify(repo.public_map_summary(coordinate_scope=scope, **_catalog_filters()))

    @app.get("/api/map/areas/<identifier>/summary.json")
    def map_area_summary(identifier: str):
        if (set(request.args) - {"precision", *_MAP_CATALOG_PARAMETERS}
                or any(len(values) > 1 for _, values in request.args.lists())):
            return jsonify({"error": "invalid_map_filter", "detail": "Use one value per supported map filter."}), 400
        try:
            scope = parse_coordinate_scope(request.args.get("precision"))
            summary = repo.public_map_area_summary(identifier, coordinate_scope=scope, **_catalog_filters())
        except ValueError as exc:
            return jsonify({"error": "invalid_map_filter", "detail": str(exc)}), 400
        return (jsonify(summary), 200) if summary else (jsonify({"error": "area_not_found"}), 404)

    @app.get("/api/map/nearby.json")
    def map_nearby():
        try:
            bbox = parse_bbox(request.args.get("bbox"))
            scope = parse_coordinate_scope(request.args.get("precision"))
        except ValueError as exc:
            return jsonify({"error": "invalid_map_filter", "detail": str(exc)}), 400
        if bbox is None:
            return jsonify({"error": "bbox_required"}), 400
        return jsonify({"contract": "modavis.navigator.public-map-nearby/v1", "coordinateScope": scope, "nearby": repo.public_map_has_site_group(coordinate_scope=scope, bbox=bbox, **_catalog_filters())})

    @app.get("/api/map/group-at.json")
    def map_group_at():
        try:
            longitude = float(request.args.get("longitude") or "")
            latitude = float(request.args.get("latitude") or "")
        except (TypeError, ValueError):
            return jsonify({"error": "invalid_map_coordinate"}), 400
        if (
            not math.isfinite(longitude)
            or not math.isfinite(latitude)
            or not -180 <= longitude <= 180
            or not -90 <= latitude <= 90
        ):
            return jsonify({"error": "invalid_map_coordinate"}), 400
        group = repo.public_map_group_at(
            longitude=longitude,
            latitude=latitude,
            coordinate_scope="exact",
            **_catalog_filters(),
        )
        if not group:
            return jsonify({"error": "map_site_group_not_found"}), 404
        return jsonify(group)

    @app.get("/api/map/groups/<path:site_group_id>")
    def map_group(site_group_id: str):
        try:
            return jsonify(repo.public_map_group_members(
                site_group_id,
                limit=_bounded(request.args.get("limit"), 24),
                offset=_bounded(request.args.get("offset"), 0, 0, 1_000_000),
                **_catalog_filters(),
            ))
        except ValueError as exc:
            return jsonify({"error": "invalid_map_site_group", "detail": str(exc)}), 404

    def _public_movement_collection():
        from .movement_projection import canonical_movement_geojson, parse_temporal_instant
        instant = parse_temporal_instant(request.args.get("datetime"))
        all_items=repo.public_relocation_movements()
        items=[x for x in all_items if x["status"]=="linked_complete_route"]
        result=canonical_movement_geojson(items, temporal_instant=instant, movement_id=request.args.get("movement"), movement_type=request.args.get("movement_type"))
        result.setdefault("metadata",{}).update(dataProfile=PROFILE, unresolvedEndpointCount=len(all_items)-len(items))
        return result

    @app.get("/api/map/movements.geojson")
    def map_movements():
        try:return jsonify(_public_movement_collection())
        except ValueError as exc:return jsonify({"error":"invalid_datetime","detail":str(exc)}),400

    @app.get("/api/map/coordinate-relocation-summary.json")
    def relocation_summary():
        items=repo.public_relocation_movements()
        return jsonify({"relocations":{"total":len(items),"mapped":sum(x["status"]=="linked_complete_route" for x in items),"unresolved":sum(x["status"]!="linked_complete_route" for x in items)},"scope":"Retained source-location sequences; no travelled path or present location inferred."})

    def world_tile_url(scope, catalog_filters, *, counted=False):
        query = urlencode({
            key: value
            for key, value in {
                "precision": scope,
                "release": settings.uri_release_version,
                "markers": PUBLIC_MAP_MARKER_VERSION if counted else None,
                "density": PUBLIC_MAP_DENSITY_TILE_VERSION if counted else None,
                **{("q" if key == "query" else key): value for key, value in catalog_filters.items()},
            }.items()
            if value
        })
        return f"/api/map/tiles/{{z}}/{{x}}/{{y}}.mvt?{query}"

    @app.get(PUBLIC_MAP_MARKER_STYLE)
    def marker_style():
        try:
            scope = parse_coordinate_scope(request.args.get("precision"))
        except ValueError as exc:
            return jsonify({"error": "invalid_map_filter", "detail": str(exc)}), 400
        if request.args.get("release") != settings.uri_release_version:
            return jsonify({"error": "dataset_release_not_found"}), 404
        catalog_filters = _catalog_filters()
        project = public_tiled_geolibre_project(
            exact_tile_url=world_tile_url("exact", catalog_filters, counted=True),
            fallback_tile_url=world_tile_url("fallback", catalog_filters, counted=True),
            coordinate_scope=scope,
            summary={},
        )
        scheme = "https" if request.headers.get("X-Forwarded-Proto") == "https" else request.scheme
        viewport_basemap = request.args.get("basemap_detail") == "viewport-v1"
        response = jsonify(public_map_marker_style(
            project=project, origin=f"{scheme}://{request.host}",
            site_markers_only=request.args.get("layout") == "sites",
            combined_tile_url=(
                world_tile_url("all", catalog_filters, counted=True)
                if (scope == "all" or viewport_basemap) and request.args.get("source_layout") == "combined" else None
            ),
            viewport_basemap=viewport_basemap,
        ))
        response.headers["Cache-Control"] = "private, max-age=86400, immutable"
        response.set_etag(hashlib.sha256(response.get_data()).hexdigest())
        return response.make_conditional(request)

    @app.get("/api/map/project.geolibre.json")
    def map_project():
        mode=(request.args.get("mode") or "places").strip().lower()
        if mode not in {"places","events"}:return jsonify({"error":"invalid_map_mode"}),400
        if request.args.get("simulation"):return jsonify({"error":"restricted_simulation"}),403
        if mode=="events":
            try:collection=_public_movement_collection()
            except ValueError as exc:return jsonify({"error":"invalid_datetime","detail":str(exc)}),400
            project=geolibre_project({"type":"FeatureCollection","features":[]},movement_collection=collection,coordinate_scope="all")
            project["name"]="MODAVIS documented relocation connections"
            project["metadata"].update(visibility="public",sourceOwner="Navigator public source evidence",dataProfile=PROFILE,mapMode="events",canonicalMutationAllowed=False,simulationOnly=False,routeGeometryStored=False,historicalRouteAssertion=False)
            project["metadata"]["movementTypes"] = collection["metadata"]["movementTypes"]
            for layer in project["layers"]:
                layer.setdefault("metadata",{})["visibility"]="public"
            return jsonify(project)
        try:
            scope = parse_coordinate_scope(request.args.get("precision"))
            bbox = parse_bbox(request.args.get("bbox"))
        except ValueError as exc:
            return jsonify({"error": "invalid_map_filter", "detail": str(exc)}), 400
        if bbox is not None:
            rows = repo.public_map_site_groups(
                limit=250_000,
                coordinate_scope=scope,
                bbox=bbox,
                **_catalog_filters(),
            )
            collection = public_site_groups_geojson(
                rows, coordinate_scope=scope, compact=True
            )
            project = geolibre_project(
                collection,
                coordinate_scope=scope,
                summary=_map_summary_from_collection(collection),
            )
        else:
            catalog_filters = _catalog_filters()

            summary = repo.public_map_summary(
                coordinate_scope=scope, **catalog_filters
            )
            bounds = summary.get("bounds")
            map_view = {**area_map_view(bounds), "bbox": bounds} if bounds is not None else None
            counted = request.args.get("markers") == str(PUBLIC_MAP_MARKER_VERSION)
            style_options = {}
            if counted:
                query = world_tile_url(scope, catalog_filters, counted=True).partition("?")[2]
                # Small selections need visible markers even when spread
                # across a continent or on opposite sides of the world.
                layout = "&layout=sites" if bounds is not None and summary["groupCount"] <= 500 else ""
                style_options["basemap_style_url"] = f"{PUBLIC_MAP_MARKER_STYLE}?{query}&style={PUBLIC_MAP_STYLE_VERSION}{layout}"
            project = public_tiled_geolibre_project(
                exact_tile_url=world_tile_url("exact", catalog_filters, counted=counted),
                fallback_tile_url=world_tile_url("fallback", catalog_filters, counted=counted),
                coordinate_scope=scope,
                summary=summary,
                map_view=map_view,
                **style_options,
            )
        project["metadata"].update({
            "visibility": "public",
            "sourceOwner": "Navigator public release",
            "dataProfile": PROFILE,
            "canonicalMutationAllowed": False,
        })
        for layer in project["layers"]:
            if isinstance(layer.get("metadata"), dict):
                layer["metadata"]["visibility"] = "public"
        return jsonify(project)

    @app.get("/api/organs/<path:organ_id>/map-context.geolibre.json")
    def organ_map_context(organ_id: str):
        from .movement_projection import canonical_movement_geojson

        context = repo.organ_map_context(organ_id)
        if not context:
            return jsonify({"error": "organ_not_found"}), 404
        current = public_site_groups_geojson(context["currentGroups"], coordinate_scope="all")
        builders = public_site_groups_geojson(context["builderGroups"], coordinate_scope="all")
        movements = [
            item for item in repo.public_relocation_movements()
            if item.get("subjectId") == context["mdvsId"] and item.get("status") == "linked_complete_route"
        ]
        return jsonify(organ_context_geolibre_project(
            current, builder_collection=builders,
            movement_collection=canonical_movement_geojson(movements) if movements else None,
            organ_mdvs_id=context["mdvsId"],
            organ_title=context["title"], builder_label=context["builderLabel"],
        ))

    @app.get("/api/actors/<path:actor_id>/activity-map.geolibre.json")
    def actor_map_context(actor_id: str):
        context = repo.actor_map_context(actor_id)
        if not context:
            return jsonify({"error": "actor_not_found"}), 404
        project = actor_context_geolibre_project(
            [{"key": "builder", "code": "builder_of", "label": "Documented builder", "color": "#277f78",
              "collection": context["collection"], "targetOrganCount": context["relatedOrganCount"],
              "activityCount": context["relatedOrganCount"]}],
            actor_mdvs_id=context["mdvsId"], actor_title=context["title"],
        )
        project["metadata"].update({
            "relationshipCount": context["relatedOrganCount"], "bounded": context["bounded"],
            "directoryUrl": "/organs?" + urlencode({"builder": context["mdvsId"]}),
            "directoryLabel": "Browse related organs",
        })
        return jsonify(project)

    @app.get("/api/id/<path:identifier>")
    def resolve_identifier(identifier: str):
        try:
            resolved = repo.resolve_mdvs_id(identifier)
        except IdentityLedgerError as exc:
            return jsonify({"error": "identifier_ledger_invalid", "detail": str(exc)}), 503
        return (jsonify(resolved), 200) if resolved else (jsonify({"error": "identifier_not_found"}), 404)

    @app.get("/api/id/<path:identifier>/publication-status")
    def identifier_publication_status(identifier: str):
        value = repo.publication_status(identifier)
        return (jsonify(value), 200) if value else (jsonify({"error": "identifier_not_found"}), 404)

    @app.get("/api/aliases/<kind>/<slug>")
    def resolve_alias(kind: str, slug: str):
        try:
            resolved = repo.resolve_route_alias(kind, slug)
        except ValueError as exc:
            return jsonify({"error": "route_alias_invalid", "detail": str(exc)}), 400
        except IdentityLedgerError as exc:
            return jsonify({"error": "identifier_ledger_invalid", "detail": str(exc)}), 503
        return (jsonify(resolved), 200) if resolved else (jsonify({"error": "alias_not_found"}), 404)

    @app.route("/resolve/dataset/pod", methods=["GET", "HEAD"])
    @app.route("/dataset/pod", methods=["GET", "HEAD"])
    def dataset_identifier_dispatch():
        data = _dataset_resolution_data(
            repo.policy, versioned=False, catalog=dataset_catalog
        )
        profile = _requested_linked_data_profile(request.headers)
        target = (
            repo.policy.dataset_representation_uri(profile=profile, versioned=False)
            if profile
            else f"{repo.policy.human_base}/about/release"
        )
        return _identifier_redirect_response(
            target, status=303, data=data, policy=repo.policy
        )

    @app.route(
        "/resolve/dataset/pod/version/<release_version>",
        methods=["GET", "HEAD"],
    )
    @app.route(
        "/dataset/pod/version/<release_version>",
        methods=["GET", "HEAD"],
    )
    def dataset_version_identifier_dispatch(release_version: str):
        version_repo = release_repository(release_version)
        if version_repo is None:
            return jsonify({"error": "dataset_release_not_found"}), 404
        data = _dataset_resolution_data(
            version_repo.policy, versioned=True, catalog=distribution_catalog(release_version)
        )
        profile = _requested_linked_data_profile(request.headers)
        target = (
            version_repo.policy.dataset_representation_uri(
                profile=profile,
                release_version=release_version,
                versioned=True,
            )
            if profile
            else f"{version_repo.policy.human_base}/about/release"
        )
        return _identifier_redirect_response(
            target, status=303, data=data, policy=version_repo.policy
        )

    @app.route("/resolve/<family>/<path:token>", methods=["GET", "HEAD"])
    def resolve_route(family: str, token: str):
        prefixes = {"entity": "ENTY", "name": "NAME", "location": "LOCN"}
        if family not in prefixes:
            return jsonify({"error": "identifier_family_not_found"}), 404
        try:
            reference = parse_identifier(token, family_hint=prefixes[family])
            resolved = repo.resolve_mdvs_id(reference.value)
        except ValueError as exc:
            return jsonify({"error": "identifier_invalid", "detail": str(exc)}), 400
        except IdentityLedgerError as exc:
            return jsonify({"error": "identifier_ledger_invalid", "detail": str(exc)}), 503
        if not resolved:
            return jsonify({"error": "identifier_not_found"}), 404
        if int(resolved.get("httpStatus") or 0) == 410:
            response = jsonify(resolved)
            response.status_code = 410
            response.headers["Link"] = f'<{resolved.get("canonicalUri")}>; rel="canonical"'
            return response
        if int(resolved.get("redirectStatus") or 0) == 308:
            return _identifier_redirect_response(
                str(resolved["canonicalUri"]),
                status=308,
                data=resolved,
                policy=repo.policy,
            )
        profile = _requested_linked_data_profile(request.headers)
        target = (
            repo.policy.representation_uri(reference, profile=profile)
            if profile
            else f'{repo.policy.human_base}{resolved["canonicalRoute"]}'
        )
        return _identifier_redirect_response(
            target, status=303, data=resolved, policy=repo.policy
        )

    @app.route("/entity/<path:token>", methods=["GET", "HEAD"])
    def direct_entity_route(token: str):
        return resolve_route("entity", token)

    @app.route("/name/<path:token>", methods=["GET", "HEAD"])
    def direct_name_route(token: str):
        return resolve_route("name", token)

    @app.route("/location/<path:token>", methods=["GET", "HEAD"])
    def direct_location_route(token: str):
        return resolve_route("location", token)

    @app.route("/resolve/alias/<kind>/<path:slug>", methods=["GET", "HEAD"])
    @app.route("/alias/<kind>/<path:slug>", methods=["GET", "HEAD"])
    def alias_route(kind: str, slug: str):
        try:
            resolved = repo.resolve_route_alias(kind, slug)
        except ValueError as exc:
            return jsonify({"error": "route_alias_invalid", "detail": str(exc)}), 400
        except IdentityLedgerError as exc:
            return jsonify({"error": "identifier_ledger_invalid", "detail": str(exc)}), 503
        if not resolved:
            return jsonify({"error": "alias_not_found"}), 404
        if resolved.get("resolutionStatus") == "ambiguous":
            return jsonify(resolved), 300
        if int(resolved.get("httpStatus") or 0) == 410:
            return jsonify(resolved), 410
        return _identifier_redirect_response(
            str(resolved["canonicalUri"]),
            status=308,
            data=resolved.get("canonical") or resolved,
            policy=repo.policy,
        )

    @app.get("/dataset/pod/dataset.<profile>.jsonld")
    def dataset_representation(profile: str):
        if profile not in {"modavis", "cidoc", "pon"}:
            return jsonify({"error": "unsupported_linked_data_profile"}), 404
        policy = repo.policy
        location = policy.dataset_representation_uri(
            profile=profile, versioned=False
        )
        return _jsonld_response(
            _dataset_jsonld(
                policy,
                profile=profile,
                versioned=False,
                catalog=dataset_catalog,
            ),
            location=location,
            canonical_uri=policy.dataset_uri,
            profile_uri=policy.profile_uri(profile),
            publication_state=policy.publication_state,
        )

    @app.get("/dataset/pod/dataset.edm.xml")
    def dataset_edm_representation():
        policy = repo.policy
        return _rdfxml_response(
            dataset_edm_rdfxml(
                policy, versioned=False, catalog=dataset_catalog
            ),
            location=policy.dataset_representation_uri(
                profile="edm", versioned=False
            ),
            canonical_uri=policy.dataset_uri,
            profile_uri=policy.profile_uri("edm"),
            publication_state=policy.publication_state,
        )

    @app.get("/dataset/pod/dataset.edm.jsonld")
    def legacy_dataset_edm_representation():
        response = make_response("", 308)
        response.headers["Location"] = repo.policy.dataset_representation_uri(
            profile="edm", versioned=False
        )
        response.headers["Cache-Control"] = "public, max-age=86400"
        return response

    @app.get(
        "/dataset/pod/version/<release_version>/dataset.<profile>.jsonld"
    )
    def dataset_version_representation(release_version: str, profile: str):
        version_repo = release_repository(release_version)
        if version_repo is None:
            return jsonify({"error": "dataset_release_not_found"}), 404
        if profile not in {"modavis", "cidoc", "pon"}:
            return jsonify({"error": "unsupported_linked_data_profile"}), 404
        policy = version_repo.policy
        location = policy.dataset_representation_uri(
            profile=profile, release_version=release_version, versioned=True
        )
        return _jsonld_response(
            _dataset_jsonld(
                policy,
                profile=profile,
                versioned=True,
                catalog=distribution_catalog(release_version),
            ),
            location=location,
            canonical_uri=policy.dataset_version_uri,
            profile_uri=policy.profile_uri(profile),
            publication_state=policy.publication_state,
        )

    @app.get("/dataset/pod/version/<release_version>/dataset.edm.xml")
    def dataset_version_edm_representation(release_version: str):
        version_repo = release_repository(release_version)
        if version_repo is None:
            return jsonify({"error": "dataset_release_not_found"}), 404
        policy = version_repo.policy
        return _rdfxml_response(
            dataset_edm_rdfxml(
                policy, versioned=True, catalog=distribution_catalog(release_version)
            ),
            location=policy.dataset_representation_uri(
                profile="edm", release_version=release_version, versioned=True
            ),
            canonical_uri=policy.dataset_version_uri,
            profile_uri=policy.profile_uri("edm"),
            publication_state=policy.publication_state,
        )

    @app.get("/dataset/pod/version/<release_version>/dataset.edm.jsonld")
    def legacy_dataset_version_edm_representation(release_version: str):
        version_repo = release_repository(release_version)
        if version_repo is None:
            return jsonify({"error": "dataset_release_not_found"}), 404
        response = make_response("", 308)
        response.headers["Location"] = version_repo.policy.dataset_representation_uri(
            profile="edm", release_version=release_version, versioned=True
        )
        response.headers["Cache-Control"] = "public, max-age=86400"
        return response

    @app.get(
        "/dataset/pod/version/<release_version>/schema/"
        "public-source-projection-1.0.json"
    )
    def dataset_public_source_projection_schema(release_version: str):
        version_repo = release_repository(release_version)
        if version_repo is None:
            return jsonify({"error": "dataset_release_not_found"}), 404
        response = jsonify(public_source_projection_schema(version_repo.policy))
        response.headers["Content-Location"] = (
            version_repo.policy.public_source_projection_schema_uri()
        )
        response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
        response.headers["X-MODAVIS-Publication-State"] = (
            version_repo.policy.publication_state
        )
        return response

    @app.get(
        "/dataset/pod/version/<release_version>/distribution-manifest.json"
    )
    def dataset_distribution_manifest(release_version: str):
        version_repo = release_repository(release_version)
        if version_repo is None:
            return jsonify({"error": "dataset_release_not_found"}), 404
        policy = version_repo.policy
        catalog = distribution_catalog(release_version)
        document = catalog.public_manifest(policy) if catalog else None
        if document is None:
            return jsonify({"error": "dataset_distributions_not_prepared"}), 404
        response = jsonify(document)
        response.headers["Content-Location"] = dataset_manifest_uri(policy)
        response.headers["Cache-Control"] = "public, max-age=300"
        response.headers["X-MODAVIS-Publication-State"] = policy.publication_state
        return response

    @app.get(
        "/dataset/pod/version/<release_version>/distributions/"
        "<artifact_set>/<path:filename>"
    )
    def dataset_distribution_file(
        release_version: str, artifact_set: str, filename: str
    ):
        version_repo = release_repository(release_version)
        if version_repo is None:
            return jsonify({"error": "dataset_release_not_found"}), 404
        catalog = distribution_catalog(release_version)
        if catalog is None:
            return jsonify({"error": "dataset_distributions_not_prepared"}), 404
        try:
            resolved = catalog.resolve_file(
                release_version, artifact_set, filename
            )
        except DatasetDistributionError as exc:
            response = jsonify(
                {"error": "dataset_distribution_unavailable", "detail": str(exc)}
            )
            response.status_code = 503
            response.headers["Cache-Control"] = "no-store"
            return response
        if resolved is None:
            return jsonify({"error": "dataset_distribution_not_found"}), 404
        path, item = resolved
        response = send_file(
            path,
            mimetype="application/gzip",
            as_attachment=True,
            download_name=item.filename,
            conditional=True,
            etag=item.sha256,
        )
        response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
        response.headers["X-Checksum-SHA256"] = item.sha256
        response.headers["X-RDF-Media-Type"] = "application/n-triples"
        response.headers["X-RDF-Statement-Count"] = str(item.statement_count)
        return response

    @app.get(
        "/dataset/pod/version/<release_version>/<family>/<path:artifact>"
    )
    def entity_representation(release_version: str, family: str, artifact: str):
        version_repo = release_repository(release_version)
        if version_repo is None:
            return jsonify({"error": "dataset_release_not_found"}), 404
        prefixes = {"entity": "ENTY", "name": "NAME", "location": "LOCN"}
        if family not in prefixes:
            return resolve_release_resource(release_version, family + "/" + artifact)
        extension = artifact.rsplit(".", 1)[-1] if "." in artifact else ""
        if extension not in FORMAT_MEDIA_TYPES:
            return jsonify({"error": "unsupported_linked_data_format"}), 404
        if (version_repo.policy.policy_version != "2"
                and not _supports_complete_entity_exports(release_version)
                and extension != "jsonld"):
            return jsonify({"error": "unsupported_linked_data_format"}), 404
        stem = artifact.removesuffix(f".{extension}")
        if "." not in stem:
            return jsonify({"error": "linked_data_profile_required"}), 404
        token, profile = stem.rsplit(".", 1)
        if profile not in {"modavis", "cidoc", "pon", "edm"}:
            return jsonify({"error": "unsupported_linked_data_profile"}), 404
        try:
            reference = parse_identifier(token, family_hint=prefixes[family])
            resolved = version_repo.resolve_mdvs_id(reference.value)
        except ValueError as exc:
            return jsonify({"error": "identifier_invalid", "detail": str(exc)}), 400
        except IdentityLedgerError as exc:
            return jsonify({"error": "identifier_ledger_invalid", "detail": str(exc)}), 503
        if not resolved:
            return jsonify({"error": "identifier_not_found"}), 404
        canonical_reference = parse_identifier(str(resolved["identityMdvsId"]))
        location = version_repo.policy.representation_uri(
            canonical_reference, profile=profile, media_extension=extension
        )
        if version_repo.policy.policy_version == "2" or _supports_complete_entity_exports(release_version):
            kind, record = record_from_resolution(version_repo, resolved)
            if not record:
                return jsonify({"error": "entity_not_found"}), 404
            try:
                body, media_type, profile_metadata = serialize_entity(
                    kind, record, profile, extension, version_repo.policy
                )
            except KeyError:
                return jsonify({"error": "unsupported_entity_export_combination"}), 404
            response = Response(body, content_type=f"{media_type}; charset=utf-8")
            response.headers["Content-Location"] = location
            response.headers["Content-Profile"] = f'<{profile_metadata["profile"]}>'
            response.headers["Cache-Control"] = "public, max-age=86400, immutable"
            response.headers["Vary"] = "Accept, Accept-Profile"
            response.headers["X-MODAVIS-Publication-State"] = version_repo.policy.publication_state
            response.headers.add("Link", f'<{resolved["canonicalUri"]}>; rel="canonical"')
            response.set_etag(hashlib.sha256(body.encode("utf-8")).hexdigest())
            return response.make_conditional(request)
        if resolved.get("canonicalRouteKind") == "organ":
            organ = version_repo.get_organ_surface(canonical_reference.value)
            if not organ:
                return jsonify({"error": "organ_not_found"}), 404
            payload, profile_metadata = organ_jsonld(profile, organ, policy=version_repo.policy)
            profile_uri = str(profile_metadata["profile"])
        else:
            payload = _generic_identity_jsonld(
                resolved, profile=profile, policy=version_repo.policy
            )
            profile_uri = version_repo.policy.profile_uri(profile)
        return _jsonld_response(
            payload,
            location=location,
            canonical_uri=str(resolved["canonicalUri"]),
            profile_uri=profile_uri,
            publication_state=version_repo.policy.publication_state,
        )

    @app.get("/api/lod/<standard>/<path:organ_id>")
    def lod_organ(standard: str, organ_id: str):
        normalized = normalize_standard(standard)
        if not normalized:
            return jsonify({"error": "unsupported_linked_data_profile"}), 404
        if repo.policy.policy_version == "2":
            try:
                reference = parse_identifier(organ_id, family_hint="ENTY")
                resolved = repo.resolve_mdvs_id(reference.value)
            except ValueError:
                resolved = None
            kind, organ = record_from_resolution(repo, resolved) if resolved else (None, None)
            if kind != "organ":
                organ = None
        else:
            organ = repo.get_organ_surface(organ_id)
        if not organ:
            return jsonify({"error": "organ_not_found"}), 404
        payload, profile = organ_jsonld(normalized, organ, policy=repo.policy)
        response = jsonify(payload)
        response.content_type = f'application/ld+json; profile="{profile["profile"]}"'
        response.headers["Link"] = ", ".join(alternate_links(organ["mdvsId"], policy=repo.policy))
        response.headers["Content-Location"] = repo.policy.representation_uri(
            str(organ["mdvsId"]), profile=normalized
        )
        return response

    return app
