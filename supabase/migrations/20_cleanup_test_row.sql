-- One-off: removes a diagnostic test row left behind while verifying math_scores
-- RLS during development (no client-facing delete policy exists on this table, so
-- this couldn't be cleaned up through the normal API — done here with migration
-- privileges instead).
delete from public.math_scores where phone = '70000002222';
