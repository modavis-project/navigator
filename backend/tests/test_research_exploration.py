import hashlib,json,sqlite3
from pathlib import Path
from contextlib import contextmanager
from types import SimpleNamespace
import pytest
from flask import Flask
from navigator_app.research_exploration import Exploration,distribution,network,csv_distribution,register_exploration
from navigator_app.vocabulary_usage import register_vocabulary_usage
from navigator_app.exploration_policy import bucket_sql
from tools.build_research_exploration import build,sha

@pytest.fixture
def work(tmp_path):
    index=tmp_path/'work.sqlite';c=sqlite3.connect(index);c.row_factory=sqlite3.Row
    c.executescript('''create table term_occurrence(id text,kind text,organ text,source text,source_key text,description text,label text,search text,pitch text,division text,country text,year integer,date_kind text,concept text,source_path text);create index term_kind_name on term_occurrence(kind,search,id);
    attach ':memory:' as research;
    create table research.actor(id text primary key,label text,kind text,organ_count integer);
    create table research.event(id text primary key,organ text,source text,kind text,eligible integer,start integer,end integer,payload text);
    create table research.participant(actor text,event text,primary key(actor,event));
    create table research.neighbor(actor text,other text,shared integer,joint integer,audit text);
    ''')
    for id,word,account,source,country,year,kind in [('1','Vox Humana','a','one','DE',1750,'year'),('2','vox humana','a','one','DE',1750,'year'),('3','Vox Humana 8','b','one','DE',1700,'century'),('4','Principal','c','two','FR',None,'source_listing')]:
        c.execute('insert into term_occurrence values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',(id,'stops','O',source,source,account,word,word.casefold(),'8','Swell',country,year,kind,None,'path'))
    c.execute('insert into term_occurrence values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',('e','activities','O','one','one',None,'Dankesbrief','dankesbrief',None,None,'DE',1800,'year',None,'path'))
    for id in ['A','B','C']:c.execute('insert into research.actor values (?,?,?,?)',('MDVS:ENTY:'+id,id,'person',1))
    for id,year,actors,eligible in [('a',1700,['A'],1),('joint',1720,['A','B'],1),('b',1750,['B'],1),('c',1780,['C'],1),('bad',1800,['B'],0),('unknown',None,['B'],1)]:
        c.execute('insert into research.event values (?,?,?,?,?,?,?,?)',(id,'O','one','construction',eligible,year,year,'{}'))
        for a in actors:c.execute('insert into research.participant values (?,?)',('MDVS:ENTY:'+a,id))
    c.execute("insert into research.neighbor values('MDVS:ENTY:A','MDVS:ENTY:B',1,1,'unresolved')");c.commit()
    m={'core':{'sha256':'core'},'index':{'path':str(index),'sha256':sha(index)},'identities':{'sha256':'identity'}};mp=tmp_path/'work-manifest.json';mp.write_text(json.dumps(m));out=tmp_path/'analysis';build(mp,out)
    @contextmanager
    def connect(*args,**kwargs):yield c
    w=SimpleNamespace(index=index,manifest=m,connect=connect,assert_binding=lambda:None,research=SimpleNamespace(manifest={'files':{'research.sqlite':{'sha256':'research'}}}),identities={'groups':[{'nativeId':'cohort','actors':[{'mdvs_id':'MDVS:ENTY:A'}],'remaining':'Workshop scope unresolved'}]})
    yield w,Exploration(out/'manifest.json',w),mp,out;c.close()

def test_distribution_accounts_deduplicate_and_scope(work):
    w,e,_,_=work;d=distribution(w,e,'stops',{'term':'Vox Humana'})
    r=d['items'][0];assert r['matches']['occurrences']==2 and r['matches']['accounts']==1 and r['coverage']['accounts']==2
    assert r['accountPercent']==50 and d['coverage']['accounts']==3 and d['matchingOccurrences']==2
    broad=distribution(w,e,'stops',{'term':'Vox Humana','match':'contains'});assert broad['items'][0]['matches']['accounts']==2
    z=distribution(w,e,'stops',{'term':'Vox Humana','zeros':'yes'});assert len(z['items'])==2 and z['items'][1]['matches']['occurrences']==0
    scoped=distribution(w,e,'stops',{'term':'Vox Humana','source':'two','zeros':'yes'});assert scoped['coverage']['accounts']==1 and scoped['matchingOccurrences']==0

