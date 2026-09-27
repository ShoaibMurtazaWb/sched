/**
 * Next.js Route Handler — same-origin API proxy for /api/v1/[...path]
 *
 * All browser requests to /api/v1/** are handled here:
 *   1. Next.js receives the request (same-origin, so session cookies are sent)
 *   2. This handler forwards the request server-to-server to the Northflank API
 *   3. The upstream response (headers, body, Set-Cookie, redirects) is streamed back
 *
 * Why a Route Handler instead of next.config.ts rewrites?
 *   Vercel's edge/serverless rewrites resolve API_ORIGIN at build time and can fail
 *   with DNS_HOSTNAME_RESOLVED_PRIVATE when the destination resolves to a private IP
 *   from Vercel's network. A Route Handler runs as a Serverless Function and resolves
 *   the upstream host at request-time, bypassing that restriction.
 *
 * OAuth redirects (/integrations/google/connect, /integrations/zoom/connect):
 *   The upstream NestJS controller issues a 302 redirect to Google/Zoom.
 *   We do NOT follow that redirect — we pass the 302 + Location header straight back
 *   to the browser so it navigates directly to Google/Zoom. The OAuth callback URLs
 *   (GOOGLE_REDIRECT_URI, ZOOM_REDIRECT_URI) are hardcoded on the Northflank API and
 *   point there directly — they are not proxied through Next.js.
 */

import { type NextRequest, NextResponse } from "next/server";

/** Upstream NestJS API base URL — set API_ORIGIN on Vercel, falls back to localhost. */
const API_ORIGIN = (process.env.API_ORIGIN ?? "http://localhost:3001").replace(/\/+$/, "");

/** Headers we must not forward upstream (hop-by-hop or Next.js-internal). */
const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailers",
  "transfer-encoding",
  "upgrade",
  // Next.js adds its own host header for the destination
  "host",
]);

/** Headers we must not copy from the upstream response back to the browser. */
const UPSTREAM_DROP = new Set([
  "connection",
  "keep-alive",
  "transfer-encoding",
  "te",
  "trailers",
  "upgrade",
  // Upstream sets content-encoding; Next.js/fetch decodes the body automatically,
  // so re-sending the header would cause browsers to try to decompress already-decoded data.
  "content-encoding",
  // Content-length may differ after decompression; let Next.js recalculate it.
  "content-length",
]);

function buildUpstreamHeaders(req: NextRequest): Headers {
  const out = new Headers();
  req.headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (!HOP_BY_HOP.has(lower)) {
      out.set(key, value);
    }
  });
  return out;
}

async function proxy(req: NextRequest, path: string[]): Promise<NextResponse> {
  const upstreamPath = `/api/v1/${path.join("/")}`;
  const search = req.nextUrl.search; // preserve query parameters
  const upstreamUrl = `${API_ORIGIN}${upstreamPath}${search}`;

  const upstreamHeaders = buildUpstreamHeaders(req);

  // Read the request body only for methods that carry a body.
  const hasBody = !["GET", "HEAD", "OPTIONS"].includes(req.method.toUpperCase());
  const body = hasBody ? req.body : undefined;

  let upstreamRes: Response;
  try {
    upstreamRes = await fetch(upstreamUrl, {
      method: req.method,
      headers: upstreamHeaders,
      body: body as BodyInit | undefined,
      // IMPORTANT: do not follow redirects — pass them through to the browser.
      // This is essential for OAuth /connect endpoints that 302 to Google/Zoom.
      redirect: "manual",
      // @ts-expect-error — Node.js fetch supports duplex for streaming request bodies
      duplex: "half",
    });
  } catch (err) {
    console.error("[proxy] upstream fetch failed", upstreamUrl, err);
    return NextResponse.json(
      { error: { code: "UPSTREAM_UNAVAILABLE", message: "API is temporarily unavailable." } },
      { status: 503 }
    );
  }

  // Build the response headers to return to the browser.
  const resHeaders = new Headers();
  upstreamRes.headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (!UPSTREAM_DROP.has(lower)) {
      resHeaders.append(key, value);
    }
  });

  // Stream the upstream body directly to the browser.
  return new NextResponse(upstreamRes.body, {
    status: upstreamRes.status,
    headers: resHeaders,
  });
}

// Export a handler for every HTTP method Next.js supports.
export async function GET(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  return proxy(req, path);
}
export async function POST(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  return proxy(req, path);
}
export async function PUT(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  return proxy(req, path);
}
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  return proxy(req, path);
}
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  return proxy(req, path);
}
export async function OPTIONS(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  return proxy(req, path);
}
export async function HEAD(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  return proxy(req, path);
}
