-- Candidate-only qualified relocation evidence; no canonical identity changes.
CREATE TABLE release_1_5_public.relocation_evidence (
 activity_id text PRIMARY KEY,
 event_id text NOT NULL REFERENCES release_1_5_public.documented_event(event_id),
 organ_mdvs_id text NOT NULL REFERENCES release_1_5_public.organ(mdvs_id),
 source_record_id text NOT NULL REFERENCES release_1_5_public.source_membership(source_record_id),
 payload_json text NOT NULL,
 row_sha256 text NOT NULL
);
CREATE INDEX relocation_evidence_event_idx ON release_1_5_public.relocation_evidence(event_id);
CREATE INDEX relocation_evidence_organ_idx ON release_1_5_public.relocation_evidence(organ_mdvs_id);
CREATE INDEX source_actor_route_idx ON release_1_5_public.organ_builder_assertion(actor_route_id);
CREATE INDEX source_actor_source_idx ON release_1_5_public.organ_builder_assertion(source_record_id);
