-- =============================================================================
-- Contributors are a register, not a private column.
--
-- 0017 moved contributor email addresses out of volunteers' reach and left them
-- an HMAC to group by. Inon reversed that: volunteers do see the addresses,
-- and they need to do more than see them. A contributor is somebody the archive
-- is in a relationship with — one person, several submissions, and usually one
-- family — so an address kept per-item was the wrong shape for the job
-- regardless of who could read it.
--
--   item_contributors (item_id, email)   →  one row per submission, no identity
--   contributors      (email, full_name) →  one row per person
--
-- What that unlocks, and what 0017's shape could not express at all: a
-- contributor belongs to families. `contributor_families` is that link, and it
-- is the thing the families page now manages — which addresses belong to the
-- Sassoons — with the same table read from the other side on the review screen.
--
-- ── the full name ───────────────────────────────────────────────────────────
--
-- Asked for at upload from this migration on. A surname is the strongest signal
-- there is for which family a photograph belongs to, and until now the archive
-- was inferring it from a file name and a description while the contributor was
-- sitting there able to say it outright. Optional, like the address.
--
-- ── who reads this ──────────────────────────────────────────────────────────
--
-- Volunteers, and no one else. `to authenticated` with `is_volunteer()`, so an
-- anonymous visitor and a pending account get nothing — the register is not
-- public and never appears in the portal. Removing a contributor stays an
-- administrator's act for the same reason removing a vocabulary term is:
-- a delete silently changes records that point at it.
-- =============================================================================

create table if not exists contributors (
  id         uuid primary key default gen_random_uuid(),
  email      text not null
    check (email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  -- Given at upload when the contributor chooses to. The archive asks for it
  -- because the surname is what places the material.
  full_name  text check (full_name is null or length(btrim(full_name)) between 2 and 120),
  created_at timestamptz not null default now()
);

-- One row per person. Case-insensitive, because a form is.
create unique index if not exists contributors_email_uniq
  on contributors (lower(btrim(email)));

create table if not exists contributor_families (
  contributor_id uuid not null references contributors(id) on delete cascade,
  family_id      uuid not null references families(id)     on delete cascade,
  primary key (contributor_id, family_id)
);

create index if not exists contributor_families_family_idx
  on contributor_families (family_id);

alter table items add column if not exists contributor_id uuid references contributors(id);

create index if not exists items_contributor_id_idx
  on items (contributor_id) where contributor_id is not null;

-- ── carry 0017's rows across ────────────────────────────────────────────────

insert into contributors (email)
select distinct lower(btrim(email)) from item_contributors
on conflict do nothing;

update items i
set contributor_id = c.id
from item_contributors ic
join contributors c on c.email = lower(btrim(ic.email))
where ic.item_id = i.id;

drop table if exists item_contributors;

-- The HMAC that stood in for an address a volunteer could not read. With the
-- address readable there is nothing left for it to do.
drop index if exists items_contributor_key_idx;
alter table items drop column if exists contributor_key;

-- ── row level security ──────────────────────────────────────────────────────

alter table contributors          enable row level security;
alter table contributor_families  enable row level security;

create policy contributors_volunteer_select on contributors
  for select to authenticated using (is_volunteer());

-- A volunteer adding an address to a family may be naming somebody the archive
-- has never received a submission from, so adding is theirs. So is correcting a
-- misspelled name.
create policy contributors_volunteer_insert on contributors
  for insert to authenticated with check (is_volunteer());

create policy contributors_volunteer_update on contributors
  for update to authenticated using (is_volunteer()) with check (is_volunteer());

create policy contributors_admin_delete on contributors
  for delete to authenticated using (is_admin());

create policy contributor_families_volunteer_select on contributor_families
  for select to authenticated using (is_volunteer());

create policy contributor_families_volunteer_insert on contributor_families
  for insert to authenticated with check (is_volunteer());

create policy contributor_families_volunteer_delete on contributor_families
  for delete to authenticated using (is_volunteer());
