"""HTTP contracts over authored in-memory evidence, never accepted POD files."""
from contextlib import contextmanager
import hashlib
import json
import sqlite3
from types import SimpleNamespace

from flask import Flask
import pytest

import navigator_app.research_workbench as module
from navigator_app.research_package import register_research_packages

SNAPSHOT = 'a' * 64
ASSESSMENT = 'b' * 64
ORGAN = 'MDVS:ENTY:TEST-0001-A'


@pytest.fixture
def client(monkeypatch):
    c = sqlite3.connect(':memory:')
    c.row_factory = sqlite3.Row
    c.executescript('''
        attach ':memory:' as core;
        attach ':memory:' as research;
        attach ':memory:' as assessment;
        create table core.organ(mdvs_id text primary key,label text);
        create table core.source_membership(organ_mdvs_id text,source_record_id text,source_key text);
        create table core.specification_description(description_id text,description_revision text,organ_mdvs_id text);
        create table core.vocabulary_concept(concept_code text,mdvs_id text,scheme_code text,payload_json text);
        create table core.technical_fact(organ_mdvs_id text,family text,source_record_id text,fact_id text,display_value text);
        create table core.organ_builder_assertion(organ_mdvs_id text,source_record_id text,assertion_id text);
        create table research.association(organ text,actor text);
        create table research.assertion(organ text,source text,actor text);
        create table research.participant(actor text,event text);
        create table research.event(id text primary key,organ text,source text,eligible integer,start integer,end integer,payload text);
        create table work_event(id text primary key,organ text,source text,start integer,date_kind text,payload text,eligible integer);
        create table work_configuration(id text primary key,organ text,source text,year integer,date_kind text,coverage text,payload text);
        create table term_occurrence(id text,kind text,source_key text,country text,pitch text,year integer,date_kind text,search text,source text,organ text,label text,concept text,description text,division text);
        create table term_dated as select * from term_occurrence;
        create table term_denominator(kind text,source_key text,country text,occurrences integer,sources integer,organs integer);
        create table assessment.occurrence(id text,event text,actor text,native text,organ text,source text,status text,kind text,payload text);
        create table assessment.cohort(native text,payload text);
    ''')
    for number, source in [(1, 'one'), (2, 'two')]:
        oid = f'MDVS:ENTY:TEST-000{number}-' + ('A' if number == 1 else 'B')
        c.execute('insert into core.organ values (?,?)', (oid, f'Example Chapel {number}'))
        c.execute('insert into core.source_membership values (?,?,?)', (oid, f'record-{source}', source))
    for aid, revision in [('account-a', 'rev-a'), ('account-b', 'rev-b')]:
        c.execute('insert into core.specification_description values (?,?,?)', (aid, revision, ORGAN))
    event = json.dumps({'event_id': 'event-a', 'controlled_event_type': 'construction', 'participants': []})
    c.execute('insert into work_event values (?,?,?,?,?,?,?)', ('event-a', ORGAN, 'record-one', 1750, 'exact', event, 1))
    c.execute('insert into term_occurrence values (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
              ('stop-a', 'stops', 'one', 'DE', '8', 1750, 'year', 'principal', 'record-one', ORGAN, 'Principal', None, 'account-a', 'Great'))
    c.execute('insert into term_dated select * from term_occurrence')
    for source in ['', 'one']:
        c.execute('insert into term_denominator values (?,?,?,?,?,?)', ('stops', source, '', 1, 1, 1))
    c.execute('pragma query_only=on')

    work = object.__new__(module.Workbench)
    work.manifest = {'core': {'sha256': SNAPSHOT}}
    work.identities = {'groups': []}
    work.facets = {'termKinds': ['stops', 'divisions', 'activities'],
                   'dateKinds': ['exact', 'range', 'year', 'relative', 'source_listing', 'undated'],
                   'coverage': ['partial', 'structured_stops']}
    work.assessments = {'assessmentContentSha256': ASSESSMENT, 'coverage': {}, 'method': 'Authored fixture'}
    work.binding = lambda: {'publicCoreSha256': SNAPSHOT, 'occurrenceAssessmentSha256': ASSESSMENT, 'querySha256': 'authored-query'}
    work.assert_binding = lambda: None
    work.repo = SimpleNamespace(get_organ_specification_description=lambda *args: {'groups': []})

    @contextmanager
    def connect(*args, **kwargs):
        yield c

    work.connect = connect
    monkeypatch.setattr(module, 'Workbench', lambda *args, **kwargs: work)
    monkeypatch.setenv('NAVIGATOR_WORKBENCH_MANIFEST', 'authored-memory-only')
    app = Flask(__name__)
    app.config['RESEARCH_PACKAGE_LICENSE'] = 'CC0-1.0'
    module.register_workbench(app, SimpleNamespace(), SimpleNamespace())
    register_research_packages(app)
    yield app.test_client()
    c.close()


