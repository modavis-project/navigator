"""Explicit publication registry for normative VAO documents, separate from RDF."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
import re

from flask import Response, jsonify, request

AUTHORITY = 'https://w3id.org/modavis/'
SOURCE_BASE = 'https://raw.githubusercontent.com/modavis-project/vao-standard/'
DEFAULT_REGISTRY = Path(__file__).with_name('vao_profiles.json')
PROFILE_PATH = re.compile(r'vao/profile/[a-z0-9-]+(?:/[a-z0-9-]+)*/([0-9]+\.[0-9]+\.[0-9]+)')


def unique_keys(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError('duplicate profile registry key')
        result[key] = value
    return result


class ProfileCatalog:
    def __init__(self, registry=DEFAULT_REGISTRY):
        raw = Path(registry).read_bytes()
        self.digest = hashlib.sha256(raw).hexdigest()
        manifest = json.loads(raw, object_pairs_hook=unique_keys)
        if manifest.get('contract') != 'modavis.vao-profile-publication/v1':
            raise ValueError('invalid profile registry contract')
        self.entries = manifest['entries']
        for path, entry in self.entries.items():
            match = PROFILE_PATH.fullmatch(path)
            if not match or entry['version'] != match[1] or entry['identifier'] != AUTHORITY + path:
                raise ValueError('invalid profile identifier/version binding')
            source = entry['sourcePath']
            if (entry['sourceTag'] != 'v' + entry['version']
                    or not re.fullmatch(r'[a-f0-9]{40}', entry['sourceCommit'])
                    or not re.fullmatch(r'Docs/(?:[A-Za-z0-9_-]+/)*[A-Za-z0-9_][A-Za-z0-9_.-]*\.md', source)
                    or entry['target'] != SOURCE_BASE + entry['sourceTag'] + '/' + source):
                raise ValueError('invalid immutable profile source/target')
            if (entry['mediaType'] != 'text/plain' or entry['documentFormat'] != 'Markdown'
                    or not re.fullmatch(r'[a-f0-9]{64}', entry['sha256'])
                    or type(entry['bytes']) is not int or entry['bytes'] <= 0):
                raise ValueError('invalid profile representation/fixity')

    def lookup(self, path):
        # Only one optional trailing slash; no normalization or URL construction.
        path = path.removesuffix('/')
        return self.entries.get(path) if PROFILE_PATH.fullmatch(path) else None


def register_profile_routes(app, catalog=None):
    catalog = catalog or ProfileCatalog()
    app.extensions['vao_profile_catalog'] = catalog

    def resolve(tail=''):
        entry = catalog.lookup('vao/profile/' + tail)
        if entry is None:
            response = jsonify(error='vao_profile_not_found')
            response.status_code = 404
        elif request.headers.get('Accept') and not request.accept_mimetypes.best_match(['text/plain', 'text/html']):
            # HTML is a browser navigation preference, not an invented HTML/RDF
            # representation. The unchanged upstream Markdown is text/plain.
            response = jsonify(error='unsupported_vao_profile_format', available=['text/plain'], browserNavigation='text/html')
            response.status_code = 406
        else:
            response = Response(status=303, headers={'Location': entry['target']})
            response.headers['Cache-Control'] = 'public, max-age=86400, immutable'
            response.headers['Link'] = f'<{entry["identifier"]}>; rel="canonical", <{entry["target"]}>; rel="alternate"; type="text/plain"'
        response.headers.setdefault('Cache-Control', 'no-store')
        response.headers['Vary'] = 'Accept'
        response.headers['X-Content-Type-Options'] = 'nosniff'
        return response

    for prefix in ('/', '/resolve/'):
        for suffix in ('', '/', '/<path:tail>'):
            app.add_url_rule(prefix + 'vao/profile' + suffix,
                             endpoint='vao_profile_' + str(len(app.url_map._rules)),
                             view_func=resolve, methods=['GET', 'HEAD'])
