"""Keep published representations bound to their explicitly pinned renderer."""
from __future__ import annotations

import json
import os
import re
from urllib.parse import urlsplit

import requests
from flask import Response, request, stream_with_context

_PATH = re.compile(r"^/(?:resolve/)?dataset/pod/version/([^/]+)(?:/|$)")
_HOP_HEADERS = frozenset({"connection", "keep-alive", "proxy-authenticate", "proxy-authorization",
                          "te", "trailer", "transfer-encoding", "upgrade"})
_FORWARD_HEADERS = ("Accept", "Accept-Profile", "Accept-Encoding", "If-None-Match", "If-Modified-Since", "Range", "If-Range")


def register_historical_renderers(app, settings, *, configuration=None, transport=None):
    """Register before response caches; a pinned renderer failure never falls back."""
    raw = os.environ.get("NAVIGATOR_HISTORICAL_RENDERERS", "") if configuration is None else configuration
    entries = json.loads(raw) if raw else {}
    if not isinstance(entries, dict):
        raise ValueError("historical renderers must be a release mapping")
    origins = {}
    client = transport or requests.Session()
    client.trust_env = False
    verified = set()
    for version, entry in entries.items():
        if (not isinstance(version, str) or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]{0,63}", version)
                or version == settings.uri_release_version or not isinstance(entry, dict)):
            raise ValueError("invalid historical renderer release")
        base = entry.get("baseUrl", "")
        parts = urlsplit(base)
        if (parts.scheme not in {"http", "https"} or not parts.hostname or parts.username or parts.password
                or parts.path not in {"", "/"} or parts.query or parts.fragment or not entry.get("rendererRelease")):
            raise ValueError("historical renderer must be a fixed origin and release")
        base = base.rstrip("/")
        key = (base, entry["rendererRelease"])
        if key not in verified:
            for suffix in ("/api/release-context", "/api/health/ready"):
                response = client.get(base + suffix, timeout=(5, 30), allow_redirects=False)
                try:
                    response.raise_for_status()
                    if response.status_code != 200:
                        raise ValueError("historical renderer redirected its readiness endpoint")
                    value = response.json()
                    if suffix.endswith("release-context"):
                        if value.get("releaseVersion") != entry["rendererRelease"]:
                            raise ValueError("historical renderer release does not match its binding")
                    elif not value.get("ok"):
                        raise ValueError("historical renderer is not ready")
                finally:
                    response.close()
            verified.add(key)
        origins[version] = base
    if not origins:
        client.close()
        return set()

    public_hosts = {urlsplit(value).netloc for value in (
        settings.public_base_url, settings.resolver_base_url, settings.linked_data_base_url)}
    canonical_host = urlsplit(settings.public_base_url).netloc
    canonical_scheme = urlsplit(settings.public_base_url).scheme
    canonical_prefix = settings.canonical_id_base.rstrip("/") + "/dataset/pod/version/"

    @app.before_request
    def preserve_historical_representation():
        if request.method not in {"GET", "HEAD"}:
            return None
        match = _PATH.match(request.path)
        version = match.group(1) if match else None
        if request.path == "/api/public/resources":
            uri = request.args.get("uri", "")
            if uri.startswith(canonical_prefix):
                version = uri[len(canonical_prefix):].split("/", 1)[0]
        base = origins.get(version)
        if base is None:
            return None
        headers = {key: request.headers[key] for key in _FORWARD_HEADERS if key in request.headers}
        # Public requests keep their origin; loopback canaries compare the frozen
        # public representation, without substituting localhost delivery links.
        headers.setdefault("Accept-Encoding", "identity")
        headers["Host"] = request.host if request.host in public_hosts else canonical_host
        headers["X-Forwarded-Proto"] = canonical_scheme
        target = base + request.path
        if request.query_string:
            target += "?" + request.query_string.decode("latin-1")
        try:
            upstream = client.request(request.method, target, headers=headers, timeout=(5, 120),
                                      allow_redirects=False, stream=True)
        except requests.RequestException:
            return {"error": "historical_renderer_unavailable", "release": version}, 502
        blocked = _HOP_HEADERS | {v.strip().lower() for v in upstream.headers.get("Connection", "").split(",")}
        response_headers = [(key, value) for key, value in upstream.headers.items() if key.lower() not in blocked]
        if request.method == "HEAD" or upstream.status_code in {204, 304}:
            upstream.close()
            return Response(status=upstream.status_code, headers=response_headers)

        @stream_with_context
        def body():
            try:
                yield from upstream.raw.stream(64 * 1024, decode_content=False)
            finally:
                upstream.close()

        result = Response(body(), status=upstream.status_code, headers=response_headers,
                          direct_passthrough=True)
        result.call_on_close(upstream.close)
        return result

    app.extensions["historical_renderer_client"] = client
    return set(origins)
