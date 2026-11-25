# Reproducible research packages

The workbench can download a complete public selection as a RO-Crate 1.3 ZIP64
archive. Packages include the result, applied query, public snapshot and method
hashes, compilation rights, checksums and an offline replay script. Source images
remain externally linked. No database credentials, raw private tables or source
media are copied.

The deployment owner must set `NAVIGATOR_RESEARCH_PACKAGE_LICENSE` to the reviewed
compilation license for the selected public dataset. The application code license
does not automatically license its data. Until this is configured the workbench
package link remains unavailable. No publication or deposition action is involved.

Append `format=ro-crate` and the exact `snapshot` hash to complete export routes:
`/api/workbench/selection/export`, `/api/workbench/terms/export`,
`/api/workbench/occurrences/export`, research-exploration exports and vocabulary
usage exports. Complete comparison, timeline, source-claim, account and identity
views also support this representation. Existing JSON/CSV downloads stay available.
The ZIP response supplies `X-Content-SHA256`; retain that hash separately.

Collection exports include all selected rows up to their existing query limits,
not only the current page. A mismatch, partial result or expanded package over
32 MiB is refused before sending any archive. ZIP construction stays in bounded
memory and does not consume temporary disk. ZIP64 member headers are always enabled.
Do not interpret ZIP64 support as permission to run a large export campaign.

Extract a trusted archive into a new directory and run `python3 replay.py` to
verify the inventory and emit the frozen result. This restores the selected result
offline. Re-running the original query over the entire corpus requires the exact
original public snapshot; the package does not contain that corpus. The issuance
date describes this package edition and makes no claim of a public DOI publication.

Persistor recognizes `modavis.research-selection-package/v1` for its offline
`package verify` and `package restore` commands. Its independent RO-Crate RDF/SHACL
checker also accepts this projection. The shared profile is documented by Framework;
Navigator's portable implementation has no runtime dependency on an unpublished
Persistor installation. Keep the cross-component fixture check when changing it.
