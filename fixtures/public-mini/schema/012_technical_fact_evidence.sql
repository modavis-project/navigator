CREATE TABLE release_1_5_public.technical_fact_evidence (
 fact_id text PRIMARY KEY REFERENCES release_1_5_public.technical_fact(fact_id),
 evidence_json text NOT NULL,
 row_sha256 text NOT NULL
);
