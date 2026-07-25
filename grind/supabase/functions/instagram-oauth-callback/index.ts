import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { verifyState } from "../_shared/state.ts";

function redirectToApp(status: "connected" | "error", detail?: string): Response {
  const base = Deno.env.get("FRONTEND_URL") ?? "http://localhost:5173";
  const url = new URL(base);
  if (status === "connected") url.searchParams.set("connected", "instagram");
  else url.searchParams.set("error", detail ?? "instagram_connect_failed");
  return new Response(null, { status: 302, headers: { Location: url.toString() } });
}

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const igError = url.searchParams.get("error");

    if (igError) {
      console.error("instagram-oauth-callback: Instagram returned an error:", igError, url.searchParams.get("error_description"));
      return redirectToApp("error", "instagram_consent_denied");
    }
    if (!code || !state) return redirectToApp("error", "instagram_missing_params");

    const userId = await verifyState(state);
    if (!userId) return redirectToApp("error", "instagram_invalid_state");

    const redirectUri = `${Deno.env.get("SUPABASE_URL")}/functions/v1/instagram-oauth-callback`;

    // Step 1: code -> short-lived token (~1 hour). Form-encoded, not JSON.
    const shortTokenResp = await fetch("https://api.instagram.com/oauth/access_token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: Deno.env.get("INSTAGRAM_APP_ID")!,
        client_secret: Deno.env.get("INSTAGRAM_APP_SECRET")!,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
        code,
      }),
    });
    if (!shortTokenResp.ok) {
      console.error("instagram-oauth-callback: short-lived token exchange failed:", await shortTokenResp.text());
      return redirectToApp("error", "instagram_token_exchange_failed");
    }
    const shortTokenJson = await shortTokenResp.json();

    // Step 2: short-lived -> long-lived token (~60 days). Instagram has no
    // separate refresh_token concept - the long-lived access_token is
    // self-refreshed later (see ensureFreshInstagramToken in sync-performance).
    const longTokenUrl = new URL("https://graph.instagram.com/access_token");
    longTokenUrl.searchParams.set("grant_type", "ig_exchange_token");
    longTokenUrl.searchParams.set("client_secret", Deno.env.get("INSTAGRAM_APP_SECRET")!);
    longTokenUrl.searchParams.set("access_token", shortTokenJson.access_token);
    const longTokenResp = await fetch(longTokenUrl.toString());
    if (!longTokenResp.ok) {
      console.error("instagram-oauth-callback: long-lived token exchange failed:", await longTokenResp.text());
      return redirectToApp("error", "instagram_long_token_exchange_failed");
    }
    const longTokenJson = await longTokenResp.json();

    const meResp = await fetch(
      `https://graph.instagram.com/me?fields=id,username&access_token=${longTokenJson.access_token}`
    );
    if (!meResp.ok) {
      console.error("instagram-oauth-callback: account lookup failed:", await meResp.text());
      return redirectToApp("error", "instagram_account_lookup_failed");
    }
    const me = await meResp.json();

    const admin = supabaseAdmin();
    const tokenExpiresAt = new Date(Date.now() + longTokenJson.expires_in * 1000).toISOString();

    await admin.from("platform_connections").upsert(
      {
        user_id: userId,
        platform: "instagram",
        access_token: longTokenJson.access_token,
        refresh_token: null,
        token_expires_at: tokenExpiresAt,
        external_account_id: me.id,
        external_account_label: me.username ?? null,
        connected_at: new Date().toISOString(),
      },
      { onConflict: "user_id,platform" }
    );

    await admin.from("platform_connection_status").upsert(
      {
        user_id: userId,
        platform: "instagram",
        external_account_label: me.username ?? null,
        connected_at: new Date().toISOString(),
        last_synced_at: null,
        last_sync_error: null,
      },
      { onConflict: "user_id,platform" }
    );

    return redirectToApp("connected");
  } catch (e) {
    console.error("instagram-oauth-callback error:", e);
    return redirectToApp("error", "instagram_connect_failed");
  }
});
