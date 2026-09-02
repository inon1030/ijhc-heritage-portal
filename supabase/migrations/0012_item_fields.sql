-- =============================================================================
-- The logical tree, as rows.
--
-- Six branches of the tree already have columns on `items` — community, period,
-- origin_place, language, category, provenance — because the portal filters and
-- colours on them. The rest arrive here, one row per field per record.
--
-- Why rows and not more columns: the tree is Erez's document, it is not final,
-- and every revision of it would otherwise be a migration plus a type change
-- plus an edit to every screen. A key/value row costs one insert and the
-- definitions live in src/lib/fields/registry.ts, where changing them is an
-- edit to one array.
--
-- Why not JSONB on items: a volunteer needs to be able to ask "which records
-- name the Sassoon family", and `value` has to be indexable for that.
-- =============================================================================

create table if not exists item_fields (
  id          uuid primary key default gen_random_uuid(),
  item_id     uuid not null references items(id) on delete cascade,

  -- Not a foreign key: the vocabulary of field keys lives in the application,
  -- so that revising the tree does not mean a migration. An unknown key is
  -- dropped on read rather than rejected on write — a record that outlives a
  -- renamed branch keeps its other fields.
  field_key   text not null,
  value       text not null check (length(btrim(value)) > 0),

  -- Where the value came from. This is the column that keeps "AI suggests,
  -- humans verify" true at the row level: an 'ai' row is a proposal, and a
  -- volunteer accepting it rewrites source to 'volunteer'.
  source      text not null check (source in ('ai', 'contributor', 'volunteer')),

  -- Only ever set on 'ai' rows, and only ever at or above 0.70. The gate runs
  -- in src/lib/fields/suggestions.ts before anything reaches here; the check
  -- constraint is the second lock, so a future writer that forgets the gate
  -- fails loudly instead of quietly filling a reviewer's screen with guesses.
  confidence  numeric(3, 2) check (confidence is null or (confidence >= 0.70 and confidence <= 1)),
  basis       text check (basis is null or basis in ('read', 'inferred', 'guess')),
  note        text,

  created_at  timestamptz not null default now(),

  -- One value per field per record. A second reading of the same field
  -- replaces the first rather than stacking beside it.
  unique (item_id, field_key)
);

create index if not exists item_fields_item_idx on item_fields (item_id);

-- "Which records name the Sassoon family?" — the reason this is a table.
create index if not exists item_fields_lookup_idx on item_fields (field_key, lower(btrim(value)));

-- ── Row Level Security ──────────────────────────────────────────────────────
-- Reading follows item_files exactly: public on published records, everything
-- to a volunteer.
--
-- Writing differs, and the difference is deliberate. A contribution's fields
-- are written server-side by createItem with the service-role client, so anon
-- gets no INSERT policy — same as items. But a *reviewer* saving a record
-- writes fields through their own session, so authenticated volunteers do get
-- one, and RLS is what stops a pending account from using it.

alter table item_fields enable row level security;

create policy item_fields_public_select on item_fields
  for select to anon
  using (exists (
    select 1 from items i
    where i.id = item_fields.item_id
      and i.status = 'accepted'
      and i.access = 'public'
  ));

create policy item_fields_volunteer_select on item_fields
  for select to authenticated
  using (is_volunteer());

create policy item_fields_volunteer_insert on item_fields
  for insert to authenticated
  with check (is_volunteer());

create policy item_fields_volunteer_update on item_fields
  for update to authenticated
  using (is_volunteer())
  with check (is_volunteer());

create policy item_fields_volunteer_delete on item_fields
  for delete to authenticated
  using (is_volunteer());
