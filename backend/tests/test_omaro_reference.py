import hashlib,json,sqlite3
from pathlib import Path
import shutil
from types import SimpleNamespace
import pytest
from flask import Flask
from navigator_app.capability_health import register_capability_health
from navigator_app.omaro_reference import Omaro,register_omaro,canonical,digest

@pytest.fixture
def snapshot(tmp_path):
 db=tmp_path/'reference.sqlite';c=sqlite3.connect(db)
 c.executescript('''CREATE TABLE concept(uri TEXT PRIMARY KEY,kind TEXT,notation TEXT,resolution TEXT,label TEXT,definition TEXT);
 CREATE TABLE label(uri TEXT,language TEXT,role TEXT,label TEXT,search TEXT);
 CREATE TABLE record(kind TEXT,ordinal INTEGER,uri TEXT,data TEXT);
 CREATE TABLE related(concept TEXT,kind TEXT,ordinal INTEGER);
 CREATE TABLE term(uri TEXT PRIMARY KEY,label TEXT,kind TEXT,definition TEXT,data TEXT);''')
 uri='http://www.mimo-db.eu/InstrumentsKeywords/2266'
 c.execute('INSERT INTO concept VALUES(?,?,?,?,?,?)',(uri,'instrument',None,'resolved','Organ',None))
 c.execute('INSERT INTO concept VALUES(?,?,?,?,?,?)',('http://example.org/unresolved','instrument',None,'unresolved','unresolved',None))
 for lang,label in [('en','Organ'),('de','Orgel'),('fr','Orgue')]:c.execute('INSERT INTO label VALUES(?,?,?,?,?)',(uri,lang,'preferred',label,label.casefold()))
 assertion={'uri':'https://w3id.org/modavis/omaro#assertion-test','target_uri':uri,'stance':'source-asserted','applicability_scope_uris':['https://w3id.org/modavis/omaro#scope-source-silent'],'assignment_uri':'https://w3id.org/modavis/omaro#assignment-test'}
 c.execute('INSERT INTO record VALUES(?,?,?,?)',('classification_assertions',0,assertion['uri'],json.dumps(assertion)));c.execute('INSERT INTO related VALUES(?,?,?)',(uri,'classification_assertions',0));c.commit();c.close()
 export=tmp_path/'ontology.ttl';export.write_text('<urn:example> <urn:predicate> <urn:object> .\n')
 m={'contract':'modavis.omaro-reference/v1','index':{'file':db.name,'bytes':db.stat().st_size,'sha256':digest(db)},'exports':{'ontology-ttl':{'file':export.name,'bytes':export.stat().st_size,'sha256':digest(export),'mediaType':'text/turtle'}}}
 m['snapshotSha256']=hashlib.sha256(canonical(m).encode()).hexdigest();p=tmp_path/'manifest.json';p.write_text(json.dumps(m));return p,uri,assertion

def test_multilingual_lookup_does_not_change_concept_identity(snapshot):
 p,uri,_=snapshot;o=Omaro(p);r=o.search('instruments','ORGEL','fr',0,30)
 assert r['total']==1 and r['items'][0]['uri']==uri and r['items'][0]['label']=='Orgue'
 assert o.search('instruments','%','en',0,30)['total']==0

def test_source_assertion_and_assignment_are_not_promoted(snapshot):
 p,uri,assertion=snapshot;d=Omaro(p).detail(uri)
 assert d['records']['classification_assertions']==[assertion]
 assert d['podClassifications']==[]
 assert 'No evidence-backed' in d['podClassificationStatus']
 assert Omaro(p).detail('http://example.org/unresolved')['concept']['resolution']=='unresolved'

def test_integrity_fails_closed(snapshot):
 p,_,_=snapshot;(p.parent/'ontology.ttl').write_text('changed')
 with pytest.raises(ValueError,match='artifact mismatch'):Omaro(p)

def test_manifest_tampering_fails_closed(snapshot):
 p,_,_=snapshot;m=json.loads(p.read_text());m['index']['file']='../elsewhere.sqlite';p.write_text(json.dumps(m))
 with pytest.raises(ValueError,match='manifest mismatch'):Omaro(p)

def test_routes_bounds_snapshot_and_downloads(snapshot,monkeypatch):
 p,uri,_=snapshot;monkeypatch.setenv('NAVIGATOR_OMARO_MANIFEST',str(p));app=Flask(__name__);register_omaro(app);client=app.test_client()
 assert client.get('/api/omaro/concepts?limit=101').status_code==400
 assert client.get('/api/omaro/concepts?collection=wrong').status_code==400
 assert client.get('/api/omaro/concepts?snapshot=wrong').status_code==409
 assert client.get('/api/omaro/download/ontology-ttl?snapshot=wrong').status_code==409
 assert client.get('/api/omaro/concept?uri=https://example.org/missing').status_code==404
 result=client.get('/api/omaro/download/ontology-ttl');assert result.status_code==200 and result.mimetype=='text/turtle'
 assert client.head('/api/omaro/download/ontology-ttl').headers['ETag']==result.headers['ETag']
 assert client.get('/api/omaro/download/ontology-ttl',headers={'If-None-Match':result.headers['ETag']}).status_code==304
 assert client.get('/api/omaro/download/unknown').status_code==404
 assert client.get('/api/omaro/concepts?resolution=unresolved').json['total']==1
 assert client.get('/api/omaro/concept',query_string={'uri':uri}).json['concept']['uri']==uri

