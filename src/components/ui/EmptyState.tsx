"use client";

interface EmptyStateProps {
  title: string;
  hint?: string;
  action?: React.ReactNode;
}

export function EmptyState({ title, hint, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-line px-6 py-14 text-center">
      <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-ember-soft">
        <span className="block size-3 animate-ember-pulse rounded-full bg-ember" />
      </div>
      <p className="font-medium text-ink">{title}</p>
      {hint && <p className="mt-1 max-w-sm text-sm text-ink-faint">{hint}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
