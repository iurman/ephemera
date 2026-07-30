"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useMutation } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc";
import { useNow } from "@/lib/hooks";
import { Button, Input, CopyButton } from "@/components/ui";
import { formatTimeLeft, formatBytes, cn } from "@/lib/utils";
import { renderMarkdown } from "@/lib/markdown";
import {
  keyFromFragment,
  deriveKeyFromPassphrase,
  openEnvelope,
  base64ToBytes,
  envelopeBodyToFileBytes,
  type DropEnvelope,
} from "@/lib/crypto";
import type { DropKind } from "@/lib/types";

interface RevealClientProps {
  token: string;
  kind: DropKind;
  encVersion: number;
  passwordProtected: boolean;
  remaining: number;
  expiresAtIso: string;
}

interface ConsumedPayload {
  body: string;
  iv: string | null;
  kdfSalt: string | null;
  encVersion: number;
  kind: DropKind;
  title: string;
  remaining: number;
}

type Phase = "gate" | "consuming" | "locked" | "revealed" | "gone" | "error";

interface RevealedContent {
  envelope: DropEnvelope;
  remaining: number;
}

export function RevealClient(props: RevealClientProps) {
  const trpc = useTRPC();
  const now = useNow(1000);
  const [phase, setPhase] = useState<Phase>("gate");
  const [error, setError] = useState<string | null>(null);
  const [passphrase, setPassphrase] = useState("");
  const [payload, setPayload] = useState<ConsumedPayload | null>(null);
  const [content, setContent] = useState<RevealedContent | null>(null);
  const fragmentKey = useMemo(
    () => (typeof window !== "undefined" ? keyFromFragment(window.location.hash) : null),
    [],
  );

  const needsFragment = props.encVersion === 1 && !props.passwordProtected;
  const missingKey = needsFragment && !fragmentKey;

  const consumeMut = useMutation(trpc.drop.consume.mutationOptions());

  async function tryDecrypt(p: ConsumedPayload, pass: string): Promise<void> {
    if (p.encVersion === 0) {
      // Legacy plaintext drop.
      setContent({
        envelope: { v: 1, type: p.kind, body: p.body },
        remaining: p.remaining,
      });
      setPhase("revealed");
      return;
    }

    const keyBytes = p.kdfSalt
      ? await deriveKeyFromPassphrase(pass, base64ToBytes(p.kdfSalt))
      : fragmentKey;

    if (!keyBytes || !p.iv) {
      setError("The decryption key is missing from this link.");
      setPhase("error");
      return;
    }

    try {
      const envelope = await openEnvelope(p.body, p.iv, keyBytes);
      setContent({ envelope, remaining: p.remaining });
      setPhase("revealed");
    } catch {
      if (p.kdfSalt) {
        // Wrong passphrase — the ciphertext is already local, so retries
        // don't burn additional views.
        setError("That passphrase didn't work. Try again — this won't use another view.");
        setPhase("locked");
      } else {
        setError("Decryption failed — the key in this link is wrong or incomplete.");
        setPhase("error");
      }
    }
  }

  async function reveal() {
    setError(null);
    setPhase("consuming");
    try {
      const res = await consumeMut.mutateAsync({ token: props.token });
      if (!res.ok) {
        setPhase("gone");
        return;
      }
      const p: ConsumedPayload = {
        body: res.body,
        iv: res.iv,
        kdfSalt: res.kdfSalt,
        encVersion: res.encVersion,
        kind: res.kind,
        title: res.title,
        remaining: res.remaining,
      };
      setPayload(p);
      await tryDecrypt(p, passphrase);
    } catch {
      setError("Something went wrong talking to the server.");
      setPhase("error");
    }
  }

  if (phase === "revealed" && content) {
    return <RevealedView content={content} />;
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border border-line-strong bg-surface p-6 text-center shadow-2xl">
        <div className="mx-auto mb-5 flex size-14 items-center justify-center rounded-full bg-ember-soft">
          <span className="block size-3.5 animate-ember-pulse rounded-full bg-ember" />
        </div>

        {phase === "gone" ? (
          <>
            <h1 className="text-xl font-semibold">Just missed it</h1>
            <p className="mt-2 text-sm text-ink-faint">
              This drop was consumed or expired a moment ago.
            </p>
          </>
        ) : missingKey ? (
          <>
            <h1 className="text-xl font-semibold">Key missing</h1>
            <p className="mt-2 text-sm leading-relaxed text-ink-faint">
              This drop is end-to-end encrypted and the decryption key travels in the link&apos;s{" "}
              <code className="text-ink-muted">#fragment</code> — but this link doesn&apos;t have
              one. Ask the sender for the complete link.
            </p>
          </>
        ) : (
          <>
            <h1 className="text-xl font-semibold">
              {phase === "locked" ? "Enter the passphrase" : "A secret awaits"}
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-ink-faint">
              {props.passwordProtected && phase !== "locked" && (
                <>This drop is sealed with a passphrase. </>
              )}
              {phase !== "locked" && (
                <>
                  Revealing will use <strong className="text-ink-muted">1</strong> of{" "}
                  <strong className="text-ink-muted">{props.remaining}</strong> remaining view
                  {props.remaining === 1 ? "" : "s"}
                  {props.remaining === 1 && " — after this, it's gone forever"}.
                </>
              )}
            </p>

            {(props.passwordProtected || phase === "locked") && (
              <div className="mt-4">
                <Input
                  type="password"
                  placeholder="Passphrase"
                  value={passphrase}
                  onChange={(e) => setPassphrase(e.target.value)}
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && passphrase) {
                      e.preventDefault();
                      if (phase === "locked" && payload) void tryDecrypt(payload, passphrase);
                      else void reveal();
                    }
                  }}
                />
              </div>
            )}

            {error && <p className="mt-3 text-sm text-danger">{error}</p>}

            <div className="mt-6">
              {phase === "locked" && payload ? (
                <Button
                  variant="primary"
                  size="lg"
                  className="w-full"
                  disabled={!passphrase}
                  onClick={() => void tryDecrypt(payload, passphrase)}
                >
                  Unlock
                </Button>
              ) : (
                <Button
                  variant="primary"
                  size="lg"
                  className="w-full"
                  loading={phase === "consuming"}
                  disabled={props.passwordProtected && !passphrase}
                  onClick={() => void reveal()}
                >
                  {props.remaining === 1 ? "Reveal — burns after reading" : "Reveal secret"}
                </Button>
              )}
            </div>

            <p className="mt-4 text-xs text-ink-faint">
              Expires{" "}
              {formatTimeLeft(
                Math.max(0, Math.floor((new Date(props.expiresAtIso).getTime() - now) / 1000)),
              )}{" "}
              from now if unread.
            </p>
          </>
        )}

        <Link
          href="/"
          className="mt-6 inline-block text-xs text-ink-faint transition-colors hover:text-ink-muted"
        >
          powered by ephemera
        </Link>
      </div>
    </main>
  );
}

