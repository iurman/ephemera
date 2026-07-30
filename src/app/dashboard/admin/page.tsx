"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTRPC } from "@/lib/trpc";
import { useNow } from "@/lib/hooks";
import { formatSince, formatTimeLeft } from "@/lib/utils";
import { Button, Select, Skeleton } from "@/components/ui";
import { StatTile } from "@/components/stats/StatTile";

export default function AdminPage() {
  const trpc = useTRPC();
  const router = useRouter();
  const queryClient = useQueryClient();
  const now = useNow(5000);

  const me = useQuery(trpc.auth.me.queryOptions());
  const isPrivileged = me.data?.role === "owner" || me.data?.role === "admin";
  const isOwner = me.data?.role === "owner";

  useEffect(() => {
    if (!me.isLoading && me.data && !isPrivileged) router.replace("/dashboard");
  }, [me.isLoading, me.data, isPrivileged, router]);

  const overview = useQuery(trpc.admin.overview.queryOptions(undefined, { enabled: isPrivileged }));
  const usersQ = useQuery(trpc.admin.listUsers.queryOptions(undefined, { enabled: isPrivileged }));
  const invitesQ = useQuery(
    trpc.admin.listInvites.queryOptions(undefined, { enabled: isPrivileged }),
  );

  const refresh = () => {
    void queryClient.invalidateQueries(trpc.admin.listUsers.queryFilter());
    void queryClient.invalidateQueries(trpc.admin.listInvites.queryFilter());
    void queryClient.invalidateQueries(trpc.admin.overview.queryFilter());
  };

  const setRoleMut = useMutation(
    trpc.admin.setRole.mutationOptions({
      onSuccess: () => {
        toast.success("Role updated");
        refresh();
      },
      onError: (e) => toast.error(e.message),
    }),
  );
  const revokeSessionsMut = useMutation(
    trpc.admin.revokeUserSessions.mutationOptions({
      onSuccess: () => {
        toast.success("Sessions revoked");
        refresh();
      },
      onError: (e) => toast.error(e.message),
    }),
  );
  const deleteUserMut = useMutation(
    trpc.admin.deleteUser.mutationOptions({
      onSuccess: () => {
        toast.success("User deleted");
        refresh();
      },
      onError: (e) => toast.error(e.message),
    }),
  );
  const revokeInviteMut = useMutation(
    trpc.admin.revokeInvite.mutationOptions({
      onSuccess: () => {
        toast.success("Invite revoked");
        refresh();
      },
      onError: (e) => toast.error(e.message),
    }),
  );
  const purgeMut = useMutation(
    trpc.admin.purgeNow.mutationOptions({
      onSuccess: (r) => {
        toast.success(
          `Purged ${r.bodiesPurged} bodies, ${r.viewsDeleted} views, ${r.sessionsDeleted} sessions, ${r.invitesDeleted} invites`,
        );
        refresh();
      },
      onError: (e) => toast.error(e.message),
    }),
  );

  if (me.isLoading || !isPrivileged) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Admin</h1>
        <Button variant="secondary" onClick={() => purgeMut.mutate()} loading={purgeMut.isPending}>
          Run retention sweep now
        </Button>
      </div>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Users" value={overview.data?.users ?? "—"} />
        <StatTile label="Drops" value={overview.data?.drops ?? "—"} />
        <StatTile label="Purged drops" value={overview.data?.purgedDrops ?? "—"} />
        <StatTile label="Active sessions" value={overview.data?.activeSessions ?? "—"} />
      </section>

      <section className="rounded-2xl border border-line bg-surface p-5">
        <h2 className="mb-4 font-semibold">Users</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-line text-xs text-ink-faint uppercase">
                <th className="pr-4 pb-2 font-medium">User</th>
                <th className="pr-4 pb-2 font-medium">Role</th>
                <th className="pr-4 pb-2 font-medium">Drops</th>
                <th className="pr-4 pb-2 font-medium">Sessions</th>
                <th className="pb-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {usersQ.data?.map((u) => (
                <tr key={u.id} className="border-b border-line last:border-0">
                  <td className="py-3 pr-4">
                    <p className="font-medium text-ink">{u.displayName}</p>
                    <p className="text-xs text-ink-faint">{u.email ?? "no email"}</p>
                  </td>
                  <td className="py-3 pr-4">
                    {u.role === "owner" ? (
                      <span className="text-xs font-medium text-ember-bright">owner</span>
                    ) : isOwner ? (
                      <Select
                        value={u.role}
                        onChange={(e) =>
                          setRoleMut.mutate({
                            userId: u.id,
                            role: e.target.value as "admin" | "user",
                          })
                        }
                        options={[
                          { value: "user", label: "user" },
                          { value: "admin", label: "admin" },
                        ]}
                        className="py-1 text-xs"
                      />
                    ) : (
                      <span className="text-xs text-ink-muted">{u.role}</span>
                    )}
                  </td>
                  <td className="py-3 pr-4 text-ink-muted tabular-nums">{u.dropCount}</td>
                  <td className="py-3 pr-4 text-ink-muted tabular-nums">{u.activeSessions}</td>
                  <td className="py-3">
                    <div className="flex gap-1.5">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => revokeSessionsMut.mutate({ userId: u.id })}
                        disabled={u.activeSessions === 0}
                      >
                        Sign out
                      </Button>
                      {isOwner && u.role !== "owner" && (
                        <Button
                          size="sm"
                          variant="danger"
                          onClick={() => {
                            if (confirm(`Delete ${u.displayName}? Their drops are kept.`)) {
                              deleteUserMut.mutate({ userId: u.id });
                            }
                          }}
                        >
                          Delete
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-2xl border border-line bg-surface p-5">
        <h2 className="mb-4 font-semibold">Pending invites</h2>
        {invitesQ.data?.length ? (
          <ul className="space-y-2">
            {invitesQ.data.map((inv) => (
              <li
                key={inv.id}
                className="flex items-center justify-between gap-3 border-b border-line pb-2 text-sm last:border-0"
              >
                <span className="text-ink-muted">
                  by {inv.createdByName ?? "deleted user"} · created{" "}
                  {formatSince(new Date(inv.createdAt), now)}
                </span>
                <span className="text-xs text-ink-faint">
                  expires in{" "}
                  {formatTimeLeft(
                    Math.max(0, Math.floor((new Date(inv.expiresAt).getTime() - now) / 1000)),
                  )}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => revokeInviteMut.mutate({ id: inv.id })}
                >
                  Revoke
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-ink-faint">No pending invites.</p>
        )}
      </section>
    </div>
  );
}
