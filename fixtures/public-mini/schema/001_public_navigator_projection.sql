-- MODAVIS POD 1.5 publication-safe PostgreSQL projection.
-- Owner: Initiator.  This migration is additive and contains no private source
-- payload, prose, media, operational, authentication, or review tables.

CREATE SCHEMA IF NOT EXISTS release_1_5_public;

CREATE TABLE IF NOT EXISTS release_1_5_public.metadata (
    key text PRIMARY KEY,
    value text NOT NULL
);

CREATE TABLE IF NOT EXISTS release_1_5_public.capability (
    capability_key text PRIMARY KEY,
    enabled integer NOT NULL CHECK (enabled IN (0, 1)),
    route_prefixes_json text NOT NULL,
    notes text NOT NULL
);

CREATE TABLE IF NOT EXISTS release_1_5_public.rights_profile (
    profile_id text PRIMARY KEY,
    projection_scope text NOT NULL,
    public_fact_projection integer NOT NULL CHECK (public_fact_projection IN (0, 1)),
    source_prose_included integer NOT NULL CHECK (source_prose_included IN (0, 1)),
    source_media_included integer NOT NULL CHECK (source_media_included IN (0, 1)),
    coordinate_policy text NOT NULL,
    notes text NOT NULL
);

CREATE TABLE IF NOT EXISTS release_1_5_public.rights_exclusion (
    category text PRIMARY KEY,
    excluded_from_public integer NOT NULL CHECK (excluded_from_public IN (0, 1)),
    rationale text NOT NULL,
    available_in_restricted_package integer NOT NULL CHECK (available_in_restricted_package IN (0, 1))
);

CREATE TABLE IF NOT EXISTS release_1_5_public.source_collection (
    source_key text PRIMARY KEY,
    source_record_count integer NOT NULL,
    canonical_organ_count integer NOT NULL,
    sample_host text,
    included_data text NOT NULL,
    excluded_data text NOT NULL
);

CREATE TABLE IF NOT EXISTS release_1_5_public.organ (
    organ_pk integer PRIMARY KEY,
    mdvs_id text NOT NULL UNIQUE,
    canonical_uri text NOT NULL UNIQUE,
    label text NOT NULL,
    source_count integer NOT NULL,
    media_available integer NOT NULL CHECK (media_available IN (0, 1)),
    period_buckets_json text NOT NULL,
    sources_json text NOT NULL
);

CREATE TABLE IF NOT EXISTS release_1_5_public.organ_alias (
    alias_mdvs_id text PRIMARY KEY,
    canonical_mdvs_id text NOT NULL REFERENCES release_1_5_public.organ(mdvs_id),
    alias_uri text NOT NULL,
    canonical_uri text NOT NULL,
    outcome text NOT NULL,
    evidence_sha256 text NOT NULL
);

CREATE TABLE IF NOT EXISTS release_1_5_public.actor (
    actor_pk integer PRIMARY KEY,
    mdvs_id text NOT NULL UNIQUE,
    canonical_uri text NOT NULL UNIQUE,
    label text NOT NULL,
    actor_type text NOT NULL CHECK (actor_type IN ('person', 'organization')),
    structured_name_count integer NOT NULL
);

CREATE TABLE IF NOT EXISTS release_1_5_public.actor_alias (
    alias_mdvs_id text PRIMARY KEY,
    canonical_mdvs_id text NOT NULL REFERENCES release_1_5_public.actor(mdvs_id),
    alias_uri text NOT NULL,
    canonical_uri text NOT NULL,
    alias_label text,
    canonical_label text NOT NULL,
    projection_id text NOT NULL,
    evidence_sha256 text
);

CREATE TABLE IF NOT EXISTS release_1_5_public.actor_suppression (
    source_mdvs_id text PRIMARY KEY,
    canonical_mdvs_id text,
    outcome text NOT NULL,
    projection_id text NOT NULL,
    evidence_sha256 text
);

CREATE TABLE IF NOT EXISTS release_1_5_public.structured_name (
    name_mdvs_id text PRIMARY KEY,
    canonical_uri text NOT NULL,
    display_name text NOT NULL,
    given_name text,
    middle_names text,
    family_name text,
    particle text,
    prefix text,
    suffix text,
    abbreviation text,
    romanization text,
    transliteration text,
    is_native integer CHECK (is_native IN (0, 1)),
    verification_score double precision,
    row_hash text
);

