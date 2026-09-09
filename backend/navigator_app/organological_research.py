"""Read-only, bounded research delivery; no runtime extraction or identity matching."""
from __future__ import annotations
import hashlib,json,os,sqlite3,time
from contextlib import contextmanager
from pathlib import Path
from urllib.parse import quote
from flask import jsonify,request,send_file

CONTRACT='modavis.organological-research/v1'

def digest(path):
    h=hashlib.sha256()
    with path.open('rb') as f:
        for b in iter(lambda:f.read(8*1024**2),b''):h.update(b)
    return h.hexdigest()

def actor_url(identifier,kind):
    return ('/people/' if kind=='person' else '/organizations/')+quote(identifier.removeprefix('MDVS:ENTY:'),safe='')

def organ_url(identifier):return '/organs/'+quote(identifier.removeprefix('MDVS:ENTY:'),safe='')

def page_args():
    try:page=int(request.args.get('page','0'))
    except ValueError:raise ValueError('Invalid page')
    if not 0<=page<=100000:raise ValueError('Invalid page')
    return page*20,request.args.get('q','').strip()[:200]

class ResearchIndex:
    def __init__(self,directory,manifest_path):
        self.root=Path(directory);self.public=Path(manifest_path)
        self.manifest=json.loads((self.root/'manifest.json').read_text())
        if self.manifest.get('contract')!=CONTRACT:raise ValueError('Unsupported research contract')
        self.assert_binding()
        for name in ('research.sqlite','stories.json','stop-names.json','identity-audit.json'):
            if digest(self.root/name)!=self.manifest['files'][name]['sha256']:raise ValueError('Research artifact hash mismatch')
        with self.connect() as c:
            if dict(c.execute('select key,value from metadata'))['publicCoreSha256']!=self.manifest['publicCoreSha256']:raise ValueError('Research database binding mismatch')

    def assert_binding(self):
        current=json.loads(self.public.read_text()).get('sourcePublicCore',{}).get('sha256')
        if current!=self.manifest['publicCoreSha256']:raise ValueError('Research snapshot differs from selected public core')

    @contextmanager
    def connect(self):
        c=sqlite3.connect((self.root/'research.sqlite').resolve().as_uri()+'?mode=ro&immutable=1',uri=True)
        c.row_factory=sqlite3.Row;c.execute('pragma query_only=on')
        deadline=time.monotonic()+5
        c.set_progress_handler(lambda: int(time.monotonic()>deadline),10000)
        try: yield c
        finally: c.close()

    def context(self):
        return {k:self.manifest[k] for k in ('contract','publicCoreSha256','sourceReleaseVersion','releaseVersion','generatedAt','coverage','policySha256')}

    def actor(self,c,identifier):
        if not identifier.startswith('MDVS:ENTY:'):identifier='MDVS:ENTY:'+identifier
        row=c.execute('select * from actor where id=?',(identifier,)).fetchone()
        if not row:return None
        result=dict(row);result['href']=actor_url(row['id'],row['kind'])
        result['eventCount']=c.execute('select count(*) from participant where actor=?',(identifier,)).fetchone()[0]
        result['neighborCount']=c.execute('select count(*) from neighbor where actor=?',(identifier,)).fetchone()[0]
        result['sourceCount']=c.execute('select count(distinct source) from assertion where actor=?',(identifier,)).fetchone()[0]
        return result

    def collection(self,c,identifier,section,offset,q,other):
        base={'actorId':identifier,'publicCoreSha256':self.manifest['publicCoreSha256'],'offset':offset,'limit':20}
        if section=='neighbors':
            where='n.actor=? and (a.label like ? or a.id like ?)';params=[identifier,'%'+q+'%','%'+q+'%']
            total=c.execute('select count(*) from neighbor n join actor a on a.id=n.other where '+where,params).fetchone()[0]
            items=[{**dict(r),'href':actor_url(r['id'],r['kind'])} for r in c.execute('select a.id,a.label,a.kind,n.shared,n.joint,n.audit from neighbor n join actor a on a.id=n.other where '+where+' order by n.shared desc,n.joint desc,n.other limit 20 offset ?',params+[offset])]
        elif section=='organs':
            where='a.actor=? and (o.label like ? or o.id like ?)';params=[identifier,'%'+q+'%','%'+q+'%']
            if other:where+=' and exists(select 1 from association b where b.actor=? and b.organ=a.organ)';params.append(other)
            total=c.execute('select count(*) from association a join organ o on o.id=a.organ where '+where,params).fetchone()[0]
            items=[]
            for r in c.execute('select o.* from association a join organ o on o.id=a.organ where '+where+' order by o.label,o.id limit 20 offset ?',params+[offset]):
                item=dict(r);item['href']=organ_url(r['id'])
                ids=[identifier]+([other] if other else [])
                item['assertions']=[json.loads(x[0]) for x in c.execute('select payload from assertion where organ=? and actor in ('+','.join('?' for _ in ids)+') order by actor,id',[r['id']]+ids)]
                item['locations']=[{'source':x[0],'label':x[1]} for x in c.execute('select source,label from location where organ=? order by source,label',(r['id'],))]
                items.append(item)
        elif section=='events':
            where='p.actor=? and (o.label like ? or e.kind like ? or e.id like ?)';params=[identifier,'%'+q+'%','%'+q+'%','%'+q+'%']
            # Selected peer means joint participation only; chronological comparison is a separate view.
            if other:where+=' and e.eligible=1 and exists(select 1 from participant b where b.actor=? and b.event=e.id)';params.append(other)
            join=' from participant p join event e on e.id=p.event join organ o on o.id=e.organ where '+where
            total=c.execute('select count(*)'+join,params).fetchone()[0]
            items=[]
            for r in c.execute('select e.*,o.label organLabel'+join+' order by e.start is null,e.start,e.id limit 20 offset ?',params+[offset]):
                item=json.loads(r['payload']);item['organLabel']=r['organLabel'];item['href']='/events/'+quote(r['id'],safe='');item['organHref']=organ_url(r['organ']);item['orderedDateEligible']=r['start'] is not None;items.append(item)
        elif section=='configurations':
            where='exists(select 1 from assertion a where a.actor=? and a.organ=d.organ and a.source=d.source) and (o.label like ? or d.payload like ?)';params=[identifier,'%'+q+'%','%'+q+'%']
            join=' from configuration d join organ o on o.id=d.organ where '+where
            total=c.execute('select count(*)'+join,params).fetchone()[0]
            items=[]
            for r in c.execute('select d.*,o.label organLabel'+join+' order by d.year is null,d.year,d.id limit 20 offset ?',params+[offset]):
                item=json.loads(r['payload']);item['organLabel']=r['organLabel'];item['href']=organ_url(r['organ'])+'?tab=specification&description='+quote(r['id'],safe='');item['apiUrl']='/api/organs/'+quote(r['organ'],safe='')+'/specification-descriptions/'+quote(r['id'],safe='');items.append(item)
        elif section=='sequences':
            if not other:raise ValueError('Select another builder for dated intervention comparison')
            # EXISTS prevents participant duplicates from multiplying event pairs.
            join=''' from event a join event b on a.organ=b.organ and a.end<b.start
              join organ o on o.id=a.organ where a.eligible=1 and b.eligible=1
              and exists(select 1 from participant x where x.actor=? and x.event=a.id)
              and exists(select 1 from participant y where y.actor=? and y.event=b.id)
              and not exists(select 1 from participant x where x.actor=? and x.event=a.id)
              and not exists(select 1 from participant y where y.actor=? and y.event=b.id)
              and (o.label like ? or o.id like ?)'''
            params=[identifier,other,other,identifier,'%'+q+'%','%'+q+'%']
            total=c.execute('select count(*)'+join,params).fetchone()[0]
            items=[{'organLabel':r['label'],'organHref':organ_url(r['organ']),'earlier':json.loads(r['ap']),'later':json.loads(r['bp'])} for r in c.execute('select o.label,a.organ,a.payload ap,b.payload bp'+join+' order by a.end,b.start,a.id,b.id limit 20 offset ?',params+[offset])]
        else:raise ValueError('Unknown research section')
        return {**base,'items':items,'total':total,'hasMore':offset+len(items)<total}

