-- Retained representations are evidence of the selected event, not lost rows.
CREATE TABLE release_1_5_public.documented_event_representation (
 representation_id text PRIMARY KEY,
 event_id text NOT NULL REFERENCES release_1_5_public.documented_event(event_id),
 evidence_json text NOT NULL,
 row_sha256 text NOT NULL
);
CREATE INDEX documented_event_representation_event_idx ON release_1_5_public.documented_event_representation(event_id);
CREATE TABLE release_1_5_public.configuration_evidence (
 description_id text PRIMARY KEY REFERENCES release_1_5_public.specification_description(description_id),
 evidence_json text NOT NULL,
 row_sha256 text NOT NULL
);
