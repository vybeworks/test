import { corsHeaders } from "../_shared/cors.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { signState } from "../_shared/state.ts";

// yt-analytics.readonly is what unlocks per-video subscriber gain/loss via
// the separate YouTube Analytics API - requesting it here means every
// connect (new or reconnect) grants both in one consent screen.
const YOUTUBE_SCOPE =
  "https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/yt-analytics.readonly";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const jwt = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    if (!jwt) return json({ error: "Not authenticated" }, 401);

    const admin = supabaseAdmin();
    const { data, error } = await admin.auth.getUser(jwt);
    if (error || !data.user) return json({ error: "Not authenticated" }, 401);

    const state = await signState(data.user.id);
    const redirectUri = `${Deno.env.get("SUPABASE_URL")}/functions/v1/youtube-oauth-callback`;

    const params = new URLSearchParams({
      client_id: Deno.env.get("GOOGLE_CLIENT_ID")!,
      redirect_uri: redirectUri,
      response_type: "code",
      access_type: "offline",
      prompt: "consent",
      scope: YOUTUBE_SCOPE,
      state,
    });

    return json({ url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}` });
  } catch (e) {
    console.error("youtube-oauth-start error:", e);
    return json({ error: "Could not start YouTube connection" }, 500);
  }
});
