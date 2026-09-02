-- =============================================================================
-- IJHC Global Heritage Portal — Stage 1 schema
--
-- Design rule that drives this whole file:
--   `items` holds VERIFIED information (a human said so).
--   `ai_analyses` holds SUGGESTED information (a machine said so).
-- They never share a column. The public portal reads `items` only.
-- =============================================================================

create extension if not exists "pgcrypto";
create extension if not exists "pg_trgm";

-- ── Enums ───────────────────────────────────────────────────────────────────

create type user_role as enum ('volunteer', 'admin');

create type item_status as enum ('pending', 'accepted', 'rejected', 'shadow_gallery');

-- Stage 2 adds 'visual_heritage' and 'heritage_sites' via ALTER TYPE ... ADD VALUE.
create type item_category as enum ('material_culture', 'documents', 'oral_histories');

create type community as enum ('bene_israel', 'cochin', 'baghdadi', 'bnei_menashe');

-- Only 'public' is reachable in Stage 1; the rest exist so Stage 2 needs no migration.
create type access_level as enum ('public', 'restricted', 'research', 'administrative');

create type analysis_status as enum ('succeeded', 'failed');

-- ── profiles ────────────────────────────────────────────────────────────────
-- A volunteer account. Created by an admin in Stage 2; seeded by hand in Stage 1.

create table profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null,
  full_name   text,
  role        user_role not null default 'volunteer',
  created_at  timestamptz not null default now()
);

comment on table profiles is 'Volunteer/admin accounts. Anyone without a row here is an anonymous visitor.';

-- ── items ───────────────────────────────────────────────────────────────────
-- The heritage record. Every field below is human-verified or human-entered.

create table items (
  id             uuid primary key default gen_random_uuid(),
  title          text not null check (char_length(trim(title)) between 1 and 200),
  description    text check (char_length(description) <= 4000),
  category       item_category not null,
  community      community,
  provenance     text check (char_length(provenance) <= 2000),
  source         text check (char_length(source) <= 200),
  keywords       text[] not null default '{}',
  language       text,
  status         item_status not null default 'pending',
  access         access_level not null default 'public',
  submitted_by   uuid references profiles(id) on delete set null,
  reviewed_by    uuid references profiles(id) on delete set null,
  reviewed_at    timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

comment on column items.keywords is 'Human-verified keywords. AI suggestions live in ai_analyses.keywords until a reviewer copies them here.';
comment on column items.submitted_by is 'Null for anonymous submissions, which are allowed in Stage 1.';

create index items_status_idx     on items (status);
create index items_category_idx   on items (category);
create index items_community_idx  on items (community);
create index items_created_at_idx on items (created_at desc);

-- A single searchable projection of the verified fields, so the portal has one
-- column to query instead of five OR-ed predicates.
--
-- Maintained by trigger rather than GENERATED ALWAYS AS: a generated column
-- requires an immutable expression, and array_to_string is only STABLE, so the
-- generated form is rejected at migration time.
alter table items add column search_text text;

create or replace function set_items_search_text()
returns trigger
language plpgsql
as $$
begin
  new.search_text :=
    coalesce(new.title, '') || ' ' ||
    coalesce(new.description, '') || ' ' ||
    coalesce(new.provenance, '') || ' ' ||
    coalesce(new.source, '') || ' ' ||
    coalesce(array_to_string(new.keywords, ' '), '');
  return new;
end;
$$;

create trigger items_set_search_text
  before insert or update of title, description, provenance, source, keywords
  on items
  for each row execute function set_items_search_text();

create index items_search_trgm_idx on items using gin (search_text gin_trgm_ops);

-- ── item_files ──────────────────────────────────────────────────────────────
-- The original upload. Originals are never mutated; derivatives would get their
-- own rows with kind <> 'original'.

create table item_files (
  id            uuid primary key default gen_random_uuid(),
  item_id       uuid not null references items(id) on delete cascade,
  storage_path  text not null unique,
  file_name     text not null,
  mime_type     text not null,
  byte_size     bigint not null check (byte_size > 0),
  width         integer,
  height        integer,
  duration_ms   integer,
  checksum      text,
  is_primary    boolean not null default true,
  created_at    timestamptz not null default now()
);

comment on table item_files is 'Technical metadata here is measured from the actual file. Nothing in this table is ever generated by AI.';

create index item_files_item_id_idx on item_files (item_id);
create unique index item_files_one_primary_idx on item_files (item_id) where is_primary;

-- ── ai_analyses ─────────────────────────────────────────────────────────────
-- Everything a machine claimed. Suggested until a human moves it into `items`.

create table ai_analyses (
  id           uuid primary key default gen_random_uuid(),
  item_id      uuid not null references items(id) on delete cascade,
  provider     text not null,
  model        text not null,
  status       analysis_status not null default 'succeeded',
  error        text,
  summary      text,
  keywords     text[] not null default '{}',
  language     text,
  confidence   numeric(3,2) check (confidence between 0 and 1),
  ocr_text     text,
  transcript   text,
  raw          jsonb,
  created_at   timestamptz not null default now()
);

comment on column ai_analyses.provider is 'gemini | mock. A value of "mock" means every field here is simulated and the UI must say so.';

create index ai_analyses_item_id_idx on ai_analyses (item_id, created_at desc);

-- ── item_events ─────────────────────────────────────────────────────────────
-- Append-only audit trail. The demo had none; a status change silently
-- overwrote the record with no way to see who did it or undo it.

create table item_events (
  id          uuid primary key default gen_random_uuid(),
  item_id     uuid not null references items(id) on delete cascade,
  actor_id    uuid references profiles(id) on delete set null,
  action      text not null,
  from_status item_status,
  to_status   item_status,
  changes     jsonb,
  created_at  timestamptz not null default now()
);

create index item_events_item_id_idx on item_events (item_id, created_at desc);

-- ── updated_at trigger ──────────────────────────────────────────────────────

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger items_set_updated_at
  before update on items
  for each row execute function set_updated_at();

-- ── new auth user -> profile ────────────────────────────────────────────────

create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, new.raw_user_meta_data ->> 'full_name')
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
