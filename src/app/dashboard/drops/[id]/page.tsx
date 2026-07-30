"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTRPC } from "@/lib/trpc";
import { useNow } from "@/lib/hooks";
import {
  computeDropStatus,
  formatDuration,
  formatTimeLeft,
  formatSince,
  summarizeUserAgent,
  getDropUrl,
} from "@/lib/utils";
import { Button, CopyButton, Segmented, Skeleton, StatusBadge } from "@/components/ui";
import { Sparkline } from "@/components/stats/Sparkline";
import { StatTile } from "@/components/stats/StatTile";

const WINDOWS = [
  { value: "60", label: "1h" },
  { value: "360", label: "6h" },
  { value: "1440", label: "24h" },
] as const;

export default function DropDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const trpc = useTRPC();
  const router = useRouter();
  const queryClient = useQueryClient();
  const now = useNow(1000);
  const [windowMinutes, setWindowMinutes] = useState<"60" | "360" | "1440">("60");

  const drop = useQuery(trpc.drop.get.queryOptions({ id }, { retry: false }));
  const stats = useQuery(
    trpc.stats.forDrop.queryOptions(
      { dropId: id, windowMinutes: Number(windowMinutes) },
      { refetchInterval: 10_000 },
    ),
  );
  const recent = useQuery(
    trpc.stats.recentViews.queryOptions({ dropId: id, limit: 25 }, { refetchInterval: 10_000 }),
  );

  const revokeMut = useMutation(
    trpc.drop.revoke.mutationOptions({
      onSuccess: () => {
        toast.success("Drop revoked");
        void queryClient.invalidateQueries(trpc.drop.get.queryFilter({ id }));
      },
      onError: (e) => toast.error(e.message),
    }),
  );
  const deleteMut = useMutation(
    trpc.drop.delete.mutationOptions({
      onSuccess: () => {
        toast.success("Drop deleted");
        router.replace("/dashboard");
      },
      onError: (e) => toast.error(e.message),
    }),
  );

  if (drop.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-1/2" />
        <Skeleton className="h-40" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (drop.isError || !drop.data) {
    return (
      <div className="py-16 text-center">
        <p className="text-ink-muted">Drop not found (or you don&apos;t have access).</p>
        <Link href="/dashboard" className="mt-4 inline-block text-sm text-accent-bright underline">
          Back to dashboard
        </Link>
      </div>
    );
  }

  const d = drop.data;
  const status = computeDropStatus({
    revokedAt: d.revokedAt ? new Date(d.revokedAt) : null,
    expiresAt: new Date(d.expiresAt),
    usedViews: d.usedViews,
    maxViews: d.maxViews,
    now,
  });
  const secondsLeft = Math.max(0, Math.floor((new Date(d.expiresAt).getTime() - now) / 1000));

  const timeline: { label: string; at: Date | null }[] = [
    { label: "Created", at: new Date(d.createdAt) },
    { label: "First view", at: d.firstViewedAt ? new Date(d.firstViewedAt) : null },
    { label: "Exhausted", at: d.exhaustedAt ? new Date(d.exhaustedAt) : null },
    { label: "Revoked", at: d.revokedAt ? new Date(d.revokedAt) : null },
    { label: "Purged", at: d.purgedAt ? new Date(d.purgedAt) : null },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/dashboard" className="text-sm text-ink-faint hover:text-ink-muted">
            ← Dashboard
          </Link>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold">{d.title}</h1>
            <StatusBadge status={status} />
            {d.encVersion > 0 && (
              <span className="rounded bg-surface-2 px-2 py-0.5 text-xs text-ink-faint">
                {d.passwordProtected ? "E2E + passphrase" : "E2E encrypted"}
              </span>
            )}
          </div>
          <p className="mt-1 font-mono text-sm text-ink-faint">/d/{d.token}</p>
        </div>
        <div className="flex gap-2">
          {(d.encVersion === 0 || d.passwordProtected) && status === "active" && (
            <CopyButton text={getDropUrl(d.token)} label="Copy link" size="md" />
          )}
          {status === "active" && (
            <Button
              variant="ghost"
              onClick={() => revokeMut.mutate({ id })}
              loading={revokeMut.isPending}
            >
              Revoke
            </Button>
          )}
          <Button
            variant="danger"
            onClick={() => {
              if (confirm("Permanently delete this drop and its view history?")) {
                deleteMut.mutate({ id });
              }
            }}
            loading={deleteMut.isPending}
          >
            Delete
          </Button>
        </div>
      </div>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile
          label="Views used"
          value={`${d.usedViews}/${d.maxViews}`}
          hint={
            status === "active" ? `${Math.max(0, d.maxViews - d.usedViews)} remaining` : undefined
          }
        />
        <StatTile
          label="Time left"
          value={status === "active" ? formatTimeLeft(secondsLeft) : "—"}
          hint={`TTL ${formatDuration(d.ttlMs)}`}
        />
        <StatTile
          label="Time to first view"
          value={
            stats.data?.timeToFirstSec != null ? formatTimeLeft(stats.data.timeToFirstSec) : "—"
          }
        />
        <StatTile
          label="Unique networks"
          value={stats.data?.uniqueNetworks ?? "—"}
          hint="IPs truncated for privacy"
        />
      </section>

      <section className="rounded-2xl border border-line bg-surface p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-semibold">Views per minute</h2>
          <Segmented
            value={windowMinutes}
            onChange={setWindowMinutes}
            options={[...WINDOWS]}
            size="sm"
          />
        </div>
        <Sparkline
          data={(stats.data?.perMinute ?? []).map((p) => ({ t: new Date(p.t), c: p.c }))}
          windowMinutes={Number(windowMinutes)}
          endMs={now}
        />
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-line bg-surface p-5">
          <h2 className="mb-4 font-semibold">Lifecycle</h2>
          <ol className="space-y-3">
            {timeline.map((t) => (
              <li key={t.label} className="flex items-center gap-3 text-sm">
                <span
                  className={
                    t.at
                      ? "block size-2 rounded-full bg-accent"
                      : "block size-2 rounded-full bg-line"
                  }
                />
                <span className={t.at ? "text-ink" : "text-ink-faint"}>{t.label}</span>
                <span className="ml-auto font-mono text-xs text-ink-faint">
                  {t.at ? t.at.toLocaleString() : "—"}
                </span>
              </li>
            ))}
          </ol>
        </section>

        <section className="rounded-2xl border border-line bg-surface p-5">
          <h2 className="mb-4 font-semibold">Recent views</h2>
          {recent.data?.views.length ? (
            <ul className="space-y-2">
              {recent.data.views.map((v) => (
                <li
                  key={v.id}
                  className="flex items-center justify-between gap-3 border-b border-line pb-2 text-sm last:border-0"
                >
                  <span className="text-ink-muted">{summarizeUserAgent(v.ua)}</span>
                  <span className="font-mono text-xs text-ink-faint">{v.ip ?? "—"}</span>
                  <span className="text-xs whitespace-nowrap text-ink-faint">
                    {formatSince(new Date(v.viewedAt), now)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-ink-faint">No views recorded yet.</p>
          )}
        </section>
      </div>
    </div>
  );
}
