import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";

type AdminClient = ReturnType<typeof supabaseAdmin>;

interface Connection {
  user_id: string;
  platform: string;
  access_token: string;
  refresh_token: string | null;
  token_expires_at: string | null;
  granted_scopes: string | null;
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

// The Data API has no official "is this a Short" field (confirmed - Google's
// own issue tracker has an open, unresolved request for one). Duration ALONE
// turned out to be a bad heuristic in practice, not just theoretically: a
// real test against a real channel classified 172 of 174 videos as "short"
// because most of that channel's *regular* videos also happen to run under
// 3 minutes - duration overlaps between genuine Shorts and normal short
// videos far more than expected. Aspect ratio is the actual distinguishing
// signal (Shorts are vertical, 9:16; regular videos are horizontal, 16:9),
// available via fileDetails.videoStreams - owner-only data, but that's what
// we are here. Duration is now only the tiebreaker when aspect ratio can't
// be determined (fileDetails isn't guaranteed available for every video).
const SHORTS_MAX_SECONDS = 180;

function parseIso8601DurationSeconds(duration: string | undefined): number | null {
  if (!duration) return null;
  const match = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(duration);
  if (!match) return null;
  const [, h, m, s] = match;
  return (Number(h ?? 0) * 3600) + (Number(m ?? 0) * 60) + Number(s ?? 0);
}

// `hadAspectRatioData` is a diagnostic, not just an implementation detail -
// the only way to tell, from the sync response, whether fileDetails is
// actually coming back from the API for this channel's videos at all,
// rather than silently falling back to the duration-only guess for
// everything and looking identical to the old, worse heuristic.
function classifyYoutubeFormat(video: any): { format: "short" | "video" | null; hadAspectRatioData: boolean } {
  const durationSeconds = parseIso8601DurationSeconds(video.contentDetails?.duration);
  if (durationSeconds === null) return { format: null, hadAspectRatioData: false };
  if (durationSeconds > SHORTS_MAX_SECONDS) {
    return { format: "video", hadAspectRatioData: false }; // too long to be a Short regardless of shape
  }

  const stream = video.fileDetails?.videoStreams?.[0];
  if (stream?.heightPixels && stream?.widthPixels) {
    return { format: stream.heightPixels > stream.widthPixels ? "short" : "video", hadAspectRatioData: true };
  }
  return { format: "short", hadAspectRatioData: false }; // no aspect-ratio data available - fall back to duration
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
  subscriberCount: number | null;
  videosFound: number;
  synced: number;
  upsertErrors: string[];
  truncated: boolean;
  analyticsScopeGranted: boolean;
  videosWithSubscriberData: number;
  videosWithAspectRatioData: number;
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

// Per-video subscriber gain/loss lives only in the separate YouTube Analytics
// API (youtubeanalytics.googleapis.com), not the Data API v3 used everywhere
// else here - it requires the yt-analytics.readonly scope, which older
// connections won't have (see hasAnalyticsScope in syncYoutubeChannel).
// Best-effort per chunk: a failed chunk just leaves those videos without
// subscriber data rather than failing the whole sync, same pattern as
// Instagram's fetchMediaReach.
const YT_ANALYTICS_CHUNK_SIZE = 50;

async function fetchVideoSubscriberDeltas(
  videoIds: string[],
  headers: Record<string, string>,
  upsertErrors: string[]
): Promise<Map<string, number>> {
  const deltas = new Map<string, number>();
  const today = new Date().toISOString().slice(0, 10);

  for (const idChunk of chunk(videoIds, YT_ANALYTICS_CHUNK_SIZE)) {
    const params = new URLSearchParams({
      ids: "channel==MINE",
      startDate: "2005-02-14", // before YouTube existed - safe lower bound for a channel's full lifetime
      endDate: today,
      metrics: "subscribersGained,subscribersLost",
      dimensions: "video",
      filters: `video==${idChunk.join(",")}`,
      maxResults: String(YT_ANALYTICS_CHUNK_SIZE),
    });
    const resp = await fetch(`https://youtubeanalytics.googleapis.com/v2/reports?${params.toString()}`, { headers });
    if (!resp.ok) {
      const text = await resp.text();
      console.error("sync-performance: YouTube Analytics fetch failed for a chunk:", text);
      upsertErrors.push(`analytics chunk (${idChunk.length} videos): ${text}`);
      continue;
    }
    const json = await resp.json();
    for (const row of (json.rows ?? []) as [string, number, number][]) {
      const [videoId, gained, lost] = row;
      deltas.set(videoId, Number(gained ?? 0) - Number(lost ?? 0));
    }
  }

  return deltas;
}

async function syncYoutubeChannel(
  admin: AdminClient,
  userId: string,
  accessToken: string,
  hasAnalyticsScope: boolean
): Promise<YoutubeSyncResult> {
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
  // Null (not 0) if the channel has hidden its subscriber count -
  // channel.statistics.hiddenSubscriberCount is true in that case.
  const subscriberCount: number | null =
    channel?.statistics?.hiddenSubscriberCount || channel?.statistics?.subscriberCount === undefined
      ? null
      : Number(channel.statistics.subscriberCount);
  const uploadsPlaylistId = channel?.contentDetails?.relatedPlaylists?.uploads;
  if (!uploadsPlaylistId) throw new Error(`no uploads playlist found (channel: ${channelTitle ?? "none returned"})`);

  const { videoIds, truncated } = await fetchAllUploadVideoIds(uploadsPlaylistId, headers);
  if (videoIds.length === 0) {
    return {
      channelTitle,
      totalChannelVideos,
      subscriberCount,
      videosFound: 0,
      synced: 0,
      upsertErrors: [],
      truncated,
      analyticsScopeGranted: hasAnalyticsScope,
      videosWithSubscriberData: 0,
      videosWithAspectRatioData: 0,
    };
  }

  let synced = 0;
  let videosWithAspectRatioData = 0;
  const upsertErrors: string[] = [];
  const subscriberDeltas = hasAnalyticsScope ? await fetchVideoSubscriberDeltas(videoIds, headers, upsertErrors) : new Map<string, number>();

  // A user's manual Short/Video correction (see setContentFormat in the
  // frontend) must survive the next sync, not get silently overwritten by a
  // fresh guess. One query up front rather than a per-video lookup.
  const { data: manualRows } = await admin
    .from("performance_entries")
    .select("external_post_id, content_format")
    .eq("user_id", userId)
    .eq("platform", "youtube")
    .eq("content_format_manual", true);
  const manualFormatOverrides = new Map<string, "reel" | "feed" | "story" | "short" | "video" | null>(
    (manualRows ?? []).map((r: any) => [r.external_post_id, r.content_format])
  );

  for (const idBatch of chunk(videoIds, YT_PAGE_SIZE)) {
    const statsResp = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=statistics,snippet,contentDetails,fileDetails&id=${idBatch.join(",")}`,
      { headers }
    );
    if (!statsResp.ok) throw new Error(`videos.list failed: ${await statsResp.text()}`);
    const statsJson = await statsResp.json();

    for (const video of statsJson.items ?? []) {
      const stats = video.statistics ?? {};
      let contentFormat: "reel" | "feed" | "story" | "short" | "video" | null;
      if (manualFormatOverrides.has(video.id)) {
        contentFormat = manualFormatOverrides.get(video.id)!; // re-writing the same value is a harmless no-op
      } else {
        const classified = classifyYoutubeFormat(video);
        contentFormat = classified.format;
        if (classified.hadAspectRatioData) videosWithAspectRatioData++;
      }
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
          follows_gained: subscriberDeltas.get(video.id) ?? 0,
          note: video.snippet?.title ?? null,
          source: "youtube_api",
          thumbnail_url: video.snippet?.thumbnails?.medium?.url ?? video.snippet?.thumbnails?.default?.url ?? null,
          content_format: contentFormat,
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

  return {
    channelTitle,
    totalChannelVideos,
    subscriberCount,
    videosFound: videoIds.length,
    synced,
    upsertErrors,
    truncated,
    analyticsScopeGranted: hasAnalyticsScope,
    videosWithSubscriberData: subscriberDeltas.size,
    videosWithAspectRatioData,
  };
}

// --- Instagram ---
// Instagram's rate limit is a hard 200 calls/hour per account (much tighter
// than YouTube's 10,000/day quota), and fetching per-post reach costs one
// call per post on top of the media-list pages. INSTAGRAM_MAX_MEDIA=100
// keeps a single run comfortably under that ceiling even with room for other
// activity in the same hour - not a design goal, a rate-limit necessity.
// Unlike YouTube (small enough history to pull in one run, always), a large
// Instagram account's full history genuinely can't fit under this ceiling in
// one run - so this makes the sync resumable: each run either continues a
// one-time backfill from where the last run left off (persisted cursor on
// platform_connections), or, once the backfill has reached the real end of
// the account's history, switches to steady-state mode - just the newest
// page, to catch new posts and refresh recent stats. Older posts' reach
// numbers are effectively frozen after Instagram's own measurement window
// closes, so re-walking the entire history forever after the initial
// backfill would just burn rate-limit budget for no new information.
const INSTAGRAM_PAGE_SIZE = 50;
const INSTAGRAM_MAX_MEDIA = 100;

interface InstagramSyncResult {
  username: string | null;
  followersCount: number | null;
  mediaFound: number;
  synced: number;
  upsertErrors: string[];
  backfillComplete: boolean;
}

async function fetchInstagramMediaPage(
  accessToken: string,
  afterCursor: string | null
): Promise<{ items: any[]; nextCursor: string | null; reachedEnd: boolean }> {
  const items: any[] = [];
  let cursor = afterCursor;
  let reachedEnd = false;

  while (items.length < INSTAGRAM_MAX_MEDIA) {
    const url = new URL("https://graph.instagram.com/me/media");
    url.searchParams.set(
      "fields",
      "id,caption,media_type,media_product_type,timestamp,like_count,comments_count,media_url,thumbnail_url"
    );
    url.searchParams.set("limit", String(INSTAGRAM_PAGE_SIZE));
    url.searchParams.set("access_token", accessToken);
    if (cursor) url.searchParams.set("after", cursor);

    const resp = await fetch(url.toString());
    if (!resp.ok) throw new Error(`media list failed: ${await resp.text()}`);
    const json = await resp.json();
    items.push(...(json.data ?? []));

    if (!json.paging?.next) {
      reachedEnd = true;
      cursor = null;
      break;
    }
    // Extracted rather than storing the raw `next` URL, so a resumed cursor
    // stays valid even after the access token is later rotated (the raw URL
    // bakes in whatever token was current at generation time).
    const afterFromPaging: string | undefined = json.paging?.cursors?.after;
    if (!afterFromPaging) {
      // Meta's docs promise `cursors.after` alongside `next` - if that's ever
      // not true, there's no safe way to resume, so stop rather than risk a
      // stuck or invalid cursor being persisted.
      reachedEnd = true;
      break;
    }
    cursor = afterFromPaging;
  }

  return { items: items.slice(0, INSTAGRAM_MAX_MEDIA), nextCursor: reachedEnd ? null : cursor, reachedEnd };
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
  const meResp = await fetch(
    `https://graph.instagram.com/me?fields=id,username,followers_count&access_token=${accessToken}`
  );
  if (!meResp.ok) throw new Error(`account lookup failed: ${await meResp.text()}`);
  const me = await meResp.json();
  const followersCount: number | null = me.followers_count !== undefined ? Number(me.followers_count) : null;

  const { data: connRow } = await admin
    .from("platform_connections")
    .select("instagram_backfill_cursor, instagram_backfill_complete")
    .eq("user_id", userId)
    .eq("platform", "instagram")
    .maybeSingle();
  const alreadyBackfilled = connRow?.instagram_backfill_complete ?? false;
  // Once the one-time backfill has reached the real end of history, always
  // start from the newest page (cursor null) - that's steady-state mode.
  // Until then, resume from wherever the last run's cursor left off.
  const startCursor = alreadyBackfilled ? null : connRow?.instagram_backfill_cursor ?? null;

  const { items, nextCursor, reachedEnd } = await fetchInstagramMediaPage(accessToken, startCursor);
  const backfillComplete = alreadyBackfilled || reachedEnd;

  if (!alreadyBackfilled) {
    await admin
      .from("platform_connections")
      .update({
        instagram_backfill_cursor: reachedEnd ? null : nextCursor,
        instagram_backfill_complete: reachedEnd,
      })
      .eq("user_id", userId)
      .eq("platform", "instagram");
  }

  if (items.length === 0) {
    return { username: me.username ?? null, followersCount, mediaFound: 0, synced: 0, upsertErrors: [], backfillComplete };
  }

  let synced = 0;
  const upsertErrors: string[] = [];

  for (const media of items) {
    const { views, error: reachError } = await fetchMediaReach(media.id, accessToken);
    if (reachError) upsertErrors.push(`${media.id} (reach): ${reachError}`);

    // `media_url` is a raw video file for VIDEO/reels, not something an <img>
    // tag can render - `thumbnail_url` is the actual cover image for those.
    // For IMAGE/CAROUSEL_ALBUM, `media_url` is already a displayable image.
    const thumbnailUrl: string | null =
      (media.media_type === "VIDEO" ? media.thumbnail_url : media.media_url) ?? null;

    // media_product_type is Instagram's own distinction between a Reel and a
    // regular feed post - already in the fields list above, no extra call.
    const contentFormat: "reel" | "story" | "feed" =
      media.media_product_type === "REELS" ? "reel" : media.media_product_type === "STORY" ? "story" : "feed";

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
        thumbnail_url: thumbnailUrl,
        content_format: contentFormat,
      },
      { onConflict: "user_id,platform,external_post_id" }
    );
    if (!error) synced++;
    else {
      console.error(`sync-performance: upsert failed for media ${media.id}:`, error.message);
      upsertErrors.push(`${media.id}: ${error.message}`);
    }
  }

