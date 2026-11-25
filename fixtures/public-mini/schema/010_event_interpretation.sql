-- Opt-in local candidate projection; does not assign a dataset release.
CREATE TABLE release_1_5_public.documented_event_interpretation (
    event_id text PRIMARY KEY REFERENCES release_1_5_public.documented_event(event_id),
    narrative text NOT NULL,
    technical_facts_json text NOT NULL,
    unresolved_json text NOT NULL,
    interpretation_sha256 text NOT NULL,
    row_sha256 text NOT NULL
);
