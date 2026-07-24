import { useMemo, useState, type FormEvent } from "react";
import { useAuth } from "../auth/AuthProvider";
import { supabase } from "../lib/supabaseClient";
import { addXp, useCheckins, useRhythmCompletions, useRhythmEntries } from "../data/useGrindData";
import { usePlatformsLogged, useRolloutStepsCompletedTotal } from "../data/useReleaseData";
import { useCountUp } from "../hooks/useCountUp";
import { CheckInModal } from "../components/CheckInModal";
import { MilestoneModal } from "../components/MilestoneModal";
import { OnboardingFlow } from "../onboarding/OnboardingFlow";
import {
  MILESTONES,
  MOODS,
  UNSTUCK,
  computeGrindScore,
  computeStreak,
  dateKeyOffset,
  emberFor,
  gradeFor,
  nextRank,
  rankFor,
  todayWeekdayKey,
  type Mood,
  type Track,
} from "../lib/rhythm";

export function HomePage() {
  const { user, profile, refreshProfile } = useAuth();
  const userId = user?.id;
  const todayKey = dateKeyOffset(0);
  const yesterdayKey = dateKeyOffset(1);
  const todayWd = todayWeekdayKey();

  const { entries: rhythmEntries, loading: rhythmLoading, bulkInsert } = useRhythmEntries(userId);
  const { checkins, refresh: refreshCheckins } = useCheckins(userId);
  const { done: rhythmDoneToday, toggle: toggleRhythmDone } = useRhythmCompletions(userId, todayKey);

  const [checkInOpen, setCheckInOpen] = useState<"today" | "yesterday" | null>(null);
  const [celebrateDays, setCelebrateDays] = useState<number | null>(null);
  const [stuckFor, setStuckFor] = useState<Track | null>(null);
  const [checkinError, setCheckinError] = useState<string | null>(null);

  const checkedDates = useMemo(() => new Set(checkins.map((c) => c.date)), [checkins]);
  const streak = computeStreak(checkedDates);
  const totalCheckins = checkins.length;
  const rank = rankFor(totalCheckins);
  const nxt = nextRank(totalCheckins);
  const progressToNext = nxt ? Math.min(100, ((totalCheckins - rank.min) / (nxt.min - rank.min)) * 100) : 100;
  const ember = emberFor(streak);
  const loggedToday = checkedDates.has(todayKey);
  const loggedYesterday = checkedDates.has(yesterdayKey);

  const rhythmFilledCount = Object.keys(rhythmEntries.content).length + Object.keys(rhythmEntries.music).length;
  const platformsLogged = usePlatformsLogged(userId);
  const rolloutStepsCompleted = useRolloutStepsCompletedTotal(userId);
  const grindScore = computeGrindScore({
    streak,
    rhythmFilledCount,
    distinctPlatformsLogged: platformsLogged.size,
    rolloutStepsCompleted,
  });
  const grade = gradeFor(grindScore);
  const displayXp = useCountUp(profile?.xp ?? 0);

  const todaysBlocks = [
    ...(rhythmEntries.content[todayWd]
      ? [{ track: "content" as Track, title: rhythmEntries.content[todayWd]!, icon: "🎥", done: rhythmDoneToday.content }]
      : []),
    ...(rhythmEntries.music[todayWd]
      ? [{ track: "music" as Track, title: rhythmEntries.music[todayWd]!, icon: "🎵", done: rhythmDoneToday.music }]
      : []),
  ];

  const showOnboarding = !rhythmLoading && rhythmFilledCount === 0 && !profile?.onboarding_completed_at;

  const handleToggleBlock = async (track: Track) => {
    const nowDone = await toggleRhythmDone(track);
    await addXp(nowDone ? 8 : -8);
    await refreshProfile();
  };

  const submitCheckin = async (types: string[], mood: Mood) => {
    if (!checkInOpen || !userId) return;
    const target = checkInOpen;
    const date = target === "yesterday" ? yesterdayKey : todayKey;
    const moodMeta = MOODS.find((m) => m.key === mood)!;
    const streakBonus = Math.min(streak, 10) * 2;
    const typeBonus = Math.max(0, types.length - 1) * 5;
    const base = 15 + streakBonus + moodMeta.bonus + typeBonus;

    let milestoneDays: number | null = null;
    if (target === "today" && MILESTONES.includes(streak + 1)) {
      milestoneDays = streak + 1;
    }
    const totalXp = base + (milestoneDays ? 50 : 0);

    const { error } = await supabase
      .from("daily_checkins")
      .upsert(
        { user_id: userId, date, types, mood, mood_bonus: moodMeta.bonus, xp_awarded: totalXp },
        { onConflict: "user_id,date" }
      );

    if (error) {
      setCheckinError(error.message);
      return;
    }

    await addXp(totalXp);
    await Promise.all([refreshCheckins(), refreshProfile()]);
    setCheckInOpen(null);
    if (milestoneDays) setCelebrateDays(milestoneDays);
  };

  const undoToday = async () => {
    if (!userId) return;
    const row = checkins.find((c) => c.date === todayKey);
    if (!row) return;
    await supabase.from("daily_checkins").delete().eq("user_id", userId).eq("date", todayKey);
    await addXp(-row.xp_awarded);
    await Promise.all([refreshCheckins(), refreshProfile()]);
  };

  // --- account section (from step 1) ---
  const [displayName, setDisplayName] = useState(profile?.display_name ?? "");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const saveDisplayName = async (e: FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setSaving(true);
    setStatus(null);
    const { error } = await supabase.from("profiles").update({ display_name: displayName }).eq("id", profile.id);
    if (error) {
      setStatus({ type: "error", message: error.message });
    } else {
      await refreshProfile();
      setStatus({ type: "success", message: "Saved." });
      setTimeout(() => setStatus(null), 2500);
    }
    setSaving(false);
  };

  return (
    <div style={{ maxWidth: 480, margin: "0 auto", padding: "28px 20px 60px" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto", alignItems: "center", marginBottom: 20 }}>
        <div className="grind-num" style={{ fontSize: 20, letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700 }}>
          GRIND
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 5,
            background: "rgba(244,193,92,0.1)",
            border: "1px solid rgba(244,193,92,0.25)",
            borderRadius: 20,
            padding: "5px 10px",
          }}
        >
          <span className="grind-num" style={{ fontSize: 13, fontWeight: 700, color: "var(--ember-bright)" }}>
            {displayXp} XP
          </span>
        </div>
      </div>

      <div className="grind-card" style={{ padding: 16, marginBottom: 16, display: "flex", alignItems: "center", gap: 16 }}>
        <div style={{ position: "relative", width: 60, height: 60, flexShrink: 0 }}>
          <svg width="60" height="60" viewBox="0 0 60 60" style={{ transform: "rotate(-90deg)" }}>
            <circle cx="30" cy="30" r="24" fill="none" stroke="var(--surface-2)" strokeWidth="5" />
            <circle
              cx="30"
              cy="30"
              r="24"
              fill="none"
              stroke={grade.color}
              strokeWidth="5"
              strokeDasharray={150.8}
              strokeDashoffset={150.8 * (1 - Math.min(100, grindScore) / 100)}
              strokeLinecap="round"
              style={{ transition: "stroke-dashoffset 0.6s ease" }}
            />
          </svg>
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span className="grind-num" style={{ fontSize: 16, fontWeight: 700 }}>
              {grindScore}
            </span>
          </div>
        </div>
        <div>
          <div style={{ fontSize: 10, color: "var(--muted-2)", letterSpacing: "0.08em", textTransform: "uppercase" }}>GRIND Score</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: grade.color, marginTop: 2 }}>{grade.grade}</div>
          <div style={{ fontSize: 11, color: "var(--muted-2)", marginTop: 2 }}>streak + rhythm + stats + release activity</div>
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ember)" }}>{rank.name}</div>
        {nxt && <div style={{ fontSize: 11, color: "var(--muted-2)" }}>{nxt.min - totalCheckins} to {nxt.name}</div>}
      </div>
      <div style={{ height: 6, background: "var(--surface-2)", borderRadius: 4, overflow: "hidden", marginBottom: 18 }}>
        <div style={{ height: "100%", width: `${progressToNext}%`, background: "linear-gradient(90deg,var(--ember-deep),var(--ember-bright))", transition: "width 0.5s ease" }} />
      </div>

      <div className="grind-card" style={{ padding: "30px 24px", textAlign: "center", boxShadow: ember.glow, transition: "box-shadow 0.6s ease" }}>
        <div style={{ fontSize: 40, marginBottom: 8, animation: streak > 0 ? "flicker 2.2s ease-in-out infinite" : "none" }}>🔥</div>
        <div className="grind-num" style={{ fontSize: 48, fontWeight: 700, lineHeight: 1, color: ember.color, transition: "color 0.6s ease" }}>
          {streak}
        </div>
        <div style={{ color: "var(--muted)", fontSize: 13, marginTop: 4 }}>{streak === 0 ? "no streak yet" : "day streak"}</div>
        <button
          onClick={loggedToday ? undoToday : () => setCheckInOpen("today")}
          style={{
            marginTop: 18,
            width: "100%",
            padding: "13px 0",
            borderRadius: 12,
            border: "none",
            fontWeight: 700,
            fontSize: 14,
            cursor: "pointer",
            background: loggedToday ? "var(--surface-2)" : "var(--ember)",
            color: loggedToday ? "var(--ember)" : "#12141c",
          }}
        >
          {loggedToday ? "Logged today ✓" : "Log today"}
        </button>
        {!loggedYesterday && !loggedToday && (
          <button
            onClick={() => setCheckInOpen("yesterday")}
            style={{
              marginTop: 8,
              width: "100%",
              background: "none",
              border: "1px dashed var(--border)",
              borderRadius: 10,
              padding: "8px 0",
              color: "var(--muted)",
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            Forgot yesterday? Backfill it to protect your streak
          </button>
        )}
      </div>

      <div style={{ marginTop: 22 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div style={{ fontSize: 12, color: "var(--muted-2)", letterSpacing: "0.08em", textTransform: "uppercase" }}>Today's blocks</div>
          {todaysBlocks.length > 0 && (
            <div style={{ fontSize: 12, color: "var(--muted)" }}>
              {todaysBlocks.filter((b) => b.done).length}/{todaysBlocks.length}
            </div>
          )}
        </div>
        {todaysBlocks.length === 0 && (
          <div className="grind-card" style={{ padding: 18, textAlign: "center", color: "var(--muted-2)", fontSize: 13 }}>
            Set today's rhythm on the Rhythm tab to see it here.
          </div>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          {todaysBlocks.map((b) => (
            <div key={b.track} className="grind-card" style={{ padding: "11px 14px", opacity: b.done ? 0.55 : 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <button
                  onClick={() => handleToggleBlock(b.track)}
                  style={{ background: "none", border: "none", cursor: "pointer", color: b.done ? "var(--teal)" : "#4b4f5c", padding: 0, fontSize: 18, lineHeight: 1 }}
                >
                  {b.done ? "✓" : "○"}
                </button>
                <span style={{ fontSize: 15 }}>{b.icon}</span>
                <div style={{ flex: 1, minWidth: 0, fontSize: 13, color: "var(--text)", textDecoration: b.done ? "line-through" : "none" }}>
                  {b.title}
                </div>
                {!b.done && (
                  <button
                    onClick={() => setStuckFor(stuckFor === b.track ? null : b.track)}
                    style={{ background: "none", border: "1px solid var(--border)", borderRadius: 8, color: "var(--muted)", cursor: "pointer", fontSize: 10, padding: "4px 7px" }}
                  >
                    stuck?
                  </button>
                )}
              </div>
              {stuckFor === b.track && !b.done && (
                <div style={{ marginTop: 8, padding: "8px 10px", background: "rgba(255,255,255,0.03)", borderRadius: 8, fontSize: 12, color: "var(--muted)" }}>
                  {UNSTUCK[b.track]}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div style={{ marginTop: 24 }}>
        <div style={{ fontSize: 12, color: "var(--muted-2)", marginBottom: 10, letterSpacing: "0.08em", textTransform: "uppercase" }}>Last 28 days</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6 }}>
          {Array.from({ length: 28 }, (_, i) => 27 - i).map((i) => {
            const key = dateKeyOffset(i);
            const done = checkedDates.has(key);
            return (
              <div
                key={key}
                title={key}
                style={{ aspectRatio: "1", borderRadius: 6, background: done ? ember.color : "var(--surface-2)", border: done ? "none" : "1px solid var(--border)" }}
              />
            );
          })}
        </div>
      </div>

      <div className="grind-card" style={{ padding: 20, marginTop: 28 }}>
        <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 4 }}>Signed in as</div>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 20 }}>@{profile?.username ?? "..."}</div>

        <form onSubmit={saveDisplayName} style={{ display: "flex", gap: 8, marginBottom: status ? 8 : 0 }}>
          <input
            placeholder="display name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            style={{ flex: 1, background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 10px", color: "var(--text)", fontSize: 13 }}
          />
          <button
            type="submit"
            disabled={saving}
            style={{ background: "var(--ember)", color: "#12141c", border: "none", borderRadius: 8, padding: "8px 14px", fontWeight: 700, cursor: saving ? "default" : "pointer", fontSize: 13 }}
          >
            Save
          </button>
        </form>
        {status && (
          <div style={{ fontSize: 12, color: status.type === "success" ? "var(--teal)" : "var(--rose)" }}>
            {status.type === "success" ? status.message : `Couldn't save: ${status.message}`}
          </div>
        )}
      </div>

      {checkInOpen && (
        <CheckInModal
          target={checkInOpen}
          onClose={() => {
            setCheckInOpen(null);
            setCheckinError(null);
          }}
          onSubmit={submitCheckin}
        />
      )}
      {checkinError && (
        <div style={{ position: "fixed", bottom: 20, left: 20, right: 20, textAlign: "center", color: "var(--rose)", fontSize: 12 }}>
          Couldn't save check-in: {checkinError}
        </div>
      )}
      {celebrateDays && <MilestoneModal days={celebrateDays} onClose={() => setCelebrateDays(null)} />}
      {showOnboarding && <OnboardingFlow onGenerate={bulkInsert} onDone={() => {}} />}
    </div>
  );
}