def test_absent_snapshot_is_explicit(monkeypatch):
 monkeypatch.delenv('NAVIGATOR_OMARO_MANIFEST',raising=False);app=Flask(__name__);register_omaro(app)
 assert app.test_client().get('/api/omaro').status_code==404


def test_ontology_term_retains_resource_kind_without_overriding_response_kind(snapshot):
 p,_,_=snapshot;m=json.loads(p.read_text());db=p.parent/m['index']['file']
 with sqlite3.connect(db) as c:c.execute('INSERT INTO term VALUES(?,?,?,?,?)',('https://w3id.org/modavis/omaro#ClassificationAssertion','ClassificationAssertion','Class','An assertion','[]'))
 m['index']['sha256']=digest(db);m['index']['bytes']=db.stat().st_size;m.pop('snapshotSha256');m['snapshotSha256']=hashlib.sha256(canonical(m).encode()).hexdigest();p.write_text(json.dumps(m))
 d=Omaro(p).detail('https://w3id.org/modavis/omaro#ClassificationAssertion')
 assert d['kind']=='ontology-term' and d['resourceKind']=='Class' and d['statements']==[]

 assert Omaro(p).search('ontology','%','en',0,30)['total']==0
 assert Omaro(p).search('ontology','ClassificationAssertion','en',0,30)['total']==1


@pytest.fixture
def client(snapshot,monkeypatch):
 p,_,_=snapshot;monkeypatch.setenv('NAVIGATOR_OMARO_MANIFEST',str(p));app=Flask(__name__);register_omaro(app)
 return app.test_client()


@pytest.mark.parametrize('path', ['/api/omaro','/api/omaro/concepts','/api/omaro/concept?uri=http://www.mimo-db.eu/InstrumentsKeywords/2266','/api/omaro/download/ontology-ttl'])
def test_every_reference_route_refuses_empty_duplicate_and_stale_pins(client,snapshot,path):
 pin=json.loads(snapshot[0].read_text())['snapshotSha256'];separator='&' if '?' in path else '?'
 for query,status in [('snapshot=',400),('snapshot='+pin+'&snapshot='+pin,400),('snapshot=unavailable',409)]:
  response=client.get(path+separator+query)
  assert response.status_code==status and response.headers['Cache-Control']=='no-store'
 assert client.get(path+separator+'snapshot='+pin).status_code==200


@pytest.mark.parametrize('path', [
 '/api/omaro?q=Organ','/api/omaro/download/ontology-ttl?format=json',
 '/api/omaro/concept?uri=http://www.mimo-db.eu/InstrumentsKeywords/2266&q=Organ',
 '/api/omaro/concept?uri=http://www.mimo-db.eu/InstrumentsKeywords/2266&language=de',
 '/api/omaro/concepts?collection=ontology&language=en',
 '/api/omaro/concepts?collection=ontology&resolution=resolved',
 '/api/omaro/concepts?soruce=mimo','/api/omaro/concepts?q=Organ&q=Organ',
 '/api/omaro/concepts?limit=10&limit=20','/api/omaro/concepts?collection=hs&collection=instruments',
 '/api/omaro/concepts?language=de&language=de',
])
def test_reference_routes_reject_unknown_duplicate_and_inactive_operands(client,path):
 assert client.get(path).status_code==400


@pytest.mark.parametrize('query', ['limit=0','limit=101','limit=','limit=2.5','offset=-1','offset=100001','offset=%2B1','offset=','language=xx','language=','resolution=all','collection='])
def test_reference_search_bounds_and_enums_are_explicit(client,query):
 assert client.get('/api/omaro/concepts?'+query).status_code==400


def test_reference_search_retains_multilingual_identity_literal_matching_and_pages(client,snapshot):
 pin=json.loads(snapshot[0].read_text())['snapshotSha256'];uri=snapshot[1]
 result=client.get('/api/omaro/concepts',query_string={'q':'ORGEL','language':'fr','resolution':'resolved','snapshot':pin,'offset':'0','limit':'1'})
 assert result.status_code==200 and result.json['total']==1
 assert result.json['items'][0]['uri']==uri and result.json['items'][0]['label']=='Orgue'
 assert result.json['snapshotSha256']==pin
 assert client.get('/api/omaro/concepts',query_string={'q':'%_'}).json['total']==0
 assert client.get('/api/omaro/concepts',query_string={'q':'x'*200}).status_code==200
 assert client.get('/api/omaro/concepts',query_string={'q':'x'*201}).status_code==400
 assert client.get('/api/omaro/concepts',query_string={'q':'Organ\n'}).status_code==400
 first=client.get('/api/omaro/concepts?limit=1').json;second=client.get('/api/omaro/concepts?limit=1&offset=1').json
 assert first['total']==second['total']==2 and first['hasMore'] and not second['hasMore']


