# MODAVIS Navigator

MODAVIS Navigator is a research application for the **Pipe Organ Dataset (POD)**.
It is part of the **MODAVIS PhD project** by Dominik Ukolov. Researchers can explore
organs, builders, documented events, specifications, places, virtual instruments,
and vocabulary, and follow each record back to its evidence.

[Live application](https://navigator.modavis.org) · [Installation](docs/INSTALLATION.md) ·
[Research methods](docs/RESEARCH.md) · [Releases](CHANGELOG.md)

**Navigator 1.0.0** accompanies **POD 1.6.0**. These are independent versions:
updating the application does not rename or alter a dataset release. This repository
contains the public application and its reproducible setup, with a read-only database
connection. POD data is distributed separately through Zenodo.

## Run locally

Requirements: Docker Engine/Desktop with Compose v2, Python 3.12 or later, 8 GB
available RAM (16 GB recommended), and about 70 GB free for extracted data, the
restored database and container builds, in addition to retained downloads.
Linux and macOS are supported; Windows users can use WSL2.

1. Clone this repository and check out `v1.0.0`.
2. Obtain the matching POD files and the Navigator resources attachment as described
   in [Installation](docs/INSTALLATION.md).
3. Prepare a new runtime directory, then start the application:

```bash
python3 scripts/prepare.py \
  --package /path/to/pod-1.6.0-downloads \
  --resources /path/to/navigator-1.0.0-resources.tar.gz \
  --output /path/to/new-navigator-runtime
docker compose up -d --build
```

Open **http://localhost:8080** after `docker compose ps` reports a healthy backend.
The first start restores the database and verifies research files; allow several
minutes. An existing database volume is preserved on subsequent starts.

The POD 1.6.0 Zenodo record is still awaiting completion/publication at the time
of this software release. The installer already pins the exact expected files and
checksums. It also accepts those same files supplied locally; it does not silently
substitute an earlier dataset or claim an unpublished download is available.

## Included research features

- Source-attributed organ histories, specification accounts, places and actor dossiers.
- Structured JSON and semantic exports, retaining uncertainty and provenance.
- A vocabulary hub connecting controlled concepts, OMARO and observed source wording.
- Stop, division and event searches with related organs and complete-selection downloads.
- Builder networks, coverage comparisons and an evidence-based research workbench.
- Maps, contextual help, accessible disclosures and responsive record views.

Current POD content can run locally without the live Navigator. External source
media, external authority pages and geographic basemaps retain their own delivery
requirements. Earlier POD releases are separate archival inputs; an optional
[historical delivery configuration](docs/HISTORY.md) preserves access to their
original renderer instead of regenerating them with current code.

## Development and citation

See [Development](docs/DEVELOPMENT.md) for builds and tests. Cite the application
using [CITATION.cff](CITATION.cff), and cite the exact POD version separately when
reporting results. Original sources and independent vocabularies retain their
attribution and rights; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

The repository currently remains private, with rights reserved for original
application code. Third-party resources retain their own licenses.
