-- Lets the Track page show each post's actual cover image instead of a bare
-- text row. Both YouTube's videos.snippet and Instagram's media object
-- already return a usable image URL per post - no new API scope needed,
-- just requesting one more field. Null for manual entries (no API to pull
-- a thumbnail from).
alter table public.performance_entries
  add column thumbnail_url text;
