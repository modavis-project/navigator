-- Exact established participant target IDs; this does not create identity links.
-- Supports bounded event evidence navigation without scanning every participant.
CREATE INDEX documented_event_context_participant_target_gin
 ON release_1_5_public.documented_event_context
 USING gin ((participants_json::jsonb) jsonb_path_ops);
