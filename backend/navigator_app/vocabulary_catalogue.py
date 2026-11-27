"""A read-only catalogue of separately governed vocabularies and source wording.

Candidate entries come from the already verified workbench seed projection.
This reader never adds concepts, mappings, labels or public identifiers.
"""
from copy import deepcopy
import csv
from functools import lru_cache
import hashlib
import io
import json
import sqlite3
from urllib.parse import quote, urlencode

from flask import request

from .public_catalog_context import ACTIVITY_VOCABULARY_SCHEME
from .research_workbench import canonical, norm
from .vocabulary_query import (VocabularyUnavailable, bounded_integer, byte_response,
    query_arguments, require_snapshot, vocabulary_endpoint, workbench_resource)
from .vocabulary_usage import FAMILIES, FAMILY_GROUPS, FAMILY_DESCRIPTIONS, usage_capabilities

CONTRACT = 'modavis.navigator.vocabulary-catalogue/v1'
REGISTRY_CONTRACT = 'modavis.navigator.candidate-terminology-reader/v1'
REGISTRY_PINS = frozenset({'snapshot', 'coreSnapshot', 'indexSnapshot'})
ACTIVITY_LOOKUP_CONTRACT = 'modavis.navigator.activity-lookup/v1'
ACTIVITY_LOOKUP_WORDING_LIMIT = 2000
SCHEME_TITLES = {
    'urn:modavis:terminology-seed:action': 'Action designations',
    'urn:modavis:terminology-seed:windchest': 'Windchest designations',
    'urn:modavis:terminology-seed:stop-designation': 'Stop designations',
    'urn:modavis:terminology-seed:division-designation': 'Division designations',
}
SCOPE = ('Unpublished candidate concepts retained in the Initiator terminology seed. '
    'Accepted exact field-specific lexical mappings support source-designation search; '
    'they do not approve a controlled concept, establish synonymy or physical identity, '
    'or infer source language. Key action, stop action and windchests remain separate fields.')


