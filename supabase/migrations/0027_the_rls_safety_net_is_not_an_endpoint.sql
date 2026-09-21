-- The RLS safety net is not an endpoint.
--
-- rls_auto_enable() is the function behind the event trigger ensure_rls, which
-- turns row level security on for every new table created in public - a net
-- under anyone who adds a table and forgets. It returns event_trigger, so it
-- was never actually callable through /rest/v1/rpc, but the grant said anyone
-- could, and the security advisor listed it for anon and authenticated.
--
-- Event triggers fire as the function's owner, so the net keeps working.
--
-- is_admin() and is_volunteer() are deliberately left executable: 38 policies
-- call them, including policies evaluated for visitors who are not signed in,
-- and each only answers whether the caller is an admin or a volunteer.
-- Revoking them would break the public portal to silence a warning.
--
-- Applied to production 21.09.2026.

revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
