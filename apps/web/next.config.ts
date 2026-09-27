import type { NextConfig } from "next";

// Server-side only env var — NOT exposed to the browser.
// Set API_ORIGIN=https://sched--sched--cnqzwmc5pbnz.code.run on Vercel.
// Falls back to the local NestJS API during development.
const apiOrigin = process.env.API_ORIGIN ?? "http://localhost:3001";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        // Proxy ALL /api/v1/* requests through Next.js to the backend.
        // This keeps all requests same-origin, so session cookies work with
        // SameSite=Lax (the default) — no cross-site cookie workarounds needed.
        source: "/api/v1/:path*",
        destination: `${apiOrigin}/api/v1/:path*`,
      },
    ];
  },
};

export default nextConfig;