class VocabularyCatalogue:
    def __init__(self, app, repo):
        self.app, self.repo = app, repo

    def work(self):
        return workbench_resource(self.app)

    @lru_cache(maxsize=1)
    def _activity_wordings(self, core_sha, index_sha):
        with self.work().connect() as connection:
            rows = connection.execute('''SELECT grouped.search, grouped.occurrences,
                (SELECT term.label FROM term_occurrence AS term INDEXED BY term_kind_name
                 WHERE term.kind='activities' AND term.search=grouped.search
                 ORDER BY term.id LIMIT 1) AS label
                FROM (SELECT search, count(*) AS occurrences
                      FROM term_occurrence INDEXED BY term_kind_name
                      WHERE kind='activities' GROUP BY search ORDER BY search LIMIT ?) AS grouped''',
                (ACTIVITY_LOOKUP_WORDING_LIMIT + 1,)).fetchall()
        if len(rows) > ACTIVITY_LOOKUP_WORDING_LIMIT:
            raise OverflowError('The activity wording inventory exceeds the compact lookup limit. Browse recorded wordings for full results.')
        return tuple({
            'key': row['search'], 'label': row['label'], 'occurrences': row['occurrences'],
            'href': '/vocab/usage/activities?' + urlencode({
                'term': row['label'], 'match': 'exact', 'snapshot': core_sha,
            }),
        } for row in rows)

    def activity_lookup(self, values):
        snapshot = self.repo.public_vocabulary_snapshot(ACTIVITY_VOCABULARY_SCHEME)
        if snapshot is None:
            raise LookupError('Activity vocabulary snapshot is unavailable')
        content_sha = snapshot['contentSha256']
        require_snapshot(values, content_sha)
        work = self.work()
        core_sha = work.manifest['core']['sha256']
        index_sha = work.manifest['index']['sha256']
        require_snapshot(values, core_sha, 'coreSnapshot')
        require_snapshot(values, index_sha, 'indexSnapshot')
        declared = work.manifest.get('facets', {}).get('termKinds')
        if declared is not None and 'activities' not in declared:
            raise VocabularyUnavailable('Activity source wordings are unavailable for this snapshot')
        items = []
        for concept in snapshot['concepts']:
            code = concept['code']
            items.append({
                'code': code, 'mdvsId': concept.get('mdvsId'),
                'preferredLabel': concept.get('preferredLabel'), 'definition': concept.get('definition'),
                'labels': [{'label': label['label'], 'languageCode': label.get('languageCode')}
                           for label in concept.get('labels', []) if label.get('label')],
                'href': f'/vocab/{ACTIVITY_VOCABULARY_SCHEME}/concepts/{quote(code, safe="")}?snapshot={content_sha}',
            })
        result = {
            'contract': ACTIVITY_LOOKUP_CONTRACT,
            'contentSha256': content_sha, 'publicCoreSha256': core_sha, 'researchIndexSha256': index_sha,
            'concepts': items, 'wordings': [dict(row) for row in self._activity_wordings(core_sha, index_sha)],
            'eventFacets': [dict(row) for row in self.repo.public_vocabulary_event_facets()],
        }
        overlay = self.app.extensions.get('vocabulary_editions')
        return overlay.lookup(result) if overlay else result

    @lru_cache(maxsize=1)
    def _seed(self, index_sha, seed_sha):
        with self.work().connect() as connection:
            return tuple(json.loads(row[0]) for row in connection.execute('select payload from seed_concept order by id'))

    def registry(self):
        work = self.work()
        seed_sha = work.manifest.get('terminologySeedSha256')
        if not seed_sha:
            raise VocabularyUnavailable('This snapshot does not include a candidate terminology registry')
        seed = self._seed(work.manifest['index']['sha256'], seed_sha)
        schemes = []
        for identifier in sorted({value['scheme'] for value in seed}):
            members = [value for value in seed if value['scheme'] == identifier]
            schemes.append({'id': identifier, 'title': SCHEME_TITLES.get(identifier, identifier),
                'conceptCount': len(members),
                'mappingFamilies': sorted({mapping['family'] for value in members for mapping in value.get('mappings', [])})})
        binding = {'contract': REGISTRY_CONTRACT, 'registrySha256': seed_sha,
            'publicCoreSha256': work.manifest['core']['sha256'],
            'researchIndexSha256': work.manifest['index']['sha256'],
            'status': 'unpublished_candidate', 'formalRelease': False, 'scope': SCOPE,
            'languagePolicy': 'Recorded concept-label language tags are retained. Source language is not inferred.',
            'schemes': schemes,
            'languages': sorted({language for value in seed for language in value.get('label', {})}),
            'registryConceptCount': len(seed)}
        return seed, binding

    def project_candidate(self, value, binding):
        result = deepcopy(value)
        result['href'] = '/vocab/registry?' + urlencode({'concept': value['id'], 'snapshot': binding['registrySha256']})
        result['recordKind'] = 'candidate_concept'
        result['usageLinks'] = [{
            'family': mapping['family'], 'familyTitle': FAMILIES.get(mapping['family'], mapping['family']),
            'status': mapping.get('status'),
            'wordings': [{'label': label, 'href': '/vocab/usage/' + quote(mapping['family'], safe='') + '?' + urlencode({
                'term': label, 'match': 'exact', 'snapshot': binding['publicCoreSha256']})} for label in mapping.get('literals', [])],
            'researchHref': '/use-cases/research-workbench?' + urlencode({
                'view': 'terms', 'mode': mapping['family'], 'concept': value['id'], 'snapshot': binding['publicCoreSha256']}),
        } for mapping in value.get('mappings', [])]
        return result

    @staticmethod
    def require_registry_binding(values, binding):
        require_snapshot(values, binding['registrySha256'])
        for parameter, key, label in (
                ('coreSnapshot', 'publicCoreSha256', 'public-core'),
                ('indexSnapshot', 'researchIndexSha256', 'research-index')):
            if parameter in values and values[parameter] != binding[key]:
                raise RuntimeError(f'Requested candidate terminology {label} snapshot is unavailable')

    def browse(self, values, *, export=False):
        seed, binding = self.registry()
        self.require_registry_binding(values, binding)
        scheme = values.get('scheme')
        if scheme is not None and scheme not in {value['id'] for value in binding['schemes']}:
            raise LookupError('Candidate terminology scheme is unavailable')
        language = values.get('language')
        if language is not None and language not in binding['languages']:
            raise ValueError('Candidate label language is unavailable')
        query = norm(values.get('q', ''))
        selected = [value for value in seed if (not scheme or value['scheme'] == scheme)
            and (not language or language in value.get('label', {}))
            and (not query or query in norm(' '.join([value['id'], value['definition'], *value.get('label', {}).values(),
                *[label for mapping in value.get('mappings', []) for label in mapping.get('literals', [])]])))]
        offset = 0 if export else bounded_integer(values, 'offset', 0, 0, 100000)
        limit = len(selected) if export else bounded_integer(values, 'limit', 30, 1, 100)
        selection = {'scheme': scheme, 'language': language, 'q': query}
        return {**binding, 'items': [self.project_candidate(value, binding) for value in selected[offset:offset+limit]],
            'total': len(selected), 'limit': limit, 'offset': offset, 'hasMore': offset+limit < len(selected),
            'completeSelection': export, 'query': values.get('q', ''), 'selectedScheme': scheme,
            'selectedLanguage': language, 'contentSha256': hashlib.sha256(canonical(selected).encode()).hexdigest(),
            'selectionSha256': hashlib.sha256(canonical({'registrySha256': binding['registrySha256'], 'selection': selection}).encode()).hexdigest()}

    def concept(self, values):
        seed, binding = self.registry()
        self.require_registry_binding(values, binding)
        identifier = values.get('uri')
        if not identifier:
            raise ValueError('An exact candidate concept URI is required')
        value = next((value for value in seed if value['id'] == identifier), None)
        if value is None:
            raise LookupError('Candidate concept is unavailable')
        with self.work().connect() as connection:
            rows = connection.execute('select kind,count(*) occurrences from term_occurrence indexed by term_concept where concept=? group by kind order by kind', (identifier,)).fetchall()
        item = self.project_candidate(value, binding)
        item['usage'] = {'unit': 'source occurrences', 'physicalObjectsCounted': False,
            'scope': 'Indexed exact field-specific candidate mappings; retained source-transfer accounts remain unmapped.',
            'families': [{'family': row[0], 'title': FAMILIES.get(row[0], row[0]), 'occurrences': row[1]} for row in rows]}
        return {**binding, 'concept': item}

    @lru_cache(maxsize=1)
    def _wording_counts(self, index_sha):
        # Both count operands are covered by the frozen kind/search/id index.
        with self.work().connect() as connection:
            rows = connection.execute('select kind,count(*),count(distinct search) from term_occurrence indexed by term_kind_name group by kind order by kind').fetchall()
        return {row[0]: {'occurrences': row[1], 'wordings': row[2]} for row in rows}

    def document(self):
        collections = []
        for scheme in self.repo.public_vocabulary_schemes()['items']:
            category = scheme.get('recordKind') == 'schema_categories'
            collections.append({'id': scheme['code'], 'title': scheme['name'], 'description': scheme.get('description', ''),
                'recordKind': 'schema_categories' if category else 'controlled', 'group': 'schema' if category else 'controlled',
                'href': '/vocab/'+quote(scheme['code'], safe=''), 'searchHref': '/vocab/'+quote(scheme['code'], safe=''),
                'count': scheme.get('categoryCount', 0) if category else scheme['conceptCount'],
                'countUnit': 'schema categories' if category else 'controlled concepts', 'availability': 'available',
                'version': scheme.get('version'), 'snapshot': scheme.get('snapshot')})
        registry_state = 'unavailable'
        try:
            _, binding = self.registry()
            registry_state = 'available'
            for scheme in binding['schemes']:
                collections.append({'id': scheme['id'], 'title': scheme['title'], 'description': SCOPE,
                    'recordKind': 'candidate', 'group': 'candidates',
                    'href': '/vocab/registry?'+urlencode({'scheme': scheme['id'], 'snapshot': binding['registrySha256']}),
                    'searchHref': '/vocab/registry?'+urlencode({'scheme': scheme['id'], 'snapshot': binding['registrySha256']}),
                    'count': scheme['conceptCount'], 'countUnit': 'candidate concepts', 'mappingFamilies': scheme['mappingFamilies'],
                    'availability': 'available', 'snapshot': binding['registrySha256'], 'formalRelease': False})
        except (VocabularyUnavailable, sqlite3.OperationalError, TimeoutError):
            pass
        wording_state = 'unavailable'
        try:
            work = self.work()
            counts = self._wording_counts(work.manifest['index']['sha256'])
            wording_state = 'available'
            for family in sorted(counts, key=lambda key: (FAMILY_GROUPS.get(key, 'source_context'), FAMILIES.get(key, key))):
                if family not in FAMILIES:
                    continue
                collections.append({'id': 'wording:'+family, 'family': family, 'title': FAMILIES[family],
                    'description': FAMILY_DESCRIPTIONS[FAMILY_GROUPS[family]], 'recordKind': 'source_wording', 'group': FAMILY_GROUPS[family],
                    'href': '/vocab/usage/'+family+'?'+urlencode({'snapshot': work.manifest['core']['sha256']}),
                    'searchHref': '/vocab/usage/'+family+'?'+urlencode({'snapshot': work.manifest['core']['sha256']}),
                    'count': counts[family]['wordings'], 'countUnit': 'case/spacing-normalized source wordings',
                    'occurrenceCount': counts[family]['occurrences'], 'occurrenceCountUnit': 'source occurrences',
                    'availability': 'available', 'snapshot': work.manifest['core']['sha256'],
                    'capabilities': usage_capabilities(self.app, family)})
        except (VocabularyUnavailable, sqlite3.OperationalError, TimeoutError):
            pass
        references = self.app.extensions.get('vocabulary_references')
        if references:
            collections.extend({**item, 'group': 'references'} for item in references.metadata()['collections'])
        omaro = self.app.extensions.get('omaro_reference')
        health = self.app.extensions.get('capability_health')
        omaro_available = bool(omaro) and (not health or health.resource_state('vocabularyReference')['available'])
        for identifier, title, route, count_key, unit in [
            ('omaro-instruments', 'OMARO instrument names', '/vocab/omaro', 'instruments', 'instrument concepts'),
            ('omaro-classifications', 'Hornbostel–Sachs classifications', '/vocab/omaro?collection=hs', 'classifications', 'classification concepts'),
            ('omaro-ontology', 'OMARO assertion ontology', '/vocab/omaro?collection=ontology', None, 'ontology terms')]:
            collections.append({'id': identifier, 'title': title, 'description': 'A separately versioned reference. No classification of a POD organ is inferred.',
                'recordKind': 'external_reference', 'group': 'references', 'href': route, 'searchHref': route,
                'count': (omaro.meta.get('counts', {}).get(count_key) if count_key else omaro.meta.get('ontologyTerms')) if omaro_available else None,
                'countUnit': unit, 'availability': 'available' if omaro_available else 'unavailable'})
        kinds = sorted({item['recordKind'] for item in collections})
        totals = {kind: {'collections': sum(item['recordKind'] == kind for item in collections)} for kind in kinds}
        for kind in ['controlled', 'candidate', 'schema_categories', 'source_wording', 'published_reference']:
            members = [item for item in collections if item['recordKind'] == kind]
            if members and all(isinstance(item.get('count'), int) for item in members):
                totals[kind]['count'] = sum(item['count'] for item in members)
                totals[kind]['countUnit'] = members[0]['countUnit']
        return {'contract': CONTRACT, 'collections': collections, 'countsByKind': totals,
            'availability': {'candidateRegistry': registry_state, 'sourceWording': wording_state},
            'countScope': 'Totals remain separate by record kind. Wording totals count each field separately; they are not unique concepts or physical objects.',
            'disclosure': 'Only the verified public read models are searched. Generated and withheld labels remain excluded.'}


