CREATE TABLE release_1_5_public.coordinate_interpretation (
 subject_kind text NOT NULL,
 subject_id text NOT NULL,
 precision text,
 evidence_json text NOT NULL,
 row_sha256 text NOT NULL,
 PRIMARY KEY(subject_kind,subject_id)
);
