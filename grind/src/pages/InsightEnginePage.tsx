import { useMemo, useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import { usePerformanceEntries } from "../data/useReleaseData";
import { CONTENT_FORMAT_LABEL, PLATFORM_META, type Platform } from "../lib/releaseToolkit";
import {
  getBestDay,
  getDayPerformance,
  getFormatPerformance,
  getMonthlyTrend,
  getTrendComparison,
  MIN_SAMPLE_SIZE,
  type DayPerformance,
  type FormatPerformance,
  type MonthlyTrendPoint,
} from "../lib/insights";

const PLATFORMS: Platform[] = ["youtube", "instagram", "tiktok"];

function fmtViews(n: number): string {
  return Math.round(n).toLocaleString();
}

export function InsightEnginePage() {
  const { user } = useAuth();
  const { entries, loading, error } = usePerformanceEntries(user?.id);

  // Default to whichever platform has the most data, so the page opens
  // somewhere useful rather than always landing on an empty YouTube tab.
  const defaultPlatform = useMemo<Platform>(() => {
    const counts: Record<Platform, number> = { youtube: 0, instagram: 0, tiktok: 0 };
    for (const e of entries) counts[e.platform]++;
    return ([...PLATFORMS] as Platform[]).sort((a, b) => counts[b] - counts[a])[0];
  }, [entries]);

  const [selectedPlatform, setSelectedPlatform] = useState<Platform | null>(null);
  const platform = selectedPlatform ?? defaultPlatform;
  const color = PLATFORM_META[platform].color;

  const formatPerf = useMemo(() => getFormatPerformance(entries, platform), [entries, platform]);
  const dayPerf = useMemo(() => getDayPerformance(entries, platform), [entries, platform]);
  const bestDay = useMemo(() => getBestDay(entries, platform), [entries, platform]);
  const monthlyTrend = useMemo(() => getMonthlyTrend(entries, platform), [entries, platform]);
  const trendComparison = useMemo(() => getTrendComparison(entries, platform), [entries, platform]);

  const platformEntryCount = entries.filter((e) => e.platform === platform).length;

  return (
    <div style={{ maxWidth: 480, margin: "0 auto", padding: "40px 20px 60px" }}>
      <div style={{ textAlign: "center", fontSize: 13, color: "var(--muted)", marginBottom: 4 }}>Insight Engine</div>
      <div style={{ textAlign: "center", fontSize: 11, color: "#4b4f5c", marginBottom: 20 }}>
        real patterns from your synced data, not generic advice
      </div>

      {error && (
        <div className="grind-card" style={{ padding: 14, marginBottom: 16, fontSize: 12, color: "var(--rose)" }}>
          Couldn't load your performance data: {error}
        </div>
      )}

      <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
        {PLATFORMS.map((p) => (
          <button
            key={p}
            onClick={() => setSelectedPlatform(p)}
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

      {loading ? (
        <div className="grind-card" style={{ padding: 24, textAlign: "center", color: "var(--muted-2)", fontSize: 13 }}>
          Loading...
        </div>
      ) : platformEntryCount === 0 ? (
        <div className="grind-card" style={{ padding: 24, textAlign: "center", color: "var(--muted-2)", fontSize: 13 }}>
          No {PLATFORM_META[platform].label} entries logged yet — insights need real data to work with.
        </div>
      ) : (
        <>
          <SectionHeader title="Best-performing format" />
          <div className="grind-card" style={{ padding: 16, marginBottom: 16 }}>
            {formatPerf.length === 0 ? (
              <EmptyNote text="No format data available for this platform yet." />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {formatPerf.map((f, i) => (
                  <FormatRow key={f.format} perf={f} isTop={i === 0} color={color} topAvgViews={formatPerf[0].avgViews} />
                ))}
              </div>
            )}
          </div>

          <SectionHeader title="Best day to post" />
          <div className="grind-card" style={{ padding: 16, marginBottom: 16 }}>
            {bestDay ? (
              <div style={{ fontSize: 13, marginBottom: 14 }}>
                <strong style={{ color }}>{bestDay.label}</strong> averages{" "}
                <strong>{fmtViews(bestDay.avgViews!)} views</strong> per post, based on {bestDay.viewsSampleSize} posts.
              </div>
            ) : (
              <div style={{ marginBottom: 14 }}>
                <EmptyNote text={`Need at least ${MIN_SAMPLE_SIZE} posts on the same weekday before a day can be called "best."`} />
              </div>
            )}
            <DayBarChart data={dayPerf} color={color} />
          </div>

          <SectionHeader title="Trend over time" />
          <div className="grind-card" style={{ padding: 16, marginBottom: 16 }}>
            {trendComparison.sufficientSample ? (
              <div style={{ fontSize: 13, marginBottom: 14 }}>
                Avg views per post, last 30 days: <strong>{fmtViews(trendComparison.recentAvgViews!)}</strong>
                {trendComparison.percentChange !== null && (
                  <span
                    style={{
                      color: trendComparison.percentChange >= 0 ? "var(--teal)" : "var(--rose)",
                      fontWeight: 700,
                    }}
                  >
                    {" "}
                    ({trendComparison.percentChange >= 0 ? "+" : ""}
                    {trendComparison.percentChange.toFixed(0)}% vs. the 30 days before)
                  </span>
                )}
              </div>
            ) : (
              <div style={{ marginBottom: 14 }}>
                <EmptyNote
                  text={`Need at least ${MIN_SAMPLE_SIZE} posts in each of the last two 30-day windows to compare trends.`}
                />
              </div>
            )}
            <MonthlyTrendChart data={monthlyTrend} color={color} />
          </div>
        </>
      )}
    </div>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <div
      style={{
        fontSize: 12,
        color: "var(--muted-2)",
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        marginBottom: 10,
      }}
    >
      {title}
    </div>
  );
}

function EmptyNote({ text }: { text: string }) {
  return <div style={{ fontSize: 12, color: "var(--muted-2)" }}>{text}</div>;
}

function FormatRow({
  perf,
  isTop,
  color,
  topAvgViews,
}: {
  perf: FormatPerformance;
  isTop: boolean;
  color: string;
  topAvgViews: number | null;
}) {
  const barWidth = topAvgViews && perf.avgViews ? Math.max(4, (perf.avgViews / topAvgViews) * 100) : 0;
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", fontSize: 12, marginBottom: 4, gap: 8 }}>
        <span style={{ fontWeight: 700, color: isTop && perf.sufficientSample ? color : "var(--text)", flexShrink: 0 }}>
          {CONTENT_FORMAT_LABEL[perf.format]}
        </span>
        <span style={{ color: "var(--muted-2)", textAlign: "right" }}>
          {perf.sufficientSample ? (
            <>
              {fmtViews(perf.avgViews!)} avg views
              {perf.engagementRate !== null ? ` · ${(perf.engagementRate * 100).toFixed(1)}% engagement` : ""}
              {perf.avgFollowsGained !== null
                ? ` · ${perf.avgFollowsGained >= 0 ? "+" : ""}${perf.avgFollowsGained.toFixed(1)} subs/post`
                : ""}
            </>
          ) : (
            `not enough data yet (${perf.viewsSampleSize}/${MIN_SAMPLE_SIZE} posts)`
          )}
        </span>
      </div>
      <div style={{ height: 6, borderRadius: 3, background: "var(--surface-2)", overflow: "hidden" }}>
        <div style={{ width: `${barWidth}%`, height: "100%", background: color }} />
      </div>
    </div>
  );
}

function DayBarChart({ data, color }: { data: DayPerformance[]; color: string }) {
  const maxViews = Math.max(1, ...data.map((d) => d.avgViews ?? 0));
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 90 }}>
      {data.map((d) => {
        const barHeight = d.avgViews ? Math.max(4, (d.avgViews / maxViews) * 74) : 4;
        return (
          <div key={d.weekday} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
            <div
              title={
                d.sufficientSample
                  ? `${d.label}: ${fmtViews(d.avgViews!)} avg views (${d.viewsSampleSize} posts)`
                  : `${d.label}: not enough data yet (${d.postCount} posts)`
              }
              style={{
                width: "100%",
                height: barHeight,
                borderRadius: 3,
                background: d.sufficientSample ? color : "var(--border)",
              }}
            />
            <span style={{ fontSize: 9, color: "var(--muted-2)" }}>{d.label}</span>
          </div>
        );
      })}
    </div>
  );
}

