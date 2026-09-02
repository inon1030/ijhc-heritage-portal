-- =============================================================================
-- Setup check.
--
-- Paste into the Supabase SQL editor and run. Safe to run any number of times;
-- it only reads. Returns four rows describing what is actually in the database,
-- so nothing depends on finding the right corner of the dashboard.
--
-- Expected once the schema is applied and one volunteer exists:
--
--   tables found       ai_analyses, item_events, item_files, items, profiles
--   heritage bucket    OK: bucket is private
--   security policies  12
--   rows in profiles   1
-- =============================================================================

select
  'tables found' as what,
  coalesce(
    (select string_agg(table_name, ', ' order by table_name)
     from information_schema.tables
     where table_schema = 'public'
       and table_name in ('profiles', 'items', 'item_files', 'ai_analyses', 'item_events')),
    'PROBLEM: no tables — the schema did not run'
  ) as result

union all

select
  'heritage bucket',
  coalesce(
    (select case
              when public then 'PROBLEM: bucket is PUBLIC — files would be exposed'
              else 'OK: bucket is private'
            end
     from storage.buckets where id = 'heritage'),
    'PROBLEM: no heritage bucket — uploads will fail'
  )

union all

select
  'security policies',
  (select count(*)::text
   from pg_policies
   where schemaname = 'public'
     and tablename in ('profiles', 'items', 'item_files', 'ai_analyses', 'item_events'))

union all

select
  'rows in profiles',
  (select count(*)::text from public.profiles);
