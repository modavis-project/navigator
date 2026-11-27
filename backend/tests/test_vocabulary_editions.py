"""Language, source identity, and independent vocabulary distribution contracts."""
from io import StringIO
from types import SimpleNamespace
from hashlib import sha256
import csv

from flask import Flask
from rdflib import Graph, Literal, RDF, URIRef
from rdflib.namespace import DCTERMS, SKOS

from navigator_app.vocabulary_editions import ACTIVITY_GLOSSES, load_edition, register_vocabulary_editions


def catalogue():
    app = Flask(__name__)
    repo = SimpleNamespace(policy=SimpleNamespace(
        canonical_id_base='https://w3id.org/modavis', human_base='https://navigator.modavis.org'))
    register_vocabulary_editions(app, repo)
    return app.test_client(), app.extensions['vocabulary_editions']


def test_modavis_edition_provides_bilingual_stable_concepts_without_pod_usage():
    client, _ = catalogue()
    edition = client.get('/api/vocab/editions/modavis').json
    assert edition['version'] == '1.1.0'
    assert [scheme['count'] for scheme in edition['schemes']] == [70, 17]
    downloads = {item['format']: item['href'] for item in edition['formats']}
    snapshot = client.get(downloads['json'])
    assert sha256(snapshot.data).hexdigest() == edition['contentSha256']
    for scheme in snapshot.json['schemes']:
        assert len({term['id'] for term in scheme['concepts']}) == len(scheme['concepts'])
        assert all(set(term['labels']) == set(term['definition']) == {'de', 'en'} for term in scheme['concepts'])
        assert all('publicEventUsage' not in term for term in scheme['concepts'])
    data = client.get(downloads['ttl'])
    graph = Graph().parse(data=data.text, format='turtle')
    term = URIRef('https://w3id.org/modavis/vocab/event-type/activitype:concert')
    scheme = URIRef('https://navigator.modavis.org/vocab/activity-types')
    assert (term, RDF.type, SKOS.Concept) in graph
    assert (term, SKOS.inScheme, scheme) in graph
    assert (term, SKOS.prefLabel, Literal('Konzert', lang='de')) in graph
    assert (term, SKOS.definition, Literal('Public concert or musical event', lang='en')) in graph
    assert (scheme, DCTERMS.license, URIRef('https://creativecommons.org/licenses/by/4.0/')) in graph
    assert len(list(graph.subjects(RDF.type, SKOS.Concept))) == 87
    assert len(list(csv.DictReader(StringIO(client.get(downloads['csv']).text)))) == 174
    assert client.get(downloads['ttl'], headers={'If-None-Match': data.headers['ETag']}).status_code == 304
    assert client.get('/api/vocab/editions/modavis/1.0.0/ttl?snapshot=wrong').status_code == 409


def test_concert_cross_references_both_source_schemes_and_preserves_usage():
    client, provider = catalogue()
    schemes, _ = load_edition('modavis')
    source = next(term for term in schemes['schemes'][0]['concepts'] if term['id'] == 'concert')
    frozen = {'scheme': {'code': 'modavis_activity_types'}, 'code': source['code'], 'mdvsId': source['mdvsId'],
              'publicEventUsage': {'occurrenceCount': 0}, 'labels': [{'languageCode': 'en', 'label': 'Concert'}]}
    output = provider.project(frozen)
    assert 'editionLabels' not in frozen
    assert output['labels'] == frozen['labels']
    assert output['publicEventUsage']['occurrenceCount'] == 0
    assert output['readerHref'] == '/vocab/activity-types/concert'
    assert output['editionLabels']['de'] == 'Konzert'
    assert len(output['otherVocabularies']) == 2
    for link in output['otherVocabularies']:
        assert link['relation'] == 'related'
        target = client.get('/api' + link['href']).json['term']
        assert target['otherVocabularies'][0]['href'] == output['readerHref']
        assert target['otherVocabularies'][0]['relation'] == 'related'


def test_musixplora_source_rights_search_forms_and_resolvable_identifiers():
    client, _ = catalogue()
    edition = client.get('/api/vocab/editions/musixplora').json
    assert len(edition['schemes']) == 19
    assert sum(item['count'] for item in edition['schemes']) == 1467
    assert 'licenseUrl' not in edition
    assert 'general Creative Commons' in edition['rights']['en']
    search = client.get('/api/vocab/musixplora?q=urheberschaft&language=de').json
    assert search['total'] > 0
    assert search['items'][0]['href'].startswith('/vocab/musixplora/contribution-role/')
    record = client.get('/api' + search['items'][0]['href']).json['term']
    assert record['sourceUri'].startswith('https://musixplora.modavis.org/version/1/')
    assert record['forms']
    distributions = {item['format']: item['href'] for item in edition['formats']}
    graph = Graph().parse(data=client.get(distributions['ttl']).text, format='turtle')
    assert len(list(graph.subjects(RDF.type, SKOS.Concept))) == 1467
    assert (URIRef(record['sourceUri']), RDF.type, SKOS.Concept) in graph
    assert not list(graph.triples((None, DCTERMS.license, None)))
    assert client.get('/api/vocab/musixplora?language=en&language=de').status_code == 400
    assert client.get('/api/vocab/musixplora?limit=101').status_code == 400


