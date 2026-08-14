-- Promises were local-only (like purchases used to be) — nobody could ever see
-- anyone else's promise or vote it "broken". Real shared table instead.
create table if not exists public.promises (
  id uuid primary key default gen_random_uuid(),
  author_phone text not null,
  text text not null,
  deadline date not null,
  status text not null default 'pending',
  votes_against jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.promises enable row level security;

drop policy if exists "promises_all" on public.promises;
create policy "promises_all" on public.promises for all using (true) with check (true);
