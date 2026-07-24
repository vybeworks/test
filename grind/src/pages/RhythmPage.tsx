import { useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import { Sheet } from "../components/Sheet";
import { useRhythmEntries } from "../data/useGrindData";
import { CONTENT_SUGGESTIONS, MUSIC_SUGGESTIONS, WEEKDAYS, todayWeekdayKey, type Track, type Weekday } from "../lib/rhythm";

export function RhythmPage() {
  const { user, profile } = useAuth();
  const { entries, saveEntry, clearEntry } = useRhythmEntries(user?.id);
  const [editor, setEditor] = useState<{ track: Track; weekday: Weekday; text: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const todayWd = todayWeekdayKey();

  const openEditor = (track: Track, weekday: Weekday) => {
    setError(null);
    setEditor({ track, weekday, text: entries[track][weekday] ?? "" });
  };

  const save = async () => {
    if (!editor || !editor.text.trim()) return;
    const message = await saveEntry(editor.track, editor.weekday, editor.text.trim());
    if (message) {
      setError(message);
      return;
    }
    setEditor(null);
  };

  const renderTrack = (track: Track, label: string) => (
    <div style={{ marginBottom: 26 }}>
      <div style={{ fontSize: 12, color: "var(--muted-2)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 10 }}>
        {label}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {WEEKDAYS.map((d) => {
          const val = entries[track][d.key];
          const isToday = d.key === todayWd;
          return (
            <div
              key={d.key}
              onClick={() => openEditor(track, d.key)}
              className="grind-card"
              style={{
                padding: "12px 14px",
                display: "flex",
                alignItems: "center",
                gap: 12,
                cursor: "pointer",
                border: isToday ? "1px solid rgba(232,163,61,0.4)" : "1px solid var(--border)",
              }}
            >
              <div style={{ width: 40, fontSize: 11, fontWeight: 700, color: isToday ? "var(--ember)" : "var(--muted-2)", textTransform: "uppercase", flexShrink: 0 }}>
                {d.label}
              </div>
              <div style={{ flex: 1, fontSize: 13, color: val ? "var(--text)" : "#4b4f5c", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {val || "tap to set"}
              </div>
              {isToday && <div style={{ fontSize: 9, color: "var(--ember)", fontWeight: 700, flexShrink: 0 }}>TODAY</div>}
              {val && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    clearEntry(track, d.key);
                  }}
                  style={{ background: "none", border: "none", color: "#4b4f5c", cursor: "pointer", flexShrink: 0 }}
                >
                  ✕
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <div style={{ maxWidth: 480, margin: "0 auto", padding: "40px 20px 60px" }}>
      <div style={{ textAlign: "center", fontSize: 13, color: "var(--muted)", marginBottom: 4 }}>
        your repeating weekly rhythm{profile?.genre ? ` · ${profile.genre}` : ""}
      </div>
      <div style={{ textAlign: "center", fontSize: 11, color: "#4b4f5c", marginBottom: 24 }}>
        set it once in your own words — it runs every week from here on
      </div>

      {renderTrack("content", "Content Calendar")}
      {renderTrack("music", "Music Focus")}

      {editor && (
        <Sheet onClose={() => setEditor(null)}>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>
            {WEEKDAYS.find((d) => d.key === editor.weekday)?.label} —{" "}
            {editor.track === "content" ? "Content Calendar" : "Music Focus"}
          </div>
          <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 14 }}>
            in your own words — suggestions below are just a starting point
          </div>
          <textarea
            placeholder="what happens this day, every week?"
            value={editor.text}
            onChange={(e) => setEditor((p) => (p ? { ...p, text: e.target.value } : p))}
            rows={2}
            style={{
              width: "100%",
              background: "var(--surface-2)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              padding: "10px 12px",
              color: "var(--text)",
              fontSize: 14,
              marginBottom: 14,
              resize: "none",
            }}
          />
          <div style={{ fontSize: 11, color: "var(--muted-2)", marginBottom: 8 }}>tap to start from a suggestion</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
            {(editor.track === "content" ? CONTENT_SUGGESTIONS : MUSIC_SUGGESTIONS).slice(0, 5).map((s) => (
              <button
                key={s}
                onClick={() => setEditor((p) => (p ? { ...p, text: s } : p))}
                style={{
                  padding: "6px 10px",
                  background: "var(--surface-2)",
                  border: "1px solid var(--border)",
                  borderRadius: 20,
                  color: "var(--muted)",
                  fontSize: 11,
                  cursor: "pointer",
                }}
              >
                {s}
              </button>
            ))}
          </div>
          {error && <div style={{ color: "var(--rose)", fontSize: 12, marginBottom: 10 }}>{error}</div>}
          <button
            onClick={save}
            disabled={!editor.text.trim()}
            style={{
              width: "100%",
              padding: "13px 0",
              borderRadius: 10,
              border: "none",
              fontWeight: 700,
              fontSize: 14,
              cursor: editor.text.trim() ? "pointer" : "not-allowed",
              background: editor.text.trim() ? "var(--ember)" : "var(--surface-2)",
              color: editor.text.trim() ? "#12141c" : "#4b4f5c",
            }}
          >
            Save to rhythm
          </button>
        </Sheet>
      )}
    </div>
  );
}
