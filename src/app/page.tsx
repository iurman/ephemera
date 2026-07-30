import Link from "next/link";

const features = [
  {
    title: "Zero-knowledge encryption",
    body: "Drops are AES-256-GCM encrypted in your browser. The key rides in the URL fragment or a passphrase — the server only ever stores ciphertext.",
  },
  {
    title: "Burns after reading",
    body: "Every drop expires by time, view count, or both. A reveal step keeps link-preview bots from silently consuming one-time secrets.",
  },
  {
    title: "Actually ephemeral",
    body: "A retention sweep blanks dead ciphertext and prunes view logs on a schedule. Expired means gone — not soft-deleted forever.",
  },
  {
    title: "Yours to run",
    body: "Self-hosted, invite-only, single container plus Postgres. Your secrets never touch a third party.",
  },
];

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col">
      <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col items-center justify-center px-6 py-20 text-center">
        <div className="animate-fade-up">
          <div className="bg-ember-soft text-ember-bright mb-8 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium">
            <span className="bg-ember animate-ember-pulse size-1.5 rounded-full" />
            end-to-end encrypted · self-hosted
          </div>
          <h1 className="text-5xl font-semibold tracking-tight select-none md:text-7xl">
            ephemera
          </h1>
          <p className="text-ink-muted mx-auto mt-5 max-w-xl text-lg md:text-xl">
            Share secrets that vanish. Text, links, and files that self-destruct after they&apos;re
            seen — and can&apos;t be read by the server that serves them.
          </p>

          <div className="mt-10 flex items-center justify-center gap-3">
            <Link
              href="/dashboard"
              className="bg-ember hover:bg-ember-bright rounded-xl px-6 py-2.5 font-medium text-white shadow-[0_0_24px_rgba(232,104,26,0.3)] transition-all hover:shadow-[0_0_32px_rgba(232,104,26,0.45)]"
            >
              Open dashboard
            </Link>
            <Link
              href="/login"
              className="border-line-strong text-ink-muted hover:text-ink hover:border-ink-faint rounded-xl border px-6 py-2.5 font-medium transition-colors"
            >
              Log in
            </Link>
          </div>
        </div>

        <div className="mt-20 grid w-full gap-4 text-left sm:grid-cols-2">
          {features.map((f, i) => (
            <div
              key={f.title}
              className="bg-surface/60 border-line animate-fade-up rounded-2xl border p-5 backdrop-blur-sm"
              style={{ animationDelay: `${0.1 + i * 0.07}s` }}
            >
              <h2 className="text-ink font-medium">{f.title}</h2>
              <p className="text-ink-faint mt-1.5 text-sm leading-relaxed">{f.body}</p>
            </div>
          ))}
        </div>

        <div className="text-ink-faint mt-16 max-w-lg text-xs leading-relaxed">
          <p>
            How it works: your browser seals the secret with a key the server never sees → you
            share one link → the recipient reveals it once → it&apos;s ash.
          </p>
        </div>
      </div>

      <footer className="text-ink-faint pb-6 text-center text-xs">
        <a
          href="https://github.com/iurman/ephemera"
          className="hover:text-ink-muted transition-colors"
          target="_blank"
          rel="noreferrer"
        >
          Source on GitHub
        </a>
      </footer>
    </main>
  );
}
