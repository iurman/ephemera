/** @type {import('next').NextConfig} */
const nextConfig = {
  // Enable standalone output for Docker deployment
  output: "standalone",

  // Disable x-powered-by header
  poweredByHeader: false,

  // Enable strict mode for better debugging
  reactStrictMode: true,

  // Experimental features
  experimental: {
    // Optimize server components
    serverComponentsExternalPackages: ["drizzle-orm", "pg"],
  },
};

export default nextConfig;
