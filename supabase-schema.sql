create table if not exists profiles (
  phone text primary key,
  name text not null,
  emoji text not null default '🙂',
  avatar_img text,
  age int,
  birthday text,
  created_at timestamptz not null default now()
);
alter table profiles enable row level security;
create policy "public read" on profiles for select using (true);
create policy "public insert" on profiles for insert with check (true);
create policy "public update" on profiles for update using (true);

create table if not exists chats (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  emoji text not null default '💬',
  accent text,
  is_dm boolean not null default false,
  created_by text not null,
  created_at timestamptz not null default now()
);
alter table chats enable row level security;
create policy "public read" on chats for select using (true);
create policy "public insert" on chats for insert with check (true);
create policy "public update" on chats for update using (true);

create table if not exists chat_members (
  chat_id uuid not null references chats(id) on delete cascade,
  phone text not null,
  joined_at timestamptz not null default now(),
  primary key (chat_id, phone)
);
alter table chat_members enable row level security;
create policy "public read" on chat_members for select using (true);
create policy "public insert" on chat_members for insert with check (true);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null references chats(id) on delete cascade,
  author_phone text not null,
  author_name text not null,
  author_emoji text not null default '🙂',
  author_avatar text,
  text text,
  sticker text,
  image text,
  is_sticker boolean not null default false,
  audio text,
  reactions jsonb not null default '{}'::jsonb,
  reacted_by jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table messages enable row level security;
create policy "public read" on messages for select using (true);
create policy "public insert" on messages for insert with check (true);
create policy "public update" on messages for update using (true);
create policy "public delete" on messages for delete using (true);

alter publication supabase_realtime add table messages;
