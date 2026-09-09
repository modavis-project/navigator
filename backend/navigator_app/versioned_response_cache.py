"""Bounded process-local cache for immutable public RDF representations."""
from collections import OrderedDict
from threading import Lock

from flask import Response, g, request

RDF_MEDIA = {'application/ld+json', 'application/n-triples', 'text/turtle', 'application/rdf+xml'}


class VersionedResponseCache:
    def __init__(self, max_bytes=64 * 1024 * 1024, max_entries=128):
        self.max_bytes = max_bytes
        self.max_entries = max_entries
        self.bytes = 0
        self.entries = OrderedDict()
        self.lock = Lock()

    def get(self, key):
        with self.lock:
            value = self.entries.get(key)
            if value is not None:
                self.entries.move_to_end(key)
            return value

    def put(self, key, value):
        size = len(value[0]) + sum(len(k) + len(v) for k, v in value[2])
        if size > self.max_bytes // 2:
            return
        with self.lock:
            previous = self.entries.pop(key, None)
            if previous:
                self.bytes -= previous[3]
            while self.entries and (self.bytes + size > self.max_bytes or len(self.entries) >= self.max_entries):
                self.bytes -= self.entries.popitem(last=False)[1][3]
            self.entries[key] = (*value, size)
            self.bytes += size


def register_versioned_response_cache(app, **limits):
    # Each application has one immutable source-release configuration. No cache
    # is shared with other source databases, policies, hosts, or application instances.
    cache = VersionedResponseCache(**limits)
    app.extensions['versioned_response_cache'] = cache

    @app.before_request
    def read_cached_rdf():
        if request.method not in {'GET', 'HEAD'} or not request.path.startswith((
            '/dataset/pod/version/', '/resolve/dataset/pod/version/',
        )) or request.headers.get('Range') or request.headers.get('Authorization'):
            return None
        key = (request.full_path, request.headers.get('Accept', ''), request.headers.get('Accept-Profile', ''))
        g.versioned_rdf_cache_key = key
        cached = cache.get(key)
        if cached is None:
            return None
        body, status, headers, _ = cached
        response = Response(body, status=status, headers=headers)
        g.versioned_rdf_cache_hit = True
        return response.make_conditional(request) if status == 200 else response

    @app.after_request
    def store_rdf(response):
        key = getattr(g, 'versioned_rdf_cache_key', None)
        if (key is None or getattr(g, 'versioned_rdf_cache_hit', False)
                or response.is_streamed or response.headers.get('Set-Cookie')
                or response.status_code not in {200, 303}
                or response.cache_control.no_store or response.cache_control.private
                or not response.cache_control.public):
            return response
        if response.status_code == 200 and response.mimetype not in RDF_MEDIA:
            return response
        if set(response.vary) - {'Accept', 'Accept-Profile'}:
            return response
        # Date is regenerated when replaying a conditional response.
        headers = [(k, v) for k, v in response.headers.to_wsgi_list() if k.lower() != 'date']
        cache.put(key, (response.get_data(), response.status_code, headers))
        return response
