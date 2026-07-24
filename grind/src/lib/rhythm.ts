export type Weekday = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
export type Track = "content" | "music";
export type Mood = "fire" | "meh" | "rough";

export const WEEKDAYS: { key: Weekday; label: string }[] = [
  { key: "mon", label: "Mon" },
  { key: "tue", label: "Tue" },
  { key: "wed", label: "Wed" },
  { key: "thu", label: "Thu" },
  { key: "fri", label: "Fri" },
  { key: "sat", label: "Sat" },
  { key: "sun", label: "Sun" },
];

export const CONTENT_SUGGESTIONS = [
  "Studio / recording clip",
  "Guitar moment or cover",
  "Vocal clip — your real voice",
  "Behind-the-scenes / storytime",
  "Snippet of unreleased music",
  "Performance or raw vocal",
  "Rest day or repost best of week",
];

export const MUSIC_SUGGESTIONS = [
  "Record vocals on a demo",
  "Songwriting — start a new idea",
  "Production / beat-making",
  "Finish a demo",
  "Mixing & mastering practice",
  "Free creative day",
  "Rest — listen to music for fun",
];

export const CONTENT_TYPES: { key: string; label: string; icon: string }[] = [
  { key: "reel", label: "Reel", icon: "🎥" },
  { key: "photo", label: "Photo", icon: "📷" },
  { key: "story", label: "Story", icon: "⚡" },
  { key: "song", label: "New verse/song", icon: "🎵" },
  { key: "practice", label: "Practice", icon: "🎤" },
];

export const MOODS: { key: Mood; label: string; icon: string; bonus: number }[] = [
  { key: "fire", label: "Felt great", icon: "🔥", bonus: 5 },
  { key: "meh", label: "It's something", icon: "😐", bonus: 0 },
  { key: "rough", label: "Rough one", icon: "😩", bonus: 8 },
];

export const GOAL_OPTIONS: { key: string; label: string }[] = [
  { key: "grow", label: "Grow my following" },
  { key: "finish", label: "Finish a project/EP" },
  { key: "release", label: "Prep for a release" },
  { key: "community", label: "Build real community" },
];

export const DAY_COUNT_OPTIONS: { key: string; label: string; count: number }[] = [
  { key: "light", label: "3–4 days", count: 3 },
  { key: "medium", label: "5–6 days", count: 5 },
  { key: "full", label: "Every day", count: 7 },
];

export const UNSTUCK: Record<Track, string> = {
  content: 'Film yourself playing/singing 10 seconds of anything unreleased. Caption it "snippet." Post it. Done.',
  music: "Open your DAW or app. Loop 4 bars you already have. Hum one new melody over it. That's the start.",
};

export const RANKS = [
  { min: 0, name: "Bedroom Artist" },
  { min: 3, name: "Getting Warmed Up" },
  { min: 7, name: "In The Grind" },
  { min: 14, name: "Locked In" },
  { min: 30, name: "Unstoppable" },
  { min: 60, name: "Grind Legend" },
];

export const MILESTONES = [3, 7, 14, 30, 60, 100];

export const EMBER_STOPS = [
  { min: 0, color: "#4A4237", glow: "0 0 0px transparent" },
  { min: 3, color: "#8A5A2E", glow: "0 0 18px rgba(232,163,61,0.25)" },
  { min: 7, color: "#C77B2E", glow: "0 0 26px rgba(232,163,61,0.4)" },
  { min: 14, color: "#E8A33D", glow: "0 0 36px rgba(232,163,61,0.55)" },
  { min: 30, color: "#F4C15C", glow: "0 0 48px rgba(244,193,92,0.7)" },
];

export const GRADES = [
  { min: 90, grade: "ICON LEVEL", color: "#F4C15C" },
  { min: 70, grade: "ON FIRE", color: "#E8A33D" },
  { min: 50, grade: "BUILDING", color: "#C77B2E" },
  { min: 30, grade: "WARMING UP", color: "#4FD1C5" },
  { min: 0, grade: "JUST STARTING", color: "#6B7280" },
];

const WEEKDAY_ORDER: Weekday[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

export function dateKeyOffset(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() - offsetDays);
  return d.toISOString().slice(0, 10);
}

export function todayWeekdayKey(): Weekday {
  return WEEKDAY_ORDER[new Date().getDay()];
}

export function weekdayForDate(dateStr: string): Weekday {
  return WEEKDAY_ORDER[new Date(dateStr + "T00:00:00").getDay()];
}

/** Deterministic day spread, never random — matches the validated prototype. */
export function spreadDays(count: number): Weekday[] {
  const order: Weekday[] = ["mon", "wed", "fri", "tue", "thu", "sat", "sun"];
  return order.slice(0, count);
}

export function emberFor(streak: number) {
  let s = EMBER_STOPS[0];
  for (const stop of EMBER_STOPS) if (streak >= stop.min) s = stop;
  return s;
}

export function rankFor(totalCheckins: number) {
  let r = RANKS[0];
  for (const rank of RANKS) if (totalCheckins >= rank.min) r = rank;
  return r;
}

export function nextRank(totalCheckins: number) {
  return RANKS.find((r) => r.min > totalCheckins) ?? null;
}

export function gradeFor(score: number) {
  return GRADES.find((g) => score >= g.min) ?? GRADES[GRADES.length - 1];
}

/**
 * Streak with one forgiving skip per week: walks back from today, allowing
 * exactly one gap within the first 7 days before breaking. Not logging today
 * yet never breaks the streak (today just doesn't count until it happens).
 */
export function computeStreak(checkedDates: Set<string>): number {
  let count = 0;
  let skipsUsed = 0;
  for (let i = 0; ; i++) {
    const key = dateKeyOffset(i);
    if (checkedDates.has(key)) {
      count++;
    } else if (i === 0) {
      continue;
    } else if (skipsUsed < 1 && i <= 7) {
      skipsUsed++;
    } else {
      break;
    }
  }
  return count;
}

/**
 * GRIND Score, step-2 version: streak + rhythm consistency only, since the
 * spec's other two components (stats, release activity) don't exist until
 * later build steps. Revisit the weighting once those land.
 */
export function computeGrindScore(args: { streak: number; rhythmFilledCount: number }): number {
  const streakScore = Math.min(50, args.streak * 5);
  const rhythmScore = Math.round((Math.min(args.rhythmFilledCount, 14) / 14) * 50);
  return Math.round(streakScore + rhythmScore);
}
