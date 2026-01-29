import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { appRouter } from "@/server/trpc/root";
import { formatTimeLeft, textToHtml } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface PageProps {
  params: Promise<{ token: string }>;
}

export default async function DropPage({ params }: PageProps) {
  const { token } = await params;
  const h = await headers();

  // Extract client info
  const userAgent = h.get("user-agent") ?? "";
  const ip = (h.get("x-forwarded-for") ?? h.get("x-real-ip") ?? "")
    .split(",")[0]
    .trim() || undefined;

  // Create a server-side caller
  const caller = appRouter.createCaller({
    user: null,
    sid: null,
    setCookies: [],
    db: null as any, // Not used for consume
  });

  // Attempt to consume the drop
  const result = await caller.drop.consume({ token, ua: userAgent, ip });

  // Handle invalid/expired drops
  if (!result.ok) {
    return <InvalidDropPage />;
  }

  // Handle URL redirects
  if (result.kind === "url" && result.url) {
    redirect(result.url);
  }

  // Render text content
  return (
    <main className="min-h-screen bg-black text-white">
      <div className="max-w-2xl mx-auto p-6 py-12">
        <article className="space-y-6">
          {/* Header */}
          <header>
            <h1 className="text-2xl font-semibold">
              {result.title ?? "Ephemeral Note"}
            </h1>
            {typeof result.expiresInMs === "number" && result.expiresInMs > 0 && (
              <p className="text-sm text-white/50 mt-2">
                This content expires in {formatTimeLeft(Math.floor(result.expiresInMs / 1000))}
              </p>
            )}
            {typeof result.remaining === "number" && (
              <p className="text-sm text-white/50">
                {result.remaining === 0
                  ? "This was the last view"
                  : `${result.remaining} view${result.remaining !== 1 ? "s" : ""} remaining`}
              </p>
            )}
          </header>

          <hr className="border-white/10" />

          {/* Content */}
          <div
            className="prose prose-invert prose-sm max-w-none leading-relaxed"
            dangerouslySetInnerHTML={{
              __html: textToHtml(result.body ?? ""),
            }}
          />

          {/* Footer */}
          <footer className="pt-6 border-t border-white/10">
            <p className="text-xs text-white/30">
              Powered by{" "}
              <a
                href="/"
                className="hover:text-white/50 transition-colors"
              >
                Ephemera
              </a>
            </p>
          </footer>
        </article>
      </div>
    </main>
  );
}

function InvalidDropPage() {
  return (
    <main className="min-h-screen bg-black text-white flex items-center justify-center p-6">
      <div className="text-center max-w-md">
        <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-white/5 flex items-center justify-center">
          <svg
            className="w-8 h-8 text-white/40"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        </div>
        <h1 className="text-xl font-semibold mb-2">Link Unavailable</h1>
        <p className="text-white/50 mb-6">
          This link has expired, been revoked, or reached its view limit.
        </p>
        <a
          href="/"
          className="inline-flex items-center text-sm text-white/60 hover:text-white transition-colors"
        >
          <svg
            className="w-4 h-4 mr-1"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M10 19l-7-7m0 0l7-7m-7 7h18"
            />
          </svg>
          Back to home
        </a>
      </div>
    </main>
  );
}
