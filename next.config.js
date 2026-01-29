/** @type {import('next').NextConfig} */
const nextConfig = {
  // Enable standalone output for Docker deployment
  output: "standalone",

  // Disable x-powered-by header
  poweredByHeader: false,

  // Enable strict mode for better debugging
  reactStrictMode: true,

  // External packages for server components (moved from experimental in Next.js 15)
  serverExternalPackages: ["drizzle-orm", "pg"],
};

export default nextConfig;
