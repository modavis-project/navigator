from types import SimpleNamespace
from flask import Flask
from navigator_app.public_graphql import register_public_graphql
from navigator_app.db import query_deadline

SNAPSHOT='a'*64


def client():
    app=Flask(__name__)
    state={'snapshot':SNAPSHOT,'reads':[]}
    app.extensions['research_workbench']=SimpleNamespace(assert_binding=lambda:None,binding=lambda:{'publicCoreSha256':state['snapshot']})
    def organs(**kwargs):
        assert query_deadline.get() is not None
        state['reads'].append(kwargs)
        return {'total':1,'items':[{'mdvsId':'organ:fixture','title':'Fixture organ','privateField':'never exposed'}]}
    repo=SimpleNamespace(policy=SimpleNamespace(release_version='fixture'),list_organs=organs)
    def export(repo,kind,id):
        assert query_deadline.get() is not None
        return {'mdvsId':id,'title':'Fixture','privateField':'not a schema field','technicalFacts':[{'value':3,'sourceRecordId':'fixture:source'}]}
    register_public_graphql(app,repo,export)
    return app.test_client(),state


def send(c,query,**kwargs):
    return c.post('/api/graphql',json={'snapshot':SNAPSHOT,'query':query,**kwargs})


def test_readers_and_typed_public_projection():
    c,state=client()
    r=send(c,'query($id:ID!){ snapshot entity(kind:organ,id:$id){ id title evidence{fieldCount sourceContextOnly unavailable} } organs(limit:2){total items{id title}} }',variables={'id':'organ:fixture'})
    assert r.status_code==200,r.json
    assert r.json['data']['entity']['id']=='organ:fixture'
    assert r.json['data']['entity']['evidence']['sourceContextOnly']==2
    assert r.json['data']['organs']=={'total':1,'items':[{'id':'organ:fixture','title':'Fixture organ'}]}
    assert 'privateField' not in r.get_data(as_text=True)
    assert state['reads']==[{'query':None,'limit':2,'offset':0,'include_facets':False}]
    assert query_deadline.get() is None


def test_mutations_fragments_introspection_and_unknown_fields_refused_before_reads():
    c,state=client()
    for query in ['mutation { snapshot }','subscription { snapshot }','{ __schema { queryType{name} } }','query{...X} fragment X on Query {snapshot}','{ organs {items{privateField}} }','{a:snapshot b:snapshot c:snapshot d:snapshot e:snapshot}']:
        assert send(c,query).status_code==400,query
    assert not state['reads']


def test_pagination_snapshot_and_size_boundaries():
    c,state=client()
    for query in ['{organs(limit:51){total}}','{organs(offset:-1){total}}']:
        assert send(c,query).status_code==400
    assert send(c,'{snapshot}',snapshot='b'*64).status_code==409
    assert not state['reads']
    assert c.post('/api/graphql',data='x'*33000,content_type='application/json').status_code==413
    assert c.get('/api/graphql').status_code==405


def test_changed_snapshot_does_not_return_mixed_result():
    c,state=client()
    workbench=c.application.extensions['research_workbench']
    calls=[]
    def check():
        calls.append(1)
        if len(calls)==2:state['snapshot']='b'*64
    workbench.assert_binding=check
    assert send(c,'{snapshot}').status_code==409
    assert query_deadline.get() is None


def test_missing_pinned_runtime_is_unavailable():
    c,state=client()
    c.application.extensions.clear()
    assert send(c,'{snapshot}').status_code==503
    assert not state['reads']


def test_each_statement_receives_remaining_budget(monkeypatch):
    from navigator_app import db
    import pytest
    calls=[]
    connection=SimpleNamespace(execute=lambda *args,**kwargs:calls.append(args))
    clock=iter([10.0,12.5,15.1])
    monkeypatch.setattr(db.time,'monotonic',lambda:next(clock))
    bounded=db._DeadlineConnection(connection,15.0)
    bounded.execute('select 1')
    bounded.execute('select 2')
    assert calls[0][1]==('5000',) and calls[2][1]==('2500',)
    with pytest.raises(TimeoutError):bounded.execute('select 3')
    assert len(calls)==4


