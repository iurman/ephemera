"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function DevLoginPage() {
  const [u, setU] = useState("");
  const [p, setP] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      const r = await fetch("/api/auth/dev-login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ username: u, password: p }),
      });
      if (!r.ok) {
        const text = await r.text().catch(() => "Login failed");
        setErr(text || "Login failed");
      } else {
        router.replace("/dashboard");
        router.refresh();
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen grid place-items-center bg-black text-white p-6">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm bg-white/5 border border-white/10 rounded-2xl p-6 space-y-3"
      >
        <h1 className="text-xl font-semibold">Dev login</h1>
        <p className="text-sm text-white/60">Enabled only in development.</p>

        <input
          className="w-full rounded border border-white/10 bg-black/40 p-2"
          placeholder="Username"
          value={u}
          onChange={(e) => setU(e.target.value)}
          autoFocus
        />
        <input
          type="password"
          className="w-full rounded border border-white/10 bg-black/40 p-2"
          placeholder="Password"
          value={p}
          onChange={(e) => setP(e.target.value)}
        />

        {err && <div className="text-red-400 text-sm">{err}</div>}

        <button
          type="submit"
          disabled={loading || !u || !p}
          className="w-full rounded bg-white text-black py-2 disabled:opacity-50"
        >
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
