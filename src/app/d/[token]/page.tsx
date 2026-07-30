import type { Metadata } from "next";
import Link from "next/link";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { db } from "@/server/db/client";
import { drops } from "@/server/db/schema";
import { RevealClient } from "./RevealClient";
import type { DropKind } from "@/lib/types";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "secret drop",
  robots: { index: false, follow: false },
};

interface PageProps {
  params: Promise<{ token: string }>;
}

/**
 * The reveal gate. Rendering this page NEVER consumes a view — link
 * previews, prefetchers, and curious middleboxes see only the gate. The
 * actual consume happens on an explicit user action in RevealClient.
 */
export default async function DropPage({ params }: PageProps) {
  const { token } = await params;
  const now = new Date();

  const [row] = await db
    .select({
      kind: drops.kind,
      encVersion: drops.encVersion,
      passwordProtected: drops.passwordProtected,
      expiresAt: drops.expiresAt,
      maxViews: drops.maxViews,
      usedViews: drops.usedViews,
    })
    .from(drops)
    .where(
      and(
        eq(drops.token, token),
        isNull(drops.revokedAt),
        gt(drops.expiresAt, now),
        sql`${drops.usedViews} < ${drops.maxViews}`,
      ),
    )
    .limit(1);

  if (!row) {
    return <UnavailablePage />;
  }

  return (
    <RevealClient
      token={token}
      kind={row.kind as DropKind}
      encVersion={row.encVersion}
      passwordProtected={row.passwordProtected}
      remaining={Math.max(0, row.maxViews - row.usedViews)}
      expiresAtIso={row.expiresAt.toISOString()}
    />
  );
}

function UnavailablePage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="max-w-md text-center">
        <div className="bg-surface-2 mx-auto mb-6 flex size-16 items-center justify-center rounded-full">
          <span className="text-ink-faint text-2xl" aria-hidden>
            ⌛
          </span>
        </div>
        <h1 className="mb-2 text-xl font-semibold">This drop is gone</h1>
        <p className="text-ink-faint">
          It expired, was revoked, or reached its view limit. Ephemeral means ephemeral.
        </p>
        <Link
          href="/"
          className="text-ink-muted hover:text-ink mt-6 inline-flex items-center text-sm transition-colors"
        >
          ← ephemera
        </Link>
      </div>
    </main>
  );
}