/* ---------- revealed content ---------- */

function RevealedView({ content }: { content: RevealedContent }) {
  const { envelope, remaining } = content;

  return (
    <main className="min-h-screen">
      <div className="mx-auto max-w-2xl px-6 py-12">
        <div className="animate-dissolve-in">
          <div className="mb-6 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-xs text-ink-faint">
              <span className="block size-2 rounded-full bg-ember" />
              {remaining === 0
                ? "This was the last view — the drop is now ash."
                : `${remaining} view${remaining === 1 ? "" : "s"} remaining.`}
            </div>
            {envelope.type === "text" && <CopyButton text={envelope.body} label="Copy raw" />}
          </div>

          {envelope.type === "text" && <TextContent body={envelope.body} />}
          {envelope.type === "url" && <UrlContent url={envelope.body} />}
          {envelope.type === "file" && (
            <FileContent
              body={envelope.body}
              fileName={envelope.fileName ?? "download.bin"}
              mimeType={envelope.mimeType ?? "application/octet-stream"}
            />
          )}

          <footer className="mt-10 border-t border-line pt-4">
            <p className="text-xs text-ink-faint">
              Decrypted locally in your browser — the server only ever saw ciphertext.{" "}
              <Link href="/" className="underline hover:text-ink-muted">
                ephemera
              </Link>
            </p>
          </footer>
        </div>
      </div>
    </main>
  );
}

