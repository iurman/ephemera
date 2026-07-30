"use client";

import { useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTRPC } from "@/lib/trpc";
import { Button, Input, Textarea, Segmented, Select } from "@/components/ui";
import { formatBytes, isValidUrl } from "@/lib/utils";
import {
  generateKeyBytes,
  generateSalt,
  deriveKeyFromPassphrase,
  sealEnvelope,
  keyToFragment,
  bytesToBase64,
  fileToEnvelopeBody,
  isCryptoAvailable,
  MAX_FILE_BYTES,
  type DropEnvelope,
} from "@/lib/crypto";
import type { DropKind } from "@/lib/types";

const TTL_OPTIONS = [
  { value: String(5 * 60 * 1000), label: "5 minutes" },
  { value: String(30 * 60 * 1000), label: "30 minutes" },
  { value: String(60 * 60 * 1000), label: "1 hour" },
  { value: String(6 * 60 * 60 * 1000), label: "6 hours" },
  { value: String(24 * 60 * 60 * 1000), label: "1 day" },
  { value: String(3 * 24 * 60 * 60 * 1000), label: "3 days" },
  { value: String(7 * 24 * 60 * 60 * 1000), label: "7 days" },
  { value: String(30 * 24 * 60 * 60 * 1000), label: "30 days" },
];

export interface CreatedDrop {
  shareUrl: string;
  passwordProtected: boolean;
  encrypted: boolean;
  maxViews: number;
  ttlMs: number;
}

interface CreateDropFormProps {
  onCreated: (drop: CreatedDrop) => void;
}

