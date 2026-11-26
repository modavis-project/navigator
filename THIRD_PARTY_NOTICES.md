# Third-party notices

Original Navigator application code is copyrighted by Dominik Ukolov and
subject to the license in LICENSE and the attribution in NOTICE. Datasets, vocabulary
assertions, images, third-party libraries and external services retain their
separate terms.

- **POD 1.6.0:** CC BY 4.0 for the public dataset, subject to the source and
  third-party rights described in its `RIGHTS_AND_DATA_BOUNDARIES.md`.
- **OMARO 1.0.0:** an independent reference snapshot, released under CC0 1.0.
  Source schemes, labels and attribution remain separately identified in its
  archive, manifests and records. Included as a read-only reference.
- **GeoLibre:** MIT, OpenGeoS and contributors. Its complete license is
  `web/geolibre/THIRD_PARTY_LICENSE.GeoLibre.txt` in the resources attachment.
  Bundled dependency notices and license files remain intact.
- **MapLibre GL JS:** BSD-3-Clause, MapLibre contributors. The standalone map
  viewer uses version 6.5.0. Its complete license is included in
  `frontend/public/THIRD_PARTY_LICENSES.txt`.
- **React, React DOM, Scheduler, Lucide, React Intl, FormatJS, and Vite/Rolldown runtime helpers:** the complete upstream runtime
  notices are retained in `frontend/public/THIRD_PARTY_LICENSES.txt`, copied into
  every frontend build. Exact versions and notice hashes are recorded in
  `releases/browser-dependencies.json`. Lucide retains its Feather attribution;
  Rolldown retains its Rollup and esbuild notices. The complete Vite package
  license file is preserved, including its bundled build dependency notices.
- **Vite, TypeScript and other build dependencies:** retain upstream licenses in
  installed packages. `frontend/package-lock.json` records the full dependency
  graph and integrity hashes; dependencies are installed, not vendored here.
- **Python dependencies and container bases:** retain their respective upstream
  licenses. Exact package versions and image digests are pinned in this repository.
  `releases/python-dependencies-linux.json` inventories the executed Linux runtime/test package
  metadata and installed license-file hashes. Test-only pytest, iniconfig and
  pluggy are isolated in requirements-test.txt and omitted from production images. This includes Psycopg LGPL-3.0 and
  Certifi MPL-2.0; those libraries retain their original licensing terms.
  Installed packages retain their upstream license texts and source obligations.
- **MODAVIS terminology and VAO:** preserved, attributed semantic resources in
  `backend/navigator_app/terminology_data`. The manifest retains the rights,
  source URLs and hashes of the individual resources. See also [Vocabulary
  documentation](docs/VOCABULARIES.md).
- **Navigator icon:** the small `frontend/public/navigator.svg` pipe drawing is
  MODAVIS-owned application artwork subject to the repository LICENSE. No external media
  binaries, fonts, photographs or private documents are bundled in this source tree.

Source evidence and historical observations are retained as data. The repository
license does not grant rights to download or republish external media binaries.

The small `fixtures/public-mini` records are entirely invented and distributed
under Apache-2.0. Its SQL files are unchanged copies of MODAVIS-owned Initiator
public projection migrations and the retained Navigator identity-ledger schema;
their exact source commits and SHA-256 hashes are in the fixture manifest.

Production images retain LICENSE, NOTICE and this document in
`/usr/share/licenses/modavis-navigator/`. When redistributing a standalone frontend
build outside those images, accompany it with the root LICENSE and NOTICE as well
as its included `THIRD_PARTY_LICENSES.txt`.

The optional export-validation resources in `backend/navigator_app/validation_data`
contain selected MODAVIS Ontology Network 0.1.0 shapes under CC BY 4.0. Their
license, source commit, original hashes, selected shapes and modifications are
recorded alongside them. These semantic resources retain their own license. GraphQL-core 3.2.12 is installed separately under its MIT license.
