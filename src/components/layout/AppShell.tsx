"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";

export function AppShell({ children }: { children: React.ReactNode }) {
  const trpc = useTRPC();
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();

  const me = useQuery(trpc.auth.me.queryOptions());
  const logoutMut = useMutation(
    trpc.auth.logout.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries();
        router.replace("/");
        router.refresh();
      },
    }),
  );

  const isPrivileged = me.data?.role === "owner" || me.data?.role === "admin";

  const links = [
    { href: "/dashboard", label: "Dashboard" },
    ...(isPrivileged ? [{ href: "/dashboard/admin", label: "Admin" }] : []),
  ];

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-line bg-bg/70 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex items-center gap-6">
            <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
              <span className="block size-2.5 animate-ember-pulse rounded-full bg-ember" />
              ephemera
            </Link>
            <nav className="flex items-center gap-1">
              {links.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-sm transition-colors",
                    pathname === l.href
                      ? "bg-surface-2 text-ink"
                      : "text-ink-faint hover:text-ink-muted",
                  )}
                >
                  {l.label}
                </Link>
              ))}
            </nav>
          </div>

          <div className="flex items-center gap-3">
            {me.data && (
              <span className="hidden text-sm text-ink-faint sm:block">
                {me.data.displayName}
                <span className="ml-1 text-ink-faint/60">({me.data.role})</span>
              </span>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => logoutMut.mutate()}
              loading={logoutMut.isPending}
            >
              Sign out
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}
