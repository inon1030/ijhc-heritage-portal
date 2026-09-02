-- =============================================================================
-- Controlled vocabulary, families, contributor identity, account approval,
-- and the evidence ledger.
--
-- From the client meeting of 2026-08-27. Four separate concerns, one migration,
-- because they share the admin role that this file also introduces.
-- =============================================================================

-- ── the admin distinction ───────────────────────────────────────────────────
-- Until now every signed-in profile could do everything. Deleting a vocabulary
-- term breaks records that already use it, so deletion is an admin act while
-- adding stays open to any volunteer.

alter table profiles add column if not exists approved_by  uuid references profiles(id);
alter table profiles add column if not exists approved_at  timestamptz;
alter table profiles add column if not exists requested_at timestamptz not null default now();

-- A pending account has a profile row, so the old definition of is_volunteer()
-- — "a profile exists" — would have let it straight into the review queue.
create or replace function is_volunteer()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and role in ('volunteer', 'admin')
  );
$$;

create or replace function is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from profiles where id = auth.uid() and role = 'admin'
  );
$$;

-- ── the controlled vocabulary ───────────────────────────────────────────────
-- A record may only be saved with keywords drawn from here. The point is that
-- two volunteers cataloguing the same kind of object reach for the same word.

create table if not exists keywords (
  id          uuid primary key default gen_random_uuid(),
  term        text not null check (length(btrim(term)) between 2 and 60),
  -- Null means the term applies to every stream. A term scoped to a community
  -- only appears when that community is selected.
  community   community,
  created_by  uuid references profiles(id),
  created_at  timestamptz not null default now()
);

-- Case-insensitive, and scoped: "Synagogue" may exist once globally and once
-- per community, but not twice in the same scope.
-- Two partial indexes rather than one on coalesce(community::text, '*'):
-- casting an enum to text is only STABLE, and an index expression must be
-- IMMUTABLE. Same reason `search_text` is trigger-maintained.
create unique index if not exists keywords_term_global_uniq
  on keywords (lower(btrim(term))) where community is null;

create unique index if not exists keywords_term_scoped_uniq
  on keywords (lower(btrim(term)), community) where community is not null;

create index if not exists keywords_community_idx on keywords (community);

-- What the model proposed that the vocabulary does not contain yet.
--
-- This is the other half of the bargain. A closed vocabulary keeps cataloguing
-- consistent, but on its own it makes the archive blind to whatever nobody has
-- thought of yet — which for a heritage collection is the material that matters
-- most. So terms the model suggests from outside the list are not discarded;
-- they queue here for a volunteer to promote or decline.
create table if not exists keyword_candidates (
  id            uuid primary key default gen_random_uuid(),
  term          text not null check (length(btrim(term)) between 2 and 60),
  community     community,
  seen_count    integer not null default 1,
  first_item_id uuid references items(id) on delete set null,
  status        text not null default 'open' check (status in ('open', 'accepted', 'declined')),
  decided_by    uuid references profiles(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create unique index if not exists keyword_candidates_term_global_uniq
  on keyword_candidates (lower(btrim(term))) where community is null;

create unique index if not exists keyword_candidates_term_scoped_uniq
  on keyword_candidates (lower(btrim(term)), community) where community is not null;

create index if not exists keyword_candidates_open_idx
  on keyword_candidates (status, seen_count desc) where status = 'open';

-- ── families ────────────────────────────────────────────────────────────────
-- Family names are how this material is actually organised: the Sassoons, the
-- Ezras, the Benjamins. A family belongs to one stream, and a record may carry
-- more than one family.

create table if not exists families (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (length(btrim(name)) between 2 and 80),
  community  community not null,
  notes      text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create unique index if not exists families_name_community_uniq
  on families (lower(btrim(name)), community);

create table if not exists item_families (
  item_id   uuid not null references items(id) on delete cascade,
  family_id uuid not null references families(id) on delete cascade,
  primary key (item_id, family_id)
);

create index if not exists item_families_family_idx on item_families (family_id);

-- ── contributor identity ────────────────────────────────────────────────────
-- An anonymous contributor may leave an email so a volunteer can group their
-- submissions and come back with a question.
--
-- It is NOT an identity: the address is unverified, it grants no access, and
-- nothing is ever retrieved by typing it. Anyone can type anyone's address, so
-- treating it as a key would hand one contributor another's submissions.

alter table items add column if not exists contributor_email text
  check (contributor_email is null or contributor_email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$');

create index if not exists items_contributor_email_idx
  on items (lower(contributor_email)) where contributor_email is not null;

-- The contributor said outright that they cannot describe this item. Worth
-- knowing: it separates "left blank" from "asked and could not say", and the
-- second is a reason to reach out rather than to guess.
alter table items add column if not exists contributor_no_info boolean not null default false;

-- Several files on one record need a stable order — page 1 before page 2.
alter table item_files add column if not exists position integer not null default 0;

create index if not exists item_files_item_position_idx on item_files (item_id, position);

-- ── the evidence ledger ─────────────────────────────────────────────────────
-- Replaces the confidence percentage as the thing a reviewer actually reads.
--
-- Shape: { "<field>": { "basis": "read" | "inferred" | "guess", "note": "..." } }
--
--   read      the value is written in the material and was transcribed
--   inferred  drawn from style, dress, printing, architecture
--   guess     neither; the model is saying so itself
--
-- The percentage is still stored and still shown to volunteers as a sorting
-- aid. It is never shown in the public portal. See ADR-012.
alter table ai_analyses add column if not exists evidence jsonb;

-- ── row level security on the new tables ────────────────────────────────────

alter table keywords           enable row level security;
alter table keyword_candidates enable row level security;
alter table families           enable row level security;
alter table item_families      enable row level security;

-- Vocabulary and families are readable by anyone: they are how the public
-- portal labels and filters records.
create policy keywords_public_select on keywords
  for select to anon, authenticated using (true);

create policy families_public_select on families
  for select to anon, authenticated using (true);

create policy item_families_public_select on item_families
  for select to anon, authenticated using (true);

-- Adding is a volunteer act; removing is an admin act, because a delete
-- silently changes records that already reference the term.
create policy keywords_volunteer_insert on keywords
  for insert to authenticated with check (is_volunteer());

create policy keywords_admin_update on keywords
  for update to authenticated using (is_admin()) with check (is_admin());

create policy keywords_admin_delete on keywords
  for delete to authenticated using (is_admin());

create policy families_volunteer_insert on families
  for insert to authenticated with check (is_volunteer());

create policy families_admin_update on families
  for update to authenticated using (is_admin()) with check (is_admin());

create policy families_admin_delete on families
  for delete to authenticated using (is_admin());

create policy item_families_volunteer_write on item_families
  for insert to authenticated with check (is_volunteer());

create policy item_families_volunteer_delete on item_families
  for delete to authenticated using (is_volunteer());

-- Candidates are an internal working queue, exactly like ai_analyses.
create policy keyword_candidates_volunteer_select on keyword_candidates
  for select to authenticated using (is_volunteer());

create policy keyword_candidates_volunteer_update on keyword_candidates
  for update to authenticated using (is_volunteer()) with check (is_volunteer());

-- Only an admin decides who becomes a volunteer.
create policy profiles_admin_update on profiles
  for update to authenticated using (is_admin()) with check (is_admin());
