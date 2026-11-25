
PRAGMA page_size = 4096;
PRAGMA application_id = 1296323667;
PRAGMA user_version = 1;
CREATE TABLE metadata (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
) WITHOUT ROWID;
CREATE TABLE identifier (
    identifier_value TEXT PRIMARY KEY,
    identifier_family TEXT NOT NULL,
    identifier_token TEXT NOT NULL,
    validation_profile TEXT NOT NULL,
    identity_tier TEXT NOT NULL,
    canonical_uri TEXT NOT NULL UNIQUE,
    canonical_route_kind TEXT NOT NULL,
    canonical_route TEXT NOT NULL UNIQUE,
    canonical_label TEXT,
    publication_state TEXT NOT NULL
) WITHOUT ROWID;
CREATE UNIQUE INDEX identifier_family_token
    ON identifier(identifier_family, identifier_token);
CREATE INDEX identifier_route_kind
    ON identifier(canonical_route_kind, publication_state);
CREATE TABLE binding (
    binding_key TEXT PRIMARY KEY,
    identifier_value TEXT NOT NULL REFERENCES identifier(identifier_value),
    local_schema TEXT NOT NULL,
    local_table TEXT NOT NULL,
    local_record_key TEXT NOT NULL,
    local_identifier_value TEXT,
    binding_role TEXT NOT NULL,
    domain_kind TEXT,
    release_version TEXT NOT NULL,
    projection_key TEXT,
    evidence_sha256 TEXT,
    binding_state TEXT NOT NULL
) WITHOUT ROWID;
CREATE INDEX binding_identifier ON binding(identifier_value, binding_role);
CREATE INDEX binding_local_identifier
    ON binding(local_identifier_value COLLATE NOCASE, binding_state);
CREATE TABLE relation (
    relation_key TEXT PRIMARY KEY,
    source_identifier_value TEXT NOT NULL REFERENCES identifier(identifier_value),
    target_identifier_value TEXT NOT NULL REFERENCES identifier(identifier_value),
    relation_type TEXT NOT NULL,
    relation_state TEXT NOT NULL,
    release_version TEXT NOT NULL,
    projection_key TEXT,
    evidence_sha256 TEXT,
    relation_json TEXT NOT NULL
) WITHOUT ROWID;
CREATE INDEX relation_source
    ON relation(source_identifier_value, relation_type, relation_state);
CREATE INDEX relation_target
    ON relation(target_identifier_value, relation_type);
CREATE UNIQUE INDEX relation_single_redirect
    ON relation(source_identifier_value)
    WHERE relation_type IN ('alias_of', 'merged_into', 'replaced_by')
      AND relation_state IN ('prepared', 'active');
CREATE TABLE route_alias (
    route_alias_key TEXT PRIMARY KEY,
    alias_kind TEXT NOT NULL,
    alias_slug TEXT NOT NULL,
    target_identifier_value TEXT REFERENCES identifier(identifier_value),
    display_label TEXT NOT NULL,
    language_code TEXT,
    locality_qualifier TEXT,
    provenance_uri TEXT,
    evidence_sha256 TEXT,
    alias_state TEXT NOT NULL,
    UNIQUE(alias_kind, alias_slug)
) WITHOUT ROWID;
CREATE TABLE representation (
    representation_key TEXT PRIMARY KEY,
    identifier_value TEXT NOT NULL REFERENCES identifier(identifier_value),
    profile_key TEXT NOT NULL,
    profile_uri TEXT NOT NULL,
    media_type TEXT NOT NULL,
    representation_uri TEXT NOT NULL UNIQUE,
    release_version TEXT,
    representation_state TEXT NOT NULL
) WITHOUT ROWID;
CREATE INDEX representation_identifier
    ON representation(identifier_value, profile_key, media_type);
