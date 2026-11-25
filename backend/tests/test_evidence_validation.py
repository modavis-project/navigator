from copy import deepcopy
from rdflib import Graph, Literal
from rdflib.namespace import RDF, RDFS, XSD
import pytest
from navigator_app.evidence_coverage import field_evidence_coverage
from navigator_app.entity_exports import native_graph, CORE
from navigator_app.export_validation import validate_native_export
from navigator_app.uri_policy import UriPolicy


def test_every_public_leaf_has_explicit_qualified_state():
    record={'title':'Fixture','technicalFacts':[{'value':12,'sourceRecordId':'source:1'},{'value':18,'summaryEvidence':{'method':'captured_wording'}}], 'missing':None,'a/b~c':[]}
    before=deepcopy(record)
    result=field_evidence_coverage(record,release_version='fixture')
    fields={row['pointer']:row for row in result['fields']}
    assert fields['/title']['state']=='unavailable'
    assert fields['/technicalFacts/0/value']['state']=='source_context_only'
    assert fields['/technicalFacts/1/value']['state']=='evidence_context_available'
    assert fields['/technicalFacts/1/value']['scope']=='containing_object_not_individual_field'
    assert '/a~1b~0c' in fields and '/missing' in fields
    assert record==before and result['complete']
    assert result['fieldCount']==len(fields)
    assert sum(result['states'].values())==result['fieldCount']


def test_evidence_budget_refuses_partial_coverage(monkeypatch):
    from navigator_app import evidence_coverage as module
    monkeypatch.setattr(module,'MAX_FIELDS',1)
    with pytest.raises(ValueError,match='bounded'):field_evidence_coverage({'a':1,'b':2},release_version='fixture')


def graph():
    return native_graph('name', {'mdvsId':'MDVS:NAME:HP7R-VT8E-E','title':'Fixture name','forms':{'display':'Fixture name'}},UriPolicy.for_release('fixture'))


def test_actual_serializer_graph_passes_nonvacuous_profile():
    result=validate_native_export(graph())
    assert result['accepted'] and result['rootCount']==1
    assert sum(result['targets'].values())>=2
    assert not result['failures']


@pytest.mark.parametrize('change',['empty','label','name_missing','name_duplicate','name_datatype','identity'])
def test_export_mutations_fail(change):
    data=graph(); subject=next(data.subjects(RDF.type,CORE.Name))
    if change=='empty':data=Graph()
    if change=='label':data.remove((subject,RDFS.label,None))
    if change=='name_missing':data.remove((subject,CORE.nameValue,None))
    if change=='name_duplicate':data.add((subject,CORE.nameValue,Literal('Different')))
    if change=='name_datatype':
        data.remove((subject,CORE.nameValue,None));data.add((subject,CORE.nameValue,Literal(42,datatype=XSD.integer)))
    if change=='identity':data.remove((subject,CORE.mdvsIdentifier,None))
    result=validate_native_export(data)
    assert not result['accepted']
    if change=='empty':assert not result['nonVacuous']
