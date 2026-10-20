-- No existing item/profile policy is changed by this migration.
alter table public.items
  add column contributor_language text check (contributor_language in ('en','he','hi','mr','ml')),
  add column collector_name text check (char_length(collector_name) <= 200),
  add column collector_credit_required boolean not null default false,
  add constraint collector_credit_has_name check (not collector_credit_required or nullif(btrim(collector_name), '') is not null);

alter table public.keyword_candidates
  add column source text not null default 'ai' check (source in ('ai', 'contributor')),
  add column item_id uuid references public.items(id) on delete cascade,
  add constraint contributor_candidate_has_item check (source <> 'contributor' or item_id is not null);
-- Preserve AI deduplication, but retain each contributor's record association.
drop index public.keyword_candidates_term_global_uniq;
drop index public.keyword_candidates_term_scoped_uniq;
create unique index keyword_candidates_term_global_uniq on public.keyword_candidates(lower(btrim(term)))
  where community is null and source = 'ai';
create unique index keyword_candidates_term_scoped_uniq on public.keyword_candidates(lower(btrim(term)), community)
  where community is not null and source = 'ai';
create unique index keyword_candidates_contributor_uniq on public.keyword_candidates(item_id, lower(btrim(term)))
  where source = 'contributor';

create table public.record_comments (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items(id) on delete cascade,
  author_name text check (char_length(author_name) <= 120),
  author_email text check (char_length(author_email) <= 254),
  anonymous boolean not null default false,
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now(),
  hidden_at timestamptz,
  hidden_by uuid references public.profiles(id) on delete set null
);
create index record_comments_item on public.record_comments(item_id, created_at);
alter table public.record_comments enable row level security;
create policy comments_public_read on public.record_comments for select to anon, authenticated
  using (hidden_at is null and exists (select 1 from public.items i where i.id = item_id
    and i.status = 'accepted' and i.access = 'public' and i.category is not null and i.deleted_at is null));
create policy comments_expert_read on public.record_comments for select to authenticated using (public.is_volunteer());
create policy comments_expert_moderate on public.record_comments for update to authenticated
  using (public.is_volunteer()) with check (public.is_volunteer() and
    ((hidden_at is null and hidden_by is null) or (hidden_at is not null and hidden_by = auth.uid())));
revoke all on public.record_comments from anon, authenticated;
-- Column grants are essential: RLS alone never conceals an email address.
grant select (id,item_id,author_name,anonymous,body,created_at,hidden_at,hidden_by) on public.record_comments to anon, authenticated;
grant update (hidden_at,hidden_by) on public.record_comments to authenticated;
grant all on public.record_comments to service_role;
create view public.public_record_comments with (security_invoker = true) as
  select id,item_id,case when anonymous then null else author_name end as author_name,
    anonymous,body,created_at
  from public.record_comments where hidden_at is null;
revoke all on public.public_record_comments from anon, authenticated;
grant select on public.public_record_comments to anon, authenticated;

create table public.record_corrections (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items(id) on delete cascade,
  proposer_name text check (char_length(proposer_name) <= 120),
  proposer_email text check (char_length(proposer_email) <= 254),
  anonymous boolean not null default false,
  changes jsonb not null check (jsonb_typeof(changes) = 'object' and changes <> '{}'::jsonb),
  note text check (char_length(note) <= 2000),
  status text not null default 'pending' check (status in ('pending','accepted','declined')),
  objection_at timestamptz,
  objection_note text check (char_length(objection_note) <= 2000),
  decided_at timestamptz,
  decided_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  objection_token_hash text
);
create index record_corrections_pending on public.record_corrections(item_id,created_at) where status = 'pending';
alter table public.record_corrections enable row level security;
create policy corrections_expert_read on public.record_corrections for select to authenticated using (public.is_volunteer());
create policy corrections_expert_update on public.record_corrections for update to authenticated
  using (public.is_volunteer()) with check (public.is_volunteer());
revoke all on public.record_corrections from anon, authenticated;
grant select on public.record_corrections to authenticated;
-- Decisions must go through the atomic function; ordinary UPDATE cannot bypass it.
grant all on public.record_corrections to service_role;

-- SECURITY INVOKER: the existing item UPDATE policy, including 0036, remains authoritative.
create function public.decide_record_correction(p_id uuid, p_accept boolean, p_objection_at timestamptz)
returns boolean language plpgsql security invoker set search_path = public as $$
declare c record; i record; entry record; actual text; changed_id uuid;
begin
  if not public.is_volunteer() then return false; end if;
  select * into c from record_corrections where id = p_id for update;
  if not found or c.status <> 'pending' then return false; end if;
  if p_accept and c.objection_at is distinct from p_objection_at then return false; end if;
  select * into i from items where id = c.item_id and deleted_at is null
    and status = 'accepted' and access = 'public' and category is not null for update;
  if not found then return false; end if;
  if p_accept then
    for entry in select key,value from jsonb_each(c.changes) loop
      if entry.key in ('title','description','period','origin_place') then
        actual := to_jsonb(i)->>entry.key;
      elsif left(entry.key,6) = 'field:' then
        select value into actual from item_fields where item_id = c.item_id and field_key = substr(entry.key,7);
      else raise exception 'Unsupported correction field'; end if;
      if coalesce(actual,'') <> coalesce(entry.value->>'from','') then
        raise exception 'Correction is stale';
      end if;
    end loop;
    update items set
      title = case when c.changes ? 'title' then c.changes->'title'->>'to' else title end,
      description = case when c.changes ? 'description' then nullif(c.changes->'description'->>'to','') else description end,
      period = case when c.changes ? 'period' then nullif(c.changes->'period'->>'to','') else period end,
      origin_place = case when c.changes ? 'origin_place' then nullif(c.changes->'origin_place'->>'to','') else origin_place end
    where id = c.item_id returning id into changed_id;
    if changed_id is null then raise exception 'Record edit not permitted'; end if;
    for entry in select key,value from jsonb_each(c.changes) where left(key,6) = 'field:' loop
      if coalesce(entry.value->>'to','') = '' then
        delete from item_fields where item_id = c.item_id and field_key = substr(entry.key,7);
      else
        update item_fields set value = entry.value->>'to', source = 'volunteer', confidence = null, basis = null
          where item_id = c.item_id and field_key = substr(entry.key,7);
        if not found then raise exception 'Catalogue field changed'; end if;
      end if;
    end loop;
    insert into item_events(item_id,actor_id,action,changes)
      values(c.item_id,auth.uid(),'edited',jsonb_build_object('correction_id',c.id,'fields',c.changes));
  end if;
  update record_corrections set status = case when p_accept then 'accepted' else 'declined' end,
    decided_at = now(), decided_by = auth.uid() where id = c.id;
  return true;
end;
$$;
-- Session callers need these privileges for the invoker transaction; RLS still gates them.
grant update (status,decided_at,decided_by) on public.record_corrections to authenticated;
revoke all on function public.decide_record_correction(uuid,boolean,timestamptz) from public, anon;
grant execute on function public.decide_record_correction(uuid,boolean,timestamptz) to authenticated;
