"use client";

interface StatTileProps {
  label: string;
  value: string | number;
  hint?: string;
}

export function StatTile({ label, value, hint }: StatTileProps) {
  return (
    <div className="bg-surface border-line rounded-2xl border p-4">
      <p className="text-ink-faint text-xs tracking-wide uppercase">{label}</p>
      <p className="text-ink mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {hint && <p className="text-ink-faint mt-0.5 text-xs">{hint}</p>}
    </div>
  );
}
