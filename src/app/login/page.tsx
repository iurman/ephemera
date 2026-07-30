"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc";
import { Button, Input, Skeleton } from "@/components/ui";

export default function LoginPage() {
  const trpc = useTRPC();
  const status = useQuery(trpc.auth.status.queryOptions());

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="bg-surface border-line-strong w-full max-w-md rounded-2xl border p-6 shadow-2xl">
        <Link href="/" className="mb-6 flex items-center gap-2 font-semibold tracking-tight">
          <span className="bg-ember animate-ember-pulse block size-2.5 rounded-full" />
          ephemera
        </Link>

        {status.isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-8 w-2/3" />
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
          </div>
        ) : status.data?.hasUsers === false ? (
          <FirstRunSetup />
        ) : (
          <LoginForm />
        )}
      </div>
    </main>
  );
}

function LoginForm() {
  const trpc = useTRPC();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const loginMut = useMutation(
    trpc.auth.login.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries();
        router.replace("/dashboard");
        router.refresh();
      },
    }),
  );

  return (
    <>
      <h1 className="text-xl font-semibold">Welcome back</h1>
      <p className="text-ink-faint mt-1 text-sm">Log in to manage your drops.</p>

      <form
        className="mt-6 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!loginMut.isPending) loginMut.mutate({ email: email.trim(), password });
        }}
      >
        <Input
          type="email"
          label="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          autoFocus
          required
        />
        <Input
          type="password"
          label="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          required
        />
        <Button
          type="submit"
          variant="primary"
          className="w-full"
          loading={loginMut.isPending}
          disabled={!email.trim() || !password}
        >
          Log in
        </Button>
      </form>

      {loginMut.isError && <p className="text-danger mt-4 text-sm">{loginMut.error.message}</p>}

      <p className="text-ink-faint mt-6 text-center text-xs">
        No account? Ask the instance owner for an invite link.
      </p>
    </>
  );
}

function FirstRunSetup() {
  const trpc = useTRPC();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const bootstrapMut = useMutation(
    trpc.auth.bootstrapOwner.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries();
        router.replace("/dashboard");
        router.refresh();
      },
    }),
  );

  return (
    <>
      <h1 className="text-xl font-semibold">First run — create the owner</h1>
      <p className="text-ink-faint mt-1 text-sm">
        This instance has no accounts yet. Set up the owner account with real credentials so you
        can always log back in.
      </p>

      <form
        className="mt-6 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!bootstrapMut.isPending) {
            bootstrapMut.mutate({ displayName: displayName.trim(), email: email.trim(), password });
          }
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
        <Button
          type="submit"
          variant="primary"
          className="w-full"
          loading={bootstrapMut.isPending}
          disabled={!displayName.trim() || !email.trim() || password.length < 8}
        >
          Create owner account
        </Button>
      </form>

      {bootstrapMut.isError && (
        <p className="text-danger mt-4 text-sm">{bootstrapMut.error.message}</p>
      )}
    </>
  );
}
