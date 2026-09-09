from navigator_app.public_aggregate_quality import qualify_public_fact,stop_total_expression
from navigator_app.pipework import apply_register_pipe_quantities

def test_questionable_total_retains_wording_but_has_no_normalized_quantity():
 q={'contract':'modavis.aggregate-quality/v1','status':'suspect_source_total','normalizedNumber':None,'guidance':'Questionable source total'}
 result=qualify_public_fact({'displayValue':'41441','normalizedNumber':41441,'sourceWording':'41441','summaryEvidence':{'aggregateQualification':q}})
 assert result['sourceWording']=='41441' and result['normalizedNumber'] is None
 assert result['displayValue']=='41441 (questionable source value)'

def test_sort_and_headline_require_all_totals_to_agree():
 sql=stop_total_expression(True)
 assert 'count(*)=count(normalized_number)' in sql and 'count(distinct normalized_number)=1' in sql
 assert 'max(' not in sql

def test_questionable_compass_cannot_produce_positions_even_with_other_compass():
 item={'id':'s','label':'Principal','detail':{'length':"8'",'note_count':6132,'quantityQualification':{'derivationAllowed':False}}}
 _,hierarchy=apply_register_pipe_quantities(None,[{'id':'stops','items':[item]}])
 assert 'pipeQuantity' not in hierarchy[0]['items'][0]

def test_actor_crosswalks_retain_contextual_identity_receipt():
 from navigator_app.entity_exports import profile_graphs
 from navigator_app.uri_policy import UriPolicy
 record={'mdvsId':'MDVS:ENTY:HP7R-VT8E-E','title':'Walcker','profile':{},'builderAssertions':[{'id':'a','organMdvsId':'MDVS:ENTY:DCVC-C298-8','sourceLabel':'Walcker','identityEvidence':{'contract':'modavis.contextual-actor-link/v1','targetId':'MDVS:ENTY:HP7R-VT8E-E','identityMerged':False}}]}
 for graph in profile_graphs('organization',record,UriPolicy()).values():
  assert any('modavis.contextual-actor-link/v1' in str(o) for o in graph.objects())


def test_native_actor_receipt_preserves_asserted_target_in_every_crosswalk():
 import json
 from rdflib import Namespace,URIRef
 from navigator_app.entity_exports import profile_graphs
 from navigator_app.uri_policy import UriPolicy
 policy=UriPolicy()
 actor='MDVS:ENTY:2HMY-0VA0-0'
 organ='MDVS:ENTY:FHR7-6355-5'
 proof={'contract':'modavis.source-native-actor-link/v1','sourceNativeIdentifier':{'source':'ohs','entityKind':'builder','value':1947},'targetId':actor,'identityMerged':False}
 assertion={'id':'native-builder','mdvsId':actor,'organMdvsId':organ,'label':'Estey Organ Co.','sourceLabel':'Estey Organ Co.','identityEvidence':proof}
 prov=Namespace('http://www.w3.org/ns/prov#')
 for kind,owner in [('organ',organ),('organization',actor)]:
  record={'mdvsId':owner,'title':'Native builder evidence','profile':{},'builderAssertions':[assertion]}
  for profile,graph in profile_graphs(kind,record,policy).items():
   receipts=[node for node,value in graph.subject_objects(prov.value) if str(value).startswith('{') and json.loads(str(value)).get('contract')==proof['contract']]
   assert len(receipts)==1,(kind,profile)
   assert json.loads(str(graph.value(receipts[0],prov.value)))==proof
   assert any(o==URIRef(policy.identity_uri(actor)) for _,_,o in graph.triples((receipts[0],None,None))), (kind,profile)


def test_derived_count_is_historical_and_preserves_qualification_evidence():
 import copy
 for original in ['19', '69', '17']:
  qualification={'contract':'modavis.aggregate-quality/v1','status':'derived_component_count',
   'normalizedNumber':None,'originalDisplayValue':original,'headlineEligible':False,
   'guidance':'Count derived from captured component rows; no source-reported total is established.'}
  for field in ['displayValue', 'value']:
   fact={field:original,'normalizedNumber':None,'summaryEvidence':{'aggregateQualification':qualification}}
   before=copy.deepcopy(fact)
   result=qualify_public_fact(fact)
   assert result['value']==original+' (original captured component rows)'
   assert result['displayValue']==result['value']
   assert result['normalizedNumber'] is None
   assert result['aggregateQualification']==qualification
   assert result['qualificationGuidance']==qualification['guidance']
   assert fact==before
