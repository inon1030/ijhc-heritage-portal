-- =============================================================================
-- Storage
--
-- The `heritage` bucket is PRIVATE and carries no anon or authenticated
-- policies. Every read and write is brokered by the server:
--
--   upload : POST /api/uploads/sign  -> createSignedUploadUrl (service role)
--   read   : GET  /api/files/[id]    -> permission check, then a 10-minute
--                                       signed URL (service role)
--
-- In the demo this bucket was public with `USING (true)`, so the files attached
-- to rejected and pending items stayed reachable to anyone who had the URL.
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'heritage',
  'heritage',
  false,
  52428800, -- 50 MB
  array[
    'image/jpeg','image/png','image/webp','image/gif','image/tiff',
    'application/pdf',
    'audio/mpeg','audio/wav','audio/ogg','audio/mp4','audio/x-m4a',
    'video/mp4','video/webm','video/quicktime',
    -- The capture of a web page — see /api/links/ingest.
    'text/plain'
  ]
  -- This list must agree with ALLOWED_MIME_TYPES in src/lib/files/validate.ts.
  -- It is the second lock: the route validates, and storage refuses anything
  -- the route let through by mistake. Adding a format is two edits, not one.
)
on conflict (id) do update set
  public             = excluded.public,
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Remove anything a previous project may have left behind.
--
-- Wrapped so the migration still completes on a fresh project where these do
-- not exist and the role lacks ownership of storage.objects.
do $$
begin
  drop policy if exists "anon_select_heritage_objects" on storage.objects;
  drop policy if exists "anon_insert_heritage_objects" on storage.objects;
  drop policy if exists "anon_update_heritage_objects" on storage.objects;
  drop policy if exists "anon_delete_heritage_objects" on storage.objects;
exception
  when insufficient_privilege then
    raise notice 'Skipped storage policy cleanup: not the owner of storage.objects. Nothing to clean on a new project.';
end
$$;
