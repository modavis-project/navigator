-- Publication-safe structured Orgbase specification projection.
-- This migration is additive and carries only bounded factual component data.

ALTER TABLE release_1_5_public.specification_component
    ADD COLUMN IF NOT EXISTS source_path text NOT NULL
    DEFAULT 'specifications.components.legacy';

ALTER TABLE release_1_5_public.specification_component
    ADD COLUMN IF NOT EXISTS source_entity_ref text;

ALTER TABLE release_1_5_public.specification_component
    ADD COLUMN IF NOT EXISTS detail_json text NOT NULL DEFAULT '{}';

ALTER TABLE release_1_5_public.technical_fact
    ADD COLUMN IF NOT EXISTS source_path text NOT NULL
    DEFAULT 'specifications.technical_fact';

CREATE INDEX IF NOT EXISTS idx_release_1_5_public_component_organ_source
    ON release_1_5_public.specification_component
    (organ_mdvs_id, source_record_id, component_type);

CREATE INDEX IF NOT EXISTS idx_release_1_5_public_fact_organ_source
    ON release_1_5_public.technical_fact
    (organ_mdvs_id, source_record_id, family);
