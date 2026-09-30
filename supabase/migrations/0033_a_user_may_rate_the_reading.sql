-- A user may say how accurate the machine's reading was (30.09.2026).
--
-- Michal, via Rafi, 24.09: "Enable the user to rate the accuracy of the
-- AI-generated analysis." The user sees the reading on the pre-review screen,
-- before sending, and may answer 1 (not accurate at all) to 5 (very accurate).
-- It is optional; null means they did not answer.
--
-- Who can see it does not change: it is a column of `ai_analyses`, so
-- `ai_analyses_volunteer_select` (0002) governs it exactly as it governs the
-- reading itself - signed-in, approved volunteers only. It is written once,
-- by createItem with the service-role client, like every other column of the
-- row; there is no policy to add. One submission carries one answer, written
-- to each file's analysis row of that record.

alter table ai_analyses
  add column if not exists user_rating smallint
    check (user_rating between 1 and 5);

comment on column ai_analyses.user_rating is
  'How accurate the user who sent the item said the reading was, 1 to 5. Null means they did not answer.';
