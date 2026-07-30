import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="text-center">
        <p className="font-mono text-sm text-accent-bright">404</p>
        <h1 className="mt-2 text-2xl font-semibold">Nothing here</h1>
        <p className="mt-2 text-sm text-ink-faint">
          Whatever you were looking for has either vanished or never existed.
        </p>
        <Link
          href="/"
          className="mt-6 inline-block text-sm text-ink-muted underline underline-offset-4 transition-colors hover:text-ink"
        >
          ← back to ephemera
        </Link>
      </div>
    </main>
  );
}
