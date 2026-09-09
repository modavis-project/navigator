import json,sqlite3
from contextlib import contextmanager
from types import SimpleNamespace
import pytest
from flask import Flask
from navigator_app.vocabulary_usage import usage,register_vocabulary_usage

@pytest.fixture
def work():
 c=sqlite3.connect(':memory:');c.row_factory=sqlite3.Row
 c.executescript("""attach ':memory:' as core;attach ':memory:' as research;
 create table term_occurrence(id text,kind text,organ text,source text,source_key text,description text,label text,search text,pitch text,division text,country text,year int,date_kind text,concept text,source_path text);
 create index term_kind_name on term_occurrence(kind,search,id);
 create table core.vocabulary_concept(concept_code text,mdvs_id text,payload_json text,scheme_code text);
 create table core.source_membership(source_record_id text,source_url text,source_revision_sha256 text,native_identifier text);
 create table research.organ(id text,label text);
 insert into research.organ values('MDVS:ENTY:O','Test organ');
 insert into core.source_membership values('sr:a','https://example.org/source','source-hash','native');
 """)
 for i,label in enumerate(['Vox Humana','vox   humana','Vox Humana 8′','Vox HumanA','%_','Dankesbrief']):
  c.execute('insert into term_occurrence values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',(str(i),'activities' if i==5 else 'stops','MDVS:ENTY:O','sr:a','test','account:'+str(i),label,' '.join(label.casefold().split()),'8','Swell','DE',None,'source_listing',None,'source.stops'))
 @contextmanager
 def connect(*a,**kw):yield c
 w=SimpleNamespace(manifest={'core':{'sha256':'core'},'index':{'sha256':'index'}},connect=connect,assert_binding=lambda:None)
 yield w;c.close()

def test_exact_wording_preserves_accounts_and_variants(work):
 d=usage(work,'stops',{'term':'Vox Humana'})
 assert d['counts']=={'occurrences':3,'organs':1,'sourceRecords':1,'accounts':3,'wordings':3}
 assert {x['label'] for x in d['items']}=={'Vox Humana','vox   humana','Vox HumanA'}
 assert all(x['sourceEvidence']['source_revision_sha256']=='source-hash' for x in d['items'])
 assert d['canonicalConceptInferred'] is False and d['mappings'][0]['status']=='unmapped'
 assert usage(work,'stops',{'term':'Vox Humana','match':'contains'})['counts']['occurrences']==4
 assert len(usage(work,'stops',{'term':'Vox Humana','section':'organs'})['items'])==1

def test_search_escapes_wildcards_and_no_partial_export(work):
 assert usage(work,'stops',{'q':'%_'})['total']==1
 d=usage(work,'stops',{'term':'Vox Humana'});export=usage(work,'stops',{'term':'Vox Humana','page':'3','section':'organs'},True)
 assert export['selectionSha256']==d['selectionSha256'] and export['completeSelection'] and len(export['items'])==3
 assert usage(work,'activities',{'term':'Dankesbrief'})['items'][0]['href']=='/events/5'

@pytest.mark.parametrize('args,exception',[({'snapshot':'other'},RuntimeError),({'match':'bad'},ValueError),({'section':'bad'},ValueError),({'page':'-1'},ValueError),({'term':''},ValueError),({'q':'x','term':'y'},ValueError),({'unsupported':'x'},ValueError),({'term':'absent'},LookupError)])
def test_rejects_invalid_and_unavailable_selections(work,args,exception):
 with pytest.raises(exception):usage(work,'stops',args)

def test_public_routes_bind_snapshot_and_export(work):
 a=Flask(__name__);a.extensions['research_workbench']=work;register_vocabulary_usage(a);client=a.test_client()
 assert client.get('/api/vocab/usage/stops?term=Vox%20Humana').json['counts']['occurrences']==3
 assert client.get('/api/vocab/usage/stops?term=Vox%20Humana&snapshot=other').status_code==409
 assert client.get('/api/vocab/usage/unknown').status_code==404
 r=client.get('/api/vocab/usage/stops/export?term=Vox%20Humana');assert r.json['completeSelection'] and 'attachment' in r.headers['Content-Disposition']

