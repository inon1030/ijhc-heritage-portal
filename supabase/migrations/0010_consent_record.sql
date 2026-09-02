-- =============================================================================
-- What the contributor was told, and when.
--
-- A consent notice that is not recorded is not consent — it is a paragraph that
-- happened to be on the page. Wording changes over the life of an archive, and
-- the question years later is always "what did *this* contributor agree to",
-- not "what does the site say today".
--
-- So the version string is stamped on the record at submission. The text of
-- every version is kept in `src/lib/consent.ts` and versions are never edited
-- in place; a change means a new version, and old records keep pointing at what
-- was actually shown to the person who sent them.
-- =============================================================================

alter table items add column if not exists consent_version text;
alter table items add column if not exists consent_at timestamptz;

create index if not exists items_consent_version_idx
  on items (consent_version) where consent_version is not null;
