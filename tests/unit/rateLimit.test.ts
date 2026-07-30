import { describe, it, expect, beforeEach } from "vitest";
import { checkRateLimit, resetRateLimits, truncateIp } from "@/server/security/rateLimit";

beforeEach(() => resetRateLimits());

describe("checkRateLimit", () => {
  it("allows up to the limit inside a window, then refuses", () => {
    for (let i = 0; i < 5; i++) {
      expect(checkRateLimit("k", 5, 60_000).ok).toBe(true);
    }
    const refused = checkRateLimit("k", 5, 60_000);
    expect(refused.ok).toBe(false);
    expect(refused.retryAfterMs).toBeGreaterThan(0);
  });

  it("keys are independent", () => {
    for (let i = 0; i < 5; i++) checkRateLimit("a", 5, 60_000);
    expect(checkRateLimit("a", 5, 60_000).ok).toBe(false);
    expect(checkRateLimit("b", 5, 60_000).ok).toBe(true);
  });

  it("resets after the window elapses", async () => {
    expect(checkRateLimit("w", 1, 30).ok).toBe(true);
    expect(checkRateLimit("w", 1, 30).ok).toBe(false);
    await new Promise((r) => setTimeout(r, 40));
    expect(checkRateLimit("w", 1, 30).ok).toBe(true);
  });
});

describe("truncateIp", () => {
  it("truncates IPv4 to /24", () => {
    expect(truncateIp("93.184.216.34")).toBe("93.184.216.0/24");
  });
  it("truncates IPv6 to /48", () => {
    expect(truncateIp("2606:2800:220:1:248:1893:25c8:1946")).toBe("2606:2800:220::/48");
  });
  it("handles junk gracefully", () => {
    expect(truncateIp(null)).toBeNull();
    expect(truncateIp("")).toBeNull();
    expect(truncateIp("not-an-ip")).toBeNull();
  });
});
