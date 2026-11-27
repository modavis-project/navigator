"""Versioned terminology editions and their bridges to the frozen POD reader."""
from collections import defaultdict
import csv
from functools import lru_cache
import hashlib
import io
import json
from pathlib import Path
from urllib.parse import quote

from flask import request

from .research_workbench import norm
from .vocabulary_query import bounded_integer, byte_response, query_arguments, require_snapshot, vocabulary_endpoint

DATA = Path(__file__).with_name('terminology_data')
EDITIONS = {
    'modavis': 'modavis_vocabulary.json',
    'musixplora': 'musixplora_vocabulary.json',
    'organ-specifications': 'organ_specifications.json',
}
TITLES = {
    'modavis': {'en': 'MODAVIS vocabularies', 'de': 'MODAVIS-Vokabulare'},
    'musixplora': {'en': 'musiXplora vocabularies', 'de': 'musiXplora-Vokabulare'},
    'organ-specifications': {'en': 'Pipe-organ specification vocabulary', 'de': 'Vokabular zur technischen Beschreibung von Pfeifenorgeln'},
}
# Editorial translations of recorded wording. These are separate from concept
# identifiers, source language metadata and processing mappings.
ACTIVITY_GLOSSES = json.loads((DATA / 'activity_wording_glosses.json').read_bytes())


def vocabulary_term_href(scheme, concept):
    """A short browser route for a registered term, with its stable key."""
    return '/vocab/' + '/'.join(quote(value, safe='') for value in (scheme, concept))


@lru_cache(maxsize=1)
def participation_roles():
    return json.loads((DATA / 'participation_roles.json').read_bytes())


@lru_cache(maxsize=8)
def edition_bytes(edition, version=None):
    name = EDITIONS.get(edition)
    if name is None:
        raise LookupError('Vocabulary edition not found')
    data = (DATA / name).read_bytes()
    value = json.loads(data)
    if edition == 'modavis' and version != value['version']:
        roles = participation_roles()
        terms = roles['concepts']
        scheme = next(scheme for scheme in value['schemes'] if scheme['id'] == 'person-terms')
        by_code = {item['code']: item for item in scheme['concepts']}
        for term in terms:
            by_code[term['code']] = {**by_code.get(term['code'], {}), **term}
        scheme['concepts'] = list(by_code.values())
        value['version'] = '1.1.0'
        value['links'] = roles.get('links', [])
        value['history'].append({
            'version': value['version'],
            'changes': {
                'en': 'Added source-qualified organ-history participation roles.',
                'de': 'Rollen bei Ereignissen der Orgelgeschichte mit Quellenbezug ergänzt.',
            },
        })
        data = (json.dumps(value, ensure_ascii=False, indent=2) + '\n').encode('utf-8')
    if version is not None and value['version'] != version:
        raise LookupError('Vocabulary edition version not found')
    return data


@lru_cache(maxsize=12)
def load_edition(edition, version=None):
    data = edition_bytes(edition, version)
    return json.loads(data), hashlib.sha256(data).hexdigest()


def resolve_edition(edition, args):
    version = args.get('version')
    data, checksum = load_edition(edition, version)
    if edition == 'modavis' and version is None and 'snapshot' in args and args['snapshot'] != checksum:
        archived, archived_checksum = load_edition(edition, '1.0.0')
        if args['snapshot'] == archived_checksum:
            return archived, archived_checksum
    require_snapshot(args, checksum)
    return data, checksum