def get(client, route, query=''):
    return client.get('/api/workbench/' + route + ('?' + query if query else ''))


def test_typo_never_broadens_an_authored_selection(client):
    assert get(client, 'selection', 'section=organs&q=Chapel').json['total'] == 2
    scoped = get(client, 'selection', 'section=organs&q=Chapel&source=one')
    assert scoped.status_code == 200 and scoped.json['total'] == 1
    typo = get(client, 'selection', 'section=organs&q=Chapel&soruce=one')
    assert typo.status_code == 400 and 'soruce' in typo.json['error']
    assert 'items' not in typo.json and 'filters' not in typo.json
    assert get(client, 'selection', 'section=organs&q=Chapel&soruce=').status_code == 400


@pytest.mark.parametrize('route,query', [
    ('selection', 'section=organs&q=Chapel&source=one&source=two'),
    ('selection/export', 'section=organs&q=Chapel&source=one&source=one'),
    ('terms', 'q=&q=Principal'),
    ('occurrences', 'kind=builder&kind=participant'),
    ('context', 'snapshot=' + SNAPSHOT + '&snapshot=' + SNAPSHOT),
    ('selection', 'section=organs&q=Chapel&snapshot=&snapshot=' + SNAPSHOT),
    ('terms', 'assessment=&assessment=' + ASSESSMENT),
    ('compare', 'left=account-a&left=account-b&right=account-b'),
    ('compare', 'left=account-a&leftRevision=&leftRevision=rev-a&right=account-b'),
])
def test_duplicate_operands_are_rejected_before_flattening(client, route, query):
    response = get(client, route, query)
    assert response.status_code == 400
    assert 'Repeated research parameter' in response.json['error']


@pytest.mark.parametrize('route,query', [
    ('selection', 'section=organs&q=Chapel&snapshot='),
    ('terms', 'assessment='),
    ('account/account-a', 'revision='),
    ('compare', 'left=account-a&leftRevision=&right=account-b&rightRevision=rev-b'),
    ('selection', 'section=organs&q=Chapel&right=account-b&rightRevision='),
])
def test_explicit_empty_pins_are_not_treated_as_unbound_queries(client, route, query):
    response = get(client, route, query)
    assert response.status_code == 400
    assert 'Research binding must not be empty' in response.json['error']
    assert 'items' not in response.json


@pytest.mark.parametrize('route,query', [
    ('selection', 'section=organs&q=Chapel&from=1700'),
    ('selection', 'section=events&q=Chapel&coverage=partial'),
    ('selection', 'section=configurations&q=Chapel&other=A'),
    ('selection', 'section=organs&q=Chapel&country=DE'),
    ('terms', 'actor=A'), ('occurrences', 'q=Chapel'),
    ('compare', 'left=account-a&right=account-b&source=one'),
    ('timeline/TEST-0001-A', 'from=1700'),
    ('claims/TEST-0001-A', 'source=one'),
    ('account/account-a', 'source=one'), ('identities', 'actor=A'),
])
def test_incompatible_filters_fail_instead_of_appearing_applied(client, route, query):
    response = get(client, route, query)
    assert response.status_code == 400
    assert 'Unsupported research parameter' in response.json['error']


