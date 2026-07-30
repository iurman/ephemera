"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTRPC } from "@/lib/trpc";
import { useDashboardStore } from "@/store/useDashboardStore";
import { useNow } from "@/lib/hooks";
import { computeDropStatus } from "@/lib/utils";
import { Input, Segmented, Select, Skeleton, EmptyState, Button } from "@/components/ui";
import { CreateDropForm, type CreatedDrop } from "@/components/drops/CreateDropForm";
import { ShareResult } from "@/components/drops/ShareResult";
import { DropCard } from "@/components/drops/DropCard";
import { StatTile } from "@/components/stats/StatTile";
import type { DropListItem } from "@/lib/types";

const FILTER_OPTIONS = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "expired", label: "Expired" },
  { value: "exhausted", label: "Exhausted" },
  { value: "revoked", label: "Revoked" },
] as const;

export default function DashboardPage() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const now = useNow(1000);
  const { filter, setFilter, search, setSearch, sort, setSort } = useDashboardStore();
  const [created, setCreated] = useState<CreatedDrop | null>(null);
  const [invite, setInvite] = useState<string | null>(null);

  const me = useQuery(trpc.auth.me.queryOptions());
  const overview = useQuery(
    trpc.stats.overview.queryOptions({ windowMinutes: 24 * 60 }, { refetchInterval: 30_000 }),
  );
  const serverFilter = filter === "mine" ? "all" : filter;
  const list = useQuery(
    trpc.drop.list.queryOptions({ filter: serverFilter }, { refetchInterval: 8_000 }),
  );

  const invalidateDrops = () => {
    void queryClient.invalidateQueries(trpc.drop.list.queryFilter());
    void queryClient.invalidateQueries(trpc.stats.overview.queryFilter());
  };

  const revokeMut = useMutation(
    trpc.drop.revoke.mutationOptions({
      onSuccess: () => {
        toast.success("Drop revoked");
        invalidateDrops();
      },
      onError: (e) => toast.error(e.message),
    }),
  );
  const deleteMut = useMutation(
    trpc.drop.delete.mutationOptions({
      onSuccess: () => {
        toast.success("Drop deleted");
        invalidateDrops();
      },
      onError: (e) => toast.error(e.message),
    }),
  );
  const inviteMut = useMutation(
    trpc.auth.createInvite.mutationOptions({
      onSuccess: (res) => setInvite(`${window.location.origin}${res.url}`),
      onError: (e) => toast.error(e.message),
    }),
  );

  // Computed per render — the ticking clock invalidates this every second
  // anyway, and the list tops out at one page (≤100 rows).
  const items = (() => {
    const raw = list.data?.items ?? [];
    const mapped: DropListItem[] = raw.map((r) => ({
      ...r,
      expiresAt: new Date(r.expiresAt),
      revokedAt: r.revokedAt ? new Date(r.revokedAt) : null,
      firstViewedAt: r.firstViewedAt ? new Date(r.firstViewedAt) : null,
      lastViewedAt: r.lastViewedAt ? new Date(r.lastViewedAt) : null,
      exhaustedAt: r.exhaustedAt ? new Date(r.exhaustedAt) : null,
      purgedAt: r.purgedAt ? new Date(r.purgedAt) : null,
      createdAt: new Date(r.createdAt),
    }));

    const query = search.trim().toLowerCase();
    const filtered = mapped.filter((d) => {
      const matchesSearch =
        !query || d.title.toLowerCase().includes(query) || d.token.toLowerCase().includes(query);
      const matchesMine = filter !== "mine" || (me.data?.id && d.ownerId === me.data.id);
      const status = computeDropStatus({ ...d, now });
      const matchesStatus = filter === "all" || filter === "mine" || filter === status;
      return matchesSearch && matchesMine && matchesStatus;
    });

    return filtered.sort((a, b) => {
      const diff = a.createdAt.getTime() - b.createdAt.getTime();
      return sort === "oldest" ? diff : -diff;
    });
  })();

  const isPrivileged = me.data?.role === "owner" || me.data?.role === "admin";
  const busy = revokeMut.isPending || deleteMut.isPending;

  return (
    <div className="space-y-8">
      {/* Overview */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Active drops" value={overview.data?.activeDrops ?? "—"} />
        <StatTile label="Views · 24h" value={overview.data?.viewsInWindow ?? "—"} />
        <StatTile label="Total drops" value={overview.data?.totalDrops ?? "—"} />
        <StatTile label="Lifetime views" value={overview.data?.totalLifetimeViews ?? "—"} />
      </section>

      {/* Create + invite */}
      <section className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="bg-surface border-line rounded-2xl border p-5">
          <h2 className="mb-4 font-semibold">New drop</h2>
          <CreateDropForm onCreated={setCreated} />
        </div>

        <div className="space-y-4">
          <div className="bg-surface border-line rounded-2xl border p-5">
            <h2 className="font-semibold">How sharing works</h2>
            <ol className="text-ink-faint mt-3 list-decimal space-y-2 pl-4 text-sm leading-relaxed">
              <li>Your browser encrypts the drop; the server stores ciphertext.</li>
              <li>The one link you get holds the key in its #fragment.</li>
              <li>The recipient reveals it — then it burns.</li>
            </ol>
          </div>

          {isPrivileged && (
            <div className="bg-surface border-line rounded-2xl border p-5">
              <h2 className="font-semibold">Invite someone</h2>
              <p className="text-ink-faint mt-1.5 text-sm">
                One-time signup link, valid for an hour.
              </p>
              <div className="mt-3 flex items-center gap-2">
                <Button
                  variant="secondary"
                  onClick={() => inviteMut.mutate({ expiresMinutes: 60 })}
                  loading={inviteMut.isPending}
                >
                  Generate invite
                </Button>
                {invite && (
                  <Button
                    variant="ghost"
                    onClick={() => {
                      void navigator.clipboard.writeText(invite);
                      toast.success("Invite link copied");
                    }}
                  >
                    Copy
                  </Button>
                )}
              </div>
              {invite && (
                <p className="text-ink-faint bg-surface-2 mt-3 rounded-lg p-2 font-mono text-xs break-all">
                  {invite}
                </p>
              )}
            </div>
          )}
        </div>
      </section>

      {/* Drop list */}
      <section>
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <Segmented
            value={filter === "mine" ? "all" : filter}
            onChange={(f) => setFilter(f)}
            options={[...FILTER_OPTIONS]}
            size="sm"
          />
          {isPrivileged && (
            <label className="text-ink-faint flex items-center gap-1.5 text-xs">
              <input
                type="checkbox"
                checked={filter === "mine"}
                onChange={(e) => setFilter(e.target.checked ? "mine" : "all")}
                className="accent-ember size-3.5"
              />
              Mine only
            </label>
          )}
          <Input
            placeholder="Search by label or token…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-xs min-w-[180px] flex-1"
          />
          <Select
            value={sort}
            onChange={(e) => setSort(e.target.value as "newest" | "oldest")}
            options={[
              { value: "newest", label: "Newest first" },
              { value: "oldest", label: "Oldest first" },
            ]}
          />
        </div>

        {list.isLoading && (
          <div className="space-y-3">
            <Skeleton className="h-28" />
            <Skeleton className="h-28" />
          </div>
        )}
        {list.isError && (
          <p className="text-danger py-10 text-center text-sm">Failed to load drops.</p>
        )}
        {list.isSuccess && items.length === 0 && (
          <EmptyState
            title={search ? "No drops match your search" : "Nothing here yet"}
            hint={
              search
                ? "Try a different label or token."
                : "Create your first drop above — it'll appear here with live countdowns."
            }
          />
        )}
        {items.length > 0 && (
          <div className="space-y-3">
            {items.map((drop) => (
              <DropCard
                key={drop.id}
                drop={drop}
                now={now}
                onRevoke={(id) => revokeMut.mutate({ id })}
                onDelete={(id) => {
                  if (confirm("Permanently delete this drop and its view history?")) {
                    deleteMut.mutate({ id });
                  }
                }}
                busy={busy}
              />
            ))}
          </div>
        )}
      </section>

      <ShareResult drop={created} onClose={() => setCreated(null)} />
    </div>
  );
}
