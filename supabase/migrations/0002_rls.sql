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
