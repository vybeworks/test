-- Manual Trial Reel tagging (step 4 follow-up). Instagram Trial Reels are
-- not distinguishable via the public Graph API (confirmed unbuildable via
-- auto-detection), so this is a user-applied tag, same philosophy as
-- TikTok's permanent manual-entry-only status elsewhere in this table.
alter table public.performance_entries
  add column is_trial_reel boolean not null default false;

alter table public.performance_entries
  add constraint performance_entries_trial_reel_instagram_only
  check (not is_trial_reel or platform = 'instagram');