def registry_serialization(value, format):
    if format == 'json':
        return json.dumps(value, ensure_ascii=False, sort_keys=True, indent=2)+'\n', 'application/json'
    if format == 'csv':
        output = io.StringIO(newline='')
        writer = csv.writer(output, lineterminator='\n')
        writer.writerow(['concept_uri', 'scheme_uri', 'language', 'label', 'definition', 'lifecycle', 'mapping_purpose', 'canonical_promotion', 'mapping_rules_json', 'evidence_json', 'registry_sha256'])
        for item in value['items']:
            for language, label in sorted(item.get('label', {}).items()):
                writer.writerow([item['id'], item['scheme'], language, label, item.get('definition'), item.get('lifecycle'),
                    item.get('mappingPurpose'), item.get('canonicalPromotion'), canonical(item.get('mappings', [])), canonical(item.get('evidence', [])), value['registrySha256']])
        return output.getvalue(), 'text/csv; charset=utf-8'
    from rdflib import Graph, URIRef, Literal, RDF
    from rdflib.namespace import SKOS, DCTERMS
    graph = Graph()
    for item in value['items']:
        concept, scheme = URIRef(item['id']), URIRef(item['scheme'])
        graph.add((scheme, RDF.type, SKOS.ConceptScheme))
        graph.add((concept, RDF.type, SKOS.Concept))
        graph.add((concept, SKOS.inScheme, scheme))
        # Each retained language map has one value per language; no source
        # wording or label-type code is promoted to a preferred translation.
        for language, label in item.get('label', {}).items():
            graph.add((concept, SKOS.prefLabel, Literal(label, lang=language or None)))
        graph.add((concept, SKOS.definition, Literal(item.get('definition', ''), lang='en')))
        graph.add((concept, SKOS.scopeNote, Literal(SCOPE)))
        for source in item.get('evidence', []):
            graph.add((concept, DCTERMS.source, URIRef(source)))
        graph.add((concept, DCTERMS.source, Literal(canonical({key: item.get(key) for key in ['lifecycle', 'mappingPurpose', 'canonicalPromotion', 'mappings', 'evidence']}))))
        graph.add((scheme, DCTERMS.identifier, Literal(value['registrySha256'])))
    if format in {'ttl', 'skos'}:
        return '\n'.join(sorted(graph.serialize(format='nt').splitlines()))+'\n', 'text/turtle; charset=utf-8'
    if format == 'jsonld':
        def ordered(item):
            if isinstance(item, list):
                return sorted((ordered(child) for child in item), key=lambda child: json.dumps(child, sort_keys=True))
            if isinstance(item, dict):
                return {key: ordered(child) for key, child in sorted(item.items())}
            return item
        return json.dumps(ordered(json.loads(graph.serialize(format='json-ld'))), ensure_ascii=False, sort_keys=True, indent=2)+'\n', 'application/ld+json'
    raise ValueError('Unsupported candidate vocabulary format')


