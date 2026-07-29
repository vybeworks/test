import type { PerformanceEntry } from "../data/useReleaseData";
import type { Platform } from "./releaseToolkit";
import { WEEKDAYS, weekdayForDate, type Weekday } from "./rhythm";

/**
 * Every insight below is gated on this: a group with fewer than this many
 * usable data points doesn't get ranked or claimed as a pattern, it gets
 * marked insufficient. One lucky post is an anecdote, not a pattern.
 */
export const MIN_SAMPLE_SIZE = 3;

function avg(nums: number[]): number {
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
}

/** Excludes entries whose views are a failed fetch masquerading as a zero, not a real number. */
function withUsableViews(entries: PerformanceEntry[]): PerformanceEntry[] {
  return entries.filter((e) => !e.views_unavailable);
}

export interface FormatPerformance {
  format: NonNullable<PerformanceEntry["content_format"]>;
  postCount: number;
  viewsSampleSize: number;
  avgViews: number | null;
  avgLikes: number;
  avgComments: number;
  /** (avgLikes + avgComments) / avgViews - null whenever avgViews itself isn't available. */
  engagementRate: number | null;
  /** Real per-post subscriber attribution - only meaningful for YouTube, null otherwise. */
  avgFollowsGained: number | null;
  sufficientSample: boolean;
}

/** Ranked by avg views, descending, with insufficient-sample groups sorted last. */
export function getFormatPerformance(entries: PerformanceEntry[], platform: Platform): FormatPerformance[] {
  const groups = new Map<string, PerformanceEntry[]>();
  for (const e of entries) {
    if (e.platform !== platform || !e.content_format) continue;
    const group = groups.get(e.content_format);
    if (group) group.push(e);
    else groups.set(e.content_format, [e]);
  }

  const results: FormatPerformance[] = [];
  for (const [format, group] of groups) {
    const withViews = withUsableViews(group);
    const sufficientSample = withViews.length >= MIN_SAMPLE_SIZE;
    const avgViews = sufficientSample ? avg(withViews.map((e) => e.views)) : null;
    const avgLikes = avg(group.map((e) => e.likes));
    const avgComments = avg(group.map((e) => e.comments));
    results.push({
      format: format as NonNullable<PerformanceEntry["content_format"]>,
      postCount: group.length,
      viewsSampleSize: withViews.length,
      avgViews,
      avgLikes,
      avgComments,
      engagementRate: avgViews && avgViews > 0 ? (avgLikes + avgComments) / avgViews : null,
      avgFollowsGained: platform === "youtube" ? avg(group.map((e) => e.follows_gained)) : null,
      sufficientSample,
    });
  }

  return results.sort((a, b) => {
    if (a.avgViews === null && b.avgViews === null) return 0;
    if (a.avgViews === null) return 1;
    if (b.avgViews === null) return -1;
    return b.avgViews - a.avgViews;
  });
}

export interface DayPerformance {
  weekday: Weekday;
  label: string;
  postCount: number;
  viewsSampleSize: number;
  avgViews: number | null;
  sufficientSample: boolean;
}

/** All 7 weekdays always returned (in Mon-Sun order) so the UI can show gaps, not just winners. */
export function getDayPerformance(entries: PerformanceEntry[], platform: Platform): DayPerformance[] {
  const groups = new Map<Weekday, PerformanceEntry[]>();
  for (const e of entries) {
    if (e.platform !== platform) continue;
    const wd = weekdayForDate(e.post_date);
    const group = groups.get(wd);
    if (group) group.push(e);
    else groups.set(wd, [e]);
  }

  return WEEKDAYS.map(({ key, label }) => {
    const group = groups.get(key) ?? [];
    const withViews = withUsableViews(group);
    const sufficientSample = withViews.length >= MIN_SAMPLE_SIZE;
    return {
      weekday: key,
      label,
      postCount: group.length,
      viewsSampleSize: withViews.length,
      avgViews: sufficientSample ? avg(withViews.map((e) => e.views)) : null,
      sufficientSample,
    };
  });
}

/** Best day(s) only - `getDayPerformance` filtered and sorted, for headline copy. */
export function getBestDay(entries: PerformanceEntry[], platform: Platform): DayPerformance | null {
  const ranked = getDayPerformance(entries, platform)
    .filter((d) => d.sufficientSample)
    .sort((a, b) => (b.avgViews ?? 0) - (a.avgViews ?? 0));
  return ranked[0] ?? null;
}

export interface MonthlyTrendPoint {
  month: string; // "YYYY-MM"
  postCount: number;
  viewsSampleSize: number;
  avgViews: number | null;
}

/** Chronological, one point per calendar month that has at least one post. */
export function getMonthlyTrend(entries: PerformanceEntry[], platform: Platform): MonthlyTrendPoint[] {
  const groups = new Map<string, PerformanceEntry[]>();
  for (const e of entries) {
    if (e.platform !== platform) continue;
    const month = e.post_date.slice(0, 7);
    const group = groups.get(month);
    if (group) group.push(e);
    else groups.set(month, [e]);
  }

  return Array.from(groups.entries())
    .map(([month, group]) => {
      const withViews = withUsableViews(group);
      return {
        month,
        postCount: group.length,
        viewsSampleSize: withViews.length,
        avgViews: withViews.length > 0 ? avg(withViews.map((e) => e.views)) : null,
      };
    })
    .sort((a, b) => a.month.localeCompare(b.month));
}

export interface TrendComparison {
  recentAvgViews: number | null;
  priorAvgViews: number | null;
  /** (recent - prior) / prior * 100 - null unless both windows clear the sample-size floor. */
  percentChange: number | null;
  sufficientSample: boolean;
}

const TREND_WINDOW_DAYS = 30;
const MS_PER_DAY = 86_400_000;

/** Trailing 30 days vs. the 30 days before that, both windows sample-size gated. */
export function getTrendComparison(entries: PerformanceEntry[], platform: Platform, now: Date = new Date()): TrendComparison {
  const platformEntries = withUsableViews(entries.filter((e) => e.platform === platform));
  const nowMs = now.getTime();
  const recentStart = nowMs - TREND_WINDOW_DAYS * MS_PER_DAY;
  const priorStart = nowMs - 2 * TREND_WINDOW_DAYS * MS_PER_DAY;

  const dateMs = (e: PerformanceEntry) => new Date(`${e.post_date}T00:00:00`).getTime();
  const recent = platformEntries.filter((e) => dateMs(e) >= recentStart && dateMs(e) <= nowMs);
  const prior = platformEntries.filter((e) => dateMs(e) >= priorStart && dateMs(e) < recentStart);

  const sufficientSample = recent.length >= MIN_SAMPLE_SIZE && prior.length >= MIN_SAMPLE_SIZE;
  const recentAvgViews = recent.length > 0 ? avg(recent.map((e) => e.views)) : null;
  const priorAvgViews = prior.length > 0 ? avg(prior.map((e) => e.views)) : null;

  return {
    recentAvgViews,
    priorAvgViews,
    percentChange:
      sufficientSample && priorAvgViews && priorAvgViews > 0
        ? ((recentAvgViews! - priorAvgViews) / priorAvgViews) * 100
        : null,
    sufficientSample,
  };
}
