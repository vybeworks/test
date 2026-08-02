-- Step 7: Collab Board. Deliberately no in-app messaging/DMs (cut early to
-- avoid the moderation burden of a young userbase) - users post what
-- they're looking for, browse others' posts, and reach out via opt-in
-- contact info shown directly on the post. This is the first table in this
-- project where a user needs to read OTHER users' rows, not just their own
-- - every table before this has been strictly owner-scoped RLS.

create table public.collab_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- Denormalized snapshot, not a join to `profiles` - `profiles` SELECT is
  -- owner-only (and also holds instagram_handle/tiktok_handle, never scoped
  -- for public visibility), so browsing other users' posts must not require
  -- widening that table's RLS. Same precedent as
  -- platform_connection_status.external_account_label: a stale name after
  -- someone changes their display name later is an accepted tradeoff for
  -- keeping this table self-contained.
  poster_display_name text,
  category text not null check (category in ('verse_feature', 'cover_swap', 'challenge_partner', 'production_swap', 'feedback_exchange', 'other')),
  title text not null,
  description text not null,
  -- Both null (not opted in) or both set (opted in) - never one without the other.
  contact_method text check (contact_method in ('instagram', 'email', 'tiktok', 'discord', 'other')),
  contact_value text,
  check ((contact_method is null) = (contact_value is null)),
  status text not null default 'open' check (status in ('open', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.collab_posts enable row level security;

-- Any authenticated user can browse every post, regardless of who posted it
-- - intentional, not a leak: browsing is the entire point of a board, and
-- contact info is only ever present on a row because its owner opted in to
-- exactly this visibility.
create policy "Collab posts are browsable by any authenticated user"
  on public.collab_posts for select
  to authenticated
  using (true);

create policy "Collab posts are insertable by their owner"
  on public.collab_posts for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Collab posts are updatable by their owner"
  on public.collab_posts for update
  to authenticated
  using (auth.uid() = user_id);

create policy "Collab posts are deletable by their owner"
  on public.collab_posts for delete
  to authenticated
  using (auth.uid() = user_id);

create trigger set_collab_posts_updated_at
  before update on public.collab_posts
  for each row execute function public.set_updated_at();

create index collab_posts_status_idx on public.collab_posts (status, created_at desc);
create index collab_posts_user_idx on public.collab_posts (user_id);

-- Anti-spam cap: at most 3 open posts per account at a time. A trigger, not
-- a check constraint, since this needs a cross-row count - runs as the
-- inserting user (not security definer), relying on the SELECT policy
-- above already letting any authenticated user read collab_posts.
create function public.enforce_open_collab_post_cap()
returns trigger
language plpgsql
as $$
declare
  open_count integer;
begin
  select count(*) into open_count
  from public.collab_posts
  where user_id = new.user_id and status = 'open';

  if open_count >= 3 then
    raise exception 'You can have at most 3 open Collab Board posts at a time. Close or delete one before posting another.';
  end if;

  return new;
end;
$$;

create trigger enforce_open_collab_post_cap_trigger
  before insert on public.collab_posts
  for each row execute function public.enforce_open_collab_post_cap();

-- Board hygiene: auto-close posts nobody's touched in 30 days, so browsing
-- doesn't fill up with dead listings. Pure SQL, no pg_net/Edge Function
-- needed (unlike sync-performance) - there's no external API involved, just
-- a straight UPDATE, so this is the simplest cron job in this project.
select
  cron.schedule(
    'collab-posts-auto-close-stale',
    '0 3 * * *',
    $$
    update public.collab_posts
    set status = 'closed', updated_at = now()
    where status = 'open' and created_at < now() - interval '30 days';
    $$
  );

-- Reports: the safety valve for a board that broadcasts contact info
-- board-wide with no messaging fallback to mediate contact. No SELECT
-- policy for clients - same "write-only from the client's perspective"
-- pattern as `email_sends`, only ever read by the service_role key or a
-- human via the dashboard.
create table public.collab_post_reports (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.collab_posts (id) on delete cascade,
  reporter_user_id uuid not null references auth.users (id) on delete cascade,
  reason text,
  created_at timestamptz not null default now()
);

alter table public.collab_post_reports enable row level security;

create policy "Collab post reports are insertable by their reporter"
  on public.collab_post_reports for insert
  to authenticated
  with check (auth.uid() = reporter_user_id);

-- security definer: needs to read the reported post's details and both
-- parties' emails (auth.users) regardless of the reporting user's own
-- grants, same reasoning as handle_new_user / notify_waitlist_signup.
--
-- exception-wrapped for the same reason as the auth.users triggers: this
-- runs synchronously as part of the reporter's insert, and a notification
-- failure must not roll back (and hide) the report itself.
--
-- Before running this migration, store the shared secret in Vault by hand
-- (never in a committed migration) - use the same value you pass to
-- `supabase secrets set COLLAB_REPORT_EMAIL_SECRET=...`:
--   select vault.create_secret('<your-generated-secret>', 'collab_report_email_secret');
create function public.notify_collab_post_reported()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  post_title text;
  post_category text;
  poster_email text;
  reporter_email text;
begin
  select p.title, p.category, u.email
  into post_title, post_category, poster_email
  from public.collab_posts p
  join auth.users u on u.id = p.user_id
  where p.id = new.post_id;

  select email into reporter_email from auth.users where id = new.reporter_user_id;

  perform net.http_post(
    url := 'https://uksdcyoxjvpmjsqqwdjj.supabase.co/functions/v1/send-collab-report-email',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'collab_report_email_secret')
    ),
    body := jsonb_build_object(
      'postId', new.post_id,
      'postTitle', post_title,
      'postCategory', post_category,
      'posterEmail', poster_email,
      'reporterEmail', reporter_email,
      'reason', new.reason
    )
  );
  return new;
exception when others then
  return new;
end;
$$;

create trigger on_collab_post_reported
  after insert on public.collab_post_reports
  for each row execute function public.notify_collab_post_reported();
