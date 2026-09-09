"""Shared read model for restored, explicitly qualified historical endpoints."""
import json
CONTRACT='modavis.public-relocation-evidence/v1'
def movement_context(items):
    if not items:return {'status':'unresolved'}
    mapped=[x for x in items if x['status']=='linked_complete_route']
    def endpoint(role):
        value=items[0][role]
        precision={'locality':'Approximate locality','venue':'Venue coordinates','exact_venue':'Venue coordinates','unresolved':'Coordinates unresolved'}.get(value.get('coordinatePrecision'),'Qualified coordinates')
        return {**value, 'title':value.get('label'), 'pageUrl':value.get('placeUrl'), 'coordinateEvidence':precision+' · '+value.get('coordinateEvidence','')}
    return {'status':'mapped' if mapped else 'unresolved','routeAvailable':bool(mapped),'movements':items,
            'origin':endpoint('origin'),'destination':endpoint('destination'),
            'summary':items[0]['evidenceSummary'],'mapUrl':'/map?mode=events&movement='+items[0]['eventMdvsId']}

def load(rows,organ_id=None,event_ids=None):
    if rows('select value from metadata where key=?',('public_relocation_evidence_contract',))!=[{'value':CONTRACT}]:return []
    query='select payload_json from relocation_evidence';args=()
    if organ_id:query+=' where organ_mdvs_id=?';args=(organ_id,)
    query+=' order by activity_id'
    values=[json.loads(r['payload_json']) for r in rows(query,args)]
    return [x for x in values if event_ids is None or x['eventMdvsId'] in event_ids]