def register_vocabulary_catalogue(app, repo):
    catalogue = VocabularyCatalogue(app, repo)
    app.extensions['vocabulary_catalogue'] = catalogue

    @app.get('/api/vocab/catalogue')
    @vocabulary_endpoint
    def vocabulary_catalogue():
        query_arguments(request.args, set())
        return byte_response(canonical(catalogue.document())+'\n', 'application/json')

    @app.get('/api/vocab/activity-lookup')
    @vocabulary_endpoint
    def vocabulary_activity_lookup():
        values = query_arguments(request.args, REGISTRY_PINS, pins=REGISTRY_PINS)
        result = catalogue.activity_lookup(values)
        return byte_response(canonical(result)+'\n', 'application/json', content_sha256=result['contentSha256'])

    @app.get('/api/vocab/registry')
    @vocabulary_endpoint
    def vocabulary_registry():
        values = query_arguments(request.args, {'scheme','q','language','offset','limit'} | REGISTRY_PINS, pins=REGISTRY_PINS)
        return byte_response(canonical(catalogue.browse(values))+'\n', 'application/json')

    @app.get('/api/vocab/registry/concept')
    @vocabulary_endpoint
    def vocabulary_registry_concept():
        values = query_arguments(request.args, {'uri'} | REGISTRY_PINS, pins={'uri'} | REGISTRY_PINS)
        return byte_response(canonical(catalogue.concept(values))+'\n', 'application/json')

    @app.get('/api/vocab/registry/export')
    @vocabulary_endpoint
    def vocabulary_registry_export():
        values = query_arguments(request.args, {'scheme','q','language','format'} | REGISTRY_PINS, pins=REGISTRY_PINS)
        format = values.get('format', 'json')
        if format not in {'json','csv','jsonld','ttl','skos'}:
            raise ValueError('Unsupported candidate vocabulary format')
        result = catalogue.browse(values, export=True)
        body, media = registry_serialization(result, format)
        return byte_response(body, media, filename='modavis-candidate-terminology.'+format, content_sha256=result['contentSha256'])
    return catalogue
