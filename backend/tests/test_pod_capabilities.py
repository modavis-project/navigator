"""Route and relationship contracts over authored read-only relational evidence."""
from contextlib import contextmanager
import re
import sqlite3
from types import SimpleNamespace

from flask import Flask
import pytest

import navigator_app.pod_capabilities as module
import navigator_app.pod_related_resources as related


@pytest.fixture
def client(monkeypatch):
    database = sqlite3.connect(':memory:')
    database.row_factory = sqlite3.Row
    database.executescript('''
        attach ':memory:' as release_1_5_public;
        create table release_1_5_public.organ(mdvs_id text,label text);
        insert into release_1_5_public.organ values ('MDVS:ENTY:A','Chapel 100%'),('MDVS:ENTY:B','Chapel 100X');
        create table release_1_5_public.actor(mdvs_id text);
        insert into release_1_5_public.actor values ('MDVS:ENTY:ACTOR');
        create table release_1_5_public.source_collection(source_key text,source_record_count integer,canonical_organ_count integer);
        insert into release_1_5_public.source_collection values ('one',1,1),('two',1,1);
        create table release_1_5_public.source_membership(source_record_id text,source_key text,native_identifier text,organ_mdvs_id text);
        insert into release_1_5_public.source_membership values ('sr:one','one','100%','MDVS:ENTY:A'),('sr:two','two','100X','MDVS:ENTY:B');
        create table release_1_5_public.place_detail(mdvs_id text,preferred_name text,place_kind text,coordinate_state text);
        insert into release_1_5_public.place_detail values ('MDVS:LOCN:P','Chapel 100%','venue','approximate'),('MDVS:LOCN:Q','Chapel 100X','settlement','source_grid_cell');
        create table release_1_5_public.virtual_instrument(mdvs_id text,canonical_title text);
        insert into release_1_5_public.virtual_instrument values ('MDVS:VMIN:V','Authored virtual organ');
        create table release_1_5_public.organ_virtual_instrument(relation_id integer,vmi_mdvs_id text,organ_mdvs_id text,resolution_state text,confidence real,row_hash text);
        insert into release_1_5_public.organ_virtual_instrument values (1,'MDVS:VMIN:V','MDVS:ENTY:A','retained_probable',0.7,'vmi-hash');
        create table release_1_5_public.organ_temperament_assertion(assertion_id text,organ_mdvs_id text,source_value text,source_record_id text,source_key text,row_sha256 text);
        insert into release_1_5_public.organ_temperament_assertion values ('TA','MDVS:ENTY:A','Source wording, uncertain','sr:one','one','tuning-hash');
        create table release_1_5_public.rights_exclusion(category text,rationale text,excluded_from_public integer);
        insert into release_1_5_public.rights_exclusion values ('source_media','External rights apply',1);
    ''')
    database.execute('pragma query_only=on')

    class Rows:
        def __init__(self, values): self.values = values
        def fetchall(self): return self.values
        def fetchone(self): return self.values[0] if self.values else None

    class Connection:
        def execute(self, sql, parameters=()):
            if 'information_schema.tables' in sql:
                return Rows([{'table_name': row[0]} for row in database.execute("select name from release_1_5_public.sqlite_master where type='table'")])
            # Keep real predicates and joins; translate only driver/SQL dialect.
            sql = re.sub(r'%\((\w+)\)s', r':\1', sql).replace('%s', '?').replace(' ilike ', ' like ')
            return Rows([dict(row) for row in database.execute(sql, parameters)])

    @contextmanager
    def connect(settings): yield Connection()

    monkeypatch.setattr(module, 'connect', connect)
    monkeypatch.setattr(related, 'connect', connect)
    repository = SimpleNamespace(settings=object(), policy=SimpleNamespace(release_version='authored-fixture'),
        _resolve_organ_mdvs_id=lambda value: ('MDVS:ENTY:A', None) if value in {'A', 'MDVS:ENTY:A'} else None)
    app = Flask(__name__)
    module.register_pod_capabilities(app, repository)
    yield app.test_client()
    database.close()


