"use client";

import { useState, useMemo, useCallback } from "react";
import { createTRPCReact } from "@trpc/react-query";
import type { AppRouter } from "@/server/trpc/root";
import { httpBatchLink } from "@trpc/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useDashboardStore } from "@/store/useDashboardStore";
import { useNow, useCopyToClipboard } from "@/lib/hooks";
import { computeDropStatus } from "@/lib/utils";
import { Button, Input, Select, StatusBadge } from "@/components/ui";
import { CreateDropForm } from "@/components/CreateDropForm";
import { DropCard } from "@/components/DropCard";
import type { DropKind, DropStatus } from "@/lib/types";

// tRPC setup
const api = createTRPCReact<AppRouter>();
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5000,
      refetchOnWindowFocus: true,
    },
  },
});

const trpcClient = api.createClient({
  links: [
    httpBatchLink({
      url: "/api/trpc",
      fetch: (url, opts) => fetch(url, { ...opts, credentials: "include" }),
    }),
  ],
});

// Filter options
const FILTER_OPTIONS = [
  { value: "all", label: "All drops" },
  { value: "mine", label: "My drops" },
  { value: "active", label: "Active" },
  { value: "expired", label: "Expired" },
  { value: "exhausted", label: "Exhausted" },
  { value: "revoked", label: "Revoked" },
];

const SORT_OPTIONS = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
];

// Types
interface DropItem {
  id: string;
  token: string;
  title: string;
  kind: DropKind;
  maxViews: number;
  usedViews: number;
  expiresAt: Date;
  revokedAt: Date | null;
  firstViewedAt: Date | null;
  lastViewedAt: Date | null;
  exhaustedAt: Date | null;
  createdAt: Date;
  ownerId: string | null;
}

export default function DashboardPage() {
  return (
    <api.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <Dashboard />
      </QueryClientProvider>
    </api.Provider>
  );
}

