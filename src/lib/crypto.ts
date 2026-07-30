/**
 * Client-side end-to-end encryption for drops (zero-knowledge design).
 *
 * - Content is sealed inside a DropEnvelope, then AES-256-GCM encrypted in
 *   the browser before it ever leaves the device.
 * - Link mode: the key travels in the URL *fragment* (`#k=...`), which
 *   browsers never send to the server.
 * - Passphrase mode: the key is derived from the passphrase with
 *   PBKDF2-SHA256 (600k iterations); only the random salt is stored
 *   server-side.
 *
 * Works in any WebCrypto environment (browsers, Node 22+ for tests).
 */

export interface DropEnvelope {
  v: 1;
  type: "text" | "url" | "file";
  body: string; // text content, URL, or base64 file bytes
  fileName?: string;
  mimeType?: string;
}

export const PBKDF2_ITERATIONS = 600_000;
const IV_BYTES = 12;
const KEY_BYTES = 32;
const SALT_BYTES = 16;

/* ---------- encoding helpers ---------- */

export function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export function bytesToBase64Url(bytes: Uint8Array): string {
  return bytesToBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function base64UrlToBytes(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4);
  return base64ToBytes(b64);
}

/* ---------- keys ---------- */

export function isCryptoAvailable(): boolean {
  return typeof crypto !== "undefined" && !!crypto.subtle;
}

export function generateKeyBytes(): Uint8Array {
  const key = new Uint8Array(KEY_BYTES);
  crypto.getRandomValues(key);
  return key;
}

export function generateSalt(): Uint8Array {
  const salt = new Uint8Array(SALT_BYTES);
  crypto.getRandomValues(salt);
  return salt;
}

async function importAesKey(keyBytes: Uint8Array, usage: KeyUsage[]): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", keyBytes as BufferSource, { name: "AES-GCM" }, false, usage);
}

export async function deriveKeyFromPassphrase(
  passphrase: string,
  salt: Uint8Array,
  iterations = PBKDF2_ITERATIONS,
): Promise<Uint8Array> {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(passphrase),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations },
    material,
    KEY_BYTES * 8,
  );
  return new Uint8Array(bits);
}

/* ---------- envelope sealing ---------- */

export interface SealedDrop {
  ciphertextB64: string;
  ivB64: string;
}

export async function sealEnvelope(
  envelope: DropEnvelope,
  keyBytes: Uint8Array,
): Promise<SealedDrop> {
  const key = await importAesKey(keyBytes, ["encrypt"]);
  const iv = new Uint8Array(IV_BYTES);
  crypto.getRandomValues(iv);

  const plaintext = new TextEncoder().encode(JSON.stringify(envelope));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    key,
    plaintext as BufferSource,
  );

  return {
    ciphertextB64: bytesToBase64(new Uint8Array(ciphertext)),
    ivB64: bytesToBase64(iv),
  };
}

export async function openEnvelope(
  ciphertextB64: string,
  ivB64: string,
  keyBytes: Uint8Array,
): Promise<DropEnvelope> {
  const key = await importAesKey(keyBytes, ["decrypt"]);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToBytes(ivB64) as BufferSource },
    key,
    base64ToBytes(ciphertextB64) as BufferSource,
  );
  const parsed = JSON.parse(new TextDecoder().decode(plaintext)) as DropEnvelope;
  if (parsed.v !== 1 || typeof parsed.body !== "string") {
    throw new Error("Unrecognized envelope format");
  }
  return parsed;
}

/* ---------- URL fragment ---------- */

export function keyToFragment(keyBytes: Uint8Array): string {
  return `k=${bytesToBase64Url(keyBytes)}`;
}

/** Parses `#k=...` fragments; returns null when absent or malformed. */
export function keyFromFragment(hash: string): Uint8Array | null {
  const m = hash.replace(/^#/, "").match(/(?:^|&)k=([A-Za-z0-9_-]+)/);
  if (!m) return null;
  try {
    const bytes = base64UrlToBytes(m[1]);
    return bytes.length === KEY_BYTES ? bytes : null;
  } catch {
    return null;
  }
}

/* ---------- file helpers ---------- */

export const MAX_FILE_BYTES = 1024 * 1024; // 1 MiB

export function fileToEnvelopeBody(bytes: Uint8Array): string {
  return bytesToBase64(bytes);
}

export function envelopeBodyToFileBytes(body: string): Uint8Array {
  return base64ToBytes(body);
}