def identity_client(rows, resolver):
    app = Flask(__name__)
    app.extensions['research_workbench'] = SimpleNamespace(assert_binding=lambda: None, binding=lambda: {'publicCoreSha256': SNAPSHOT})
    repo = SimpleNamespace(policy=SimpleNamespace(release_version='fixture'), resolve_mdvs_id=resolver,
                           list_organs=lambda **kw: {'total': len(rows), 'items': rows[kw['offset']:kw['offset'] + kw['limit']]})
    register_public_graphql(app, repo, lambda _repo, _kind, identifier: next((row for row in rows if row['mdvsId'] == identifier), None))
    return app.test_client()


def test_graphql_shares_public_deadline_and_refuses_partial_result(monkeypatch):
    from navigator_app import db
    from navigator_app.request_reliability import register_request_reliability

    now = [100.0]
    monkeypatch.setattr(db.time, 'monotonic', lambda: now[0])
    observed = []

    def resolve(identifier):
        observed.append(query_deadline.get())
        now[0] += 7.0
        return {'canonicalUri': 'https://example.invalid/' + identifier}

    c = identity_client([{'mdvsId': 'fixture', 'title': 'Fixture'}], resolve)
    register_request_reliability(c.application)
    query = '{ snapshot organs(limit:1){ items{ id canonicalUri } } }'
    response = send(c, query)
    assert response.status_code == 200 and observed == [110.0]
    assert response.headers['X-MODAVIS-Query-Budget-Ms'] == '10000'

    response = c.post('/api/graphql', json={'snapshot': SNAPSHOT, 'query': query},
                      headers={'X-Request-Timeout-Ms': '6000'})
    assert response.status_code == 504 and observed == [110.0, 113.0]
    assert response.json['error'] == 'query_timeout' and 'data' not in response.json
    assert response.headers['Cache-Control'] == 'no-store'
    assert query_deadline.get() is None

    response = c.post('/api/graphql?format=ro-crate', json={'snapshot': SNAPSHOT, 'query': query})
    assert response.status_code == 200 and observed[-1] == 124.0
    assert response.headers['X-MODAVIS-Query-Budget-Ms'] == '10000'


def test_canonical_uri_uses_the_verified_fixture_ledger_for_cards_and_entities(tmp_path):
    import json
    from backend.tests.test_fixture_boundary import settings_for
    from navigator_app.identity_ledger import IdentityLedgerResolver
    from navigator_app.uri_policy import UriPolicy
    from tools.fixture_support import FIXTURE, build_ledger, sha256

    records = json.loads((FIXTURE / 'records.json').read_text())
    path = tmp_path / 'verified-fixture-ledger.sqlite'
    build_ledger(path, records)
    settings = settings_for(path, sha256(path))
    ledger = IdentityLedgerResolver(path, policy=UriPolicy.from_settings(settings), expected_sha256=sha256(path))
    calls = []

    def resolve(identifier):
        calls.append(identifier)
        assert query_deadline.get() is not None
        return ledger.resolve(identifier)

    rows = [{'mdvsId': row['mdvs_id'], 'title': row['label']} for row in records['organ']]
    rows.append({'mdvsId': 'MDVS:ENTY:TEST-9999-X', 'title': 'Public source record without accepted ledger identity'})
    c = identity_client(rows, resolve)
    response = send(c, '{ entity(kind:organ,id:"MDVS:ENTY:TEST-0001-A"){canonicalUri} missing:entity(kind:organ,id:"MDVS:ENTY:TEST-9999-X"){canonicalUri} organs(limit:3){items{id canonicalUri}} }')
    assert response.status_code == 200, response.json
    data = response.json['data']
    assert data['entity']['canonicalUri'] == records['organ'][0]['canonical_uri']
    assert [row['canonicalUri'] for row in data['organs']['items']] == [row['canonical_uri'] for row in records['organ']] + [None]
    assert data['missing']['canonicalUri'] is None
    assert len(calls) == len(set(calls)) == 3  # Shared card/entity and missing identities are cached for this request.


