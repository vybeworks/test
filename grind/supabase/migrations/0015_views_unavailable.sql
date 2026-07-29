-- Step 5: Insight Engine. Instagram's reach-insights call is best-effort and
-- fails silently into `views: 0` on error (deliberately, so one failed post
-- doesn't fail the whole sync) - but a real 0 and a failed fetch look
-- identical without this flag, which would quietly corrupt any average that
-- includes them. YouTube's viewCount is far more reliable (one batched call,
-- no separate per-post fetch), but gets the same flag for the rare case
-- where `statistics` is withheld for a video, for the same reason.
alter table public.performance_entries
  add column views_unavailable boolean not null default false;
