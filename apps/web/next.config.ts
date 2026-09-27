import type { NextConfig } from "next";

// API_ORIGIN is consumed by the Route Handler at app/api/v1/[...path]/route.ts.
// Set API_ORIGIN=https://sched--sched--cnqzwmc5pbnz.code.run on Vercel (server-side only).
// Falls back to the local NestJS API during development.

const nextConfig: NextConfig = {};

export default nextConfig;
