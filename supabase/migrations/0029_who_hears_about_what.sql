-- Who is sent mail about what (22.09.2026).
--
-- Inon asked for mail settings per account, chosen by an administrator:
--
--   notify_uploads       a knowledge expert or administrator who wants a message
--                        every time something new arrives for review.
--   notify_publications  an administrator who wants a message every time a
--                        record is published to the portal, by anyone.
--
-- Both start off. Nobody is added to a mailing list by a migration.
--
-- Who may change them is the rule that already governs every other column of
-- `profiles`: `profiles_admin_update` (0007) lets an administrator update any
-- account and nobody else update any. The route and the screen say the same.
--
-- The contributor's own messages (the receipt, and the notice when their item
-- is published) and the message to the knowledge expert who published a record
-- are not settings: they are sent to the person the event is about.

alter table profiles
  add column if not exists notify_uploads boolean not null default false,
  add column if not exists notify_publications boolean not null default false;

comment on column profiles.notify_uploads is
  'Mail this knowledge expert or administrator whenever a new item is submitted for review. Set by an administrator.';
comment on column profiles.notify_publications is
  'Mail this administrator whenever any record is published to the portal. Set by an administrator.';
