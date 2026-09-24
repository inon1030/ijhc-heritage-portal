-- A person may correct what the machine read (24.09.2026).
--
-- Tirza, 22.09: Gemini misread an inscription from the Parur synagogue, and
-- "I could not change the wrong reading in the field that showed it. Where can
-- it be changed?" Nowhere. The text read off a file lived only in
-- `ai_analyses.ocr_text`, shown read-only to the contributor and to the
-- moderator alike.
--
-- The correction sits beside the machine's text, not over it. The original is
-- what the model said and stays what the model said; the corrected column is
-- what a person says the item reads. Readers prefer the correction when there
-- is one.
--
-- Who can see it does not change: these are columns of `ai_analyses`, so
-- `ai_analyses_volunteer_select` (0002) governs them exactly as it governs the
-- machine's text - signed-in, approved volunteers only, and the public record
-- page renders neither. Writes go through route handlers with the service-role
-- client, as every other write to this table does; there is no update policy
-- to add. Making a corrected reading public is a separate decision.

alter table ai_analyses
  add column if not exists ocr_text_corrected text,
  add column if not exists transcript_corrected text,
  add column if not exists corrected_by uuid references profiles(id) on delete set null,
  add column if not exists corrected_at timestamptz;

comment on column ai_analyses.ocr_text_corrected is
  'The text on the item as a person corrected it. Null means nobody corrected the machine reading.';
comment on column ai_analyses.transcript_corrected is
  'The transcript as a person corrected it. Null means nobody corrected the machine reading.';
comment on column ai_analyses.corrected_by is
  'The volunteer who last corrected the reading. Null with a correction present means the contributor corrected it before submitting.';
