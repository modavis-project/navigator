import hashlib

import pytest
from flask import Flask
from rdflib import Graph, URIRef
from rdflib.compare import isomorphic

from navigator_app.terminology import register_terminology_routes


VAO = 'https://w3id.org/modavis/vao/'


@pytest.fixture(scope='module')
def client():
    app = Flask(__name__)
    register_terminology_routes(app)
    return app.test_client()


def test_current_core_vocabulary_and_legacy_version(client):
    path = '/resolve/vao/ontology'
    result = client.get(path, headers={'Accept': 'text/turtle'}, follow_redirects=True)
    assert result.status_code == 200
    assert result.headers['Content-Profile'] == f'<{VAO}0.6.0>'
    assert hashlib.sha256(result.data).hexdigest() == 'aeeced7a0e087910305ab3df9d38b93b571a5de733dcf395c37f7de54d0ed52e'
    old = client.get('/resolve/vao/0.5.0/vocabulary.ttl')
    assert old.status_code == 200
    assert hashlib.sha256(old.data).hexdigest() == '9e7ff939c54b7b390432b8d6374f1039987a4da5adfbbd5efd3f040065acb177'
    term = client.get('/resolve/vao/vocab/capability/core-graph')
    assert term.status_code == 200
    assert b'/resolve/vao/0.6.0/vocabulary.ttl' in term.data


def test_mmic_ontology_and_profile_keep_distinct_representations(client):
    path = '/resolve/vao/profile/mmic/1.0.0'
    doc = client.get(path, headers={'Accept': 'text/plain'})
    assert doc.status_code == 303
    assert doc.location.endswith('/v0.6.0/Docs/VAO_MMIC_PROFILE_1.0.0.md')
    assert client.get(path, headers={'Accept': 'text/turtle'}).status_code == 406
    assert client.get('/resolve/vao/profile/mmic/1.0.1').status_code == 404
    ttl = client.get('/resolve/vao/mmic', headers={'Accept': 'text/turtle'}, follow_redirects=True)
    assert ttl.status_code == 200
    assert ttl.headers['Content-Profile'] == f'<{VAO}profile/mmic/1.0.0>'
    assert hashlib.sha256(ttl.data).hexdigest() == '4e91967befca16bbb3944acd3b8717a20275f5ee0103338eec19ce300e3e8cca'
    jsonld = client.get(path+'/ontology.jsonld')
    assert jsonld.status_code == 200
    graph = Graph().parse(data=ttl.data, format='turtle')
    assert isomorphic(graph, Graph().parse(data=jsonld.data, format='json-ld'))
    assert any(graph.predicate_objects(URIRef(VAO+'mmic#PhysicalCarrier')))


def test_versioned_profile_targets_preserve_old_links(client):
    for version in ('0.4.0', '0.5.0', '0.6.0'):
        response = client.head('/resolve/vao/profile/core/'+version)
        assert response.status_code == 303
        assert response.location.endswith(f'/v{version}/Docs/VAO_CORE_PROFILE_{version}.md')
