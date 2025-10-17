import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { appRouter } from "@/server/trpc/root";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Params = { token: string };

export default async function DropReader(props: { params: Promise<Params> }) {
  const { token } = await props.params;        // await params
  const h = await headers();                   // await headers()

  const ua = h.get("user-agent") ?? "";
  const ip =
    (h.get("x-forwarded-for") ?? h.get("x-real-ip") ?? "")
      .split(",")[0]
      .trim() || undefined;

  // If your caller context expects e.g. { user, sid, setCookies }, pass minimal values:
  const caller = appRouter.createCaller({ user: null, sid: null, setCookies: [] });

  const res = await caller.drop.consume({ token, ua, ip });

  if (!res?.ok) {
    return (
      <main className="min-h-screen flex items-start justify-center p-6">
        <article className="drop-viewer prose prose-neutral max-w-2xl w-full">
          <h1>Link invalid or expired.</h1>
        </article>
      </main>
    );
  }

  if (res.kind === "url" && res.url) redirect(res.url);

  return (
    <main className="min-h-screen flex items-start justify-center p-6">
      <article className="drop-viewer prose prose-neutral max-w-2xl w-full">
        <h1 className="mb-2">{res.title ?? "Ephemeral note"}</h1>
        {typeof res.expiresInMs === "number" && (
          <p className="text-sm opacity-70">Expires in {formatRemaining(res.expiresInMs)}</p>
        )}
        <hr className="my-4" />
        <div
          dangerouslySetInnerHTML={{
            __html: res.html ?? escapeToHtml(res.body ?? ""),
          }}
        />
      </article>
    </main>
  );
}

function formatRemaining(ms: number) {
  if (ms <= 0) return "0s";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (s < 5 * 60) return `${m}:${String(r).padStart(2, "0")}`;
  return `${Math.ceil(m)}m`;
}
function escapeToHtml(s: string) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\n", "<br/>");
}
