-- =============================================================================
-- The four streams do not count the bin
--
-- `community_counts` filtered on status, access and a non-null community, and
-- not on `deleted_at`. It is `security invoker`, so for an anonymous visitor
-- RLS hid the binned rows anyway and the numbers were right — which is why this
-- survived the recycle bin being built, and why nothing on the public site ever
-- looked wrong.
--
-- It is not right for the people who can see the bin. `items_admin_bin_select`
-- ORs binned rows back in for an administrator, so an administrator's masthead
-- and front page counted the recycle bin into the four-stream rule; a volunteer
-- counted whatever they had binned themselves. Measured the moment a record was
-- binned for the first time: eight records published, the rule said nine.
--
-- `listPublishedItems` already carries `.is('deleted_at', null)` with a comment
-- explaining it is there for exactly this reason. The list was guarded and the
-- count beside it was not.
--
-- Found by `tests/db/archive.test.ts`, which runs with the service role and so
-- sees what an administrator sees. It was written to prove something else
-- entirely — that a published record with no community is counted — and failed
-- on the arithmetic underneath it.
-- =============================================================================

create or replace function community_counts()
returns table (community community, n bigint)
language sql
stable
set search_path = public
as $$
  select i.community, count(*)
  from items i
  where i.status = 'accepted'
    and i.access = 'public'
    and i.community is not null
    and i.deleted_at is null
  group by i.community;
$$;

comment on function community_counts is
  'Published, public, not binned, and placed in a stream. Excludes the bin explicitly rather than relying on RLS, because an administrator can see it.';
