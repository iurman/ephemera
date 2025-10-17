"use client";

import { createTRPCReact } from "@trpc/react-query";
import type { AppRouter } from "@/server/trpc/root";
import { httpBatchLink } from "@trpc/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useMemo, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useDashboardStore } from "@/store/useDashboardStore";

const api = createTRPCReact<AppRouter>();
const queryClient = new QueryClient();

// IMPORTANT: send/receive cookies on every request
const trpcClient = api.createClient({
  links: [
    httpBatchLink({
      url: "/api/trpc",
      fetch: (url, opts) => fetch(url, { ...opts, credentials: "include" }),
    }),
  ],
});

type DropItem = {
  id: string;
  token: string;
  title: string;
  kind: "text" | "url";
  maxViews: number;
  usedViews: number;
  expiresAt: string | Date;
  revokedAt?: string | Date | null;
  firstViewedAt?: string | Date | null;
  lastViewedAt?: string | Date | null;
  exhaustedAt?: string | Date | null;
  createdAt?: string | Date | null;
  ownerId?: string | null;
};

function useNow(tickMs = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    let id: number | null = null,
      running = true;
    const tick = () => {
      setNow(Date.now());
      const next = document.hidden ? 2000 : tickMs;
      if (running) id = window.setTimeout(tick, next);
    };
    id = window.setTimeout(tick, tickMs);
    return () => {
      running = false;
      if (id) clearTimeout(id);
    };
  }, [tickMs]);
  return now;
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
  const me = api.auth.me.useQuery();
  const now = useNow(1000);
  const { filter, setFilter, search, setSearch, sort, setSort } =
    useDashboardStore();

  const list = api.drop.list.useQuery(undefined, {
    refetchInterval: 8000,
    refetchOnWindowFocus: true,
    staleTime: 5000,
  });
  // ---- map, filter, sort (Zustand state) ----
  const rawItems = list.data?.items ?? [];
  const items: DropItem[] = useMemo(() => {
    const mapped: DropItem[] = rawItems.map((raw: any) => ({
      ...raw,
      expiresAt: raw.expiresAt ? new Date(raw.expiresAt) : null,
      revokedAt: raw.revokedAt ? new Date(raw.revokedAt) : null,
      firstViewedAt: raw.firstViewedAt ? new Date(raw.firstViewedAt) : null,
      lastViewedAt: raw.lastViewedAt ? new Date(raw.lastViewedAt) : null,
      exhaustedAt: raw.exhaustedAt ? new Date(raw.exhaustedAt) : null,
      createdAt: raw.createdAt ? new Date(raw.createdAt) : null,
    }));

    const q = search.trim().toLowerCase();

    const filtered = mapped.filter((d) => {
      // search
      const matchesQ =
        !q ||
        (d.title ?? "").toLowerCase().includes(q) ||
        (d.token ?? "").toLowerCase().includes(q);

      // compute status for filter
      const expMs = d.expiresAt ? new Date(d.expiresAt as any).getTime() : 0;
      const secondsLeft = Math.max(0, Math.floor((expMs - now) / 1000));
      const viewsLeft = Math.max(0, d.maxViews - d.usedViews);
      const status = computeStatus({
        revokedAt: (d.revokedAt as any) ?? null,
        secondsLeft,
        viewsLeft,
      });

      // "Mine" filter (gracefully no-op if ownerId missing)
      const mineOk =
        filter !== "mine"
          ? true
          : me.data?.id && d.ownerId
          ? d.ownerId === me.data.id
          : true;

      const statusOk =
        filter === "all" || filter === "mine"
          ? true
          : (filter === "active" && status === "Active") ||
            (filter === "expired" && status === "Expired") ||
            (filter === "exhausted" && status === "Exhausted") ||
            (filter === "revoked" && status === "Revoked");

      return matchesQ && mineOk && statusOk;
    });

    const sorted =
      sort === "oldest"
        ? filtered.sort(
            (a, b) => +(a.createdAt ?? 0) - +(b.createdAt ?? 0),
          )
        : filtered.sort(
            (a, b) => +(b.createdAt ?? 0) - +(a.createdAt ?? 0),
          );

    return sorted;
  }, [rawItems, search, filter, sort, now, me.data?.id]);
  // -------------------------------------------
  const utils = api.useUtils();
  const createMut = api.drop.create.useMutation({
    onSettled: () => utils.drop.list.invalidate(),
  });
  const revokeMut = api.drop.revoke.useMutation({
    onSettled: () => utils.drop.list.invalidate(),
  });
  const logoutMut = api.auth.logout.useMutation({
    onSuccess: async () => {
      await utils.auth.me.invalidate();
      router.replace("/");
      router.refresh();
    },
  });

  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const createInvite = api.auth.createInvite.useMutation({
    onSuccess: (res) => res.ok && setInviteUrl(`${location.origin}${res.url}`),
  });

  if (me.isLoading) return <div className="p-6">Checking session…</div>;
  if (!me.data) return <BootstrapOwner />;


  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <div className="flex items-center gap-3 text-sm text-white/70">
          <a
            href="/dev-login"
            className="px-2 py-1 rounded border border-white/20 hover:bg-white/10"
          >
            dev-login
          </a>
          <span>
            Signed in as <b>{me.data.displayName}</b> ({me.data.role})
          </span>
          <button
            className="px-3 py-1 rounded border border-white/20 hover:bg-white/10 disabled:opacity-50"
            onClick={() => logoutMut.mutate()}
            disabled={logoutMut.isLoading}
          >
            {logoutMut.isLoading ? "Signing out…" : "Sign out"}
          </button>
        </div>
      </header>

      {/* Filters / Search / Sort */}
      <section className="flex flex-wrap items-center gap-2 -mt-2">
        <select
          className="border p-2 rounded"
          value={filter}
          onChange={(e) => setFilter(e.target.value as any)}
        >
          <option value="all">All</option>
          <option value="mine">My drops</option>
          <option value="active">Active</option>
          <option value="expired">Expired</option>
          <option value="exhausted">Exhausted</option>
          <option value="revoked">Revoked</option>
        </select>

        <input
          className="border p-2 rounded min-w-[220px] flex-1"
          placeholder="Search title or token…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <select
          className="border p-2 rounded"
          value={sort}
          onChange={(e) => setSort(e.target.value as any)}
        >
          <option value="newest">Newest</option>
          <option value="oldest">Oldest</option>
        </select>
      </section>

      <section className="grid md:grid-cols-2 gap-4">
        <div className="border rounded-xl p-4 space-y-3">
          <h2 className="font-semibold">Create Drop</h2>
          <CreateDrop onCreate={(p) => createMut.mutate(p)} />
        </div>

        {(me.data.role === "owner" || me.data.role === "admin") && (
          <div className="border rounded-xl p-4 space-y-3">
            <h2 className="font-semibold">Create Invite</h2>
            <div className="flex items-center gap-2">
              <button
                className="px-3 py-2 rounded border"
                onClick={() => createInvite.mutate({ expiresMinutes: 60 })}
                disabled={createInvite.isLoading}
              >
                New invite (60m)
              </button>
              {inviteUrl && (
                <button
                  className="px-3 py-2 rounded border"
                  onClick={() => navigator.clipboard.writeText(inviteUrl)}
                >
                  Copy URL
                </button>
              )}
            </div>
            {inviteUrl && (
              <div className="text-xs break-all text-white/60">
                {inviteUrl}
              </div>
            )}
          </div>
        )}
      </section>

      {list.isLoading && <div>Loading…</div>}
      {list.isError && <div className="text-red-500">Failed to load.</div>}

      <ul className="divide-y">
        {items.map((d) => {
          const expMs = d.expiresAt ? new Date(d.expiresAt as any).getTime() : 0;
          const secondsLeft = Math.max(0, Math.floor((expMs - now) / 1000));
          const viewsLeft = Math.max(0, d.maxViews - d.usedViews);

          const status = computeStatus({
            revokedAt: (d.revokedAt as any) ?? null,
            secondsLeft,
            viewsLeft,
          });
          const timeLeftLabel =
            status === "Active" ? formatTimeLeft(secondsLeft) : undefined;

          return (
            <li key={d.id} className="py-3 flex items-center justify-between">
              <div>
                <div className="font-medium">
                  {d.title}{" "}
                  <span className="text-xs text-white/50">[{d.kind}]</span>
                </div>
                <div className="text-sm text-white/60">
                  <a
                    className={`underline ${
                      status !== "Active"
                        ? "pointer-events-none opacity-60"
                        : ""
                    }`}
                    href={`/d/${d.token}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    /d/{d.token}
                  </a>{" "}
                  · {d.usedViews}/{d.maxViews} views{" "}
                  {timeLeftLabel && <>· {timeLeftLabel} left</>} {" · "}
                  <StatusBadge status={status} />
                </div>

                {/* stats line */}
                <div className="text-xs text-white/50 mt-1">
                  {d.createdAt && d.firstViewedAt && (
                    <>
                      first view in{" "}
                      {formatDuration(
                        d.firstViewedAt.getTime() - d.createdAt.getTime(),
                      )}
                    </>
                  )}
                  {d.firstViewedAt && d.exhaustedAt && (
                    <>
                      {" · "}exhausted in{" "}
                      {formatDuration(
                        d.exhaustedAt.getTime() - d.firstViewedAt.getTime(),
                      )}
                    </>
                  )}
                  {d.lastViewedAt && (
                    <> {" · "}last viewed {formatSince(d.lastViewedAt, now)}</>
                  )}
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  className="border px-2 py-1 rounded"
                  onClick={() =>
                    navigator.clipboard.writeText(
                      `${location.origin}/d/${d.token}`,
                    )
                  }
                >
                  Copy
                </button>
                <button
                  className="border px-2 py-1 rounded disabled:opacity-50"
                  disabled={status !== "Active"}
                  onClick={() => revokeMut.mutate({ id: d.id })}
                >
                  Revoke
                </button>
              </div>
            </li>
          );
        })}
      </ul>
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
        router.refresh(); // ensures the new cookie session is picked up in queries
      }
    },
  });

  return (
    <div className="min-h-screen grid place-items-center bg-black text-white p-6">
      <div className="border border-white/10 rounded-2xl p-6 max-w-md w-full bg-white/5 backdrop-blur">
        <h1 className="text-xl font-semibold">Bootstrap owner</h1>
        <p className="text-sm text-white/60">
          Fresh database detected. Create the initial <b>owner</b> account.
        </p>

        <form
          className="mt-4 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            const n = name.trim();
            if (!n || bootstrap.isLoading) return;
            bootstrap.mutate({ displayName: n });
          }}
        >
          <input
            className="border border-white/10 rounded p-2 w-full bg-black/40 outline-none focus:ring-2 focus:ring-white/20"
            placeholder="Display name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
          <button
            type="submit"
            className="w-full px-3 py-2 rounded bg-white text-black disabled:opacity-50"
            disabled={!name.trim() || bootstrap.isLoading}
          >
            {bootstrap.isLoading ? "Creating…" : "Create owner"}
          </button>
        </form>

        <div className="mt-4 text-xs text-white/60">
          For local testing, you can also{" "}
          <a className="underline" href="/dev-login">
            use dev-login
          </a>
          .
        </div>
      </div>
    </div>
  );
}

function CreateDrop({
  onCreate,
}: {
  onCreate: (p: {
    title: string;
    body: string;
    ttlMs: number;
    maxViews: number;
    kind: "text" | "url";
  }) => void;
}) {
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<"text" | "url">("text");
  const [body, setBody] = useState("");
  const [ttl, setTtl] = useState(10 * 1000);
  const [maxV, setMaxV] = useState(1);

  const canCreate =
    title.trim() &&
    body.trim() &&
    maxV > 0 &&
    (kind === "text" || /^https?:\/\//i.test(body));

  return (
    <div className="space-y-2">
      <input
        className="border p-2 rounded w-full"
        placeholder="Title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <div className="flex gap-2">
        <select
          className="border p-2 rounded"
          value={kind}
          onChange={(e) => setKind(e.target.value as any)}
        >
          <option value="text">Text</option>
          <option value="url">Redirect (URL)</option>
        </select>
        <select
          className="border p-2 rounded"
          value={ttl}
          onChange={(e) => setTtl(Number(e.target.value))}
        >
          <option value={10 * 1000}>10 seconds (test)</option>
          <option value={1 * 60 * 1000}>1 minute (test)</option>
          <option value={2 * 60 * 1000}>2 minutes (test)</option>
          <option value={5 * 60 * 1000}>5 minutes (test)</option>
          <option value={6 * 60 * 1000}>6 minutes (test)</option>
          <option value={10 * 60 * 1000}>10 minutes</option>
          <option value={60 * 60 * 1000}>1 hour</option>
          <option value={24 * 60 * 60 * 1000}>1 day</option>
        </select>
        <input
          className="border p-2 rounded w-24"
          type="number"
          min={1}
          max={100}
          value={maxV}
          onChange={(e) => setMaxV(parseInt(e.target.value || "1", 10))}
        />
      </div>
      <textarea
        className="border p-2 rounded w-full h-32"
        placeholder={kind === "url" ? "https://example.com" : "Body (text)"}
        value={body}
        onChange={(e) => setBody(e.target.value)}
      />
      <div className="flex justify-end">
        <button
          className="px-3 py-2 rounded bg-black text-white disabled:opacity-50"
          disabled={!canCreate}
          onClick={() =>
            onCreate({ title, body, ttlMs: ttl, maxViews: maxV, kind })
          }
        >
          Create
        </button>
      </div>
    </div>
  );
}

function computeStatus({
  revokedAt,
  secondsLeft,
  viewsLeft,
}: {
  revokedAt: Date | null;
  secondsLeft: number;
  viewsLeft: number;
}) {
  if (revokedAt) return "Revoked" as const;
  if (secondsLeft <= 0) return "Expired" as const;
  if (viewsLeft <= 0) return "Exhausted" as const;
  return "Active" as const;
}

function formatTimeLeft(totalSeconds: number) {
  if (totalSeconds > 5 * 60) return `~${Math.ceil(totalSeconds / 60)}m`;
  if (totalSeconds >= 60) {
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  }
  return `${totalSeconds}s`;
}
function formatDuration(ms: number) {
  if (ms <= 0) return "0s";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (s < 5 * 60) return `${m}:${String(r).padStart(2, "0")}`;
  return `~${Math.ceil(m)}m`;
}
function formatSince(then: Date, nowMs: number) {
  return formatDuration(Math.max(0, nowMs - then.getTime())) + " ago";
}

function StatusBadge({
  status,
}: {
  status: "Active" | "Revoked" | "Expired" | "Exhausted";
}) {
  const styles = useMemo(() => {
    switch (status) {
      case "Active":
        return { bg: "#e6ffed", fg: "#036600" };
      case "Revoked":
        return { bg: "#ffeaea", fg: "#a10000" };
      case "Expired":
        return { bg: "#f2f2f2", fg: "#555" };
      case "Exhausted":
        return { bg: "#fff5e6", fg: "#8a4b00" };
    }
  }, [status]);
  return (
    <span
      style={{
        background: styles.bg,
        color: styles.fg,
        borderRadius: 8,
        padding: "2px 8px",
        fontSize: 12,
      }}
    >
      {status}
    </span>
  );
}
