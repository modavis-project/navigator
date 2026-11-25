-- Source event context remains separate from the immutable event assertion.
CREATE TABLE release_1_5_public.documented_event_context (
    event_id text PRIMARY KEY REFERENCES release_1_5_public.documented_event(event_id),
    participants_json text NOT NULL,
    places_json text NOT NULL,
    evidence_path text NOT NULL,
    source_evidence_sha256 text NOT NULL,
    row_sha256 text NOT NULL
);
CREATE TABLE release_1_5_public.virtual_instrument_detail (
    vmi_mdvs_id text PRIMARY KEY REFERENCES release_1_5_public.virtual_instrument(mdvs_id),
    payload_json text NOT NULL,
    source_evidence_sha256 text NOT NULL,
    row_sha256 text NOT NULL
);
CREATE TABLE release_1_5_public.vocabulary_concept (
    concept_code text PRIMARY KEY,
    scheme_code text NOT NULL,
    mdvs_id text NOT NULL UNIQUE,
    payload_json text NOT NULL,
    row_sha256 text NOT NULL
);
CREATE INDEX idx_public_vocabulary_scheme ON release_1_5_public.vocabulary_concept(scheme_code);
CREATE TABLE release_1_5_public.literature_access_link (
    link_id text PRIMARY KEY,
    literature_id text NOT NULL REFERENCES release_1_5_public.literature_publication(literature_id),
    url text NOT NULL,
    link_kind text NOT NULL,
    provider text NOT NULL,
    verified_at text NOT NULL,
    evidence_json text NOT NULL,
    row_sha256 text NOT NULL
);
CREATE INDEX idx_literature_access_record ON release_1_5_public.literature_access_link(literature_id);
