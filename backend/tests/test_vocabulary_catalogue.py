"""Independent tiny public registry fixtures: no external database or seed edits."""
import ast
from contextlib import contextmanager
import hashlib
import io
import json
from pathlib import Path
import sqlite3
from types import SimpleNamespace
from urllib.parse import urlencode
from zipfile import ZipFile

from flask import Flask, jsonify, request
import pytest
from rdflib import Graph, URIRef
from rdflib.namespace import SKOS, RDFS

from navigator_app.public_catalog_context import PublicCatalogContext
from navigator_app.public_vocabulary import snapshot, serialize
from navigator_app.research_package import register_research_packages
from navigator_app.vocabulary_catalogue import register_vocabulary_catalogue
from navigator_app.vocabulary_query import (bounded_integer, byte_response,
    query_arguments, require_snapshot, vocabulary_endpoint)
from navigator_app.vocabulary_usage import register_vocabulary_usage

CORE, INDEX, SEED = 'a'*64, 'b'*64, 'c'*64
ACTION = 'urn:modavis:terminology-seed:action'
CONCEPT = 'urn:modavis:terminology-seed:action-mechanical'
WINDCHEST = 'urn:modavis:terminology-seed:windchest'
SEED_ITEMS = [
    {'id': CONCEPT, 'scheme': ACTION, 'label': {'en': 'Mechanical action', 'fr': 'Action mécanique'},
     'definition': 'Transmission through linkages; key and stop action remain separate.', 'lifecycle': 'candidate',
     'mappingPurpose': 'source_designation_search', 'canonicalPromotion': False,
     'mappings': [{'family': 'key_action', 'literals': ['Mechanical', 'Mécanique'], 'status': 'accepted_lexical_mapping'},
                  {'family': 'stop_action', 'literals': ['Mechanical'], 'status': 'accepted_lexical_mapping'}],
     'evidence': ['https://example.org/technical-glossary']},
    {'id': 'urn:modavis:terminology-seed:windchest-slider', 'scheme': WINDCHEST, 'label': {'en': 'Slider chest'},
     'definition': 'A source chest designation; no action type is implied.', 'lifecycle': 'candidate',
     'mappingPurpose': 'source_designation_search', 'canonicalPromotion': False,
     'mappings': [{'family': 'windchests', 'literals': ['Slider %_'], 'status': 'accepted_lexical_mapping'}], 'evidence': []},
]


class Repository(PublicCatalogContext):
    policy = SimpleNamespace(release_version='fixture', canonical_id_base='https://example.org/modavis')

    def _public_vocabulary(self):
        return [{'code': 'repair', 'mdvsId': 'MDVS:TEST:REPAIR', 'preferredLabel': 'Repair',
                 'definition': 'A retained test activity.', 'recordKind': 'governed_concept',
                 'scheme': {'code': 'modavis_activity_types', 'name': 'Activities', 'version': 'fixture'},
                 'labels': [{'label': 'Repair', 'languageCode': 'en', 'languageName': 'English', 'labelTypeId': 4},
                            {'label': 'Reparatur', 'languageCode': 'de', 'languageName': 'German', 'labelTypeId': 4},
                            {'label': 'Another full name', 'languageCode': 'en', 'labelTypeId': 4}],
                 'sourceTermMappings': [], 'sourceMappingCount': 0}]

    def public_vocabulary_event_usage(self, code):
        return {'scope': 'Current public event assertions', 'occurrenceCount': 0, 'groups': []}


