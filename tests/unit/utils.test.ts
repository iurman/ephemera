import { describe, it, expect } from "vitest";
import {
  formatTimeLeft,
  formatBytes,
  computeDropStatus,
  isValidUrl,
  summarizeUserAgent,
  truncate,
} from "@/lib/utils";

describe("formatTimeLeft", () => {
  it("formats each magnitude band", () => {
    expect(formatTimeLeft(0)).toBe("0s");
    expect(formatTimeLeft(45)).toBe("45s");
    expect(formatTimeLeft(90)).toBe("1:30");
    expect(formatTimeLeft(6 * 60)).toBe("~6m");
    expect(formatTimeLeft(3700)).toBe("1h 1m");
    expect(formatTimeLeft(90000)).toBe("1d 1h");
  });
});

describe("formatBytes", () => {
  it("scales units", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2.0 KB");
    expect(formatBytes(1024 * 1024 * 1.5)).toBe("1.50 MB");
  });
});

describe("computeDropStatus", () => {
  const base = {
    revokedAt: null,
    expiresAt: new Date(Date.now() + 60_000),
    usedViews: 0,
    maxViews: 1,
    now: Date.now(),
  };

  it("orders precedence: revoked > expired > exhausted > active", () => {
    expect(computeDropStatus(base)).toBe("active");
    expect(computeDropStatus({ ...base, usedViews: 1 })).toBe("exhausted");
    expect(computeDropStatus({ ...base, usedViews: 1, expiresAt: new Date(base.now - 1000) })).toBe(
      "expired",
    );
    expect(
      computeDropStatus({
        ...base,
        usedViews: 1,
        expiresAt: new Date(base.now - 1000),
        revokedAt: new Date(),
      }),
    ).toBe("revoked");
  });
});

describe("isValidUrl", () => {
  it("accepts http(s), rejects everything else", () => {
    expect(isValidUrl("https://example.com")).toBe(true);
    expect(isValidUrl("http://example.com/path?q=1")).toBe(true);
    expect(isValidUrl("javascript:alert(1)")).toBe(false);
    expect(isValidUrl("ftp://example.com")).toBe(false);
    expect(isValidUrl("example.com")).toBe(false);
  });
});

describe("summarizeUserAgent", () => {
  it("detects bots and summarizes browsers", () => {
    expect(summarizeUserAgent("Slackbot-LinkExpanding 1.0")).toBe("Bot / preview");
    expect(summarizeUserAgent(null)).toBe("Unknown");
    expect(
      summarizeUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
      ),
    ).toBe("Chrome · Windows");
  });
});

describe("truncate", () => {
  it("truncates with an ellipsis", () => {
    expect(truncate("hello", 10)).toBe("hello");
    expect(truncate("hello world", 8)).toBe("hello w…");
  });
});
