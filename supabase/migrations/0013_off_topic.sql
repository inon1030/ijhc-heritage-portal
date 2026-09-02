-- =============================================================================
-- The archive's own material, and everything else.
--
-- General India means "from India, Jewish, and no stream could be established".
-- It is a real shelf with a real colour on the masthead. Material that does not
-- belong to the archive at all is a different thing, and putting the two on one
-- shelf would colour the fifth stripe with a photograph of a festival in Peru,
-- put it in the community filter, and count it as heritage in a figure the
-- Center shows people.
--
-- So being off-topic is not a community. It is a judgement about the record,
-- held with the rest of the model's output — never written to `items`, the same
-- rule as every other suggestion — and shown to volunteers as its own group in
-- the queue. Rejecting it is still a person's decision.
-- =============================================================================

alter table ai_analyses
  add column if not exists off_topic boolean not null default false,
  add column if not exists off_topic_reason text;

comment on column ai_analyses.off_topic is
  'The model''s judgement that this does not belong to the archive. A suggestion only: a volunteer decides, and the queue shows it in its own group.';