@pytest.fixture
def application():
    connection = sqlite3.connect(':memory:')
    connection.row_factory = sqlite3.Row
    connection.executescript('''
        attach ':memory:' as core; attach ':memory:' as research;
        create table seed_concept(id text primary key,payload text);
        create table term_occurrence(id text,kind text,organ text,source text,source_key text,description text,label text,search text,pitch text,division text,country text,year int,date_kind text,concept text,source_path text);
        create index term_kind_name on term_occurrence(kind,search,id);
        create index term_concept on term_occurrence(concept,kind);
        create table core.vocabulary_concept(concept_code text,mdvs_id text,payload_json text,scheme_code text);
        create table core.source_membership(source_record_id text,source_url text,source_revision_sha256 text,native_identifier text);
        create table research.organ(id text,label text);
        insert into research.organ values('MDVS:ENTY:EXAMPLE','Example organ');
        insert into core.source_membership values('sr:one','https://example.org/source','exact-source-revision','native-1');
    ''')
    for item in SEED_ITEMS:
        connection.execute('insert into seed_concept values(?,?)', (item['id'], json.dumps(item)))
    for index, family in enumerate(['key_action', 'key_action', 'stop_action', 'windchests']):
        label = 'Mechanical' if family != 'windchests' else 'Slider %_'
        concept = CONCEPT if family != 'windchests' else SEED_ITEMS[1]['id']
        connection.execute('insert into term_occurrence values(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
            (str(index), family, 'MDVS:ENTY:EXAMPLE', 'sr:one', 'fixture', None, label,
             label.casefold(), None, None, 'XX', None, 'source_listing', concept, 'technical.'+family))
    @contextmanager
    def connect(*args, **kwargs):
        yield connection
    work = SimpleNamespace(connect=connect, assert_binding=lambda: None,
        manifest={'core': {'sha256': CORE}, 'index': {'sha256': INDEX}, 'terminologySeedSha256': SEED})
    app = Flask(__name__)
    app.extensions['research_workbench'] = work
    app.extensions['research_exploration'] = object()
    app.config['RESEARCH_PACKAGE_LICENSE'] = 'CC-BY-4.0'
    register_research_packages(app)
    register_vocabulary_usage(app)
    register_vocabulary_catalogue(app, Repository())
    yield app
    connection.close()


def test_catalogue_keeps_record_kinds_units_and_action_fields_separate(application):
    result = application.test_client().get('/api/vocab/catalogue').json
    assert 'total' not in result and 'terms' not in result['countsByKind']
    assert result['countsByKind']['controlled']['count'] == 1
    assert result['countsByKind']['candidate']['count'] == 2
    assert result['countsByKind']['schema_categories']['count'] == 2
    wordings = {item['family']: item for item in result['collections'] if item['recordKind'] == 'source_wording'}
    assert wordings['key_action']['count'] == wordings['stop_action']['count'] == 1
    assert wordings['key_action']['occurrenceCount'] == 2 and wordings['stop_action']['occurrenceCount'] == 1
    assert all(item['group'] == 'actions_and_wind' and item['capabilities']['distributions'] is False for item in wordings.values())
    assert all('physical' not in item['countUnit'] for item in wordings.values())


def test_activity_lookup_binds_all_inputs_and_preserves_exact_source_wording(application, monkeypatch):
    catalogue = application.extensions['vocabulary_catalogue']
    monkeypatch.setattr(catalogue.repo, 'public_vocabulary_event_facets', lambda: [
        {'code': 'repair', 'conceptCode': 'repair'},
        {'code': 'Ablehnung', 'sourceWording': 'Ablehnung'},
        {'code': 'contextual_statement'},
    ])
    with catalogue.work().connect() as connection:
        connection.executemany('''insert into term_occurrence(id,kind,label,search)
            values(?, 'activities', ?, ?)''', [
            ('b', 'ablehnung', 'ablehnung'), ('a', 'Ablehnung', 'ablehnung'),
            ('c', 'Réglage', 'réglage'),
        ])
    client = application.test_client()
    scheme = catalogue.repo.public_vocabulary_snapshot('modavis_activity_types')
    url = '/api/vocab/activity-lookup?' + urlencode({
        'snapshot': scheme['contentSha256'], 'coreSnapshot': CORE, 'indexSnapshot': INDEX,
    })
    response = client.get(url)
    assert response.status_code == 200
    result = response.json
    assert result['contentSha256'] == scheme['contentSha256']
    assert (result['publicCoreSha256'], result['researchIndexSha256']) == (CORE, INDEX)
    assert result['concepts'][0]['labels'][1] == {'label': 'Reparatur', 'languageCode': 'de'}
    assert result['wordings'][0] == {
        'key': 'ablehnung', 'label': 'Ablehnung', 'occurrences': 2,
        'href': '/vocab/usage/activities?term=Ablehnung&match=exact&snapshot=' + CORE,
    }
    assert result['wordings'][1]['label'] == 'Réglage'
    assert result['eventFacets'][2] == {'code': 'contextual_statement'}
    assert client.get(url, headers={'If-None-Match': response.headers['ETag']}).status_code == 304
    for name in ('snapshot', 'coreSnapshot', 'indexSnapshot'):
        assert client.get('/api/vocab/activity-lookup?' + name + '=').status_code == 400
        assert client.get('/api/vocab/activity-lookup?' + name + '=unavailable').status_code == 409


