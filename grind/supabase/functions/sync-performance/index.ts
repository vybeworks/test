import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";

type AdminClient = ReturnType<typeof supabaseAdmin>;

interface Connection {
  user_id: string;
  platform: string;
  access_token: string;
  refresh_token: string | null;
  token_expires_at: string | null;
}

async function ensureFreshToken(admin: AdminClient, conn: Connection): Promise<string> {
  const expiresAt = conn.token_expires_at ? new Date(conn.token_expires_at).getTime() : 0;
  if (Date.now() < expiresAt - 60_000) return conn.access_token;

  if (!conn.refresh_token) throw new Error("no refresh token on file - user must reconnect");

  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: Deno.env.get("GOOGLE_CLIENT_ID")!,
      client_secret: Deno.env.get("GOOGLE_CLIENT_SECRET")!,
      refresh_token: conn.refresh_token,
      grant_type: "refresh_token",
    }),
  });
  if (!resp.ok) throw new Error(`token refresh failed: ${await resp.text()}`);
  const json = await resp.json();

  const newExpiresAt = new Date(Date.now() + json.expires_in * 1000).toISOString();
  await admin
    .from("platform_connections")
    .update({ access_token: json.access_token, token_expires_at: newExpiresAt })
    .eq("user_id", conn.user_id)
    .eq("platform", "youtube");

  return json.access_token;
}

// YouTube's playlistItems/videos endpoints cap out at 50 items per request.
// This syncs the most recent 50 uploads (across videos and Shorts alike -
// they're both regular entries in the same uploads playlist) per run, not
// the full channel history: a recurring 6-hour sync only needs to stay
// current, and pulling a channel's entire back catalog on every run would
// mean unbounded pagination and needless API quota use for no real benefit
// to a "recent trend" tool. totalChannelVideos is returned so it's visible
// when a channel has more than fits in one page, rather than silently
// looking like a cutoff bug.
const MAX_VIDEOS_PER_SYNC = 50;

interface SyncResult {
  channelTitle: string | null;
  totalChannelVideos: number | null;
  videosFound: number;
  synced: number;
  upsertErrors: string[];
}

async function syncYoutubeChannel(admin: AdminClient, userId: string, accessToken: string): Promise<SyncResult> {
  const headers = { Authorization: `Bearer ${accessToken}` };

  const channelResp = await fetch(
    "https://www.googleapis.com/youtube/v3/channels?part=snippet,contentDetails,statistics&mine=true",
    { headers }
  );
  if (!channelResp.ok) throw new Error(`channels.list failed: ${await channelResp.text()}`);
  const channelJson = await channelResp.json();
  const channel = channelJson.items?.[0];
  const channelTitle: string | null = channel?.snippet?.title ?? null;
  const totalChannelVideos: number | null =
    channel?.statistics?.videoCount !== undefined ? Number(channel.statistics.videoCount) : null;
  const uploadsPlaylistId = channel?.contentDetails?.relatedPlaylists?.uploads;
  if (!uploadsPlaylistId) throw new Error(`no uploads playlist found (channel: ${channelTitle ?? "none returned"})`);

  const playlistResp = await fetch(
    `https://www.googleapis.com/youtube/v3/playlistItems?part=contentDetails&maxResults=${MAX_VIDEOS_PER_SYNC}&playlistId=${uploadsPlaylistId}`,
    { headers }
  );
  if (!playlistResp.ok) throw new Error(`playlistItems.list failed: ${await playlistResp.text()}`);
  const playlistJson = await playlistResp.json();
  const videoIds: string[] = (playlistJson.items ?? []).map((item: any) => item.contentDetails.videoId);
  if (videoIds.length === 0) {
    return { channelTitle, totalChannelVideos, videosFound: 0, synced: 0, upsertErrors: [] };
  }

  const statsResp = await fetch(
    `https://www.googleapis.com/youtube/v3/videos?part=statistics,snippet&id=${videoIds.join(",")}`,
    { headers }
  );
  if (!statsResp.ok) throw new Error(`videos.list failed: ${await statsResp.text()}`);
  const statsJson = await statsResp.json();

  let synced = 0;
  const upsertErrors: string[] = [];
  for (const video of statsJson.items ?? []) {
    const stats = video.statistics ?? {};
    const { error } = await admin.from("performance_entries").upsert(
      {
        user_id: userId,
        platform: "youtube",
        external_post_id: video.id,
        post_date: (video.snippet?.publishedAt ?? new Date().toISOString()).slice(0, 10),
        content_type: null,
        views: Number(stats.viewCount ?? 0),
        likes: Number(stats.likeCount ?? 0),
        comments: Number(stats.commentCount ?? 0),
        follows_gained: 0,
        note: video.snippet?.title ?? null,
        source: "youtube_api",
      },
      { onConflict: "user_id,platform,external_post_id" }
    );
    if (!error) synced++;
    else {
      console.error(`sync-performance: upsert failed for video ${video.id}:`, error.message);
      upsertErrors.push(`${video.id}: ${error.message}`);
    }
  }
  return { channelTitle, totalChannelVideos, videosFound: videoIds.length, synced, upsertErrors };
}

Deno.serve(async (req) => {
  const expected = `Bearer ${Deno.env.get("CRON_SHARED_SECRET")}`;
  if (req.headers.get("Authorization") !== expected) {
    return new Response("Unauthorized", { status: 401 });
  }

  const admin = supabaseAdmin();
  const { data: connections, error } = await admin
    .from("platform_connections")
    .select("user_id, platform, access_token, refresh_token, token_expires_at")
    .eq("platform", "youtube");

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const results = [];
  for (const conn of connections ?? []) {
    try {
      const accessToken = await ensureFreshToken(admin, conn as Connection);
      const result = await syncYoutubeChannel(admin, conn.user_id, accessToken);
      await admin.from("platform_connection_status").upsert(
        { user_id: conn.user_id, platform: "youtube", last_synced_at: new Date().toISOString(), last_sync_error: null },
        { onConflict: "user_id,platform" }
      );
      results.push({ user_id: conn.user_id, ...result });
    } catch (e) {
      console.error(`sync-performance: failed for user ${conn.user_id}:`, e);
      await admin.from("platform_connection_status").upsert(
        { user_id: conn.user_id, platform: "youtube", last_sync_error: String(e) },
        { onConflict: "user_id,platform" }
      );
      results.push({ user_id: conn.user_id, error: String(e) });
    }
  }

  return new Response(JSON.stringify({ results }), { headers: { "Content-Type": "application/json" } });
});
