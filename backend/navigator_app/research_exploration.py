"""Bounded charts and connection exploration over immutable research evidence."""
import csv,hashlib,io,json,os,sqlite3
from functools import lru_cache
from pathlib import Path
from urllib.parse import urlencode
from flask import request,Response,jsonify
from .exploration_policy import bucket_sql,bucket_label,COUNTS,FAMILIES,POLICY
from .research_workbench import norm,canonical,full_id
from .organological_research import actor_url,digest

MODES={'shared':'Shared organs','joint':'Joint controlled event assertions','later':'Later work by connected actor','earlier':'Earlier work by connected actor'}

def bind(work):
    return {'publicCoreSha256':work.manifest['core']['sha256'],'researchIndexSha256':work.manifest['index']['sha256'],'querySha256':digest(Path(__file__))}

def validate(args,allowed,work):
    if set(args)-set(allowed) or any(len(v)>500 for v in args.values()):raise ValueError('Invalid research parameters')
    if args.get('snapshot') and args['snapshot']!=work.manifest['core']['sha256']:raise RuntimeError('Requested core snapshot is unavailable')
    page=int(args.get('page','0'))
    if not 0<=page<=100000:raise ValueError('Invalid page')
    return page

class Exploration:
    def __init__(self,path,work):
        self.path=Path(path);self.manifest=json.loads(self.path.read_text());self.sha=digest(self.path)
        m=self.manifest
        if m['contract']!='modavis.navigator-research-exploration/v1' or m['coreSha256']!=work.manifest['core']['sha256'] or m['workbenchIndexSha256']!=work.manifest['index']['sha256']:raise ValueError('Exploration inputs differ')
        if m['policySha256']!=digest(Path(__file__).with_name('exploration_policy.py')):raise ValueError('Exploration policy differs')
        self.db=(self.path.parent/m['coverage']['path']).resolve()
        if digest(self.db)!=m['coverage']['sha256']:raise ValueError('Exploration coverage differs')
    def coverage(self,family,source,dimension):
        c=sqlite3.connect(self.db.as_uri()+'?mode=ro&immutable=1',uri=True);c.row_factory=sqlite3.Row
        try:return [dict(r) for r in c.execute('select * from coverage where family=? and scope=? and dimension=? order by bucket',(family,source or '*',dimension))]
        finally:c.close()

@lru_cache(maxsize=96)
def _term_counts(index,core,root,family,term,match,source,dimension):
    # Cache aggregate rows only; scoped evidence remains in the normal usage API.
    import time
    c=sqlite3.connect(Path(index).as_uri()+'?mode=ro&immutable=1',uri=True);c.row_factory=sqlite3.Row
    deadline=time.monotonic()+10;c.set_progress_handler(lambda:int(time.monotonic()>deadline),10000)
    where='kind=? and search'+('=?' if match=='exact' else " like ? escape '\\'")
    key=norm(term) if match=='exact' else '%'+norm(term).replace('\\','\\\\').replace('%','\\%').replace('_','\\_')+'%'
    values=[family,key]
    if source:where+=' and source_key=?';values.append(source)
    try:return [dict(r) for r in c.execute('select '+bucket_sql(dimension)+' bucket,'+COUNTS+' from term_occurrence indexed by term_kind_name where '+where+' group by 1 order by 1',values)]
    finally:c.close()

