-- Fixes a false-timeout diagnostic on the sync-performance cron job.
-- pg_net's net.http_post defaults timeout_milliseconds to 5000 when not
-- specified - the original 0004_platform_connections.sql call never set it,
-- so every run has been racing a 5-second clock against a function that
-- routinely takes far longer (up to ~2,000 YouTube videos with individual
-- upserts, plus up to 100 Instagram media items each requiring its own
-- sequential reach-insights call). Confirmed this is NOT a data-loss bug:
-- pg_net's timeout only controls how long it waits for a response, it does
-- not cancel the destination request - sync-performance keeps running and
-- completing regardless (matches the real, correct data already synced).
-- Still worth fixing properly, though: as long as every real run "times
-- out," net._http_response is useless for spotting an actual failure amid
-- the noise.
--
-- cron.schedule() with an existing job name upserts in place (updates the
-- schedule/command of the existing job, doesn't create a duplicate), so
-- this is safe to run against a project that already has the original
-- 0004 job scheduled.
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
      body := '{}'::jsonb,
      timeout_milliseconds := 120000
    );
    $$
  );
