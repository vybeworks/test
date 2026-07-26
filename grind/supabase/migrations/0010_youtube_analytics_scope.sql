-- Adds per-video subscriber gain/loss via the YouTube Analytics API
-- (youtubeanalytics.googleapis.com), which is a separate API and OAuth scope
-- from the Data API v3 used everywhere else in the YouTube sync. Existing
-- connections were authorized before this scope existed, so they need to be
-- reconnected (re-consented) before they'll have it.

-- Server-only: the exact space-separated scope string Google granted, so
-- sync-performance can check without an extra API round-trip.
alter table public.platform_connections
  add column granted_scopes text;

-- Client-readable: lets the Track page show a "grant analytics access"
-- prompt only to YouTube connections that predate this scope.
alter table public.platform_connection_status
  add column has_analytics_scope boolean not null default false;
