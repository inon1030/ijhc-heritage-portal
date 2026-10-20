-- Retry state stays with the reading; no AI result is copied into items.
alter table public.ai_analyses add column retry_count integer not null default 0 check (retry_count between 0 and 3);
alter table public.ai_analyses add column last_retry_at timestamptz;
create index ai_analyses_retry on public.ai_analyses(created_at)
  where status in ('failed','pending') and retry_count < 3;
create index ai_analyses_file_latest on public.ai_analyses(file_id,created_at desc,id desc);

-- One claim means one model call, even on a multi-file item. SKIP LOCKED and
-- the pending lease prevent a manual click racing the scheduler. The newest
-- reading for each file is authoritative; older failures never overwrite it.
create function public.claim_reading_retry(p_item uuid default null, p_actor uuid default null)
returns table (analysis_id uuid, item_id uuid, file_id uuid, storage_path text,
  file_name text, title text, retry_count integer, last_retry_at timestamptz)
language plpgsql security definer set search_path = public
as $$
declare picked uuid;
begin
  if p_item is not null and not exists (
    select 1 from profiles where id=p_actor and role in ('volunteer','admin')
  ) then raise exception 'forbidden'; end if;
  select a.id into picked from ai_analyses a
    join items i on i.id=a.item_id
    join item_files f on f.id=a.file_id and f.item_id=i.id
    where i.deleted_at is null and i.status in ('pending','shadow_gallery')
      and (p_item is null or i.id=p_item)
      and a.retry_count < 3
      and (a.status='failed' or (a.status='pending' and coalesce(a.last_retry_at,a.created_at) < now()-interval '2 hours'))
      and not exists (select 1 from ai_analyses newer where newer.file_id=a.file_id
        and (newer.created_at,newer.id)>(a.created_at,a.id))
      -- Automatic retries happen at most once per reading per UTC day.
      and (p_item is not null or a.last_retry_at is null or a.last_retry_at < date_trunc('day',now() at time zone 'UTC') at time zone 'UTC')
    order by a.created_at,a.id limit 1 for update of a skip locked;
  if picked is null then return; end if;
  return query
    with claimed as (
      update ai_analyses a set status='pending',retry_count=a.retry_count+1,last_retry_at=clock_timestamp()
      where a.id=picked returning a.*
    )
    select a.id,a.item_id,a.file_id,f.storage_path,f.file_name,i.title,a.retry_count,a.last_retry_at
    from claimed a join item_files f on f.id=a.file_id join items i on i.id=a.item_id;
end;
$$;
revoke all on function public.claim_reading_retry(uuid,uuid) from public, anon, authenticated;
grant execute on function public.claim_reading_retry(uuid,uuid) to service_role;
