-- =============================================================================
-- IJHC Heritage Portal — complete Stage 1 schema, in one file.
--
-- Paste the whole thing into the Supabase SQL editor and run it once, on a
-- NEW project. It is the three files in supabase/migrations/ concatenated in
-- order; use those individually if you prefer the CLI.
-- =============================================================================


-- >>>>>>>>>>>>>>>>>>>>  0001_init.sql  <<<<<<<<<<<<<<<<<<<<

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

-- >>>>>>>>>>>>>>>>>>>>  0002_rls.sql  <<<<<<<<<<<<<<<<<<<<

-- =============================================================================
-- Row Level Security
--
-- The demo shipped `USING (true)` for anon on SELECT/INSERT/UPDATE/DELETE, which
-- meant anyone holding the anon key — it is in the public JS bundle — could
-- delete the entire archive from a browser console. This file is the fix.
--
-- Stage 1 permission model:
--   anonymous visitor : read accepted items only. No writes, ever.
--   volunteer (signed in) : read everything, edit and delete.
--
-- Item creation by an anonymous visitor is allowed by the product, but it does
-- NOT happen through RLS. It goes through POST /api/items, which runs
-- server-side, validates with Zod, and forces status = 'pending'. That keeps the
-- anon role read-only while still permitting public contribution.
-- =============================================================================

alter table profiles     enable row level security;
alter table items        enable row level security;
alter table item_files   enable row level security;
alter table ai_analyses  enable row level security;
alter table item_events  enable row level security;

-- Is the caller a signed-in volunteer or admin?
create or replace function is_volunteer()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from profiles where id = auth.uid());
$$;

-- ── profiles ────────────────────────────────────────────────────────────────

create policy profiles_self_select on profiles
  for select to authenticated
  using (id = auth.uid());

create policy profiles_volunteer_select on profiles
  for select to authenticated
  using (is_volunteer());

-- ── items ───────────────────────────────────────────────────────────────────

create policy items_public_select on items
  for select to anon
  using (status = 'accepted' and access = 'public');

create policy items_volunteer_select on items
  for select to authenticated
  using (is_volunteer());

create policy items_volunteer_update on items
  for update to authenticated
  using (is_volunteer())
  with check (is_volunteer());

create policy items_volunteer_delete on items
  for delete to authenticated
  using (is_volunteer());

-- Deliberately absent: any INSERT policy. Creation is server-only.

-- ── item_files ──────────────────────────────────────────────────────────────

create policy item_files_public_select on item_files
  for select to anon
  using (exists (
    select 1 from items i
    where i.id = item_files.item_id
      and i.status = 'accepted'
      and i.access = 'public'
  ));

create policy item_files_volunteer_select on item_files
  for select to authenticated
  using (is_volunteer());

create policy item_files_volunteer_delete on item_files
  for delete to authenticated
  using (is_volunteer());

-- ── ai_analyses ─────────────────────────────────────────────────────────────
-- Never readable by anonymous visitors. AI output is an internal working note
-- until a reviewer promotes it into `items`.

create policy ai_analyses_volunteer_select on ai_analyses
  for select to authenticated
  using (is_volunteer());

-- ── item_events ─────────────────────────────────────────────────────────────

create policy item_events_volunteer_select on item_events
  for select to authenticated
  using (is_volunteer());

create policy item_events_volunteer_insert on item_events
  for insert to authenticated
  with check (is_volunteer() and actor_id = auth.uid());

-- >>>>>>>>>>>>>>>>>>>>  0003_storage.sql  <<<<<<<<<<<<<<<<<<<<

-- =============================================================================
-- Storage
--
-- The `heritage` bucket is PRIVATE and carries no anon or authenticated
-- policies. Every read and write is brokered by the server:
--
--   upload : POST /api/uploads/sign  -> createSignedUploadUrl (service role)
--   read   : GET  /api/files/[id]    -> permission check, then a 10-minute
--                                       signed URL (service role)
--
-- In the demo this bucket was public with `USING (true)`, so the files attached
-- to rejected and pending items stayed reachable to anyone who had the URL.
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'heritage',
  'heritage',
  false,
  52428800, -- 50 MB
  array[
    'image/jpeg','image/png','image/webp','image/gif','image/tiff',
    'application/pdf',
    'audio/mpeg','audio/wav','audio/ogg','audio/mp4','audio/x-m4a',
    'video/mp4','video/webm','video/quicktime'
  ]
)
on conflict (id) do update set
  public             = excluded.public,
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Remove anything a previous project may have left behind.
--
-- Wrapped so the migration still completes on a fresh project where these do
-- not exist and the role lacks ownership of storage.objects.
do $$
begin
  drop policy if exists "anon_select_heritage_objects" on storage.objects;
  drop policy if exists "anon_insert_heritage_objects" on storage.objects;
  drop policy if exists "anon_update_heritage_objects" on storage.objects;
  drop policy if exists "anon_delete_heritage_objects" on storage.objects;
exception
  when insufficient_privilege then
    raise notice 'Skipped storage policy cleanup: not the owner of storage.objects. Nothing to clean on a new project.';
end
$$;
