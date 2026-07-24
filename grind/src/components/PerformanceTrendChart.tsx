import { PLATFORM_META, type Platform } from "../lib/releaseToolkit";
import type { PerformanceEntry } from "../data/useReleaseData";

interface PerformanceTrendChartProps {
  entries: PerformanceEntry[];
}

const WIDTH = 440;
const HEIGHT = 160;
const PAD = 28;

export function PerformanceTrendChart({ entries }: PerformanceTrendChartProps) {
  if (entries.length === 0) {
    return (
      <div className="grind-card" style={{ padding: 24, textAlign: "center", color: "var(--muted-2)", fontSize: 13 }}>
        Log a post to start seeing view trends.
      </div>
    );
  }

  const byPlatform: Partial<Record<Platform, PerformanceEntry[]>> = {};
  for (const e of entries) {
    (byPlatform[e.platform] ??= []).push(e);
  }
  for (const key of Object.keys(byPlatform) as Platform[]) {
    byPlatform[key]!.sort((a, b) => a.post_date.localeCompare(b.post_date));
  }

  const allDates = entries.map((e) => new Date(e.post_date + "T00:00:00").getTime());
  const minDate = Math.min(...allDates);
  const maxDate = Math.max(...allDates);
  const dateSpan = Math.max(1, maxDate - minDate);
  const maxViews = Math.max(1, ...entries.map((e) => e.views));

  const x = (dateStr: string) => {
    const t = new Date(dateStr + "T00:00:00").getTime();
    return PAD + ((t - minDate) / dateSpan) * (WIDTH - PAD * 2);
  };
  const y = (views: number) => HEIGHT - PAD - (views / maxViews) * (HEIGHT - PAD * 2);

  const platforms = (Object.keys(byPlatform) as Platform[]).sort(
    (a, b) => Object.keys(PLATFORM_META).indexOf(a) - Object.keys(PLATFORM_META).indexOf(b)
  );

  return (
    <div className="grind-card" style={{ padding: 16 }}>
      <div style={{ display: "flex", gap: 14, marginBottom: 10, flexWrap: "wrap" }}>
        {platforms.map((p) => (
          <div key={p} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "var(--muted)" }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: PLATFORM_META[p].color, display: "inline-block" }} />
            {PLATFORM_META[p].label}
          </div>
        ))}
      </div>

      <svg width="100%" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label="Views over time by platform">
        {[0.25, 0.5, 0.75].map((f) => (
          <line
            key={f}
            x1={PAD}
            x2={WIDTH - PAD}
            y1={PAD + f * (HEIGHT - PAD * 2)}
            y2={PAD + f * (HEIGHT - PAD * 2)}
            stroke="var(--border)"
            strokeWidth={1}
          />
        ))}

        <text x={PAD} y={PAD - 8} fontSize={9} fill="var(--muted-2)">
          {maxViews.toLocaleString()} views
        </text>

        {platforms.map((p) => {
          const rows = byPlatform[p]!;
          const color = PLATFORM_META[p].color;
          const points = rows.map((r) => `${x(r.post_date)},${y(r.views)}`).join(" ");
          return (
            <g key={p}>
              {rows.length > 1 && (
                <polyline points={points} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
              )}
              {rows.map((r) => (
                <circle key={r.id} cx={x(r.post_date)} cy={y(r.views)} r={4} fill={color}>
                  <title>
                    {PLATFORM_META[p].label} · {r.post_date} · {r.views.toLocaleString()} views
                  </title>
                </circle>
              ))}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
