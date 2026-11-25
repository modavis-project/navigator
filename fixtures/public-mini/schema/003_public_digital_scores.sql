-- Publication-safe digital-score projection for POD 1.5.
-- Owner: Initiator. The projection contains catalogue metadata, source links,
-- and precomputed musical summaries. It excludes local paths and score bytes.

CREATE TABLE IF NOT EXISTS release_1_5_public.digital_score_collection (
    collection_key text PRIMARY KEY,
    name text NOT NULL,
    description text NOT NULL,
    homepage_url text NOT NULL,
    score_count integer NOT NULL,
    evidence_note text NOT NULL,
    license_note text NOT NULL,
    source_artifact_sha256 text NOT NULL,
    row_sha256 text NOT NULL
);

CREATE TABLE IF NOT EXISTS release_1_5_public.digital_score (
    score_id text PRIMARY KEY,
    source_record_id text NOT NULL UNIQUE,
    work_key text NOT NULL,
    title text NOT NULL,
    normalized_title text NOT NULL,
    composer text,
    catalog_number text,
    instrumentation text,
    collection_key text NOT NULL REFERENCES release_1_5_public.digital_score_collection(collection_key),
    collection_name text NOT NULL,
    license_name text,
    license_url text,
    source_url text NOT NULL,
    evidence_basis text NOT NULL,
    evidence_strength text NOT NULL CHECK (evidence_strength IN ('strong', 'candidate')),
    formats_json text NOT NULL,
    has_musicxml integer NOT NULL CHECK (has_musicxml IN (0, 1)),
    has_midi integer NOT NULL CHECK (has_midi IN (0, 1)),
    has_pdf integer NOT NULL CHECK (has_pdf IN (0, 1)),
    has_lilypond integer NOT NULL CHECK (has_lilypond IN (0, 1)),
    analysis_status text NOT NULL CHECK (analysis_status IN ('available', 'not_analyzed')),
    search_text text NOT NULL,
    row_sha256 text NOT NULL
);

CREATE TABLE IF NOT EXISTS release_1_5_public.digital_score_asset (
    asset_id text PRIMARY KEY,
    score_id text NOT NULL REFERENCES release_1_5_public.digital_score(score_id),
    format text NOT NULL,
    role text NOT NULL,
    label text NOT NULL,
    file_name text NOT NULL,
    access_url text,
    archive_url text,
    archive_member_path text,
    availability text NOT NULL,
    content_sha256 text,
    content_size_bytes integer,
    position integer NOT NULL,
    row_sha256 text NOT NULL
);

CREATE TABLE IF NOT EXISTS release_1_5_public.digital_score_analysis (
    analysis_id text PRIMARY KEY,
    score_id text NOT NULL UNIQUE REFERENCES release_1_5_public.digital_score(score_id),
    asset_id text NOT NULL REFERENCES release_1_5_public.digital_score_asset(asset_id),
    extractor_name text NOT NULL,
    extractor_version text NOT NULL,
    input_content_sha256 text NOT NULL,
    computed_at text NOT NULL,
    status text NOT NULL,
    pitch_basis text NOT NULL,
    global_min_midi double precision,
    global_max_midi double precision,
    global_min_pitch text,
    global_max_pitch text,
    span_semitones double precision,
    note_count integer NOT NULL,
    part_count integer NOT NULL,
    warnings_json text NOT NULL,
    row_sha256 text NOT NULL
);

CREATE TABLE IF NOT EXISTS release_1_5_public.digital_score_part_range (
    analysis_id text NOT NULL REFERENCES release_1_5_public.digital_score_analysis(analysis_id),
    part_key text NOT NULL,
    part_name text NOT NULL,
    part_index integer NOT NULL,
    sounding_min_midi double precision NOT NULL,
    sounding_max_midi double precision NOT NULL,
    sounding_min_pitch text NOT NULL,
    sounding_max_pitch text NOT NULL,
    written_min_midi double precision NOT NULL,
    written_max_midi double precision NOT NULL,
    written_min_pitch text NOT NULL,
    written_max_pitch text NOT NULL,
    note_count integer NOT NULL,
    staff_keys_json text NOT NULL,
    channels_json text NOT NULL,
    assignment text NOT NULL,
    assignment_confidence double precision,
    row_sha256 text NOT NULL,
    PRIMARY KEY (analysis_id, part_key)
);

CREATE INDEX IF NOT EXISTS idx_release_1_5_public_score_title
    ON release_1_5_public.digital_score (normalized_title);
CREATE INDEX IF NOT EXISTS idx_release_1_5_public_score_composer
    ON release_1_5_public.digital_score (lower(composer));
CREATE INDEX IF NOT EXISTS idx_release_1_5_public_score_catalog
    ON release_1_5_public.digital_score (lower(catalog_number));
CREATE INDEX IF NOT EXISTS idx_release_1_5_public_score_collection
    ON release_1_5_public.digital_score (collection_key);
CREATE INDEX IF NOT EXISTS idx_release_1_5_public_score_work
    ON release_1_5_public.digital_score (work_key);
CREATE INDEX IF NOT EXISTS idx_release_1_5_public_score_evidence
    ON release_1_5_public.digital_score (evidence_strength, evidence_basis);
CREATE INDEX IF NOT EXISTS idx_release_1_5_public_score_search
    ON release_1_5_public.digital_score USING gin (to_tsvector('simple', search_text));
CREATE INDEX IF NOT EXISTS idx_release_1_5_public_score_asset_score
    ON release_1_5_public.digital_score_asset (score_id, position);
CREATE INDEX IF NOT EXISTS idx_release_1_5_public_score_asset_format
    ON release_1_5_public.digital_score_asset (format);
CREATE INDEX IF NOT EXISTS idx_release_1_5_public_score_part_analysis
    ON release_1_5_public.digital_score_part_range (analysis_id, part_index);
