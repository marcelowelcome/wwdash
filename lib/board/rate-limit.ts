// Board endpoint — rate limiting
// See: docs/board-api-briefing.md (v1.2) section 9.2
//
// Strategy:
//  - PRIMARY: Vercel KV via @vercel/kv when KV_REST_API_URL/KV_REST_API_TOKEN are set.
//    Implemented as a dynamic import so the package is optional at install-time.
//  - FALLBACK: in-memory Map (works for local dev only; Vercel serverless cold starts
//    reset state, so it does NOT enforce the limit across requests in production).
//    The fallback is intentionally permissive — it returns `{ ok: true }` if KV is
//    unreachable or unconfigured, after logging a single warning.
//
// The rate limit is a defense-in-depth, not the primary auth control.

import { rateLimitRpm } from "./constants";

export interface RateLimitResult {
    ok: boolean;
    retryAfterSec?: number;
}

const fallbackBuckets = new Map<string, { count: number; resetAt: number }>();
let kvUnavailableLogged = false;

async function tryKvRateLimit(ip: string, limit: number, windowSec: number): Promise<RateLimitResult | null> {
    if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
        return null; // not configured
    }

    try {
        // Dynamic import keeps the package optional at deploy time and
        // simplifies tests (we don't have to mock at module-load).
        const mod = (await import("@vercel/kv")) as {
            kv?: {
                incr: (k: string) => Promise<number>;
                expire: (k: string, s: number) => Promise<unknown>;
                ttl: (k: string) => Promise<number>;
            };
        };
        if (!mod.kv) return null;
        const key = `board:rl:${ip}`;
        const count = await mod.kv.incr(key);
        if (count === 1) await mod.kv.expire(key, windowSec);
        if (count > limit) {
            const ttl = await mod.kv.ttl(key);
            return { ok: false, retryAfterSec: ttl > 0 ? ttl : windowSec };
        }
        return { ok: true };
    } catch (err) {
        if (!kvUnavailableLogged) {
            console.warn("[board-rate-limit] KV unavailable, falling back:", err);
            kvUnavailableLogged = true;
        }
        return null;
    }
}

function fallbackRateLimit(ip: string, limit: number, windowSec: number, now: number): RateLimitResult {
    const bucket = fallbackBuckets.get(ip);
    if (!bucket || bucket.resetAt <= now) {
        fallbackBuckets.set(ip, { count: 1, resetAt: now + windowSec * 1000 });
        return { ok: true };
    }
    bucket.count++;
    if (bucket.count > limit) {
        const retryAfterSec = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
        return { ok: false, retryAfterSec };
    }
    return { ok: true };
}

export async function checkRateLimit(
    ip: string | null,
    limit: number = rateLimitRpm(),
    windowSec: number = 60,
    now: number = Date.now()
): Promise<RateLimitResult> {
    // Without an IP we cannot rate limit; default to allow.
    if (!ip) return { ok: true };

    const kvResult = await tryKvRateLimit(ip, limit, windowSec);
    if (kvResult) return kvResult;

    // Fallback (dev only)
    return fallbackRateLimit(ip, limit, windowSec, now);
}

// Test helper.
export const __testing = { fallbackBuckets, fallbackRateLimit };
