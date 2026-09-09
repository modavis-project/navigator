"""Paginated people, organization and source-evidence directory read model."""
from functools import lru_cache
import json

from .db import connect

TABLE = 'release_1_5_public.actor_directory_entry'
CLASSES = {'person':'Person', 'organization':'Organization', 'unknown':'Actor (type unresolved)'}
SORTS = {'label':'lower(label),entry_kind,entry_id', 'organs':'organ_count desc,lower(label),entry_kind,entry_id',
         'sources':'source_record_count desc,lower(label),entry_kind,entry_id',
         'mentions':'assertion_count desc,lower(label),entry_kind,entry_id'}
UNCLASSIFIED_ROLE = '__unclassified_source_role__'


def filters(query='', source='', publication_state='', entity_class='', role='', sort='label', limit=30, offset=0):
    values = [query or '', source or '', publication_state or '', entity_class or '', role or '']
    if any(len(s)>200 for s in values) or not 1<=limit<=100 or not 0<=offset<=1_000_000:
        raise ValueError('Invalid actor directory filter or pagination')
    query,source,publication_state,entity_class,role = [s.strip() for s in values]
    source = source.removeprefix('src:')
    publication_state = {'source_mentioned':'source','':'canonical'}.get(publication_state,publication_state)
    if publication_state not in {'all','canonical','source'} or entity_class not in {'',*CLASSES}:
        raise ValueError('Invalid actor directory identity category')
    sort = 'label' if sort in {None,'','recent'} else sort
    if sort not in SORTS: raise ValueError('Invalid actor directory sort')
    return {'query':query,'source':source,'publication_state':publication_state,'entity_class':entity_class,
            'role':role,'sort':sort,'limit':limit,'offset':offset}


def where(params, omit=None):
    clauses=[];bound={}
    for key,column in [('publication_state','publication_state'),('entity_class','actor_type')]:
        if params[key] and params[key]!='all' and key!=omit:
            clauses.append(column+'=%('+key+')s');bound[key]=params[key]
    for key,column in [('source','source_keys'),('role','role_keys')]:
        if params[key] and key!=omit:
            clauses.append(column+' @> ARRAY[%('+key+')s]::text[]');bound[key]=params[key]
    if params['query']:
        clauses.append("search_text LIKE %(query)s ESCAPE E'\\\\'")
        bound['query']='%'+params['query'].lower().replace('\\','\\\\').replace('%','\\%').replace('_','\\_')+'%'
    return ('WHERE '+' AND '.join(clauses) if clauses else ''),bound


def summary(row, role_labels=None):
    role_labels = role_labels or {}
    canonical = row['publication_state']=='canonical'
    category = row['actor_type'];roles=row['role_keys']
    label=CLASSES[category];count=row['organ_count']
    reference=json.loads(row['evidence_reference_json'])
    return {'id':row['entry_id'],'kind':row['entry_kind'],'publicationState':row['publication_state'],
        'publicationStateLabel':'Canonical identity' if canonical else 'Documented source mention',
        'entityClass':category,'entityClassLabel':label,'title':row['label'],'label':row['label'],
        'mdvsId':row['canonical_actor_id'], 'canonicalUrl':row['detail_url'] if canonical else None,
        'detailUrl':row['detail_url'],
        'summary':f'{label} with evidence concerning {count} organ'+('s.' if count!=1 else '.') if canonical
            else 'Source-specific actor evidence; this entry does not establish a canonical identity.',
        'sourceKeys':row['source_keys'],'sourceLabels':[],
        'sourceRecordCount':row['source_record_count'],'occurrenceCount':row['assertion_count'],
        'assertionCount':row['assertion_count'],'associatedOrganCount':count,'candidateCount':0,
        'roleTags':[role_labels.get(role,role) for role in roles], 'roleKeys':roles,
        'roleEvidenceKind':'bounded_source_roles_and_governed_activity_context',
        'evidenceReference':reference,
        'evidenceSummary':('Event participant '+str(reference['participantIndex']+1)+'. Original wording, role and source spans are available in the event.'
            if row['entry_kind']=='source_participant' else None),
        'badges':[label,'Canonical identity' if canonical else 'Source evidence'],
        'aliases':[],'identifiers':([{'scheme':'MODAVIS','value':row['canonical_actor_id']}] if canonical else [])}


