-- The guides hub (21.09.2026): PDFs, videos and walkthrough screenshots.
--
-- Private, like `heritage`. No storage policy grants anon or authenticated
-- anything on it: every file is reached through /api/guides/..., which checks
-- the reader's role against the guide's audience and then signs a short-lived
-- URL with the service role. The knowledge-expert and administrator guides are
-- therefore closed at the storage layer, not merely hidden on the page.
--
-- 50 MB matches the plan's per-file ceiling. The 125 MB scanning video stays in
-- the Center's Drive, where its owner already shares it by link.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('guides', 'guides', false, 52428800, array['application/pdf', 'video/mp4', 'image/png'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
