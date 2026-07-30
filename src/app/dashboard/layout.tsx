"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc";
import { AppShell } from "@/components/layout/AppShell";
import { Skeleton } from "@/components/ui";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const trpc = useTRPC();
  const router = useRouter();
  const me = useQuery(trpc.auth.me.queryOptions());

  useEffect(() => {
    if (!me.isLoading && !me.data) {
      router.replace("/login");
    }
  }, [me.isLoading, me.data, router]);

  if (me.isLoading) {
    return (
      <div className="mx-auto max-w-5xl space-y-4 px-6 py-10">
        <Skeleton className="h-14" />
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
      </div>
    );
  }

  if (!me.data) return null;

  return <AppShell>{children}</AppShell>;
}