def test_registry_search_pages_and_language_preserve_original_candidate_payload(application):
    client = application.test_client()
    first = client.get('/api/vocab/registry?limit=1').json
    second = client.get('/api/vocab/registry?limit=1&offset=1').json
    assert first['total'] == second['total'] == 2 and first['hasMore'] and not second['hasMore']
    assert first['contentSha256'] == second['contentSha256'] and first['selectionSha256'] == second['selectionSha256']
    action = client.get('/api/vocab/registry?'+urlencode({'scheme': ACTION, 'q': 'MÉCANIQUE', 'language': 'fr', 'snapshot': SEED})).json
    assert action['total'] == 1 and action['formalRelease'] is False
    projected = action['items'][0]
    assert all(projected[key] == value for key, value in SEED_ITEMS[0].items())
    assert {item['family'] for item in projected['usageLinks']} == {'key_action', 'stop_action'}
    assert all('snapshot='+CORE in row['href'] for item in projected['usageLinks'] for row in item['wordings'])
    literal = client.get('/api/vocab/registry?'+urlencode({'q': '%_'})).json
    assert literal['total'] == 1 and literal['items'][0]['id'] == SEED_ITEMS[1]['id']


@pytest.mark.parametrize('suffix,status', [
    ('?snapshot=', 400), ('?snapshot=old', 409), ('?snapshot='+SEED+'&snapshot='+SEED, 400),
    ('?q=x&q=x', 400), ('?soruce=fixture', 400), ('?limit=0', 400), ('?limit=101', 400),
    ('?offset=-1', 400), ('?offset=1.5', 400), ('?offset=', 400), ('?language=xx', 400), ('?scheme=unknown', 404),
])
def test_registry_refuses_ambiguous_invalid_or_unavailable_queries(application, suffix, status):
    response = application.test_client().get('/api/vocab/registry'+suffix)
    assert response.status_code == status and response.headers['Cache-Control'] == 'no-store'


def test_candidate_detail_has_separate_real_occurrence_counts_and_no_promotion(application):
    client = application.test_client()
    result = client.get('/api/vocab/registry/concept?'+urlencode({'uri': CONCEPT, 'snapshot': SEED})).json
    concept = result['concept']
    assert concept['lifecycle'] == 'candidate' and concept['canonicalPromotion'] is False
    assert concept['usage']['families'] == [
        {'family': 'key_action', 'title': 'Key action', 'occurrences': 2},
        {'family': 'stop_action', 'title': 'Stop action', 'occurrences': 1}]
    assert concept['usage']['unit'] == 'source occurrences' and concept['usage']['physicalObjectsCounted'] is False
    assert client.get('/api/vocab/registry/concept?uri=unknown').status_code == 404
    assert client.get('/api/vocab/registry/concept?uri=').status_code == 400


@pytest.mark.parametrize('path,query', [
    ('/api/vocab/registry', {'scheme': ACTION, 'q': 'Mechanical'}),
    ('/api/vocab/registry/concept', {'uri': CONCEPT}),
    ('/api/vocab/registry/export', {'format': 'json'}),
])
@pytest.mark.parametrize('pins', [
    {'coreSnapshot': CORE}, {'indexSnapshot': INDEX},
    {'coreSnapshot': CORE, 'indexSnapshot': INDEX},
])
def test_registry_optional_dependency_pins_preserve_existing_response(application, path, query, pins):
    client = application.test_client()
    original = client.get(path, query_string={**query, 'snapshot': SEED})
    pinned = client.get(path, query_string={**query, 'snapshot': SEED, **pins})
    assert original.status_code == pinned.status_code == 200
    assert pinned.data == original.data and pinned.headers['ETag'] == original.headers['ETag']
    assert pinned.json['registrySha256'] == SEED
    assert pinned.json['publicCoreSha256'] == CORE and pinned.json['researchIndexSha256'] == INDEX
    assert client.get(path, query_string={**query, 'snapshot': SEED, **pins},
                      headers={'If-None-Match': pinned.headers['ETag']}).status_code == 304


