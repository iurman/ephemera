import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-black text-white p-6">
      <div className="text-center select-none">
        <h1 className="text-6xl md:text-8xl font-semibold tracking-tight">
          ephemera
        </h1>
        <p className="mt-4 text-lg md:text-xl text-white/50 tracking-widest uppercase">
          share secrets that disappear
        </p>
      </div>

      <div className="mt-12 flex gap-4">
        <Link
          href="/dashboard"
          className="px-6 py-2.5 bg-white text-black font-medium rounded-lg hover:bg-white/90 transition-colors"
        >
          Open Dashboard
        </Link>
      </div>

      <footer className="absolute bottom-6 text-xs text-white/30">
        Time-limited, view-limited ephemeral content sharing
      </footer>
    </main>
  );
}
