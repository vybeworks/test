-- Real pagination for Instagram history, matching what YouTube already does
-- (fetch everything, not just the newest N) - but Instagram's 200
-- calls/hour rate limit (vs. YouTube's much larger daily quota) means a
-- large history can't be pulled in a single run the way YouTube's can. This
-- makes the sync resumable across runs instead: each 6-hour run picks up
-- where the last one left off, walking further into the account's history
-- until it reaches the end, at which point it switches to just checking the
-- newest page for new posts and fresh stats.

-- Server-only, mirrors platform_connections' existing pattern of holding
-- sync state that never needs to reach the client.
alter table public.platform_connections
  add column instagram_backfill_cursor text,
  add column instagram_backfill_complete boolean not null default false;

-- Client-readable, so the Track page can show "still catching up on your
-- full history" instead of silently looking done.
alter table public.platform_connection_status
  add column instagram_backfill_complete boolean;
