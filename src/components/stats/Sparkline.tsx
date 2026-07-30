"use client";

import { useMemo, useState } from "react";

interface Point {
  t: Date;
  c: number;
}

interface SparklineProps {
  data: Point[];
  windowMinutes: number;
  /** Right edge of the time axis (pass a ticking `useNow` value). */
  endMs: number;
  height?: number;
}

/**
 * Single-series views-per-minute line. One hue (accent, validated on this
 * surface), 2px stroke, recessive axis, hover tooltip on the nearest bucket.
 */
export function Sparkline({ data, windowMinutes, endMs, height = 120 }: SparklineProps) {
  const width = 560;
  const pad = { top: 12, right: 8, bottom: 20, left: 8 };
  const [hover, setHover] = useState<{ x: number; y: number; point: Point } | null>(null);

  const { path, area, points, maxC, maxPoint } = useMemo(() => {
    const end = endMs;
    const start = end - windowMinutes * 60 * 1000;
    const innerW = width - pad.left - pad.right;
    const innerH = height - pad.top - pad.bottom;
    const maxC = Math.max(1, ...data.map((d) => d.c));

    const px = (t: number) => pad.left + ((t - start) / (end - start)) * innerW;
    const py = (c: number) => pad.top + innerH - (c / maxC) * innerH;

    const pts = data
      .filter((d) => d.t.getTime() >= start)
      .map((d) => ({ x: px(d.t.getTime()), y: py(d.c), point: d }));

    const path = pts.length
      ? pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ")
      : "";
    const area = pts.length
      ? `${path} L${pts[pts.length - 1].x.toFixed(1)},${(height - pad.bottom).toFixed(1)} L${pts[0].x.toFixed(1)},${(height - pad.bottom).toFixed(1)} Z`
      : "";

    const maxPoint = pts.reduce<(typeof pts)[number] | null>(
      (best, p) => (best === null || p.point.c > best.point.c ? p : best),
      null,
    );

    return { path, area, points: pts, maxC, maxPoint };
  }, [data, windowMinutes, endMs, height, pad.left, pad.right, pad.top, pad.bottom]);

  function onMove(e: React.MouseEvent<SVGSVGElement>) {
    if (!points.length) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * width;
    let best = points[0];
    for (const p of points) {
      if (Math.abs(p.x - x) < Math.abs(best.x - x)) best = p;
    }
    setHover(best);
  }

  if (!data.length) {
    return (
      <div className="flex items-center justify-center text-sm text-ink-faint" style={{ height }}>
        No views in this window yet.
      </div>
    );
  }

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full"
        role="img"
        aria-label={`Views per minute over the last ${windowMinutes} minutes; peak ${maxC}`}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
      >
        <line
          x1={pad.left}
          x2={width - pad.right}
          y1={height - pad.bottom}
          y2={height - pad.bottom}
          stroke="var(--color-line)"
        />
        <path d={area} fill="var(--color-accent)" opacity={0.12} />
        <path d={path} fill="none" stroke="var(--color-accent)" strokeWidth={2} />
        {points.map((p, i) => (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r={hover?.x === p.x ? 4 : 2.5}
            fill="var(--color-accent)"
          />
        ))}
        {maxPoint && (
          <text
            x={Math.min(maxPoint.x, width - 30)}
            y={Math.max(10, maxPoint.y - 8)}
            fontSize={11}
            fill="var(--color-ink-muted)"
            textAnchor="middle"
          >
            {maxPoint.point.c}
          </text>
        )}
        <text x={pad.left} y={height - 6} fontSize={10} fill="var(--color-ink-faint)">
          −{windowMinutes >= 60 ? `${Math.round(windowMinutes / 60)}h` : `${windowMinutes}m`}
        </text>
        <text
          x={width - pad.right}
          y={height - 6}
          fontSize={10}
          fill="var(--color-ink-faint)"
          textAnchor="end"
        >
          now
        </text>
      </svg>

      {hover && (
        <div
          className="pointer-events-none absolute z-10 rounded-lg border border-line-strong bg-surface-2 px-2.5 py-1.5 text-xs text-ink shadow-lg"
          style={{
            left: `${(hover.x / width) * 100}%`,
            top: 0,
            transform: `translateX(${hover.x > width / 2 ? "-110%" : "10%"})`,
          }}
        >
          <span className="font-medium">
            {hover.point.c} view{hover.point.c === 1 ? "" : "s"}
          </span>{" "}
          <span className="text-ink-faint">
            {hover.point.t.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </span>
        </div>
      )}
    </div>
  );
}
