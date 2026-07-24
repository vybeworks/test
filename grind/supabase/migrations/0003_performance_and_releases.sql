-- Step 3: manual performance tracking + Release Toolkit.

-- Handles referenced directly in rollout-step personalization (spec section 5).
-- Nullable/optional - not everyone fills these in.
alter table public.profiles
  add column instagram_handle text,
  add column tiktok_handle text;

create table public.releases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  release_date date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.releases enable row level security;

create policy "Releases are owner-only"
  on public.releases for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create trigger set_releases_updated_at
  before update on public.releases
  for each row execute function public.set_updated_at();

-- The 6-week rollout template itself is static app content (not user data);
-- this table only tracks which of its 6 steps are checked off, per release.
create table public.rollout_completions (
  user_id uuid not null references auth.users (id) on delete cascade,
  release_id uuid not null references public.releases (id) on delete cascade,
  step_index integer not null check (step_index >= 0 and step_index < 6),
  completed_at timestamptz not null default now(),
  primary key (release_id, step_index)
);

alter table public.rollout_completions enable row level security;

create policy "Rollout completions are owner-only"
  on public.rollout_completions for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Manual performance entries. `source` defaults to 'manual' now and is ready
-- for step 4's Instagram/YouTube API sync to write 'instagram_api' /
-- 'youtube_api' rows into the same table without a schema change - manual
-- override stays available on every row regardless of source.
create table public.performance_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  platform text not null check (platform in ('tiktok', 'instagram', 'youtube')),
  post_date date not null,
  content_type text,
  views integer not null default 0,
  likes integer not null default 0,
  comments integer not null default 0,
  follows_gained integer not null default 0,
  note text,
  source text not null default 'manual' check (source in ('manual', 'instagram_api', 'youtube_api')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.performance_entries enable row level security;

create policy "Performance entries are owner-only"
  on public.performance_entries for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create trigger set_performance_entries_updated_at
  before update on public.performance_entries
  for each row execute function public.set_updated_at();

create index performance_entries_user_date_idx
  on public.performance_entries (user_id, post_date);
