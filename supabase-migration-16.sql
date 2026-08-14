-- Shared mini-games leaderboard (starting with Rock-Paper-Scissors) — one row per
-- phone, updated after every round. Same open-read/own-write pattern as purchases.
create table if not exists public.game_scores (
  phone text primary key,
  wins integer not null default 0,
  losses integer not null default 0,
  draws integer not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.game_scores enable row level security;

drop policy if exists "game_scores_select" on public.game_scores;
create policy "game_scores_select" on public.game_scores for select using (true);

drop policy if exists "game_scores_insert_own" on public.game_scores;
create policy "game_scores_insert_own" on public.game_scores for insert with check (phone = public.auth_phone());

drop policy if exists "game_scores_update_own" on public.game_scores;
create policy "game_scores_update_own" on public.game_scores for update using (phone = public.auth_phone()) with check (phone = public.auth_phone());
