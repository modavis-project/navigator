"""Version-bound reference browsing; never an instrument-classification writer."""
from pathlib import Path
import hashlib,json,os,sqlite3
from contextlib import contextmanager
from flask import Blueprint,jsonify,request,send_file

NS='https://w3id.org/modavis/omaro#'
def digest(p):
 with p.open('rb') as f:return hashlib.file_digest(f,'sha256').hexdigest()
def canonical(x):return json.dumps(x,ensure_ascii=False,sort_keys=True,separators=(',',':'))
class Omaro:
 def __init__(self,path):
  self.root=Path(path).resolve().parent;self.meta=json.loads(Path(path).read_text());m=dict(self.meta);expected=m.pop('snapshotSha256')
  if m['contract']!='modavis.omaro-reference/v1' or hashlib.sha256(canonical(m).encode()).hexdigest()!=expected:raise ValueError('OMARO manifest mismatch')
  for spec in [m['index'],*m['exports'].values()]:
   p=(self.root/spec['file']).resolve()
   if p.parent!=self.root or digest(p)!=spec['sha256'] or p.stat().st_size!=spec['bytes']:raise ValueError('OMARO artifact mismatch')
  self.db=self.root/m['index']['file']
 @contextmanager
 def connect(self):
  c=sqlite3.connect(self.db.as_uri()+'?mode=ro&immutable=1',uri=True);c.row_factory=sqlite3.Row
  try:yield c
  finally:c.close()
 def search(self,collection,q,language,offset,limit,resolution=''):
  with self.connect() as c:
   if collection=='ontology':
    escaped=q.casefold().replace('\\','\\\\').replace('%','\\%').replace('_','\\_')
    where="WHERE lower(label) LIKE ? ESCAPE '\\' OR lower(uri) LIKE ? ESCAPE '\\' OR lower(definition) LIKE ? ESCAPE '\\'";args=['%'+escaped+'%']*3
    total=c.execute('SELECT count(*) FROM term '+where,args).fetchone()[0]
    rows=[dict(r) for r in c.execute('SELECT uri,label,kind,definition FROM term '+where+' ORDER BY kind,label,uri LIMIT ? OFFSET ?',args+[limit,offset])]
   else:
    conditions=['kind=?'];args=['classification' if collection=='hs' else 'instrument']
    if resolution:conditions.append('resolution=?');args.append(resolution)
    if q:
     escaped=q.casefold().replace('\\','\\\\').replace('%','\\%').replace('_','\\_')
     conditions.append("(uri IN (SELECT uri FROM label WHERE search LIKE ? ESCAPE '\\') OR lower(coalesce(notation,'')) LIKE ? ESCAPE '\\')");args.extend(['%'+escaped+'%']*2)
    where=' WHERE '+' AND '.join(conditions);total=c.execute('SELECT count(*) FROM concept'+where,args).fetchone()[0]
    rows=[dict(r) for r in c.execute('SELECT * FROM concept'+where+' ORDER BY coalesce(notation,label),uri LIMIT ? OFFSET ?',args+[limit,offset])]
    for row in rows:
     translated=c.execute("SELECT label FROM label WHERE uri=? AND language=? AND role='preferred' ORDER BY label LIMIT 1",(row['uri'],language)).fetchone()
     if translated:row['label']=translated[0]
   return {'items':rows,'total':total,'offset':offset,'limit':limit,'hasMore':offset+len(rows)<total,'snapshotSha256':self.meta['snapshotSha256']}
 def detail(self,uri):
  with self.connect() as c:
   term=c.execute('SELECT * FROM term WHERE uri=?',(uri,)).fetchone()
   if term:return {**dict(term),'resourceKind':term['kind'],'kind':'ontology-term','statements':json.loads(term['data']),'snapshotSha256':self.meta['snapshotSha256']}
   concept=c.execute('SELECT * FROM concept WHERE uri=?',(uri,)).fetchone()
   if not concept:return None
   records={}
   for r in c.execute('SELECT r.kind,r.data FROM related a JOIN record r ON r.kind=a.kind AND r.ordinal=a.ordinal WHERE a.concept=? ORDER BY r.kind,r.ordinal',(uri,)):records.setdefault(r['kind'],[]).append(json.loads(r['data']))
   relations=[]
   for r in records.get('source_relations',[]):
    other=r['object_uri'] if r['subject_uri']==uri else r['subject_uri'];entry=c.execute('SELECT uri,label,kind,notation,resolution FROM concept WHERE uri=?',(other,)).fetchone()
    relations.append({**r,'direction':'outgoing' if r['subject_uri']==uri else 'incoming','other':dict(entry) if entry else {'uri':other,'label':other}})
   # Registry context is separate from source relations and never reinterprets endorsement.
   registry={}
   for kind in ['concept_schemes','perspectives','applicability_scopes','agents','source_records','review_statuses','projection_policies']:
    registry[kind]=[json.loads(r[0]) for r in c.execute('SELECT data FROM record WHERE kind=? ORDER BY ordinal',(kind,))]
   return {'kind':'reference-concept','concept':dict(concept),'records':records,'relations':relations,'registry':registry,'podClassifications':[],'podClassificationStatus':'No evidence-backed POD classification is established by this reference record.','snapshotSha256':self.meta['snapshotSha256']}

def register_omaro(app):
 path=os.environ.get('NAVIGATOR_OMARO_MANIFEST');provider=Omaro(path) if path else None;bp=Blueprint('omaro_reference',__name__)
 @bp.before_request
 def binding():
  if provider is None:return jsonify({'error':'OMARO reference snapshot is not configured'}),404
  if request.args.get('snapshot') and request.args['snapshot']!=provider.meta['snapshotSha256']:return jsonify({'error':'Requested OMARO snapshot is unavailable'}),409
 @bp.get('/api/omaro')
 def metadata():return jsonify(provider.meta)
 @bp.get('/api/omaro/concepts')
 def search():
  collection=request.args.get('collection','instruments');resolution=request.args.get('resolution','')
  if collection not in ['instruments','hs','ontology'] or resolution not in ['','resolved','unresolved']:return jsonify({'error':'Unsupported collection or resolution'}),400
  try:
   offset=int(request.args.get('offset','0'));limit=int(request.args.get('limit','30'))
   if offset<0 or offset>100000 or limit<1 or limit>100:raise ValueError()
  except ValueError:return jsonify({'error':'Invalid page bounds'}),400
  if len(request.args.get('q',''))>200:return jsonify({'error':'Query exceeds 200 characters'}),400
  return jsonify(provider.search(collection,request.args.get('q',''),request.args.get('language','en'),offset,limit,resolution))
 @bp.get('/api/omaro/concept')
 def detail():
  value=provider.detail(request.args.get('uri',''))
  return jsonify(value) if value else (jsonify({'error':'Reference concept or ontology term not found'}),404)
 @bp.get('/api/omaro/download/<key>')
 def download(key):
  value=provider.meta['exports'].get(key)
  if not value:return jsonify({'error':'Unknown OMARO distribution'}),404
  return send_file(provider.root/value['file'],mimetype=value['mediaType'],as_attachment=True,download_name=value['file'],conditional=True,etag=value['sha256'])
 app.register_blueprint(bp)
