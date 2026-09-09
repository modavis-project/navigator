# Verified terminology representations

These files retain published MODAVIS Ontology Network 0.1.0 representations and
VAO Standard 0.5.0 vocabulary data. `manifest.json` records the original public
URLs, byte sizes, SHA-256 values, source release commits, current aliases, and
subject membership. Original downloaded bytes are retained. Additional VAO
serializations and N-Triples files represent the same RDF graphs.

The source terminology is licensed CC BY 4.0, credited to Dominik Ukolov and
contributors; original attribution and license statements remain in the files.
See https://creativecommons.org/licenses/by/4.0/ and the source projects:
https://github.com/modavis-project/modavis-ontology-network and
https://github.com/modavis-project/vao-standard.

The bundle is verified at application startup and never fetched from a
caller-supplied URL. Build a new output directory with
`backend/tools/prepare_terminology_bundle.py`. For a future release, preserve
all existing versioned entries and files and advance only explicitly accepted
current aliases. The JSON-LD context is a context document, not an entity graph.