def test_source_glosses_do_not_manufacture_controlled_links():
    _, provider = catalogue()
    payload = {'concepts': [], 'wordings': [
        {'key': 'ablehnung', 'label': 'Ablehnung', 'href': '/vocab/usage/activities?term=Ablehnung', 'occurrences': 21},
        {'key': 'revision', 'label': 'Revision', 'occurrences': 5},
    ]}
    result = provider.lookup(payload)
    assert result['concepts'] == []
    assert result['wordings'][0]['englishGloss'] == 'Rejection'
    assert result['wordings'][0]['label'] == 'Ablehnung'
    assert result['wordings'][0]['occurrences'] == 21
    assert 'englishGloss' not in result['wordings'][1]
    assert 'revision' not in ACTIVITY_GLOSSES


def test_governed_concept_resolver_redirects_to_a_readable_view_and_keeps_rdf():
    from navigator_app.release_resources import register_release_resource_routes
    from navigator_app.uri_policy import UriPolicy

    app = Flask(__name__)
    policy = UriPolicy(release_version='1.6.0', policy_version='2',
                       dataset_version_uri='https://w3id.org/modavis/dataset/pod/version/1.6.0')
    source = {'preferredLabel': 'Concert', 'definition': 'Public concert or musical event'}
    repo = SimpleNamespace(policy=policy, release_resource_lookup=lambda operation, key:
        source if (operation, key) == ('event-type', 'activitype:concert') else None)
    register_release_resource_routes(app, lambda version: repo if version == '1.6.0' else None,
                                     lambda *_: None, '1.6.0')
    client = app.test_client()
    path = '/vocab/event-type/activitype:concert'
    html = client.get(path, headers={'Accept': 'text/html'})
    assert html.status_code == 303
    assert html.location == 'https://navigator.modavis.org/vocab/modavis_activity_types/concepts/activitype%3Aconcert'
    turtle = client.get(path, headers={'Accept': 'text/turtle'})
    assert turtle.status_code == 303
    assert turtle.location == 'https://data.modavis.org/dataset/pod/version/1.6.0/vocab/event-type/activitype:concert.ttl'
    response = client.get('/dataset/pod/version/1.6.0/vocab/event-type/activitype:concert.ttl')
    graph = Graph().parse(data=response.text, format='turtle')
    assert (URIRef(policy.canonical_id_base + path), RDF.type, SKOS.Concept) in graph


def test_specification_edition_links_documented_wording_in_both_directions():
    client, provider = catalogue()
    edition = client.get('/api/vocab/editions/organ-specifications').json
    assert [item['count'] for item in edition['schemes']] == [4, 2, 4, 4, 4]
    path = '/api/vocab/edition-terms/organ-specifications/actions/mechanical'
    term = client.get(path + '?snapshot=' + edition['contentSha256']).json['term']
    assert term['labels']['de'] == 'Mechanische Traktur'
    keys = {(item['family'], item['wording']) for item in term['evidence']}
    assert {family for family, _ in keys} == {'key_action', 'stop_action'}
    for family, wording in keys:
        assert provider.specification_terms_for_wording(family, wording)
    assert provider.specification_terms_for_wording('windchests', 'Mechanical') == []
    turtle = next(item['href'] for item in edition['formats'] if item['format'] == 'ttl')
    graph = Graph().parse(data=client.get(turtle).text, format='turtle')
    node = URIRef('https://navigator.modavis.org/vocab/organ-specifications/actions/mechanical')
    assert (node, SKOS.prefLabel, Literal('Mechanical action', lang='en')) in graph
    assert len(list(graph.subjects(RDF.type, SKOS.Concept))) == 18


def test_participation_edition_extends_the_person_scheme_and_retains_previous_bytes():
    client, _ = catalogue()
    old, old_checksum = load_edition('modavis', '1.0.0')
    response = client.get('/api/vocab/editions/modavis/1.0.0/json?snapshot=' + old_checksum)
    assert response.status_code == 200
    assert sha256(response.data).hexdigest() == old_checksum
    assert len(old['schemes'][1]['concepts']) == 9
    entry = '/api/vocab/edition-terms/modavis/person-terms/activity-role.restorer'
    term = client.get(entry).json['term']
    assert term['labels']['en'] == 'Restorer' and 'mdvsId' not in term
    assert term['evidence'] and term['otherVocabularies']
    assert client.get(entry + '?snapshot=' + old_checksum).status_code == 404
    archive = client.get('/api/vocab/edition-terms/modavis/person-terms?snapshot=' + old_checksum)
    assert archive.json['total'] == 9 and archive.json['edition']['version'] == '1.0.0'
