-- Publication-safe literature and tuning-system projection for POD 1.5.
-- Owner: Initiator. This additive migration contains structured bibliographic
-- facts, source links, tuning vectors, and bounded organ assertions only.

CREATE TABLE IF NOT EXISTS release_1_5_public.literature_collection (
    collection_key text PRIMARY KEY,
    name text NOT NULL,
    full_name text,
    description text,
    homepage_url text,
    publication_count integer NOT NULL,
    year_min integer,
    year_max integer,
    digitized_count integer NOT NULL,
    normalization_profile text,
    source_artifact_sha256 text,
    imported_at text
);

CREATE TABLE IF NOT EXISTS release_1_5_public.literature_publication (
    literature_id text PRIMARY KEY,
    mdvs_id text NOT NULL UNIQUE,
    title text NOT NULL,
    publication_year integer,
    publication_type text,
    authors_json text NOT NULL,
    author_text text NOT NULL,
    venue text,
    container_type text,
    volume text,
    issue text,
    place text,
    publisher_or_institution text,
    editor text,
    related_containers_json text NOT NULL,
    classification_confidence text,
    classification_method text,
    page_locator text,
    source_record_id text NOT NULL,
    source_url text,
    source_content_sha256 text NOT NULL,
    collection_key text NOT NULL REFERENCES release_1_5_public.literature_collection(collection_key),
    collection_name text NOT NULL,
    collection_full_name text,
    iiif_manifest_url text,
    iiif_start_page text,
    iiif_end_page text,
    iiif_canvas_start integer,
    iiif_canvas_end integer,
    iiif_locator_basis text,
    iiif_exclusion_reason text,
    search_text text NOT NULL,
    row_sha256 text NOT NULL
);

CREATE TABLE IF NOT EXISTS release_1_5_public.tuning_system (
    tuning_id text PRIMARY KEY,
    source_record_id text NOT NULL UNIQUE,
    source_url text,
    commentary_url text,
    label text NOT NULL,
    title text NOT NULL,
    group_key text,
    group_title text,
    group_memberships_json text NOT NULL,
    is_precise_variant integer NOT NULL CHECK (is_precise_variant IN (0, 1)),
    tone_order_json text NOT NULL,
    cent_values_json text NOT NULL,
    centstr text,
    cent_reference_json text NOT NULL,
    derived_intervals_json text NOT NULL,
    commentary_available integer NOT NULL CHECK (commentary_available IN (0, 1)),
    literature_count integer NOT NULL,
    source_name text NOT NULL,
    schema_key text NOT NULL,
    schema_version text,
    first_seen_at text,
    last_seen_at text,
    search_text text NOT NULL,
    row_sha256 text NOT NULL
);

CREATE TABLE IF NOT EXISTS release_1_5_public.tuning_system_literature (
    citation_id text PRIMARY KEY,
    tuning_id text NOT NULL REFERENCES release_1_5_public.tuning_system(tuning_id),
    citation_text text NOT NULL,
    source_url text,
    source_path text,
    source_page_is_provenance integer NOT NULL CHECK (source_page_is_provenance IN (0, 1))
);

CREATE TABLE IF NOT EXISTS release_1_5_public.organ_temperament_assertion (
    assertion_id text PRIMARY KEY,
    organ_mdvs_id text NOT NULL REFERENCES release_1_5_public.organ(mdvs_id),
    source_record_id text NOT NULL,
    source_key text NOT NULL,
    source_url text,
    source_value text NOT NULL,
    country text,
    town text,
    building text,
    row_sha256 text NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_release_1_5_public_literature_year
    ON release_1_5_public.literature_publication (publication_year);
CREATE INDEX IF NOT EXISTS idx_release_1_5_public_literature_type
    ON release_1_5_public.literature_publication (publication_type);
CREATE INDEX IF NOT EXISTS idx_release_1_5_public_literature_collection
    ON release_1_5_public.literature_publication (collection_key);
CREATE INDEX IF NOT EXISTS idx_release_1_5_public_literature_title
    ON release_1_5_public.literature_publication (lower(title));
CREATE INDEX IF NOT EXISTS idx_release_1_5_public_literature_search
    ON release_1_5_public.literature_publication
    USING gin (to_tsvector('simple', search_text));
CREATE INDEX IF NOT EXISTS idx_release_1_5_public_tuning_group
    ON release_1_5_public.tuning_system (group_key);
CREATE INDEX IF NOT EXISTS idx_release_1_5_public_tuning_title
    ON release_1_5_public.tuning_system (lower(title));
CREATE INDEX IF NOT EXISTS idx_release_1_5_public_tuning_literature_system
    ON release_1_5_public.tuning_system_literature (tuning_id);
CREATE INDEX IF NOT EXISTS idx_release_1_5_public_organ_temperament_organ
    ON release_1_5_public.organ_temperament_assertion (organ_mdvs_id);
CREATE INDEX IF NOT EXISTS idx_release_1_5_public_organ_temperament_value
    ON release_1_5_public.organ_temperament_assertion (lower(source_value));