def test_periods_do_not_invent_years_and_events_have_separate_unit(work):
    w,e,_,_=work;d=distribution(w,e,'stops',{'term':'Vox','match':'contains','dimension':'period'})
    assert {r['bucket'] for r in d['items']}=={'y:1750','d:century'}
    a=distribution(w,e,'activities',{'term':'Dankesbrief'});assert a['unit']=='recorded events' and a['items'][0]['accountPercent']==100 and a['items'][0]['coverage']['accounts']==0

def test_exports_are_complete_and_page_independent(work):
    w,e,_,_=work;args={'term':'Vox Humana','zeros':'yes'};d=distribution(w,e,'stops',args);x=distribution(w,e,'stops',{**args,'page':'9'},True)
    assert x['completeSelection'] and x['selectionSha256']==d['selectionSha256'] and len(x['items'])==2
    assert 'selection_sha256' in csv_distribution(x) and 'core' in csv_distribution(x)
    x['items'][0]['label']='=CMD()';assert "'=CMD()" in csv_distribution(x)

@pytest.mark.parametrize('args,exc',[({'snapshot':'old'},RuntimeError),({'analysis':'old'},RuntimeError),({'match':'invented'},ValueError),({'dimension':'unknown'},ValueError),({'zeros':'maybe'},ValueError),({'page':'-1'},ValueError)])
def test_distribution_rejects_invalid_bindings_and_parameters(work,args,exc):
    w,e,_,_=work
    with pytest.raises(exc):distribution(w,e,'stops',{'term':'Vox',**args})

def test_network_layers_and_direction_preserve_evidence(work):
    w,_,_,_=work;shared=network(w,{'actor':'A'});assert shared['items'][0]['weight']==1 and shared['focus']['identityNotes']
    assert 'other=MDVS%3AENTY%3AB' in shared['items'][0]['evidenceHref']
    assert network(w,{'actor':'A','mode':'joint'})['items'][0]['weight']==1
    later=network(w,{'actor':'A','mode':'later'});rows={r['id']:r for r in later['items']}
    assert rows['MDVS:ENTY:B']['weight']==1 and rows['MDVS:ENTY:C']['weight']==2
    assert rows['MDVS:ENTY:B']['from']=='MDVS:ENTY:A'
    earlier=network(w,{'actor':'B','mode':'earlier'});assert earlier['items'][0]['from']=='MDVS:ENTY:A' and earlier['items'][0]['to']=='MDVS:ENTY:B'
    assert network(w,{'actor':'A','mode':'later','page':'99'},True)['selectionSha256']==later['selectionSha256']
    with pytest.raises(RuntimeError):network(w,{'actor':'A','assessment':'other'})
    with pytest.raises(LookupError):network(w,{'actor':'missing'})

def test_build_replays_exactly_and_rejects_changed_bindings(work,tmp_path):
    w,e,m,out=work;other=tmp_path/'replay';build(m,other)
    for name in ['coverage.sqlite','manifest.json']:assert (out/name).read_bytes()==(other/name).read_bytes()
    w.manifest['core']['sha256']='changed'
    with pytest.raises(ValueError):Exploration(out/'manifest.json',w)

def test_new_routes_coexist_and_fail_closed(work,monkeypatch):
    w,e,_,out=work;monkeypatch.setenv('NAVIGATOR_EXPLORATION_MANIFEST',str(out/'manifest.json'));app=Flask(__name__);app.extensions['research_workbench']=w
    register_vocabulary_usage(app);register_exploration(app);c=app.test_client()
    assert c.get('/api/research-exploration/network?actor=A').status_code==200
    assert c.get('/api/research-exploration/terms/stops?term=Vox%20Humana').json['matchingOccurrences']==2
    r=c.get('/api/research-exploration/terms/stops/export?term=Vox%20Humana&format=csv');assert r.status_code==200 and 'attachment' in r.headers['Content-Disposition']
    assert c.get('/api/research-exploration/network?actor=A&snapshot=wrong').status_code==409
    assert c.get('/api/research-exploration/terms/nope?term=x').status_code==404
