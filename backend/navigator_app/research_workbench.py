"""Reproducible, read-only research over pinned public evidence.

No relationship, identity, synonym or physical-state promotion happens here.
"""
from __future__ import annotations
import csv, hashlib, io, json, os, sqlite3, time
from collections import defaultdict
from contextlib import contextmanager
from pathlib import Path
from urllib.parse import quote
from flask import jsonify, request, Response
from .organological_research import digest, organ_url
from .identity_occurrences import load_assessments, filter_selection, occurrences, event_assessments, METHOD as IDENTITY_METHOD

CONTRACT='modavis.research-workbench/v1'
LIMIT=50
EXPORT_LIMIT=50000

def canonical(x):return json.dumps(x,ensure_ascii=False,sort_keys=True,separators=(',',':'))
def norm(x):return ' '.join(str(x or '').casefold().split())
def full_id(x):return x if x.startswith('MDVS:') else 'MDVS:ENTY:'+x

def account_href(d):return organ_url(d['organ_mdvs_id'])+'?tab=specification&description='+quote(d['description_id'],safe='')

def compare_entries(left,right):
    """Multiset comparison; duplicates and missing division/pitch remain explicit."""
    def flatten(account):
        return [{**e,'division':g.get('label'),'divisionCompass':g.get('compass')} for g in account.get('groups',[]) for e in g.get('entries',[]) if e.get('kind')=='stop']
    a,b=flatten(left),flatten(right);ar,br=defaultdict(list),defaultdict(list)
    def key(e):return (norm(e.get('label') or e.get('wording')),norm(e.get('pitch')),norm(e.get('division')))
    for e in a:ar[key(e)].append(e)
    for e in b:br[key(e)].append(e)
    both=[];onlya=[];onlyb=[];ambiguous=[]
    for k in sorted(ar.keys()|br.keys()):
        x,y=ar[k],br[k]
        if x and y and all(k) and len(x)==len(y)==1:
            both.append({'left':x[0],'right':y[0],'basis':'same case/spacing-normalized label, recorded pitch and division; physical identity unestablished'})
        elif x and y:ambiguous.append({'left':x,'right':y,'reason':'Repeated entries or missing pitch/division; individual correspondence unestablished'})
        else:onlya.extend(x);onlyb.extend(y)
    return {'both':both,'leftOnly':onlya,'rightOnly':onlyb,'ambiguous':ambiguous,'leftEntries':len(a),'rightEntries':len(b),'method':'Literal label, pitch and division after case/spacing normalization only. Different spellings remain separate. Only-in-account does not establish addition, removal or absence from an instrument.'}