@pytest.mark.parametrize('uri', ['', 'relative', '/local/path','javascript:alert(1)','http://','https://user:secret@example.org/x','https://example.org/a b','https://example.org/a%wrong','https://example.org/'+('a'*2048)])
def test_reference_detail_requires_a_bounded_exact_absolute_uri(client,uri):
 assert client.get('/api/omaro/concept',query_string={'uri':uri}).status_code==400
 assert client.get('/api/omaro/concept').status_code==400


def test_reference_detail_duplicate_uri_is_refused_and_original_downloads_keep_fixity(client,snapshot):
 uri=snapshot[1];pin=json.loads(snapshot[0].read_text())['snapshotSha256']
 assert client.get('/api/omaro/concept',query_string=[('uri',uri),('uri',uri)]).status_code==400
 response=client.get('/api/omaro/download/ontology-ttl',query_string={'snapshot':pin})
 expected=(snapshot[0].parent/'ontology.ttl').read_bytes()
 assert response.data==expected and response.headers['ETag'].strip('"')==hashlib.sha256(expected).hexdigest()
 assert client.head('/api/omaro/download/ontology-ttl',query_string={'snapshot':pin}).headers['ETag']==response.headers['ETag']
 assert client.get('/api/omaro/download/ontology-ttl',query_string={'snapshot':pin},headers={'If-None-Match':response.headers['ETag']}).status_code==304


def test_legacy_pins_preserve_snapshot_and_downloads_with_independent_health(snapshot, monkeypatch):
    current_manifest, uri, _ = snapshot
    current_meta = json.loads(current_manifest.read_text())
    legacy_root = current_manifest.parent / 'legacy'
    legacy_root.mkdir()
    shutil.copyfile(current_manifest.parent / 'reference.sqlite', legacy_root / 'reference.sqlite')
    legacy_export = legacy_root / 'ontology.ttl'
    legacy_bytes = b'<urn:legacy> <urn:predicate> <urn:object> .\n'
    legacy_export.write_bytes(legacy_bytes)
    legacy_meta = {**current_meta, 'datasetVersion': '1.0.0', 'exports': {
        'ontology-ttl': {'file': legacy_export.name, 'bytes': len(legacy_bytes),
                         'sha256': digest(legacy_export), 'mediaType': 'text/turtle'},
    }}
    legacy_meta.pop('snapshotSha256')
    legacy_meta['snapshotSha256'] = hashlib.sha256(canonical(legacy_meta).encode()).hexdigest()
    legacy_manifest = legacy_root / 'manifest.json'
    legacy_manifest.write_text(json.dumps(legacy_meta))
    monkeypatch.setenv('NAVIGATOR_OMARO_MANIFEST', str(current_manifest))
    monkeypatch.setenv('NAVIGATOR_OMARO_LEGACY_MANIFEST', str(legacy_manifest))
    app = Flask(__name__)
    register_omaro(app)
    health = register_capability_health(app, None, SimpleNamespace(), {})
    client = app.test_client()
    legacy_pin = {'snapshot': legacy_meta['snapshotSha256']}
    assert client.get('/api/omaro').json == current_meta
    assert client.get('/api/omaro', query_string=legacy_pin).json == legacy_meta
    assert client.get('/api/omaro/concepts', query_string=legacy_pin).json['snapshotSha256'] == legacy_pin['snapshot']
    assert client.get('/api/omaro/concept', query_string={**legacy_pin, 'uri': uri}).json['snapshotSha256'] == legacy_pin['snapshot']
    downloaded = client.get('/api/omaro/download/ontology-ttl', query_string=legacy_pin)
    assert downloaded.data == legacy_bytes
    assert downloaded.headers['ETag'].strip('"') == digest(legacy_export)
    assert client.head('/api/omaro/download/ontology-ttl', query_string=legacy_pin).headers['ETag'] == downloaded.headers['ETag']
    assert client.get('/api/omaro/download/ontology-ttl', query_string=legacy_pin,
                      headers={'If-None-Match': downloaded.headers['ETag']}).status_code == 304
    assert client.get('/api/omaro', query_string=[('snapshot', legacy_pin['snapshot']),
                                               ('snapshot', current_meta['snapshotSha256'])]).status_code == 400

    legacy_export.write_text('changed legacy bytes')
    assert health.resource_state('legacyVocabularyReference')['reason'] == 'resource_changed'
    assert client.get('/api/omaro', query_string=legacy_pin).status_code == 503
    assert client.get('/api/omaro/download/ontology-ttl', query_string=legacy_pin).status_code == 503
    assert client.get('/api/omaro').json == current_meta
    assert client.get('/api/omaro?snapshot=unknown').status_code == 409
