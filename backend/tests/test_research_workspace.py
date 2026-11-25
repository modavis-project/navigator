"""Independent public-record comparisons over the authored query fixture."""
import json

from backend.tests.test_workbench_query_contract import client, SNAPSHOT, ASSESSMENT


def compare(client, ids='TEST-0001-A,TEST-0002-B', suffix=''):
    return client.get('/api/workbench/organ-comparison?organs=' + ids + '&snapshot=' + SNAPSHOT + '&assessment=' + ASSESSMENT + suffix)


def test_public_organ_comparison_keeps_source_denominators_and_unknown_capture(client):
    response = compare(client)
    assert response.status_code == 200
    value = response.json
    assert len(value['organs']) == 2
    assert value['organs'][0]['sourceRecords'] == 1
    assert value['organs'][0]['configurationAccounts'] == 0
    assert value['organs'][0]['eventAssertions'] == 1
    assert value['sourceCoverage'][0]['organs'][1]['sourceRecords'] == 0
    assert 'Missing account capture is not an absent instrument feature' in value['method']
    assert value['semanticQuery']['contract'] == 'modavis.semantic-query/v2'


def test_semantic_identity_uses_comparison_membership_not_display_order(client):
    first = compare(client).json
    reverse = compare(client, 'MDVS:ENTY:TEST-0002-B,MDVS:ENTY:TEST-0001-A').json
    assert first['semanticQuery']['id'] == reverse['semanticQuery']['id']
    assert first['organs'][0]['id'] != reverse['organs'][0]['id']


def test_comparison_rejects_duplicates_unknown_ids_budget_and_ignored_filters(client):
    assert compare(client, 'TEST-0001-A,TEST-0001-A').status_code == 400
    assert compare(client, 'TEST-0001-A').status_code == 400
    assert compare(client, 'TEST-0001-A,TEST-0002-B,missing').status_code == 404
    assert compare(client, 'A,B,C,D,E').status_code == 400
    assert compare(client, suffix='&source=one').status_code == 400
    assert compare(client, suffix='&organs=TEST-0001-A,TEST-0002-B').status_code == 400


def test_research_semantic_identity_does_not_replace_v1_digests(client):
    base = '/api/workbench/selection?section=organs&q=Chapel'
    first = client.get(base).json
    pinned = client.get(base + '&snapshot=' + SNAPSHOT + '&left=account-a&leftRevision=rev-a&page=1').json
    assert first['selectionSha256'] != pinned['selectionSha256']
    assert first['semanticQuery']['id'] == pinned['semanticQuery']['id']
    narrowed = client.get(base + '&source=one').json
    assert first['semanticQuery']['id'] != narrowed['semanticQuery']['id']


def test_complete_comparison_package_replays_existing_public_evidence(client):
    response = compare(client, suffix='&format=ro-crate')
    assert response.status_code == 200 and response.mimetype == 'application/zip'
    assert response.headers['X-Content-SHA256']


def test_semantic_query_defaults_and_effective_years_are_canonical(client):
    base = '/api/workbench/selection?q=Chapel'
    assert client.get(base).json['semanticQuery']['id'] == client.get(base + '&section=events').json['semanticQuery']['id']
    first = client.get(base + '&from=1750').json
    same = client.get(base + '&from=01750').json
    assert first['semanticQuery']['id'] == same['semanticQuery']['id']


def test_complete_comparison_export_cannot_silently_truncate_nested_evidence(client, monkeypatch):
    from navigator_app import research_workspace as workspace
    import io
    from zipfile import ZipFile
    work = client.application.extensions['research_workbench']
    with work.connect() as c:
        c.execute('pragma query_only=off')
        c.execute('insert into core.technical_fact values (?,?,?,?,?)', ('MDVS:ENTY:TEST-0001-A','pitch','record-one','test-fact','440 Hz'))
        c.execute('pragma query_only=on')
    monkeypatch.setattr(workspace, 'ASSERTION_LIMIT', 0)
    bounded = compare(client).json
    assert bounded['organs'][0]['assertionsComplete'] is False
    response = compare(client, suffix='&format=ro-crate')
    assert response.status_code == 200
    with ZipFile(io.BytesIO(response.data)) as archive:
        complete = json.loads(archive.read('selection.json'))
    assert complete['completeComparison'] is True
    assert complete['organs'][0]['assertions'][0]['display_value'] == '440 Hz'
    monkeypatch.setattr(workspace, 'EXPORT_RECORD_LIMIT', 0)
    assert compare(client, suffix='&format=ro-crate').status_code == 413