@pytest.mark.parametrize('path,query', [
    ('/api/vocab/registry', []),
    ('/api/vocab/registry/concept', [('uri', CONCEPT)]),
    ('/api/vocab/registry/export', [('format', 'ttl')]),
])
@pytest.mark.parametrize('parameter,label', [
    ('coreSnapshot', 'public-core'), ('indexSnapshot', 'research-index'),
])
@pytest.mark.parametrize('operands,status', [
    ([''], 400), ([' '], 400), (['unavailable'], 409),
    (['same', 'same'], 400), (['first', 'second'], 400),
])
def test_registry_dependencies_refuse_empty_ambiguous_and_stale_pins(application, path, query, parameter, label, operands, status):
    client = application.test_client()
    response = client.get(path, query_string=query+[('snapshot', SEED)]+[(parameter, value) for value in operands])
    assert response.status_code == status and response.headers['Cache-Control'] == 'no-store'
    assert 'error' in response.json
    if status == 409:
        assert label in response.json['error']


@pytest.mark.parametrize('path,query', [
    ('/api/vocab/registry', {}),
    ('/api/vocab/registry/concept', {'uri': CONCEPT}),
    ('/api/vocab/registry/export', {'format': 'json'}),
])
def test_registry_dependency_misspellings_are_not_ignored(application, path, query):
    response = application.test_client().get(path, query_string={**query, 'coreSnaphot': CORE})
    assert response.status_code == 400 and 'Unsupported vocabulary parameter' in response.json['error']


@pytest.mark.parametrize('changed,key,label', [
    ('core', 'coreSnapshot', 'public-core'), ('index', 'indexSnapshot', 'research-index'),
])
def test_seed_identity_cannot_substitute_changed_registry_usage_dependencies(application, changed, key, label):
    client = application.test_client()
    pins = {'snapshot': SEED, 'coreSnapshot': CORE, 'indexSnapshot': INDEX}
    original = client.get('/api/vocab/registry/export', query_string={**pins, 'format': 'ttl'})
    application.extensions['research_workbench'].manifest[changed]['sha256'] = 'd'*64
    for path, query in [('/api/vocab/registry', {}), ('/api/vocab/registry/concept', {'uri': CONCEPT}),
                        ('/api/vocab/registry/export', {'format': 'ttl'})]:
        response = client.get(path, query_string={**query, **pins}, headers={'If-None-Match': original.headers['ETag']})
        assert response.status_code == 409 and label in response.json['error']
        assert response.headers['Cache-Control'] == 'no-store'
    current = client.get('/api/vocab/registry', query_string={**pins, key: 'd'*64})
    assert current.status_code == 200 and current.json['registrySha256'] == SEED


@pytest.mark.parametrize('format', ['json', 'csv', 'ttl', 'skos', 'jsonld'])
def test_registry_dependencies_keep_complete_exports_and_original_digests(application, format):
    client = application.test_client()
    base = {'format': format, 'snapshot': SEED}
    original = client.get('/api/vocab/registry/export', query_string=base)
    pinned = client.get('/api/vocab/registry/export', query_string={**base, 'coreSnapshot': CORE, 'indexSnapshot': INDEX})
    assert pinned.status_code == 200 and pinned.data == original.data
    assert pinned.headers['ETag'] == original.headers['ETag']
    assert pinned.headers['X-Content-SHA256'] == hashlib.sha256(pinned.data).hexdigest()
    assert pinned.headers['X-Vocabulary-Content-SHA256'] == original.headers['X-Vocabulary-Content-SHA256']
    if format == 'json':
        assert pinned.json['completeSelection'] is True
        assert {item['id'] for item in pinned.json['items']} == {item['id'] for item in SEED_ITEMS}
        assert pinned.json['contentSha256'] == original.json['contentSha256']
        assert pinned.json['selectionSha256'] == original.json['selectionSha256']


