-- Optional unpublished candidate evidence; canonical identities stay unchanged.
CREATE TABLE release_1_5_public.builder_assertion_evidence (
    assertion_id text PRIMARY KEY REFERENCES release_1_5_public.organ_builder_assertion(assertion_id),
    evidence_json text NOT NULL,
    row_sha256 text NOT NULL
);
