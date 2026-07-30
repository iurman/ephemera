import { describe, it, expect } from "vitest";
import {
  generateKeyBytes,
  generateSalt,
  deriveKeyFromPassphrase,
  sealEnvelope,
  openEnvelope,
  keyToFragment,
  keyFromFragment,
  bytesToBase64,
  base64ToBytes,
  bytesToBase64Url,
  base64UrlToBytes,
  fileToEnvelopeBody,
  envelopeBodyToFileBytes,
  type DropEnvelope,
} from "@/lib/crypto";

describe("base64 helpers", () => {
  it("round-trips arbitrary bytes", () => {
    const bytes = new Uint8Array(256).map((_, i) => i);
    expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes);
  });

  it("round-trips via base64url without padding", () => {
    const bytes = generateKeyBytes();
    const url = bytesToBase64Url(bytes);
    expect(url).not.toMatch(/[+/=]/);
    expect(base64UrlToBytes(url)).toEqual(bytes);
  });
});

describe("envelope sealing", () => {
  const envelope: DropEnvelope = { v: 1, type: "text", body: "the launch code is 0000" };

  it("seals and opens with the same key", async () => {
    const key = generateKeyBytes();
    const sealed = await sealEnvelope(envelope, key);
    expect(sealed.ciphertextB64).not.toContain("launch code");
    const opened = await openEnvelope(sealed.ciphertextB64, sealed.ivB64, key);
    expect(opened).toEqual(envelope);
  });

  it("fails to open with a different key", async () => {
    const sealed = await sealEnvelope(envelope, generateKeyBytes());
    await expect(
      openEnvelope(sealed.ciphertextB64, sealed.ivB64, generateKeyBytes()),
    ).rejects.toThrow();
  });

  it("fails when the ciphertext is tampered with", async () => {
    const key = generateKeyBytes();
    const sealed = await sealEnvelope(envelope, key);
    const corrupted = sealed.ciphertextB64.slice(0, -4) + "AAAA";
    await expect(openEnvelope(corrupted, sealed.ivB64, key)).rejects.toThrow();
  });

  it("uses a fresh IV per seal", async () => {
    const key = generateKeyBytes();
    const a = await sealEnvelope(envelope, key);
    const b = await sealEnvelope(envelope, key);
    expect(a.ivB64).not.toEqual(b.ivB64);
    expect(a.ciphertextB64).not.toEqual(b.ciphertextB64);
  });
});

describe("passphrase derivation", () => {
  it("derives the same key for the same passphrase + salt", async () => {
    const salt = generateSalt();
    const a = await deriveKeyFromPassphrase("correct horse", salt, 1000);
    const b = await deriveKeyFromPassphrase("correct horse", salt, 1000);
    expect(a).toEqual(b);
    expect(a).toHaveLength(32);
  });

  it("derives different keys for different passphrases", async () => {
    const salt = generateSalt();
    const a = await deriveKeyFromPassphrase("correct horse", salt, 1000);
    const b = await deriveKeyFromPassphrase("battery staple", salt, 1000);
    expect(a).not.toEqual(b);
  });

  it("end-to-end: passphrase-sealed envelope opens with the passphrase", async () => {
    const salt = generateSalt();
    const key = await deriveKeyFromPassphrase("hunter2", salt, 1000);
    const sealed = await sealEnvelope({ v: 1, type: "url", body: "https://example.com" }, key);

    const rederived = await deriveKeyFromPassphrase("hunter2", salt, 1000);
    const opened = await openEnvelope(sealed.ciphertextB64, sealed.ivB64, rederived);
    expect(opened.body).toBe("https://example.com");
  });
});

describe("URL fragment", () => {
  it("round-trips a key through the fragment", () => {
    const key = generateKeyBytes();
    const fragment = keyToFragment(key);
    expect(keyFromFragment(`#${fragment}`)).toEqual(key);
    expect(keyFromFragment(fragment)).toEqual(key);
  });

  it("returns null for malformed fragments", () => {
    expect(keyFromFragment("")).toBeNull();
    expect(keyFromFragment("#")).toBeNull();
    expect(keyFromFragment("#k=short")).toBeNull();
    expect(keyFromFragment("#other=value")).toBeNull();
  });
});

describe("file bodies", () => {
  it("round-trips binary file content", () => {
    const bytes = new Uint8Array(1024).map(() => Math.floor(Math.random() * 256));
    expect(envelopeBodyToFileBytes(fileToEnvelopeBody(bytes))).toEqual(bytes);
  });
});