@pytest.mark.parametrize('format', ['json', 'csv', 'ttl', 'skos', 'jsonld'])
def test_candidate_exports_repeat_exactly_with_byte_and_content_fixity(application, format):
    client = application.test_client()
    url = '/api/vocab/registry/export?'+urlencode({'scheme': ACTION, 'snapshot': SEED, 'format': format})
    first, second = client.get(url), client.get(url)
    assert first.status_code == second.status_code == 200
    assert first.data == second.data and first.headers['ETag'] == second.headers['ETag']
    assert hashlib.sha256(first.data).hexdigest() == first.headers['X-Content-SHA256']
    assert len(first.headers['X-Vocabulary-Content-SHA256']) == 64
    assert client.get(url, headers={'If-None-Match': first.headers['ETag']}).status_code == 304
    if format in {'ttl', 'skos', 'jsonld'}:
        graph = Graph().parse(data=first.data, format='json-ld' if format == 'jsonld' else 'turtle')
        labels = list(graph.objects(URIRef(CONCEPT), SKOS.prefLabel))
        assert {(str(label), label.language) for label in labels} == {('Mechanical action', 'en'), ('Action mécanique', 'fr')}
        assert len(labels) == len({label.language for label in labels})
        assert any('accepted_lexical_mapping' in str(value) and 'stop_action' in str(value) for value in graph.objects())
    if format == 'json':
        assert first.json['completeSelection'] and len(first.json['items']) == first.json['total'] == 1


def test_source_technical_fields_have_exact_source_evidence_and_no_fake_account_link(application):
    client = application.test_client()
    result = client.get('/api/vocab/usage/key_action?term=Mechanical&snapshot='+CORE).json
    assert result['counts']['occurrences'] == 2 and result['counts']['accounts'] == 0
    assert result['counts']['sourceRecords'] == 1
    assert result['capabilities']['distributions'] is False
    for item in result['items']:
        assert item['href'] == item['sourceHref'] == '/source/sr%3Aone'
        assert item['evidenceTarget'] == 'source_record' and 'description=' not in item['href']
        assert item['sourceEvidence']['source_revision_sha256'] == 'exact-source-revision'
        assert item['sourceEvidence']['native_identifier'] == 'native-1'
    assert result['mappings'][0]['status'] == 'candidate' and '/vocab/registry?' in result['mappings'][0]['href']


def test_source_query_refusal_and_qualified_complete_package_adapter(application):
    client = application.test_client()
    for query in ['snapshot=', 'source=fixture&source=fixture', 'page=x', 'soruce=fixture', 'format=ro-crate']:
        assert client.get('/api/vocab/usage/key_action?term=Mechanical&'+query).status_code == 400
    assert client.get('/api/vocab/usage/key_action?section=organs').status_code == 400
    assert client.get('/api/vocab/usage/key_action?match=contains').status_code == 400
    assert client.get('/api/vocab/usage/key_action?term=Mechanical&sort=frequency').status_code == 400
    url = '/api/vocab/usage/key_action/export?term=Mechanical&format=ro-crate&snapshot='+CORE
    response = client.get(url)
    assert response.status_code == 200 and response.mimetype == 'application/zip'
    assert response.headers['X-Content-SHA256'] == hashlib.sha256(response.data).hexdigest()
    with ZipFile(io.BytesIO(response.data)) as archive:
        result = json.loads(archive.read('selection.json'))
        assert result['completeSelection'] and len(result['items']) == result['total'] == 2
        for line in archive.read('checksums.sha256').decode().splitlines():
            digest, name = line.split('  ', 1)
            assert hashlib.sha256(archive.read(name)).hexdigest() == digest
    application.extensions.pop('research_package_export')
    assert client.get(url).status_code == 400


