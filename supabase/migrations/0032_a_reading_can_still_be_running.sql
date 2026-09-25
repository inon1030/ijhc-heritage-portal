-- A reading can still be running (25.09.2026).
--
-- Inon, 25.09: the fifty-second limit on the machine's reading goes. When a
-- reading takes longer, the contributor is asked whether to wait for it or to
-- send the item on at once, straight to a Knowledge Expert without the
-- pre-review, while the reading carries on by itself.
--
-- An item sent that way exists before its reading does, so its `ai_analyses`
-- row needs a third state beside succeeded and failed: pending. The row is
-- written with the item and finished by the server when the model answers.
-- Nothing about who can see it changes; it is a value, not a policy.

alter type analysis_status add value if not exists 'pending';
