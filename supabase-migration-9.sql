-- 'is_main' and 'antispam' were referenced everywhere in the app code but never
-- actually added to the database (migrations 3 and 4 from earlier apparently never
-- got run) — so joinOrCreateMainChat's "does a main chat already exist?" check
-- silently failed every time and just created a fresh private chat per person.
-- This adds the missing columns, picks the earliest existing "Кенты" chat as the
-- one real shared group, moves everyone scattered across the duplicates into it,
-- and removes the now-pointless duplicates.

alter table public.chats add column if not exists is_main boolean not null default false;
alter table public.chats add column if not exists antispam boolean not null default false;

update public.chats set is_main = true
where id = '14b97e13-fa04-4c04-af6a-a8bcbca5a516';

insert into public.chat_members (chat_id, phone, role)
select '14b97e13-fa04-4c04-af6a-a8bcbca5a516', cm.phone, cm.role
from public.chat_members cm
where cm.chat_id in (
  'c0e22e73-50e7-4a5c-bb0d-f830e61711e8',
  'a9d7a3d9-d96b-42a1-80f0-e650da0ab315',
  '27f8e754-4873-4557-bea4-bd9875f1538a'
)
and not exists (
  select 1 from public.chat_members existing
  where existing.chat_id = '14b97e13-fa04-4c04-af6a-a8bcbca5a516' and existing.phone = cm.phone
);

delete from public.chat_members
where chat_id in (
  'c0e22e73-50e7-4a5c-bb0d-f830e61711e8',
  'a9d7a3d9-d96b-42a1-80f0-e650da0ab315',
  '27f8e754-4873-4557-bea4-bd9875f1538a'
);

-- These two never had any messages — the third (27f8e754...) has a couple, so it's
-- left in place (just empty of members now) instead of deleted outright.
delete from public.chats where id in (
  'c0e22e73-50e7-4a5c-bb0d-f830e61711e8',
  'a9d7a3d9-d96b-42a1-80f0-e650da0ab315'
);
