"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button, Input } from "@/components/ui";

export default function DevLoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [isProduction, setIsProduction] = useState(false);
  const router = useRouter();

  // Check if in production (client-side check)
  useEffect(() => {
    // In production builds, this will typically be 'production'
    // but we can't reliably check NODE_ENV on client, so we make a test request
    fetch("/api/auth/dev-login", { method: "POST", body: "{}" })
      .then((r) => {
        if (r.status === 403) {
          setIsProduction(true);
        }
      })
      .catch(() => {});
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const response = await fetch("/api/auth/dev-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ username, password }),
      });

      if (!response.ok) {
        const text = await response.text().catch(() => "Login failed");
        setError(text || "Login failed");
      } else {
        router.replace("/dashboard");
        router.refresh();
      }
    } catch (err) {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (isProduction) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black text-white p-6">
        <div className="text-center">
          <h1 className="text-xl font-semibold mb-2">Not Available</h1>
          <p className="text-white/60">
            Dev login is disabled in production.{" "}
            <a href="/dashboard" className="underline hover:text-white">
              Go to dashboard
            </a>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-black text-white p-6">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm p-6 rounded-2xl border border-white/10 bg-white/[0.02] space-y-4"
      >
        <div>
          <h1 className="text-xl font-semibold">Dev Login</h1>
          <p className="text-sm text-white/50 mt-1">
            Development only. Use DEV_ADMIN_USER and DEV_ADMIN_PASS env vars.
          </p>
        </div>

        <Input
          placeholder="Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoFocus
          autoComplete="username"
        />

        <Input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
        />

        {error && (
          <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20">
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        <Button
          type="submit"
          variant="primary"
          className="w-full"
          loading={loading}
          disabled={!username || !password}
        >
          Sign In
        </Button>

        <p className="text-xs text-center text-white/40">
          <a href="/dashboard" className="hover:text-white/60">
            Back to Dashboard
          </a>
        </p>
      </form>
    </div>
  );
}
