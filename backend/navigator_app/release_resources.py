"""HTTP resolution of versioned RDF resources against their defining graphs."""
from __future__ import annotations

import base64
import binascii
import hashlib
import re
from urllib.parse import quote, urlencode, urlsplit, unquote

from flask import Response, jsonify, request
from rdflib import Graph, Literal, RDF, RDFS, URIRef
from rdflib.namespace import DCTERMS, FOAF, SKOS

from .entity_exports import (
    CORE, FORMAT_MEDIA_TYPES, _add_actor, _add_source, _apply_resource_annotations, _graph, _jsonld, _resource_factory, exact_nt_lines, exact_turtle,
)
from .resource_families import AUTHORITATIVE_PROFILES, UnregisteredResourceFamilyError, require_resource_family
from .identity_ledger import IdentityLedgerError
from .resource_description import describe_resource
from .uri_policy import ResourceUriFactory, parse_identifier


class ResourceError(Exception):
    def __init__(self, code, status=404):
        self.code, self.status = code, status


def source_key(token):
    """Decode only canonical, unpadded Base64URL; never decode a path twice."""
    if not re.fullmatch(r'[A-Za-z0-9_-]{1,256}', token):
        raise ResourceError('resource_token_invalid', 400)
    try:
        value = base64.b64decode(token + '=' * (-len(token) % 4), altchars=b'-_', validate=True).decode('utf-8')
    except (ValueError, UnicodeError, binascii.Error):
        raise ResourceError('resource_token_invalid', 400) from None
    if base64.urlsafe_b64encode(value.encode()).decode().rstrip('=') != token or not value:
        raise ResourceError('resource_token_invalid', 400)
    return value


def representation(graph, extension):
    if extension == 'jsonld':
        return _jsonld(graph)
    if extension == 'ttl':
        return exact_turtle(graph)
    if extension == 'nt':
        return '\n'.join(exact_nt_lines(graph)) + '\n'
    body = graph.serialize(format={'rdf':'xml', 'xml':'xml'}[extension])
    return body


