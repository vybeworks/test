import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { verifyState } from "../_shared/state.ts";

function redirectToApp(status: "connected" | "error", detail?: string): Response {
  const base = Deno.env.get("FRONTEND_URL") ?? "http://localhost:5173";
  const url = new URL(base);
  if (status === "connected") url.searchParams.set("connected", "youtube");
  else url.searchParams.set("error", detail ?? "youtube_connect_failed");
  return new Response(null, { status: 302, headers: { Location: url.toString() } });
}

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const googleError = url.searchParams.get("error");

    if (googleError) {
      console.error("youtube-oauth-callback: Google returned an error:", googleError);
      return redirectToApp("error", "youtube_consent_denied");
    }
    if (!code || !state) return redirectToApp("error", "youtube_missing_params");

    const userId = await verifyState(state);
    if (!userId) return redirectToApp("error", "youtube_invalid_state");

    const redirectUri = `${Deno.env.get("SUPABASE_URL")}/functions/v1/youtube-oauth-callback`;

    const tokenResp = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: Deno.env.get("GOOGLE_CLIENT_ID")!,
        client_secret: Deno.env.get("GOOGLE_CLIENT_SECRET")!,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });
    if (!tokenResp.ok) {
      console.error("youtube-oauth-callback: token exchange failed:", await tokenResp.text());
      return redirectToApp("error", "youtube_token_exchange_failed");
    }
    const tokenJson = await tokenResp.json();

    const channelResp = await fetch("https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&mine=true", {
      headers: { Authorization: `Bearer ${tokenJson.access_token}` },
    });
    if (!channelResp.ok) {
      console.error("youtube-oauth-callback: channel lookup failed:", await channelResp.text());
      return redirectToApp("error", "youtube_channel_lookup_failed");
    }
    const channelJson = await channelResp.json();
    const channel = channelJson.items?.[0];
    if (!channel) return redirectToApp("error", "youtube_no_channel");

    // Populate the follower/subscriber count immediately on connect, rather
    // than leaving it null until the next scheduled sync (up to 6h away).
    const subscriberCount: number | null =
      channel.statistics?.hiddenSubscriberCount || channel.statistics?.subscriberCount === undefined
        ? null
        : Number(channel.statistics.subscriberCount);

    // Google returns the space-separated scopes actually granted for this
    // token - not necessarily every scope requested, if the user is on a
    // reconnect flow and Google short-circuits already-granted ones
    // differently, or in case of any future partial-consent UI.
    const grantedScopes: string | null = tokenJson.scope ?? null;
    const hasAnalyticsScope = Boolean(grantedScopes?.includes("yt-analytics.readonly"));

    const admin = supabaseAdmin();
    const tokenExpiresAt = new Date(Date.now() + tokenJson.expires_in * 1000).toISOString();

    // Preserve the existing refresh_token if Google didn't issue a new one
    // (it only always returns one because we pass prompt=consent, but this
    // guards against that ever changing upstream).
    let refreshToken: string | undefined = tokenJson.refresh_token;
    if (!refreshToken) {
      const { data: existing } = await admin
        .from("platform_connections")
        .select("refresh_token")
        .eq("user_id", userId)
        .eq("platform", "youtube")
        .maybeSingle();
      refreshToken = existing?.refresh_token ?? undefined;
    }

    await admin.from("platform_connections").upsert(
      {
        user_id: userId,
        platform: "youtube",
        access_token: tokenJson.access_token,
        refresh_token: refreshToken ?? null,
        token_expires_at: tokenExpiresAt,
        external_account_id: channel.id,
        external_account_label: channel.snippet?.title ?? null,
        connected_at: new Date().toISOString(),
        granted_scopes: grantedScopes,
      },
      { onConflict: "user_id,platform" }
    );

    await admin.from("platform_connection_status").upsert(
      {
        user_id: userId,
        platform: "youtube",
        external_account_label: channel.snippet?.title ?? null,
        follower_count: subscriberCount,
        connected_at: new Date().toISOString(),
        last_synced_at: null,
        last_sync_error: null,
        has_analytics_scope: hasAnalyticsScope,
      },
      { onConflict: "user_id,platform" }
    );

    return redirectToApp("connected");
  } catch (e) {
    console.error("youtube-oauth-callback error:", e);
    return redirectToApp("error", "youtube_connect_failed");
  }
});
