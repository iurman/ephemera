import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="text-center">
        <p className="text-ember-bright font-mono text-sm">404</p>
        <h1 className="mt-2 text-2xl font-semibold">Nothing here</h1>
        <p className="text-ink-faint mt-2 text-sm">
          Whatever you were looking for has either vanished or never existed.
        </p>
        <Link
          href="/"
          className="text-ink-muted hover:text-ink mt-6 inline-block text-sm underline underline-offset-4 transition-colors"
        >
          ← back to ephemera
        </Link>
      </div>
    </main>
  );
}
