import { useState } from "react";
import { Sheet } from "../components/Sheet";
import { useAuth } from "../auth/AuthProvider";
import { supabase } from "../lib/supabaseClient";
import {
  CONTENT_SUGGESTIONS,
  DAY_COUNT_OPTIONS,
  GOAL_OPTIONS,
  MUSIC_SUGGESTIONS,
  spreadDays,
  type Track,
  type Weekday,
} from "../lib/rhythm";

interface OnboardingFlowProps {
  onGenerate: (rows: { track: Track; weekday: Weekday; text: string }[]) => Promise<void>;
  onDone: () => void;
}

export function OnboardingFlow({ onGenerate, onDone }: OnboardingFlowProps) {
  const { profile, refreshProfile } = useAuth();
  const [step, setStep] = useState(1);
  const [contentDays, setContentDays] = useState<number | null>(null);
  const [musicDays, setMusicDays] = useState<number | null>(null);
  const [goal, setGoal] = useState<string | null>(null);
  const [genre, setGenre] = useState("");
  const [busy, setBusy] = useState(false);

  const finish = async (skipped: boolean) => {
    if (!profile) return;
    setBusy(true);

    if (!skipped) {
      const rows: { track: Track; weekday: Weekday; text: string }[] = [];
      spreadDays(contentDays ?? 3).forEach((weekday, i) => {
        rows.push({ track: "content", weekday, text: CONTENT_SUGGESTIONS[i % CONTENT_SUGGESTIONS.length] });
      });
      spreadDays(musicDays ?? 3).forEach((weekday, i) => {
        rows.push({ track: "music", weekday, text: MUSIC_SUGGESTIONS[i % MUSIC_SUGGESTIONS.length] });
      });
      await onGenerate(rows);
    }

    await supabase
      .from("profiles")
      .update({
        genre: genre.trim() || null,
        goal,
        onboarding_completed_at: new Date().toISOString(),
      })
      .eq("id", profile.id);
    await refreshProfile();
    setBusy(false);
    onDone();
  };

  return (
    <Sheet>
      {step === 1 && (
        <>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>
            How many days a week do you want to post content?
          </div>
          <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 18 }}>
            be realistic — this builds your actual starting rhythm
          </div>
          <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
            {DAY_COUNT_OPTIONS.map((o) => (
              <button
                key={o.key}
                onClick={() => {
                  setContentDays(o.count);
                  setStep(2);
                }}
                style={optionButtonStyle}
              >
                {o.label}
              </button>
            ))}
          </div>
          <button onClick={() => finish(true)} disabled={busy} style={skipLinkStyle}>
            Skip — I'll build my own from scratch
          </button>
        </>
      )}

      {step === 2 && (
        <>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>
            How many days a week for making music?
          </div>
          <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 18 }}>
            writing, recording, production — whatever that looks like for you
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {DAY_COUNT_OPTIONS.map((o) => (
              <button
                key={o.key}
                onClick={() => {
                  setMusicDays(o.count);
                  setStep(3);
                }}
                style={optionButtonStyle}
              >
                {o.label}
              </button>
            ))}
          </div>
        </>
      )}

      {step === 3 && (
        <>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>What's your biggest goal right now?</div>
          <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 18 }}>
            shapes the tone of your starting rhythm
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {GOAL_OPTIONS.map((o) => (
              <button
                key={o.key}
                onClick={() => {
                  setGoal(o.key);
                  setStep(4);
                }}
                style={{ ...optionButtonStyle, textAlign: "left" }}
              >
                {o.label}
              </button>
            ))}
          </div>
        </>
      )}

      {step === 4 && (
        <>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>What's your genre or style?</div>
          <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 14 }}>
            optional — used to personalize your Release Toolkit later
          </div>
          <input
            placeholder="e.g. bedroom pop, drill, singer-songwriter"
            value={genre}
            onChange={(e) => setGenre(e.target.value)}
            style={{
              width: "100%",
              background: "var(--surface-2)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              padding: "10px 12px",
              color: "var(--text)",
              marginBottom: 16,
              fontSize: 14,
            }}
          />
          <button onClick={() => finish(false)} disabled={busy} style={primaryButtonStyle}>
            {busy ? "..." : "Build my starting rhythm"}
          </button>
        </>
      )}
    </Sheet>
  );
}

const optionButtonStyle = {
  flex: 1,
  padding: "14px 8px",
  background: "var(--surface-2)",
  border: "1px solid var(--border)",
  borderRadius: 12,
  color: "var(--text)",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
} as const;

const primaryButtonStyle = {
  width: "100%",
  padding: "13px 0",
  borderRadius: 10,
  border: "none",
  fontWeight: 700,
  fontSize: 14,
  cursor: "pointer",
  background: "var(--ember)",
  color: "#12141c",
} as const;

const skipLinkStyle = {
  width: "100%",
  background: "none",
  border: "none",
  color: "var(--muted-2)",
  fontSize: 12,
  cursor: "pointer",
} as const;
