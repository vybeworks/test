import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "../auth/AuthProvider";
import { usePerformanceEntries } from "../data/useReleaseData";
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

export function PerformanceTrackingPage() {
  const { user } = useAuth();
  const { entries, addEntry, removeEntry } = usePerformanceEntries(user?.id);
  const { statuses } = useConnectionStatus(user?.id);

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

  const [platform, setPlatform] = useState<Platform>("tiktok");
  const [postDate, setPostDate] = useState(todayStr());
  const [contentType, setContentType] = useState("");
  const [views, setViews] = useState("");
  const [likes, setLikes] = useState("");
  const [comments, setComments] = useState("");
  const [follows, setFollows] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const message = await addEntry({
      platform,
      post_date: postDate,
      content_type: contentType || null,
      views: Number(views) || 0,
      likes: Number(likes) || 0,
      comments: Number(comments) || 0,
      follows_gained: Number(follows) || 0,
      note: note.trim() || null,
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
  };

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
                  {statuses[key]!.external_account_label ?? "Connected"} · synced {timeAgo(statuses[key]!.last_synced_at)}
                  {statuses[key]!.last_sync_error ? " · last sync failed" : ""}
                </div>
              ) : (
                <div style={{ fontSize: 11, color: "var(--muted-2)" }}>Not connected — pulls views/likes/comments automatically</div>
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

      <PerformanceTrendChart entries={entries} />

      <form onSubmit={submit} className="grind-card" style={{ padding: 16, marginTop: 16 }}>
        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          {(Object.keys(PLATFORM_META) as Platform[]).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPlatform(p)}
              style={{
                flex: 1,
                padding: "8px 0",
                borderRadius: 8,
                border: platform === p ? `1px solid ${PLATFORM_META[p].color}` : "1px solid var(--border)",
                background: platform === p ? `${PLATFORM_META[p].color}22` : "var(--surface-2)",
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
        <div style={{ fontSize: 11, color: "var(--muted-2)", marginBottom: 12 }}>{PLATFORM_NOTE[platform]}</div>

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
          <input type="number" min={0} placeholder="follows gained" value={follows} onChange={(e) => setFollows(e.target.value)} style={inputStyle} />
        </div>

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
        {entries.length === 0 && (
          <div className="grind-card" style={{ padding: 20, textAlign: "center", color: "var(--muted-2)", fontSize: 13 }}>
            Nothing logged yet.
          </div>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {entries.map((e) => {
            const type = CONTENT_TYPES.find((t) => t.key === e.content_type);
            return (
              <div key={e.id} className="grind-card" style={{ padding: "12px 14px", display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: PLATFORM_META[e.platform].color, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                    {PLATFORM_META[e.platform].label}
                    {type ? ` · ${type.icon} ${type.label}` : ""}
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
                  </div>
                  <div style={{ fontSize: 11, color: "var(--muted-2)" }}>
                    {e.post_date} · {e.views.toLocaleString()} views · {e.likes.toLocaleString()} likes ·{" "}
                    {e.comments.toLocaleString()} comments · +{e.follows_gained.toLocaleString()} follows
                  </div>
                  {e.note && <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>{e.note}</div>}
                </div>
                <button
                  onClick={() => removeEntry(e.id)}
                  style={{ background: "none", border: "none", color: "#4b4f5c", cursor: "pointer", flexShrink: 0 }}
                >
                  ✕
                </button>
              </div>
            );
          })}
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
