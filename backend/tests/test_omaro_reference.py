import hashlib,json,sqlite3
from pathlib import Path
import pytest
from flask import Flask
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
 assert client.get('/api/omaro/concept?uri=missing').status_code==404
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