def register_release_resource_routes(app, release_repository, record_from_resolution, active_release):
    def lookup(repo, operation, key):
        reader = getattr(repo, 'release_resource_lookup', None)
        if not callable(reader):
            raise ResourceError('release_resource_reader_unavailable', 503)
        return reader(operation, key)

    def owner_graph(repo, family, token, profile):
        if family not in {'entity', 'name', 'location'}:
            raise ResourceError('identifier_family_not_found')
        if profile not in AUTHORITATIVE_PROFILES:
            raise ResourceError('unsupported_linked_data_profile')
        try:
            ref = parse_identifier(token, family_hint={'entity':'ENTY','name':'NAME','location':'LOCN'}[family])
        except ValueError:
            raise ResourceError('identifier_invalid', 400) from None
        resolved = repo.resolve_mdvs_id(ref.value)
        if not resolved:
            raise ResourceError('identifier_not_found')
        kind, record = record_from_resolution(repo, resolved)
        if not record:
            raise ResourceError('entity_not_found')
        if profile == 'pon' and kind != 'organ':
            raise ResourceError('unsupported_entity_export_combination')
        factory = _resource_factory(kind, record, repo.policy)
        if (family, token) != (factory.owner_family, factory.owner_token):
            raise ResourceError('resource_owner_mismatch')
        graph = _graph(kind, record, profile, repo.policy)
        document = factory.profile_document_uri(profile)
        graph.add((URIRef(document), RDF.type, FOAF.Document))
        graph.add((URIRef(document), FOAF.primaryTopic, URIRef(factory.owner_uri)))
        graph.add((URIRef(document), DCTERMS.isPartOf, URIRef(repo.policy.dataset_version_uri)))
        return graph, document, factory.human_uri(kind, factory.owner_identifier), {
            'uri':factory.owner_uri, 'identifier':factory.owner_identifier,
            'label':record.get('title') or record.get('label') or factory.owner_identifier,
            'url':factory.human_uri(kind, factory.owner_identifier), 'kind':kind,
        }

    def shared_graph(repo, family, key):
        value = lookup(repo, family, key)
        if value is None:
            raise ResourceError('resource_not_found')
        factory = ResourceUriFactory.for_release(repo.policy)
        graph = Graph()
        if family == 'source-record':
            subject = _add_source(graph, factory, value)
        elif family == 'musixplora-actor':
            subject = URIRef(factory.resource_uri(family, stable_key=key))
            graph.add((subject, RDF.type, CORE.Agent))
            graph.add((subject, DCTERMS.identifier, Literal(key)))
            graph.add((subject, RDFS.label, Literal(key)))
        elif family == 'musixplora-relation':
            subject = URIRef(factory.resource_uri(family, stable_key=key))
            _add_actor(graph, subject, {'musiXploraRelations':value if isinstance(value, list) else [value]}, factory)
        else:
            raise ResourceError('resource_family_not_found')
        if not any(graph.triples((subject, None, None))):
            raise ResourceError('resource_not_found')
        return _apply_resource_annotations(graph, factory), str(subject)

    def term_document(repo, category, family):
        expected = 'technical-fact-property' if category == 'schema' else family
        try:
            registered = require_resource_family(expected)
        except ValueError:
            raise ResourceError('resource_family_not_found') from None
        if registered.semantic_category != f'release_{category}_term':
            raise ResourceError('resource_family_not_found')
        if category == 'schema' and family != 'release-resource-properties':
            raise ResourceError('resource_family_not_found')
        factory = ResourceUriFactory.for_release(repo.policy)
        document = f'{repo.policy.dataset_version_uri}/{category}/{family}'
        graph = Graph()
        graph.add((URIRef(document), RDF.type, FOAF.Document if category == 'schema' else SKOS.ConceptScheme))
        graph.add((URIRef(document), RDFS.label, Literal(f'{family} — Release {repo.policy.release_version}')))
        for key in lookup(repo, 'terms', expected):
            subject = URIRef(factory.resource_uri(expected, stable_key=key))
            for rdf_type in registered.rdf_types:
                graph.add((subject, RDF.type, URIRef(rdf_type)))
            graph.add((subject, RDFS.label, Literal(str(key).replace('_', ' ').title() if expected in {'technical-fact-property','media-status'} else 'organ builder' if expected == 'role' else key)))
            graph.add((subject, DCTERMS.identifier, Literal(key)))
            graph.add((subject, RDFS.isDefinedBy, URIRef(document)))
            if expected == 'media-status':
                graph.add((subject, SKOS.notation, Literal(key)))
            if expected == 'role':
                graph.add((subject, DCTERMS.isPartOf, URIRef(repo.policy.dataset_version_uri)))
        return _apply_resource_annotations(graph, factory), document, registered.authoritative_profile

    def respond(repo, graph, subject, document, profile, extension, human=None, owner=None, describe=False):
        if not any(graph.triples((URIRef(subject), None, None))):
            raise ResourceError('resource_not_found')
        policy = repo.policy
        profile_uri = policy.profile_uri(profile)
        requested_profile = request.headers.get('Accept-Profile', '').strip(' <>"')
        if requested_profile and requested_profile not in {profile, profile_uri}:
            raise ResourceError('unsupported_linked_data_profile', 406)
        if describe:
            return jsonify(describe_resource(graph, subject, document, profile, policy, owner))
        data_document = document.replace(policy.canonical_id_base, policy.data_base, 1)
        media_types = {'html':'text/html', **{k:v for k,v in FORMAT_MEDIA_TYPES.items() if k != 'xml'}}
        chosen = extension
        if not chosen:
            accept = request.accept_mimetypes
            match = accept.best_match(list(media_types.values())) if request.headers.get('Accept') else 'text/html'
            if not match:
                raise ResourceError('unsupported_linked_data_format', 406)
            chosen = next(key for key, value in media_types.items() if value == match)
        if extension:
            body = representation(graph, extension)
            response = Response(body, content_type=FORMAT_MEDIA_TYPES[extension] + '; charset=utf-8')
            response.headers['Content-Location'] = data_document + '.' + extension
            response.set_etag(hashlib.sha256(body.encode()).hexdigest())
        else:
            human = human or policy.human_base + '/resources?' + urlencode({'uri':subject})
            target = (human + ('&' if '?' in human else '?') + urlencode({'tab':'export','resource':subject})
                      if chosen == 'html' else data_document + '.' + chosen)
            response = Response(status=303)
            response.headers['Location'] = target
        response.headers['Vary'] = 'Accept, Accept-Profile'
        response.headers['Content-Profile'] = f'<{profile_uri}>'
        response.headers['Cache-Control'] = ('public, max-age=300' if '/version/' not in request.path
                                             else 'public, max-age=86400, immutable')
        response.headers.add('Link', f'<{subject}>; rel="canonical"')
        response.headers.add('Link', f'<{profile_uri}>; rel="profile"')
        for ext in ('jsonld','ttl','rdf','nt'):
            response.headers.add('Link', f'<{data_document}.{ext}>; rel="alternate"; type="{FORMAT_MEDIA_TYPES[ext]}"')
        return response.make_conditional(request) if response.status_code == 200 else response

    def resolve(release_version, path, describe=False, fragment=None, expected_owner=None):
        try:
            repo = release_repository(release_version)
            if repo is None:
                raise ResourceError('dataset_release_not_found')
            owner = None
            pieces = path.split('/')
            extension = None
            if '.' in pieces[-1] and pieces[-1].rsplit('.', 1)[1] in FORMAT_MEDIA_TYPES:
                pieces[-1], extension = pieces[-1].rsplit('.', 1)
            policy = repo.policy
            if len(pieces) in {5,8} and pieces[2] == 'profile':
                raise ResourceError('resource_path_invalid', 400)
            if len(pieces) in {4,7} and pieces[2] == 'profile':
                if policy.policy_version != '2':
                    raise ResourceError('resource_policy_unavailable')
                family, token, _, profile = pieces[:4]
                if len(pieces) == 7:
                    if extension:
                        raise ResourceError('resource_path_invalid', 400)
                    marker, resource_family, digest = pieces[4:]
                    registered = require_resource_family(resource_family)
                    if marker != 'resource' or registered.ownership_rule != 'owner':
                        raise ResourceError('resource_family_not_found')
                    if profile != registered.authoritative_profile:
                        raise ResourceError('resource_profile_mismatch')
                    if not re.fullmatch('[0-9a-f]{64}', digest):
                        raise ResourceError('resource_token_invalid', 400)
                graph, document, human, owner = owner_graph(repo, family, token, profile)
                subject = policy.dataset_version_uri + '/' + '/'.join(pieces) if len(pieces) == 7 else document
            elif len(pieces) == 2 and pieces[0] in {'schema','scheme'}:
                if policy.policy_version != '2':
                    raise ResourceError('resource_policy_unavailable')
                graph, document, profile = term_document(repo, *pieces)
                subject, human = document, None
            elif len(pieces) == 3 and pieces[:2] == ['vocab', 'event-type']:
                key = pieces[2]
                value = lookup(repo, 'event-type', key)
                if not value:
                    raise ResourceError('vocabulary_concept_not_found')
                factory = ResourceUriFactory.for_release(policy)
                subject = factory.shared_term_uri('event-type', stable_key=key)
                document = policy.dataset_version_uri + '/vocab/event-type/' + quote(key, safe=':')
                graph = Graph()
                graph.add((URIRef(subject), RDF.type, SKOS.Concept))
                graph.add((URIRef(subject), SKOS.prefLabel, Literal(value.get('preferredLabel') or key)))
                graph.add((URIRef(subject), SKOS.notation, Literal(key)))
                graph.add((URIRef(subject), DCTERMS.identifier, Literal(key)))
                if value.get('definition'):
                    graph.add((URIRef(subject), SKOS.definition, Literal(value['definition'])))
                profile = 'modavis'
                human = policy.human_base + '/vocab/modavis_activity_types/concepts/' + quote(key, safe='')
            elif (len(pieces) == 2 and pieces[0] == 'source-record') or (len(pieces) == 3 and pieces[0] == 'resource'):
                family, token = pieces[-2:]
                registered = require_resource_family(family)
                if registered.ownership_rule != 'release':
                    raise ResourceError('resource_family_not_found')
                key = source_key(token) if policy.policy_version == '2' else token
                graph, subject = shared_graph(repo, family, key)
                expected = policy.dataset_version_uri + '/' + '/'.join(pieces)
                if policy.policy_version == '2' and subject != expected:
                    raise ResourceError('resource_path_not_found')
                document, profile, human = subject, 'modavis', None
            elif len(pieces) == 2 and policy.policy_version == '1':
                family, key = pieces
                require_resource_family(family)
                identifier = lookup(repo, 'legacy:' + family, key)
                if not identifier:
                    raise ResourceError('resource_not_found')
                resolved = repo.resolve_mdvs_id(identifier)
                if not resolved:
                    raise ResourceError('identifier_not_found')
                kind, record = record_from_resolution(repo, resolved)
                if not record:
                    raise ResourceError('entity_not_found')
                profile = 'modavis'
                graph = _graph(kind, record, profile, policy)
                subject = policy.dataset_version_uri + '/' + family + '/' + quote(key, safe='')
                document = subject
                human = policy.human_uri(kind, identifier)
                owner = {'uri':resolved['canonicalUri'], 'identifier':identifier,
                         'label':record.get('title') or identifier, 'url':human, 'kind':kind}
            else:
                raise ResourceError('resource_path_not_found')
            if fragment and subject != document:
                raise ResourceError('resource_not_found')
            if fragment:
                subject = document + '#' + fragment
            if expected_owner and owner and owner['identifier'] != expected_owner:
                raise ResourceError('resource_owner_mismatch')
            return respond(repo, graph, subject, document, profile, extension, human, owner, describe)
        except ResourceError as exc:
            response = jsonify({'error':exc.code})
            response.status_code = exc.status
            response.headers['Cache-Control'] = 'no-store'
            response.headers['Vary'] = 'Accept, Accept-Profile'
            return response
        except UnregisteredResourceFamilyError:
            return jsonify({'error':'resource_family_not_found'}), 404
        except IdentityLedgerError:
            return jsonify({'error':'identifier_ledger_invalid'}), 503

    @app.get('/api/public/resources')
    def resource_description():
        uri = request.args.get('uri', '')
        try:
            parts = urlsplit(uri)
        except ValueError:
            return jsonify({'error':'resource_uri_invalid'}), 400
        # Only local release URIs are interpreted. No caller-controlled URL is fetched.
        match = re.fullmatch(r'(.+)/dataset/pod/version/([^/]+)/(.+)', uri.split('#', 1)[0])
        if not match or parts.query or len(uri) > 8192:
            return jsonify({'error':'resource_uri_invalid'}), 400
        authority, release, path = match.groups()
        repo = release_repository(release)
        if repo is None:
            return jsonify({'error':'dataset_release_not_found'}), 404
        if authority != repo.policy.canonical_id_base:
            return jsonify({'error':'resource_uri_invalid'}), 400
        response = app.make_response(resolve(release, unquote(path), describe=True,
                                            fragment=parts.fragment, expected_owner=request.args.get('owner')))
        response.headers['Cache-Control'] = 'no-store'
        return response

    for prefix in ('/dataset/pod/version', '/resolve/dataset/pod/version'):
        for suffix in ('<owner_family>/<owner_token>/profile/<profile_artifact>',
                       '<owner_family>/<owner_token>/profile/<profile>/resource/<resource_family>/<token>',
                       'source-record/<artifact>', 'resource/<resource_family>/<artifact>',
                       'schema/<artifact>', 'scheme/<artifact>', 'vocab/event-type/<artifact>'):
            def dispatch(release_version, **values):
                path = request.path.split('/version/' + release_version + '/', 1)[1]
                return resolve(release_version, path)
            app.add_url_rule(prefix + '/<release_version>/' + suffix,
                             endpoint='release_resource_' + str(len(app.url_map._rules)),
                             view_func=dispatch, methods=['GET','HEAD'])
    for prefix in ('/dataset', '/resolve/dataset'):
        app.add_url_rule(prefix + '/pod/version/<release_version>/<path:path>',
                         endpoint='release_resource_fallback_' + str(len(app.url_map._rules)),
                         view_func=resolve, methods=['GET','HEAD'])
    def governed(artifact):
        terminology = app.extensions.get('terminology_resolver')
        if terminology and not artifact.startswith('activitype:'):
            return terminology('vocab/event-type/' + artifact)
        return resolve(active_release, 'vocab/event-type/' + artifact)

    for prefix in ('/resolve/vocab/event-type/', '/vocab/event-type/'):
        app.add_url_rule(prefix + '<artifact>', endpoint='governed_resource_' + str(len(app.url_map._rules)),
                         view_func=governed, methods=['GET','HEAD'])
    return resolve
