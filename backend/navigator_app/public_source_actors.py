"""Publication-safe source actor dossiers; an assertion route is not an identity."""
from urllib.parse import quote
import json
from .db import connect
SCHEMA='release_1_5_public'
def route(key):return '/entity/source-actors/'+quote(key,safe='')

class PublicSourceActorsMixin:
    def get_source_actor(self, key):
        if not key or len(key)>300:return None
        with connect(self.settings) as c:
            rows=c.execute(f'''select a.*,m.source_url,o.label organ_label
                from {SCHEMA}.organ_builder_assertion a
                join {SCHEMA}.source_membership m using(source_record_id)
                left join {SCHEMA}.organ o on o.mdvs_id=a.organ_mdvs_id
                where a.actor_route_id=%(key)s order by a.assertion_id''',{'key':key}).fetchall()
        identity_evidence={}
        if rows and self._metadata().get("contextual_actor_link_contract")=="modavis.contextual-actor-link/v1":
            with connect(self.settings) as c:
                identity_evidence={r["assertion_id"]:json.loads(r["evidence_json"]) for r in c.execute(f"select * from {SCHEMA}.builder_assertion_evidence where assertion_id=ANY(%(ids)s)", {"ids":[r["assertion_id"] for r in rows]}).fetchall()}
        if not rows:return None
        first=rows[0];label=first.get('preferred_label') or first['source_label']
        targets={r['actor_mdvs_id'] for r in rows if r.get('actor_mdvs_id')}
        relationships=[{'id':r['assertion_id'],'label':r['relation_role'],'targetId':r['organ_mdvs_id'],
            'relatedLabel':r.get('organ_label'),'relatedMdvsId':r['organ_mdvs_id'],'relatedUrl':'/organs/'+r['organ_mdvs_id'].rsplit(':',1)[-1],
            'relatedEntityState':'canonical_organ','relation':r['relation_role'],'sourceReferenceId':r['source_record_id'],'sourceRecordId':r['source_record_id'],'sourceUrl':r['source_url'],
            'targetLabel':r.get('organ_label'),'url':'/organs/'+r['organ_mdvs_id'].rsplit(':',1)[-1],
            'targetUrl':'/organs/'+r['organ_mdvs_id'].rsplit(':',1)[-1],
            'relationLabel':r['relation_role'],'relationType':'source_documented_involvement','kind':'Organ'} for r in rows if r['organ_mdvs_id']]
        sources={r['source_record_id']:{'id':r['source_record_id'],'sourceId':r['source_key'],'url':r['source_url'],'status':'Source assertion'} for r in rows}
        for source_id, source in sources.items():
            source['candidateCount']=sum(r['source_record_id']==source_id for r in rows)
        mentions=[{'sourceRecordId':source_id,'sourceFamily':source['sourceId'],'sourceIdentifier':source_id.rsplit(':',1)[-1],
            'sourcePageUrl':'/source/'+quote(source_id,safe=''),'originalSourceUrl':source['url'],'relationshipCount':source['candidateCount'],
            'relatedItems':[{'label':r['relatedLabel'],'url':r['relatedUrl'],'kind':'Organ','relationship':r['relation']} for r in relationships if r['sourceRecordId']==source_id]} for source_id,source in sources.items()]
        evidence=[{'assertionId':r['assertion_id'],'sourceRecordId':r['source_record_id'],'sourceWording':r['source_label'],
            'role':r['relation_role'],'resolutionState':r['resolution_state'],'rowSha256':r['row_sha256'],'canonicalActorId':r['actor_mdvs_id'],'identityEvidence':identity_evidence.get(r['assertion_id'])} for r in rows]
        sections=[{'key':'identity','title':'Source evidence','items':[{'label':'Original wording','value':r['source_label']} for r in rows]},
            {'key':'roles_and_professions','title':'Documented roles','items':[{'label':'Role','value':r['relation_role']} for r in rows]}]
        return {'id':key,'mdvsId':None,'kind':'source_backed_actor','category':'source-actors','title':label,'label':label,
            'entityType':first['actor_type'],'entityTypeLabel':'Source-mentioned actor','status':'Source-backed assertion',
            'canonicalUrl':route(key),'apiUrl':'/api/entities/source-actors/'+quote(key,safe=''),
            'profile':{'names':[{'value':r['source_label'],'type':'Exact source wording'} for r in rows],
                'preferredNames':[{'value':label}],'variantNames':[],'dates':[],'identifiers':[], 'properties':[], 'statusItems':[], 'sourceSnapshots':[]},
            'publicProfile':{'summary':'This page preserves source-specific actor evidence. It does not establish a new canonical identity.',
                'sections':sections,'relationshipCount':len(relationships)},
            'relationships':relationships,'sourceRecords':list(sources.values()),'sourceRecordCount':len(sources),'sourceMentions':mentions,'sourceFamilyCount':len({r['source_key'] for r in rows}),
            'assertions':evidence,'candidateSupport':[],'candidateSupportCount':0,
            'canonicalResolution':{'identityAssertion':all(r['resolution_state'] in (
                'stored_or_accepted_canonical_identity','resolved_source_native_actor_identifier',
                'resolved_source_native_builder_identifier',
                'resolved_exact_name_date_locality','resolved_exact_name_date_locality_same_organ') for r in rows),
                'mdvsId':next(iter(targets)),
                'guidance':'A recorded navigation match is not canonical identity evidence.'
                    if any(r['resolution_state'].startswith('unique_') for r in rows) else 'See the retained identity assertions and their evidence.'}
                if len(targets)==1 and all(r['actor_mdvs_id'] for r in rows) else None,
            'guidance':'Unresolved identities remain separate source assertions. Equal names do not merge people or organizations.'}

    def _source_actor_links(self, source_ids):
        if not source_ids or self._metadata().get("public_coverage_restoration_contract") != "modavis.public-coverage-restoration/v1":return {}
        with connect(self.settings) as c:
            rows=c.execute(f'''select actor_route_id,source_label,preferred_label,source_record_id,organ_mdvs_id
                from {SCHEMA}.organ_builder_assertion where source_record_id=ANY(%(ids)s) order by assertion_id''',{'ids':sorted(set(source_ids))}).fetchall()
        result={}
        for r in rows:
            for label in (r['source_label'],r['preferred_label']):
                if label:result.setdefault((r['source_record_id'],r['organ_mdvs_id'],label),set()).add(r['actor_route_id'])
        return {key:route(next(iter(values))) for key,values in result.items() if len(values)==1}

    def _organ_source_builders(self, organ_id):
        if self._metadata().get("public_coverage_restoration_contract") != "modavis.public-coverage-restoration/v1":return []
        with connect(self.settings) as c:
            rows=c.execute(f'''select * from {SCHEMA}.organ_builder_assertion
                where organ_mdvs_id=%(id)s and actor_mdvs_id is null order by assertion_id''',{'id':organ_id}).fetchall()
        return [{'id':r['assertion_id'],'mdvsId':None,'label':r['preferred_label'] or r['source_label'],
            'kind':'Source-mentioned actor','relationship':r['relation_role'],'entityCategory':'source-actors',
            'entityPageUrl':route(r['actor_route_id']),'pageUrl':route(r['actor_route_id']),
            'entityPageState':'source_backed','entityPageLabel':'Open source evidence','publicationState':'source_assertion',
            'sourceRecordId':r['source_record_id'],'sourceWording':r['source_label'],'resolutionState':r['resolution_state']} for r in rows]
