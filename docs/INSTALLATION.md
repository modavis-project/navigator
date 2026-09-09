# Installation

Use the `v1.0.0` tag, not an unpinned branch, for a reproducible installation.
The application expects PostgreSQL 15 and the files listed in
`releases/pod-1.6.0.json`. Neither a small SQLite convenience profile nor the
semantic exports alone can replace the public PostgreSQL projection.

## Download inputs

The reserved POD record is `10.5281/zenodo.22308263`. Publication remains pending.
Once available, download and verify the exact files with:

```bash
python3 scripts/download_pod.py --output downloads/pod-1.6.0
```

The downloader recognizes Zenodo packaging prefixes and stores the expected
local filenames. It fails clearly if the record is unpublished or incomplete.
Alternatively, supply the same verified package locally. The manifest includes the PostgreSQL
dump, public core, inherited identifier ledger, research runtime, four complete
semantic archives and the database/distribution manifests.

The software release supplies `navigator-1.0.0-resources.tar.gz` containing the
pinned GeoLibre web runtime, public story snapshots, OMARO reader resources and
coverage index used by the application. Its hash is in `resources/archive.json`;
every unpacked file is listed in `resources/manifest.json`.

For a private GitHub repository, authenticate with GitHub CLI and run:

```bash
gh release download v1.0.0 --repo modavis-project/navigator \
  --pattern navigator-1.0.0-resources.tar.gz --dir downloads
```

Run the preparation command in the README. The installer checks input hashes,
rejects unsafe archive entries, uses a new output directory and writes a private
`.env` containing newly generated local passwords. It leaves downloaded files
unchanged. Preserve `.env` with the database volume: changing the environment does
not change a password inside an already initialized database.

## Start and verify

```bash
docker compose up -d --build
docker compose ps
python3 scripts/verify_instance.py --base-url http://localhost:8080
```

The setup restores one new database, grants a separate SELECT-only role and
mounts public artifacts read-only. PostgreSQL and the backend have no published
host ports. The web port binds to loopback. Adjust `NAVIGATOR_PORT` and
`NAVIGATOR_PUBLIC_URL` together in `.env` if port 8080 is occupied.

Use `docker compose logs navigator-db` for restore progress and
`docker compose logs navigator-backend` for readiness failures. A failed restore
must be investigated before retrying: PostgreSQL does not rerun initialization
scripts in a nonempty volume. Retain the failed volume for diagnosis and use a
new Compose project and credentials for a new attempt.

```bash
docker compose stop           # preserves services, database and artifacts
docker compose start          # resumes the same installation
```

Keep the Git tag, resource attachment, original POD downloads, generated runtime
and `.env`. Use `pg_dump` or a stopped-volume backup for the database. Avoid
`docker compose down -v` unless you deliberately intend to remove that database.

## Public hosting

Place a TLS reverse proxy in front of the loopback web port. Set
`NAVIGATOR_PUBLIC_URL` to the intended public origin before starting the backend.
Canonical W3ID identifiers remain stable; changing a delivery origin does not
mint new identities. Configure DNS, TLS and proxy policy for your own host.
The repository does not contain credentials or infrastructure state from the
MODAVIS production service.