class VocabularyEditions:
    def __init__(self, repo):
        self.repo = repo

    @property
    def policy(self):
        return self.repo.policy

    @lru_cache(maxsize=1)
    def crosswalk(self):
        mxp, _ = load_edition('musixplora')
        records = {(scheme['id'], term['id']): (scheme, term)
                   for scheme in mxp['schemes'] for term in scheme['concepts']}
        pod, _ = load_edition('modavis')
        modavis = {(scheme['code'], term['code']): (scheme, term)
                   for scheme in pod['schemes'] for term in scheme['concepts']}
        from_pod, from_mxp = defaultdict(list), defaultdict(list)
        for link in [*mxp.get('links', []), *participation_roles().get('links', [])]:
            local = (link['scheme'], link['concept'])
            other = (link['targetScheme'], link['targetCode'])
            if local not in records or other not in modavis:
                raise ValueError('Vocabulary cross-reference has an unknown term')
            mxp_scheme, mxp_term = records[local]
            pod_scheme, pod_term = modavis[other]
            metadata = {key: link[key] for key in ('relation', 'note', 'basis', 'evidenceUrl') if key in link}
            from_pod[other].append(dict(metadata, labels=mxp_term['labels'], schemeTitle=mxp_scheme['title'],
                vocabulary='musiXplora', href=self.musix_href(*local)))
            from_mxp[local].append(dict(metadata, labels=pod_term['labels'], schemeTitle=pod_scheme['title'],
                vocabulary='MODAVIS', href=self.term_href('modavis', pod_scheme, pod_term)))
        return modavis, from_pod, from_mxp

    @staticmethod
    def musix_href(scheme, term=None):
        return '/vocab/musixplora/' + '/'.join(quote(value, safe='') for value in (scheme, term) if value is not None)

    @staticmethod
    def edition_href(edition, scheme=None, term=None):
        base = '/vocab/editions/modavis' if edition == 'modavis' else '/vocab/' + edition
        parts = [quote(item, safe='') for item in (scheme, term) if item is not None]
        return base + ('/' + '/'.join(parts) if parts else '')

    def term_href(self, edition, scheme, term):
        if edition == 'modavis' and term.get('mdvsId'):
            return vocabulary_term_href(scheme['id'], term['id'])
        return self.edition_href(edition, scheme['id'], term['id'])

    def uri(self, edition, scheme, term=None):
        if term is not None and scheme['id'] == 'activity-types':
            return self.policy.canonical_id_base + '/vocab/event-type/' + quote(term['code'], safe=':')
        if edition == 'modavis' and (term is None or term.get('mdvsId')):
            href = '/vocab/' + quote(scheme['id'], safe='')
            if term is not None:
                href = vocabulary_term_href(scheme['id'], term['id'])
        else:
            href = self.edition_href(edition, scheme['id'], term['id'] if term else None)
        return self.policy.human_base + href

    def project(self, item):
        scheme = (item.get('scheme') or {}).get('code')
        registered, match, _ = self.crosswalk()
        key = (scheme, item.get('code'))
        pair = registered.get(key)
        if not pair or item.get('mdvsId') != pair[1].get('mdvsId'):
            return item
        definition = pair[1]
        return {**item, 'editionLabels': definition['labels'], 'editionDefinitions': definition['definition'],
            'readerHref': vocabulary_term_href(pair[0]['id'], definition['id']),
            'termUri': self.uri('modavis', *pair), 'otherVocabularies': match.get(key, []),
            'editionVersion': load_edition('modavis')[0]['version'],
            **({'editionScopeNotes': definition['scopeNote']} if definition.get('scopeNote') else {})}

    def lookup(self, value):
        registered, _, _ = self.crosswalk()
        for term in value['concepts']:
            pair = registered.get(('modavis_activity_types', term['code']))
            if pair and term.get('mdvsId') == pair[1]['mdvsId']:
                known = {label.get('languageCode') for label in term.get('labels', [])}
                term['labels'] = [*term.get('labels', []), *[
                    {'languageCode': language, 'label': label, 'basis': 'edition'}
                    for language, label in pair[1]['labels'].items() if language not in known]]
                term['definitionDe'] = pair[1]['definition']['de']
                # Keep the lookup's exact snapshot parameter on its citation link.
        for wording in value['wordings']:
            if gloss := ACTIVITY_GLOSSES.get(wording['key']):
                wording['englishGloss'] = gloss
        return value

    @lru_cache(maxsize=1)
    def specification_wordings(self):
        data, _ = load_edition('organ-specifications')
        links = defaultdict(list)
        for scheme in data['schemes']:
            for term in scheme['concepts']:
                reference = {'labels': term['labels'], 'href': self.edition_href('organ-specifications', scheme['id'], term['id'])}
                for row in term.get('evidence', []):
                    key = row['family'], norm(row['wording'])
                    if reference not in links[key]:
                        links[key].append(reference)
        return links

    def specification_terms_for_wording(self, family, wording):
        return self.specification_wordings().get((family, norm(wording)), [])

    def metadata(self, edition, args=None):
        value, checksum = resolve_edition(edition, args or {})
        version = value['version']
        downloads = ('json', 'csv', 'ttl', 'jsonld')
        return {key: item for key, item in value.items() if key not in {'schemes', 'links'}} | {
            'id': edition, 'title': value.get('title') or TITLES[edition], 'contentSha256': checksum,
            'schemes': [{key: item for key, item in scheme.items() if key != 'concepts'} | {
                'count': len(scheme['concepts']),
                'href': self.edition_href(edition, scheme['id']),
            } for scheme in value['schemes']],
            'formats': [{'format': ext, 'href': f'/api/vocab/editions/{edition}/{version}/{ext}?snapshot={checksum}'}
                        for ext in downloads],
        }

    def rows(self, edition, args, scheme_id=None, term_id=None):
        data, checksum = resolve_edition(edition, args)
        language = args.get('language', 'en')
        if language not in {'en', 'de'}:
            raise ValueError('Choose English or German')
        metadata = self.metadata(edition, {'snapshot': checksum})
        schemes = [scheme for scheme in data['schemes'] if scheme_id is None or scheme_id == scheme['id']]
        if not schemes:
            raise LookupError('Vocabulary scheme not found')
        if term_id is not None:
            scheme = schemes[0]
            term = next((item for item in scheme['concepts'] if item['id'] == term_id), None)
            if term is None:
                raise LookupError('Vocabulary term not found')
            links = []
            if edition == 'modavis':
                links = self.crosswalk()[1].get((scheme['code'], term['code']), [])
            elif edition == 'musixplora':
                links = self.crosswalk()[2].get((scheme_id, term_id), [])
            related_ids = term.get('related', [])
            related = [{'labels': item['labels'], 'href': self.edition_href(edition, scheme_id, item['id'])}
                       for item in scheme['concepts'] if item['id'] in related_ids]
            return {'edition': metadata, 'scheme': next(s for s in metadata['schemes'] if s['id'] == scheme_id),
                    'term': dict(term, otherVocabularies=links, relatedTerms=related)}
        offset = bounded_integer(args, 'offset', 0, 0, 100000)
        limit = bounded_integer(args, 'limit', 30, 1, 100)
        search = norm(args.get('q', ''))
        matches = []
        for scheme in schemes:
            for term in scheme['concepts']:
                labels = [*term['labels'].values(), term['code'],
                          *(label for aliases in term.get('aliases', {}).values() for label in aliases),
                          *(label for form in term.get('forms', []) for label in form['labels'].values())]
                fields = [norm(label) for label in labels]
                if search and not any(search in field for field in fields):
                    continue
                rank = 0 if search in fields else 1 if any(field.startswith(search) for field in fields) else 2
                matches.append((rank, norm(term['labels'].get(language) or term['labels'].get('de') or term['code']),
                    scheme['id'], term['id'], {'id': term['id'], 'code': term['code'], 'labels': term['labels'],
                    'schemeTitle': scheme['title'], 'href': self.edition_href(edition, scheme['id'], term['id'])}))
        matches.sort(key=lambda entry: entry[:4])
        return {'edition': metadata, 'total': len(matches), 'offset': offset, 'limit': limit,
                'items': [item[-1] for item in matches[offset:offset + limit]]}

    @lru_cache(maxsize=8)
    def export(self, edition, version, format):
        data, _ = load_edition(edition, version)
        def resource_uri(scheme, term=None):
            item = term or scheme
            return item['sourceUri'] if edition == 'musixplora' else self.uri(edition, scheme, term)
        if format == 'json':
            return edition_bytes(edition, version), 'application/json'
        if format == 'csv':
            body = io.StringIO(newline='')
            writer = csv.writer(body, lineterminator='\n')
            writer.writerow(['scheme_uri', 'concept_uri', 'concept_code', 'mdvs_id', 'language', 'label', 'definition', 'translation_status'])
            for scheme in data['schemes']:
                for term in scheme['concepts']:
                    for language, label in term['labels'].items():
                        writer.writerow([resource_uri(scheme), resource_uri(scheme, term), term['code'], term.get('mdvsId'),
                                         language, label, (term.get('definition') or {}).get(language),
                                         term.get('translationStatus')])
            return body.getvalue(), 'text/csv; charset=utf-8'
        from rdflib import Graph, Literal, RDF, URIRef
        from rdflib.namespace import DCTERMS, SKOS
        graph = Graph()
        for scheme in data['schemes']:
            scheme_uri = URIRef(resource_uri(scheme))
            graph.add((scheme_uri, RDF.type, SKOS.ConceptScheme))
            for predicate, value in ((DCTERMS.hasVersion, Literal(data['version'])),
                                      (DCTERMS.source, URIRef(data['sourceUrl'])),
                                      (DCTERMS.bibliographicCitation, Literal(data['attribution']))):
                graph.add((scheme_uri, predicate, value))
            if data.get('licenseUrl'):
                graph.add((scheme_uri, DCTERMS.license, URIRef(data['licenseUrl'])))
            for language, rights in data.get('rights', {}).items():
                graph.add((scheme_uri, DCTERMS.rights, Literal(rights, lang=language)))
            for language, label in scheme['title'].items():
                graph.add((scheme_uri, SKOS.prefLabel, Literal(label, lang=language)))
            terms_by_id = {term['id']: term for term in scheme['concepts']}
            for term in scheme['concepts']:
                node = URIRef(resource_uri(scheme, term))
                graph.add((node, RDF.type, SKOS.Concept))
                graph.add((node, SKOS.inScheme, scheme_uri))
                graph.add((node, SKOS.notation, Literal(term['code'])))
                if term.get('mdvsId'):
                    graph.add((node, DCTERMS.identifier, Literal(term['mdvsId'])))
                for related in term.get('related', []):
                    graph.add((node, SKOS.related, URIRef(resource_uri(scheme, terms_by_id[related]))))
                for item in [*term.get('evidence', []), *term.get('references', [])]:
                    link = item.get('href') or item.get('url')
                    if link:
                        link = self.policy.human_base + link if link.startswith('/') else link
                        graph.add((node, DCTERMS.source, URIRef(link)))
                for language, label in term['labels'].items():
                    graph.add((node, SKOS.prefLabel, Literal(label, lang=language)))
                for language, definition in (term.get('definition') or {}).items():
                    graph.add((node, SKOS.definition, Literal(definition, lang=language)))
                for language, note in (term.get('scopeNote') or {}).items():
                    graph.add((node, SKOS.scopeNote, Literal(note, lang=language)))
                # Source forms are kept individually in JSON. Here, expose only
                # alternate labels that differ from the preferred label in that language.
                for language, labels in term.get('aliases', {}).items():
                    for label in labels:
                        if label != term['labels'].get(language):
                            graph.add((node, SKOS.altLabel, Literal(label, lang=language)))
        if format == 'ttl':
            return '\n'.join(sorted(graph.serialize(format='nt').splitlines())) + '\n', 'text/turtle; charset=utf-8'
        values = json.loads(graph.serialize(format='json-ld'))
        for node in values:
            for key, entries in node.items():
                if isinstance(entries, list):
                    node[key] = sorted(entries, key=lambda entry: json.dumps(entry, sort_keys=True))
        return json.dumps(sorted(values, key=lambda node: node['@id']), ensure_ascii=False, sort_keys=True, indent=2) + '\n', 'application/ld+json'


