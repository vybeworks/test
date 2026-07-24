# GRIND

Independent-artist planning, tracking, and consistency app. PWA frontend (Vite + React +
TypeScript) backed by Supabase (Postgres + Auth).

Build status: **Step 3 — manual performance tracking + Release Toolkit.** Accounts (step 1) and
the streak/rhythm habit loop (step 2), plus: manual performance entries per platform with a
trend chart, and per-release 6-week rollout tracking with a 30-day content calendar. OAuth sync,
the Insight Engine, Growth Recap/Release Archive, and the Collab Board are still ahead per the
spec's build order.

## Setup

1. **Create a Supabase project** at [supabase.com](https://supabase.com/dashboard).
2. **Apply the schema.** In the Supabase dashboard's SQL editor, run the migrations in order:
   `0001_profiles.sql`, `0002_rhythm_and_checkins.sql`, then `0003_performance_and_releases.sql`
   (all in `supabase/migrations/`). (Or, if you have the Supabase CLI installed and linked to
   your project: `supabase link --project-ref <your-ref>` then `supabase db push`.)
3. **Enable Google sign-in (optional).** In the dashboard: Authentication → Providers → Google,
   and follow Supabase's instructions to add your OAuth client ID/secret. Email/password auth is
   enabled by default and needs no setup.
4. **Set environment variables.** Copy `.env.example` to `.env` and fill in your project's URL
   and anon key (Project Settings → API in the dashboard):
   ```
   VITE_SUPABASE_URL=https://your-project-ref.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-key
   ```
5. **Run it:**
   ```
   npm install
   npm run dev
   ```

## Deploying

Static hosting (Vercel recommended): point it at this directory, build command `npm run build`,
output directory `dist`. Set the same two `VITE_SUPABASE_*` environment variables in the host's
project settings — the client-side anon key is safe to expose (it only grants what your Postgres
row-level security policies allow), but never expose the Supabase *service role* key here or in
any client code.

## How auth is wired

- `src/lib/supabaseClient.ts` — the Supabase client, reading the two env vars above.
- `src/auth/AuthProvider.tsx` — session state, sign up/in/out, and loads the current user's
  `profiles` row.
- `src/auth/AuthScreen.tsx` — combined login/signup screen.
- A Postgres trigger (`handle_new_user`, in the migration) creates the `profiles` row
  automatically whenever someone signs up — the client never inserts into `profiles` directly.
- Row-level security on `profiles` restricts every row to its own owner (`auth.uid() = id`) for
  both reads and writes.

## How the streak/rhythm system is wired

- `src/lib/rhythm.ts` — constants (suggestion banks, moods, ranks, milestones, ember/grade
  tiers) and pure functions (deterministic day-spread, streak-with-one-skip calculation, GRIND
  Score). No Supabase calls in this file on purpose — it's all unit-testable logic.
- `src/data/useGrindData.ts` — hooks wrapping the three new tables: `useRhythmEntries` (the
  repeating weekly template), `useCheckins` (the daily accountability log), and
  `useRhythmCompletions` (today's checkable rhythm blocks) — plus `addXp`, which calls the
  `increment_xp` Postgres function so XP updates are atomic instead of a racy read-modify-write.
- `src/onboarding/OnboardingFlow.tsx` — first-use questionnaire that deterministically builds a
  starting rhythm (never random) and is skippable.
- `src/pages/RhythmPage.tsx` — edit the Content Calendar and Music Focus tracks per weekday,
  with optional suggestion chips.
- `src/pages/HomePage.tsx` — the daily dashboard: GRIND Score, rank, streak flame, today's
  rhythm blocks (with "stuck?" prompts), the check-in flow, and the 28-day history grid.
- **No leaderboard or reflection journal.** Both existed in the prototype but aren't in the
  locked spec's Accountability section, so they were left out rather than carried forward by
  default. A leaderboard in particular would mean exposing other users' data before the Collab
  Board step has worked through how to do that safely.

## How performance tracking + the Release Toolkit are wired

- `src/lib/releaseToolkit.ts` — the static 6-week rollout template, platform metadata (labels +
  categorical colors), and pure helpers: `daysUntil`, `generateContentCalendar` (uses the user's
  *actual* content-rhythm days, not a fabricated fixed pattern), and `personalizeRollout` (fills
  in the song title and, when set, Instagram/TikTok handles - never fabricated).
- `src/data/useReleaseData.ts` — `useReleases` and `useRolloutCompletions` (per-release CRUD and
  step-toggling) and `usePerformanceEntries` (manual entry CRUD), plus two lightweight aggregate
  hooks (`usePlatformsLogged`, `useRolloutStepsCompletedTotal`) that feed the GRIND Score.
- `src/pages/PerformanceTrackingPage.tsx` — manual entry form (TikTok is permanently manual, no
  small-scale analytics API exists for it; Instagram/YouTube are manual until the OAuth step)
  plus a trend chart and the raw entry list (which doubles as the chart's accessible table view).
- `src/pages/ReleaseToolkitPage.tsx` — release CRUD, the personalized rollout checklist, the
  30-day calendar, and a small "platform handles" form purely so the rollout copy has something
  real to reference.
- **Performance trend chart colors** (`PLATFORM_META` in `releaseToolkit.ts`) were run through the
  dataviz skill's palette validator against this app's actual card surface (`#12141c`) —
  CVD separation, normal-vision floor, and contrast all pass, all-pairs. They're deliberately
  distinct from the app's existing ember/teal/rose, which already carry other meanings (streak
  heat, completion, release urgency) — reusing those for platform identity would blur both.
- **GRIND Score now uses all four of the spec's named components** (streak, rhythm, stats,
  release activity), 25 points each. "Stats" is platform breadth (how many of the 3 platforms
  have at least one logged entry), and "release activity" is rollout steps actually completed
  (not just releases listed, so it can't be gamed by adding empty releases).
- **`performance_entries.source`** defaults to `'manual'` and already has `'instagram_api'` /
  `'youtube_api'` as valid values, so step 4's OAuth sync can write into this same table without
  a schema change - manual override stays available on every row regardless of source, per spec.
