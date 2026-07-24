-- Step 4: Instagram/YouTube OAuth sync infrastructure.

-- Server-only token storage. RLS is enabled with ZERO policies for
-- anon/authenticated, so the anon-key client can never read or write this
-- table under any circumstance - only the service_role key (used exclusively
-- inside Edge Functions, never shipped to the browser) bypasses RLS entirely.
create table public.platform_connections (
  user_id uuid not null references auth.users (id) on delete cascade,
  platform text not null check (platform in ('instagram', 'youtube')),
  access_token text not null,
  refresh_token text,
  token_expires_at timestamptz,
  external_account_id text,
  external_account_label text,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, platform)
);

alter table public.platform_connections enable row level security;
-- Deliberately no policies here - default-deny for anon/authenticated.

create trigger set_platform_connections_updated_at
  before update on public.platform_connections
  for each row execute function public.set_updated_at();

-- Client-readable connection status - never holds a token, safe to expose,
-- so the UI can show "connected" / "last synced" without touching the table
-- above. Only service_role (inside Edge Functions) writes it.
create table public.platform_connection_status (
  user_id uuid not null references auth.users (id) on delete cascade,
  platform text not null check (platform in ('instagram', 'youtube')),
  external_account_label text,
  connected_at timestamptz,
  last_synced_at timestamptz,
  last_sync_error text,
  primary key (user_id, platform)
);

alter table public.platform_connection_status enable row level security;

create policy "Connection status is viewable by its owner"
  on public.platform_connection_status for select
  using (auth.uid() = user_id);

-- No insert/update/delete policy for clients - status rows are only ever
-- written by the Edge Functions via the service_role key.

-- Lets the scheduled sync upsert the same post's row on every run instead of
-- duplicating it. Null for manual entries - a partial unique index means
-- many manual (null) rows never conflict with each other or with synced ones.
alter table public.performance_entries
  add column external_post_id text;

create unique index performance_entries_external_post_idx
  on public.performance_entries (user_id, platform, external_post_id)
  where external_post_id is not null;

-- Scheduled sync: calls the sync-performance Edge Function every 6 hours.
-- Requires pg_cron and pg_net (usually enabled by default on Supabase
-- projects). If the CREATE EXTENSION lines below error with a permissions
-- issue, enable both under Database -> Extensions in the dashboard first,
-- then re-run just the cron.schedule statement below by hand.
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- The Edge Function checks this exact shared secret in its Authorization
-- header. Store it BEFORE running the cron.schedule statement below, by
-- hand, in the SQL editor - never put the literal secret in a migration
-- file that gets committed to git:
--   select vault.create_secret('<your-generated-secret>', 'cron_shared_secret');
-- Use the same value you pass to `supabase secrets set CRON_SHARED_SECRET=...`.
--
-- The project URL below is this project's - update it if this repo is ever
-- pointed at a different Supabase project. It's not sensitive (same ref
-- that's already in VITE_SUPABASE_URL).
select
  cron.schedule(
    'sync-performance-every-6h',
    '0 */6 * * *',
    $$
    select net.http_post(
      url := 'https://uksdcyoxjvpmjsqqwdjj.supabase.co/functions/v1/sync-performance',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_shared_secret')
      ),
      body := '{}'::jsonb
    );
    $$
  );
