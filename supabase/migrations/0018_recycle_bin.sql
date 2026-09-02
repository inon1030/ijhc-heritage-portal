-- =============================================================================
-- Nothing is destroyed in one step.
--
-- `items_volunteer_delete` let any approved volunteer permanently remove a
-- record — the row, its catalogue fields, its analyses, and by way of
-- deleteItem() the scanned original out of the bucket. One click, no
-- confirmation the database could enforce, no way back. A vocabulary term was
-- better protected than the only surviving photograph of somebody's
-- grandmother: removing a *word* was already an administrator's act.
--
-- Deletion now happens in two moves by two different people:
--
--   a volunteer sends a record to the bin      (soft: deleted_at is set)
--   an administrator restores it, or purges it (hard: the row and the files)
--
-- The invariant that makes this real is in the policies rather than the UI:
-- `items_admin_delete` requires `deleted_at is not null`, so a hard delete is
-- only reachable for a record that is already in the bin. There is no path,
-- for anybody, from a live record to a destroyed one in a single statement.
--
-- Restoring is deliberately not a volunteer's to do either. A volunteer who
-- binned a record by accident asks an administrator, which is the same
-- direction every other irreversible act in this schema points.
-- =============================================================================

alter table items add column if not exists deleted_at     timestamptz;
alter table items add column if not exists deleted_by     uuid references profiles(id);
alter table items add column if not exists deleted_reason text;

-- The bin is small and the archive is not, so this indexes the bin.
create index if not exists items_deleted_idx
  on items (deleted_at desc) where deleted_at is not null;

-- ── what a binned record disappears from ────────────────────────────────────
-- A soft delete leaves `status` and `access` untouched — a binned record is
-- still 'accepted' and still 'public' — so without these it would have gone on
-- being published. The bin has to be a term in every read policy that decides
-- visibility, not a status value, precisely so that restoring it puts back the
-- review decision that was already made.

alter policy items_public_select on items
  using (status = 'accepted' and access = 'public' and deleted_at is null);

alter policy items_volunteer_select on items
  using (is_volunteer() and deleted_at is null);

alter policy item_files_public_select on item_files
  using (exists (
    select 1 from items i
    where i.id = item_files.item_id
      and i.status = 'accepted'
      and i.access = 'public'
      and i.deleted_at is null
  ));

alter policy item_fields_public_select on item_fields
  using (exists (
    select 1 from items i
    where i.id = item_fields.item_id
      and i.status = 'accepted'
      and i.access = 'public'
      and i.deleted_at is null
  ));

-- ── who may move a record in and out of the bin ─────────────────────────────
--
-- The asymmetry between USING and WITH CHECK is the whole mechanism, so it is
-- worth stating plainly: USING is tested against the row as it stands, WITH
-- CHECK against the row as it would become.
--
-- A volunteer may act on a record that is not binned (USING) and the result
-- only has to be theirs to write (WITH CHECK) — so they can set `deleted_at`,
-- which bins it. They cannot clear it again, because the row they would be
-- acting on fails USING the moment it is binned. Sending to the bin is
-- therefore one-way for a volunteer, without a single line of application code
-- being involved.

alter policy items_volunteer_update on items
  using (is_volunteer() and deleted_at is null)
  with check (is_volunteer());

create policy items_admin_bin_select on items
  for select to authenticated
  using (is_admin() and deleted_at is not null);

create policy items_admin_bin_update on items
  for update to authenticated
  using (is_admin() and deleted_at is not null)
  with check (is_admin());

-- The old blanket delete. Any volunteer, any record, immediately.
drop policy if exists items_volunteer_delete on items;

-- Purging: an administrator, and only out of the bin.
create policy items_admin_delete on items
  for delete to authenticated
  using (is_admin() and deleted_at is not null);

-- ── the same decision, for the file bytes ───────────────────────────────────
-- /api/files reads with the service-role client, so RLS does not reach it. It
-- makes the published-or-not decision itself, and a binned record is still
-- 'accepted' and 'public'. Without the matching check there, binning a record
-- would remove it from every page while leaving its scan on a URL that any
-- search engine had already crawled. The route reads `deleted_at` too — see
-- src/app/api/files/[fileId]/route.ts.
