import { useMemo, useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import { supabase } from "../lib/supabaseClient";
import { useReleases, useRolloutCompletions } from "../data/useReleaseData";
import { useRhythmEntries } from "../data/useGrindData";
import {
  ROLLOUT_TEMPLATE,
  daysUntil,
  fmtReleaseDate,
  generateContentCalendar,
  personalizeRollout,
} from "../lib/releaseToolkit";
import type { Weekday } from "../lib/rhythm";

export function ReleaseToolkitPage() {
  const { user, profile, refreshProfile } = useAuth();
  const { releases, addRelease, removeRelease } = useReleases(user?.id);
  const { entries: rhythmEntries } = useRhythmEntries(user?.id);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const [instagramHandle, setInstagramHandle] = useState(profile?.instagram_handle ?? "");
  const [tiktokHandle, setTiktokHandle] = useState(profile?.tiktok_handle ?? "");
  const [handlesStatus, setHandlesStatus] = useState<string | null>(null);

  const activeRelease = useMemo(() => {
    if (selectedId) return releases.find((r) => r.id === selectedId) ?? null;
    const upcoming = releases.filter((r) => daysUntil(r.release_date) >= 0);
    return upcoming[0] ?? releases[0] ?? null;
  }, [releases, selectedId]);

  const { completed, toggle } = useRolloutCompletions(user?.id, activeRelease?.id);

  const contentDays = useMemo(() => {
    const days = new Set<Weekday>();
    (Object.keys(rhythmEntries.content) as Weekday[]).forEach((d) => days.add(d));
    return days;
  }, [rhythmEntries]);

  const rolloutSteps = activeRelease
    ? personalizeRollout(activeRelease.title, { instagram: instagramHandle, tiktok: tiktokHandle })
    : [];
  const calendar = activeRelease ? generateContentCalendar(activeRelease.release_date, contentDays) : null;

  const submitAdd = async () => {
    if (!title.trim() || !date) return;
    const message = await addRelease(title.trim(), date);
    if (message) {
      setAddError(message);
      return;
    }
    setTitle("");
    setDate("");
    setShowAdd(false);
    setAddError(null);
  };

  const saveHandles = async () => {
    if (!profile) return;
    await supabase
      .from("profiles")
      .update({ instagram_handle: instagramHandle.trim() || null, tiktok_handle: tiktokHandle.trim() || null })
      .eq("id", profile.id);
    await refreshProfile();
    setHandlesStatus("Saved.");
    setTimeout(() => setHandlesStatus(null), 2000);
  };

  return (
    <div style={{ maxWidth: 480, margin: "0 auto", padding: "40px 20px 60px" }}>
      <div style={{ textAlign: "center", fontSize: 13, color: "var(--muted)", marginBottom: 4 }}>Release Toolkit</div>
      <div style={{ textAlign: "center", fontSize: 11, color: "#4b4f5c", marginBottom: 20 }}>
        6-week rollout timeline and content calendar, per release{profile?.genre ? ` · ${profile.genre}` : ""}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div style={{ fontSize: 12, color: "var(--muted-2)", letterSpacing: "0.08em", textTransform: "uppercase" }}>Your releases</div>
        <button onClick={() => setShowAdd(true)} style={linkButtonStyle}>
          + Add
        </button>
      </div>

      {releases.length === 0 && !showAdd && (
        <div className="grind-card" style={{ padding: 20, textAlign: "center", color: "var(--muted-2)", fontSize: 13, marginBottom: 16 }}>
          No releases tracked yet.
        </div>
      )}

      {releases.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
          {releases.map((r) => (
            <button
              key={r.id}
              onClick={() => setSelectedId(r.id)}
              style={{
                padding: "8px 12px",
                borderRadius: 10,
                border: activeRelease?.id === r.id ? "1px solid var(--ember)" : "1px solid var(--border)",
                background: activeRelease?.id === r.id ? "rgba(232,163,61,0.14)" : "var(--surface-2)",
                color: "var(--text)",
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              {r.title}
            </button>
          ))}
        </div>
      )}

      {showAdd && (
        <div className="grind-card" style={{ padding: 16, marginBottom: 20 }}>
          <input placeholder="Song title" value={title} onChange={(e) => setTitle(e.target.value)} style={{ ...fullInputStyle, marginBottom: 10 }} />
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ ...fullInputStyle, marginBottom: 10 }} />
          {addError && <div style={{ color: "var(--rose)", fontSize: 12, marginBottom: 10 }}>{addError}</div>}
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={submitAdd} style={{ flex: 1, background: "var(--ember)", color: "#12141c", border: "none", borderRadius: 8, padding: "10px 0", fontWeight: 700, cursor: "pointer" }}>
              Add release
            </button>
            <button onClick={() => setShowAdd(false)} style={{ background: "none", border: "1px solid var(--border)", color: "var(--muted)", borderRadius: 8, padding: "10px 14px", cursor: "pointer" }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {activeRelease && (
        <>
          <div className="grind-card" style={{ padding: "16px 18px", marginBottom: 20, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>{activeRelease.title}</div>
              <div style={{ fontSize: 12, color: "var(--muted-2)" }}>{fmtReleaseDate(activeRelease.release_date)}</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div className="grind-num" style={{ fontSize: 22, fontWeight: 700, color: daysUntil(activeRelease.release_date) <= 0 ? "var(--teal)" : "var(--ember)" }}>
                {daysUntil(activeRelease.release_date) <= 0 ? "OUT" : daysUntil(activeRelease.release_date)}
              </div>
              <button onClick={() => removeRelease(activeRelease.id)} style={{ background: "none", border: "none", color: "#4b4f5c", cursor: "pointer" }}>
                ✕
              </button>
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div style={{ fontSize: 12, color: "var(--muted-2)", letterSpacing: "0.08em", textTransform: "uppercase" }}>6-Week Rollout</div>
            <div style={{ fontSize: 12, color: "var(--ember)", fontWeight: 700 }}>
              {completed.size}/{ROLLOUT_TEMPLATE.length}
            </div>
          </div>
          <div style={{ height: 6, background: "var(--surface-2)", borderRadius: 4, overflow: "hidden", marginBottom: 14 }}>
            <div
              style={{
                height: "100%",
                width: `${(completed.size / ROLLOUT_TEMPLATE.length) * 100}%`,
                background: "linear-gradient(90deg,var(--ember-deep),var(--ember-bright))",
                transition: "width 0.4s ease",
              }}
            />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 26 }}>
            {rolloutSteps.map((step, i) => {
              const done = completed.has(i);
              return (
                <div
                  key={i}
                  onClick={() => toggle(i)}
                  className="grind-card"
                  style={{ padding: "13px 14px", display: "flex", gap: 12, cursor: "pointer", opacity: done ? 0.55 : 1 }}
                >
                  <span style={{ fontSize: 18, color: done ? "var(--teal)" : "#4b4f5c", flexShrink: 0, marginTop: 2 }}>{done ? "✓" : "○"}</span>
                  <div style={{ minWidth: 0 }}>
                    <span style={{ fontSize: 10, color: "var(--ember)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{step.week}</span>
                    <div style={{ fontSize: 14, fontWeight: 700, marginTop: 2, textDecoration: done ? "line-through" : "none" }}>{step.title}</div>
                    <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>{step.description}</div>
                  </div>
                </div>
              );
            })}
          </div>

          {calendar && (
            <>
              <div style={{ fontSize: 12, color: "var(--muted-2)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 10 }}>
                30-Day Content Calendar
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, marginBottom: 8 }}>
                {calendar.map((d) => (
                  <div
                    key={d.dateStr}
                    title={d.dateStr}
                    style={{
                      aspectRatio: "1",
                      borderRadius: 8,
                      background: d.isRelease ? "linear-gradient(135deg,var(--rose),var(--ember))" : d.shouldPost ? "rgba(232,163,61,0.16)" : "var(--surface-2)",
                      border: d.isRelease ? "none" : d.shouldPost ? "1px solid rgba(232,163,61,0.35)" : "1px solid var(--border)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <span style={{ fontSize: 10, color: d.isRelease ? "#12141c" : d.shouldPost ? "var(--ember)" : "#4b4f5c", fontWeight: d.isRelease ? 800 : 600 }}>
                      {d.dayNumber}
                    </span>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 10, color: "#4b4f5c", marginBottom: 24 }}>lit squares = your content rhythm days · glowing square = release day</div>
            </>
          )}
        </>
      )}

      <div style={{ fontSize: 12, color: "var(--muted-2)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 10 }}>
        Platform handles
      </div>
      <div className="grind-card" style={{ padding: 16 }}>
        <div style={{ fontSize: 11, color: "var(--muted-2)", marginBottom: 10 }}>used to personalize the rollout steps above</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
          <input placeholder="Instagram handle" value={instagramHandle} onChange={(e) => setInstagramHandle(e.target.value)} style={fullInputStyle} />
          <input placeholder="TikTok handle" value={tiktokHandle} onChange={(e) => setTiktokHandle(e.target.value)} style={fullInputStyle} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button onClick={saveHandles} style={{ background: "var(--ember)", color: "#12141c", border: "none", borderRadius: 8, padding: "8px 14px", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>
            Save
          </button>
          {handlesStatus && <div style={{ fontSize: 12, color: "var(--teal)" }}>{handlesStatus}</div>}
        </div>
      </div>
    </div>
  );
}

const linkButtonStyle = {
  background: "none",
  border: "none",
  color: "var(--ember)",
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 600,
} as const;

const fullInputStyle = {
  width: "100%",
  background: "var(--surface-2)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  padding: "10px 12px",
  color: "var(--text)",
  fontSize: 13,
  boxSizing: "border-box",
} as const;
