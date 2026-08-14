-- Tracks, per person per chat, when they last actually read it — the missing piece
-- for unread badges and for telling the in-app banner "they're already looking at
-- this chat, don't bother them". Stored server-side (not localStorage) so it's
-- consistent if someone ever uses the app from more than one device.
create table if not exists public.chat_reads (
  phone text not null,
  chat_id uuid not null references public.chats(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (phone, chat_id)
);
alter table public.chat_reads enable row level security;

create policy "chat_reads_select_own" on public.chat_reads for select using (phone = public.auth_phone());
create policy "chat_reads_insert_own" on public.chat_reads for insert with check (phone = public.auth_phone());
create policy "chat_reads_update_own" on public.chat_reads for update using (phone = public.auth_phone()) with check (phone = public.auth_phone());