def distribution(work,explore,family,args,export=False):
    page=validate(args,{'term','match','source','dimension','page','snapshot','analysis','zeros','format'},work)
    if family not in FAMILIES:raise LookupError('Unknown terminology family')
    term=args.get('term','');match=args.get('match','exact');dimension=args.get('dimension','source');source=args.get('source','')
    if not norm(term) or match not in ('exact','contains') or dimension not in ('source','country','period','pitch','division') or (family=='activities' and dimension in ('pitch','division')):raise ValueError('Invalid term, match mode or distribution dimension')
    if args.get('analysis') and args['analysis']!=explore.sha:raise RuntimeError('Requested analysis snapshot is unavailable')
    if args.get('zeros','no') not in ('yes','no'):raise ValueError('Invalid zero-count scope')
    if args.get('format','json') not in ('json','csv'):raise ValueError('Invalid export format')
    matched=_term_counts(str(work.index),work.manifest['core']['sha256'],work.manifest['index']['sha256'],family,term,match,source,dimension)
    denominators={r['bucket']:r for r in explore.coverage(family,source,dimension)}
    if not denominators:raise LookupError('No recorded coverage for this source and family')
    base=explore.coverage(family,source,'all')[0]
    by_bucket={r['bucket']:r for r in matched};rows=[]
    for bucket,den in denominators.items():
        x=by_bucket.get(bucket,dict.fromkeys(['occurrences','organs','sourceRecords','accounts','records'],0))
        if not x['occurrences'] and args.get('zeros','no')=='no':continue
        unit='records' if family=='activities' else 'accounts'
        r={'bucket':bucket,'label':bucket_label(dimension,bucket),'matches':{k:x[k] for k in ['occurrences','organs','sourceRecords','accounts','records']},'coverage':{k:den[k] for k in ['occurrences','organs','sourceRecords','accounts','records']}}
        for k in r['matches']:assert r['matches'][k]<=r['coverage'][k],'Matching count exceeds coverage'
        r['accountPercent']=100*x[unit]/den[unit] if den[unit] else None
        r['occurrencePercent']=100*x['occurrences']/den['occurrences'] if den['occurrences'] else None
        r['href']='/vocab/usage/'+family+'?'+urlencode({'term':term,'match':match,'snapshot':work.manifest['core']['sha256'],'dimension':dimension,'bucket':bucket,**({'source':source} if source else {})})
        rows.append(r)
    rows.sort(key=(lambda x:(not x['bucket'].startswith('y:'),int(x['bucket'][2:]) if x['bucket'].startswith('y:') else 0,x['bucket'])) if dimension=='period' else (lambda x:(-x['matches']['occurrences'],x['bucket'])))
    total=len(rows);offset=page*15
    selection={k:args.get(k,default) for k,default in [('term',term),('match','exact'),('source',''),('dimension','source'),('zeros','no')]}
    identity={**bind(work),'analysisSha256':explore.sha,'policySha256':explore.manifest['policySha256']}
    return {**identity,'family':family,'term':term,'match':match,'dimension':dimension,'source':source,'items':rows if export else rows[offset:offset+15],'total':total,'offset':0 if export else offset,'hasMore':False if export else offset+15<total,'completeSelection':export,'selection':selection,'selectionSha256':hashlib.sha256(canonical({'binding':identity,'selection':selection}).encode()).hexdigest(),'unit':'recorded events' if family=='activities' else 'accounts with recorded '+family+' entries','coverage':{k:base[k] for k in ['occurrences','organs','sourceRecords','accounts','records']},'matchingOccurrences':sum(r['occurrences'] for r in matched),'method':POLICY,'zeroMeaning':'Zero matching documentation in this bucket, not absence from an instrument or historical population.'}

def network(work,args,export=False):
    page=validate(args,{'actor','mode','page','snapshot','assessment','format'},work);identifier=full_id(args.get('actor',''));mode=args.get('mode','shared')
    if mode not in MODES:raise ValueError('Invalid connection type')
    if args.get('format','json')!='json':raise ValueError('Network exports use JSON')
    assessment=work.manifest.get('identities',{}).get('sha256')
    if args.get('assessment') and args['assessment']!=assessment:raise RuntimeError('Requested identity assessment is unavailable')
    with work.connect(10) as c:
        focus=c.execute('select * from research.actor where id=?',(identifier,)).fetchone()
        if not focus:raise LookupError('Actor not found')
        if mode in ('shared','joint'):
            field=mode;rows=[dict(r) for r in c.execute('select a.id,a.label,a.kind,n.shared,n.joint,n.audit,n.'+field+' weight from research.neighbor n join research.actor a on a.id=n.other where n.actor=? and n.'+field+'>0 order by weight desc,a.id',(identifier,))]
        else:
            # Mirrors the accepted sequence definition, with the selected actor
            # excluded from the peer event and the peer excluded from its event.
            relation='a.end<b.start' if mode=='later' else 'b.end<a.start'
            sql='''select z.id,z.label,z.kind,count(*) weight,count(distinct a.organ) organs
                from research.participant p join research.event a on a.id=p.event
                join research.event b on b.organ=a.organ and '''+relation+'''
                join research.participant q on q.event=b.id join research.actor z on z.id=q.actor
                where p.actor=? and q.actor!=? and a.eligible=1 and b.eligible=1
                and not exists(select 1 from research.participant x where x.actor=? and x.event=b.id)
                and not exists(select 1 from research.participant y where y.actor=q.actor and y.event=a.id)
                group by z.id order by weight desc,z.id'''
            rows=[dict(r) for r in c.execute(sql,[identifier]*3)]
        if export and len(rows)>5000:raise OverflowError('More than 5,000 connections; choose another focal actor. No partial export was produced.')
        actor=dict(focus);actor['href']=actor_url(identifier,actor['kind'])
        notes={}
        for group in getattr(work,'identities',{}).get('groups',[]):
            for a in group.get('actors',[]):notes.setdefault(a['mdvs_id'],[]).append({'cohort':group['nativeId'],'finding':group.get('finding'),'remaining':group.get('remaining')})
        actor['identityNotes']=notes.get(identifier,[])
        for r in rows:
            r['href']=actor_url(r['id'],r['kind']);r['identityNotes']=notes.get(r['id'],[])
            left,right=(r['id'],identifier) if mode=='earlier' else (identifier,r['id'])
            r['from']=left;r['to']=right;r['directed']=mode in ('earlier','later')
            section='organs' if mode=='shared' else 'events' if mode=='joint' else 'sequences'
            r['evidenceHref']='/use-cases/research-workbench?'+urlencode({'view':'selection','section':section,'actor':left,'other':right,'snapshot':work.manifest['core']['sha256']})
            r['exploreHref']='/use-cases/builder-workshop-networks?'+urlencode({'actor':r['id'],'network':'yes','networkMode':mode,'snapshot':work.manifest['core']['sha256'],'assessment':assessment or ''})
        binding={**bind(work),'identityEvidenceSha256':assessment,'connectionIndexSha256':work.research.manifest.get('files',{}).get('research.sqlite',{}).get('sha256')}
        selection={'actor':identifier,'mode':mode}
        return {**binding,'focus':actor,'mode':mode,'title':MODES[mode],'items':rows if export else rows[page*8:page*8+8],'total':len(rows),'offset':0 if export else page*8,'hasMore':False if export else (page+1)*8<len(rows),'completeSelection':export,'selectionSha256':hashlib.sha256(canonical({'binding':binding,'selection':selection}).encode()).hexdigest(),'method':'Counts include all retained attributions, including unresolved and unassessed identities. Shared organs are catalogue associations; joint counts are controlled source event assertions; directed counts are strictly ordered non-overlapping pairs of eligible event assertions on one organ, excluding actors jointly present in either event. None establishes collaboration, apprenticeship, family ties, company succession or continuity of physical fabric. Source assertions can repeat historical events.'}