def test_inventory_preserves_units_and_optional_unavailability(client):
    response = client.get('/api/pod/capabilities')
    assert response.status_code == 200
    data = response.json
    families = {item['id']: item for item in data['families']}
    assert families['organs']['count'] == 2 and families['organs']['unit'] == 'organ records'
    assert families['actors']['count'] == 1 and families['actors']['unit'] == 'identified actor records'
    assert families['scores']['available'] is False and families['scores']['count'] is None
    assert data['snapshot'] is None and data['dataAccess']['graphqlAvailable'] is False
    assert data['readOnly'] and 'no-store' in response.headers['Cache-Control']
    assert 'settings' not in str(data) and 'password' not in str(data)


@pytest.mark.parametrize('url', [
    '/api/pod/sources?soruce=one', '/api/pod/sources?source=one&source=two',
    '/api/pod/places?q=&q=Chapel', '/api/pod/places?offset=-1',
    '/api/pod/sources?limit=0', '/api/pod/sources?limit=51',
    '/api/pod/places?offset=10001', '/api/pod/capabilities?source=one',
    '/api/pod/organs/A/resources?q=Chapel', '/api/pod/sources?q=' + 'x' * 257,
    '/api/pod/places?kind=misspelled',
])
def test_unsupported_ambiguous_and_unbounded_requests_are_refused(client, url):
    response = client.get(url)
    assert response.status_code == 400 and 'items' not in response.json


@pytest.mark.parametrize('path', ['sources', 'places'])
def test_wildcards_are_literal_and_counts_match_membership(client, path):
    all_rows = client.get('/api/pod/' + path + '?q=Chapel').json
    assert all_rows['total'] == 2
    percent = client.get('/api/pod/' + path + '?q=%25').json
    assert percent['total'] == len(percent['items']) == 1
    assert '100%' in str(percent['items'])
    assert client.get('/api/pod/' + path + '?q=' + "x%27%20OR%201=1--").json['total'] == 0


def test_source_scope_pagination_and_place_detail_routes(client):
    page = client.get('/api/pod/sources?limit=1&offset=1').json
    assert page['total'] == 2 and len(page['items']) == 1 and page['items'][0]['source'] == 'two'
    assert client.get('/api/pod/sources?source=one').json['total'] == 1
    place = client.get('/api/pod/places?kind=venue').json
    assert place['total'] == 1 and place['items'][0]['url'] == '/places/P'
    assert place['items'][0]['qualification'] == 'approximate'


def test_relationships_remain_attributed_and_missing_links_are_not_zero(client):
    response = client.get('/api/pod/organs/A/resources')
    assert response.status_code == 200
    data = response.json
    assert data['virtualInstruments'][0]['relationshipState'] == 'retained_probable'
    assert data['virtualInstruments'][0]['evidenceSha256'] == 'vmi-hash'
    tuning = data['temperamentAssertions'][0]
    assert tuning['wording'] == 'Source wording, uncertain' and tuning['sourceUrl'] == '/source/sr%3Aone'
    assert 'tuningId' not in tuning  # no inferred exact temperament relation
    assert {item['id'] for item in data['unavailableRelationships']} == {'scores', 'literature'}
    assert all(item['state'] == 'relationship_unavailable' and 'count' not in item for item in data['unavailableRelationships'])
    missing_media = next(item for item in data['collections'] if item['id'] == 'media')
    assert missing_media['available'] is False and missing_media['count'] is None
    assert client.get('/api/pod/organs/missing/resources').status_code == 404


def test_stale_research_binding_disables_its_tools_without_hiding_collections(client):
    def stale(): raise ValueError('private path must not leak')
    client.application.extensions['research_workbench'] = SimpleNamespace(assert_binding=stale)
    result = client.get('/api/pod/capabilities').json
    assert result['snapshot'] is None and result['dataAccess']['graphqlAvailable'] is False
    assert next(item for item in result['families'] if item['id'] == 'organs')['available']
    assert 'private path' not in str(result)


def test_current_optional_resource_health_overrides_cached_research_objects(client):
    client.application.extensions['research_workbench'] = SimpleNamespace(assert_binding=lambda:None,
        binding=lambda:{'publicCoreSha256':'a'*64})
    client.application.extensions['capability_health'] = SimpleNamespace(resource_state=lambda key:{'available':False})
    result = client.get('/api/pod/capabilities').json
    assert result['snapshot'] is None and result['dataAccess']['graphqlAvailable'] is False
    assert result['dataAccess']['semanticDistributionsAvailable'] is False
    assert result['dataAccess']['vocabularyReferenceAvailable'] is False
