# Small synthetic demonstration

This fixture demonstrates the public Navigator API and browser without downloading
the full POD. Every record is invented. It is not research evidence, a sample of
accepted records, or a new POD release. Its identity is `0.0.0-fixture`, its URLs
use `example.invalid`, and its publication state must remain `prepared`.

## Install and run

Use Python 3.14, Node.js 24, Docker Engine/Desktop and PostgreSQL 15. Allow 2 GiB
RAM and 2 GiB free space for a fresh dependency/image installation. The database
container has a 1 GiB memory limit and a 1 GiB ephemeral data filesystem; the
fixture's source files total less than 100 KiB. Existing POD runtimes are untouched.

```sh
python3.14 -m venv .venv
.venv/bin/pip install -r backend/requirements.txt
.venv/bin/pip check
npm --prefix frontend ci
npm --prefix frontend test
npm --prefix frontend run build
docker pull postgres:15-bookworm@sha256:5d1d70e254e3c5d7d76847a9deebb18478cd518df37abf6b278d4bdb1fe5d96c
.venv/bin/python scripts/fixture.py check --report .runtime/fixture-check.json
.venv/bin/python scripts/fixture.py serve --report .runtime/fixture-browser.json
```

Open the loopback URL printed by `serve`. A free HTTP port is selected by default;
use `--port` only for a port you own. The runner never pulls an image implicitly.
`--image` accepts an explicitly selected, already available PostgreSQL 15 image
and records its immutable image ID. It creates its own named container with
random credentials, no persistent volume, no production endpoint and one writer
used only for initial fixture construction. No `.env` or inherited POD/research
configuration is loaded. Subsequent application connections use a SELECT-only
role, and the application independently enforces read-only transactions.

Expected output: all named `checks` are `true`, `status` is `passed`, and
`containerRemoved` is `true` after checking or stopping the server with Ctrl-C.
`serve` first runs the same API acceptance checks and reports `serving` while open.
The receipt includes image, input, ledger and export hashes, never credentials.

## Browser journey

1. Open `/organs`; confirm the synthetic banner and two example organs.
2. Search for `Chapel`; one result remains. Search for an absent term; the result
   set is empty. Clear the search and open **Example Chapel Organ**.
3. Inspect its source evidence, history, specification and citation. Two invented
   sources report different stop totals; the construction date is approximate.
   Choose **Export**, then **JSON-LD** under **Native MODAVIS formats**. The URL
   `/organs/TEST-0001-A?tab=export` opens the same export panel directly. Confirm
   fixture identity, provenance and prepared state in the downloaded record.
4. Open **Example Builder**, **Example Village** and the sparse **Example Study
   Organ**. Missing evidence must remain missing.
5. At a 390-pixel viewport, use the navigation menu and search. Navigate with the
   keyboard, including the skip link, FAQ disclosures and export controls.

Useful routes are `/organs/TEST-0001-A`, `/organs/TEST-0002-B`,
`/people/TEST-0003-C`, `/places/TEST-0004-D`, `/events` and `/about/release`.
The API begins at `/api/release-context`; the JSON-LD example is
`/dataset/pod/version/0.0.0-fixture/entity/TEST-0001-A.modavis.jsonld`.

## Binding, rights and limits

`fixtures/public-mini/manifest.json` records source commits and exact hashes for
unchanged Initiator `release_1_5_public` migrations and the retained identity-ledger
DDL. It also binds `records.json`, expected row counts and attribution. This is the
existing public PostgreSQL v8 projection and identity-ledger v1 contract. Navigator
does not become the schema owner. SQL changes must come from Initiator, followed by
a deliberate fixture pin update. The tiny records are Apache-2.0, copyright Dominik
Ukolov; they contain no external source extracts, media, accepted IDs or private data.

Readiness requires the manifest hash recorded in the database, an exact ledger
hash, fixture release identity, reserved authority and prepared state. The normal
POD 1.6 requirement for its exact inherited 1.5.5 identity ledger remains enforced.

The fixture covers catalogue, source evidence, actors, places, events, citations
and entity exports. It omits bulk semantic archives, research/workbench indexes,
OMARO and the optional GeoLibre runtime; those capabilities require the separately
verified full-POD resources. Unavailable optional research APIs return 503, and
the fixture map asset route explains the missing runtime. There are no invented
coordinates or synthetic external media downloads.

This bounded route does not certify full-POD performance, complete data coverage,
historical migrations, the cross-component accepted export chain or publication
readiness. Use `scripts/verify_instance.py` separately for a verified full POD 1.6
installation. Default unit tests and CI require no accepted database.

## Recovery

A failed check removes its owned container and temporary ledger. Input hash
failures stop before creating the container. A port collision fails and cleans
up without interrupting another service. To repeat, run the same command; there
is no persistent fixture state to migrate. If the process is forcibly killed,
use the exact `container` name in its startup receipt to inspect and remove that
container only with `docker rm -f NAME`. Never prune or remove unrelated volumes.
