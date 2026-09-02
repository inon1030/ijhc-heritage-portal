-- =============================================================================
-- New enum values, alone in their own migration.
--
-- Postgres will not let a value added by ALTER TYPE be *used* in the same
-- transaction that added it, and every migration here runs in one. So the two
-- additions live here and everything that references them lives in 0007.
--
-- `general_india` — asked for by the client on 2026-08-27, for material that is
-- clearly Indian Jewish but cannot be placed in one of the four streams. It is a
-- catalogued state, not a dumping ground: a reviewer chooses it deliberately,
-- the same way they choose any other value.
--
-- `pending` — an account that has been requested but not yet approved. Sign-in
-- works; nothing else does. See 0007 for the enforcement.
-- =============================================================================

alter type community add value if not exists 'general_india';

alter type user_role add value if not exists 'pending';
