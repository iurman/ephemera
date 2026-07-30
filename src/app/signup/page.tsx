"use client";

import { useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc";
import { Button, Input, Skeleton } from "@/components/ui";

export default function SignupPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="bg-surface border-line-strong w-full max-w-md rounded-2xl border p-6 shadow-2xl">
        <Link href="/" className="mb-6 flex items-center gap-2 font-semibold tracking-tight">
          <span className="bg-ember animate-ember-pulse block size-2.5 rounded-full" />
          ephemera
        </Link>
        <Suspense fallback={<Skeleton className="h-64" />}>
          <SignupForm />
        </Suspense>
      </div>
    </main>
  );
}

function SignupForm() {
  const trpc = useTRPC();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const router = useRouter();
  const queryClient = useQueryClient();

  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [confirmError, setConfirmError] = useState<string | null>(null);

  const consumeInvite = useMutation(
    trpc.auth.consumeInvite.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries();
        router.replace("/dashboard");
        router.refresh();
      },
    }),
  );

  if (!token) {
    return (
      <div className="text-center">
        <h1 className="text-xl font-semibold">Invalid invite link</h1>
        <p className="text-ink-faint mt-2 text-sm">
          This invite link is missing its token. Ask for a fresh invite.
        </p>
        <Link
          href="/"
          className="text-ink-muted hover:text-ink mt-6 inline-block text-sm transition-colors"
        >
          Back to home
        </Link>
      </div>
    );
  }

  return (
    <>
      <h1 className="text-xl font-semibold">Create your account</h1>
      <p className="text-ink-faint mt-1 text-sm">
        You&apos;ve been invited to this ephemera instance.
      </p>

      <form
        className="mt-6 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (password !== confirmPassword) {
            setConfirmError("Passwords do not match");
            return;
          }
          setConfirmError(null);
          consumeInvite.mutate({
            token,
            displayName: displayName.trim(),
            email: email.trim(),
            password,
          });
        }}
      >
        <Input
          label="Display name"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          autoComplete="name"
          autoFocus
          required
        />
        <Input
          type="email"
          label="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          required
        />
        <Input
          type="password"
          label="Password (min 8 characters)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          required
        />
        <Input
          type="password"
          label="Confirm password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          error={confirmError ?? undefined}
          autoComplete="new-password"
          required
        />
        <Button
          type="submit"
          variant="primary"
          className="w-full"
          loading={consumeInvite.isPending}
          disabled={!displayName.trim() || !email.trim() || password.length < 8}
        >
          Create account
        </Button>
      </form>

      {consumeInvite.isError && (
        <p className="text-danger mt-4 text-sm">{consumeInvite.error.message}</p>
      )}

      <p className="text-ink-faint mt-6 text-center text-xs">
        Already have an account?{" "}
        <Link href="/login" className="hover:text-ink-muted underline">
          Log in
        </Link>
      </p>
    </>
  );
}
