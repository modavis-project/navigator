# Development

Python dependencies are locked in `backend/requirements-test.txt`; Node dependencies
are locked in `frontend/package-lock.json`. Runtime images are pinned by digest.
Use Python 3.14, Node.js 24 and PostgreSQL 15. See the
[synthetic fixture guide](FIXTURE.md) for the small database check and optional capabilities.

```bash
python3.14 -m venv .venv
.venv/bin/pip install -r backend/requirements-test.txt
.venv/bin/pip check
PYTHONPATH=backend .venv/bin/python -m pytest backend/tests tests -q
cd frontend
npm ci
npm test
npm run build
cd ..
.venv/bin/python scripts/measure_frontend.py --report .runtime/frontend-first.json
npm --prefix frontend run build
.venv/bin/python scripts/measure_frontend.py --compare .runtime/frontend-first.json
```

For interactive development, set `NAVIGATOR_BACKEND_URL` to a local backend and
run `npm run dev` in `frontend`. For maps, set `NAVIGATOR_GEOLIBRE_RUNTIME` to
the verified resources `web/geolibre` directory (an absolute path or a path
relative to `frontend`). Alternatively, create an ignored
`frontend/.runtime/geolibre` symlink to that directory. Both the Vite development
server and `npm run preview` mount it read-only at `/geolibre/`. The directory
must contain the verified runtime's `index.html`, assets and accompanying license.
The mount checks real paths and refuses traversal or symlink escapes. No machine
path is returned in its public errors. Run `node --test
frontend/scripts/geolibre-runtime.test.mjs` for the boundary and serving checks.

Keep this local mount outside `frontend/public`: Vite copies its public directory
into application builds, whereas `.runtime` and the external mount are never
copied into `dist`. The existing public/dist runtime guard remains available for
deployments that explicitly assemble the runtime separately.
Production Compose mounts those resources separately; application builds do not
silently download or rebuild the mapping dependency.

GeoLibre is pinned to upstream commit
`477e9cfb4e0cdde0623007bf98b97f6cfb401493` in
https://github.com/opengeos/GeoLibre. Its original MIT license accompanies the
resources attachment. To rebuild its embedded web runtime, check out that commit,
run `npm ci`, then run `npm run build` with `GEOLIBRE_APP_BASE=/geolibre/`,
`GEOLIBRE_EMBED=1` and `VITE_WELCOME_DISABLED=1`. Preserve its public runtime
assets and license. The supplied attachment is the verified runtime used for this
release; rebuilds must be checked before replacing that attachment.

The browser scripts in `frontend/scripts` accept `BASE_URL`, `OUTPUT` and
`PLAYWRIGHT_MODULE`. Run them against a populated POD instance with Chromium and
Firefox installed. The FAQ suite uses both a desktop and a 390-pixel viewport;
these checks do not claim physical-device testing.

Public data assertions and vocabulary literals retain their wording and
provenance. A display correction must not silently change canonical identity,
chronology, counts, or semantic exports. Source and runtime changes belong in
separate commits; regenerate release manifests only after verification.

All database settings (`DB_HOST`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`) must be
provided explicitly. `DB_PORT` defaults to 5432. Use a SELECT-only application
role; the application additionally starts read-only transactions. No saved
endpoint, default password or private workspace is needed for default tests.

`python3 scripts/measure_frontend.py` enforces 300 KiB gzip for the largest
JavaScript file and 616 KiB gzip for the application JavaScript, CSS and HTML,
including on-demand area pages. The map interaction assets have an 11 KiB
gzip budget. The standalone public map viewer, including its MapLibre worker,
has a separate 420 KiB gzip budget. The total includes both groups of assets.
Gzip uses level 9 and a fixed timestamp for comparable measurements. The
retained main chunk still exceeds Vite's raw 500 kB advisory, which remains
visible. The budget does not certify full-POD response time or browser
memory. CI also requires repeated builds to match every output file byte-for-byte.

See [Configuration](CONFIGURATION.md) for the supported entry point and evidence rules.
The standalone commands use the dependencies pinned in this repository.

The frontend proxy regression runs real Nginx with a temporary DNS server and
synthetic HTTP backend. It checks unresolved startup, DNS address changes and
recovery without reload, backend readiness failure, and paths/query strings for
all five proxied route families. Nginx 1.29.3 or newer supports the frontend's
response-header configuration. To choose a local binary explicitly, run:

```bash
NGINX_BINARY=/path/to/nginx .venv/bin/python -m pytest tests/test_nginx_proxy.py -q
```

The `frontend-proxy` CI job takes the Nginx image pin from `frontend/Dockerfile`
and executes its BusyBox health command against healthy and failed backend
responses. The ordinary Python suite skips the integration check when it cannot
find a compatible Nginx on `PATH`. An incompatible explicit `NGINX_BINARY`
makes the check fail with the detected version.
