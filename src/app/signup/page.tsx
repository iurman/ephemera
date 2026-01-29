"use client";

import { useState, Suspense } from "react";
import { createTRPCReact } from "@trpc/react-query";
import type { AppRouter } from "@/server/trpc/root";
import { httpBatchLink } from "@trpc/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useSearchParams, useRouter } from "next/navigation";
import { Button, Input } from "@/components/ui";

const api = createTRPCReact<AppRouter>();
const queryClient = new QueryClient();
const trpcClient = api.createClient({
  links: [
    httpBatchLink({
      url: "/api/trpc",
      fetch: (url, opts) => fetch(url, { ...opts, credentials: "include" }),
    }),
  ],
});

export default function SignupPage() {
  return (
    <api.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <Suspense fallback={<LoadingState />}>
          <SignupForm />
        </Suspense>
      </QueryClientProvider>
    </api.Provider>
  );
}

function LoadingState() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-black text-white">
      <div className="text-white/50">Loading...</div>
    </div>
  );
}

function SignupForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const router = useRouter();

  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errors, setErrors] = useState<{
    displayName?: string;
    password?: string;
    confirmPassword?: string;
  }>({});

  const consumeInvite = api.auth.consumeInvite.useMutation({
    onSuccess: (res) => {
      if (res.ok) {
        router.replace("/dashboard");
        router.refresh();
      }
    },
  });

  const validate = (): boolean => {
    const newErrors: typeof errors = {};

    if (!displayName.trim()) {
      newErrors.displayName = "Display name is required";
    }

    if (password.length < 6) {
      newErrors.password = "Password must be at least 6 characters";
    }

    if (password !== confirmPassword) {
      newErrors.confirmPassword = "Passwords do not match";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    consumeInvite.mutate({
      token,
      displayName: displayName.trim(),
      email: email.trim() || undefined,
      password,
    });
  };

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black text-white p-6">
        <div className="text-center max-w-md">
          <h1 className="text-xl font-semibold mb-2">Invalid Invite Link</h1>
          <p className="text-white/50 mb-6">
            The invite link is missing or invalid. Please use a valid invite URL.
          </p>
          <a
            href="/"
            className="text-sm text-white/60 hover:text-white transition-colors"
          >
            Back to home
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-black text-white p-6">
      <div className="w-full max-w-md p-6 rounded-2xl border border-white/10 bg-white/[0.02]">
        <h1 className="text-xl font-semibold">Create Account</h1>
        <p className="text-sm text-white/50 mt-2">
          Complete your account setup to start using Ephemera.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <Input
            placeholder="Display name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            error={errors.displayName}
            autoFocus
            autoComplete="name"
          />

          <Input
            type="email"
            placeholder="Email (optional)"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />

          <Input
            type="password"
            placeholder="Password (min 6 characters)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={errors.password}
            autoComplete="new-password"
          />

          <Input
            type="password"
            placeholder="Confirm password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            error={errors.confirmPassword}
            autoComplete="new-password"
          />

          <Button
            type="submit"
            variant="primary"
            className="w-full"
            loading={consumeInvite.isPending}
            disabled={!displayName.trim() || password.length < 6}
          >
            Create Account
          </Button>
        </form>

        {consumeInvite.isError && (
          <div className="mt-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
            <p className="text-sm text-red-400">
              {consumeInvite.error.message || "Failed to create account"}
            </p>
          </div>
        )}

        <p className="mt-6 text-xs text-center text-white/40">
          Already have an account?{" "}
          <a href="/dashboard" className="hover:text-white/60">
            Sign in
          </a>
        </p>
      </div>
    </div>
  );
}
