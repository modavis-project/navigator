-- Navigator read model only. Source evidence IDs never become actor identities.
CREATE TABLE IF NOT EXISTS release_1_5_public.actor_directory_entry (
    entry_id text NOT NULL,
    entry_kind text NOT NULL CHECK (entry_kind IN ('canonical_actor','source_builder','source_participant')),
    publication_state text NOT NULL CHECK (publication_state IN ('canonical','source')),
    actor_type text NOT NULL CHECK (actor_type IN ('person','organization','unknown')),
    canonical_actor_id text REFERENCES release_1_5_public.actor(mdvs_id),
    label text NOT NULL,
    search_text text NOT NULL,
    source_keys text[] NOT NULL,
    role_keys text[] NOT NULL,
    source_record_count integer NOT NULL CHECK (source_record_count>=0),
    assertion_count integer NOT NULL CHECK (assertion_count>=0),
    organ_count integer NOT NULL CHECK (organ_count>=0),
    detail_url text NOT NULL,
    evidence_reference_json text NOT NULL,
    PRIMARY KEY (entry_kind,entry_id),
    CHECK ((publication_state='canonical')=(canonical_actor_id IS NOT NULL)),
    CHECK ((entry_kind='canonical_actor')=(publication_state='canonical'))
);
CREATE INDEX IF NOT EXISTS actor_directory_label_idx ON release_1_5_public.actor_directory_entry(lower(label),entry_kind,entry_id);
CREATE INDEX IF NOT EXISTS actor_directory_state_label_idx ON release_1_5_public.actor_directory_entry(publication_state,lower(label),entry_kind,entry_id);
CREATE INDEX IF NOT EXISTS actor_directory_class_label_idx ON release_1_5_public.actor_directory_entry(actor_type,lower(label),entry_kind,entry_id);
CREATE INDEX IF NOT EXISTS actor_directory_organs_idx ON release_1_5_public.actor_directory_entry(organ_count DESC,lower(label),entry_kind,entry_id);
CREATE INDEX IF NOT EXISTS actor_directory_sources_idx ON release_1_5_public.actor_directory_entry USING gin(source_keys);
CREATE INDEX IF NOT EXISTS actor_directory_roles_idx ON release_1_5_public.actor_directory_entry USING gin(role_keys);
