"""Real Nginx regression: DNS recovery, address changes and public route forwarding.

Set NGINX_BINARY for an explicit binary, or install nginx on PATH. The CI proxy
job runs this against the pinned frontend image, including its BusyBox wget.
Only temporary files and unprivileged loopback listeners are used.
"""

import contextlib
import json
import os
from pathlib import Path
import shutil
import socket
import socketserver
import struct
import subprocess
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.error import HTTPError, URLError
from urllib.request import ProxyHandler, Request, build_opener

import pytest


ROOT = Path(__file__).resolve().parents[1]


class DNS(socketserver.ThreadingUDPServer):
    address = None
    drop = False
    daemon_threads = True


class DNSHandler(socketserver.BaseRequestHandler):
    def handle(self):
        packet, sock = self.request
        if self.server.drop:
            return
        # Questions from Nginx contain one uncompressed DNS name.
        end = 12
        while packet[end]:
            end += packet[end] + 1
        end += 5
        question = packet[12:end]
        is_a = struct.unpack("!H", question[-4:-2])[0] == 1
        address = self.server.address
        found = address is not None and is_a
        flags = 0x8180 if address is not None else 0x8183
        response = packet[:2] + struct.pack("!HHHHH", flags, 1, int(found), 0, 0) + question
        if found:
            response += b"\xc0\x0c" + struct.pack("!HHIH", 1, 1, 1, 4) + socket.inet_aton(address)
        sock.sendto(response, self.client_address)


class Backend(BaseHTTPRequestHandler):
    def do_GET(self):
        payload = json.dumps({"path": self.path, "headers": dict(self.headers)}).encode()
        status = self.server.readiness if self.path == "/api/health/ready" else 200
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def log_message(self, *_):
        pass


@contextlib.contextmanager
def running(server):
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield server
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)


def unused_port():
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def eventually(check, timeout=20):
    deadline = time.monotonic() + timeout
    last = None
    while time.monotonic() < deadline:
        try:
            result = check()
            if result:
                return result
        except (OSError, URLError) as error:
            last = error
        time.sleep(0.1)
    raise AssertionError(f"Condition did not become true within {timeout}s; last error: {last}")


def test_frontend_recovers_without_reload_and_preserves_public_routes(tmp_path):
    nginx = os.environ.get("NGINX_BINARY") or shutil.which("nginx")
    if not nginx:
        pytest.skip("real Nginx required; CI runs the pinned frontend image")
    frontend_port = unused_port()
    html = tmp_path / "html"
    html.mkdir()
    (html / "index.html").write_text("synthetic frontend")
    (tmp_path / "logs").mkdir()
    opener = build_opener(ProxyHandler({}))

    def request(path):
        req = Request(f"http://127.0.0.1:{frontend_port}{path}", headers={"X-Forwarded-Proto": "https"})
        try:
            with opener.open(req, timeout=2) as response:
                return response.status, response.read()
        except HTTPError as response:
            return response.code, response.read()

    # Execute the image's actual health command when its wget is available.
    # The native macOS route still verifies readiness HTTP status end to end.
    health_command = (ROOT / "frontend/Dockerfile").read_text().split("    CMD ", 1)[1].splitlines()[0]
    health_command = health_command.replace("http://127.0.0.1/", f"http://127.0.0.1:{frontend_port}/")

    def healthy(expected):
        if shutil.which("wget"):
            result = subprocess.run(["sh", "-c", health_command], capture_output=True, timeout=15)
            assert (result.returncode == 0) == expected

    backend = ThreadingHTTPServer(("127.0.0.1", 0), Backend)
    backend.readiness = 200
    with running(backend), running(DNS(("127.0.0.1", 0), DNSHandler)) as dns:
        # Change only test bind addresses/ports and the static file root.
        source = (ROOT / "frontend/nginx.conf").read_text()
        source = source.replace("listen 80;", f"listen 127.0.0.1:{frontend_port};")
        source = source.replace("127.0.0.11", f"127.0.0.1:{dns.server_address[1]}")
        source = source.replace("navigator-backend:8506", f"navigator-backend:{backend.server_port}")
        source = source.replace("/usr/share/nginx/html", str(html))
        config = tmp_path / "nginx.conf"
        # In the disposable CI container, retain its root identity so the
        # worker can read pytest's private temporary directory.
        test_user = "user root;\n" if os.geteuid() == 0 else ""
        config.write_text(test_user + "daemon off;\nworker_processes 1;\nerror_log stderr warn;\npid nginx.pid;\n"
                          "events { worker_connections 64; }\nhttp { access_log off;\n"
                          "proxy_connect_timeout 250ms;\n" + source + "\n}\n")
        log = (tmp_path / "nginx.log").open("w+")
        process = subprocess.Popen([nginx, "-p", str(tmp_path) + "/", "-c", str(config)], stdout=log, stderr=log)
        try:
            # Starting without a backend DNS record must still serve the app,
            # while readiness must detect the broken proxy path.
            eventually(lambda: request("/")[0] == 200)
            assert request("/api/health/ready")[0] == 502
            healthy(False)
            dns.address = "127.0.0.1"
            eventually(lambda: request("/api/health/ready")[0] == 200)
            healthy(True)

            paths = [
                "/api/echo/a%20b?q=a%2Fb&limit=1&same=one&same=two&empty=",
                "/dataset/pod/version/1.6.0?format=jsonld&name=a%20b",
                "/sitemap.xml?lastmod=2026-10-22",
                "/vocab/event-type/building?format=ttl&term=a+b",
                "/resolve/entity/fixture-token?format=ttl&redirect=0",
            ]
            for path in paths:
                status, body = request(path)
                assert status == 200, (path, status, body)
                payload = json.loads(body)
                assert payload["path"] == path
                assert payload["headers"]["Host"] == "127.0.0.1"
                assert payload["headers"]["X-Forwarded-Proto"] == ("https" if path.startswith("/resolve/") else "http")

            # A reachable web process with an unready backend is unhealthy.
            backend.readiness = 503
            assert request("/")[0] == 200
            assert request("/api/health/ready")[0] == 503
            healthy(False)
            backend.readiness = 200

            # Change the resolved address to an unavailable replacement, then
            # restore it. Both changes must take effect in the same master.
            dns.address = "127.0.0.2"
            eventually(lambda: request("/api/health/ready")[0] in (502, 504))
            healthy(False)
            dns.address = "127.0.0.1"
            eventually(lambda: request("/api/health/ready")[0] == 200)
            healthy(True)

            # DNS itself can disappear after startup. Recover even when the
            # failed cache entry first becomes NXDOMAIN and later resolves.
            dns.drop = True
            time.sleep(8)
            assert process.poll() is None
            dns.drop = False
            dns.address = None
            eventually(lambda: request("/api/health/ready")[0] == 502)
            dns.address = "127.0.0.1"
            eventually(lambda: request("/api/health/ready")[0] == 200)
            healthy(True)
            assert process.poll() is None
        except Exception:
            log.flush()
            log.seek(0)
            print(log.read())
            raise
        finally:
            process.terminate()
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=5)
            log.close()
