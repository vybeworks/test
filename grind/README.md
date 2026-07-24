# GRIND

Independent-artist planning, tracking, and consistency app. PWA frontend (Vite + React +
TypeScript) backed by Supabase (Postgres + Auth).

Build status: **Step 1 — accounts + database.** Sign up, log in (email/password or Google),
and a per-user `profiles` row created automatically on signup. Nothing past this is wired up
yet on purpose — later steps (Weekly Rhythm, streaks, performance tracking, etc.) land in that
order per the product spec.

## Setup

1. **Create a Supabase project** at [supabase.com](https://supabase.com/dashboard).
2. **Apply the schema.** In the Supabase dashboard's SQL editor, run the contents of
   `supabase/migrations/0001_profiles.sql`. (Or, if you have the Supabase CLI installed and
   linked to your project: `supabase link --project-ref <your-ref>` then `supabase db push`.)
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
