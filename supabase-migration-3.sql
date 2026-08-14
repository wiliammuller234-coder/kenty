alter table chats add column if not exists is_main boolean not null default false;

-- Marks the first-ever group chat as the shared main one, so existing testers don't
-- end up creating a second "Кенты" — remove this UPDATE if you'd rather start fresh.
update chats set is_main = true
where id = (select id from chats where name = 'Кенты' and is_dm = false order by created_at asc limit 1);
