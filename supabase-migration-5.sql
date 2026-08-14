create table if not exists push_tokens (
  phone text not null,
  token text not null,
  platform text not null default 'android',
  created_at timestamptz not null default now(),
  primary key (phone, token)
);
alter table push_tokens enable row level security;
create policy "public read" on push_tokens for select using (true);
create policy "public insert" on push_tokens for insert with check (true);
create policy "public delete" on push_tokens for delete using (true);