const TREND_WIDTH = 440;
const TREND_HEIGHT = 140;
const TREND_PAD = 28;

function MonthlyTrendChart({ data, color }: { data: MonthlyTrendPoint[]; color: string }) {
  const withViews = data.filter((d): d is MonthlyTrendPoint & { avgViews: number } => d.avgViews !== null);
  if (withViews.length < 2) {
    return <div style={{ fontSize: 12, color: "var(--muted-2)" }}>Not enough months of data yet for a trend line.</div>;
  }

  const maxViews = Math.max(1, ...withViews.map((d) => d.avgViews));
  const x = (i: number) => TREND_PAD + (i / (withViews.length - 1)) * (TREND_WIDTH - TREND_PAD * 2);
  const y = (views: number) => TREND_HEIGHT - TREND_PAD - (views / maxViews) * (TREND_HEIGHT - TREND_PAD * 2);
  const points = withViews.map((d, i) => `${x(i)},${y(d.avgViews)}`).join(" ");

  return (
    <svg width="100%" viewBox={`0 0 ${TREND_WIDTH} ${TREND_HEIGHT}`} role="img" aria-label="Average views per post over time">
      {[0.25, 0.5, 0.75].map((f) => (
        <line
          key={f}
          x1={TREND_PAD}
          x2={TREND_WIDTH - TREND_PAD}
          y1={TREND_PAD + f * (TREND_HEIGHT - TREND_PAD * 2)}
          y2={TREND_PAD + f * (TREND_HEIGHT - TREND_PAD * 2)}
          stroke="var(--border)"
          strokeWidth={1}
        />
      ))}
      <text x={TREND_PAD} y={TREND_PAD - 8} fontSize={9} fill="var(--muted-2)">
        {fmtViews(maxViews)} avg views
      </text>
      <polyline points={points} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      {withViews.map((d, i) => (
        <circle key={d.month} cx={x(i)} cy={y(d.avgViews)} r={3.5} fill={color}>
          <title>
            {d.month} · {fmtViews(d.avgViews)} avg views ({d.postCount} posts)
          </title>
        </circle>
      ))}
      <text x={TREND_PAD} y={TREND_HEIGHT - 6} fontSize={9} fill="var(--muted-2)">
        {withViews[0].month}
      </text>
      <text x={TREND_WIDTH - TREND_PAD} y={TREND_HEIGHT - 6} fontSize={9} fill="var(--muted-2)" textAnchor="end">
        {withViews[withViews.length - 1].month}
      </text>
    </svg>
  );
}
