-- Fix: `ON CONFLICT (user_id, platform, external_post_id)` (used by the
-- sync-performance upsert) cannot match a *partial* unique index - Postgres
-- requires the conflict target to infer a full index, and there's no way to
-- pass the partial predicate through PostgREST/supabase-js's upsert(). Every
-- synced video failed with "no unique or exclusion constraint matching the
-- ON CONFLICT specification" as a result.
--
-- Dropping the `where external_post_id is not null` predicate fixes this
-- without changing behavior for manual entries: under standard btree unique
-- semantics, NULL is never considered equal to another NULL, so many manual
-- rows (all with external_post_id = null) still never conflict with each
-- other. Only real (user_id, platform, external_post_id) duplicates - i.e.
-- re-syncing the same post - now conflict, which is exactly what the sync
-- upsert needs.
drop index if exists public.performance_entries_external_post_idx;

create unique index performance_entries_external_post_idx
  on public.performance_entries (user_id, platform, external_post_id);
