-- Run this in Supabase SQL Editor (adds features on top of supabase-schema.sql)

alter table messages add column if not exists edited boolean not null default false;
alter table messages add column if not exists reply_to_id uuid;
alter table messages add column if not exists reply_to_author text;
alter table messages add column if not exists reply_to_text text;
alter table messages add column if not exists poll jsonb;

alter table chats add column if not exists description text;

alter table chat_members add column if not exists role text not null default 'member';

alter table profiles add column if not exists last_seen timestamptz;

update chat_members set role = 'owner'
where (chat_id, phone) in (select id, created_by from chats)
  and role = 'member';
