-- =============================================================================
-- The archive speaks more than one language
--
-- Until now a record was shown in whatever language it was written in. An
-- archive of four communities holds Hebrew, Marathi, Malayalam and
-- Judeo-Arabic, and its readers are in Israel, India, Britain and the United
-- States; "read it in the language it happens to be in" is not a service.
--
-- Three rules shape what follows.
--
-- 1. **A translation is never the record.** `items` holds what a person wrote
--    or verified, and nothing here touches it. Translations live in their own
--    table, are labelled as machine output wherever they are shown, and the
--    original is always one click away. An archive that quietly replaces what a
--    family wrote with a machine's English has destroyed the thing it exists to
--    keep. This is the same rule as `ai_analyses` (AGENTS.md rule 1), applied
--    to a second kind of machine output.
--
-- 2. **It is made on demand and kept.** Translating every record into every
--    language at publish would pay for five translations of a record nobody
--    reads in four of them. The first reader who asks for Marathi causes the
--    work; everybody after them gets it from this table. A record published
--    tomorrow is translated the first time somebody looks at it, which is what
--    makes this keep up with an archive that grows.
--
-- 3. **It goes stale when the record changes.** `source_hash` is the digest of
--    the exact text the translation was made from. A volunteer corrects a
--    description, the hash no longer matches, and the row is ignored and
--    remade. Without it the translations drift away from the records silently,
--    which is the failure every "we translated it once" system arrives at.
-- =============================================================================

-- ── the languages the archive publishes in ──────────────────────────────────
-- Data, not an enum: adding Judeo-Arabic later is an insert, not a migration,
-- and the picker needs somewhere to read its labels from. Each is named in its
-- own language as well as in English, because a language picker that says
-- "Hebrew" to somebody who reads only Hebrew has not helped them.

create table if not exists archive_languages (
  code         text primary key check (code ~ '^[a-z]{2,3}(-[A-Za-z]{2,8})*$'),
  label_en     text not null,
  label_native text not null,
  rtl          boolean not null default false,
  -- The language the interface and most records are authored in. Exactly one.
  is_source    boolean not null default false,
  position     smallint not null default 100,
  enabled      boolean not null default true
);

comment on table archive_languages is
  'Languages a reader may ask for. Adding one is an insert; the translations for it are made on demand.';

create unique index if not exists archive_languages_one_source_idx
  on archive_languages ((true)) where is_source;

insert into archive_languages (code, label_en, label_native, rtl, is_source, position) values
  ('en', 'English',   'English',   false, true,  1),
  ('he', 'Hebrew',    'עברית',     true,  false, 2),
  ('hi', 'Hindi',     'हिन्दी',       false, false, 3),
  ('mr', 'Marathi',   'मराठी',      false, false, 4),
  ('ml', 'Malayalam', 'മലയാളം',    false, false, 5)
on conflict (code) do nothing;

-- ── the translations themselves ─────────────────────────────────────────────

create table if not exists item_translations (
  item_id     uuid not null references items(id) on delete cascade,
  lang        text not null references archive_languages(code) on delete cascade,
  field       text not null check (field in (
                'title', 'description', 'provenance', 'period', 'origin_place', 'transcript'
              )),
  value       text not null,
  -- 'human' wins over 'machine' and is never overwritten by a re-translation.
  source      text not null default 'machine' check (source in ('machine', 'human')),
  model       text,
  source_hash text not null,
  created_at  timestamptz not null default now(),
  primary key (item_id, lang, field)
);

comment on column item_translations.source_hash is
  'Digest of the text this was translated from. A mismatch means the record changed and this row is stale.';
comment on column item_translations.source is
  'A volunteer''s correction is ''human'' and survives re-translation; the machine only ever replaces its own work.';

create index if not exists item_translations_item_lang_idx
  on item_translations (item_id, lang);

-- ── the vocabulary, translated once rather than per record ──────────────────
--
-- Keywords come from a controlled list, so there is no sense in translating
-- "Synagogue" once for every record that carries it. Translating the term
-- itself means the same concept reads with the same label in every language and
-- on every record — which is the cross-referencing the thesaurus was rebuilt
-- for (0021), extended across languages.

create table if not exists keyword_translations (
  keyword_id uuid not null references keywords(id) on delete cascade,
  lang       text not null references archive_languages(code) on delete cascade,
  label      text not null check (length(btrim(label)) between 1 and 120),
  source     text not null default 'machine' check (source in ('machine', 'human')),
  created_at timestamptz not null default now(),
  primary key (keyword_id, lang)
);

-- ── who may read and write them ─────────────────────────────────────────────

alter table archive_languages   enable row level security;
alter table item_translations   enable row level security;
alter table keyword_translations enable row level security;

-- The list of languages is public: the picker is on the public site.
create policy archive_languages_read on archive_languages
  for select to anon, authenticated
  using (enabled);

create policy archive_languages_admin_write on archive_languages
  for all to authenticated
  using (is_admin()) with check (is_admin());

/*
 * A translation is exactly as visible as the record it translates.
 *
 * Not a copy of the visibility rules — a reference to them. The subquery is
 * evaluated as the calling role, so `items`' own policies decide what it can
 * see: an anonymous visitor's `items_public_select` admits published, public,
 * unbinned records and therefore admits their translations; a binned record's
 * translations disappear with it; a volunteer sees the queue's translations
 * because they see the queue. One policy that cannot drift away from the model
 * it enforces, which four hand-copied predicates would.
 */
create policy item_translations_follow_the_item on item_translations
  for select to anon, authenticated
  using (exists (select 1 from items i where i.id = item_translations.item_id));

-- Machine translations are written by the server with the service role, which
-- is not subject to RLS. This is for a volunteer correcting one by hand.
create policy item_translations_volunteer_write on item_translations
  for all to authenticated
  using (is_volunteer()) with check (is_volunteer());

create policy keyword_translations_read on keyword_translations
  for select to anon, authenticated
  using (true);

create policy keyword_translations_volunteer_write on keyword_translations
  for all to authenticated
  using (is_volunteer()) with check (is_volunteer());
