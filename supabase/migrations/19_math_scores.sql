-- Every math-challenge attempt gets its own row (not just a running best) so the
-- leaderboard can be recomputed however it needs — "best per player" today, maybe
-- "best this week" later — without having thrown the history away.
create table if not exists public.math_scores (
  id uuid primary key default gen_random_uuid(),
  phone text not null,
  difficulty text not null,
  time_limit integer not null,
  correct_answers integer not null default 0,
  wrong_answers integer not null default 0,
  score integer not null default 0,
  created_at timestamptz not null default now()
);
alter table public.math_scores enable row level security;

create policy "math_scores_select" on public.math_scores for select using (true);
create policy "math_scores_insert_own" on public.math_scores for insert with check (phone = public.auth_phone());
