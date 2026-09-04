-- =============================================================================
-- A translated transcript is still a transcript
--
-- 0023 gave `item_translations` one select policy: a translation is visible to
-- whoever can see the record it belongs to. For a title or a description that
-- is right, because those are published fields.
--
-- It is wrong for a transcript. OCR and audio transcription live in
-- `ai_analyses`, which `ai_analyses_volunteer_select` restricts to signed-in
-- volunteers, and the public record page does not render them at all. A
-- translation of a transcript stored under 0023's policy would have been
-- readable by anyone who could read the record — the material itself private,
-- its translation public. The machine's reading of a family's private document,
-- published, because it had been through a translator.
--
-- Found before anything was written to the table, by asking where the text
-- being translated comes from rather than where it is going.
--
-- The fix mirrors `ai_analyses` exactly: the transcript row is volunteer-only,
-- everything else follows the record.
-- =============================================================================

drop policy if exists item_translations_follow_the_item on item_translations;

-- Published fields: as visible as the record they belong to, and no more. The
-- subquery is evaluated as the calling role, so `items`' own policies decide —
-- a binned record's translations vanish with it, without this policy having to
-- know what binning is.
create policy item_translations_follow_the_item on item_translations
  for select to anon, authenticated
  using (
    field <> 'transcript'
    and exists (select 1 from items i where i.id = item_translations.item_id)
  );

-- The machine's reading, and its translation, are for the people cataloguing.
create policy item_translations_volunteer_select on item_translations
  for select to authenticated
  using (is_volunteer());

comment on column item_translations.field is
  'A ''transcript'' row is volunteer-only, like the ai_analyses row it comes from. Everything else is as public as the record.';
