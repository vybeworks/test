-- YouTube's Short-vs-regular-video classification is a best-effort guess
-- (duration + aspect ratio when available, see sync-performance) - not
-- reliable enough on its own to be the final word. This lets a user correct
-- an individual entry's badge, and marks it so the next sync preserves the
-- correction instead of silently overwriting it with a fresh guess.
alter table public.performance_entries
  add column content_format_manual boolean not null default false;
