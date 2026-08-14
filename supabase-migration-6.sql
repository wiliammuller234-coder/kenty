-- Sets up push notifications without relying on the Dashboard's "Database Webhooks"
-- UI (which fails with "schema supabase_functions does not exist" on this project).
-- Instead, this creates a plain Postgres trigger that calls pg_net directly.

create extension if not exists pg_net with schema extensions;

create or replace function public.notify_send_push()
returns trigger as $$
begin
  perform
    net.http_post(
      url := 'https://kprfjlcydxqpcgwjzafw.supabase.co/functions/v1/send-push',
      headers := '{"Content-Type": "application/json"}'::jsonb,
      body := jsonb_build_object('record', row_to_json(new))
    );
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_notify_send_push on public.messages;
create trigger trg_notify_send_push
after insert on public.messages
for each row execute function public.notify_send_push();
