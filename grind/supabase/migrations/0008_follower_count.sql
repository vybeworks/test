-- Account-level follower/subscriber count, deliberately separate from
-- performance_entries.follows_gained: neither YouTube's nor Instagram's API
-- attributes new followers to a specific post, so this is a current total on
-- the connection itself, not a per-post metric. Nullable until the first
-- sync (or the OAuth callback, which populates it immediately on connect)
-- has actually run.
alter table public.platform_connection_status
  add column follower_count integer;