def csv_distribution(data):
    out=io.StringIO();w=csv.writer(out);w.writerow(['bucket','label','matching_occurrences','coverage_occurrences','matching_accounts','coverage_accounts','matching_events_or_records','coverage_events_or_records','matching_organs','coverage_organs','account_or_event_percent','occurrence_percent','evidence_url','selection_sha256','core_sha256','analysis_sha256'])
    def safe(x):return "'"+x if isinstance(x,str) and x.lstrip().startswith(('=','+','-','@')) else x
    for r in data['items']:
        w.writerow([safe(x) for x in [r['bucket'],r['label'],r['matches']['occurrences'],r['coverage']['occurrences'],r['matches']['accounts'],r['coverage']['accounts'],r['matches']['records'],r['coverage']['records'],r['matches']['organs'],r['coverage']['organs'],r['accountPercent'],r['occurrencePercent'],'https://navigator.modavis.org'+r['href'],data['selectionSha256'],data['publicCoreSha256'],data['analysisSha256']]])
    return out.getvalue()

def register_exploration(app):
    work=app.extensions.get('research_workbench');explore=None
    path=os.environ.get('NAVIGATOR_EXPLORATION_MANIFEST')
    if path and work:
        try:explore=Exploration(path,work)
        except Exception:app.logger.exception('Research exploration binding failed')
    @lru_cache(maxsize=96)
    def cached(kind,family,args):
        return canonical(distribution(work,explore,family,dict(args)) if kind=='terms' else network(work,dict(args)))
    @app.get('/api/research-exploration/terms/<family>')
    @app.get('/api/research-exploration/terms/<family>/export')
    @app.get('/api/research-exploration/network',defaults={'family':None},endpoint='exploration_network')
    @app.get('/api/research-exploration/network/export',defaults={'family':None},endpoint='exploration_network_export')
    def research_exploration_route(family):
        if not work or (family and not explore):return jsonify({'error':'Research exploration is unavailable for this snapshot'}),503
        try:
            work.assert_binding();args=dict(request.args);export=request.path.endswith('/export')
            if export:
                data=distribution(work,explore,family,args,True) if family else network(work,args,True)
                csv_mode=args.get('format')=='csv';body=csv_distribution(data) if csv_mode else canonical(data)+'\n'
            else:body=cached('terms' if family else 'network',family,tuple(sorted(args.items())));csv_mode=False
            r=Response(body,mimetype='text/csv' if csv_mode else 'application/json');r.headers['Cache-Control']='private, max-age=60'
            if export:r.headers['Content-Disposition']='attachment; filename="modavis-research-exploration.'+('csv' if csv_mode else 'json')+'"'
            return r
        except LookupError as e:return jsonify({'error':str(e)}),404
        except RuntimeError as e:return jsonify({'error':str(e)}),409
        except OverflowError as e:return jsonify({'error':str(e)}),422
        except (ValueError,TypeError) as e:return jsonify({'error':str(e)}),400
        except sqlite3.OperationalError:return jsonify({'error':'Research query exceeded its budget. Choose a narrower term/source or another focal actor; no partial results were returned.'}),503