CREATE TABLE IF NOT EXISTS release_1_5_public.actor_name (
    actor_mdvs_id text NOT NULL REFERENCES release_1_5_public.actor(mdvs_id),
    name_mdvs_id text NOT NULL REFERENCES release_1_5_public.structured_name(name_mdvs_id),
    PRIMARY KEY (actor_mdvs_id, name_mdvs_id)
);

CREATE TABLE IF NOT EXISTS release_1_5_public.organ_builder_assertion (
    assertion_id text PRIMARY KEY,
    organ_mdvs_id text REFERENCES release_1_5_public.organ(mdvs_id),
    actor_mdvs_id text REFERENCES release_1_5_public.actor(mdvs_id),
    actor_uri text,
    actor_route_id text NOT NULL,
    source_label text NOT NULL,
    preferred_label text,
    actor_type text NOT NULL,
    relation_role text NOT NULL,
    resolution_state text NOT NULL,
    source_record_id text NOT NULL,
    source_key text NOT NULL,
    row_sha256 text NOT NULL
);

CREATE TABLE IF NOT EXISTS release_1_5_public.organ_builder_relation (
    relation_id integer PRIMARY KEY,
    organ_mdvs_id text NOT NULL REFERENCES release_1_5_public.organ(mdvs_id),
    actor_mdvs_id text NOT NULL REFERENCES release_1_5_public.actor(mdvs_id),
    actor_uri text NOT NULL,
    source_record_id text,
    confidence double precision,
    row_hash text
);

CREATE TABLE IF NOT EXISTS release_1_5_public.organ_builder (
    organ_mdvs_id text NOT NULL REFERENCES release_1_5_public.organ(mdvs_id),
    actor_mdvs_id text NOT NULL REFERENCES release_1_5_public.actor(mdvs_id),
    actor_uri text NOT NULL,
    assertion_count integer NOT NULL,
    relation_count integer NOT NULL,
    PRIMARY KEY (organ_mdvs_id, actor_mdvs_id)
);

CREATE TABLE IF NOT EXISTS release_1_5_public.source_membership (
    source_record_id text PRIMARY KEY,
    organ_mdvs_id text NOT NULL REFERENCES release_1_5_public.organ(mdvs_id),
    source_key text NOT NULL,
    native_identifier text,
    source_url text,
    source_revision_sha256 text,
    source_record_row_hash text,
    membership_basis text NOT NULL,
    row_sha256 text NOT NULL
);

CREATE TABLE IF NOT EXISTS release_1_5_public.place_assertion (
    assertion_id text PRIMARY KEY,
    organ_mdvs_id text REFERENCES release_1_5_public.organ(mdvs_id),
    activity_mdvs_id text,
    place_mdvs_id text,
    place_uri text,
    preferred_label text,
    normalized_label text,
    place_kind text,
    temporal_scope text NOT NULL,
    relation_role text,
    coordinate_state text,
    source_record_id text NOT NULL,
    source_key text NOT NULL,
    row_sha256 text NOT NULL
);

CREATE TABLE IF NOT EXISTS release_1_5_public.coordinate_assertion (
    source_organ_mdvs_id text PRIMARY KEY,
    organ_mdvs_id text NOT NULL REFERENCES release_1_5_public.organ(mdvs_id),
    coordinate_state text NOT NULL,
    marker_layer text NOT NULL,
    latitude double precision,
    longitude double precision,
    precision text,
    coordinate_source text,
    place_route_id text,
    row_sha256 text NOT NULL,
    disclosure_state text NOT NULL,
    CHECK ((latitude IS NULL AND longitude IS NULL) OR
           (latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180))
);

CREATE TABLE IF NOT EXISTS release_1_5_public.specification_component (
    component_id text PRIMARY KEY,
    organ_mdvs_id text NOT NULL REFERENCES release_1_5_public.organ(mdvs_id),
    component_type text NOT NULL,
    label text NOT NULL,
    division_label text,
    pitch_label text,
    terminal_outcome text NOT NULL,
    occurrence_count integer NOT NULL,
    source_record_id text NOT NULL,
    source_key text NOT NULL,
    evidence_sha256 text NOT NULL,
    decision_sha256 text NOT NULL,
    label_disclosure_state text NOT NULL
);