class PublicActorDirectoryMixin:
    @lru_cache(maxsize=1)
    def _actor_directory_role_registry(self):
        labels={UNCLASSIFIED_ROLE:'Role not classified (source context)'}
        aliases={}
        with connect(self.settings) as c:
            for row in c.execute("select concept_code,mdvs_id,payload_json from release_1_5_public.vocabulary_concept where scheme_code='modavis_activity_types'",{}).fetchall():
                value=json.loads(row['payload_json'])
                code=row['concept_code'];mdvs=row.get('mdvs_id')
                if value.get('code')!=code or value.get('mdvsId')!=mdvs or value.get('scheme',{}).get('code')!='modavis_activity_types':
                    raise ValueError('Activity registry code/identifier binding mismatch')
                english=next((v['label'] for v in value.get('labels',[]) if v.get('languageId')==2),None)
                label='Activity: '+(english or value.get('preferredLabel') or code)
                for key in [code,mdvs]:
                    if not key: continue
                    if key in aliases and aliases[key]!=code: raise ValueError('Ambiguous activity registry identifier')
                    aliases[key]=code;labels[key]=label
        return aliases,labels

    def _actor_directory_role_labels(self):
        return self._actor_directory_role_registry()[1]

    @lru_cache(maxsize=1)
    def _has_actor_directory(self):
        with connect(self.settings) as c:
            return bool(c.execute("select to_regclass(%(table)s) as name",{'table':TABLE}).fetchone()['name'])

    @lru_cache(maxsize=128)
    def _actor_directory_facets(self, query, source, publication_state, entity_class, role):
        params=filters(query,source,publication_state,entity_class,role)
        role_labels=self._actor_directory_role_labels()
        result={}
        with connect(self.settings) as c:
            for name,column,omit in [('sources','source_keys','source'),('roles','role_keys','role'),
                                    ('publicationStates','publication_state','publication_state'),('entityClasses','actor_type','entity_class')]:
                condition,bound=where(params,omit)
                expression='unnest('+column+')' if name in {'sources','roles'} else column
                rows=c.execute(f'SELECT value,count(*) AS count FROM (SELECT {expression} AS value FROM {TABLE} {condition}) selected GROUP BY value ORDER BY lower(value),value',bound).fetchall()
                key={'sources':'source','roles':'role','publicationStates':'state','entityClasses':'class'}[name]
                result[name]=[{key:r['value'],'label':CLASSES.get(r['value'],r['value']) if name=='entityClasses'
                    else {'canonical':'Canonical identities','source':'Source mentions'}.get(r['value'],r['value']) if name=='publicationStates'
                    else role_labels.get(r['value'],r['value']) if name=='roles'
                    else r['value'],'count':int(r['count'])} for r in rows]
        return result

    def _list_actor_directory(self, **kwargs):
        params=filters(**kwargs)
        aliases,_=self._actor_directory_role_registry()
        params['role']=aliases.get(params['role'],params['role'])
        condition,bound=where(params)
        with connect(self.settings) as c:
            total=int(c.execute(f'SELECT count(*) AS total FROM {TABLE} {condition}',bound).fetchone()['total'])
            rows=c.execute(f'SELECT * FROM {TABLE} {condition} ORDER BY {SORTS[params["sort"]]} LIMIT %(limit)s OFFSET %(offset)s',
                           {**bound,'limit':params['limit'],'offset':params['offset']}).fetchall()
        items=[summary(r,self._actor_directory_role_labels()) for r in rows]
        facets=self._actor_directory_facets(*(params[k] for k in ('query','source','publication_state','entity_class','role')))
        states={r['state']:r['count'] for r in facets['publicationStates']}
        more=params['offset']+len(items)<total
        return {'query':params['query'],'items':items,'total':total,'limit':params['limit'],'offset':params['offset'],
            'page':{'loaded':len(items),'hasMore':more,'nextOffset':params['offset']+len(items) if more else None,
                    'previousOffset':max(0,params['offset']-params['limit']) if params['offset'] else None},
            'filters':{'source':params['source'],'publicationState':params['publication_state'],'entityClass':params['entity_class'],
                       'role':params['role'],'sort':params['sort']},
            'facets':{**facets,'sortOptions':[{'value':key,'label':label} for key,label in
                        [('label','Name'),('organs','Associated organs'),('sources','Source records'),('mentions','Evidence entries')]]},
            'counts':{'canonical':states.get('canonical',0),'sourceMentioned':states.get('source',0),'musixplora':0},
            'coverage':{'publicationStates':facets['publicationStates'],'sources':facets['sources'],
                        'entityClasses':facets['entityClasses'],'topSources':sorted(facets['sources'],key=lambda r:(-r['count'],r['source']))[:3],
                        'completeness':{'status':'complete_public_actor_evidence','guidance':'Canonical identities and retained builder/event participant evidence are separate entries. Equal source names do not establish identity. Role filters use bounded documented wording or already governed activity context; narrative-only roles remain explicitly unclassified.'}},
            'source':'release_1_5_public','directoryContract':'modavis.actor-directory/v1'}
