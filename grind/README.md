# GRIND

Independent-artist planning, tracking, and consistency app. PWA frontend (Vite + React +
TypeScript) backed by Supabase (Postgres + Auth).

Build status: **Step 4 — Instagram/YouTube OAuth sync (YouTube built, Instagram next).** Accounts
(step 1), the streak/rhythm habit loop (step 2), manual performance tracking + Release Toolkit
(step 3), plus: automatic YouTube performance sync via OAuth and a scheduled background job.
Instagram Graph API sync, the Insight Engine, Growth Recap/Release Archive, and the Collab Board
are still ahead per the spec's build order.

## Setup

1. **Create a Supabase project** at [supabase.com](https://supabase.com/dashboard).
2. **Apply the schema.** In the Supabase dashboard's SQL editor, run the migrations in order
   (all in `supabase/migrations/`): `0001_profiles.sql`, `0002_rhythm_and_checkins.sql`,
   `0003_performance_and_releases.sql`, then `0004_platform_connections.sql` (see its own setup
   steps below - it needs a Vault secret created *before* it will fully succeed). (Or, if you have
   the Supabase CLI linked to your project: `supabase link --project-ref <your-ref>` then
   `supabase db push`.)
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

## Setting up YouTube OAuth sync (step 4)

This needs the Supabase CLI logged in and linked to your project, since Edge Functions and their
secrets can't be set from the SQL editor:

```
supabase login
supabase link --project-ref uksdcyoxjvpmjsqqwdjj
```

**1. Set the Edge Function secrets.** `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected
automatically - don't set those. Everything else:

```
supabase secrets set GOOGLE_CLIENT_ID=<your Google OAuth client ID>
supabase secrets set GOOGLE_CLIENT_SECRET=<your Google OAuth client secret>
supabase secrets set OAUTH_STATE_SECRET=$(openssl rand -hex 32)
supabase secrets set CRON_SHARED_SECRET=$(openssl rand -hex 32)
supabase secrets set FRONTEND_URL=http://localhost:5173
```

`OAUTH_STATE_SECRET` signs the OAuth `state` parameter so the callback can trust which user
initiated the connection without a server-side session. `CRON_SHARED_SECRET` is a shared secret
between the scheduled job and `sync-performance` - unrelated to Supabase's own auth, just a
narrow-purpose credential so the sync endpoint isn't wide open. Use `openssl rand -hex 32` (or
equivalent) rather than picking a value yourself. Update `FRONTEND_URL` to your real deployed URL
once you have one - it's where the OAuth callback redirects the browser back to.

**2. Store the same `CRON_SHARED_SECRET` value in Supabase Vault**, by hand, in the SQL editor -
never in a committed migration:

```sql
select vault.create_secret('<the exact same value you set above>', 'cron_shared_secret');
```

**3. Deploy the three functions.** The callback and the cron-triggered sync are public endpoints
by design (their security comes from the state signature and shared secret respectively, not from
Supabase's own JWT gate), so they need `--no-verify-jwt`:

```
supabase functions deploy youtube-oauth-start
supabase functions deploy youtube-oauth-callback --no-verify-jwt
supabase functions deploy sync-performance --no-verify-jwt
```

**4. Run `0004_platform_connections.sql`** (in the SQL editor) if you haven't already - it sets
up the scheduled job that calls `sync-performance` every 6 hours via `pg_cron`/`pg_net`. If the
`create extension` lines fail with a permissions error, enable both under Database → Extensions
in the dashboard first, then re-run just the `cron.schedule(...)` statement at the bottom by hand.

**5. Test it**: open the app, go to the Track tab, click Connect next to YouTube, and go through
Google's consent screen. You should land back on the Track tab with "YouTube connected." and see
your channel name once the first sync runs (immediately, or trigger one early by calling
`sync-performance` manually with the shared secret: `curl -X POST -H "Authorization: Bearer
<CRON_SHARED_SECRET>" https://uksdcyoxjvpmjsqqwdjj.supabase.co/functions/v1/sync-performance`).

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

## How OAuth sync is wired

Token exchange needs a client secret that must never reach the browser, so this step introduces
Supabase Edge Functions (`supabase/functions/`) - the first server-side code in this project.

- **`platform_connections`** (server-only) holds access/refresh tokens. RLS is enabled with
  *zero* policies for `anon`/`authenticated` - default-deny, no exceptions - so the only way to
  read or write it is the `service_role` key, which only ever runs inside Edge Functions and is
  never shipped to the client. **`platform_connection_status`** is a separate, deliberately
  token-free table (connected label, last synced, last error) with a normal owner-only select
  policy, so the UI can show connection state without the tables ever touching each other's
  access patterns.
- **`youtube-oauth-start`** — called via `supabase.functions.invoke` (so it gets the caller's
  Supabase JWT automatically), verifies that JWT, signs a `state` value carrying the user id
  (HMAC'd with `OAUTH_STATE_SECRET`, 10-minute expiry - see `_shared/state.ts`), and returns
  Google's authorization URL for the frontend to navigate to.
- **`youtube-oauth-callback`** — a public endpoint (Google redirects the bare browser here, no
  Supabase session available). Verifies the signed `state` to recover the user id, exchanges the
  code for tokens server-side, looks up the channel, writes both tables via the service-role
  client, and redirects back into the app with `?connected=youtube` or `?error=...`.
- **`sync-performance`** — checked via `CRON_SHARED_SECRET` (a narrow-purpose credential, not
  Supabase's own auth) instead of a user JWT, since it runs for every connected user on a
  schedule with nobody logged in. Refreshes any expired access token, pulls each channel's recent
  uploads and statistics, and upserts into `performance_entries` keyed by the new
  `external_post_id` column (`source: 'youtube_api'`) - so re-running the sync updates the same
  row's view/like/comment counts instead of duplicating it.
- **Scheduling**: `0004_platform_connections.sql` enables `pg_cron`/`pg_net` and schedules a call
  to `sync-performance` every 6 hours. The shared secret it sends lives in Supabase Vault, set by
  hand (never in a committed migration) - see the setup steps above.
- **Why the 6-week YouTube quirk matters**: `youtube.readonly` is a *sensitive* but not
  *restricted* Google scope, so publishing the OAuth consent screen to production is close to
  instant and avoids the 7-day refresh-token expiry that unverified/testing apps get stuck with -
  worth doing before relying on the schedule long-term.
- **Instagram is schema-ready but not built yet.** `platform`/`source` check constraints already
  include `'instagram'`/`'instagram_api'`, and the Track tab shows it as "coming soon" rather than
  hiding it, but the actual Graph API integration (Business/Creator account + Facebook Page + Meta
  App Review for anyone beyond your own test account) is next.
