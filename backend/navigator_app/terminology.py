"""Read-only, manifest-bound routing for published MODAVIS terminology.

All publication bytes are verified at startup. Requests never fetch URLs or
select arbitrary filesystem paths; current aliases are explicit manifest data.
"""
from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path
from urllib.parse import quote

from flask import Response, jsonify, request

MEDIA = {'html':'text/html', 'jsonld':'application/ld+json', 'ttl':'text/turtle',
         'rdf':'application/rdf+xml', 'nt':'application/n-triples'}
DEFAULT_BUNDLE = Path(__file__).with_name('terminology_data')


class TerminologyCatalog:
    def __init__(self, root=DEFAULT_BUNDLE):
        self.root = Path(root)
        raw = (self.root / 'manifest.json').read_bytes()
        self.digest = hashlib.sha256(raw).hexdigest()
        self.manifest = json.loads(raw)
        if self.manifest.get('contract') != 'modavis.terminology-publication/v1':
            raise ValueError('invalid terminology manifest')
        self.authority = self.manifest['authority']
        self.data_base = self.manifest['dataBase']
        self.documents = self.manifest['documents']
        self.aliases = self.manifest['aliases']
        self.bytes = {}
        self.terms = {}
        for path, doc in self.documents.items():
            for ext, record in doc['formats'].items():
                filename = record['file']
                if ext not in MEDIA or Path(filename).name != filename:
                    raise ValueError('invalid terminology artifact')
                body = (self.root / filename).read_bytes()
                if len(body) != record['bytes'] or hashlib.sha256(body).hexdigest() != record['sha256']:
                    raise ValueError('terminology artifact hash mismatch')
                self.bytes[path, ext] = body
        if any(target not in self.documents for target in self.aliases.values()):
            raise ValueError('unknown terminology alias target')
        for alias in ('vocab', 'vao/vocab'):
            target = self.aliases[alias]
            for subject in self.documents[target]['subjects']:
                prefix = self.authority + '/' + alias + '/'
                if subject.startswith(prefix):
                    self.terms[subject[len(self.authority)+1:]] = target

    def lookup(self, path):
        path = path.rstrip('/')
        # Flask has already decoded the path once. Reject leftover escapes and
        # delimiters rather than guessing another decoding or normalization.
        if not re.fullmatch(r'[A-Za-z0-9._:/-]+', path) or any(p in {'.','..',''} for p in path.split('/')):
            return None
        extension = None
        if '.' in path and path.rsplit('.', 1)[1] in MEDIA:
            path, extension = path.rsplit('.', 1)
        target = path if path in self.documents else self.aliases.get(path) or self.terms.get(path)
        if target is None:
            return None
        return path, target, extension