@pytest.mark.parametrize('route,query', [
    ('selection', 'q=Chapel&section=typo'),
    ('selection', 'q=Chapel&from=seventeen'),
    ('selection', 'q=Chapel&from=1_750'),
    ('selection', 'q=Chapel&from=0'),
    ('selection', 'q=Chapel&to=2101'),
    ('selection', 'q=Chapel&from=1800&to=1700'),
    ('selection', 'q=Chapel&date=typo'),
    ('selection', 'q=Chapel&identity=typo'),
    ('selection', 'q=Chapel&section=configurations&coverage=typo'),
    ('terms', 'mode=typo'), ('terms', 'from=1750.5'),
    ('terms', 'page=-1'), ('terms', 'page=200001'),
    ('occurrences', 'status=typo'), ('occurrences', 'kind=typo'),
    ('selection/export', 'q=Chapel&format=tsv'),
    ('terms/export', 'format=csv'), ('selection', 'q=Chapel&view=typo'),
])
def test_malformed_values_have_explicit_400s(client, route, query):
    response = get(client, route, query)
    assert response.status_code == 400
    assert response.json['error'] and 'items' not in response.json


def test_navigation_controls_are_distinguished_without_rewriting_v1_digest(client):
    query = 'section=organs&q=Chapel&source=one&left=account-a&leftRevision=rev-a&page=0&view=selection&snapshot=' + SNAPSHOT
    response = get(client, 'selection', query)
    assert response.status_code == 200
    data = response.json
    assert data['total'] == 1
    assert data['appliedFilters'] == {'section': 'organs', 'q': 'Chapel', 'source': 'one'}
    assert data['navigationState'] == {'left': 'account-a', 'leftRevision': 'rev-a', 'page': '0', 'view': 'selection'}
    binding = client.application.extensions['research_workbench'].binding()
    expected = hashlib.sha256(module.canonical({'binding': binding, 'filters': data['filters']}).encode()).hexdigest()
    assert data['selectionSha256'] == expected
    assert data['filters']['leftRevision'] == 'rev-a' and data['filters']['snapshot'] == SNAPSHOT
    unpinned = get(client, 'selection', 'section=organs&q=Chapel').json
    pinned = get(client, 'selection', 'section=organs&q=Chapel&snapshot=' + SNAPSHOT).json
    assert unpinned['items'] == pinned['items']
    assert unpinned['selectionSha256'] != pinned['selectionSha256']  # existing v1 contract


@pytest.mark.parametrize('route,query', [
    ('selection', 'section=events&q=Chapel&date=exact&from=1700&to=1800'),
    ('terms', 'mode=stops&q=Principal&source=one&from=1700&to=1800'),
    ('occurrences', 'kind=participant&status=date_unestablished&actor=TEST-0001-A'),
    ('compare', 'left=account-a&leftRevision=rev-a&right=account-b&rightRevision=rev-b&page=0'),
    ('account/account-a', 'revision=rev-a'),
    ('timeline/TEST-0001-A', 'organ=MDVS%3AENTY%3ATEST-0001-A&page=0'),
    ('claims/TEST-0001-A', 'organ=TEST-0001-A'),
    ('identities', 'page=0'),
])
def test_supported_filters_controls_and_identifier_aliases_stay_valid(client, route, query):
    response = get(client, route, query + '&snapshot=' + SNAPSHOT + '&assessment=' + ASSESSMENT)
    assert response.status_code == 200, response.json


@pytest.mark.parametrize('route,query', [
    ('selection', 'section=organs&q=Chapel&snapshot=old'),
    ('terms', 'assessment=old'),
    ('account/account-a', 'revision=old'),
    ('compare', 'left=account-a&leftRevision=old&right=account-b&rightRevision=rev-b'),
])
def test_existing_stale_snapshot_and_revision_refusals_stay_409(client, route, query):
    assert get(client, route, query).status_code == 409


def test_path_selector_conflict_is_not_ignored(client):
    assert get(client, 'timeline/TEST-0001-A', 'organ=TEST-0002-B').status_code == 400


def test_complete_exports_keep_filters_digest_and_package_support(client):
    query = 'section=organs&q=Chapel&source=one&snapshot=' + SNAPSHOT
    page = get(client, 'selection', query).json
    complete = get(client, 'selection/export', query).json
    assert complete['completeSelection'] and complete['total'] == len(complete['items']) == 1
    assert complete['selectionSha256'] == page['selectionSha256']
    csv = get(client, 'selection/export', query + '&format=csv')
    assert csv.status_code == 200 and csv.headers['X-Selection-SHA256'] == page['selectionSha256']
    package = get(client, 'selection/export', query + '&format=ro-crate')
    assert package.status_code == 200 and package.mimetype == 'application/zip'
    assert get(client, 'selection/export', query + '&soruce=one&format=ro-crate').status_code == 400
