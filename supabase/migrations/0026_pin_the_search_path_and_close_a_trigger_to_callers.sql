-- =============================================================================
-- Pin the search path, and close a trigger to callers
--
-- Two findings from Supabase's own database linter, both pre-existing, both
-- cheap, neither exploitable on its own. Written down rather than left as
-- warnings somebody stops reading.
--
-- **A mutable `search_path`.** A function without one resolves table and
-- function names against whatever schema list the *caller* has set. The four
-- `security definer` functions already pin it — `is_volunteer`, `is_admin`,
-- `handle_new_user`, and Supabase's own `rls_auto_enable` — which is where it
-- matters most, because those run with the definer's rights. The rest are
-- `security invoker` and so run with the caller's own rights, which is why this
-- is hardening rather than a hole. It is still one line each.
--
-- **A trigger function callable over the API.** `handle_new_user` is
-- `security definer` and had EXECUTE granted to `anon` and `authenticated`,
-- which means it was reachable at `/rest/v1/rpc/handle_new_user`. Postgres
-- refuses to run a trigger function called directly — there is no NEW row for
-- it to read — so it could not actually do anything. But a definer-rights
-- function that creates profile rows should not be on the public surface at
-- all, and nothing calls it except the trigger, which runs as the table owner
-- and is unaffected.
--
-- `rls_auto_enable` carries the same warning and is deliberately left alone: it
-- is not defined in any migration in this repository, so it belongs to the
-- platform rather than to the archive.
-- =============================================================================

alter function set_items_search_text()      set search_path = public;
alter function set_updated_at()             set search_path = public;
alter function keywords_variant_is_flat()   set search_path = public;

alter function review_item(
  uuid, item_status, text, item_category, text, community, text, text[], text, text, text, access_level, jsonb
) set search_path = public;

-- `from public`, and that is the whole of the lesson. Postgres grants EXECUTE on
-- every new function to PUBLIC by default, so revoking from `anon` and
-- `authenticated` by name changed nothing at all: both still reached it through
-- the PUBLIC grant, and the linter still reported it. Checked in `proacl`, where
-- the leading `=X/postgres` is exactly that grant, rather than assumed from the
-- statement having run without error.
revoke execute on function handle_new_user() from public, anon, authenticated;