export function CreateDropForm({ onCreated }: CreateDropFormProps) {
  const trpc = useTRPC();
  const cryptoOk = isCryptoAvailable();

  const [kind, setKind] = useState<DropKind>("text");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [file, setFile] = useState<{ name: string; type: string; bytes: Uint8Array } | null>(null);
  const [ttlMs, setTtlMs] = useState(60 * 60 * 1000);
  const [maxViews, setMaxViews] = useState(1);
  const [usePassphrase, setUsePassphrase] = useState(false);
  const [passphrase, setPassphrase] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sealing, setSealing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const createMut = useMutation(trpc.drop.create.mutationOptions());

  async function handleFile(f: File | undefined) {
    if (!f) return;
    if (f.size > MAX_FILE_BYTES) {
      setError(`File too large — the limit is ${formatBytes(MAX_FILE_BYTES)}.`);
      return;
    }
    const buf = new Uint8Array(await f.arrayBuffer());
    setFile({ name: f.name, type: f.type || "application/octet-stream", bytes: buf });
    setError(null);
  }

  function validate(): string | null {
    if (kind === "file") {
      if (!file) return "Choose a file to share.";
    } else if (!body.trim()) {
      return kind === "url" ? "Enter a URL to share." : "Enter the secret to share.";
    }
    if (kind === "url" && !isValidUrl(body.trim())) {
      return "Enter a valid http:// or https:// URL.";
    }
    if (usePassphrase && passphrase.length < 6) {
      return "Passphrase must be at least 6 characters.";
    }
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    setSealing(true);

    try {
      let input: Parameters<typeof createMut.mutateAsync>[0];
      let fragment: string | null = null;

      if (cryptoOk) {
        const envelope: DropEnvelope = {
          v: 1,
          type: kind,
          body: kind === "file" ? fileToEnvelopeBody(file!.bytes) : body.trim(),
          ...(kind === "file" ? { fileName: file!.name, mimeType: file!.type } : {}),
        };

        let keyBytes: Uint8Array;
        let kdfSalt: string | undefined;
        if (usePassphrase) {
          const salt = generateSalt();
          keyBytes = await deriveKeyFromPassphrase(passphrase, salt);
          kdfSalt = bytesToBase64(salt);
        } else {
          keyBytes = generateKeyBytes();
          fragment = keyToFragment(keyBytes);
        }

        const sealed = await sealEnvelope(envelope, keyBytes);
        input = {
          title: title.trim() || undefined,
          kind,
          body: sealed.ciphertextB64,
          encVersion: 1,
          iv: sealed.ivB64,
          kdfSalt,
          passwordProtected: usePassphrase,
          ttlMs,
          maxViews,
        };
      } else {
        // No WebCrypto (plain-HTTP LAN deployments). Store plaintext, warn.
        input = {
          title: title.trim() || undefined,
          kind,
          body: body.trim(),
          encVersion: 0,
          passwordProtected: false,
          ttlMs,
          maxViews,
        };
      }

      const result = await createMut.mutateAsync(input);
      const shareUrl = `${window.location.origin}${result.url}` + (fragment ? `#${fragment}` : "");

      onCreated({
        shareUrl,
        passwordProtected: usePassphrase,
        encrypted: cryptoOk,
        maxViews,
        ttlMs,
      });

      // Reset for the next drop.
      setTitle("");
      setBody("");
      setFile(null);
      setPassphrase("");
      setUsePassphrase(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create drop";
      setError(message);
      toast.error(message);
    } finally {
      setSealing(false);
    }
  }

  const pending = sealing || createMut.isPending;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {!cryptoOk && (
        <p className="rounded-lg bg-warn-soft px-3 py-2 text-xs text-warn">
          WebCrypto unavailable (non-HTTPS context) — drops will be stored without end-to-end
          encryption.
        </p>
      )}

      <Segmented
        value={kind}
        onChange={(k) => {
          setKind(k);
          setError(null);
        }}
        options={[
          { value: "text", label: "Text" },
          { value: "url", label: "Link" },
          ...(cryptoOk ? [{ value: "file" as DropKind, label: "File" }] : []),
        ]}
      />

      <Input
        placeholder="Label (optional — visible on your dashboard, not encrypted)"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        maxLength={200}
        autoComplete="off"
      />

      {kind === "file" ? (
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            void handleFile(e.dataTransfer.files[0]);
          }}
          className="w-full rounded-xl border border-dashed border-line-strong px-4 py-8 text-center text-sm text-ink-muted transition-colors hover:border-ember/50"
        >
          {file ? (
            <span className="text-ink">
              {file.name} <span className="text-ink-faint">({formatBytes(file.bytes.length)})</span>
            </span>
          ) : (
            <>
              Drop a file here or click to choose{" "}
              <span className="text-ink-faint">(max {formatBytes(MAX_FILE_BYTES)})</span>
            </>
          )}
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={(e) => void handleFile(e.target.files?.[0])}
          />
        </button>
      ) : (
        <Textarea
          placeholder={kind === "url" ? "https://example.com/…" : "The secret. Markdown supported."}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={kind === "url" ? 2 : 5}
          maxLength={100_000}
        />
      )}

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-ink-faint">
          Expires in
          <Select
            value={String(ttlMs)}
            onChange={(e) => setTtlMs(Number(e.target.value))}
            options={TTL_OPTIONS}
          />
        </label>
        <label className="flex items-center gap-2 text-sm text-ink-faint">
          Views
          <Input
            type="number"
            min={1}
            max={1000}
            value={maxViews}
            onChange={(e) =>
              setMaxViews(Math.max(1, Math.min(1000, parseInt(e.target.value || "1", 10))))
            }
            className="w-20"
            aria-label="Maximum views"
          />
        </label>
      </div>

      {cryptoOk && (
        <div className="space-y-2">
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={usePassphrase}
              onChange={(e) => setUsePassphrase(e.target.checked)}
              className="size-4 accent-ember"
            />
            <span className="text-ink-muted">Protect with a passphrase instead of a link key</span>
          </label>
          {usePassphrase && (
            <Input
              type="password"
              placeholder="Passphrase (share it over a separate channel)"
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              autoComplete="new-password"
            />
          )}
        </div>
      )}

      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-ink-faint">
          {maxViews === 1
            ? "Burns after a single view."
            : `Self-destructs after ${maxViews} views.`}
        </p>
        <Button type="submit" variant="primary" loading={pending}>
          {sealing ? "Encrypting…" : "Create drop"}
        </Button>
      </div>
    </form>
  );
}