function Dashboard() {
  const router = useRouter();
  const now = useNow(1000);
  const { filter, setFilter, search, setSearch, sort, setSort } = useDashboardStore();

  // Queries
  const me = api.auth.me.useQuery();
  const list = api.drop.list.useQuery(undefined, {
    refetchInterval: 8000,
  });

  // Mutations
  const utils = api.useUtils();
  const createMut = api.drop.create.useMutation({
    onSuccess: () => {
      utils.drop.list.invalidate();
    },
  });
  const revokeMut = api.drop.revoke.useMutation({
    onSuccess: () => {
      utils.drop.list.invalidate();
    },
  });
  const logoutMut = api.auth.logout.useMutation({
    onSuccess: async () => {
      await utils.auth.me.invalidate();
      router.replace("/");
      router.refresh();
    },
  });

  // Process and filter items
  const items = useMemo(() => {
    const rawItems = list.data?.items ?? [];

    // Map to proper dates
    const mapped: DropItem[] = rawItems.map((raw) => ({
      ...raw,
      expiresAt: new Date(raw.expiresAt),
      revokedAt: raw.revokedAt ? new Date(raw.revokedAt) : null,
      firstViewedAt: raw.firstViewedAt ? new Date(raw.firstViewedAt) : null,
      lastViewedAt: raw.lastViewedAt ? new Date(raw.lastViewedAt) : null,
      exhaustedAt: raw.exhaustedAt ? new Date(raw.exhaustedAt) : null,
      createdAt: new Date(raw.createdAt),
    }));

    // Filter
    const query = search.trim().toLowerCase();
    const filtered = mapped.filter((d) => {
      // Search filter
      const matchesSearch =
        !query ||
        d.title.toLowerCase().includes(query) ||
        d.token.toLowerCase().includes(query);

      // Status filter
      const status = computeDropStatus({
        revokedAt: d.revokedAt,
        expiresAt: d.expiresAt,
        usedViews: d.usedViews,
        maxViews: d.maxViews,
        now,
      });

      // Mine filter
      const matchesMine =
        filter !== "mine" || (me.data?.id && d.ownerId === me.data.id);

      // Status filter
      const matchesStatus =
        filter === "all" ||
        filter === "mine" ||
        filter === status;

      return matchesSearch && matchesMine && matchesStatus;
    });

    // Sort
    return filtered.sort((a, b) => {
      const aTime = a.createdAt.getTime();
      const bTime = b.createdAt.getTime();
      return sort === "oldest" ? aTime - bTime : bTime - aTime;
    });
  }, [list.data?.items, search, filter, sort, now, me.data?.id]);

  // Loading state
  if (me.isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-white/60">Loading...</div>
      </div>
    );
  }

  // Not authenticated - show bootstrap
  if (!me.data) {
    return <BootstrapOwner />;
  }

  const isAdmin = me.data.role === "owner" || me.data.role === "admin";

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="max-w-5xl mx-auto p-6">
        {/* Header */}
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-semibold">Dashboard</h1>
            <p className="text-sm text-white/50 mt-1">
              Manage your ephemeral drops
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-white/60">
              <span className="font-medium text-white">{me.data.displayName}</span>
              <span className="text-white/40 ml-1">({me.data.role})</span>
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => logoutMut.mutate()}
              loading={logoutMut.isPending}
            >
              Sign out
            </Button>
          </div>
        </header>

        {/* Action cards */}
        <section className="grid md:grid-cols-2 gap-4 mb-8">
          {/* Create drop */}
          <div className="p-5 rounded-2xl border border-white/10 bg-white/[0.02]">
            <h2 className="font-semibold mb-4">Create Drop</h2>
            <CreateDropForm
              onSubmit={(input) => createMut.mutate(input)}
              isLoading={createMut.isPending}
            />
            {createMut.isSuccess && createMut.data && (
              <div className="mt-3 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                <p className="text-sm text-emerald-400">
                  Drop created! Link: <code className="font-mono">{createMut.data.url}</code>
                </p>
              </div>
            )}
            {createMut.isError && (
              <div className="mt-3 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                <p className="text-sm text-red-400">{createMut.error.message}</p>
              </div>
            )}
          </div>

          {/* Create invite (admin only) */}
          {isAdmin && <InviteCard />}
        </section>

        {/* Filters */}
        <section className="flex flex-wrap items-center gap-3 mb-6">
          <Select
            value={filter}
            onChange={(e) => setFilter(e.target.value as typeof filter)}
            options={FILTER_OPTIONS}
          />
          <Input
            placeholder="Search by title or token..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 min-w-[200px]"
          />
          <Select
            value={sort}
            onChange={(e) => setSort(e.target.value as typeof sort)}
            options={SORT_OPTIONS}
          />
        </section>

        {/* Drop list */}
        <section>
          {list.isLoading && (
            <div className="text-center py-12 text-white/50">Loading drops...</div>
          )}
          {list.isError && (
            <div className="text-center py-12 text-red-400">
              Failed to load drops. Please try again.
            </div>
          )}
          {list.isSuccess && items.length === 0 && (
            <div className="text-center py-12 text-white/50">
              {search ? "No drops match your search." : "No drops yet. Create one above!"}
            </div>
          )}
          {list.isSuccess && items.length > 0 && (
            <div className="space-y-3">
              {items.map((drop) => (
                <DropCard
                  key={drop.id}
                  drop={drop}
                  now={now}
                  onRevoke={(id) => revokeMut.mutate({ id })}
                  isRevoking={revokeMut.isPending}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function BootstrapOwner() {
  const router = useRouter();
  const utils = api.useUtils();
  const [name, setName] = useState("");

  const bootstrap = api.auth.bootstrapOwner.useMutation({
    onSuccess: async (res) => {
      if (res.ok) {
        await utils.auth.me.invalidate();
        router.refresh();
      }
    },
  });

  return (
    <div className="min-h-screen flex items-center justify-center bg-black text-white p-6">
      <div className="w-full max-w-md p-6 rounded-2xl border border-white/10 bg-white/[0.02]">
        <h1 className="text-xl font-semibold">Welcome to Ephemera</h1>
        <p className="text-sm text-white/50 mt-2">
          Create the initial owner account to get started.
        </p>

        <form
          className="mt-6 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            const displayName = name.trim();
            if (displayName && !bootstrap.isPending) {
              bootstrap.mutate({ displayName });
            }
          }}
        >
          <Input
            placeholder="Your display name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
          <Button
            type="submit"
            variant="primary"
            className="w-full"
            loading={bootstrap.isPending}
            disabled={!name.trim()}
          >
            Create Owner Account
          </Button>
        </form>

        {bootstrap.isError && (
          <p className="mt-4 text-sm text-red-400">{bootstrap.error.message}</p>
        )}
      </div>
    </div>
  );
}

function InviteCard() {
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const { copied, copy } = useCopyToClipboard();

  const createInvite = api.auth.createInvite.useMutation({
    onSuccess: (res) => {
      if (res.ok) {
        setInviteUrl(`${window.location.origin}${res.url}`);
      }
    },
  });

  return (
    <div className="p-5 rounded-2xl border border-white/10 bg-white/[0.02]">
      <h2 className="font-semibold mb-4">Create Invite</h2>
      <p className="text-sm text-white/50 mb-4">
        Generate a one-time invite link for new users.
      </p>

      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          onClick={() => createInvite.mutate({ expiresMinutes: 60 })}
          loading={createInvite.isPending}
        >
          Generate Invite (1h)
        </Button>
        {inviteUrl && (
          <Button variant="ghost" onClick={() => copy(inviteUrl)}>
            {copied ? "Copied!" : "Copy URL"}
          </Button>
        )}
      </div>

      {inviteUrl && (
        <div className="mt-3 p-3 rounded-lg bg-white/5 border border-white/10">
          <p className="text-xs font-mono text-white/60 break-all">{inviteUrl}</p>
        </div>
      )}

      {createInvite.isError && (
        <p className="mt-3 text-sm text-red-400">{createInvite.error.message}</p>
      )}
    </div>
  );
}
