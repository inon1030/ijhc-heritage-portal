-- =============================================================================
-- A contributor can be corrected, and can be forgotten.
--
-- Found in preflight, gate 5b. `contributors` was a table a member of the
-- public could be written into — automatically, by uploading — and never taken
-- out of. The register had no edit path for the address and no delete path at
-- all: `contributors_admin_delete` existed as a policy that **nothing in the
-- application called**.
--
-- That is a data trap on its own. What makes it a blocker is the promise
-- beside it. The handling notice a contributor ticks, whose version is stamped
-- on their record, says they can ask what is held about them and ask for it to
-- be taken down. The interface could not honour either request, so the only
-- remedy was someone opening the database by hand.
--
-- ── what erasure means here ─────────────────────────────────────────────────
--
-- `items.contributor_id` had no ON DELETE clause, so it defaulted to NO ACTION:
-- erasing anybody who had ever sent something would simply fail. The choice of
-- what to do instead is a policy question about the archive's relationship with
-- its donors, and Inon decided it on 2026-09-02:
--
--   **The material stays, the person is forgotten.**
--
-- `ON DELETE SET NULL`. The record keeps its scan, its catalogue and its place
-- in the archive; what disappears is the link to a named human being. A
-- heritage archive that deleted the photograph along with the address would be
-- destroying the thing it exists to keep, and the contributor asked to be
-- forgotten, not to withdraw the material — which is a separate request, and
-- one the bin already answers.
-- =============================================================================

alter table items drop constraint if exists items_contributor_id_fkey;

alter table items
  add constraint items_contributor_id_fkey
  foreign key (contributor_id) references contributors(id) on delete set null;

comment on constraint items_contributor_id_fkey on items is
  'ON DELETE SET NULL: erasing a contributor forgets the person and keeps the material. See migration 0022.';

-- Correcting an address is cataloguing — the volunteer who notices a bounced
-- reply is the one who should be able to fix the typo — and it is already
-- covered by `contributors_volunteer_update` from 0020. Erasure stays with
-- `contributors_admin_delete`, unchanged: it is the irreversible one.