def test_source_scope_and_search_order_do_not_merge_other_wordings(work):
 assert usage(work,'stops',{'q':'Vox Humana'})['items'][0]['key']=='vox humana'
 d=usage(work,'stops',{'term':'Vox Humana','source':'test'})
 assert d['counts']['occurrences']==3 and 'source=test' in d['href']
 assert d['selectionSha256']!=usage(work,'stops',{'term':'Vox Humana'})['selectionSha256']
 assert usage(work,'stops',{'q':'Vox','source':'absent'})['total']==0

def test_export_budget_rejects_entire_selection(work,monkeypatch):
 import navigator_app.vocabulary_usage as mod
 monkeypatch.setattr(mod,'EXPORT_LIMIT',2)
 with pytest.raises(OverflowError):usage(work,'stops',{'term':'Vox Humana'},True)

def test_distribution_group_drilldown_preserves_exact_scope(work):
 d=usage(work,'stops',{'term':'Vox Humana','source':'test','dimension':'country','bucket':'v:DE'})
 assert d['counts']['occurrences']==3 and 'dimension=country' in d['href'] and 'groupingPolicySha256' in d
 assert d['selectionSha256']!=usage(work,'stops',{'term':'Vox Humana'})['selectionSha256']
 with pytest.raises(LookupError):usage(work,'stops',{'term':'Vox Humana','dimension':'period','bucket':'y:1700'})
 assert usage(work,'stops',{'term':'Vox Humana','dimension':'period','bucket':'d:source_listing'})['counts']['occurrences']==3
 with pytest.raises(ValueError):usage(work,'stops',{'dimension':'country','bucket':'v:DE'})


def test_organ_search_is_unicode_literal_and_preserves_selection(work):
 with work.connect() as c:
  c.execute("update research.organ set label='Große Kirche %_ in Köln'")
 args={'term':'Vox Humana','organ_q':'GROSSE  KIRCHE','source':'test','dimension':'country','bucket':'v:DE'}
 d=usage(work,'stops',args)
 assert d['counts']['occurrences']==3 and d['counts']['organs']==1
 assert 'organ_q=' in d['href'] and 'bucket=v%3ADE' in d['href']
 assert d['selectionSha256']==usage(work,'stops',{**args,'organ_q':'große kirche','page':'4'},True)['selectionSha256']
 assert d['selectionSha256']!=usage(work,'stops',{'term':'Vox Humana'})['selectionSha256']
 for query in ['%_', 'KÖLN', 'MDVS:ENTY:O']:
  assert usage(work,'stops',{**args,'organ_q':query})['counts']['organs']==1
 for query in ['absent','%missing',"' OR 1=1 --"]:
  empty=usage(work,'stops',{**args,'organ_q':query})
  assert empty['total']==0 and not empty['hasMore'] and empty['items']==[]
  assert empty['sourceOptions']==d['sourceOptions']
  assert usage(work,'stops',{**args,'organ_q':query},True)['completeSelection']
 with pytest.raises(ValueError):usage(work,'stops',{'organ_q':'Kirche'})


def test_organ_search_precedes_pagination_and_exports_all_accounts(work):
 with work.connect() as c:
  c.execute("insert into research.organ values('MDVS:ENTY:Z','Another organ')")
  for i in range(35):
   c.execute("insert into term_occurrence select ?,kind,'MDVS:ENTY:Z',source,source_key,?,label,search,pitch,division,country,year,date_kind,concept,source_path from term_occurrence where id='0'",(f'z{i:02}',f'zaccount{i}'))
 args={'term':'Vox Humana','organ_q':'another'}
 d=usage(work,'stops',args);second=usage(work,'stops',{**args,'page':'1'})
 assert d['total']==35 and len(d['items'])==30 and d['hasMore']
 assert len(second['items'])==5 and not second['hasMore']
 exported=usage(work,'stops',{**args,'section':'organs','page':'1'},True)
 assert len(exported['items'])==35 and exported['selectionSha256']==d['selectionSha256']==second['selectionSha256']
 assert all(x['organ']=='MDVS:ENTY:Z' for x in exported['items'])
 assert usage(work,'stops',{**args,'section':'organs'})['total']==1
 assert usage(work,'stops',{**args,'bucket':'v:FR','dimension':'country'})['total']==0