def test_changed_optional_resources_fail_closed_without_removing_controlled_catalogue(application):
    application.extensions['capability_health'] = SimpleNamespace(resource_state=lambda key: {'available': False})
    client = application.test_client()
    assert client.get('/api/vocab/registry').status_code == 503
    assert client.get('/api/vocab/usage/key_action').status_code == 503
    response = client.get('/api/vocab/catalogue')
    assert response.status_code == 200
    assert response.json['countsByKind']['controlled']['count'] == 1
    assert response.json['availability'] == {'candidateRegistry': 'unavailable', 'sourceWording': 'unavailable'}


def controlled_app():
    """Run the real nested route definitions without booting unrelated services."""
    source = Path(__file__).parents[1]/'navigator_app/public_app.py'
    module = ast.parse(source.read_text())
    factory = next(node for node in module.body if isinstance(node, ast.FunctionDef) and node.name == 'create_public_app')
    names = {'vocabulary_schemes','vocabulary_releases','vocabulary_overview','vocabulary_concepts',
             'vocabulary_concept','vocabulary_source_term','vocabulary_snapshot','vocabulary_snapshot_download'}
    functions = [node for node in factory.body if isinstance(node, ast.FunctionDef) and node.name in names]
    assert len(functions) == len(names)
    app = Flask('controlled-vocabulary-test')
    context = {'__package__': 'navigator_app', 'app': app, 'repo': Repository(), 'request': request,
               'jsonify': jsonify, 'json': json, 'query_arguments': query_arguments, 'bounded_integer': bounded_integer,
               'require_snapshot': require_snapshot, 'vocabulary_endpoint': vocabulary_endpoint, 'byte_response': byte_response}
    exec(compile(ast.Module(body=functions, type_ignores=[]), str(source), 'exec'), context)
    return app


def test_controlled_reader_exact_snapshot_pagination_language_and_refusals():
    client = controlled_app().test_client()
    metadata = client.get('/api/vocab/snapshots/modavis_activity_types').json
    digest = metadata['contentSha256']
    result = client.get('/api/vocab/concepts?scheme_code=modavis_activity_types&language=de&limit=1&snapshot='+digest)
    assert result.status_code == 200 and result.json['total'] == 1 and result.json['contentSha256'] == digest
    assert result.json['items'][0]['preferredLabel'] == 'Repair'
    assert result.json['languages'] == ['de','en']
    detail = client.get('/api/vocab/concepts/repair?scheme_code=modavis_activity_types&snapshot='+digest)
    assert detail.status_code == 200 and detail.json['contentSha256'] == digest
    for query, status in [('limit=x',400), ('limit=501',400), ('offset=-1',400), ('snapshot=',400),
                          ('snapshot=other',409), ('q=x&q=x',400), ('soruce=x',400), ('language=xx',400)]:
        assert client.get('/api/vocab/concepts?scheme_code=modavis_activity_types&'+query).status_code == status


@pytest.mark.parametrize('format', ['json', 'csv', 'ttl', 'skos', 'jsonld'])
def test_controlled_snapshot_pin_determinism_and_retained_label_authority(format):
    client = controlled_app().test_client()
    digest = client.get('/api/vocab/snapshots/modavis_activity_types').json['contentSha256']
    url = '/api/vocab/snapshots/modavis_activity_types.'+format+'?snapshot='+digest
    first, second = client.get(url), client.get(url)
    assert first.status_code == second.status_code == 200 and first.data == second.data
    assert first.headers['X-Content-SHA256'] == hashlib.sha256(first.data).hexdigest()
    assert first.headers['X-Vocabulary-Content-SHA256'] == digest
    assert client.get(url, headers={'If-None-Match': first.headers['ETag']}).status_code == 304
    assert client.get(url+'&snapshot='+digest).status_code == 400
    assert client.get(url.replace(digest, 'old')).status_code == 409
    if format in {'ttl','skos','jsonld'}:
        graph = Graph().parse(data=first.data, format='json-ld' if format=='jsonld' else 'turtle')
        concept = URIRef('https://example.org/modavis/vocab/event-type/repair')
        assert [(str(label), label.language) for label in graph.objects(concept, SKOS.prefLabel)] == [('Repair','en')]
        assert {(str(label),label.language) for label in graph.objects(concept,RDFS.label)} == {('Reparatur','de'),('Another full name','en')}
