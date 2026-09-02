-- =============================================================================
-- Cataloguing moves behind the scenes.
--
-- The contribution screen asked "What kind of item is this?" and made the
-- contributor answer before anything else happened. That is a cataloguing
-- decision, and the client's position — settled on 2026-08-27 — is that
-- cataloguing is the machine's first pass and the volunteer's judgement, not a
-- question put to someone donating a photograph of their grandmother.
--
-- Three consequences, all here.
--
-- `items.category` becomes nullable. It has to: with nobody choosing it at
-- submission, the only other way to fill it would be to write the model's guess
-- straight into `items`, which is the one thing this schema exists to prevent.
-- Null now means "not catalogued yet", which is the truth, and the reviewer
-- sets it with the suggestion one click away.
--
-- `ai_analyses.suggested_category` is where the machine's answer goes, beside
-- every other thing it suggests.
--
-- `items.contributor_no_info` is removed. It was a checkbox for "I cannot
-- describe this item"; no contributor ever ticked it, and with the description
-- step gone there is nothing left for it to qualify.
-- =============================================================================

alter table items alter column category drop not null;

alter table ai_analyses add column if not exists suggested_category item_category;

alter table items drop column if exists contributor_no_info;
