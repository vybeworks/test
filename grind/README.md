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

## Adding per-video subscriber data (YouTube Analytics API)

Per-video subscriber gain/loss - the number YouTube Studio shows per video - lives only in the
separate YouTube Analytics API (`youtubeanalytics.googleapis.com`), not the Data API v3 used for
everything else in the YouTube sync. It needs its own OAuth scope
(`yt-analytics.readonly`), which any connection made before this feature won't have.

**1. Run the migration**: `0010_youtube_analytics_scope.sql` (adds `platform_connections
.granted_scopes` - server-only - and `platform_connection_status.has_analytics_scope` -
client-readable).

**2. Redeploy the three YouTube functions** - all three changed:

```
supabase functions deploy youtube-oauth-start
supabase functions deploy youtube-oauth-callback --no-verify-jwt
supabase functions deploy sync-performance --no-verify-jwt
```

**3. Reconnect existing YouTube connections.** This is unavoidable: Google only grants scopes a
user has actually consented to, and existing connections predate this one. On the Track tab, any
YouTube connection missing the scope now shows a small "Grant analytics access for per-video
subscriber data" link under its status line - it's the exact same Connect flow as a fresh
connection (same button, same Google consent screen), just triggered again. Google's consent
screen will now list both the original read-only scope and the new analytics one; approving it
issues a fresh token with both, and the existing connection is upserted in place (same
`external_account_id`, no duplicate row). Nothing is lost by reconnecting - your synced history,
follower count, and every logged entry stay exactly as they are.

**4. Trigger a sync** the same way as the original setup, with the same `CRON_SHARED_SECRET`.
Videos will start showing a real `follows_gained` value (net subscribers gained minus lost,
attributed to that specific video) instead of the placeholder 0.

**Expect this one to need a follow-up pass too, same as the original YouTube/Instagram builds**:
the exact response shape and chunking limits of `dimensions=video` filtered queries on
`youtubeanalytics.googleapis.com` are based on documentation, not a live test against a real
channel yet. `fetchVideoSubscriberDeltas` in `sync-performance` is built to degrade gracefully - a
failed chunk just leaves those videos at `follows_gained: 0` with the specific error visible in
`upsertErrors`, it doesn't fail the whole sync - but the request shape itself (chunk size, date
range, filter syntax) may need adjusting once we see a real response.

## Setting up Instagram OAuth sync (step 4, Instagram half)

Reuses `OAUTH_STATE_SECRET`, `CRON_SHARED_SECRET`, and `FRONTEND_URL` from the YouTube setup above
- those are already platform-agnostic. Only two new secrets needed:

**1. Set the secrets:**

```
supabase secrets set INSTAGRAM_APP_ID=<your Meta App ID>
supabase secrets set INSTAGRAM_APP_SECRET=<your Meta App Secret>
```

**2. Before testing, confirm `instagram_business_manage_insights` is added** in the Meta app
dashboard's Instagram product → use case permissions. The "Manage messaging & content on
Instagram" use case only adds `instagram_business_basic` and `instagram_business_manage_messages`
by default - insights (the permission this integration actually needs) has to be added
separately, or the consent screen won't grant it even though the code requests it.

**3. Deploy:**

```
supabase functions deploy instagram-oauth-start
supabase functions deploy instagram-oauth-callback --no-verify-jwt
supabase functions deploy sync-performance --no-verify-jwt
```

`sync-performance` now handles both platforms in one run (no second cron job needed - it was
already scheduled every 6 hours by `0004_platform_connections.sql`), so redeploying it picks up
Instagram automatically.

**4. Test it**: Track tab → Connect next to Instagram → Instagram's consent screen (not
Facebook's - this app uses direct Instagram Login, no Facebook Page involved). You should land
back with "Instagram connected." Trigger a sync early the same way as YouTube's, with the same
`CRON_SHARED_SECRET`.