class Workbench:
    def __init__(self,manifest,settings,repository,research):
        self.manifest_path=Path(manifest).resolve();self.manifest=json.loads(self.manifest_path.read_text());self.repo=repository;self.research=research;self.public=Path(settings.public_database_manifest_path)
        if self.manifest['contract']!=CONTRACT:raise ValueError('Unsupported workbench contract')
        def artifact(value):
            path=Path(value)
            return (path if path.is_absolute() else self.manifest_path.parent/path).resolve()
        self.core=artifact(self.manifest['core']['path']);self.index=artifact(self.manifest['index']['path'])
        for field in ['core','index','identities']:
            p=artifact(self.manifest[field]['path'])
            if digest(p)!=self.manifest[field]['sha256']:raise ValueError('Workbench artifact hash mismatch')
        self.identities=json.loads(artifact(self.manifest['identities']['path']).read_text());self.query_sha256=digest(Path(__file__))
        if self.identities['publicCoreSha256']!=self.manifest['core']['sha256']:raise ValueError('Identity evidence core mismatch')
        self.occurrence_query_sha256=digest(Path(__file__).with_name('identity_occurrences.py'))
        self.assessments=None
        if self.manifest.get('occurrences'):
            self.assessments=load_assessments(artifact(self.manifest['occurrences']),self.manifest['core']['sha256'],self.manifest['identities']['sha256'])
        self.assert_binding()
        self.facets=dict(self.manifest['facets'])
        # One bounded cold-start scan must not inherit the interactive request deadline.
        with self.connect(budget=120) as c:self.facets['activities']=[r[0] for r in c.execute('select distinct kind from research.event where eligible=1 order by kind')]
    def assert_binding(self):
        expected=self.manifest['core']['sha256']
        if json.loads(self.public.read_text()).get('sourcePublicCore',{}).get('sha256')!=expected or not self.research or self.research.manifest['publicCoreSha256']!=expected:raise ValueError('Workbench snapshot mismatch')
        self.research.assert_binding()
    def binding(self):return {'contract':CONTRACT,'publicCoreSha256':self.manifest['core']['sha256'],'generatedAt':self.manifest['generatedAt'],'policySha256':self.manifest['policySha256'],'generatorSha256':self.manifest['generatorSha256'],'querySha256':getattr(self,'query_sha256','test'),'identityEvidenceSha256':self.manifest.get('identities',{}).get('sha256'),'occurrenceQuerySha256':getattr(self,'occurrence_query_sha256',None),'occurrenceAssessmentSha256':getattr(self,'assessments',None)['assessmentContentSha256'] if getattr(self,'assessments',None) else None,'occurrencePolicySha256':getattr(self,'assessments',{}).get('policySha256') if getattr(self,'assessments',None) else None,'occurrenceProcessorSha256':getattr(self,'assessments',{}).get('generatorSha256') if getattr(self,'assessments',None) else None}
    @contextmanager
    def connect(self,budget=10):
        c=sqlite3.connect(self.index.as_uri()+'?mode=ro&immutable=1',uri=True);c.row_factory=sqlite3.Row
        c.execute('attach database ? as core',(self.core.as_uri()+'?mode=ro&immutable=1',))
        c.execute('attach database ? as research',((self.research.root/'research.sqlite').resolve().as_uri()+'?mode=ro&immutable=1',))
        if getattr(self,'assessments',None):c.execute('attach database ? as assessment',(Path(self.assessments['index']['path']).as_uri()+'?mode=ro&immutable=1',))
        c.execute('pragma query_only=on');deadline=time.monotonic()+budget;c.set_progress_handler(lambda:int(time.monotonic()>deadline),10000)
        try:yield c
        finally:c.close()
    def account(self,c,id,revision=None):
        row=c.execute('select * from core.specification_description where description_id=?',(id,)).fetchone()
        if not row:raise LookupError('Configuration not found')
        d=dict(row)
        if revision and revision!=d['description_revision']:raise RuntimeError('Configuration revision changed')
        result=self.repo.get_organ_specification_description(d['organ_mdvs_id'],id)
        if not result:raise LookupError('Public configuration not available')
        return {'metadata':d,'href':account_href(d),'description':result}
    def selection(self,c,f,export=False):
        section=f.get('section','events');actor=f.get('actor','');other=f.get('other','');oid=f.get('organ','')
        if section not in ['events','configurations','organs','sequences']:raise ValueError('Unknown research section')
        where=[];params=[]
        def add(sql,value):where.append(sql);params.append(value)
        if section=='sequences':
            if not actor or not other:raise ValueError('Select both actors for ordered work')
            # Delegate relation meaning to the accepted query; filter operands explicitly.
            table='research.event e join research.event b on e.organ=b.organ and e.end<b.start join core.organ o on o.mdvs_id=e.organ'
            where += ['e.eligible=1','b.eligible=1']
            for alias,id,notid in [('e',actor,other),('b',other,actor)]:
                add(f'exists(select 1 from research.participant p where p.event={alias}.id and p.actor=?)',full_id(id));add(f'not exists(select 1 from research.participant p where p.event={alias}.id and p.actor=?)',full_id(notid))
            select='e.id,e.organ,o.label,e.payload,b.payload laterPayload';order='e.end,b.start,e.id,b.id'
            sourcecol='e.source';yearcol='e.start';datecol="json_extract(e.payload,'$.dates[0].kind')";organ='e.organ'
        elif section=='events':
            table='work_event e'+(' indexed by sqlite_autoindex_work_event_1' if actor else '')+' join core.organ o on o.mdvs_id=e.organ';select='e.id,e.organ,o.label,e.payload';order='e.start is null,e.start,e.id';sourcecol='e.source';yearcol='e.start';datecol='e.date_kind';organ='e.organ'
            if actor:add('e.id in (select event from research.participant where actor=?)',full_id(actor))
            if other:add('exists(select 1 from research.participant p where p.event=e.id and p.actor=?)',full_id(other));where.append('e.eligible=1')
        elif section=='configurations':
            table='work_configuration e join core.organ o on o.mdvs_id=e.organ';select='e.id,e.organ,o.label,e.payload';order='e.year is null,e.year,e.id';sourcecol='e.source';yearcol='e.year';datecol='e.date_kind';organ='e.organ'
            if actor:add('exists(select 1 from research.assertion a where a.organ=e.organ and a.source=e.source and a.actor=?)',full_id(actor))
            if other:raise ValueError('Actor-pair attribution is not established for configurations; select one actor or an organ')
        else:
            table='core.organ o';select='o.mdvs_id id,o.mdvs_id organ,o.label';order='o.label,o.mdvs_id';organ='o.mdvs_id';sourcecol=None;yearcol=None;datecol=None
            for id in [actor,other]:
                if id:add('exists(select 1 from research.association a where a.organ=o.mdvs_id and a.actor=?)',full_id(id))
        if not actor and not oid and not f.get('source') and not f.get('q'):raise ValueError('Select an actor, organ, source or search text')
        if oid:add(organ+'=?',full_id(oid))
        if f.get('q'):
            add("(o.label like ? escape '\\' or "+organ+" like ? escape '\\')",'%'+f['q'].replace('\\','\\\\').replace('%','\\%').replace('_','\\_')+'%');params.append(params[-1])
        if f.get('source'):
            if sourcecol:add(sourcecol+' in (select source_record_id from core.source_membership where source_key=?)',f['source'])
            else:add('exists(select 1 from core.source_membership s where s.organ_mdvs_id=o.mdvs_id and s.source_key=?)',f['source'])
        if f.get('date'):
            if not datecol:raise ValueError('Date filter applies to events and configurations')
            add(datecol+'=?',f['date'])
        for name,operator in [('from','>='),('to','<=')]:
            if f.get(name):
                y=int(f[name]);
                if not 1<=y<=2100:raise ValueError('Year must be between 1 and 2100')
                if not yearcol:raise ValueError('Year filters apply to dated accounts and events')
                add(yearcol+operator+'?',y)
                if section=='configurations':where.append("e.date_kind in ('year','century')")
        if f.get('from') and f.get('to') and int(f['from'])>int(f['to']):raise ValueError('Start year exceeds end year')
        if f.get('activity'):
            if section not in ['events','sequences']:raise ValueError('Activity filter applies to events')
            add("json_extract(e.payload,'$.controlled_event_type')=?",f['activity']);where.append('e.eligible=1')
        if f.get('role'):
            if section not in ['events','sequences']:raise ValueError('Role filter applies to events')
            sql="exists(select 1 from json_each(e.payload,'$.participants') p where lower(json_extract(p.value,'$.role'))=lower(?)"
            values=[f['role']]
            if actor:sql+=" and json_extract(p.value,'$.targetId')=?";values.append(full_id(actor))
            where.append(sql+')');params+=values
        if f.get('coverage'):
            if section!='configurations':raise ValueError('Coverage filter applies to configurations')
            add('e.coverage=?',f['coverage'])
        if f.get('identity'):
            if not getattr(self,'assessments',None):raise ValueError('Identity occurrence assessments unavailable')
            filter_selection(f,section,actor,other,where,params)
        join=' from '+table+' where '+' and '.join(where or ['1=1']);total=c.execute('select count(*)'+join,params).fetchone()[0]
        offset=int(f.get('page','0'))*LIMIT
        if offset<0 or offset>10000000:raise ValueError('Invalid page')
        if export and total>EXPORT_LIMIT:raise OverflowError(f'{total} records exceed the {EXPORT_LIMIT} record export budget; narrow the selection. No partial export was produced.')
        rows=c.execute('select '+select+join+' order by '+order+' limit ? offset ?',params+[EXPORT_LIMIT if export else LIMIT,0 if export else offset]);items=[]
        for r in rows:
            item=dict(r)
            if 'payload' in item:item['evidence']=json.loads(item.pop('payload'))
            if 'laterPayload' in item:item['later']=json.loads(item.pop('laterPayload'))
            item['organHref']=organ_url(item['organ'])
            if section=='configurations':item['href']=account_href(item['evidence'])
            elif section=='events':item['href']='/events/'+quote(item['id'],safe='')
            else:item['href']=item['organHref']
            if section=='organs':item['sources']=[dict(x) for x in c.execute('select * from core.source_membership where organ_mdvs_id=? order by source_record_id',(item['organ'],))]
            if getattr(self,'assessments',None) and section in ['events','sequences']:
                item['identityOccurrences']=event_assessments(c,item['id'])
                if section=='sequences':item['laterIdentityOccurrences']=event_assessments(c,item['later']['event_id'])
            items.append(item)
        filters={k:v for k,v in sorted(f.items()) if k not in ['page','format'] and v};filters.setdefault('section',section)
        binding=self.binding();selection=hashlib.sha256(canonical({'binding':binding,'filters':filters}).encode()).hexdigest()
        return {**binding,'selectionSha256':selection,'filters':filters,'total':total,'offset':0 if export else offset,'hasMore':False if export else offset+len(items)<total,'completeSelection':export,'items':items,'identityFilterMethod':IDENTITY_METHOD,'identityAssessments':[g for g in getattr(self,'identities',{}).get('groups',[]) if {full_id(x) for x in [actor,other] if x}&set(g['targets'])],'method':'Source assertions, not unique historical events. Configuration association does not establish authorship. Year filters use a recorded start/year for exact/range events and year/century accounts; relative/undated/source-listing accounts are excluded from year-filtered results. Sequence filters apply to the earlier event. Source records do not establish independence.'}
    def timeline(self,c,id):
        oid=full_id(id)
        if not c.execute('select 1 from core.organ where mdvs_id=?',(oid,)).fetchone():raise LookupError('Organ not found')
        events=[json.loads(r[0]) for r in c.execute('select payload from work_event where organ=? order by start is null,start,id',(oid,))]
        accounts=[json.loads(r[0]) for r in c.execute('select payload from work_configuration where organ=? order by year is null,year,id',(oid,))]
        return {**self.binding(),'organId':oid,'events':events,'accounts':accounts,'method':'Events retain every source assertion, including unresolved participants. Account sorting years are not necessarily configuration dates. Relative accounts are connected only through retained event evidence; no event deduplication or physical-state continuity is inferred.'}
    def claims(self,c,id):
        oid=full_id(id);sources=[dict(r) for r in c.execute('select * from core.source_membership where organ_mdvs_id=? order by source_key,source_record_id',(oid,))]
        if not sources:raise LookupError('Organ not found')
        families=defaultdict(list)
        for r in c.execute('select * from core.technical_fact where organ_mdvs_id=? order by family,source_record_id,fact_id',(oid,)):families[r['family']].append(dict(r))
        groups=[]
        for family,rows in families.items():
            values={norm(r['display_value']) for r in rows if r['display_value'] is not None}
            groups.append({'family':family,'comparison':'different reported values; dates and account comparability need inspection' if len(values)>1 else 'matching reported wording; independence and same state not established' if len(rows)>1 else 'one retained assertion','assertions':rows})
        return {**self.binding(),'organId':oid,'sources':sources,'technicalClaims':groups,'builderClaims':[dict(r) for r in c.execute('select * from core.organ_builder_assertion where organ_mdvs_id=? order by source_record_id,assertion_id',(oid,))],'accounts':[json.loads(r[0]) for r in c.execute('select payload from work_configuration where organ=? order by source,id',(oid,))],'events':[json.loads(r[0]) for r in c.execute('select payload from work_event where organ=? order by source,id',(oid,))],'independentCorroboration':'not_established','method':'Compare separately attributed claims on an already accepted organ. Shared values can be copied or describe different dates. Different values are discrepancies for investigation, not automatically contradictions. No records or events are merged.'}
    def terms(self,c,f,export=False):
        mode=f.get('mode','stops');q=f.get('q','');where=[];params=[]
        if mode not in getattr(self,'facets',{}).get('termKinds',['stops','divisions','activities']):raise ValueError('Unknown terminology mode')
        add=lambda s,v:(where.append(s),params.append(v))
        add('kind=?',mode)
        for k,col in [('source','source_key'),('country','country'),('pitch','pitch')]:
            if f.get(k):add(col+'=?',f[k])
        for k,op in [('from','>='),('to','<=')]:
            if f.get(k):
                year=int(f[k]);
                if not 1<=year<=2100:raise ValueError('Invalid year')
                add('year'+op+'?',year);where.append("date_kind in ('year','exact','range','century')")
        if f.get('from') and f.get('to') and int(f['from'])>int(f['to']):raise ValueError('Start year exceeds end year')
        term_table='term_dated' if f.get('from') or f.get('to') else 'term_occurrence'
        base=' where '+' and '.join(where)
        if not any(f.get(k) for k in ['pitch','from','to']):
            denominator=c.execute('select occurrences,sources,organs from term_denominator where kind=? and source_key=? and country=?',(mode,f.get('source',''),f.get('country',''))).fetchone() or (0,0,0)
        else:denominator=c.execute('select count(*),count(distinct source),count(distinct organ) from '+term_table+base,params).fetchone()
        if q:add("search like ? escape '\\'",'%'+norm(q).replace('\\','\\\\').replace('%','\\%').replace('_','\\_')+'%')
        if f.get('concept'):
            target=c.execute('select concept_code,mdvs_id from core.vocabulary_concept where concept_code=? or mdvs_id=?',(f['concept'],f['concept'])).fetchone()
            if not target and self.manifest.get('terminologySeedSha256'):
                seed=c.execute('select id from seed_concept where id=?',(f['concept'],)).fetchone()
                if seed:target=(seed[0],seed[0])
            if not target:raise ValueError('Concept is unavailable in this snapshot')
            where.append('concept in (?,?)');params+=list(target)
        sql=' from '+term_table+' where '+' and '.join(where)
        total=c.execute('select count(*)'+sql,params).fetchone()[0];offset=int(f.get('page','0'))*LIMIT
        if offset<0 or offset>10000000:raise ValueError('Invalid page')
        if export and total>EXPORT_LIMIT:raise OverflowError(f'{total} records exceed the {EXPORT_LIMIT} record export budget; narrow the selection. No partial export was produced.')
        if export:offset=0
        items=[dict(r) for r in c.execute('select *'+sql+' order by search,id limit ? offset ?',params+[EXPORT_LIMIT if export else LIMIT,offset])]
        vocabulary=[dict(r) for r in c.execute('select concept_code,mdvs_id,scheme_code from core.vocabulary_concept')]
        mappings={key:v for v in vocabulary for key in [v['concept_code'],v['mdvs_id']] if key}
        seeds={r[0]:json.loads(r[1]) for r in c.execute('select id,payload from seed_concept')} if self.manifest.get('terminologySeedSha256') else {}
        for x in items:
            mapped=mappings.get(x['concept']);x['conceptHref']=('/vocab/'+quote(mapped['scheme_code'],safe='')+'/concepts/'+quote(mapped['concept_code'],safe='')) if mapped else None
            x['href']=organ_url(x['organ'])+'?tab=specification'+('&description='+quote(x['description'],safe='') if x['description'] else '')
            if mode=='activities':x['href']='/events/'+quote(x['id'],safe='')
            x['terminologyMapping']={'status':'accepted_lexical_mapping' if x['concept'] in seeds else 'retained_controlled_mapping' if mapped else 'unmapped',
                'concept':x['concept'],'conceptLifecycle':'candidate' if x['concept'] in seeds else None,
                'purpose':'source_designation_search','physicalIdentityEstablished':False}
            x['sourceLanguage']=None
            # The core contains the authoritative attribution; the disposable
            # index does not acquire source truth or infer language from names.
            if self.manifest.get('terminologySeedSha256'):
                member=c.execute('select source_url,source_revision_sha256,native_identifier from core.source_membership where source_record_id=?',(x['source'],)).fetchone()
                x['sourceEvidence']=dict(member) if member else None
        concepts=[json.loads(r[0]) for r in c.execute('select payload_json from core.vocabulary_concept order by concept_code')]
        concepts=[x for x in concepts if not q or norm(q) in norm(canonical(x))]
        filters={k:v for k,v in sorted(f.items()) if k not in ['page','format'] and v};filters.setdefault('mode',mode)
        binding={**self.binding(),'terminologySeedSha256':self.manifest.get('terminologySeedSha256')}
        selection=hashlib.sha256(canonical({'binding':binding,'filters':filters}).encode()).hexdigest()
        return {**binding,'selectionSha256':selection,'filters':filters,'completeSelection':export,'total':total,'offset':offset,'hasMore':offset+len(items)<total,'items':items,'concepts':concepts,
            'candidateConcepts':[x for x in seeds.values() if any(m['family']==mode for m in x['mappings'])],
            'denominator':{'occurrences':denominator[0],'sourceRecords':denominator[1],'organs':denominator[2]},
            'method':'Coverage counts source occurrences before wording/concept filtering, within the selected kind, source, country, pitch and period. Main and alternative accounts remain separate observations. Country is the same source current listing location, not historical origin. Language is not inferred. Candidate concepts use accepted exact field-specific lexical rules only: they do not establish synonymy, acoustic equivalence, physical identity or canonical vocabulary approval. Retained transfer accounts remain unmapped. Other concepts retain existing controlled event mappings.'}