CREATE TABLE IF NOT EXISTS release_1_5_public.technical_fact (
    fact_id text PRIMARY KEY,
    organ_mdvs_id text NOT NULL REFERENCES release_1_5_public.organ(mdvs_id),
    family text NOT NULL,
    label text NOT NULL,
    display_value text,
    normalized_number integer,
    support_state text NOT NULL,
    conflict_state text NOT NULL,
    captured_component_count integer NOT NULL,
    source_record_id text NOT NULL,
    source_url text,
    evidence_sha256 text NOT NULL,
    row_sha256 text NOT NULL
);

CREATE TABLE IF NOT EXISTS release_1_5_public.documented_event (
    event_id text PRIMARY KEY,
    organ_mdvs_id text NOT NULL REFERENCES release_1_5_public.organ(mdvs_id),
    source_event_type text,
    controlled_event_type text,
    concept_code text,
    mapping_kind text,
    source_only integer NOT NULL CHECK (source_only IN (0, 1)),
    date_values_json text NOT NULL,
    source_record_id text NOT NULL,
    source_key text NOT NULL,
    source_url text,
    evidence_sha256 text NOT NULL,
    row_sha256 text NOT NULL,
    interpretation_scope text NOT NULL
);

CREATE TABLE IF NOT EXISTS release_1_5_public.virtual_instrument (
    mdvs_id text PRIMARY KEY,
    canonical_uri text NOT NULL,
    canonical_title text NOT NULL,
    is_pipe_organ_related integer NOT NULL CHECK (is_pipe_organ_related IN (0, 1)),
    relation_confidence double precision,
    first_observed_at text,
    last_observed_at text,
    row_hash text
);

CREATE TABLE IF NOT EXISTS release_1_5_public.organ_virtual_instrument (
    relation_id integer PRIMARY KEY,
    vmi_mdvs_id text NOT NULL REFERENCES release_1_5_public.virtual_instrument(mdvs_id),
    organ_mdvs_id text REFERENCES release_1_5_public.organ(mdvs_id),
    relation_type_id integer,
    represented_organ_label text,
    confidence double precision,
    resolution_state text NOT NULL,
    row_hash text
);

CREATE TABLE IF NOT EXISTS release_1_5_public.musixplora_relation (
    edge_id text PRIMARY KEY,
    source_mxp_id text NOT NULL,
    target_mxp_id text NOT NULL,
    role_code text,
    role_label text,
    generation integer,
    generation_label text,
    relation_category text NOT NULL,
    canonical_relation_type text NOT NULL,
    prior_relation_category text,
    evidence_sha256 text NOT NULL,
    decision_state text NOT NULL
);

-- Navigator-only read aids. They are deterministic projections of the public
-- tables above and do not introduce additional source content.
CREATE TABLE IF NOT EXISTS release_1_5_public.place (
    mdvs_id text PRIMARY KEY,
    canonical_uri text NOT NULL,
    label text NOT NULL,
    place_kind text,
    assertion_count integer NOT NULL,
    organ_count integer NOT NULL,
    coordinate_count integer NOT NULL
);

CREATE TABLE IF NOT EXISTS release_1_5_public.organ_search_document (
    organ_mdvs_id text PRIMARY KEY REFERENCES release_1_5_public.organ(mdvs_id),
    search_text text NOT NULL,
    builder_text text NOT NULL,
    place_text text NOT NULL,
    source_text text NOT NULL
);

CREATE TABLE IF NOT EXISTS release_1_5_public.actor_search_document (
    actor_mdvs_id text PRIMARY KEY REFERENCES release_1_5_public.actor(mdvs_id),
    search_text text NOT NULL
);

CREATE TABLE IF NOT EXISTS release_1_5_public.map_site_group (
    site_group_id text PRIMARY KEY,
    latitude double precision NOT NULL,
    longitude double precision NOT NULL,
    coordinate_fallback integer NOT NULL CHECK (coordinate_fallback IN (0, 1)),
    coordinate_precision text NOT NULL,
    title text NOT NULL,
    representative_organ_mdvs_id text NOT NULL REFERENCES release_1_5_public.organ(mdvs_id),
    entity_count integer NOT NULL,
    location_count integer NOT NULL
);

