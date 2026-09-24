-- A problem leaves a trace (24.09.2026).
--
-- Rafi, 24.09: "a logging mechanism so we can debug bug reports more easily,
-- rather than having long conversations trying to recreate and understand the
-- bug." Tirza's upload error of 22.09 took a day to recreate from a screenshot
-- of "Unexpected token 'A'"; the server had logged nothing, because the
-- platform killed the function before it could.
--
-- Every failure the site can see now writes one row here - from the server
-- when a route throws, and from the browser when a screen fails or a response
-- could not be read - and the person who met it is shown the row's short code.
-- A report in the sheet that quotes the code is found in one query.
--
-- What is kept is what locates a fault and nothing more: no file, no form
-- contents, no email address, and the page address without its query string
-- (a receipt link carries its secret there). A signed-in account is kept as an
-- id. Rows older than ninety days are deleted by the route that writes them.
--
-- Who reads it: administrators only. Writes go through route handlers with
-- the service-role client, so there is no insert policy for anyone.

create table if not exists problems (
  id bigint generated always as identity primary key,
  code text not null unique,
  created_at timestamptz not null default now(),
  source text not null check (source in ('server', 'browser')),
  place text,
  path text,
  message text not null,
  detail text,
  user_agent text,
  profile_id uuid references profiles(id) on delete set null
);

create index if not exists problems_created_at on problems (created_at desc);

alter table problems enable row level security;

drop policy if exists problems_admin_select on problems;
create policy problems_admin_select on problems
  for select to authenticated using (is_admin());

comment on table problems is
  'Failures the site saw, one row each, found by the short code shown to the person who met it. Administrators read; route handlers write with the service role; kept ninety days.';
