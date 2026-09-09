"""Read-only delivery of Processor-owned identity occurrence assessments."""
import json,hashlib,csv,io
from pathlib import Path
from .organological_research import digest

RISK="('authority_conflict','outside_person_lifetime')"
STATES={'authority_conflict','outside_person_lifetime','within_person_lifetime','no_conflict_with_known_boundary','overlaps_person_boundary','date_unestablished','identity_scope_unresolved'}
METHOD='Only this audited cohort is assessed. Excluding conflicts removes assessed authority/date conflicts and events outside a sourced person lifetime. Other unresolved or unassessed attributions remain; a compatible date does not prove identity.'
def load_assessments(path,core_sha,identity_sha):
 m=json.loads(Path(path).read_text())
 if m['contract']!='modavis.identity-occurrences/v1' or m['publicCoreSha256']!=core_sha or m['identityEvidenceSha256']!=identity_sha:raise ValueError('Identity occurrence binding mismatch')
 index=Path(m['index']['path'])
 if not index.is_absolute():index=Path(path).resolve().parent/index
 if digest(index)!=m['index']['sha256']:raise ValueError('Identity occurrence index changed')
 # Bind research selections to assessed content, independently of installation paths.
 content={**m,'index':{k:v for k,v in m['index'].items() if k!='path'}}
 m['assessmentContentSha256']=hashlib.sha256(json.dumps(content,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode()).hexdigest()
 m['manifestSha256']=digest(Path(path))
 m['index']={**m['index'],'path':str(index.resolve())}
 return m

def filter_selection(f,section,actor,other,where,params):
 mode=f.get('identity','')
 if not mode:return
 if mode not in ['exclude_conflicts','conflicts_only','temporally_compatible']:raise ValueError('Unknown identity assessment filter')
 if section not in ['events','sequences'] or not actor:raise ValueError('Identity assessment filtering requires an actor and events or sequences')
 pairs=[('e',actor)]+([('b' if section=='sequences' else 'e',other)] if other else [])
 clauses=[]
 for alias,id in pairs:
  state="a.status='within_person_lifetime'" if mode=='temporally_compatible' else 'a.status in '+RISK
  clauses.append(('not ' if mode=='exclude_conflicts' else '')+f'exists(select 1 from assessment.occurrence a where a.kind=\'participant\' and a.event={alias}.id and a.actor=? and {state})');params.append(id if id.startswith('MDVS:') else 'MDVS:ENTY:'+id)
 where.append('('+(' or ' if mode=='conflicts_only' else ' and ').join(clauses)+')')

def occurrences(c,f,binding,manifest,export=False):
 where=[];params=[]
 for key,col in [('event','event'),('actor','actor'),('native','native'),('organ','organ'),('source','source'),('status','status'),('kind','kind')]:
  value=f.get(key)
  if not value:continue
  if key=='status' and value not in STATES:raise ValueError('Unknown assessment status')
  if key=='kind' and value not in ['builder','participant']:raise ValueError('Unknown occurrence kind')
  if key in ['actor','organ'] and not value.startswith('MDVS:'):value='MDVS:ENTY:'+value
  where.append(col+'=?');params.append(value)
 sql=' from assessment.occurrence'+(' where '+' and '.join(where) if where else '')
 total=c.execute('select count(*)'+sql,params).fetchone()[0];page=int(f.get('page',0))
 if page<0 or page>200000:raise ValueError('Invalid page')
 if export and total>50000:raise OverflowError('Selection exceeds 50,000 occurrences; narrow filters. No partial export produced.')
 offset=0 if export else page*50
 items=[json.loads(r[0]) for r in c.execute('select payload'+sql+' order by id limit ? offset ?',params+[50000 if export else 50,offset])]
 for x in items:
  x['organHref']='/organs/'+x['organId'].replace('MDVS:ENTY:','');x['href']='/events/'+x['eventId'] if x['eventId'] else x['organHref']+'?tab=history'
 filters={k:v for k,v in sorted(f.items()) if k not in ['page','format'] and v}
 digest_value=hashlib.sha256(json.dumps({'binding':binding,'filters':filters},sort_keys=True,separators=(',',':')).encode()).hexdigest()
 return {**binding,'selectionSha256':digest_value,'filters':filters,'total':total,'offset':offset,'hasMore':offset+len(items)<total,'completeSelection':export,'items':items,'coverage':manifest['coverage'],'cohorts':[json.loads(r[0]) for r in c.execute('select payload from assessment.cohort order by native')],'method':manifest['method']+' '+METHOD}

def event_assessments(c,event):return [json.loads(r[0]) for r in c.execute('select payload from assessment.occurrence where event=? order by id',(event,))]
