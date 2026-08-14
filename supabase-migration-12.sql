drop policy if exists "public delete" on profiles;
create policy "public delete" on profiles for delete using (true);

drop policy if exists "public delete" on chats;
create policy "public delete" on chats for delete using (true);

drop policy if exists "public delete" on chat_members;
create policy "public delete" on chat_members for delete using (true);
