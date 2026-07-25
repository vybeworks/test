import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";

type AdminClient = ReturnType<typeof supabaseAdmin>;

interface Connection {
  user_id: string;
  platform: string;
  access_token: string;
  refresh_token: string | null;
  token_expires_at: string | null;
}

async function ensureFreshYoutubeToken(admin: AdminClient, conn: Connection): Promise<string> {
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

// Instagram has no separate refresh_token concept - the long-lived
// access_token itself is self-refreshed via ig_refresh_token, and only
// works if the token is at least 24h old and not yet expired. Refreshing at
// a 7-day-before-expiry buffer (tokens last ~60 days, this runs every 6h)
// comfortably satisfies that minimum age with huge margin.
async function ensureFreshInstagramToken(admin: AdminClient, conn: Connection): Promise<string> {
  const expiresAt = conn.token_expires_at ? new Date(conn.token_expires_at).getTime() : 0;
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  if (Date.now() < expiresAt - sevenDaysMs) return conn.access_token;

  const url = new URL("https://graph.instagram.com/refresh_access_token");
  url.searchParams.set("grant_type", "ig_refresh_token");
  url.searchParams.set("access_token", conn.access_token);
  const resp = await fetch(url.toString());
  if (!resp.ok) throw new Error(`Instagram token refresh failed: ${await resp.text()}`);
  const json = await resp.json();

  const newExpiresAt = new Date(Date.now() + json.expires_in * 1000).toISOString();
  await admin
    .from("platform_connections")
    .update({ access_token: json.access_token, token_expires_at: newExpiresAt })
    .eq("user_id", conn.user_id)
    .eq("platform", "instagram");

  return json.access_token;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// --- YouTube ---
// playlistItems/videos endpoints cap out at 50 items per request, so pulling
// a whole history means paging through with pageToken. Re-syncing every
// video on every run (not just new ones) is deliberate, not wasteful: older
// videos' view/like/comment counts keep changing too, the upsert is
// idempotent, and the API quota cost even for a few hundred videos (a couple
// units per page) is trivial against the 10,000/day default. MAX_PAGES is a
// safety bound against a pathological runaway, not an expected limit - it's
// returned as `truncated` if ever actually hit.
const YT_PAGE_SIZE = 50;
const YT_MAX_PAGES = 40; // up to 2,000 videos per sync

interface YoutubeSyncResult {
  channelTitle: string | null;
  totalChannelVideos: number | null;
  videosFound: number;
  synced: number;
  upsertErrors: string[];
  truncated: boolean;
}

async function fetchAllUploadVideoIds(
  uploadsPlaylistId: string,
  headers: Record<string, string>
): Promise<{ videoIds: string[]; truncated: boolean }> {
  const videoIds: string[] = [];
  let pageToken: string | undefined;
  let pages = 0;

  do {
    const url = new URL("https://www.googleapis.com/youtube/v3/playlistItems");
    url.searchParams.set("part", "contentDetails");
    url.searchParams.set("maxResults", String(YT_PAGE_SIZE));
    url.searchParams.set("playlistId", uploadsPlaylistId);
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const resp = await fetch(url.toString(), { headers });
    if (!resp.ok) throw new Error(`playlistItems.list failed: ${await resp.text()}`);
    const json = await resp.json();
    videoIds.push(...(json.items ?? []).map((item: any) => item.contentDetails.videoId));
    pageToken = json.nextPageToken;
    pages++;
  } while (pageToken && pages < YT_MAX_PAGES);

  return { videoIds, truncated: Boolean(pageToken) };
}

async function syncYoutubeChannel(admin: AdminClient, userId: string, accessToken: string): Promise<YoutubeSyncResult> {
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

  const { videoIds, truncated } = await fetchAllUploadVideoIds(uploadsPlaylistId, headers);
  if (videoIds.length === 0) {
    return { channelTitle, totalChannelVideos, videosFound: 0, synced: 0, upsertErrors: [], truncated };
  }

  let synced = 0;
  const upsertErrors: string[] = [];

  for (const idBatch of chunk(videoIds, YT_PAGE_SIZE)) {
    const statsResp = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=statistics,snippet&id=${idBatch.join(",")}`,
      { headers }
    );
    if (!statsResp.ok) throw new Error(`videos.list failed: ${await statsResp.text()}`);
    const statsJson = await statsResp.json();

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
  }

  return { channelTitle, totalChannelVideos, videosFound: videoIds.length, synced, upsertErrors, truncated };
}

// --- Instagram ---
// Instagram's rate limit is a hard 200 calls/hour per account (much tighter
// than YouTube's 10,000/day quota), and fetching per-post reach costs one
// call per post on top of the media-list pages. INSTAGRAM_MAX_MEDIA=100
// keeps a single run comfortably under that ceiling even with room for other
// activity in the same hour - not a design goal, a rate-limit necessity.
const INSTAGRAM_PAGE_SIZE = 50;
const INSTAGRAM_MAX_MEDIA = 100;

interface InstagramSyncResult {
  username: string | null;
  mediaFound: number;
  synced: number;
  upsertErrors: string[];
  truncated: boolean;
}

async function fetchInstagramMedia(accessToken: string): Promise<{ items: any[]; truncated: boolean }> {
  const items: any[] = [];
  let nextUrl: string | null =
    `https://graph.instagram.com/me/media?fields=id,caption,media_type,media_product_type,timestamp,like_count,comments_count&limit=${INSTAGRAM_PAGE_SIZE}&access_token=${accessToken}`;

  while (nextUrl && items.length < INSTAGRAM_MAX_MEDIA) {
    const resp = await fetch(nextUrl);
    if (!resp.ok) throw new Error(`media list failed: ${await resp.text()}`);
    const json = await resp.json();
    items.push(...(json.data ?? []));
    nextUrl = json.paging?.next ?? null;
  }

  const truncated = items.length > INSTAGRAM_MAX_MEDIA || Boolean(nextUrl);
  return { items: items.slice(0, INSTAGRAM_MAX_MEDIA), truncated };
}

// Best-effort: Instagram's insights metric names have shifted across API
// versions and differ by media type (reach/impressions/views), so a failure
// here doesn't fail the whole sync - it just leaves views at 0 for that one
// post, with the specific error visible in upsertErrors for follow-up.
async function fetchMediaReach(mediaId: string, accessToken: string): Promise<{ views: number | null; error: string | null }> {
  const resp = await fetch(`https://graph.instagram.com/${mediaId}/insights?metric=reach&access_token=${accessToken}`);
  if (!resp.ok) return { views: null, error: await resp.text() };
  const json = await resp.json();
  const value = json.data?.[0]?.values?.[0]?.value;
  return { views: typeof value === "number" ? value : null, error: null };
}

async function syncInstagramAccount(admin: AdminClient, userId: string, accessToken: string): Promise<InstagramSyncResult> {
  const meResp = await fetch(`https://graph.instagram.com/me?fields=id,username&access_token=${accessToken}`);
  if (!meResp.ok) throw new Error(`account lookup failed: ${await meResp.text()}`);
  const me = await meResp.json();

  const { items, truncated } = await fetchInstagramMedia(accessToken);
  if (items.length === 0) {
    return { username: me.username ?? null, mediaFound: 0, synced: 0, upsertErrors: [], truncated };
  }

  let synced = 0;
  const upsertErrors: string[] = [];

  for (const media of items) {
    const { views, error: reachError } = await fetchMediaReach(media.id, accessToken);
    if (reachError) upsertErrors.push(`${media.id} (reach): ${reachError}`);

    const { error } = await admin.from("performance_entries").upsert(
      {
        user_id: userId,
        platform: "instagram",
        external_post_id: media.id,
        post_date: (media.timestamp ?? new Date().toISOString()).slice(0, 10),
        content_type: null,
        views: views ?? 0,
        likes: Number(media.like_count ?? 0),
        comments: Number(media.comments_count ?? 0),
        follows_gained: 0,
        note: media.caption ? String(media.caption).slice(0, 200) : null,
        source: "instagram_api",
      },
      { onConflict: "user_id,platform,external_post_id" }
    );
    if (!error) synced++;
    else {
      console.error(`sync-performance: upsert failed for media ${media.id}:`, error.message);
      upsertErrors.push(`${media.id}: ${error.message}`);
    }
  }

  return { username: me.username ?? null, mediaFound: items.length, synced, upsertErrors, truncated };
}

Deno.serve(async (req) => {
  const expected = `Bearer ${Deno.env.get("CRON_SHARED_SECRET")}`;
  if (req.headers.get("Authorization") !== expected) {
    return new Response("Unauthorized", { status: 401 });
  }

  const admin = supabaseAdmin();
  const { data: connections, error } = await admin
    .from("platform_connections")
    .select("user_id, platform, access_token, refresh_token, token_expires_at");

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const results = [];
  for (const conn of (connections ?? []) as Connection[]) {
    try {
      let result: YoutubeSyncResult | InstagramSyncResult;
      if (conn.platform === "youtube") {
        const accessToken = await ensureFreshYoutubeToken(admin, conn);
        result = await syncYoutubeChannel(admin, conn.user_id, accessToken);
      } else if (conn.platform === "instagram") {
        const accessToken = await ensureFreshInstagramToken(admin, conn);
        result = await syncInstagramAccount(admin, conn.user_id, accessToken);
      } else {
        continue;
      }

      await admin.from("platform_connection_status").upsert(
        { user_id: conn.user_id, platform: conn.platform, last_synced_at: new Date().toISOString(), last_sync_error: null },
        { onConflict: "user_id,platform" }
      );
      results.push({ user_id: conn.user_id, platform: conn.platform, ...result });
    } catch (e) {
      console.error(`sync-performance: failed for user ${conn.user_id} (${conn.platform}):`, e);
      await admin.from("platform_connection_status").upsert(
        { user_id: conn.user_id, platform: conn.platform, last_sync_error: String(e) },
        { onConflict: "user_id,platform" }
      );
      results.push({ user_id: conn.user_id, platform: conn.platform, error: String(e) });
    }
  }

  return new Response(JSON.stringify({ results }), { headers: { "Content-Type": "application/json" } });
});
