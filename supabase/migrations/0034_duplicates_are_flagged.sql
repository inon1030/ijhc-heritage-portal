-- Potential duplicates are expert decisions, never automatic deletion.
create table public.item_duplicates (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items(id) on delete cascade,
  other_item_id uuid not null references public.items(id) on delete cascade,
  reason text not null check (reason in ('same_content', 'same_name_type_size')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.profiles(id),
  resolution text check (resolution in ('not_duplicate', 'merged')),
  check (item_id < other_item_id),
  check ((resolved_at is null and resolution is null and resolved_by is null)
    or (resolved_at is not null and resolution is not null and resolved_by is not null)),
  unique (item_id, other_item_id)
);
create index item_duplicates_open on public.item_duplicates (created_at) where resolved_at is null;
create index item_duplicates_other_open on public.item_duplicates (other_item_id) where resolved_at is null;
create index item_files_checksum on public.item_files (checksum) where checksum is not null;
create index item_files_name_type_size on public.item_files (file_name, mime_type, byte_size);
alter table public.item_duplicates enable row level security;
create policy duplicates_expert_read on public.item_duplicates
  for select to authenticated using (public.is_volunteer());
create policy duplicates_expert_update on public.item_duplicates
  for update to authenticated using (public.is_volunteer()) with check (public.is_volunteer());
-- UPDATE policy documents the role boundary; table grants make mutations
-- route-only. The service-only function below checks the actual actor as well.
revoke all on public.item_duplicates from anon, authenticated;
grant select on public.item_duplicates to authenticated;
grant all on public.item_duplicates to service_role;

-- 0020 removed the old email-per-item table. This is a many-to-many link to
-- the existing contributor register, with exactly that register's visibility.
create table public.item_contributors (
  item_id uuid not null references public.items(id) on delete cascade,
  contributor_id uuid not null references public.contributors(id) on delete cascade,
  primary key (item_id, contributor_id)
);
alter table public.item_contributors enable row level security;
create policy item_contributors_expert_read on public.item_contributors
  for select to authenticated using (public.is_volunteer());
revoke all on public.item_contributors from anon, authenticated;
grant select on public.item_contributors to authenticated;
grant all on public.item_contributors to service_role;

create function public.flag_item_duplicates(p_item_id uuid) returns integer
language plpgsql security definer set search_path = public
as $$
declare n integer;
begin
  insert into item_duplicates (item_id, other_item_id, reason)
  select least(a.item_id,b.item_id), greatest(a.item_id,b.item_id),
    case when bool_or(a.checksum is not null and a.checksum = b.checksum)
      then 'same_content' else 'same_name_type_size' end
  from item_files a
  join items ia on ia.id = a.item_id and ia.deleted_at is null
  join item_files b on b.item_id <> a.item_id and (
    (a.checksum is not null and a.checksum = b.checksum) or
    (a.file_name = b.file_name and a.mime_type = b.mime_type and a.byte_size = b.byte_size))
  join items ib on ib.id = b.item_id and ib.deleted_at is null
  where a.item_id = p_item_id
  group by least(a.item_id,b.item_id), greatest(a.item_id,b.item_id)
  on conflict (item_id,other_item_id) do update
    set reason = 'same_content'
    where excluded.reason = 'same_content' and item_duplicates.resolved_at is null;
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function public.flag_item_duplicates(uuid) from public, anon, authenticated;
grant execute on function public.flag_item_duplicates(uuid) to service_role;

-- The move, both audit entries, the bin and resolution commit together.
-- Lock items in UUID order so concurrent A/B and B/C merges cannot deadlock.
create function public.resolve_item_duplicate(p_pair uuid, p_item uuid, p_actor uuid, p_resolution text)
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
revoke all on function public.resolve_item_duplicate(uuid,uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.resolve_item_duplicate(uuid,uuid,uuid,text) to service_role;

-- Restoring through the existing admin bin also restores the moved originals.
-- Refuse ambiguity if an original has since been merged elsewhere: rollback,
-- rather than silently restore a record with missing files.
create function public.restore_duplicate_files() returns trigger
language plpgsql security definer set search_path = public
as $$
declare audit jsonb; f jsonb;
begin
  if old.deleted_at is not null and new.deleted_at is null and old.deleted_reason='duplicate_merge' then
    select changes into audit from item_events
      where item_id=new.id and changes ? 'duplicate_merge_into' order by created_at desc,id desc limit 1;
    if audit is null then raise exception 'Missing merge audit'; end if;
    for f in select * from jsonb_array_elements(audit->'files') loop
      update item_files set item_id=new.id,position=(f->>'position')::integer,
        is_primary=(f->>'is_primary')::boolean
        where id=(f->>'id')::uuid and item_id=(audit->>'duplicate_merge_into')::uuid;
      if not found then raise exception 'Merged file moved again; manual recovery required'; end if;
    end loop;
  end if;
  return new;
end;
$$;
revoke all on function public.restore_duplicate_files() from public, anon, authenticated;
create trigger restore_duplicate_files before update of deleted_at on public.items
  for each row execute function public.restore_duplicate_files();
