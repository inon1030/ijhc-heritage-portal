-- =============================================================================
-- Saving a review is one decision, so it should be one transaction.
--
-- reviewItem did three statements on a session client: update the record,
-- delete its tree fields, insert them again. supabase-js has no multi-statement
-- transaction, so an insert that failed after the delete succeeded left the
-- record published with no catalogue fields at all — and the status change had
-- already committed.
--
-- Deliberately NOT `security definer`. The whole point of writing through the
-- caller's session rather than the service-role client is that RLS gets the
-- final say; a definer function would trade that away to fix a smaller problem.
-- A pending account calling this still fails items_volunteer_update and gets a
-- null row back, which the caller turns into a 401.
-- =============================================================================

create or replace function review_item(
  p_item_id      uuid,
  p_status       item_status,
  p_title        text,
  p_category     item_category,
  p_description  text,
  p_community    community,
  p_provenance   text,
  p_keywords     text[],
  p_language     text,
  p_period       text,
  p_origin_place text,
  p_access       access_level,
  p_fields       jsonb
)
returns items
language plpgsql
as $$
declare
  updated items;
begin
  update items set
    title        = p_title,
    category     = p_category,
    description  = p_description,
    community    = p_community,
    provenance   = p_provenance,
    keywords     = p_keywords,
    language     = p_language,
    period       = p_period,
    origin_place = p_origin_place,
    access       = p_access,
    status       = p_status,
    reviewed_by  = auth.uid(),
    reviewed_at  = now()
  where id = p_item_id
  returning * into updated;

  -- No row means RLS refused the update, or the record is gone. Either way the
  -- caller gets nothing back and nothing below has run.
  if updated.id is null then
    return null;
  end if;

  -- The reviewer's set replaces what was there. A field they removed is a
  -- judgement, so an upsert would silently keep the machine's row.
  delete from item_fields where item_id = p_item_id;

  -- One row per field, last value wins.
  --
  -- Written without this first, and a probe caught it immediately: the same
  -- duplicate-key bug the TypeScript writer had. There it silently cost a
  -- contribution every field; here, because the review is one transaction now,
  -- a single repeated key failed the whole save — status change included.
  -- `distinct on ... order by key, ord desc` matches what the field sheet does
  -- on screen and what writeFields does for a contribution.
  insert into item_fields (item_id, field_key, value, source)
  select p_item_id, d.key, d.value, 'volunteer'
  from (
    select distinct on (t.f->>'key')
           t.f->>'key'   as key,
           t.f->>'value' as value
    from jsonb_array_elements(coalesce(p_fields, '[]'::jsonb)) with ordinality as t(f, ord)
    where coalesce(btrim(t.f->>'value'), '') <> ''
    order by t.f->>'key', t.ord desc
  ) d;

  return updated;
end;
$$;

grant execute on function review_item(uuid, item_status, text, item_category, text, community, text, text[], text, text, text, access_level, jsonb) to authenticated;

-- The four-stream rule counted by fetching every published row and counting
-- them in JavaScript. Invisible at eight records; a full table transfer on
-- every page load at eight hundred.
create or replace function community_counts()
returns table (community community, n bigint)
language sql
stable
as $$
  select i.community, count(*)
  from items i
  where i.status = 'accepted' and i.access = 'public' and i.community is not null
  group by i.community;
$$;

grant execute on function community_counts() to anon, authenticated;
