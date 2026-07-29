import { dateKeyOffset, weekdayForDate, type Weekday } from "./rhythm";

export type Platform = "tiktok" | "instagram" | "youtube";

/**
 * Categorical colors validated with the dataviz skill's palette checker
 * against this app's actual dark card surface (#12141c): CVD separation,
 * normal-vision floor, and contrast all pass, all-pairs. Deliberately
 * distinct from the app's ember/teal/rose, which already carry other
 * meanings (streak heat, completion, release urgency).
 */
export const PLATFORM_META: Record<Platform, { label: string; color: string }> = {
  youtube: { label: "YouTube", color: "#3987e5" },
  instagram: { label: "Instagram", color: "#d95926" },
  tiktok: { label: "TikTok", color: "#199e70" },
};

/** Auto-detected post format (distinct from the user's manual content_type - see performance_entries). */
export const CONTENT_FORMAT_LABEL: Record<"reel" | "feed" | "story" | "short" | "video", string> = {
  reel: "REEL",
  feed: "POST",
  story: "STORY",
  short: "SHORT",
  video: "VIDEO",
};

export const ROLLOUT_TEMPLATE: { week: string; title: string; description: string }[] = [
  {
    week: "6 weeks out",
    title: "Finalize & Distribute",
    description: "Finish your final mix/master. Upload to your distributor and lock the release date.",
  },
  {
    week: "5 weeks out",
    title: "Cover Art Reveal",
    description: "Post the cover art reveal or a blurred teaser. Start a countdown in your bio.",
  },
  {
    week: "4 weeks out",
    title: "Drop the Snippet",
    description: "Release a 15–30 second snippet. Show your face and the vibe.",
  },
  {
    week: "3 weeks out",
    title: "Behind The Scenes",
    description: "Show the making of it — studio footage, writing process, the emotion behind it.",
  },
  {
    week: "2 weeks out",
    title: "Pitch & Outreach",
    description: "Submit to playlist curators and blogs. Log every pitch so you don't lose track.",
  },
  {
    week: "Release week",
    title: "IT DROPS",
    description: "Post a release-day video. Share the link everywhere. Pin it. Celebrate with your fans.",
  },
];

/** Personalizes rollout copy from data the user actually entered - never fabricated. */
export function personalizeRollout(
  song: string,
  handles: { instagram?: string | null; tiktok?: string | null }
) {
  return ROLLOUT_TEMPLATE.map((step) => {
    let description = step.description;
    let title = step.title;

    if (step.title === "IT DROPS") {
      title = `"${song || "Your Song"}" DROPS`;
    }

    if (step.title === "Drop the Snippet") {
      const where = [handles.instagram && "Instagram", handles.tiktok && "TikTok"].filter(Boolean).join(" and ");
      if (where) {
        description = `Release a 15–30 second snippet on ${where}. Show your face and the vibe.`;
      }
    }

    return { ...step, title, description };
  });
}

export function daysUntil(dateStr: string): number {
  const target = new Date(dateStr + "T00:00:00");
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - now.getTime()) / 86400000);
}

export function fmtReleaseDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}

export interface CalendarDay {
  dateStr: string;
  dayNumber: number;
  weekday: Weekday;
  isRelease: boolean;
  shouldPost: boolean;
}

/**
 * 30-day content calendar starting today, marking the release day (if it
 * falls in range) and post days from the user's *actual* content rhythm -
 * not a fabricated fixed pattern.
 */
export function generateContentCalendar(releaseDateStr: string, contentDays: Set<Weekday>): CalendarDay[] {
  return Array.from({ length: 30 }, (_, i) => {
    const dateStr = dateKeyOffset(-i);
    const weekday = weekdayForDate(dateStr);
    const isRelease = dateStr === releaseDateStr;
    return {
      dateStr,
      dayNumber: i + 1,
      weekday,
      isRelease,
      shouldPost: isRelease || contentDays.has(weekday),
    };
  });
}
