import gzip
import json
from types import SimpleNamespace
from urllib.parse import quote
import pytest
import requests
from flask import Flask, Response
from requests.structures import CaseInsensitiveDict
from navigator_app.historical_renderers import register_historical_renderers

SETTINGS=SimpleNamespace(uri_release_version='1.6.0',canonical_id_base='https://w3id.org/modavis',public_base_url='https://navigator.modavis.org',resolver_base_url='https://id.modavis.org',linked_data_base_url='https://data.modavis.org')
CONFIG=json.dumps({'1.5.6':{'baseUrl':'http://preserved:8506','rendererRelease':'1.5.6'}})
class Upstream:
    def __init__(self,body=b'accepted bytes',status=200,headers=None,value=None):
        self.status_code=status;self.headers=CaseInsensitiveDict(headers or {'Content-Type':'text/turtle','Content-Length':str(len(body)),'ETag':'"frozen"','Vary':'Accept, Accept-Profile'});self.value=value;self.closed=False
        self.raw=SimpleNamespace(stream=lambda size,decode_content:iter([body]))
    def close(self):self.closed=True
    def raise_for_status(self):
        if self.status_code>=400:raise requests.HTTPError()
    def json(self):return self.value
class Transport:
    def __init__(self):self.calls=[];self.reply=Upstream();self.error=False
    def get(self,url,**kw):
        self.calls.append(('readiness',url,kw));return Upstream(value={'releaseVersion':'1.5.6'} if url.endswith('release-context') else {'ok':True})
    def request(self,method,url,**kw):
        self.calls.append((method,url,kw))
        if self.error:raise requests.ConnectionError('unavailable')
        return self.reply
    def close(self):pass
@pytest.fixture
def setup():
    app=Flask(__name__);transport=Transport()
    assert register_historical_renderers(app,SETTINGS,configuration=CONFIG,transport=transport)=={'1.5.6'}
    @app.get('/<path:path>')
    def current(path):return Response(b'current renderer',content_type='text/plain')
    return app.test_client(),transport
@pytest.mark.parametrize('path',[
 '/dataset/pod/version/1.5.6/entity/X.modavis.ttl',
 '/resolve/dataset/pod/version/1.5.6/resource/event/X',
 '/api/public/resources?uri='+quote('https://w3id.org/modavis/dataset/pod/version/1.5.6/resource/event/Y',safe=''),
 '/api/public/resources?uri='+quote('https://w3id.org/modavis/dataset/pod/version/1.5.6/resource/event/Y',safe='').replace('1.5.6','1%2E5%2E6')])
def test_pinned_renderer_query_and_headers(setup,path):
    client,transport=setup;r=client.get(path,headers={'Accept':'text/turtle','If-None-Match':'"old"','Authorization':'secret'})
    assert r.data==b'accepted bytes';call=transport.calls[-1];assert call[1].startswith('http://preserved:8506/')
    assert call[2]['headers']['If-None-Match']=='"old"' and call[2]['headers']['Host']=='navigator.modavis.org'
    assert call[2]['headers']['Accept-Encoding']=='identity'
    assert 'Authorization' not in call[2]['headers'];assert r.headers['ETag']=='"frozen"' and r.headers['Vary']=='Accept, Accept-Profile';assert transport.reply.closed
@pytest.mark.parametrize('path',[
 '/dataset/pod/version/1.6.0/entity/X.modavis.ttl','/dataset/pod/version/1.5.60/entity/X.modavis.ttl','/api/organs',
 '/api/public/resources?uri=https://attacker.invalid/dataset/pod/version/1.5.6/resource/event/X',
 '/api/public/resources?uri='+quote('https://w3id.org/modavis/dataset/pod/version/1.6.0/resource/event/Y',safe='')])
def test_current_unknown_and_foreign_requests_stay_local(setup,path):
    client,transport=setup;assert client.get(path).data==b'current renderer';assert len(transport.calls)==2

def test_compressed_bytes_and_hop_headers(setup):
    client,transport=setup;body=gzip.compress(b'published representation');transport.reply=Upstream(body,headers={'Content-Type':'text/turtle','Content-Encoding':'gzip','Content-Length':str(len(body)),'Connection':'keep-alive, X-Internal','X-Internal':'private','Keep-Alive':'timeout=30','ETag':'"compressed"'})
    r=client.get('/dataset/pod/version/1.5.6/entity/X.modavis.ttl');assert r.data==body and int(r.headers['Content-Length'])==len(body)
    assert r.headers['Content-Encoding']=='gzip' and all(h not in r.headers for h in ['X-Internal','Keep-Alive','Connection'])
