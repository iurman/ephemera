"use client";

interface EmptyStateProps {
  title: string;
  hint?: string;
  action?: React.ReactNode;
}

export function EmptyState({ title, hint, action }: EmptyStateProps) {
  return (
    <div className="border-line flex flex-col items-center rounded-2xl border border-dashed px-6 py-14 text-center">
      <div className="bg-ember-soft mb-4 flex size-12 items-center justify-center rounded-full">
        <span className="bg-ember animate-ember-pulse block size-3 rounded-full" />
      </div>
      <p className="text-ink font-medium">{title}</p>
      {hint && <p className="text-ink-faint mt-1 max-w-sm text-sm">{hint}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
