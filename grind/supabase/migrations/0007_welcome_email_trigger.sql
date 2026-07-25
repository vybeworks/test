-- Automatic welcome email on waitlist signup. Unlike the launch email
-- (manually triggered by curl), this fires on every insert into
-- waitlist_signups - a database trigger, not a client-side call, since the
-- landing page that inserts these rows lives in a separate codebase this
-- project has no access to. A trigger fires reliably regardless of what did
-- the inserting.
--
-- security definer (same pattern as handle_new_user in 0001_profiles.sql)
-- so this works no matter which role performs the insert - the landing
-- page's signup form likely inserts as anon, which may not have its own
-- grants on net.http_post or vault.decrypted_secrets.
--
-- Before running this migration, store the shared secret in Vault by hand
-- (never in a committed migration) - use the same value you pass to
-- `supabase secrets set WELCOME_EMAIL_SECRET=...`:
--   select vault.create_secret('<your-generated-secret>', 'welcome_email_secret');
--
-- The project URL below is this project's, same as the cron job in
-- 0004_platform_connections.sql - update it if this repo ever points at a
-- different Supabase project.
create function public.notify_waitlist_signup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform net.http_post(
    url := 'https://uksdcyoxjvpmjsqqwdjj.supabase.co/functions/v1/send-welcome-email',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'welcome_email_secret')
    ),
    body := jsonb_build_object('email', new.email)
  );
  return new;
end;
$$;

create trigger on_waitlist_signup_send_welcome
  after insert on public.waitlist_signups
  for each row execute function public.notify_waitlist_signup();
