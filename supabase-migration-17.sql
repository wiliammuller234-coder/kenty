-- Redesigns game_scores to be per-game (a "game" column, composite key) instead of
-- one row per phone shared across every mini-game — Rock-Paper-Scissors is win/lose/
-- draw based, the new obstacle-dodging game is a single best-score number, so each
-- game needs its own leaderboard rather than one blended table. Safe to just drop and
-- recreate since this table only just shipped and holds no real data worth keeping.
drop table if exists public.game_scores;

create table public.game_scores (
  game text not null,
  phone text not null,
  best_score integer not null default 0,
  wins integer not null default 0,
  losses integer not null default 0,
  draws integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (game, phone)
);
alter table public.game_scores enable row level security;

create policy "game_scores_select" on public.game_scores for select using (true);
create policy "game_scores_insert_own" on public.game_scores for insert with check (phone = public.auth_phone());
create policy "game_scores_update_own" on public.game_scores for update using (phone = public.auth_phone()) with check (phone = public.auth_phone());