def register_vocabulary_editions(app, repo):
    provider = VocabularyEditions(repo)
    app.extensions['vocabulary_editions'] = provider

    @app.get('/api/vocab/editions/<edition>')
    @vocabulary_endpoint
    def vocabulary_edition(edition):
        values = query_arguments(request.args, {'snapshot', 'version'}, pins={'snapshot', 'version'})
        metadata = provider.metadata(edition, values)
        return byte_response(json.dumps(metadata, ensure_ascii=False, sort_keys=True), 'application/json')

    @app.get('/api/vocab/editions/<edition>/<version>/<format>')
    @vocabulary_endpoint
    def vocabulary_edition_download(edition, version, format):
        values = query_arguments(request.args, {'snapshot'}, pins={'snapshot'})
        metadata = provider.metadata(edition, {**values, 'version': version})
        if format not in {item['format'] for item in metadata['formats']}:
            raise LookupError('Vocabulary edition distribution not found')
        body, media = provider.export(edition, version, format)
        result = byte_response(body, media, filename=f'{edition}-vocabularies-{version}.{format}',
                               content_sha256=metadata['contentSha256'])
        result.headers['Cache-Control'] = 'public, max-age=86400, immutable'
        return result

    @app.get('/api/vocab/musixplora', defaults={'scheme_id': None, 'term_id': None})
    @app.get('/api/vocab/musixplora/<scheme_id>', defaults={'term_id': None})
    @app.get('/api/vocab/musixplora/<scheme_id>/<term_id>')
    @vocabulary_endpoint
    def musixplora_vocabulary(scheme_id, term_id):
        keys = {'snapshot', 'language'} if term_id else {'snapshot', 'language', 'q', 'offset', 'limit'}
        values = query_arguments(request.args, keys, pins={'snapshot'})
        result = provider.rows('musixplora', values, scheme_id, term_id)
        return byte_response(json.dumps(result, ensure_ascii=False, sort_keys=True), 'application/json')

    @app.get('/api/vocab/edition-terms/<edition>', defaults={'scheme_id': None, 'term_id': None})
    @app.get('/api/vocab/edition-terms/<edition>/<scheme_id>', defaults={'term_id': None})
    @app.get('/api/vocab/edition-terms/<edition>/<scheme_id>/<term_id>')
    @vocabulary_endpoint
    def vocabulary_edition_terms(edition, scheme_id, term_id):
        keys = {'snapshot', 'language'} if term_id else {'snapshot', 'language', 'q', 'offset', 'limit'}
        values = query_arguments(request.args, keys, pins={'snapshot'})
        result = provider.rows(edition, values, scheme_id, term_id)
        return byte_response(json.dumps(result, ensure_ascii=False, sort_keys=True), 'application/json')
