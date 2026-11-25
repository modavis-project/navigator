"""Reuse anonymous Navigator presentations of the selected public POD."""

from hashlib import sha256
import json
from pathlib import Path
from time import monotonic

from flask import Response, g, request

from .db import query_deadline
from .versioned_response_cache import VersionedResponseCache


SNAPSHOT_HEADER = "X-MODAVIS-POD-Snapshot"
CREDENTIAL_HEADERS = (
    "Cookie", "Authorization", "X-Navigator-Actor-Id", "X-Navigator-Auth-Provider",
    "X-Navigator-Subject", "X-CSRF-Token",
)
PUBLIC_READS = frozenset({
    "explore", "entity_search", "discovery_context", "organ_list", "organ_facets",
    "organ_detail", "organ_citation", "organ_sources", "organ_specification",
    "organ_history", "organ_related", "public_place", "public_area", "public_area_map",
    "public_area_map_site", "public_area_map_style", "persons",
    "actor_detail", "actor_collection", "event_list", "event_detail", "literature_list",
    "literature_detail", "digital_score_list", "digital_score_detail",
    "tuning_system_list", "tuning_system_detail", "tuning_system_organs",
    "virtual_instrument_list", "virtual_instrument_detail", "vocabulary_schemes",
    "vocabulary_overview", "vocabulary_concepts", "vocabulary_concept",
    "vocabulary_source_term", "map_places", "map_summary", "map_area_summary", "map_project",
    "map_movements", "relocation_summary", "public_source", "release_context",
})
SNAPSHOT_MAX_AGE = 86400


def public_read_snapshot(binding, settings):
    if not (binding.get("publicCoreSha256") or binding.get("publicManifestSha256")):
        return None
    # A deployment can change the representation even when the POD is unchanged.
    # Use the installed source so every worker of a build derives the same key.
    digest = sha256(json.dumps({
        "binding": binding,
        "release": settings.uri_release_version,
        "publicationState": settings.uri_publication_state,
        "urls": [settings.public_base_url, settings.canonical_id_base,
                 settings.resolver_base_url, settings.linked_data_base_url],
    }, sort_keys=True).encode())
    for module in sorted(Path(__file__).parent.glob("*.py")):
        digest.update(module.name.encode())
        digest.update(sha256(module.read_bytes()).digest())
    return digest.hexdigest()


def register_public_read_cache(app, snapshot):
    cache = VersionedResponseCache(max_bytes=12 * 1024 * 1024, max_entries=160)

    @app.before_request
    def read_public_response():
        if request.method not in {"GET", "HEAD"} or request.endpoint not in PUBLIC_READS:
            return None
        mode = request.args.get("mode", "").lower()
        if (any(name in request.headers for name in CREDENTIAL_HEADERS)
                or (request.endpoint != "map_project" and mode not in {"", "surface"})
                or request.headers.get("Range") or request.headers.get("Accept-Profile")
                or request.args.get("format") == "ro-crate"):
            g.public_read_no_store = True
            return None
        if not snapshot:
            return None

        # Keep arbitrary search text in the browser's own cache only.
        g.public_read_cacheable = True
        if (len(request.query_string) > 2048
                or any(request.args.get(name) for name in ("q", "query", "commentary_q"))):
            return None
        key = (request.host, request.scheme, request.path, request.query_string)
        g.public_read_key = key
        saved = cache.get(key)
        if saved is None:
            return None
        body, status, headers, _ = saved
        g.public_read_hit = True
        return Response(body, status=status, headers=headers)

    @app.after_request
    def cache_public_response(response):
        if getattr(g, "public_read_no_store", False):
            response.headers["Cache-Control"] = "no-store"
        if (not getattr(g, "public_read_cacheable", False)
                or response.status_code != 200 or response.mimetype != "application/json"
                or response.is_streamed or response.headers.get("Set-Cookie")
                or response.cache_control.no_store or response.cache_control.private
                or response.vary):
            return response
        deadline = query_deadline.get()
        if deadline is not None and monotonic() >= deadline:
            return response

        body = response.get_data()
        if not response.get_etag()[0]:
            response.set_etag(sha256(body).hexdigest(), weak=True)
        key = getattr(g, "public_read_key", None)
        if key is not None:
            hit = getattr(g, "public_read_hit", False)
            if not hit:
                cache.put(key, (body, response.status_code, response.headers.to_wsgi_list()))
            response.headers.add("Server-Timing", f'navigator-cache;desc="{"hit" if hit else "miss"}"')

        if request.headers.get(SNAPSHOT_HEADER) == snapshot and request.endpoint != "release_context":
            response.headers["Cache-Control"] = f"private, max-age={SNAPSHOT_MAX_AGE}, immutable"
        else:
            response.headers["Cache-Control"] = "private, no-cache"
        response.vary.update([SNAPSHOT_HEADER, *CREDENTIAL_HEADERS])
        return response.make_conditional(request)