def test_existing_canonical_and_identifier_uris_take_precedence_without_lookup():
    rows = [
        {'mdvsId': 'a', 'title': 'A', 'canonicalUri': 'https://example.invalid/accepted/a', 'identifierUri': 'https://example.invalid/older/a'},
        {'mdvsId': 'b', 'title': 'B', 'identifierUri': 'https://example.invalid/accepted/b'},
    ]
    def forbidden_lookup(_identifier):
        raise AssertionError('Existing public identity must not require another lookup')
    c = identity_client(rows, forbidden_lookup)
    response = send(c, '{entity(kind:organ,id:"b"){canonicalUri} organs{items{canonicalUri}}}')
    assert response.status_code == 200, response.json
    assert response.json['data']['entity']['canonicalUri'] == rows[1]['identifierUri']
    assert response.json['data']['organs']['items'] == [{'canonicalUri': rows[0]['canonicalUri']}, {'canonicalUri': rows[1]['identifierUri']}]


def test_lazy_identity_resolution_preserves_existing_four_root_fifty_card_profile():
    rows = [{'mdvsId': 'accepted-' + str(i), 'title': 'Fixture ' + str(i)} for i in range(200)]
    accepted = {row['mdvsId']: {'canonicalUri': 'https://example.invalid/accepted/' + str(i)} for i, row in enumerate(rows)}
    calls = []
    def resolve(identifier):
        calls.append(identifier)
        return accepted.get(identifier)
    c = identity_client(rows, resolve)
    assert send(c, '{organs(limit:50){items{id title}}}').status_code == 200
    assert calls == []
    query = '{' + ' '.join(f'p{i}:organs(limit:50,offset:{i * 50}){{items{{canonicalUri}}}}' for i in range(4)) + '}'
    response = send(c, query)
    assert response.status_code == 200, response.json
    assert len(calls) == 200
    assert all(item['canonicalUri'] for page in response.json['data'].values() for item in page['items'])
    calls.clear()
    response = send(c, '{entity(kind:organ,id:"accepted-50"){canonicalUri} organs(limit:50){items{canonicalUri}}}')
    assert response.status_code == 200 and len(calls) == 51


def test_older_fixture_without_identity_resolver_keeps_explicit_null():
    c, _ = client()
    response = send(c, '{entity(kind:organ,id:"organ:fixture"){canonicalUri} organs{items{canonicalUri}}}')
    assert response.status_code == 200
    assert response.json['data'] == {'entity': {'canonicalUri': None}, 'organs': {'items': [{'canonicalUri': None}]}}


def test_oversized_evidence_does_not_block_entity_metadata():
    from navigator_app.evidence_coverage import MAX_FIELDS

    row = {
        'mdvsId': 'organ:large',
        'title': 'Large fixture organ',
        'canonicalUri': 'https://example.invalid/organ/large',
        'technicalFacts': [1] * MAX_FIELDS,
    }
    c = identity_client([row], lambda _identifier: None)
    response = send(c, '{entity(kind:organ,id:"organ:large"){id title canonicalUri}}')
    assert response.status_code == 200, response.json
    assert response.json['data']['entity'] == {
        'id': row['mdvsId'], 'title': row['title'], 'canonicalUri': row['canonicalUri'],
    }
    assert response.json['extensions']['snapshot'] == SNAPSHOT
    assert response.headers['Cache-Control'] == 'no-store'

    response = send(c, '{entity(kind:organ,id:"organ:large"){id evidence{fieldCount}}}')
    assert response.status_code == 400
    assert response.json == {'errors': [{
        'message': 'Query execution refused or failed',
        'path': ['entity', 'evidence'],
    }]}