def register_research(app,settings,repository=None):
    directory=os.environ.get('NAVIGATOR_RESEARCH_INDEX')
    index=None;failure=None
    if directory:
        try:
            index=ResearchIndex(directory,settings.public_database_manifest_path)
            if repository is not None and repository._metadata().get('public_core_sqlite_sha256')!=index.manifest['publicCoreSha256']:
                raise ValueError('Research index differs from imported database')
        except (ValueError,OSError,KeyError) as exc:
            failure=str(exc);index=None
            app.logger.error('Research index rejected: %s',failure)
    app.extensions['organological_research']=index

    @app.get('/api/research/<path:path>')
    def research(path):
        if index is None:return jsonify({'error':'Research index unavailable','configured':bool(directory)}),503
        try:
            index.assert_binding()
            if path=='context':return jsonify(index.context())
            files={'stories':'stories.json','stop-names/download':'stop-names.json','identity-audit':'identity-audit.json'}
            if path in files:
                return send_file(index.root/files[path],mimetype='application/json',conditional=True,etag=index.manifest['files'][files[path]]['sha256'])
            offset,q=page_args()
            with index.connect() as c:
                if path=='stop-names':
                    country=request.args.get('country','')[:100]
                    join=' from stop_name s';params=[];measure='s.count'
                    if country:
                        join+=' join stop_country r on r.id=s.id and r.country=?';params.append(country);measure='r.count'
                    join+=' where s.search like ?';params.append('%'+q.casefold()+'%')
                    total=c.execute('select count(*)'+join,params).fetchone()[0]
                    rows=[json.loads(r[0]) for r in c.execute('select s.payload'+join+' order by '+measure+' desc,s.id limit 20 offset ?',params+[offset])]
                    return jsonify({'items':rows,'total':total,'offset':offset,'hasMore':offset+len(rows)<total,'publicCoreSha256':index.manifest['publicCoreSha256']})
                if path=='actors':
                    total=c.execute('select count(*) from actor where label like ? or id like ?',('%'+q+'%','%'+q+'%')).fetchone()[0]
                    rows=[dict(r) for r in c.execute('select * from actor where label like ? or id like ? order by organ_count desc,id limit 20 offset ?',('%'+q+'%','%'+q+'%',offset))]
                    return jsonify({'items':rows,'total':total,'offset':offset,'hasMore':offset+len(rows)<total,'publicCoreSha256':index.manifest['publicCoreSha256']})
                parts=path.split('/')
                if len(parts) in (2,3) and parts[0]=='actors':
                    actor=index.actor(c,parts[1])
                    if not actor:return jsonify({'error':'Actor not found'}),404
                    if len(parts)==2:return jsonify({'actor':actor,**index.context()})
                    other=request.args.get('other')
                    if other and not other.startswith('MDVS:ENTY:'):other='MDVS:ENTY:'+other
                    return jsonify(index.collection(c,actor['id'],parts[2],offset,q,other))
                return jsonify({'error':'Research route not found'}),404
        except sqlite3.OperationalError:
            return jsonify({'error':'Research query exceeded its execution budget; narrow the selection.'}),503
        except ValueError as exc:
            if 'snapshot' in str(exc):return jsonify({'error':'Research snapshot does not match the selected data'}),503
            return jsonify({'error':str(exc)}),400
