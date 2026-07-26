-- Distinguishes a platform's own post formats (Instagram Reel vs. regular
-- feed post, YouTube Short vs. regular video) from `content_type`, which is
-- the user's own manual content-rhythm categorization (reel/photo/song/etc)
-- used elsewhere for streak tracking - these are separate concepts that
-- happen to overlap in vocabulary.
alter table public.performance_entries
  add column content_format text check (content_format in ('reel', 'feed', 'story', 'short', 'video'));
