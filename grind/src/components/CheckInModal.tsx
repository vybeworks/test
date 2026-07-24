import { useState } from "react";
import { Sheet } from "./Sheet";
import { CONTENT_TYPES, MOODS, type Mood } from "../lib/rhythm";

interface CheckInModalProps {
  target: "today" | "yesterday";
  onClose: () => void;
  onSubmit: (types: string[], mood: Mood) => Promise<void>;
}

export function CheckInModal({ target, onClose, onSubmit }: CheckInModalProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [types, setTypes] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const toggleType = (key: string) =>
    setTypes((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));

  const pickMood = async (mood: Mood) => {
    setBusy(true);
    await onSubmit(types, mood);
    setBusy(false);
  };

  return (
    <Sheet onClose={busy ? undefined : onClose}>
      {step === 1 && (
        <>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>
            {target === "yesterday" ? "What did you grind on yesterday?" : "What'd you grind on today?"}
          </div>
          <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 18 }}>pick everything that applies</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
            {CONTENT_TYPES.map((t) => {
              const on = types.includes(t.key);
              return (
                <button
                  key={t.key}
                  onClick={() => toggleType(t.key)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "14px 12px",
                    background: on ? "rgba(232,163,61,0.14)" : "var(--surface-2)",
                    border: on ? "1px solid var(--ember)" : "1px solid var(--border)",
                    borderRadius: 12,
                    color: "var(--text)",
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  <span style={{ fontSize: 18 }}>{t.icon}</span> {t.label}
                </button>
              );
            })}
          </div>
          <button
            onClick={() => setStep(2)}
            disabled={types.length === 0}
            style={{
              width: "100%",
              padding: "13px 0",
              borderRadius: 10,
              border: "none",
              fontWeight: 700,
              fontSize: 14,
              cursor: types.length ? "pointer" : "not-allowed",
              background: types.length ? "var(--ember)" : "var(--surface-2)",
              color: types.length ? "#12141c" : "#4b4f5c",
            }}
          >
            Continue{types.length > 1 ? ` (+${(types.length - 1) * 5} bonus XP)` : ""}
          </button>
        </>
      )}

      {step === 2 && (
        <>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>How'd it feel?</div>
          <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 18 }}>be honest — every answer still counts</div>
          <div style={{ display: "flex", gap: 10 }}>
            {MOODS.map((m) => (
              <button
                key={m.key}
                onClick={() => pickMood(m.key)}
                disabled={busy}
                style={{
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 6,
                  padding: "16px 8px",
                  background: "var(--surface-2)",
                  border: "1px solid var(--border)",
                  borderRadius: 12,
                  color: "var(--text)",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: busy ? "default" : "pointer",
                }}
              >
                <span style={{ fontSize: 24 }}>{m.icon}</span> {m.label}
              </button>
            ))}
          </div>
        </>
      )}
    </Sheet>
  );
}