def register_workbench(app,settings,repository):
    work=None;path=os.environ.get('NAVIGATOR_WORKBENCH_MANIFEST')
    if path:
        try:work=Workbench(path,settings,repository,app.extensions.get('organological_research'))
        except (ValueError,OSError,KeyError) as e:app.logger.error('Workbench rejected: %s',e)
    app.extensions['research_workbench']=work
    @app.get('/api/workbench/<path:path>')
    def workbench(path):
        if work is None:return jsonify({'error':'Research workbench unavailable or mismatched'}),503
        try:
            work.assert_binding();f={k:v for k,v in request.args.items() if v}
            if any(len(v)>500 for v in f.values()):raise ValueError('Research parameter too long')
            if f.get('snapshot') and f['snapshot']!=work.manifest['core']['sha256']:return jsonify({'error':'Requested research snapshot unavailable'}),409
            expected_assessment=work.binding().get('occurrenceAssessmentSha256')
            if f.get('assessment') and f['assessment']!=expected_assessment:return jsonify({'error':'Requested identity assessment snapshot unavailable'}),409
            if path=='context':return jsonify({**work.binding(),'facets':work.facets,'exportLimit':EXPORT_LIMIT})
            if path=='identities':return jsonify(work.identities)
            with work.connect(20 if path.endswith('/export') else 10) as c:
                if path in ['occurrences','occurrences/export']:
                    if not work.assessments:return jsonify({'error':'Identity occurrence assessments unavailable'}),503
                    result=occurrences(c,f,work.binding(),work.assessments,path.endswith('/export'))
                    if path.endswith('/export'):return Response(canonical(result)+'\n',mimetype='application/json',headers={'Content-Disposition':'attachment; filename=modavis-identity-occurrences.json'})
                    return jsonify(result)
                if path in ['selection','selection/export']:
                    result=work.selection(c,f,path.endswith('/export'))
                    if path.endswith('/export'):
                        if f.get('format','json')=='csv':
                            out=io.StringIO();writer=csv.writer(out);writer.writerow(['selection_sha256','core_sha256','filters_json','id','organ_id','label','evidence_json'])
                            for x in result['items']:
                                def safe(s):return "'"+s if s.lstrip().startswith(('=','+','-','@')) else s
                                writer.writerow([result['selectionSha256'],result['publicCoreSha256'],safe(canonical(result['filters'])),x['id'],x['organ'],safe(x['label']),safe(canonical(x))])
                            return Response(out.getvalue(),mimetype='text/csv',headers={'Content-Disposition':'attachment; filename=modavis-research.csv','X-Selection-SHA256':result['selectionSha256']})
                        return Response(canonical(result)+'\n',mimetype='application/json',headers={'Content-Disposition':'attachment; filename=modavis-research.json'})
                    return jsonify(result)
                if path.startswith('account/'):return jsonify(work.account(c,path[8:],f.get('revision')))
                if path=='compare':
                    if not f.get('left') or not f.get('right') or f['left']==f['right']:raise ValueError('Select two distinct accounts')
                    left=work.account(c,f['left'],f.get('leftRevision'));right=work.account(c,f['right'],f.get('rightRevision'))
                    return jsonify({**work.binding(),'left':left,'right':right,'comparison':compare_entries(left['description'],right['description'])})
                if path.startswith('timeline/'):return jsonify(work.timeline(c,path[9:]))
                if path.startswith('claims/'):return jsonify(work.claims(c,path[7:]))
                if path in ['terms','terms/export']:
                    result=work.terms(c,f,path.endswith('/export'))
                    if path.endswith('/export'):
                        return Response(canonical(result)+'\n',mimetype='application/json',headers={'Content-Disposition':'attachment; filename=modavis-terminology-selection.json'})
                    return jsonify(result)
            return jsonify({'error':'Unknown workbench route'}),404
        except LookupError as e:return jsonify({'error':str(e)}),404
        except RuntimeError as e:return jsonify({'error':str(e)}),409
        except OverflowError as e:return jsonify({'error':str(e)}),422
        except (ValueError,TypeError) as e:return jsonify({'error':str(e)}),400
        except sqlite3.OperationalError:return jsonify({'error':'Research query exceeded its budget. Narrow the filters; no partial export was produced.'}),503
