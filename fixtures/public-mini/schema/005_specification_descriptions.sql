-- Description identity is local to the source projection, not a physical state.
CREATE TABLE release_1_5_public.specification_description (
    description_id text PRIMARY KEY,
    organ_mdvs_id text NOT NULL REFERENCES release_1_5_public.organ(mdvs_id),
    source_record_id text NOT NULL REFERENCES release_1_5_public.source_membership(source_record_id),
    description_kind text NOT NULL CHECK (description_kind IN ('main', 'alternative')),
    source_heading text NOT NULL,
    period_label text NOT NULL,
    time_kind text NOT NULL,
    time_relation text NOT NULL,
    sort_year integer,
    subject_kind text NOT NULL CHECK (subject_kind IN ('record_context', 'earlier_instrument')),
    realization text NOT NULL CHECK (realization IN ('reported', 'proposed')),
    coverage text NOT NULL,
    state_ref text,
    source_revision text NOT NULL,
    description_revision text NOT NULL,
    source_paths_json text NOT NULL,
    normalization_profile text NOT NULL,
    stop_count integer NOT NULL CHECK (stop_count >= 0),
    component_count integer NOT NULL CHECK (component_count >= 0)
);
CREATE INDEX idx_spec_description_organ ON release_1_5_public.specification_description (organ_mdvs_id, description_kind, sort_year);
CREATE INDEX idx_spec_description_source ON release_1_5_public.specification_description (source_record_id);

CREATE TABLE release_1_5_public.specification_description_component (
    component_id text PRIMARY KEY,
    description_id text NOT NULL REFERENCES release_1_5_public.specification_description(description_id),
    division_label text NOT NULL,
    division_position integer NOT NULL,
    division_compass text,
    position integer NOT NULL,
    component_type text NOT NULL CHECK (component_type IN ('stop', 'coupler', 'accessory', 'compound_stop')),
    label text NOT NULL,
    pitch_label text,
    source_wording text NOT NULL,
    source_paths_json text NOT NULL,
    detail_json text NOT NULL
);
CREATE INDEX idx_spec_description_component ON release_1_5_public.specification_description_component (description_id, division_position, position);
