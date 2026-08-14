create table if not exists public.family_links (
  phone_a text not null,
  phone_b text not null,
  created_at timestamptz not null default now(),
  primary key (phone_a, phone_b),
  constraint family_links_order check (phone_a < phone_b)
);

alter table public.family_links enable row level security;

create policy "family_links_select" on public.family_links for select
  using (phone_a = public.auth_phone() or phone_b = public.auth_phone());

create policy "family_links_insert" on public.family_links for insert
  with check (phone_a = public.auth_phone() or phone_b = public.auth_phone());

create policy "family_links_delete" on public.family_links for delete
  using (phone_a = public.auth_phone() or phone_b = public.auth_phone());
