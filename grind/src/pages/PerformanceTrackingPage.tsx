import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "../auth/AuthProvider";
import { usePerformanceEntries, type PerformanceEntry } from "../data/useReleaseData";
import { connectInstagram, connectYoutube, useConnectionStatus } from "../data/useConnections";
import { PerformanceTrendChart } from "../components/PerformanceTrendChart";
import { PLATFORM_META, type Platform } from "../lib/releaseToolkit";
import { CONTENT_TYPES } from "../lib/rhythm";

function timeAgo(iso: string | null): string {
  if (!iso) return "not yet synced";
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.round(ms / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

const CONNECTABLE_LABEL: Record<string, string> = { youtube: "YouTube", instagram: "Instagram" };

const PLATFORM_NOTE: Record<Platform, string> = {
  tiktok: "TikTok has no small-scale analytics API — manual entry here is permanent, not a placeholder.",
  instagram: "Connect above for automatic sync. Manual entry here is for backfilling or correcting synced data.",
  youtube: "Connect above for automatic sync. Manual entry here is for backfilling or correcting synced data.",
};

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

// YouTube's per-video subscriber gain/loss (via the Analytics API) can be
// net-negative for a video that drove more unsubscribes than subscribes -
// unlike every other platform here, which is always 0 or positive.
function formatFollowsDelta(n: number): string {
  return n < 0 ? `${n.toLocaleString()}` : `+${n.toLocaleString()}`;
}

// YouTube calls them subscribers, not followers - distinct platform
// terminology, same underlying `follows_gained` column.
function followUnitLabel(platform: Platform): string {
  return platform === "youtube" ? "subs" : "follows";
}

const CONTENT_FORMAT_LABEL: Record<NonNullable<PerformanceEntry["content_format"]>, string> = {
  reel: "REEL",
  feed: "POST",
  story: "STORY",
  short: "SHORT",
  video: "VIDEO",
};

function formatDateHeader(dateStr: string): string {
  const today = todayStr();
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  if (dateStr === today) return "Today";
  if (dateStr === yesterday) return "Yesterday";
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** Entries already arrive sorted by post_date descending (see usePerformanceEntries) - this just
 * buckets consecutive same-date entries under one header instead of repeating the date per row. */
function groupByDate(entries: PerformanceEntry[]): { date: string; items: PerformanceEntry[] }[] {
  const groups: { date: string; items: PerformanceEntry[] }[] = [];
  for (const entry of entries) {
    const last = groups[groups.length - 1];
    if (last && last.date === entry.post_date) last.items.push(entry);
    else groups.push({ date: entry.post_date, items: [entry] });
  }
  return groups;
}

export function PerformanceTrackingPage() {
  const { user } = useAuth();
  const { entries, addEntry, removeEntry, setTrialReelTag, setContentFormat, error: entriesError } = usePerformanceEntries(user?.id);
  const { statuses, error: connectionStatusError } = useConnectionStatus(user?.id);

  const [connectMessage, setConnectMessage] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    // useConnectionStatus already fetches fresh on mount, which by definition
    // happens after the OAuth redirect lands back here - no manual refresh needed.
    const params = new URLSearchParams(window.location.search);
    const connected = params.get("connected");
    const error = params.get("error");
    if (connected) {
      setConnectMessage(`${CONNECTABLE_LABEL[connected] ?? connected} connected.`);
    } else if (error) {
      setConnectMessage(`Connection failed (${error}). Try again.`);
    }
    if (connected || error) {
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  const handleConnect = async (connect: () => Promise<string | null>) => {
    setConnecting(true);
    const message = await connect();
    if (message) {
      setConnectMessage(message);
      setConnecting(false);
    }
    // on success this navigates away, so no need to clear `connecting`
  };

  // What a NEW manual entry gets logged against - independent of what's
  // currently displayed below (see viewFilter). Conflating these into one
  // piece of state was the bug: clicking a platform button here looked like
  // it should switch the chart/list too, but it only ever affected the form.
  const [logPlatform, setLogPlatform] = useState<Platform>("tiktok");
  const [viewFilter, setViewFilter] = useState<Platform | "all" | "trial_reels">("all");
  const [postDate, setPostDate] = useState(todayStr());
  const [contentType, setContentType] = useState("");
  const [views, setViews] = useState("");
  const [likes, setLikes] = useState("");
  const [comments, setComments] = useState("");
  const [follows, setFollows] = useState("");
  const [note, setNote] = useState("");
  const [isTrialReel, setIsTrialReel] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const message = await addEntry({
      platform: logPlatform,
      post_date: postDate,
      content_type: contentType || null,
      views: Number(views) || 0,
      likes: Number(likes) || 0,
      comments: Number(comments) || 0,
      follows_gained: Number(follows) || 0,
      note: note.trim() || null,
      is_trial_reel: logPlatform === "instagram" && isTrialReel,
    });
    setBusy(false);
    if (message) {
      setError(message);
      return;
    }
    setViews("");
    setLikes("");
    setComments("");
    setFollows("");
    setNote("");
    setIsTrialReel(false);
  };

  const visibleEntries =
    viewFilter === "all"
      ? entries
      : viewFilter === "trial_reels"
        ? entries.filter((e) => e.is_trial_reel)
        : entries.filter((e) => e.platform === viewFilter);

  return (
    <div style={{ maxWidth: 480, margin: "0 auto", padding: "40px 20px 60px" }}>
      <div style={{ textAlign: "center", fontSize: 13, color: "var(--muted)", marginBottom: 4 }}>Performance Tracking</div>
      <div style={{ textAlign: "center", fontSize: 11, color: "#4b4f5c", marginBottom: 20 }}>
        automatic sync where available, manual everywhere else
      </div>

      <div className="grind-card" style={{ padding: 16, marginBottom: 16 }}>
        <div style={{ fontSize: 12, color: "var(--muted-2)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 10 }}>
          Connections
        </div>

        {connectMessage && <div style={{ fontSize: 12, color: "var(--teal)", marginBottom: 10 }}>{connectMessage}</div>}
        {connectionStatusError && (
          <div style={{ fontSize: 12, color: "var(--rose)", marginBottom: 10 }}>
            Couldn't load connection status: {connectionStatusError}. Your actual connections may still be fine — this is a
            display error, not necessarily a disconnect.
          </div>
        )}

        {(
          [
            { key: "youtube" as const, connect: connectYoutube },
            { key: "instagram" as const, connect: connectInstagram },
          ]
        ).map(({ key, connect }) => (
          <div key={key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0" }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{PLATFORM_META[key].label}</div>
              {statuses[key] ? (
                <div style={{ fontSize: 11, color: "var(--muted-2)" }}>
                  {statuses[key]!.external_account_label ?? "Connected"}
                  {statuses[key]!.follower_count !== null
                    ? ` · ${statuses[key]!.follower_count!.toLocaleString()} ${key === "youtube" ? "subscribers" : "followers"}`
                    : ""}
                  {" · synced "}
                  {timeAgo(statuses[key]!.last_synced_at)}
                  {statuses[key]!.last_sync_error ? " · last sync failed" : ""}
                </div>
              ) : (
                <div style={{ fontSize: 11, color: "var(--muted-2)" }}>Not connected — pulls views/likes/comments automatically</div>
              )}
              {key === "youtube" && statuses[key] && !statuses[key]!.has_analytics_scope && (
                <button
                  onClick={() => handleConnect(connect)}
                  disabled={connecting}
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--teal)",
                    cursor: connecting ? "default" : "pointer",
                    fontSize: 11,
                    padding: 0,
                    marginTop: 4,
                    textDecoration: "underline",
                  }}
                >
                  Grant analytics access for per-video subscriber data
                </button>
              )}
            </div>
            {!statuses[key] && (
              <button
                onClick={() => handleConnect(connect)}
                disabled={connecting}
                style={{
                  background: "var(--ember)",
                  color: "#12141c",
                  border: "none",
                  borderRadius: 8,
                  padding: "8px 14px",
                  fontWeight: 700,
                  fontSize: 12,
                  cursor: connecting ? "default" : "pointer",
                  flexShrink: 0,
                }}
              >
                {connecting ? "..." : "Connect"}
              </button>
            )}
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
        {(["all", "tiktok", "instagram", "youtube", "trial_reels"] as const).map((p) => {
          const active = viewFilter === p;
          const color = p === "all" ? "var(--ember)" : p === "trial_reels" ? "var(--teal)" : PLATFORM_META[p].color;
          return (
            <button
              key={p}
              onClick={() => setViewFilter(p)}
              style={{
                padding: "6px 12px",
                borderRadius: 20,
                border: active ? `1px solid ${color}` : "1px solid var(--border)",
                background: active ? `${color}22` : "var(--surface-2)",
                color: "var(--text)",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {p === "all" ? "All" : p === "trial_reels" ? "Trial Reels" : PLATFORM_META[p].label}
            </button>
          );
        })}
      </div>

      <PerformanceTrendChart entries={visibleEntries} />

      <form onSubmit={submit} className="grind-card" style={{ padding: 16, marginTop: 16 }}>
        <div style={{ fontSize: 11, color: "var(--muted-2)", marginBottom: 8 }}>Log a new entry for:</div>
        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          {(Object.keys(PLATFORM_META) as Platform[]).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setLogPlatform(p)}
              style={{
                flex: 1,
                padding: "8px 0",
                borderRadius: 8,
                border: logPlatform === p ? `1px solid ${PLATFORM_META[p].color}` : "1px solid var(--border)",
                background: logPlatform === p ? `${PLATFORM_META[p].color}22` : "var(--surface-2)",
                color: "var(--text)",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {PLATFORM_META[p].label}
            </button>
          ))}
        </div>
        <div style={{ fontSize: 11, color: "var(--muted-2)", marginBottom: 12 }}>{PLATFORM_NOTE[logPlatform]}</div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
          <input type="date" value={postDate} onChange={(e) => setPostDate(e.target.value)} style={inputStyle} />
          <select value={contentType} onChange={(e) => setContentType(e.target.value)} style={inputStyle}>
            <option value="">content type (optional)</option>
            {CONTENT_TYPES.map((t) => (
              <option key={t.key} value={t.key}>
                {t.icon} {t.label}
              </option>
            ))}
          </select>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
          <input type="number" min={0} placeholder="views" value={views} onChange={(e) => setViews(e.target.value)} style={inputStyle} />
          <input type="number" min={0} placeholder="likes" value={likes} onChange={(e) => setLikes(e.target.value)} style={inputStyle} />
          <input type="number" min={0} placeholder="comments" value={comments} onChange={(e) => setComments(e.target.value)} style={inputStyle} />
          <input
            type="number"
            min={0}
            placeholder={`${followUnitLabel(logPlatform)} gained`}
            value={follows}
            onChange={(e) => setFollows(e.target.value)}
            style={inputStyle}
          />
        </div>

        {logPlatform === "instagram" && (
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--muted-2)", marginBottom: 8, cursor: "pointer" }}>
            <input type="checkbox" checked={isTrialReel} onChange={(e) => setIsTrialReel(e.target.checked)} />
            This is a Trial Reel
          </label>
        )}

        <input placeholder="note (optional)" value={note} onChange={(e) => setNote(e.target.value)} style={{ ...inputStyle, width: "100%", marginBottom: 10 }} />

        {error && <div style={{ color: "var(--rose)", fontSize: 12, marginBottom: 10 }}>{error}</div>}

        <button
          type="submit"
          disabled={busy}
          style={{
            width: "100%",
            padding: "12px 0",
            borderRadius: 10,
            border: "none",
            fontWeight: 700,
            fontSize: 14,
            cursor: busy ? "default" : "pointer",
            background: "var(--ember)",
            color: "#12141c",
          }}
        >
          {busy ? "..." : "Log entry"}
        </button>
      </form>

      <div style={{ marginTop: 24 }}>
        <div style={{ fontSize: 12, color: "var(--muted-2)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 10 }}>
          Logged posts
        </div>
        {entriesError && (
          <div className="grind-card" style={{ padding: 14, marginBottom: 10, fontSize: 12, color: "var(--rose)" }}>
            Couldn't load logged posts: {entriesError}. Your data may still be fine — this is a display error, not
            necessarily data loss.
          </div>
        )}
        {!entriesError && visibleEntries.length === 0 && (
          <div className="grind-card" style={{ padding: 20, textAlign: "center", color: "var(--muted-2)", fontSize: 13 }}>
            Nothing logged yet.
          </div>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {groupByDate(visibleEntries).map((group) => (
            <div key={group.date}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted-2)", marginBottom: 6, paddingLeft: 2 }}>
                {formatDateHeader(group.date)}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {group.items.map((e) => {
                  const type = CONTENT_TYPES.find((t) => t.key === e.content_type);
                  return (
                    <div
                      key={e.id}
                      className="grind-card"
                      style={{ padding: 0, display: "flex", alignItems: "stretch", overflow: "hidden" }}
                    >
                      <span style={{ width: 4, background: PLATFORM_META[e.platform].color, flexShrink: 0 }} />
                      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: 12, flex: 1, minWidth: 0 }}>
                        {e.thumbnail_url ? (
                          <img
                            src={e.thumbnail_url}
                            alt=""
                            style={{ width: 72, height: 72, borderRadius: 8, objectFit: "cover", flexShrink: 0 }}
                          />
                        ) : (
                          <div
                            style={{
                              width: 72,
                              height: 72,
                              borderRadius: 8,
                              background: "var(--surface-2)",
                              border: `1px solid ${PLATFORM_META[e.platform].color}55`,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontSize: 26,
                              flexShrink: 0,
                            }}
                          >
                            {type?.icon ?? "🎵"}
                          </div>
                        )}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                            {PLATFORM_META[e.platform].label}
                            {type ? ` · ${type.icon} ${type.label}` : ""}
                            {e.content_format && (
                              <span
                                title={e.content_format_manual ? "Confirmed by you" : "Best-effort guess - correct it below if it's wrong"}
                                style={{
                                  fontSize: 9,
                                  fontWeight: 700,
                                  color: "var(--muted-2)",
                                  border: "1px solid var(--border)",
                                  borderRadius: 6,
                                  padding: "1px 5px",
                                }}
                              >
                                {CONTENT_FORMAT_LABEL[e.content_format]}
                                {e.content_format_manual ? " ✓" : ""}
                              </span>
                            )}
                            {e.source !== "manual" && (
                              <span
                                style={{
                                  fontSize: 9,
                                  fontWeight: 700,
                                  color: "var(--teal)",
                                  border: "1px solid var(--teal)",
                                  borderRadius: 6,
                                  padding: "1px 5px",
                                }}
                              >
                                AUTO
                              </span>
                            )}
                            {e.is_trial_reel && (
                              <span
                                style={{
                                  fontSize: 9,
                                  fontWeight: 700,
                                  color: "var(--ember)",
                                  border: "1px solid var(--ember)",
                                  borderRadius: 6,
                                  padding: "1px 5px",
                                }}
                              >
                                TRIAL REEL
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: 11, color: "var(--muted-2)" }}>
                            {e.views.toLocaleString()} views · {e.likes.toLocaleString()} likes · {e.comments.toLocaleString()}{" "}
                            comments · {formatFollowsDelta(e.follows_gained)} {followUnitLabel(e.platform)}
                          </div>
                          {e.note && (
                            <div
                              style={{
                                fontSize: 11,
                                color: "var(--muted)",
                                marginTop: 2,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {e.note}
                            </div>
                          )}
                          {e.platform === "instagram" && (
                            <button
                              onClick={() => setTrialReelTag(e.id, !e.is_trial_reel)}
                              style={{
                                background: "none",
                                border: "none",
                                color: "var(--muted-2)",
                                cursor: "pointer",
                                fontSize: 11,
                                padding: 0,
                                marginTop: 4,
                                textDecoration: "underline",
                              }}
                            >
                              {e.is_trial_reel ? "Unmark Trial Reel" : "Mark as Trial Reel"}
                            </button>
                          )}
                          {e.platform === "youtube" && (e.content_format === "short" || e.content_format === "video") && (
                            <button
                              onClick={() => setContentFormat(e.id, e.content_format === "short" ? "video" : "short")}
                              title="Short/Video is a best-effort guess (YouTube has no official flag) - correct it if it's wrong"
                              style={{
                                background: "none",
                                border: "none",
                                color: "var(--muted-2)",
                                cursor: "pointer",
                                fontSize: 11,
                                padding: 0,
                                marginTop: 4,
                                textDecoration: "underline",
                              }}
                            >
                              This is actually a {e.content_format === "short" ? "regular video" : "Short"}
                            </button>
                          )}
                        </div>
                        <button
                          onClick={() => removeEntry(e.id)}
                          style={{ background: "none", border: "none", color: "#4b4f5c", cursor: "pointer", flexShrink: 0 }}
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const inputStyle = {
  background: "var(--surface-2)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  padding: "8px 10px",
  color: "var(--text)",
  fontSize: 13,
} as const;
