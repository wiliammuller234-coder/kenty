-- Purchases used to live only in each phone's local storage, so nobody could
-- ever see what anyone else in the group actually bought. This makes them a
-- real shared table instead, same open-RLS pattern as the rest of the app.
create table if not exists public.purchases (
  id uuid primary key default gen_random_uuid(),
  buyer_phone text not null,
  item text not null,
  amount integer not null,
  created_at timestamptz not null default now()
);

alter table public.purchases enable row level security;

drop policy if exists "purchases_all" on public.purchases;
create policy "purchases_all" on public.purchases for all using (true) with check (true);
