-- By default Postgres logical replication only includes columns that actually changed
-- in an UPDATE's WAL event, plus the primary key. Large columns like a voice message's
-- base64 audio (or an image) that weren't touched by the update — e.g. reacting to a
-- message, which only changes `reactions`/`reacted_by` — come through the Realtime
-- postgres_changes payload as missing/null, making the live-updated message render as
-- broken until the chat is fully reloaded from the database. REPLICA IDENTITY FULL makes
-- Postgres always include the complete row, fixing this without any schema change.
alter table public.messages replica identity full;