CREATE TABLE IF NOT EXISTS release_1_5_public.map_site_member (
    site_group_id text NOT NULL REFERENCES release_1_5_public.map_site_group(site_group_id),
    source_organ_mdvs_id text NOT NULL REFERENCES release_1_5_public.coordinate_assertion(source_organ_mdvs_id),
    organ_mdvs_id text NOT NULL REFERENCES release_1_5_public.organ(mdvs_id),
    title text NOT NULL,
    coordinate_state text NOT NULL,
    marker_layer text NOT NULL,
    coordinate_precision text,
    coordinate_source text,
    PRIMARY KEY (site_group_id, source_organ_mdvs_id)
);

CREATE INDEX IF NOT EXISTS idx_release_1_5_public_organ_label
    ON release_1_5_public.organ (lower(label));
CREATE INDEX IF NOT EXISTS idx_release_1_5_public_actor_label
    ON release_1_5_public.actor (lower(label));
CREATE INDEX IF NOT EXISTS idx_release_1_5_public_actor_alias_canonical
    ON release_1_5_public.actor_alias (canonical_mdvs_id);
CREATE INDEX IF NOT EXISTS idx_release_1_5_public_organ_alias_canonical
    ON release_1_5_public.organ_alias (canonical_mdvs_id);
CREATE INDEX IF NOT EXISTS idx_release_1_5_public_actor_name_actor
    ON release_1_5_public.actor_name (actor_mdvs_id);
CREATE INDEX IF NOT EXISTS idx_release_1_5_public_builder_organ
    ON release_1_5_public.organ_builder (organ_mdvs_id);
CREATE INDEX IF NOT EXISTS idx_release_1_5_public_builder_actor
    ON release_1_5_public.organ_builder (actor_mdvs_id);
CREATE INDEX IF NOT EXISTS idx_release_1_5_public_builder_assertion_organ
    ON release_1_5_public.organ_builder_assertion (organ_mdvs_id);
CREATE INDEX IF NOT EXISTS idx_release_1_5_public_builder_assertion_actor
    ON release_1_5_public.organ_builder_assertion (actor_mdvs_id);
CREATE INDEX IF NOT EXISTS idx_release_1_5_public_membership_organ
    ON release_1_5_public.source_membership (organ_mdvs_id);
CREATE INDEX IF NOT EXISTS idx_release_1_5_public_membership_source
    ON release_1_5_public.source_membership (source_key);
CREATE INDEX IF NOT EXISTS idx_release_1_5_public_place_assertion_organ
    ON release_1_5_public.place_assertion (organ_mdvs_id, temporal_scope);
CREATE INDEX IF NOT EXISTS idx_release_1_5_public_place_assertion_place
    ON release_1_5_public.place_assertion (place_mdvs_id);
CREATE INDEX IF NOT EXISTS idx_release_1_5_public_coordinate_organ
    ON release_1_5_public.coordinate_assertion (organ_mdvs_id, marker_layer);
CREATE INDEX IF NOT EXISTS idx_release_1_5_public_coordinate_point
    ON release_1_5_public.coordinate_assertion (latitude, longitude)
    WHERE latitude IS NOT NULL AND longitude IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_release_1_5_public_component_organ
    ON release_1_5_public.specification_component (organ_mdvs_id, component_type);
CREATE INDEX IF NOT EXISTS idx_release_1_5_public_fact_organ
    ON release_1_5_public.technical_fact (organ_mdvs_id, family);
CREATE INDEX IF NOT EXISTS idx_release_1_5_public_fact_conflict
    ON release_1_5_public.technical_fact (conflict_state);
CREATE INDEX IF NOT EXISTS idx_release_1_5_public_event_organ
    ON release_1_5_public.documented_event (organ_mdvs_id, controlled_event_type);
CREATE INDEX IF NOT EXISTS idx_release_1_5_public_vmi_organ
    ON release_1_5_public.organ_virtual_instrument (organ_mdvs_id);
CREATE INDEX IF NOT EXISTS idx_release_1_5_public_musix_source
    ON release_1_5_public.musixplora_relation (source_mxp_id);
CREATE INDEX IF NOT EXISTS idx_release_1_5_public_musix_target
    ON release_1_5_public.musixplora_relation (target_mxp_id);
CREATE INDEX IF NOT EXISTS idx_release_1_5_public_map_site_coordinates
    ON release_1_5_public.map_site_group (latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_release_1_5_public_map_member_organ
    ON release_1_5_public.map_site_member (organ_mdvs_id);

CREATE OR REPLACE VIEW release_1_5_public.technical_conflict AS
SELECT * FROM release_1_5_public.technical_fact
WHERE conflict_state = 'material_technical_disagreement';
