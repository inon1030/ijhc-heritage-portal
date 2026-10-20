-- Existing records deliberately have no inferred uploader.
alter table public.items add column uploaded_by uuid references public.profiles(id) on delete set null;

create function public.can_edit_published(item public.items)
returns boolean language sql stable security invoker set search_path = public
as $$
  select is_admin() or (is_volunteer() and
    ((item).uploaded_by = auth.uid() or (item).reviewed_by = auth.uid()));
$$;
revoke all on function public.can_edit_published(public.items) from public, anon;
grant execute on function public.can_edit_published(public.items) to authenticated;

-- USING tests the OLD row: setting reviewed_by to oneself cannot bypass it.
-- WITH CHECK permits publishing a queued item and the one-way move to bin.
alter policy items_volunteer_update on public.items
  using (is_volunteer() and deleted_at is null
    and (status <> 'accepted' or can_edit_published(items)))
  with check (is_volunteer());
-- All SELECT policies and administrator bin UPDATE/DELETE policies unchanged.

-- A catalogue's child rows are edits of the same record, not an alternative
-- write entrance. The separate SELECT policies retain existing visibility.
create function public.can_edit_record_content(record_id uuid)
returns boolean language sql stable security invoker set search_path = public as $$
  select is_volunteer() and exists (
    select 1 from items i where i.id = record_id
    and (i.status <> 'accepted' or can_edit_published(i))
  );
$$;
revoke all on function public.can_edit_record_content(uuid) from public, anon;
grant execute on function public.can_edit_record_content(uuid) to authenticated;
alter policy item_fields_volunteer_insert on public.item_fields
  with check (can_edit_record_content(item_id));
alter policy item_fields_volunteer_update on public.item_fields
  using (can_edit_record_content(item_id)) with check (can_edit_record_content(item_id));
alter policy item_fields_volunteer_delete on public.item_fields
  using (can_edit_record_content(item_id));
alter policy item_families_volunteer_write on public.item_families
  with check (can_edit_record_content(item_id));
alter policy item_families_volunteer_delete on public.item_families
  using (can_edit_record_content(item_id));
alter policy item_translations_volunteer_write on public.item_translations
  using (can_edit_record_content(item_id)) with check (can_edit_record_content(item_id));

-- No blanket ai_analyses UPDATE grant. Only these correction columns are
-- writable, with the actual session actor and the item lock held until commit.
create function public.correct_review_reading(
  record_id uuid, analysis_id uuid, ocr text, transcript_text text
) returns boolean language plpgsql security definer set search_path = public as $$
declare current_item items; affected integer;
begin
  if not is_volunteer() then return false; end if;
  if length(ocr) > 20000 or length(transcript_text) > 100000 then
    raise exception 'reading too long' using errcode = '22001'; end if;
  select * into current_item from items where id = record_id for update;
  if not found or current_item.deleted_at is not null
    or (current_item.status = 'accepted' and not coalesce(can_edit_published(current_item), false))
    then return false; end if;
  update ai_analyses set ocr_text_corrected = ocr, transcript_corrected = transcript_text,
    corrected_by = auth.uid(), corrected_at = now()
    where id = analysis_id and item_id = record_id;
  get diagnostics affected = row_count;
  return affected > 0;
end;
$$;
revoke all on function public.correct_review_reading(uuid,uuid,text,text) from public, anon;
grant execute on function public.correct_review_reading(uuid,uuid,text,text) to authenticated;

