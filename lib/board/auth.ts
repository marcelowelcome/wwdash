// Board endpoint — auth (Bearer + constant-time compare)
// See: docs/board-api-briefing.md (v1.2) section 5

import { timingSafeEqual } from "node:crypto";

export type AuthResult = "ok" | "denied";

// Parse "Authorization: Bearer <key>" header.
// Returns the raw key, or null if header is malformed/absent.
function parseBearer(headerValue: string | null): string | null {
    if (!headerValue) return null;
    const match = /^Bearer\s+(.+)$/i.exec(headerValue);
    if (!match) return null;
    const token = match[1].trim();
    return token.length > 0 ? token : null;
}

// Constant-time compare two strings of arbitrary length.
// Returns false if lengths differ (without leaking the actual length via early exit
// on the first byte — we still iterate up to max length).
function constantTimeStringEquals(a: string, b: string): boolean {
    const bufA = Buffer.from(a, "utf8");
    const bufB = Buffer.from(b, "utf8");

    // To get a constant-time compare, both buffers must be the same length.
    // We pad whichever is shorter and still flip a "lengths differ" flag if applicable.
    const maxLen = Math.max(bufA.length, bufB.length);
    const padA = Buffer.alloc(maxLen);
    const padB = Buffer.alloc(maxLen);
    bufA.copy(padA);
    bufB.copy(padB);

    const equalContent = timingSafeEqual(padA, padB);
    return equalContent && bufA.length === bufB.length;
}

// Verify the request's Authorization header against the configured BOARD_API_KEY.
// Returns "ok" only if the env is configured AND the bearer matches.
// Otherwise returns "denied" (caller maps to 401, single response shape).
export function verifyBoardAuth(authorizationHeader: string | null): AuthResult {
    const expected = process.env.BOARD_API_KEY;
    if (!expected || expected.length === 0) {
        // Server misconfigured: no key set. Refuse all requests rather than allow.
        return "denied";
    }

    const provided = parseBearer(authorizationHeader);
    if (!provided) return "denied";

    return constantTimeStringEquals(expected, provided) ? "ok" : "denied";
}

// Exposed for tests.
export const __testing = { parseBearer, constantTimeStringEquals };