  return { username: me.username ?? null, followersCount, mediaFound: items.length, synced, upsertErrors, backfillComplete };
}

Deno.serve(async (req) => {
  const expected = `Bearer ${Deno.env.get("CRON_SHARED_SECRET")}`;
  if (req.headers.get("Authorization") !== expected) {
    return new Response("Unauthorized", { status: 401 });
  }

  const admin = supabaseAdmin();
  const { data: connections, error } = await admin
    .from("platform_connections")
    .select("user_id, platform, access_token, refresh_token, token_expires_at, granted_scopes");

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
      let followerCount: number | null;
      let instagramBackfillComplete: boolean | null = null;
      if (conn.platform === "youtube") {
        const accessToken = await ensureFreshYoutubeToken(admin, conn);
        const hasAnalyticsScope = Boolean(conn.granted_scopes?.includes("yt-analytics.readonly"));
        result = await syncYoutubeChannel(admin, conn.user_id, accessToken, hasAnalyticsScope);
        followerCount = result.subscriberCount;
      } else if (conn.platform === "instagram") {
        const accessToken = await ensureFreshInstagramToken(admin, conn);
        result = await syncInstagramAccount(admin, conn.user_id, accessToken);
        followerCount = result.followersCount;
        instagramBackfillComplete = result.backfillComplete;
      } else {
        continue;
      }

      await admin.from("platform_connection_status").upsert(
        {
          user_id: conn.user_id,
          platform: conn.platform,
          follower_count: followerCount,
          last_synced_at: new Date().toISOString(),
          last_sync_error: null,
          ...(conn.platform === "instagram" ? { instagram_backfill_complete: instagramBackfillComplete } : {}),
        },
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
