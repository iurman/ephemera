"use client";

import { createTRPCReact } from "@trpc/react-query";
import type { AppRouter } from "@/server/trpc/root";
import { httpBatchLink } from "@trpc/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useSearchParams, useRouter } from "next/navigation";
import { useState } from "react";

const api = createTRPCReact<AppRouter>();
const queryClient = new QueryClient();
const trpcClient = api.createClient({
  links: [httpBatchLink({
    url: "/api/trpc",
    fetch: (url, opts) => fetch(url, { ...opts, credentials: "include" }),
  })],
});

export default function SignupPage() {
  return (
    <api.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <SignupInner />
      </QueryClientProvider>
    </api.Provider>
  );
}

function SignupInner() {
  const sp = useSearchParams();
  const token = sp.get("token") ?? "";
  const router = useRouter();

  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");

  const consume = api.auth.consumeInvite.useMutation({
    onSuccess: (res) => {
      if (res.ok) router.replace("/dashboard");
    },
  });

  const canSubmit = token && displayName.trim() && pw.length >= 6 && pw === pw2;

  return (
    <div className="min-h-screen grid place-items-center bg-black text-white p-6">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur space-y-4">
        <h1 className="text-xl font-semibold">Create your account</h1>
        <p className="text-sm text-white/60">Invite token detected. Finish setting up your account.</p>

        {!token && (
          <div className="text-red-400 text-sm">Missing token. Please use your invite link.</div>
        )}

        <input
          className="w-full rounded border border-white/10 bg-black/40 p-2 outline-none focus:ring-2 focus:ring-white/20"
          placeholder="Display name"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
        />

        <input
          className="w-full rounded border border-white/10 bg-black/40 p-2 outline-none focus:ring-2 focus:ring-white/20"
          placeholder="Email (optional)"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <input
          className="w-full rounded border border-white/10 bg-black/40 p-2 outline-none focus:ring-2 focus:ring-white/20"
          placeholder="Password (min 6 chars)"
          type="password"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
        />
        <input
          className="w-full rounded border border-white/10 bg-black/40 p-2 outline-none focus:ring-2 focus:ring-white/20"
          placeholder="Confirm password"
          type="password"
          value={pw2}
          onChange={(e) => setPw2(e.target.value)}
        />

        <button
          disabled={!canSubmit || consume.isLoading}
          className="w-full rounded bg-white text-black py-2 disabled:opacity-50"
          onClick={() =>
            consume.mutate({
              token,
              displayName: displayName.trim(),
              email: email.trim() || undefined,
              password: pw,
            })
          }
        >
          Create account
        </button>

        {consume.isError && (
          <div className="text-red-400 text-sm">
            {("message" in (consume.error as any)) ? (consume.error as any).message : "Failed to sign up"}
          </div>
        )}
      </div>
    </div>
  );
}
