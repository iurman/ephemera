import type { NextConfig } from "next";

// Next injects inline bootstrap scripts during hydration, so script-src needs
// 'unsafe-inline' unless we adopt nonce-based CSP via a proxy. Documented
// tradeoff for a self-hosted single-origin app. Dev additionally needs
// 'unsafe-eval' for Turbopack's runtime; production does not get it.
const isDev = process.env.NODE_ENV === "development";
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  reactStrictMode: true,
  serverExternalPackages: ["pg"],
  // Dev-only: lets the Playwright container reach the dev server without
  // Next's dev origin protection blocking hydration. Ignored in production.
  allowedDevOrigins: ["127.0.0.1", "localhost", "172.19.0.1"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
      {
        // Never leak drop URLs (which may carry key fragments in referrers)
        // and keep secret pages out of search engines and caches.
        source: "/d/:path*",
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
          { key: "Cache-Control", value: "no-store" },
        ],
      },
    ];
  },
};

export default nextConfig;
