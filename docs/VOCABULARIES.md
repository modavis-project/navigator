# Reading and reusing vocabularies

The vocabulary directory at `/vocab` separates five kinds of material. Their
counts have different units and must not be added into one concept total.

| Collection | Meaning | Reading workflow |
| --- | --- | --- |
| POD controlled concepts | Terms already governed by the selected POD | Browse a scheme, search its recorded wording, then read definitions, labels and public usage. |
| Schema categories | Categories used to describe the data model | Read the category separately from controlled concepts. |
| Candidate terminology | Existing proposals and field-specific source matching rules | Read the candidate definition, lifecycle, evidence and original rule before following wording usage. |
| Source wording | Verbatim designations and their public occurrences | Choose a field, search literal wording, inspect source records and qualified organ accounts. |
| Published references | Independently versioned MODAVIS, VAO and OMARO resources | Browse source concepts or model resources, then retain the source version, rights and original distribution. |

## Searching and reading

The directory provides bounded previews and named continuation links. A preview
is not a search across every occurrence field: choose a source-wording family to
search that field. Full result counts, returned rows and occurrence counts retain
their stated units. Literal `%`, `_`, punctuation and source modifiers are not
wildcards. Broader wording matches do not establish organological equivalence.

Detail pages lead with the original definition and labels. Relationships, public
usage, matching rules, exact statements, citation information and downloads are
progressively disclosed. Language selection changes display or the explicitly
named label filter; it does not translate the source or create new labels.
Missing definitions, unassigned schemes and unresolved references stay visible.

A candidate label or source match is not an accepted canonical classification.
Key action and stop action remain separate fields even when they share candidate
terminology. A source-level technical occurrence can link directly to its source
record without claiming that it belongs to a particular configuration account.
Physical instruments, SKOS concepts, schema categories, ontology classes and
properties remain distinct resources.

## Saving a term and returning to its evidence

Choose **Save term** beside a loaded record’s citation controls, or use the
corresponding reference or view action. The confirmation names the saved entry;
independently bound references also identify their collection version or snapshot.
**Open workspace** shows the entry under **Saved views**. Independent references
include collection metadata, the exact binding and an evidence JSON link. Saving
keeps you on the reading page.

You can then follow an organ or source link and reopen the saved entry from the
workspace. Its term identifier, filters and native collection snapshot travel
together. Controlled concepts, candidate terminology, published graphs and OMARO
keep their own bindings; they are not rebound to the POD snapshot. Candidate saves
also retain the public-core and occurrence-index bindings used by their mappings.
A requested version that is unavailable is refused rather than replaced with the
current one.

The workspace’s **Save current view** uses the loaded vocabulary view’s verified
binding too. On the vocabulary directory itself, it saves a navigation bookmark;
open a collection to retain exact versioned evidence. Source-wording and schema
views remain bound to the POD. Independently bound references can start a
reference-only workspace without a POD binding; keeping a POD record or view later
attaches a verified POD context explicitly.

If browser storage is unavailable, the message says the entry is kept only in the
open workspace. Use **Export workspace** before leaving or closing it. Workspace
files preserve navigation and version bindings, while evidence downloads preserve
the data. See [portable workspace behavior](PUBLIC_QUERY_AND_EVIDENCE.md#portable-research-workspace)
for import, earlier files and recovery.

## Versions and exports

Readers preserve the requested selection in the URL, including literal search,
pagination and a snapshot pin where the collection supplies one. Opening a term
and returning to results retains that context. Invalid, ambiguous or unavailable
pins are refused; opening the currently available snapshot is an explicit action.

Candidate and controlled-concept exports serialize the complete supported
selection in the chosen format. They retain their own concept identities and
recorded label authority. A full source designation is not silently recast as a
SKOS preferred label. Original published graph downloads preserve the source
bytes and checksums. Reference-view JSON is a reading projection, not a new
published vocabulary release.

Rights belong to each collection. Published MODAVIS and VAO reference bundles
carry CC BY 4.0 attribution, while the configured OMARO snapshot carries its own
license. The candidate seed does not declare a terminology-data license; the
application's code license does not substitute for one.

## Public read interfaces

- `/api/vocab/catalogue` describes available collections and separates count units.
- `/api/vocab/schemes` and the existing concept routes expose the selected POD terms.
- `/api/vocab/registry`, `/api/vocab/registry/concept` and
  `/api/vocab/registry/export` expose the frozen candidate seed and its own hash.
- `/api/vocab/usage/<family>` exposes only supported public occurrence families;
  field-specific wording, occurrence and export operations retain their existing
  source/index binding.
- `/api/vocab/references` lists published MODAVIS/VAO collections;
  `/api/vocab/references/<collection>`, `/concept` and `/download/<format>` provide
  typed views, direct RDF evidence and original source distributions.
- `/api/omaro` describes the separately configured reference snapshot; `/concepts`,
  `/concept` and `/download/<key>` retain its independent source/version binding.

Each endpoint accepts only its documented route-specific parameters, once each.
A missing optional reference input remains unavailable rather than substituting
another collection. These interfaces are read-only and do not edit POD data,
promote candidate terms or assign reference classifications to organs.
