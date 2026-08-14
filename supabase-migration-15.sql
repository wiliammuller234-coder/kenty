-- Closes the "any browser console can edit/delete/impersonate anyone" hole: every
-- table so far used `using (true)` RLS policies, so the anon key alone (public,
-- embedded in the site) was enough to write anything as anyone. This ties writes to
-- the session token minted by the new verify-code Edge Function after real phone
-- verification, instead of trusting whatever phone a request claims to be.
--
-- Run this AFTER deploying the verify-code Edge Function (it needs PROJECT_JWT_SECRET
-- set as a secret first) and AFTER updating the app to the version that sends the
-- session token — deploying this migration alone, before the client sends a token on
-- every request, will make writes start failing.

create or replace function public.auth_phone()
returns text
language sql stable
as $$
  select nullif(current_setting('request.jwt.claims', true), '')::json ->> 'phone';
$$;

-- pending_codes: was publicly readable, which is what let anyone read anyone else's
-- login code directly instead of going through the Telegram bot. Only the
-- verify-code function (service role, bypasses RLS) needs to read it now.
drop policy if exists "public read" on public.pending_codes;
drop policy if exists "public select" on public.pending_codes;

-- profiles: signing up / editing your own profile still works (insert/update now
-- scoped to your verified phone), reading everyone's stays open since names/emojis
-- need to show up across chats, purchases, friend lists etc.
drop policy if exists "public insert" on public.profiles;
create policy "insert own" on public.profiles for insert with check (phone = public.auth_phone());

drop policy if exists "public update" on public.profiles;
create policy "update own" on public.profiles for update using (phone = public.auth_phone()) with check (phone = public.auth_phone());

drop policy if exists "public delete" on public.profiles;
create policy "delete own" on public.profiles for delete using (phone = public.auth_phone());

-- messages: only as yourself, and only into a chat you're actually a member of
-- (neither was ever checked before). author_phone = 'system' is also allowed — that's
-- what postSystemMessage() uses for "group created" / "X joined" / "call ended"
-- messages, which aren't attributable to a real phone; still gated on chat
-- membership so a stranger can't spam fake system messages into a chat_id they found.
drop policy if exists "public insert" on public.messages;
create policy "insert own" on public.messages for insert with check (
  exists (select 1 from public.chat_members cm where cm.chat_id = messages.chat_id and cm.phone = public.auth_phone())
  and (author_phone = public.auth_phone() or author_phone = 'system')
);

-- Delete: your own message anywhere; a group owner/admin can delete anyone's (matches
-- canDelete() client-side); and — DMs have no real owner/admin concept — either side
-- of a DM can clear the other person's messages too, matching the "🧹 Очистить
-- историю" button, which the client already shows to both DM participants regardless
-- of role, not just group admins.
drop policy if exists "public delete" on public.messages;
create policy "delete own or admin or dm member" on public.messages for delete using (
  author_phone = public.auth_phone()
  or exists (
    select 1 from public.chat_members cm
    where cm.chat_id = messages.chat_id and cm.phone = public.auth_phone() and cm.role in ('owner', 'admin')
  )
  or exists (
    select 1 from public.chats c
    join public.chat_members cm on cm.chat_id = c.id
    where c.id = messages.chat_id and c.is_dm = true and cm.phone = public.auth_phone()
  )
);

-- Updates are trickier: editing your own text should only be you, but reacting to
-- someone else's message (or voting a poll they posted) legitimately updates a row
-- you didn't author. RLS alone can't tell which columns an UPDATE touches, so the
-- policy just requires chat membership, and a trigger below enforces that anyone
-- other than the author may only touch reactions/reacted_by/poll.
drop policy if exists "public update" on public.messages;
create policy "update if member" on public.messages for update using (
  exists (select 1 from public.chat_members cm where cm.chat_id = messages.chat_id and cm.phone = public.auth_phone())
) with check (
  exists (select 1 from public.chat_members cm where cm.chat_id = messages.chat_id and cm.phone = public.auth_phone())
);

create or replace function public.guard_message_update()
returns trigger
language plpgsql
as $$
begin
  if old.author_phone = public.auth_phone() then
    return new; -- author editing their own message: anything goes
  end if;
  -- anyone else in the chat may only react / vote a poll — not rewrite the message
  if new.text is distinct from old.text
    or new.image is distinct from old.image
    or new.images is distinct from old.images
    or new.video is distinct from old.video
    or new.audio is distinct from old.audio
    or new.sticker is distinct from old.sticker
    or new.is_sticker is distinct from old.is_sticker
    or new.dice is distinct from old.dice
    or new.author_phone is distinct from old.author_phone
    or new.author_name is distinct from old.author_name
    or new.author_emoji is distinct from old.author_emoji
    or new.author_avatar is distinct from old.author_avatar
    or new.edited is distinct from old.edited
    or new.reply_to_id is distinct from old.reply_to_id
    or new.reply_to_author is distinct from old.reply_to_author
    or new.reply_to_text is distinct from old.reply_to_text
  then
    raise exception 'Can only react to or vote on another member''s message, not edit it';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_message_update on public.messages;
create trigger trg_guard_message_update
before update on public.messages
for each row execute function public.guard_message_update();

-- purchases: insert stays open — splitting a purchase deliberately logs a row for
-- each co-buyer's phone, not just your own (see the comment on commitPurchase() in
-- Purchases.jsx), so "insert only as yourself" would break that real feature. Delete
-- is still locked to your own rows, matching the "mine" check already used
-- client-side to show the delete button in the first place.
drop policy if exists "purchases_all" on public.purchases;
create policy "purchases_select" on public.purchases for select using (true);
create policy "purchases_insert" on public.purchases for insert with check (true);
create policy "purchases_delete_own" on public.purchases for delete using (buyer_phone = public.auth_phone());

-- push_tokens: only ever register a token for your own phone.
drop policy if exists "public insert" on public.push_tokens;
create policy "insert own" on public.push_tokens for insert with check (phone = public.auth_phone());

-- promises: only log/vote as yourself.
drop policy if exists "promises_all" on public.promises;
create policy "promises_select" on public.promises for select using (true);
create policy "promises_insert_own" on public.promises for insert with check (author_phone = public.auth_phone());
create policy "promises_update" on public.promises for update using (true) with check (true);
create policy "promises_delete_own" on public.promises for delete using (author_phone = public.auth_phone());

-- chats / chat_members intentionally left as-is (still public insert) — group
-- creation, invites, and admin add/remove-member flows weren't fully audited against
-- a tighter policy yet, and getting that wrong risks locking people out of their own
-- groups. Worth a follow-up pass, but out of scope for this one.
