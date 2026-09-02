-- =============================================================================
-- A volunteer is a volunteer. Contributor contact details are the administrator's.
--
-- `items.contributor_email` sat in the same row as everything else, so every
-- approved volunteer read the personal address of every member of the public
-- who had ever sent the archive a photograph. Volunteers are trusted to
-- catalogue heritage material; that is not the same as being trusted with a
-- list of private email addresses, and the archive never asked contributors to
-- agree to the second thing.
--
-- Column privileges cannot express this. Both roles are `authenticated`, and a
-- Postgres column GRANT is per-role, so "volunteers no, administrators yes"
-- is not sayable in a column grant. Revoking the column would also break every
-- `select('*')` in the app. So the address moves to its own table, where it is
-- an ordinary row-level policy: `is_admin()`.
--
-- ── the part that would otherwise break ─────────────────────────────────────
--
-- Erez asked for submissions to be grouped by contributor, which is why the
-- address was collected at all. Hiding it outright would take that away.
--
-- So `contributor_key` stays on the item: an HMAC of the lowercased address
-- under a server-held secret. Two submissions from the same person carry the
-- same key, which is the whole of what grouping needs. It is not a hash a
-- volunteer can reverse — a plain SHA-256 of an email address is a dictionary
-- attack, not a protection, because email addresses have almost no entropy.
-- Without the secret the key is inert.
--
-- The key is computed in the application (src/lib/items/contributor.ts), not
-- here, because the secret is server-only and must not exist in the database.
-- =============================================================================

create table if not exists item_contributors (
  item_id    uuid primary key references items(id) on delete cascade,
  email      text not null
    check (email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  created_at timestamptz not null default now()
);

-- The grouping key. Null for a contributor who left no address.
alter table items add column if not exists contributor_key text;

create index if not exists items_contributor_key_idx
  on items (contributor_key) where contributor_key is not null;

-- Move what is already there before the column goes.
insert into item_contributors (item_id, email, created_at)
select id, contributor_email, created_at
from items
where contributor_email is not null
on conflict (item_id) do nothing;

drop index if exists items_contributor_email_idx;
alter table items drop column if exists contributor_email;

-- ── row level security ──────────────────────────────────────────────────────
-- No INSERT policy, exactly as with `items`: a contributor's address is written
-- by the server route that receives the submission, using the service-role
-- client. Nothing reachable from a browser writes here.

alter table item_contributors enable row level security;

create policy item_contributors_admin_select on item_contributors
  for select to authenticated
  using (is_admin());

create policy item_contributors_admin_delete on item_contributors
  for delete to authenticated
  using (is_admin());