function TextContent({ body }: { body: string }) {
  const [html, setHtml] = useState<string | null>(null);
  const [raw, setRaw] = useState(false);

  useEffect(() => {
    let cancelled = false;
    renderMarkdown(body).then((h) => {
      if (!cancelled) setHtml(h);
    });
    return () => {
      cancelled = true;
    };
  }, [body]);

  return (
    <div>
      <div className="mb-3 flex justify-end">
        <button
          onClick={() => setRaw((r) => !r)}
          className="text-xs text-ink-faint underline underline-offset-2 hover:text-ink-muted"
        >
          {raw ? "View rendered" : "View raw"}
        </button>
      </div>
      {raw || html === null ? (
        <pre className="rounded-2xl border border-line bg-surface p-5 text-sm leading-relaxed break-words whitespace-pre-wrap text-ink">
          {body}
        </pre>
      ) : (
        <div
          className="drop-prose rounded-2xl border border-line bg-surface p-5"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      )}
    </div>
  );
}

function UrlContent({ url }: { url: string }) {
  const [seconds, setSeconds] = useState(3);
  const [cancelled, setCancelled] = useState(false);
  const timer = useRef<number | null>(null);
  const host = useMemo(() => {
    try {
      return new URL(url).host;
    } catch {
      return null;
    }
  }, [url]);

  const safe = host !== null && /^https?:\/\//i.test(url);

  useEffect(() => {
    if (!safe || cancelled) return;
    if (seconds <= 0) {
      window.location.assign(url);
      return;
    }
    timer.current = window.setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [seconds, cancelled, safe, url]);

  return (
    <div className="rounded-2xl border border-line bg-surface p-6 text-center">
      <p className="text-sm text-ink-faint">This drop redirects to</p>
      <p className={cn("mt-2 font-mono text-lg font-medium", safe ? "text-ink" : "text-danger")}>
        {host ?? "an invalid URL"}
      </p>
      {safe ? (
        <>
          <p className="mt-4 text-sm text-ink-faint">
            {cancelled ? "Redirect cancelled." : `Redirecting in ${seconds}s…`}
          </p>
          <div className="mt-5 flex items-center justify-center gap-2">
            <Button variant="primary" onClick={() => window.location.assign(url)}>
              Go now
            </Button>
            {!cancelled && (
              <Button variant="ghost" onClick={() => setCancelled(true)}>
                Cancel
              </Button>
            )}
            <CopyButton text={url} label="Copy URL" size="md" />
          </div>
        </>
      ) : (
        <p className="mt-4 text-sm text-danger">Refusing to redirect to a non-http(s) URL.</p>
      )}
    </div>
  );
}

function FileContent({
  body,
  fileName,
  mimeType,
}: {
  body: string;
  fileName: string;
  mimeType: string;
}) {
  const size = useMemo(() => envelopeBodyToFileBytes(body).length, [body]);

  // Built on click — event handlers may touch external systems freely.
  function download() {
    const bytes = envelopeBodyToFileBytes(body);
    const buffer = new ArrayBuffer(bytes.length);
    new Uint8Array(buffer).set(bytes);
    const url = URL.createObjectURL(new Blob([buffer], { type: mimeType }));
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  return (
    <div className="rounded-2xl border border-line bg-surface p-6 text-center">
      <p className="text-sm text-ink-faint">Encrypted file</p>
      <p className="mt-2 font-mono text-lg font-medium break-all text-ink">{fileName}</p>
      <p className="mt-1 text-xs text-ink-faint">
        {formatBytes(size)} · {mimeType}
      </p>
      <button
        onClick={download}
        className="mt-5 inline-block rounded-xl bg-ember px-6 py-2.5 font-medium text-white transition-colors hover:bg-ember-bright"
      >
        Download
      </button>
      <p className="mt-4 text-xs text-ink-faint">
        Save it now — this drop won&apos;t be available again.
      </p>
    </div>
  );
}