def register_terminology_routes(app, catalog=None):
    catalog = catalog or TerminologyCatalog()
    app.extensions['terminology_catalog'] = catalog
    from .vao_profiles import register_profile_routes
    register_profile_routes(app)

    def resolve(path):
        result = catalog.lookup(path)
        if not result:
            response = jsonify({'error':'terminology_resource_not_found'})
            response.status_code = 404
            response.headers['Cache-Control'] = 'no-store'
            response.headers['Vary'] = 'Accept'
            return response
        identity, target, extension = result
        doc = catalog.documents[target]
        formats = doc['formats']
        available = {key:value for key,value in MEDIA.items() if key=='html' or key in formats}
        chosen = extension
        if not chosen:
            match = request.accept_mimetypes.best_match(list(available.values())) if request.headers.get('Accept') else 'text/html'
            chosen = next((key for key,value in available.items() if value == match), None)
        if chosen not in available:
            response = jsonify({'error':'unsupported_terminology_format', 'available':list(available.values())})
            response.status_code = 406
            response.headers['Cache-Control'] = 'no-store'
            response.headers['Vary'] = 'Accept'
            return response
        canonical = catalog.authority + '/' + identity
        data_document = catalog.data_base + '/' + target
        if chosen == 'html':
            # A selected term needs a real description, not an unchecked anchor
            # in the publication site's aggregate HTML document.
            if identity in catalog.terms:
                from html import escape
                links = ' · '.join(f'<a href="{escape(data_document+"."+ext, quote=True)}">{escape(ext.upper())}</a>' for ext in formats)
                from rdflib import Graph, URIRef
                graph = Graph().parse(data=catalog.bytes[target,'ttl'], format='turtle')
                rows = ''.join('<tr><th>'+escape(str(p))+'</th><td>'+escape(str(o))+'</td></tr>' for p,o in sorted(graph.predicate_objects(URIRef(canonical)),key=lambda row:tuple(map(str,row))))
                body = '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>MODAVIS terminology</title><style>body{font:16px system-ui;max-width:72rem;margin:3rem auto;padding:0 1rem;color:#172f39}a{color:#156078}table{border-collapse:collapse;width:100%}th,td{text-align:left;vertical-align:top;padding:.7rem;border-bottom:1px solid #ddd;overflow-wrap:anywhere}th{width:35%}h1{overflow-wrap:anywhere}</style><main><p>MODAVIS · Published terminology</p><h1>'+escape(identity.split('/')[-1])+'</h1><p>'+escape(canonical)+'</p><p>'+links+'</p><table>'+rows+'</table><p><a href="'+escape(doc['html'],quote=True)+'">Publication documentation</a></p></main></html>'
                response = Response(body, content_type='text/html; charset=utf-8')
                response.headers['Content-Security-Policy'] = "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'"
                response.set_etag(hashlib.sha256(body.encode()).hexdigest())
            else:
                response = Response(status=303, headers={'Location':doc['html']})
        elif extension:
            body = catalog.bytes[target,chosen]
            response = Response(body, content_type=MEDIA[chosen]+'; charset=utf-8')
            response.headers['Content-Location'] = data_document+'.'+chosen
            response.set_etag(hashlib.sha256(body).hexdigest())
        else:
            response = Response(status=303, headers={'Location':data_document+'.'+chosen})
        response.headers['Vary'] = 'Accept'
        response.headers['Cache-Control'] = ('public, max-age=86400, immutable' if identity in catalog.documents else 'public, max-age=300')
        response.headers['X-Content-Type-Options'] = 'nosniff'
        profile = (catalog.authority+'/vao/'+target.split('/')[1] if target.startswith('vao/')
                   else catalog.authority+'/ontology/'+target.rsplit('/',1)[1])
        response.headers['Content-Profile'] = '<'+profile+'>'
        response.headers.add('Link', '<'+canonical+'>; rel="canonical"')
        response.headers.add('Link', '<'+profile+'>; rel="profile"')
        for ext in formats:
            response.headers.add('Link', f'<{data_document}.{ext}>; rel="alternate"; type="{MEDIA[ext]}"')
        return response.make_conditional(request) if response.status_code==200 else response

    app.extensions['terminology_resolver'] = resolve
    for family in ('ontology','vocab','context','shapes','release'):
        for prefix in ('/', '/resolve/'):
            for suffix in ('', '/', '/<path:tail>'):
                def dispatch(tail='', family=family):
                    return resolve(family+('/'+tail if tail else ''))
                app.add_url_rule(prefix+family+suffix, endpoint='terminology_'+str(len(app.url_map._rules)), view_func=dispatch, methods=['GET','HEAD'])
    for prefix in ('/', '/resolve/'):
        for suffix in ('ontology','ontology/','vocab','vocab/','vocab/<path:tail>','<version>/vocabulary','<version>/vocabulary.<extension>'):
            def vao(tail='',version=None,extension=None):
                path = request.path.removeprefix('/resolve/').lstrip('/')
                return resolve(path)
            app.add_url_rule(prefix+'vao/'+suffix, endpoint='terminology_vao_'+str(len(app.url_map._rules)), view_func=vao, methods=['GET','HEAD'])
    return resolve
