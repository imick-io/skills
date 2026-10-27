// Serves the tracker page on Vercel, built from GitHub on request.
// Env: GITHUB_TOKEN (read-only: Issues, Pull requests, Metadata),
// TRACKER_USER and TRACKER_PASSWORD (basic auth), optional TRACKER_REPO.
// Responses are never CDN-cached, so every visit passes the password check;
// a warm instance reuses its last page for CACHE_MS.

import { timingSafeEqual } from "node:crypto";
import { render } from "../build.mjs";

const CACHE_MS = 60_000;
let cached = null;

function authorized(request) {
  const { TRACKER_USER, TRACKER_PASSWORD } = process.env;
  if (!TRACKER_USER || !TRACKER_PASSWORD) return false;
  const header = request.headers.get("authorization") ?? "";
  if (!header.startsWith("Basic ")) return false;
  const given = Buffer.from(Buffer.from(header.slice(6), "base64").toString());
  const expected = Buffer.from(`${TRACKER_USER}:${TRACKER_PASSWORD}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function GET(request) {
  if (!authorized(request)) {
    return new Response("Authentication required", {
      status: 401,
      headers: { "www-authenticate": 'Basic realm="tracker"', "cache-control": "no-store" },
    });
  }
  const fresh = new URL(request.url).searchParams.has("refresh");
  if (fresh || !cached || Date.now() - cached.at > CACHE_MS) {
    cached = { at: Date.now(), html: (await render()).html };
  }
  return new Response(cached.html, {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "private, no-store" },
  });
}