**Expect this to need a follow-up pass, honestly.** Instagram's Insights API metric names have
changed more than once across API versions and differ by media type - `syncInstagramAccount`
requests `reach` for views and is built to degrade gracefully (a failure on one post's insights
call doesn't fail the sync, it just leaves that post's views at 0 with the specific error visible
in the response's `upsertErrors`), but the metric name itself may need adjusting once we see a
real response from your account, the same way YouTube needed two rounds of fixes after the first
real test.

**Follow-up fix**: the `ON CONFLICT`/pagination fixes from the YouTube setup, plus the
account-level follower/subscriber count added afterward, live in
`0005_fix_performance_entries_conflict.sql` and `0008_follower_count.sql` - run both (in order,
alongside `0004`) if you're setting this up fresh rather than incrementally. Redeploy
`youtube-oauth-callback`, `instagram-oauth-callback`, and `sync-performance` after pulling this
version - all three changed to populate `follower_count`.

**Manual Trial Reel tagging**: run `0009_trial_reel.sql` (adds `performance_entries.is_trial_reel`).
No secrets or redeploy needed - this is frontend + schema only, see "How performance tracking +
the Release Toolkit are wired" below for what it does.

**Post thumbnails**: run `0011_thumbnail_url.sql` (adds `performance_entries.thumbnail_url`), then
redeploy `sync-performance` - it now requests each post's cover image alongside the stats it
already pulled, no new scope needed on either platform:

```
supabase functions deploy sync-performance --no-verify-jwt
```

Existing synced rows won't have a thumbnail until the next sync runs (every 6 hours, or trigger
one early the same way as before). Manual entries never have one - there's no API to pull an
image from - and show a small content-type icon instead.

**Reel/Short vs. regular post/video badge**: run `0012_content_format.sql` (adds
`performance_entries.content_format`), then redeploy `sync-performance`:

```
supabase functions deploy sync-performance --no-verify-jwt
```

Instagram's distinction is exact - `media_product_type` (already in the existing fields list) is
Instagram's own tag, `REELS` vs. `FEED` vs. `STORY`. **YouTube's is a heuristic** - the Data API
has no official "is this a Short" field (there's a long-standing, still open request for one on
Google's issue tracker).

**Correction after a real test**: the first version of this used duration alone (≤3 minutes =
Short). Against a real channel, that classified 172 of 174 videos as "Shorts" - most of that
channel's genuinely regular videos also happen to run under 3 minutes, so duration alone barely
discriminates anything. Fixed to use aspect ratio as the primary signal instead (Shorts are
vertical, 9:16; regular videos are horizontal, 16:9), pulled from `fileDetails.videoStreams` -
owner-only data, available since this is the channel's own OAuth connection, no new scope needed.
Duration is now only a tiebreaker: over 3 minutes is never a Short regardless of shape, and if
`fileDetails` isn't available for a given video (not guaranteed for every upload), it falls back
to the old duration-only guess for that one video only. Redeploy `sync-performance` again and
re-trigger a sync (the upsert is idempotent, so this re-evaluates every existing row's badge, not
just new ones) - no new migration needed for this specific fix, `content_format` already exists.

**Second correction, from a real re-test**: the aspect-ratio fix barely moved a real channel's
numbers (172 → 173 "Short"), which means `fileDetails.videoStreams` isn't actually coming back
from the API for nearly any of that channel's videos, despite being documented as owner-available
- likely a data-retention gap for older uploads that the docs don't spell out. Since there's no
reliable automatic signal left to try here (same category of platform gap as Trial Reels), this
now has a manual correction as the real fallback, matching the same philosophy used everywhere
else in this table: **run `0013_content_format_manual.sql`** (adds
`performance_entries.content_format_manual`), no redeploy needed for the migration itself, but
redeploy `sync-performance` too since it changed to respect the flag:

```
supabase functions deploy sync-performance --no-verify-jwt
```

Every YouTube entry with a Short/Video badge now has a small "This is actually a regular
video"/"This is actually a Short" link beneath it - correcting it once sets
`content_format_manual = true`, and every future sync preserves that value instead of
overwriting it with a fresh (possibly still-wrong) guess. A ✓ on the badge itself means it's been
confirmed by you rather than guessed. The automatic guess (duration + aspect ratio when
available) stays as the default for anything you haven't corrected - this is a safety net layered
on top of the best automation available, not a replacement for trying to automate it.

**Instagram's full history, not just the newest 100**: run `0014_instagram_backfill.sql` (adds
`instagram_backfill_cursor`/`instagram_backfill_complete` to `platform_connections`, and
`instagram_backfill_complete` to `platform_connection_status`), then redeploy `sync-performance`:

```
supabase functions deploy sync-performance --no-verify-jwt
```

This is a real difference from YouTube, not just a bigger number: YouTube's whole history fits
under its quota in one sync, always. Instagram's 200-calls/hour ceiling means a history beyond
~100 posts genuinely cannot be pulled in a single run - so this makes the sync resumable instead.
Each 6-hour run picks up from a saved cursor and walks further into the account's history; once
it reaches the real end, it flips to steady-state (newest page only, to catch new posts and keep
recent stats fresh) and stops re-walking old ground. **A large account's full backfill will take
several sync cycles to complete**, not one - that's the honest tradeoff of a real per-hour rate
limit, not a bug. The Track tab shows "still catching up on your full history" under Instagram's
connection status for as long as that's true, so it's never silently incomplete-looking-done.

## Setting up the launch email

A separate, manually-triggered piece: sends the "GRIND is live" email once, on demand, to
everyone in `waitlist_signups` (a table from the pre-launch landing page, outside this app but in
the same Supabase project). Requires a [Resend](https://resend.com) account with
`joingrindapp.com` verified as a sending domain (already done) and its own API key with
**Sending access** only.

**1. Set the secrets:**

```
supabase secrets set RESEND_API_KEY=<your Resend API key>
supabase secrets set LAUNCH_EMAIL_SECRET=$(openssl rand -hex 32)
supabase secrets set MAIL_FROM_ADDRESS=grind@joingrindapp.com
supabase secrets set GET_STARTED_URL=https://joingrindapp.com
```

`LAUNCH_EMAIL_SECRET` is its own credential, separate from `CRON_SHARED_SECRET` - a leak of one
shouldn't also be able to trigger the other. `GET_STARTED_URL` is a placeholder for now; update it
with the real production URL before the real trigger (no redeploy needed - it's just a secret):

```
supabase secrets set GET_STARTED_URL=<the real URL, once you have one>
```

**2. Run `0006_email_sends.sql`** in the SQL editor.

**3. Deploy:**

```
supabase functions deploy send-launch-email --no-verify-jwt
```

**4. Sanity-check before the real send.** Two safety modes, both no-ops against the real list:

```
# See exactly who would receive it and how many, without sending anything:
curl -X POST -H "Authorization: Bearer <LAUNCH_EMAIL_SECRET>" -H "Content-Type: application/json" \
  -d '{"dryRun": true}' \
  https://uksdcyoxjvpmjsqqwdjj.supabase.co/functions/v1/send-launch-email

# Send exactly one real email, to yourself, to check the template renders
# and lands correctly - never touches the waitlist or the sent-tracking table:
curl -X POST -H "Authorization: Bearer <LAUNCH_EMAIL_SECRET>" -H "Content-Type: application/json" \
  -d '{"testEmail": "you@example.com"}' \
  https://uksdcyoxjvpmjsqqwdjj.supabase.co/functions/v1/send-launch-email
```

**5. The real send**, once you're ready (empty body, or omit `-d` entirely):

```
curl -X POST -H "Authorization: Bearer <LAUNCH_EMAIL_SECRET>" \
  https://uksdcyoxjvpmjsqqwdjj.supabase.co/functions/v1/send-launch-email
```

Safe to re-run: it only ever sends to addresses not already recorded in `email_sends` for this
campaign, so a partial failure or an accidental second trigger doesn't double-email anyone.

## Setting up the automatic welcome email

Unlike the launch email, this one is automatic: fires once per row inserted into
`waitlist_signups`, via a database trigger (not client-side, since the landing page that does the
inserting isn't part of this repo). Reuses the same Resend setup and `MAIL_FROM_ADDRESS` from
above - no new Resend configuration needed.

**1. Set its own shared secret** (separate from `CRON_SHARED_SECRET` and `LAUNCH_EMAIL_SECRET` -
each credential only able to trigger the one thing it's for):

```
supabase secrets set WELCOME_EMAIL_SECRET=$(openssl rand -hex 32)
```

**2. Store the same value in Vault**, by hand, in the SQL editor (same pattern as
`cron_shared_secret` in the step 4 setup above):

```sql
select vault.create_secret('<the exact same value you set above>', 'welcome_email_secret');
```

**3. Deploy** (public endpoint by design - `pg_net` calls it, not a user session):

```
supabase functions deploy send-welcome-email --no-verify-jwt
```

**4. Run `0007_welcome_email_trigger.sql`** in the SQL editor - this creates the trigger itself,
so do this *after* the Vault secret exists and the function is deployed, not before.

**5. Test it**: insert a throwaway row directly in the SQL editor and confirm the email arrives:

```sql
insert into public.waitlist_signups (email) values ('you+test@joingrindapp.com');
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
- **Trial Reel tagging is manual-only, deliberately.** Instagram doesn't expose which posts are
  "Trial Reels" (the non-follower-reach test format) anywhere in the public Graph API - confirmed
  unbuildable via auto-detection, same category of gap as TikTok's missing analytics API.
  `performance_entries.is_trial_reel` (migration `0009_trial_reel.sql`) lets you tag any Instagram
  entry - manual or auto-synced - as a Trial Reel from the Track page, either when logging a new
  entry or via a "Mark as Trial Reel" toggle on existing ones. A check constraint keeps the tag
  Instagram-only. A "Trial Reels" view filter tab sections these out from the rest of the feed.
- **Logged posts show each post's real cover image** (`performance_entries.thumbnail_url`, migration
  `0011_thumbnail_url.sql`) - YouTube's `snippet.thumbnails` and Instagram's `media_url`/
  `thumbnail_url` (the latter for video/Reels, since `media_url` on those is the raw video file,
  not something an `<img>` can render) were already available in each sync's existing API calls,
  no new scope needed. Manual entries fall back to a content-type icon since there's no API to
  pull an image from. The list is also grouped under per-date headers ("Today", "Yesterday", then
  calendar dates) instead of repeating the date on every row.
- **`performance_entries.content_format`** (migration `0012_content_format.sql`) is deliberately
  separate from `content_type` - the latter is the user's own manual content-rhythm
  categorization (reel/photo/song/etc, used for streak tracking), the former is a platform-native
  post-format badge (Reel/Post, Short/Video) detected from the sync itself. Instagram's is exact
  (`media_product_type`); YouTube's is a best-effort guess, since the Data API has no official
  Shorts flag - aspect ratio (`fileDetails.videoStreams`) first, duration
  (`contentDetails.duration` ≤ 3 minutes) as a tiebreaker. In practice `fileDetails` turned out to
  be unavailable for nearly this whole real channel's catalog, so the guess is often just
  duration alone - not reliable enough to be the last word. `content_format_manual` (migration
  `0013_content_format_manual.sql`) is the real fallback: a per-entry correction the user makes
  once, that sync-performance then preserves forever (it fetches every manually-overridden
  video's id before its upsert loop and re-writes the saved value instead of a fresh guess,
  never touching the `content_format_manual` flag itself). Same philosophy as Trial Reel tagging
  - automate first, but when a platform genuinely doesn't expose the truth, let the user correct
  it once rather than show something wrong forever. See "Reel/Short vs. regular post/video badge"
  above for the two rounds of real-world correction that led here.

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
- **Per-video subscriber data uses a second Google API and scope**, added after the fact:
  `yt-analytics.readonly` alongside the original `youtube.readonly`, requested together in
  `youtube-oauth-start`. `platform_connections.granted_scopes` (server-only) stores exactly what
  Google granted for a given connection, so `sync-performance` knows whether to bother calling
  `youtubeanalytics.googleapis.com` at all - it's a genuinely separate API from the Data API v3
  used for everything else, gated on a scope most existing connections won't have without
  reconnecting (see "Adding per-video subscriber data" above).
- **Instagram uses direct Instagram Login, not Facebook Login.** Since itswillonez is a Creator
  account, the lighter "Instagram API with Instagram Login" path applies - no linked Facebook Page
  needed, unlike the older Facebook-Login-mediated flow. That meant no new migration for the
  Instagram half at all: `platform`/`source` already accepted `'instagram'`/`'instagram_api'`
  from the moment the schema was designed in step 4.
- **Instagram's token model is genuinely different from YouTube's**, not just a different URL:
  no separate `refresh_token` - the long-lived `access_token` itself is self-refreshed via
  `ig_refresh_token`, and only works if the token is at least 24h old and not yet expired.
  `ensureFreshInstagramToken` refreshes at a 7-day-before-expiry buffer (tokens last ~60 days) to
  clear that minimum comfortably. `platform_connections.refresh_token` stays `null` for every
  Instagram row - that's expected, not a bug.
- **`sync-performance` dispatches by platform** rather than being YouTube-specific - one function,
  one cron schedule, both platforms. `INSTAGRAM_MAX_MEDIA = 100` per run is a hard necessity, not
  a style choice like YouTube's 2,000 cap: Instagram's rate limit is 200 calls/hour per account,
  and fetching reach costs one call per post on top of the media-list pages, so a run has to stay
  well under that ceiling.
- **Instagram's full history is now pulled too, just not in one run.** YouTube's entire history
  fits comfortably under its quota in a single sync (confirmed against a real 174-video channel);
  Instagram genuinely can't do the same under a 200-calls/hour ceiling once an account has more
  than ~100 posts. `platform_connections.instagram_backfill_cursor`/`instagram_backfill_complete`
  (migration `0014_instagram_backfill.sql`) make the sync resumable: each 6-hour run either
  continues a one-time backfill from an Instagram-provided pagination cursor (extracted from
  `paging.cursors.after` rather than storing the raw `next` URL, so a resumed cursor survives the
  access token being rotated in between), or, once that backfill has reached the real end of the
  account's history, switches to steady-state mode - just the newest page, to catch new posts and
  refresh recent stats. Older posts' reach numbers are effectively frozen after Instagram's own
  measurement window closes, so re-walking the whole history forever after backfill would just
  burn rate-limit budget for no new information. `platform_connection_status
  .instagram_backfill_complete` mirrors the flag to the client so the Track tab can say "still
  catching up on your full history" instead of quietly looking done while it's still in progress.
- **Views/reach fetching is deliberately best-effort per post** - Instagram's insights metric
  names have shifted across API versions and differ by media type, so one post's insights call
  failing doesn't fail the sync; it leaves that post's views at 0 with the specific error surfaced
  in `upsertErrors`, the same diagnostic pattern that caught YouTube's `ON CONFLICT` and 15-video
  issues early rather than failing silently.
- **The Track tab's platform buttons had a real bug**: they were only ever the manual-entry
  form's "log against which platform" selector, but visually looked like tabs - clicking Instagram
  or TikTok never touched what the chart or entries list displayed, both of which always showed
  every platform unfiltered. Fixed by splitting the single conflated `platform` state into
  `logPlatform` (the form's target) and `viewFilter` (a real All/TikTok/Instagram/YouTube display
  filter, new).
- **`platform_connection_status.follower_count`** is a deliberately separate concept from
  `performance_entries.follows_gained`: an account-level current total (YouTube `subscriberCount`,
  Instagram `followers_count`), not per-post attribution - neither platform's API attributes new
  followers to a specific post at all, so `follows_gained` stays `0` on every synced row by
  design, not by bug. Populated both immediately on connect (in the OAuth callbacks) and on every
  scheduled sync, so it doesn't sit null for up to 6 hours after connecting.

## How the launch email is wired

Not part of the GRIND app's own feature spec - a separate operational tool for the pre-launch
waitlist, built the same way as everything server-side so far (Edge Function + shared secret,
manually triggered, no schedule).

- **`email_sends`** tracks `(recipient_email, campaign)` pairs already sent, decoupled from
  `waitlist_signups` on purpose: the sending address is meant to be reused for future
  newsletters/promos, so a future campaign just needs its own campaign string, not a new column or
  migration. Same server-only RLS pattern as `platform_connections` - zero client policies.
- **`_shared/resend.ts`** wraps Resend's batch send endpoint (100 emails/request, each fully
  separate - no recipient ever sees another's address) and is intentionally generic, not
  launch-specific, so it's ready to reuse for whatever comes next on this address.
- **`send-launch-email`** is launch-specific: the copy, the recipient source (`waitlist_signups`
  minus whatever's already in `email_sends` for `campaign: 'launch'`), and two safety modes
  (`dryRun` - list who'd receive it without sending; `testEmail` - one real send to a single
  address, bypassing the waitlist and the tracking table entirely) for checking the template
  before committing to the real list.
- **Idempotent by construction, not by locking**: re-running the trigger (on purpose or by
  accident) only ever sends to addresses not yet recorded as sent, so a partial failure is safe to
  retry and a duplicate trigger doesn't double-email anyone. It does *not* guard against two
  genuinely concurrent triggers racing each other before either has recorded anything - a
  deliberate tradeoff for a manually-run, one-operator action, not worth a distributed lock.
- **Unsubscribe is a reply-to-opt-out line in the footer**, not a self-service flow - proportionate
  for a single one-time launch email. Revisit if this becomes a recurring newsletter.

## How the automatic welcome email is wired

- **A database trigger, not a client-side call** - the landing page that inserts into
  `waitlist_signups` is a separate codebase this project has no access to, so a trigger is the
  only mechanism available here that fires reliably regardless of what does the inserting.
  `notify_waitlist_signup()` (in `0007_welcome_email_trigger.sql`) runs `after insert`, calling
  `send-welcome-email` via `pg_net` - the same fire-and-forget async HTTP mechanism the cron job
  already uses, so it can't slow down or fail someone's actual signup.
- **`security definer`**, same pattern as `handle_new_user` in `0001_profiles.sql`: the trigger
  needs to call `net.http_post` and read `vault.decrypted_secrets` regardless of which role
  performs the insert - likely `anon`, from the landing page's public signup form, which may not
  have its own grants on either.
- **`WELCOME_EMAIL_SECRET` is its own credential**, separate from `CRON_SHARED_SECRET` and
  `LAUNCH_EMAIL_SECRET` - same narrow-blast-radius reasoning as everywhere else: each secret can
  only trigger the one thing it's for.
- **`email_sends` with `campaign: 'welcome'`** guards against `send-welcome-email` ever firing
  twice for the same address - belt-and-suspenders, since `waitlist_signups.email`'s own unique
  constraint already means the trigger can't naturally fire twice for one address, and a standard
  `after insert` trigger only fires once per row regardless.
- **Reuses `_shared/resend.ts` and `MAIL_FROM_ADDRESS`** from the launch email - exactly the
  "generic sending helper, launch-specific logic separate" split that address-reuse comment
  predicted would pay off.
