-- Source wording and previous projection retained for display normalization.
CREATE TABLE release_1_5_public.actor_label_interpretation (
 actor_mdvs_id text PRIMARY KEY REFERENCES release_1_5_public.actor(mdvs_id),
 evidence_json text NOT NULL,
 row_sha256 text NOT NULL
);
