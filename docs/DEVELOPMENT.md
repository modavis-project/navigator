# Development

Python dependencies are locked in `backend/requirements.txt`; Node dependencies
are locked in `frontend/package-lock.json`. Runtime images are pinned by digest.

```bash
python3 -m venv .venv
.venv/bin/pip install -r backend/requirements.txt
PYTHONPATH=backend .venv/bin/python -m pytest backend/tests tests -q
cd frontend
npm ci
npm test
npm run build
```

For interactive development, set `NAVIGATOR_BACKEND_URL` to a local backend and
run `npm run dev` in `frontend`. To use maps in this development server, expose
the verified resources `web/geolibre` directory at `frontend/public/geolibre`.
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
