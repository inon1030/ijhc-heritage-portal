-- =============================================================================
-- A new account starts with no rights at all.
--
-- `profiles.role` defaulted to 'volunteer', which was safe only because the
-- single way to get an account was an administrator creating one by hand. The
-- request-an-account flow added on 2026-08-27 removes that assumption: anyone
-- can now cause an auth user to exist, the `on_auth_user_created` trigger makes
-- them a profile, and with the old default that profile would have walked
-- straight into the review queue.
--
-- Existing rows are untouched. They were approved by the only means there was.
-- =============================================================================

alter table profiles alter column role set default 'pending';
