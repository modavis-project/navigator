"""Version-bound reference browsing; never an instrument-classification writer."""
from pathlib import Path
import hashlib,json,os,re,sqlite3
from contextlib import contextmanager
from functools import lru_cache
from urllib.parse import urlsplit
from flask import Blueprint,jsonify,request,send_file,g
from .vocabulary_query import bounded_integer, require_snapshot, vocabulary_endpoint, VocabularyUnavailable

NS='https://w3id.org/modavis/omaro#'
def digest(p):
 with p.open('rb') as f:return hashlib.file_digest(f,'sha256').hexdigest()
def canonical(x):return json.dumps(x,ensure_ascii=False,sort_keys=True,separators=(',',':'))
class Omaro:
 def __init__(self,path):
  self.manifest_path=Path(path).absolute()
  self.root=self.manifest_path.resolve().parent;self.meta=json.loads(self.manifest_path.read_text());m=dict(self.meta);expected=m.pop('snapshotSha256')
  if m['contract']!='modavis.omaro-reference/v1' or hashlib.sha256(canonical(m).encode()).hexdigest()!=expected:raise ValueError('OMARO manifest mismatch')
  for spec in [m['index'],*m['exports'].values()]:
   p=(self.root/spec['file']).resolve()
   if p.parent!=self.root or digest(p)!=spec['sha256'] or p.stat().st_size!=spec['bytes']:raise ValueError('OMARO artifact mismatch')
  self.db=self.root/m['index']['file']
 @contextmanager
 def connect(self):
  c=sqlite3.connect(self.db.as_uri()+'?mode=ro&immutable=1',uri=True);c.row_factory=sqlite3.Row
  from .db import constrain_sqlite_reads
  try:
   constrain_sqlite_reads(c,10)
   yield c
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
 @lru_cache(maxsize=1)
 def languages(self):
  recorded=self.meta.get('counts',{}).get('languages')
  if isinstance(recorded,dict):return tuple(sorted(recorded))
  with self.connect() as c:return tuple(r[0] for r in c.execute("SELECT DISTINCT language FROM label WHERE language IS NOT NULL AND language<>'' ORDER BY language"))


def omaro_arguments(raw, allowed):
 if set(raw)-set(allowed):raise ValueError('Unsupported OMARO parameter: '+', '.join(sorted(set(raw)-set(allowed))))
 result={}
 for key in raw:
  values=raw.getlist(key)
  if len(values)!=1:raise ValueError('Repeated OMARO parameter: '+key)
  value=values[0];maximum=2048 if key=='uri' else 200 if key=='q' else 500
  if len(value)>maximum or re.search(r'[\x00-\x1f\x7f]',value):raise ValueError('Invalid or overlong OMARO parameter: '+key)
  if key in {'snapshot','uri'} and not value.strip():raise ValueError('An explicitly supplied '+key+' must not be empty')
  result[key]=value
 return result


def reference_uri(value):
 if not value or re.search(r'[\s<>"{}|^`\\]',value) or re.search(r'%(?![0-9A-Fa-f]{2})',value):raise ValueError('An exact absolute reference URI is required')
 try:parts=urlsplit(value)
 except ValueError:raise ValueError('Invalid reference URI') from None
 if parts.scheme not in {'http','https','urn'} or (parts.scheme in {'http','https'} and (not parts.hostname or parts.username or parts.password)) or (parts.scheme=='urn' and not parts.path):
  raise ValueError('An exact absolute reference URI is required')
 return value

def register_omaro(app):
    path = os.environ.get('NAVIGATOR_OMARO_MANIFEST')
    legacy_path = os.environ.get('NAVIGATOR_OMARO_LEGACY_MANIFEST')
    if legacy_path and not path:
        raise ValueError('An OMARO legacy snapshot requires a current snapshot')
    current = Omaro(path) if path else None
    legacy = Omaro(legacy_path) if legacy_path else None
    if legacy and legacy.meta['snapshotSha256'] == current.meta['snapshotSha256']:
        raise ValueError('OMARO current and legacy snapshot bindings must be distinct')
    app.extensions['omaro_reference'] = current
    app.extensions['omaro_legacy_reference'] = legacy
    bp = Blueprint('omaro_reference', __name__)

    @bp.before_request
    @vocabulary_endpoint
    def binding():
        if current is None:
            return jsonify({'error': 'OMARO reference snapshot is not configured'}), 404
        routes = {
            'metadata': {'snapshot'},
            'search': {'collection', 'q', 'language', 'offset', 'limit', 'resolution', 'snapshot'},
            'detail': {'uri', 'snapshot'},
            'download': {'snapshot'},
        }
        values = omaro_arguments(request.args, routes[request.endpoint.rsplit('.', 1)[-1]])
        if legacy and values.get('snapshot') == legacy.meta['snapshotSha256']:
            provider, capability = legacy, 'legacyVocabularyReference'
        else:
            provider, capability = current, 'vocabularyReference'
            require_snapshot(values, current.meta['snapshotSha256'])
        health = app.extensions.get('capability_health')
        if health and not health.resource_state(capability)['available']:
            raise VocabularyUnavailable('OMARO reference resources are unavailable or have changed')
        g.omaro_arguments = values
        g.omaro_provider = provider

    @bp.get('/api/omaro')
    def metadata():
        return jsonify(g.omaro_provider.meta)

    @bp.get('/api/omaro/concepts')
    @vocabulary_endpoint
    def search():
        provider = g.omaro_provider
        values = g.omaro_arguments
        collection = values.get('collection', 'instruments')
        resolution = values.get('resolution', '')
        if collection not in {'instruments', 'hs', 'ontology'} or resolution not in {'', 'resolved', 'unresolved'}:
            raise ValueError('Unsupported collection or resolution')
        if collection == 'ontology' and any(key in values for key in ('language', 'resolution')):
            raise ValueError('Display language and resolution filters apply to reference concepts, not ontology terms')
        language = values.get('language', 'en')
        if collection != 'ontology' and language not in provider.languages():
            raise ValueError('Recorded display language is unavailable')
        offset = bounded_integer(values, 'offset', 0, 0, 100000)
        limit = bounded_integer(values, 'limit', 30, 1, 100)
        return jsonify(provider.search(collection, values.get('q', ''), language, offset, limit, resolution))

    @bp.get('/api/omaro/concept')
    @vocabulary_endpoint
    def detail():
        value = g.omaro_provider.detail(reference_uri(g.omaro_arguments.get('uri', '')))
        return jsonify(value) if value else (jsonify({'error': 'Reference concept or ontology term not found'}), 404)

    @bp.get('/api/omaro/download/<key>')
    def download(key):
        provider = g.omaro_provider
        value = provider.meta['exports'].get(key)
        if not value:
            return jsonify({'error': 'Unknown OMARO distribution'}), 404
        return send_file(provider.root / value['file'], mimetype=value['mediaType'], as_attachment=True,
                         download_name=value['file'], conditional=True, etag=value['sha256'])

    app.register_blueprint(bp)
