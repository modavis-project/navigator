-- Add publication-safe place context, media references, and export support.
-- Source payload bytes and media bytes remain outside the public projection.

CREATE TABLE release_1_5_public.place_route (
    assertion_id text PRIMARY KEY REFERENCES release_1_5_public.place_assertion(assertion_id),
    route_id text NOT NULL,
    route_kind text NOT NULL,
    source_location_mdvs_id text,
    canonical_target_mdvs_id text,
    canonical_status text NOT NULL,
    row_sha256 text NOT NULL
);

CREATE INDEX idx_public_place_route_source_location
    ON release_1_5_public.place_route(source_location_mdvs_id);
CREATE INDEX idx_public_place_route_canonical_target
    ON release_1_5_public.place_route(canonical_target_mdvs_id);

CREATE TABLE release_1_5_public.place_detail (
    mdvs_id text PRIMARY KEY,
    canonical_uri text NOT NULL,
    preferred_name text NOT NULL,
    place_kind text,
    latitude double precision,
    longitude double precision,
    coordinate_source text,
    coordinate_confidence double precision,
    coordinate_state text,
    enrichment_outcome text NOT NULL,
    name_variants_json text NOT NULL,
    source_hierarchy_json text NOT NULL,
    provider_hierarchy_json text NOT NULL,
    provider_bindings_json text NOT NULL,
    administrative_nodes_json text NOT NULL,
    containment_relations_json text NOT NULL,
    evidence_sha256 text NOT NULL,
    row_sha256 text NOT NULL
);

CREATE INDEX idx_public_place_detail_name
    ON release_1_5_public.place_detail(lower(preferred_name));

CREATE TABLE release_1_5_public.public_media_reference (
    media_id text PRIMARY KEY,
    source_record_id text NOT NULL,
    organ_mdvs_id text NOT NULL REFERENCES release_1_5_public.organ(mdvs_id),
    source_key text NOT NULL,
    source_url text,
    media_kind text NOT NULL,
    media_index integer NOT NULL,
    media_url text,
    host text,
    title text,
    source_credit text,
    copyright_notice text,
    dates_json text NOT NULL,
    filename text,
    availability_state text NOT NULL,
    delivery_state text NOT NULL,
    evidence_sha256 text NOT NULL,
    row_sha256 text NOT NULL
);

CREATE INDEX idx_public_media_organ
    ON release_1_5_public.public_media_reference(organ_mdvs_id, media_kind, media_index);
CREATE INDEX idx_public_media_source
    ON release_1_5_public.public_media_reference(source_record_id);

CREATE TABLE release_1_5_public.public_source_record_metadata (
    source_record_id text PRIMARY KEY,
    source_key text NOT NULL,
    native_identifier text,
    source_url text,
    record_type text,
    schema_key text,
    schema_version text,
    schema_hash text,
    payload_sha256 text,
    section_manifest_json text NOT NULL,
    row_sha256 text NOT NULL
);

CREATE INDEX idx_public_source_record_metadata_source
    ON release_1_5_public.public_source_record_metadata(source_key);

CREATE TABLE release_1_5_public.actor_external_identifier (
    actor_mdvs_id text NOT NULL REFERENCES release_1_5_public.actor(mdvs_id),
    identifier_mdvs_id text NOT NULL,
    scheme_code text NOT NULL,
    scheme_label text NOT NULL,
    identifier_value text NOT NULL,
    identifier_url text,
    row_sha256 text NOT NULL,
    PRIMARY KEY(actor_mdvs_id, identifier_mdvs_id)
);

CREATE INDEX idx_public_actor_external_identifier_value
    ON release_1_5_public.actor_external_identifier(scheme_code, identifier_value);

CREATE TABLE release_1_5_public.actor_temporal_assertion (
    actor_mdvs_id text NOT NULL REFERENCES release_1_5_public.actor(mdvs_id),
    temporality_mdvs_id text NOT NULL,
    anchor_code text,
    anchor_label text,
    start_date text,
    start_year integer,
    end_date text,
    end_year integer,
    raw_expression text,
    row_sha256 text NOT NULL,
    PRIMARY KEY(actor_mdvs_id, temporality_mdvs_id)
);

CREATE INDEX idx_public_actor_temporal_actor
    ON release_1_5_public.actor_temporal_assertion(actor_mdvs_id, anchor_code);