@pytest.mark.parametrize('method,status',[('HEAD',200),('GET',304),('GET',307),('GET',404)])
def test_status_head_and_redirect_preserved(setup,method,status):
    client,transport=setup;transport.reply=Upstream(status=status,headers={'Content-Type':'text/turtle','Content-Length':'14','Location':'https://data.modavis.org/frozen','ETag':'"frozen"'})
    r=client.open('/dataset/pod/version/1.5.6/entity/X.modavis.ttl',method=method);assert r.status_code==status and r.headers['Location']=='https://data.modavis.org/frozen'
    if method=='HEAD':assert r.data==b'' and r.headers['Content-Length']=='14'
    elif status==304:assert r.data==b''
    else:assert r.data==b'accepted bytes'
def test_outage_never_substitutes_current_graph(setup):
    client,transport=setup;transport.error=True;r=client.get('/dataset/pod/version/1.5.6/entity/X.modavis.ttl');assert r.status_code==502 and r.json['error']=='historical_renderer_unavailable'
@pytest.mark.parametrize('config',[
 {'1.6.0':{'baseUrl':'http://preserved','rendererRelease':'1.5.6'}},
 {'1.5.6':{'baseUrl':'http://user:password@preserved','rendererRelease':'1.5.6'}},
 {'1.5.6':{'baseUrl':'http://preserved/path','rendererRelease':'1.5.6'}},
 {'1.5.6':{'baseUrl':'file:///tmp/snapshot','rendererRelease':'1.5.6'}},
 {'1.5.6':{'baseUrl':'http://preserved','rendererRelease':'wrong'}}])
def test_invalid_or_mismatched_binding_fails_startup(config):
    with pytest.raises(ValueError):register_historical_renderers(Flask(__name__),SETTINGS,configuration=json.dumps(config),transport=Transport())

def test_real_http_roundtrip_retains_compressed_unicode_evidence():
    from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
    from threading import Thread
    payload = gzip.compress('Original wording: Rauschpfeife 2 2/3′'.encode())
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *args): pass
        def do_GET(self):
            if self.path.startswith('/api/'):
                value = {'releaseVersion':'1.5.6'} if self.path.endswith('release-context') else {'ok':True}
                body = json.dumps(value).encode(); content_type = 'application/json'
            else:
                body = payload; content_type = 'text/turtle'
            self.send_response(200)
            self.send_header('Content-Type',content_type)
            self.send_header('Content-Length',str(len(body)))
            self.send_header('ETag','"frozen"')
            if content_type=='text/turtle': self.send_header('Content-Encoding','gzip')
            self.end_headers(); self.wfile.write(body)
    server = ThreadingHTTPServer(('127.0.0.1',0),Handler)
    thread = Thread(target=server.serve_forever,daemon=True);thread.start()
    app = Flask(__name__)
    try:
        config = json.dumps({'1.5.6':{'baseUrl':f'http://127.0.0.1:{server.server_port}','rendererRelease':'1.5.6'}})
        register_historical_renderers(app,SETTINGS,configuration=config)
        response = app.test_client().get('/dataset/pod/version/1.5.6/entity/X.modavis.ttl')
        assert response.data == payload
        assert response.headers['Content-Encoding']=='gzip'
        assert response.headers['Content-Length']==str(len(payload))
    finally:
        app.extensions['historical_renderer_client'].close()
        server.shutdown();server.server_close();thread.join()


def test_public_archival_origin_uses_its_own_host_header():
    app=Flask(__name__);transport=Transport()
    settings=SimpleNamespace(**{**vars(SETTINGS),'public_base_url':'http://localhost:8080'})
    config=json.dumps({'1.5.6':{'baseUrl':'https://archive.example','rendererRelease':'1.5.6','forwardUpstreamHost':True}})
    register_historical_renderers(app,settings,configuration=config,transport=transport)
    response=app.test_client().get('/dataset/pod/version/1.5.6/entity/X.modavis.ttl')
    assert response.data==b'accepted bytes'
    headers=transport.calls[-1][2]['headers']
    assert headers['Host']=='archive.example'
    assert headers['X-Forwarded-Proto']=='https'
