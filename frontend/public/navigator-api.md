# MODAVIS Navigator public API

The Navigator exposes the public Pipe Organ Dataset (POD) through read-only HTTP endpoints. REST uses `GET`. GraphQL uses `POST` for queries. Public reads require no account or access token.

This reference describes the current Navigator public profile. Dataset versions and application versions are separate. An installation may omit optional collections, research indexes, reference datasets or historical releases. Check [runtime discovery](#runtime-discovery) on the installation you use.

## Quickstart

Set the base address to the public service or your local Navigator. These shell examples use curl and, where shown, jq. The GraphQL example uses Python 3 and its standard library.

```sh
BASE=https://navigator.modavis.org
# For the local preview, use BASE=http://127.0.0.1:5280

curl -fsS "$BASE/api/release-context" | jq '{releaseVersion, capabilities}'

curl -fsS --get "$BASE/api/entities/search" \
  --data-urlencode 'q=Leipzig' \
  --data-urlencode 'kinds=organs,places' \
  --data-urlencode 'limit=5' |
  jq '{items, counts, hasMore}'
```

Use the record identifier or returned API link to open a result. The Nikolaikirche organ has short identifier `7PDZ-MDM0-0` and full identifier `MDVS:ENTY:7PDZ-MDM0-0`. Many organ routes accept either. Use the identifier returned by the relevant collection for scores, literature, tuning systems, vocabulary entries and source records. URL-encode opaque path identifiers or query values as needed.

```sh
ORGAN=7PDZ-MDM0-0
curl -fsS "$BASE/api/organs/$ORGAN" | jq '.organ | {mdvsId, title, citation}'
curl -fsS "$BASE/api/organs/$ORGAN/specification" |
  jq '{specificationDescriptions, technicalEvidence}'
```

## Pagination and filters

Most catalogues use zero-based `offset` with a bounded `limit`. Read the effective `offset` and `limit` from the response when present. Compare `offset + len(items)` with `total` or check `hasMore`. Follow the endpoint’s own envelope and count unit. For example, linked temperament organs are nested under `organs`.

```sh
curl -fsS --get "$BASE/api/organs" \
  --data-urlencode 'q=Leipzig' \
  --data-urlencode 'sort=stops' \
  --data-urlencode 'limit=10' \
  --data-urlencode 'offset=10' |
  jq '{total, limit, offset, returned: (.items | length)}'
```

Keep the same filters and sort when requesting another page. Common catalogue routes clamp numeric limits, while strict readers reject out-of-range values. Workbench and research analysis use zero-based `page` rather than `offset`. Global entity search is a ranked preview with a limit from 1 to 50 and no offset. Use a dedicated catalogue to page a single collection. Complete-selection exports are separate from interactive pages.

Send literal text in `q` or `term`. Pass filters as named parameters, using `true` or `false` for booleans. Strict readers reject unknown, repeated, incompatible or malformed parameters. The disposition finder specifically accepts repeated `stop` parameters.

## Responses and errors

JSON is the default for API reads. Downloads may instead return CSV, RDF, ZIP, or map tile media types. Respect `Content-Type`, `Content-Disposition` and any fixity headers. Where `ETag` is supplied, a conditional GET can return HTTP 304 with no response body.

| Status | Meaning and client action |
| --- | --- |
| `200` | Read succeeded. Zero matches are represented by the endpoint’s count or an empty list. |
| `304` | A conditional request matched the existing representation. Reuse the cached bytes. |
| `400` | Check query names, values, ranges and request shape. GraphQL may also refuse execution with an `errors` array. |
| `403` | A requested operation or mode is outside the public reader’s scope. |
| `404` | The record, route, requested format or dataset version is unavailable. |
| `405` | Use the documented HTTP method. GraphQL accepts `POST`. |
| `409` | A supplied snapshot, assessment or revision does not match the available binding, or the binding changed during the read. Recover the exact requested version before replaying the request. |
| `413` | A request, response or field-evidence budget was exceeded. Narrow the query or use a smaller projection. |
| `422` | A bounded research result or package exceeded a selection or payload budget. Narrow the selection. |
| `503` | A capability, dependency or read capacity is unavailable. Inspect capability status and honor `Retry-After` if supplied. |
| `504` | The read exceeded its time budget. Narrow it or retry after the indicated delay. |

Most REST errors provide an `error` string. Some also include a `message`, `retryable` flag or contract identifier. GraphQL can return an `errors` array instead. A refusal does not establish that a selection has zero results. Check HTTP status before parsing data. If a proxy responds with HTML, handle it as a transport or installation error.

The optional `X-Request-Timeout-Ms` header accepts a positive integer in milliseconds. It can shorten the server’s read budget. `X-MODAVIS-Query-Budget-Ms` and `Server-Timing` report the assigned read budget and server timing where available.

## Runtime discovery

| GET path | Use |
| --- | --- |
| `/api/health/live` | HTTP process liveness. |
| `/api/health/ready` | Public runtime readiness, with HTTP 503 if required capabilities are unavailable. |
| `/api/health/capabilities` | Per-capability status, distribution availability and related readiness information. |
| `/api/release-context` | Dataset version, public scope and application capabilities. |
| `/api/pod/capabilities` | Public collection availability and count units. Its `dataAccess` object advertises GraphQL, export kinds, profiles and the versioned distribution manifest. |
| `/api/discovery/context` | Scope and corpus counts used in ranked discovery. |
| `/api/uri-policy` | Canonical URI, delivery origin and release policy. |
| `/api/workbench/context` | Current verified research bindings, facets, export limit and research package availability. |

## Catalogue and record endpoints

All paths below use GET. The listed operands are public reader filters. The optional catalogue facets and runtime capability responses provide the available values in the current dataset.

| Path | Query parameters and response |
| --- | --- |
| `/api/explore` | `q`, `limit`. Browse summaries and discovery counts. |
| `/api/entities/search` | `q`, `kinds` (comma-separated `organs,people,places,events`), `limit` (default 12, range 1–50). Returns ranked `items`, `counts`, `groups`, `hasMore` and query identity. |
| `/api/organs` | `q`, `source`, `builder`, `location_state`, `media_state`, `conflict_scope`, `specification_state`, `event_type`, `virtual_instrument`, `sort`, `include_facets`, `limit`, `offset`. The catalogue can sort by `stops`, `sources`, `media` or name. |
| `/api/organs/facets` | Organ catalogue facet values and counts. |
| `/api/organs/{id}` | Organ record under `organ`. Retrieve the specialist bundles below as needed. |
| `/api/organs/{id}/citation` | Citation under `citation`, including release metadata and BibTeX where supplied. |
| `/api/organs/{id}/sources` | Source membership and public source links. |
| `/api/organs/{id}/specification` | Captured specification and components, separately attributed descriptions, technical evidence and comparison groups. |
| `/api/organs/{id}/specification-descriptions/{description_id}` | One source description under `description`. Supply its `revision` to refuse a changed record. Take both identifiers from the specification bundle. |
| `/api/organs/{id}/history`, `/api/organs/{id}/related`, `/api/organs/{id}/media` | Source-attributed history, related records and media references respectively. |
| `/api/organs/{id}/pipe-positions` | `component_id` required, optional `reference_id`, `limit` (default 100, range 1–200), `offset`. Functional pipe positions are calculated where supported by captured specification data. |
| `/api/pipe-positions/{reference_id}` | `organ_id` and `component_id` required. Functional reference detail with its retained evidence. |
| `/api/pod/organs/{id}/resources` | Source-backed resource inventory, related virtual instruments and documented temperament wording. |
| `/api/persons` | `q`, `source`, `publication_state`, `role`, `entity_class`, `sort`, `limit`, `offset`. Directory entries include unresolved source mentions. |
| `/api/entities/{category}/{id}` | Categories `people`, `persons`, `organizations`, `institutions` and `source-actors`. Use `view=summary` or `full` for canonical actor dossiers. |
| `/api/actors/{id}/mentions`, `/api/actors/{id}/relationships` | Actor evidence pages with `q`, `limit` (1–100) and `offset`. |
| `/api/entities/names/{id}` | Structured name under `name`. |
| `/api/events` | `q`, `participant` (canonical actor ID), `subject`, `type`, `route` (transfer endpoint evidence or map availability), `source`, `year_from`, `year_to`, `sort` (`newest`, `oldest`, `type`), `limit`, `offset`. |
| `/api/events/{id}` | One documented event assertion. Separate assertions may describe the same historical event. |
| `/api/pod/places`, `/api/places/{id}` | Place directory (`q`, `kind`, `limit`, `offset`) and place detail. |
| `/api/pod/sources` | Source directory with `q`, `source`, `limit` and `offset`. POD place and source directories use `limit` 1–50 and `offset` 0–10,000. |
| `/api/public/sources/{id}`, `/api/public/sources/{id}/structured.json` | Public source record and its publication-safe structured projection. |
| `/api/literature`, `/api/literature/status` | Bibliography, with `q`, `source`, `collection`, `year_from`, `year_to`, `publication_type`, `author`, `venue`, `volume`, `container_type`, `confidence`, `digitized`, `sort`, `limit`, `offset`. The status endpoint reports availability. |
| `/api/literature/{id}` | One bibliographic record with retained source and access links. |
| `/api/scores` | Score catalogue with `q`, `collection`, `format`, `evidence_strength`, `analysis_status`, `sort`, `limit`, `offset`. |
| `/api/scores/{id}`, `/api/scores/{id}/assets/{asset_id}` | Score and asset metadata, formats and available analysis. Follow supplied access links for files. |
| `/api/virtual-instruments`, `/api/virtual-instruments/status` | Virtual instrument catalogue and availability. Catalogue filters include `q`, `producer`, `platform`, `access_category`, `license_category`, `catalog_status`, `country`, `granularity`, `independently_distributed`, `link_state`, `organ_link`, `limit`, `offset`. |
| `/api/virtual-instruments/{id}` | Virtual instrument metadata and qualified organ relationships. |

For transfers, `route` accepts `origin`, `destination`, `either` or `both` to select documented places by role. `mapped` and `unresolved` select by schematic map-connection availability. `transferEndpoints` groups places by their recorded role. Adding `q` to a transfer selection also searches those endpoint names. A place link identifies the reported place, while a map connection requires two coordinates bound to the historical evidence.

Published source membership gives attribution. It does not establish independent corroboration, continuity of physical fabric or present condition. Functional pipe positions do not establish physical pipe geometry. Media and scores may point to external resources with their own rights and availability.

## Tuning systems

| GET path | Query parameters and response |
| --- | --- |
| `/api/temperaments` | `q`, `group_key`, `precise_variant`, `commentary_available`, `commentary_q`, search `scope`, occurrence parameters, `limit`, `offset`. The list returns occurrence counts with each entry. |
| `/api/temperaments/{id}` | Catalogue entry, cent values, commentary and related catalogue variants where available. |
| `/api/temperaments/{id}/organs` | `scope` accepts `all`, `exact` or `family`. `limit` defaults to 200 (range 1–500), and `offset` is 0–100,000. The `organs` object includes the filtered page, its total, unfiltered category counts and source assertions. |

On the catalogue, `sort=catalogue|occurrences_desc|occurrences_asc` applies to the count chosen by `occurrence_scope=all|exact|family`. Inclusive `min_occurrences` and `max_occurrences` bounds accept integers from 0 to 1,000,000. Filtering happens before pagination. Search `scope=evidence` constrains catalogue results to supported source wording, independently of the occurrence count scope.

```sh
curl -fsS "$BASE/api/temperaments?sort=occurrences_desc&occurrence_scope=exact&min_occurrences=1&limit=5" |
  jq '{total, filters, occurrences: [.items[].occurrences]}'

curl -fsS "$BASE/api/temperaments/2hKi2/organs?scope=family&limit=5" |
  jq '.organs | {scope, total, exactVariantCount, familyWordingCount, hasMore, items}'
```

An exact assertion identifies the catalogue variant. Related wording may identify a family or leave precision unspecified. Within one catalogue entry an organ is counted once, with exact wording taking precedence. Related occurrences can overlap across catalogue entries. Source wording alone does not verify a present-day tuning.

## Research snapshots and queries

Use `GET /api/workbench/context` to obtain `publicCoreSha256` and other binding hashes. Supply `snapshot=<publicCoreSha256>` for reproducible workbench reads. Supply `assessment=<occurrenceAssessmentSha256>` where the identity assessment is part of your question. Record the query operands and returned `semanticQuery` and `selectionSha256` when supplied. Presentation and pagination can be separate from semantic selection identity.

```sh
SNAPSHOT=$(curl -fsS "$BASE/api/workbench/context" | jq -er '.publicCoreSha256')

curl -fsS --get "$BASE/api/workbench/selection" \
  --data-urlencode "snapshot=$SNAPSHOT" \
  --data-urlencode 'section=configurations' \
  --data-urlencode "organ=$ORGAN" \
  --data-urlencode 'page=0' |
  jq '{total, limit, offset, hasMore, semanticQuery, items}'
```

| GET path | Query parameters and response |
| --- | --- |
| `/api/workbench/selection`, `/api/workbench/selection/export` | Choose `section` from `events`, `sequences`, `configurations` and `organs`. Filters and count units depend on the section. Interactive pages hold up to 50 records. Export formats are JSON, CSV and RO-Crate when available. |
| `/api/workbench/account/{description_id}` | One configuration account with exact `revision` binding when supplied. |
| `/api/workbench/compare` | `left`, `right` distinct account IDs, with `leftRevision` and `rightRevision` pins. Returns both attributed accounts and captured-entry comparison. |
| `/api/workbench/organ-comparison` | `organs` is a comma-separated list of two to four organ IDs. Returns separate account, source, event and technical evidence for each organ. The JSON preview reports when evidence is bounded. |
| `/api/workbench/timeline/{organ_id}`, `/api/workbench/claims/{organ_id}` | Documented events and configurations, or claims grouped by retained source. |
| `/api/workbench/terms`, `/api/workbench/terms/export` | `mode`, `q`, `concept`, `pitch`, `country`, `source`, `from`, `to`. Discover supported term kinds in workbench facets. |
| `/api/workbench/identities` | Verified public identity audit summary. |
| `/api/workbench/occurrences`, `/api/workbench/occurrences/export` | Occurrence-level identity evidence with `event`, `actor`, `native`, `organ`, `source`, `status`, `kind` where the assessment is available. |
| `/api/workbench/dispositions`, `/api/workbench/dispositions/export` | Source-account or division co-occurrence of captured stops. See [disposition finder](#disposition-finder). |
| `/api/research/context`, `/api/research/stories`, `/api/research/identity-audit` | Research index binding, data stories and identity audit. |
| `/api/research/stop-names`, `/api/research/stop-names/download` | Recorded stop-name research. The list uses `q`, `country` and zero-based `page` of 20. The download is the prepared research artifact. |
| `/api/research/actors`, `/api/research/actors/{id}` | Research actor search (`q`, `page`) and a focal actor summary. |
| `/api/research/actors/{id}/{section}` | `neighbors`, `organs`, `events`, `configurations` or `sequences`. Uses `q` and `page`. For shared organs, joint events or ordered work, `other` is the second actor. |
| `/api/research-exploration/terms/{family}`, `/api/research-exploration/terms/{family}/export` | Term distributions for supported families. Parameters include `term`, `match`, `source`, `dimension`, `zeros`, `page`, `snapshot`, `analysis`. Export formats include JSON and CSV. |
| `/api/research-exploration/network`, `/api/research-exploration/network/export` | Focal `actor` with `mode` of `shared`, `joint`, `earlier` or `later`, plus `page`, `snapshot` and `assessment`. Network exports use JSON or RO-Crate when available. |

Workbench selection applies `actor`, `organ`, `q` and `source` across supported sections. Events and sequences additionally support `other`, `from`, `to`, `date`, `activity`, `role` and `identity`. Sequences require two actors. Configurations additionally support `from`, `to`, `date` and `coverage`. Organ selection supports `other`. At least one actor, organ, source or search text is required. Workbench date filters take years from 1 to 2100. Read `appliedFilters` for what narrowed membership and `navigationState` for retained view settings.

Standard workbench selection exports are bounded to 50,000 records. RO-Crate requires an exact current snapshot and an enabled package capability. Supported package routes include the complete workbench selection, terms and occurrence exports, source-account and organ comparisons, identity, account, timeline and claim reads, and research exploration or terminology usage exports. Packages include selections, metadata, rights, checksums and replay instructions. They refuse incomplete or oversized evidence. The 32 MiB package payload limit is distinct from an interactive page limit.

### Disposition finder

`GET /api/workbench/dispositions` requires an exact `snapshot` and two to four repeated `stop` parameters. Each criterion is a stop name from 1 to 100 characters, optionally followed by a vertical bar and up to 24 characters of foot-pitch notation. Omit the pitch to search the name alone. The default `scope=account` requires distinct captured rows in one source account. `scope=division` additionally requires a shared documented named division.

```sh
curl -fsS --get "$BASE/api/workbench/dispositions" \
  --data-urlencode "snapshot=$SNAPSHOT" \
  --data-urlencode 'scope=account' \
  --data-urlencode 'stop=Vox Humana|8' \
  --data-urlencode 'stop=Quintadena|16' \
  --data-urlencode 'page=0' |
  jq '{total, unit, accountCount, organCount, selectionSha256, hasMore, items}'

curl -fsS --get "$BASE/api/workbench/dispositions/export" \
  --data-urlencode "snapshot=$SNAPSHOT" \
  --data-urlencode 'scope=account' \
  --data-urlencode 'stop=Vox Humana|8' \
  --data-urlencode 'stop=Quintadena|16' \
  --output disposition-selection.json
```

Interactive pages contain up to 50 matches. `total` counts the selected unit, while `accountCount` and `organCount` deduplicate their own units. The results retain the account revision, source paths, raw wording, and captured rows supporting each operand. The selection hash identifies the normalized criteria, scope, query method and bindings. The response also supplies `X-Selection-SHA256`. The JSON-only export returns the complete bounded selection, irrespective of the interactive page.

The search caps matching rows at 100,000. An export also caps combined matches and evidence rows at 50,000 and JSON at 32 MiB. The preview has a 25-second read budget and the export has 30 seconds. A budget refusal is explicit. The match describes source capture, including separately indicated recovered rows. It establishes neither present condition nor absence of uncaptured stops.

## Vocabularies and independent references

Use `/api/vocab/catalogue` to discover supported collections and their bindings. A controlled concept, a candidate, a schema category, a captured source wording and an independent reference resource have different evidence and version scope.

| GET path | Query parameters and response |
| --- | --- |
| `/api/vocab/catalogue`, `/api/vocab/overview`, `/api/vocab/schemes` | Collection inventory, count summary and scheme directory. |
| `/api/vocab/releases` | Public vocabulary release directory. This profile may only bundle vocabulary with the POD. |
| `/api/vocab/concepts` | `scheme_code`, `q`, `language`, `limit` (1–500), `offset`, `snapshot`. A snapshot identifies a controlled scheme’s content and requires that scheme. |
| `/api/vocab/concepts/{id}` | Concept or category detail. Optional `scheme_code` and controlled-scheme `snapshot`. |
| `/api/vocab/snapshots/{scheme}`, `/api/vocab/snapshots/{scheme}.{format}` | Snapshot metadata or download in `json`, `jsonld`, `ttl`, `skos` or `csv`. Optional `snapshot` pins the scheme’s content SHA-256. |
| `/api/vocab/source-terms/{id}` | A public source-term record, where available. |
| `/api/vocab/usage/{family}`, `/api/vocab/usage/{family}/export` | Recorded source wording or occurrence evidence. Use `q` for wording search or `term` with `match=exact` or `contains`. Supports `source`, `organ_q`, `section`, `sort`, `dimension`, `bucket`, `page` and a POD `snapshot` on applicable views. Browse 30 per page. Use catalogue family identifiers. |
| `/api/vocab/registry`, `/api/vocab/registry/concept`, `/api/vocab/registry/export` | Candidate registry. List and export filter by `scheme`, `q`, `language`. Detail uses `uri`. List pagination is `offset` and `limit`. Export formats are `json`, `csv`, `jsonld`, `ttl` and `skos`. Pins are `snapshot` (registry), `coreSnapshot` (POD), and `indexSnapshot` (research index). |
| `/api/vocab/references`, `/api/vocab/references/{code}` | Independent reference directory and collection search. Collection parameters are `q`, `kind`, `scheme`, `language`, `offset`, `limit`, and its own `snapshot`. |
| `/api/vocab/references/{code}/concept`, `/api/vocab/references/{code}/download/{extension}` | Reference detail by `uri` and optional `language`, or a version-pinned advertised distribution. |
| `/api/omaro`, `/api/omaro/concepts`, `/api/omaro/concept`, `/api/omaro/download/{key}` | OMARO version metadata, browse, resource by `uri`, and original distributions. Browse accepts `collection` of `instruments`, `hs` or `ontology`, plus `q`, `offset`, `limit` (1–100), `snapshot`, and where applicable `language` and `resolution`. The OMARO snapshot is independent of the POD. |

```sh
curl -fsS --get "$BASE/api/vocab/usage/stops" \
  --data-urlencode "snapshot=$SNAPSHOT" \
  --data-urlencode 'term=Vox Humana' \
  --data-urlencode 'match=exact' |
  jq '{total, counts, publicCoreSha256, hasMore}'
```

An accepted lexical mapping does not promote a candidate to a controlled concept. Reference records do not assign classifications to POD organs by name matching. A recorded-label language filter changes the requested data projection and is independent of Navigator’s interface language.

## Maps and identifier resolution

| GET path | Use |
| --- | --- |
| `/api/map/summary.json`, `/api/map/places.geojson` | Map counts and site groups. `precision` accepts `all`, `exact` or `fallback` and defaults to exact. The GeoJSON reader accepts `bbox=west,south,east,north`, `limit` and `compact`. |
| `/api/map/nearby.json` | Check for matching site groups within a required `bbox`. |
| `/api/map/group-at.json`, `/api/map/groups/{site_group_id}` | Site group at `longitude` and `latitude`, or page through an identified group with `offset` and `limit`. |
| `/api/map/tiles/{z}/{x}/{y}.mvt` | Vector tile, optionally bound by `release`. Uses map precision and supported catalogue filters. |
| `/api/map/movements.geojson`, `/api/map/coordinate-relocation-summary.json` | Retained movement and relocation evidence. Movement filters include `datetime`, `movement` and `movement_type`. |
| `/api/map/project.geolibre.json` | GeoLibre project for `mode=places` or `mode=events`. |
| `/api/organs/{id}/map-context.geolibre.json`, `/api/actors/{id}/activity-map.geolibre.json` | Record-specific map project where geographic evidence is available. |
| `/api/id/{identifier}`, `/api/id/{identifier}/publication-status` | Public identity resolution and publication state. |
| `/api/aliases/{kind}/{slug}` | Resolve a supported public alias to its canonical record. |
| `/resolve/{family}/{token}`, `/resolve/alias/{kind}/{slug}` | HTTP resolver routes. Follow the redirect and preserve the returned canonical identity. |

Map site groups, approximate localities, coordinates and organ records have distinct count units. An approximate coordinate does not identify an instrument’s precise location. Movement lines retain qualified source observations and do not reconstruct travelled paths.

## Entity exports and evidence

`GET /api/exports/{kind}/{id}` returns the export manifest, including versioned `native` and `profiles` links, `datasheetUrl` and `sourceDataUrl` where available. Use the entity kinds advertised by `/api/pod/capabilities`; the public profile includes `organ`, `person`, `organization`, `place`, `name` and `virtual_instrument`. Native MODAVIS representations include JSON-LD, Turtle, N-Triples and RDF/XML where provided. Semantic profiles include CIDOC CRM, Polifonia Ontology Network and Europeana Data Model.

```sh
curl -fsS "$BASE/api/exports/organ/$ORGAN" | jq '{mdvsId, native, profiles, sourceDataUrl}'

TURTLE=$(curl -fsS "$BASE/api/exports/organ/$ORGAN" |
  jq -er '.native[] | select(.key == "turtle") | .url')
curl -fsS "$BASE$TURTLE" --output nikolaikirche.ttl

curl -fsS "$BASE/api/exports/organ/$ORGAN/evidence" |
  jq '{releaseVersion, complete, recordSha256, fieldCount, states}'
```

`GET /api/exports/{kind}/{id}/sources` indexes the structured public source projections. The evidence endpoint `/api/exports/{kind}/{id}/evidence` provides a JSON Pointer inventory of fields in the complete publication-safe export record. It returns `releaseVersion`, `recordSha256`, `fieldCount`, `complete`, `states`, and the individual `fields`. HTTP 413 refuses records that exceed 20,000 fields or the nesting budget. The digest describes the export record, not the bytes of every RDF serialization.

| Evidence state | Meaning |
| --- | --- |
| `evidence_context_available` | The containing object has an attached evidence receipt. |
| `source_context_only` | A source identifier is available without such a receipt. |
| `unavailable` | No evidence mapping is present for the field. |

These states describe evidence context, not automatic field attribution, factual verification or independent corroboration. Original source rights still govern media and text.

### Dataset downloads and content negotiation

`GET /api/pod/capabilities` advertises `dataAccess.distributionManifest`. Read this manifest to discover versioned distribution paths, formats, rights and checksums. The versioned delivery family includes:

- `/dataset/pod/version/{version}/distribution-manifest.json`
- `/dataset/pod/version/{version}/distributions/...`, with complete file paths from the manifest
- `/dataset/pod/version/{version}/schema/public-source-projection-1.0.json`
- `/dataset/pod/version/{version}/{family}/{artifact}`, with exact per-entity paths from its export manifest
- `/dataset/pod/dataset.{profile}.jsonld` and the equivalent under `/dataset/pod/version/{version}/`, for advertised dataset profiles
- `/dataset/pod/dataset.edm.xml` and its versioned equivalent for EDM RDF/XML

Follow the manifest’s advertised URL and verify the associated SHA-256 for a downloaded distribution. Choose the exact version and profile needed for reproducibility. Earlier versions are served only when configured and available.

The public identifier resolver and dataset identifier routes return an HTTP redirect. Browser-style requests resolve to human-readable routes. `Accept: application/ld+json` requests linked data; `Accept-Profile` can select an available profile. The resolver interprets `Accept: application/rdf+xml` as EDM. For an exact format such as Turtle, use the export manifest’s direct URL. REST catalogue URLs use JSON independent of those resolver profiles.

```sh
curl -fsS -D - --output /dev/null \
  -H 'Accept: application/ld+json' \
  "$BASE/resolve/entity/$ORGAN"
```

## GraphQL

`POST /api/graphql` accepts a JSON body with required `snapshot` and `query`, and optional `variables` and `operationName`. Set `Content-Type: application/json`. Read `publicCoreSha256` from the workbench context. GraphQL exposes only its documented read schema.

| Root field | Shape |
| --- | --- |
| `snapshot` | The verified public-core SHA-256. |
| `entity(kind: EntityKind!, id: ID!)` | A public entity or null if absent. Fields are `id`, `kind`, `title`, `canonicalUri` and `evidence`. Entity kinds are `organ`, `person`, `organization`, `place`, `name` and `virtual_instrument`. |
| `organs(query: String, limit: Int = 20, offset: Int = 0)` | `total` and `items`. Organ cards contain `id`, `title` and `canonicalUri`. |

The `evidence` field contains `fieldCount`, `unavailable`, `sourceContextOnly`, `evidenceContextAvailable` and `recordSha256`. Metadata requests that omit evidence avoid its field-count budget. Requesting over-budget evidence returns HTTP 400 with a GraphQL `errors` array and an evidence path.

```sh
BASE="$BASE" python3 - <<'PY'
import json
import os
from urllib.request import Request, urlopen

base = os.environ["BASE"]
with urlopen(base + "/api/workbench/context", timeout=15) as response:
    snapshot = json.load(response)["publicCoreSha256"]

payload = {
    "snapshot": snapshot,
    "operationName": "OrganAndPage",
    "query": """
      query OrganAndPage($id: ID!, $text: String!) {
        entity(kind: organ, id: $id) { id title canonicalUri }
        organs(query: $text, limit: 5, offset: 0) {
          total
          items { id title canonicalUri }
        }
      }
    """,
    "variables": {"id": "7PDZ-MDM0-0", "text": "Huy-Aderstedt"},
}
request = Request(
    base + "/api/graphql",
    data=json.dumps(payload).encode("utf-8"),
    headers={"Content-Type": "application/json"},
    method="POST",
)
with urlopen(request, timeout=15) as response:
    print(json.dumps(json.load(response), indent=2))
PY
```

Successful responses have `data` and `extensions`. The extensions carry `snapshot` and profile `modavis.public-read-only-graphql/v1`. Retain the query, variables and exact snapshot with the result. HTTP 409 indicates a snapshot mismatch or change. HTTP 503 can indicate that a verified workbench is unavailable.

The profile allows one query operation with up to four root fields. The organ list allows 1–50 cards per field and offset 0–10,000. Entity IDs and organ search strings are limited to 256 characters. The request body is limited to 32 KiB, the GraphQL document to 12,000 characters and 1,000 parser tokens, and the response to 2 MiB. Structure is bounded to 250 AST nodes and depth 14. GraphQL shares the standard ten-second public read budget. An expired read returns HTTP 504 without partial data. Mutations, subscriptions, fragments, directives and introspection are refused.

## Verify the examples locally

From a Navigator checkout, run the standard-library smoke check against a local preview with the public POD example records and workbench enabled. It checks the reference download, catalogue paging, entity exports, a complete disposition selection, a GraphQL response, and refusal of invalid parameters and snapshots.

```sh
python3 scripts/check_public_api_examples.py --base http://127.0.0.1:5280
```