create table public.review_drafts (
  item_id uuid not null references public.items(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  updated_at timestamptz not null default now(),
  primary key (item_id, profile_id)
);
alter table public.review_drafts enable row level security;
create policy review_drafts_own_select on public.review_drafts
  for select to authenticated using (is_volunteer() and profile_id = auth.uid());
create policy review_drafts_own_insert on public.review_drafts
  for insert to authenticated with check (is_volunteer() and profile_id = auth.uid());
create policy review_drafts_own_update on public.review_drafts
  for update to authenticated using (is_volunteer() and profile_id = auth.uid())
  with check (is_volunteer() and profile_id = auth.uid());
create policy review_drafts_own_delete on public.review_drafts
  for delete to authenticated using (is_volunteer() and profile_id = auth.uid());
revoke all on public.review_drafts from anon;
grant select, insert, update, delete on public.review_drafts to authenticated;
create trigger review_drafts_updated before update on public.review_drafts
  for each row execute function public.set_updated_at();

-- Serialize a late autosave with a decision. It cannot resurrect a draft
-- after the decision has cleared it or overwrite a newer catalogue snapshot.
create function public.guard_review_draft() returns trigger
language plpgsql security invoker set search_path = public as $$
declare current_item items;
begin
  select * into current_item from items where id = new.item_id for update;
  if not found or current_item.deleted_at is not null
    or (current_item.status = 'accepted' and not coalesce(can_edit_published(current_item), false))
    or current_item.reviewed_at is distinct from (new.payload->>'baseReviewedAt')::timestamptz
    then raise exception 'record changed' using errcode = '40001'; end if;
  return new;
end;
$$;
revoke all on function public.guard_review_draft() from public, anon, authenticated;
create trigger guard_review_draft before insert or update on public.review_drafts
  for each row execute function public.guard_review_draft();

-- Runs in the same transaction as the existing review_item RPC.
create function public.clear_decided_review_draft() returns trigger
language plpgsql security invoker set search_path = public as $$
begin
  if new.reviewed_at is distinct from old.reviewed_at then
    delete from review_drafts where item_id = new.id and profile_id = auth.uid();
  end if;
  return new;
end;
$$;
revoke all on function public.clear_decided_review_draft() from public, anon, authenticated;
create trigger clear_decided_review_draft after update on public.items
  for each row execute function public.clear_decided_review_draft();

-- pg_trgm is enabled by 0001. Names and translations compete for each term.
create function public.similar_review_terms(proposed text)
returns table(id uuid, term text, score real)
language sql stable security invoker set search_path = public, extensions as $$
  select k.id, k.term, max(similarity(lower(btrim(proposed)), lower(btrim(n.name)))) as score
  from keywords k
  cross join lateral (
    select k.term as name
    union all select kt.label from keyword_translations kt where kt.keyword_id = k.id
  ) n
  where is_volunteer() and k.preferred_id is null
  group by k.id, k.term
  having max(similarity(lower(btrim(proposed)), lower(btrim(n.name)))) > 0.1
  order by score desc, k.term, k.id limit 3;
$$;
revoke all on function public.similar_review_terms(text) from public, anon;
grant execute on function public.similar_review_terms(text) to authenticated;

-- Service-only duplicate merge must enforce ownership of BOTH records under row locks.
create or replace function public.resolve_item_duplicate(p_pair uuid, p_item uuid, p_actor uuid, p_resolution text)
returns uuid language plpgsql security definer set search_path = public
as $$
declare d item_duplicates; older items; newer items; moved jsonb; offset_position integer;
begin
  if not exists (select 1 from profiles where id=p_actor and role in ('volunteer','admin'))
    then raise exception 'forbidden'; end if;
  if p_resolution not in ('not_duplicate','merged') then raise exception 'invalid resolution'; end if;
  select * into d from item_duplicates where id=p_pair;
  if not found or p_item not in (d.item_id,d.other_item_id) then raise exception 'not found'; end if;
  perform id from items where id in (d.item_id,d.other_item_id) order by id for update;
  select * into d from item_duplicates where id=p_pair for update;
  if d.resolved_at is not null then raise exception 'already resolved'; end if;
  select * into older from items where id in (d.item_id,d.other_item_id) order by created_at,id limit 1;
  select * into newer from items where id in (d.item_id,d.other_item_id) and id<>older.id;
  if older.deleted_at is not null or newer.deleted_at is not null then raise exception 'item in bin'; end if;
  if p_resolution = 'merged' then
    if not exists (select 1 from profiles where id=p_actor and role='admin') and (
      (older.status='accepted' and not coalesce(older.uploaded_by=p_actor or older.reviewed_by=p_actor,false)) or
      (newer.status='accepted' and not coalesce(newer.uploaded_by=p_actor or newer.reviewed_by=p_actor,false))
    ) then raise exception 'forbidden'; end if;
    select coalesce(jsonb_agg(jsonb_build_object('id',id,'position',position,'is_primary',is_primary)), '[]')
      into moved from item_files where item_id=newer.id;
    select coalesce(max(position),-1)+1 into offset_position from item_files where item_id=older.id;
    update item_files set is_primary=false where item_id=newer.id;
    update item_files set item_id=older.id, position=position+offset_position where item_id=newer.id;
    -- Analyses remain with their original item for audit and restoration. They
    -- are not silently promoted to the older record's verified catalogue.
    insert into item_contributors (item_id,contributor_id)
      select older.id,contributor_id from items where id in (older.id,newer.id) and contributor_id is not null
      union select older.id,contributor_id from item_contributors where item_id=newer.id
      on conflict do nothing;
    update items set deleted_at=now(),deleted_by=p_actor,deleted_reason='duplicate_merge' where id=newer.id;
    insert into item_events(item_id,actor_id,action,changes) values
      (older.id,p_actor,'edited',jsonb_build_object('duplicate_merge_from',newer.id,'files',moved)),
      (newer.id,p_actor,'edited',jsonb_build_object('duplicate_merge_into',older.id,'files',moved));
  end if;
  update item_duplicates set resolved_at=now(),resolved_by=p_actor,resolution=p_resolution where id=p_pair;
  return older.id;
end;
$$;
