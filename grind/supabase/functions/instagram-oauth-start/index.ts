import { corsHeaders } from "../_shared/cors.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { signState } from "../_shared/state.ts";

// instagram_business_manage_messages is NOT requested here - it's not
// needed for pulling post performance, and the "Manage messaging & content
// on Instagram" use case adds it by default alongside instagram_business_basic.
// instagram_business_manage_insights (the one we actually need for post
// metrics) has to be added separately in the app dashboard's use case
// permissions - the scope request below doesn't grant it by itself.
const INSTAGRAM_SCOPE = "instagram_business_basic,instagram_business_manage_insights";

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
    const redirectUri = `${Deno.env.get("SUPABASE_URL")}/functions/v1/instagram-oauth-callback`;

    const params = new URLSearchParams({
      client_id: Deno.env.get("INSTAGRAM_APP_ID")!,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: INSTAGRAM_SCOPE,
      state,
    });

    return json({ url: `https://api.instagram.com/oauth/authorize?${params.toString()}` });
  } catch (e) {
    console.error("instagram-oauth-start error:", e);
    return json({ error: "Could not start Instagram connection" }, 500);
  }
});
