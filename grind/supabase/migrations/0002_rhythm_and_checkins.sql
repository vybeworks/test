-- Step 2: streak/accountability system + Weekly Rhythm.

-- Onboarding answers that double as lasting profile context (genre feeds the
-- Release Toolkit later; goal only flavors the rhythm-generation copy) plus a
-- running XP total.
alter table public.profiles
  add column genre text,
  add column goal text,
  add column onboarding_completed_at timestamptz,
  add column xp integer not null default 0;

-- Weekly Rhythm: the repeating template, one row per user/track/weekday.
-- Content Calendar and Music Focus are the only two tracks per the spec.
create table public.rhythm_entries (
  user_id uuid not null references auth.users (id) on delete cascade,
  track text not null check (track in ('content', 'music')),
  weekday text not null check (weekday in ('mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun')),
  text text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, track, weekday)
);

alter table public.rhythm_entries enable row level security;

create policy "Rhythm entries are owner-only"
  on public.rhythm_entries for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create trigger set_rhythm_entries_updated_at
  before update on public.rhythm_entries
  for each row execute function public.set_updated_at();

-- Whether today's rhythm block (content or music) has been checked off on
-- the home dashboard. Separate from daily_checkins: this is "did the planned
-- block happen," not the streak-driving daily check-in.
create table public.rhythm_completions (
  user_id uuid not null references auth.users (id) on delete cascade,
  date date not null,
  track text not null check (track in ('content', 'music')),
  completed_at timestamptz not null default now(),
  primary key (user_id, date, track)
);

alter table public.rhythm_completions enable row level security;

create policy "Rhythm completions are owner-only"
  on public.rhythm_completions for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- The daily accountability check-in that drives the streak: what got made
-- (multi-select) and how it felt. xp_awarded is recorded so an undo can
-- reverse the exact amount granted (streak/type/mood/milestone bonuses all
-- vary per check-in, so it can't be recomputed after the fact).
create table public.daily_checkins (
  user_id uuid not null references auth.users (id) on delete cascade,
  date date not null,
  types text[] not null,
  mood text not null check (mood in ('fire', 'meh', 'rough')),
  mood_bonus integer not null default 0,
  xp_awarded integer not null default 0,
  created_at timestamptz not null default now(),
  primary key (user_id, date)
);

alter table public.daily_checkins enable row level security;

create policy "Daily checkins are owner-only"
  on public.daily_checkins for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Atomic XP increment (and decrement, for undo) - avoids read-modify-write
-- races between client-computed totals and what's actually stored.
create function public.increment_xp(delta integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  new_xp integer;
begin
  update public.profiles
  set xp = greatest(0, xp + delta)
  where id = auth.uid()
  returning xp into new_xp;
  return new_xp;
end;
$$;
