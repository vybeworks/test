-- Security notification emails for password/email changes made through the
-- separate waitlist-website account-settings UI (same Supabase project, no
-- code access from this repo). These trigger directly off auth.users rather
-- than any app-owned table, since that's the only place both flows reliably
-- land regardless of which frontend performed the change.
--
-- `when (...)` at the trigger level (not an `if` inside the function body)
-- so Postgres only invokes the function when the relevant column actually
-- changed - auth.users is updated on nearly every request (last_sign_in_at,
-- session fields, etc.), and this trigger must not add overhead to the
-- login hot path.
--
-- `exception when others then return new` is not defensive boilerplate here,
-- it's load-bearing: this trigger runs synchronously inside Supabase's own
-- password-change/email-change API request. If it raised (a missing vault
-- secret, pg_net not installed, whatever), it would block the user's actual
-- password or email change - worse than a missed notification.
--
-- Before running this migration, store both shared secrets in Vault by
-- hand (never in a committed migration) - use the same values passed to
-- `supabase secrets set PASSWORD_CHANGED_EMAIL_SECRET=...` /
-- `EMAIL_CHANGED_EMAIL_SECRET=...`:
--   select vault.create_secret('<value>', 'password_changed_email_secret');
--   select vault.create_secret('<value>', 'email_changed_email_secret');
--
-- The project URL below is this project's - update it if this repo is ever
-- pointed at a different Supabase project.

create function public.notify_password_changed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform net.http_post(
    url := 'https://uksdcyoxjvpmjsqqwdjj.supabase.co/functions/v1/send-password-changed-email',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'password_changed_email_secret')
    ),
    body := jsonb_build_object('email', new.email)
  );
  return new;
exception when others then
  return new;
end;
$$;

create trigger on_auth_user_password_changed
  after update on auth.users
  for each row
  when (old.encrypted_password is distinct from new.encrypted_password)
  execute function public.notify_password_changed();

-- Notifies the OLD address, not the new one - if this change wasn't
-- actually made by the account owner, the old inbox is the one they still
-- control and the one that needs to know. `old.email` only reflects the
-- new value once a change is fully confirmed (Supabase's default double
-- opt-in flow doesn't touch `email` until then), so this correctly fires
-- once per completed change, not once per change request.
create function public.notify_email_changed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform net.http_post(
    url := 'https://uksdcyoxjvpmjsqqwdjj.supabase.co/functions/v1/send-email-changed-email',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'email_changed_email_secret')
    ),
    body := jsonb_build_object('email', old.email)
  );
  return new;
exception when others then
  return new;
end;
$$;

create trigger on_auth_user_email_changed
  after update on auth.users
  for each row
  when (old.email is distinct from new.email)
  execute function public.notify_email_changed();
