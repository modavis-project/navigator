# Public query and evidence profiles

## API quickstart

The [Navigator API guide](https://navigator.modavis.org/about/api) provides
public read-only REST examples and a runnable snapshot-pinned GraphQL request.
The [public API reference](../frontend/public/navigator-api.md) documents
endpoint families, request limits, errors, and downloads.
The examples require no account. To use another installation, replace the
origin with its address.

```sh
curl -fsS 'https://navigator.modavis.org/api/entities/search?q=Leipzig&limit=5'
curl -fsS 'https://navigator.modavis.org/api/organs/7PDZ-MDM0-0/specification'
curl -fsS 'https://navigator.modavis.org/api/exports/organ/7PDZ-MDM0-0'
```

Use `GET /api/pod/capabilities` to discover supported formats and the current
distribution manifest, `GET /api/health/capabilities` for serving status and
`GET /api/release-context` for the data version and scope.
The [POD Explorer data-access tools](https://navigator.modavis.org/pod-explorer?collection=data-access)
include an interactive GraphQL editor, entity exports and dataset downloads.

### Tuning system occurrences

`GET /api/temperaments` includes `occurrences.total`, `exactVariantCount` and
`familyWordingCount` for each catalogue entry. Use
`sort=occurrences_desc` or `sort=occurrences_asc` to sort by the selected
`occurrence_scope` (`all`, `exact` or `family`). Inclusive
`min_occurrences` and `max_occurrences` apply to the same count before
pagination. Both accept integers from 0 to 1,000,000.

For example, request
`/api/temperaments?sort=occurrences_desc&occurrence_scope=exact&min_occurrences=1&limit=10`
to list catalogue entries with exact matches, highest count first. Use
`/api/temperaments/2hKi2/organs?scope=family&limit=10` to read just the
related cohort. Its `organs.total` reflects the selected scope and the two
evidence counts reflect the whole record. Each organ is counted once per
catalogue entry, with exact wording taking precedence. Related counts may
overlap across entries and source wording does not verify current tuning.

Occurrence counts use the same published temperament assertions and technical
facts as the organ specification. Repeated projections of the same source
assertion count once. Original source expressions remain available. An opaque
source code stays visible in the specification and is excluded from catalogue
matches. A source wording link may use `scope=evidence` on the catalogue to
return only matches supported by that wording, rather than the broader results
of a manual catalogue search.

## Find stops documented together

Open the [disposition finder](/use-cases/research-workbench?view=dispositions)
to search two to four recorded stop names and optional foot pitches. The default
requires a distinct captured row for each criterion within one source account.
The named division scope also requires those rows to share a documented
division grouping. Results include the original wording, source paths,
capture qualification, and the exact account link and revision.

Use `GET /api/workbench/dispositions` with the `snapshot` value from
`/api/workbench/context`, `scope=account` or `scope=division`, and two to
four `stop` parameters. Each criterion uses `name|pitch` with an optional
pitch. For example, `stop=Principal%7C8&stop=Octave%7C4` requests Principal
8′ and Octave 4′. `page` is zero based. Counts for matching divisions,
accounts and organs use separate units.

`GET /api/workbench/dispositions/export` returns the complete bounded JSON
selection for the same filters and snapshot. The export includes a selection
digest and the query method binding. Searches and exports that exceed the
documented time, row or byte budget return an explicit error. The preview
read budget is 25 seconds and the export read budget is 30 seconds. A missing match
indicates absence from the captured selection only.

## Research selection parameters

Workbench requests reject unknown, repeated, incompatible or malformed query
parameters with HTTP 400. A filter has meaning only on its supported view and
research section. Snapshot, assessment and account-revision mismatches return
HTTP 409; a failed selection is not a complete empty result.

Successful selection responses distinguish `appliedFilters`, which affect
membership, from `navigationState`, which retains supported presentation and
comparison controls. The original v1 `filters` envelope and selection-digest
construction remain available for replay compatibility. Explicit tab changes
retain each visited view's query for the current workbench session and remove
inactive operands from the destination request. Share links retain their supplied
snapshot and revision bindings.

Global entity search reports returned cards separately from matching totals for
its supported organ, canonical-actor, place and documented-event scope. Group rows agree with the returned
flat list. A display such as “10 of 199 matches shown” is a bounded result page;
it does not claim that ten cards are the entire selection.

## Evidence coverage

`GET /api/exports/{kind}/{identifier}/evidence` indexes every leaf in the complete
publication-safe entity record and binds the result to its content SHA-256 and
release version. The Export panel links to this endpoint. Empty fields remain
listed. More than 20,000 fields or 40 nested levels are refused; no partial report
is presented as complete.

`evidence_context_available` means an existing evidence receipt is attached to
the containing object. `source_context_only` means a source identifier is
available without such a receipt. `unavailable` means no field evidence mapping
is present. Context is not automatic attribution to an individual field; this
report does not certify factual truth, source independence, or historical state.
Source wording, original receipts and their qualifications remain unchanged.

## Offline RDF validation

Run `PYTHONPATH=backend python scripts/validate_export.py entity.ttl` at export
admission. This bounded command accepts Turtle or N-Triples up to 16 MiB, performs
no network requests, and returns nonzero on failure or empty targets. Retain its
JSON report beside the export. No validation runs on ordinary page requests.
The report binds graph, shapes, upstream source manifest, validator versions and
actual focus counts. Structural conformance is not factual correctness.

The `modavis.navigator-native-export-check/v1` profile includes attributed,
hash-pinned MODAVIS Ontology Network 0.1.0 checks for organ-stop rank count,
nominal pitch designation and source URI, plus separate Navigator identity and
legacy-name checks. See `backend/navigator_app/validation_data/source-manifest.json`
for precise provenance and the retained CC BY 4.0 notice.

The current upstream NameShape requires a language-tagged name; historical POD
exports may contain plain strings. The compatibility shape permits either a
plain string or language-tagged string without inferring an unknown language.
A pass therefore does **not** establish full ontology-network conformance. Other
ontology requirements and CIDOC/EDM/Polifonia profiles need their own compatible
validation contracts. The supported runtime is pySHACL 0.30.1 / RDFLib 7.6.0,
explicit-data evaluation without inference. Independent second-engine agreement
has not been established for this narrowed profile.

## Read-only GraphQL

`POST /api/graphql` exposes `snapshot`, `entity(kind,id)` and paginated `organs`.
The same public readers used by REST supply results. Available entity fields are
`id`, `kind`, `title`, `canonicalUri`, and `evidence`; available organ-card fields
are `id`, `title`, `canonicalUri`. Evidence provides counts and the record hash.
No arbitrary JSON or database surface is exposed.

The evidence coverage budget applies when a query requests the `evidence`
field. Entity metadata remains available for records that exceed that budget.

The runtime must have a configured, verified research workbench. Obtain its
`publicCoreSha256` from `/api/workbench/context` and send it as the request's
`snapshot` field alongside `query`, optional `variables` and `operationName`:

```json
{
  "snapshot": "<exact publicCoreSha256 from the running instance>",
  "query": "query($id: ID!) { entity(kind: organ, id: $id) { id title evidence { unavailable sourceContextOnly evidenceContextAvailable } } }",
  "variables": {"id": "<public organ identifier>"}
}
```

The profile permits one query, four root fields, 50 organ cards per field,
10,000 maximum offset, bounded document/token/AST depth and a 2 MiB response.
GraphQL shares the standard ten-second public read deadline, which limits
PostgreSQL connection waits and statements and is checked before returning.
Introspection, fragments, directives, subscriptions
and mutations are unavailable. Results are refused if the snapshot changes.
This is a small GraphQL profile, not a replacement for every REST endpoint.

Vector retrieval remains deferred: there is no frozen, independently reviewed
relevance set demonstrating improvement over existing lexical retrieval for
MODAVIS's source-sensitive questions. Adding a model/index without this evidence
would increase installation cost and introduce unqualified relevance rankings.
The existing lexical search remains the supported baseline.


## Ranked literal discovery

`GET /api/entities/search?q=...` matches all whitespace-separated terms in the
same name or searchable text, in any order. It ranks exact identifiers, exact
names, name prefixes and contiguous name phrases ahead of other multi-term name
matches. SQL wildcard characters `%`, `_`, and backslash are searched literally.
`GET /api/organs?q=...` uses the same term matching in the organ search document.
Counts describe records in the searched projections. Event counts describe
assertions and may include several descriptions of one historical event.
Each card gives a match explanation and its public detail link. Explicit catalogue
sorts remain separate from discovery relevance. The response names searched kinds
and returns a snapshot-bound `queryIdentity`.

Research responses also provide `semanticQuery` under
`modavis.semantic-query/v2`. This identity binds effective query operands and the
selected dataset, policy and transformation identities. Page numbers, presentation
state and pair-selection controls do not change cohort identity. The existing v1
selection digests remain available; v2 does not reinterpret an old digest.

## Portable research workspace

The public workspace retains up to 20 views, 12 records (including at most four
organs), and two exact source-account revisions in local browser storage. Its
JSON file uses `modavis.research-workspace/v2` and is limited to 128 KiB. Import
validates public routes, bindings, identifiers, revisions and cardinalities.
Removal and replacement offer undo. No account or server write is required.

POD records, accounts and ordinary research views retain the workspace’s POD and
assessment snapshots. Saved vocabulary references carry independent bindings:

| Saved reference | Retained binding |
| --- | --- |
| Controlled vocabulary | Scheme content SHA-256 and, for a term, its exact scoped code |
| Candidate terminology | Registry SHA-256, mapped public-core and occurrence-index SHA-256 values, and any selected concept URN |
| Published MODAVIS or VAO reference | Collection, original source Turtle SHA-256 and any selected resource URI |
| OMARO | Reference snapshot SHA-256 and any selected resource URI or browsing scope |

Reference-only workspaces have no POD snapshot. A verified POD context is attached
only when a user explicitly keeps a POD record, account or ordinary view. An
existing POD binding is never silently replaced. When an imported workspace’s POD
snapshot differs from the current one, its POD links and comparisons remain
locked; independently pinned vocabulary links can still be opened. The reader
refuses unavailable reference versions without substituting current data.

Existing version 1 files are validated and migrated in memory, preserving their
records, accounts and views. Reading alone does not rewrite browser storage. On
the first persisted upgrade, the original value is backed up once under
`modavis.research-workspace.v1.backup`; an existing backup is not overwritten.
Export a workspace file for recovery outside that browser. If a write fails, the
open copy remains exportable and the UI reports that it is memory-only rather
than claiming it was saved durably. Unreadable stored data requires an explicit
verified import or new-workspace choice before replacement.

The contextual vocabulary save action and **Save current view** retain the loaded
record’s exact binding and filters. A vocabulary-directory save is a navigation
bookmark, not a frozen selection across its independently versioned collections.
See [saving and reopening a term](VOCABULARIES.md#saving-a-term-and-returning-to-its-evidence).

`GET /api/workbench/organ-comparison?organs=...&snapshot=...` compares two to four
existing organ records. It reports separate source memberships, configuration
accounts, event assertions, qualified dates and technical assertions. It establishes
neither independent corroboration nor physical continuity. JSON previews expose
completeness flags and at most 100 accounts and technical assertions per organ.
`format=ro-crate` obtains complete nested evidence with a combined 50,000-record
and 32 MiB payload budget; exceeded limits are refused explicitly. Workspace files
retain navigation; research packages retain the selected evidence for offline replay.

## POD capability explorer

`/pod-explorer` provides filtered browsing of nine public collections, a capability
inventory, a snapshot-bound GraphQL editor, entity semantic-profile exports and
evidence/source lookup. Source and place directories are available through
`/api/pod/sources` and `/api/pod/places`. Organ Related panels use
`/api/pod/organs/{identifier}/resources` to show evidenced virtual-instrument links
and separately attributed temperament wording. Scores and literature remain
independent collections where the projection provides no explicit organ relation.
Functional pipe positions do not establish physical geometry. External media
rights and availability remain separate from compilation rights.

## Availability and bounded reads

Public reads share a whole-request database/preparation deadline. Caller timeout
headers may shorten that deadline. Capacity failures and timeouts return controlled,
retryable errors; a successful empty result has a different meaning. In-memory
caches have entry, byte and age limits and bind server results to the selected
snapshot. Per-reader browser cancellation does not cancel another reader's shared
request. Mutation/authentication flows invalidate browser reuse.

Readiness reports per-capability availability, including catalogue, identity ledger,
research readers, vocabulary reference, semantic distributions and map capability.
Startup verification and current resource-identity checks do not claim that every
external source or media link is available or newly reviewed. A healthy catalogue
can coexist with an explicitly unavailable optional research resource.
