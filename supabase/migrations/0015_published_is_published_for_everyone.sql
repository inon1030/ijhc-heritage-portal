-- =============================================================================
-- What is published is published, whoever is looking.
--
-- `items_public_select`, `item_files_public_select` and `item_fields_public_select`
-- were written `to anon`. A signed-in request carries the role `authenticated`,
-- not `anon`, so those policies stopped applying the moment somebody had a
-- session — and the only authenticated SELECT policy is `is_volunteer()`,
-- which is false for a `pending` account.
--
-- The result: an anonymous stranger saw eight published records, and a signed-in
-- account awaiting approval saw zero. The sign-in screen promises the opposite
-- in as many words — "until then you will see the archive exactly as any
-- visitor does" — so the archive was showing different data to different people
-- and telling them it was the same.
--
-- This grants authenticated users precisely what anonymous users already had.
-- It cannot expose anything that was not already public, and the volunteer
-- policy beside it is untouched: `pending` still sees nothing unpublished.
--
-- The three sibling tables written later — families, keywords, item_families —
-- were already `{anon, authenticated}`. That is what makes this an oversight in
-- the earliest policies rather than a decision anybody took.
-- =============================================================================

alter policy items_public_select        on items       to anon, authenticated;
alter policy item_files_public_select   on item_files  to anon, authenticated;
alter policy item_fields_public_select  on item_fields to anon, authenticated;
