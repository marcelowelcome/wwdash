// Board endpoint — HTTP layer.
// See: docs/board-api-briefing.md (v1.2) — single source of truth for the contract.
//
// Responsibilities (only):
//  - Parse query params
//  - Authenticate (Bearer)
//  - Rate-limit (best-effort)
//  - Validate range
//  - Delegate to orchestrator
//  - Map errors to status codes
//  - ETag for closed periods
//  - Audit log fire-and-forget

import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";

import { extractClientMeta, recordAudit } from "@/lib/board/audit";
import { verifyBoardAuth } from "@/lib/board/auth";
import {
    PeriodValidationError,
    isPartialPeriod,
    validateRange,
} from "@/lib/board/period";
import { OrchestrationError, orchestrateBoard } from "@/lib/board/orchestrator";
import { checkRateLimit } from "@/lib/board/rate-limit";
import type { Brand, ErrorBody, ErrorCode } from "@/lib/board/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BRANDS: ReadonlyArray<Brand> = ["ww", "wt"] as const;

function jsonError(code: ErrorCode, message: string, status: number, headers?: HeadersInit): NextResponse {
    const body: ErrorBody = { error: { code, message } };
    return NextResponse.json(body, { status, headers });
}

function etagFor(payload: unknown): string {
    return `"${createHash("sha256").update(JSON.stringify(payload)).digest("hex").slice(0, 32)}"`;
}

export async function GET(request: NextRequest) {
    const startedAtMs = Date.now();
    const { ip, ua } = extractClientMeta(request.headers);

    // Default audit fields (unknown until parsed)
    let auditBrand: Brand | "unknown" = "unknown";
    let auditStart = "unknown";
    let auditEnd = "unknown";

    const finalize = (status: number, errorCode: ErrorCode | null) => {
        // Don't audit `unknown` brand (couldn't parse) — those are spam/probes.
        if (auditBrand === "unknown") return;
        const latency_ms = Date.now() - startedAtMs;
        // Fire and forget; never await (route returns response before this resolves).
        void recordAudit({
            brand: auditBrand,
            period_start: auditStart,
            period_end: auditEnd,
            status_code: status,
            error_code: errorCode,
            latency_ms,
            client_ip: ip,
            user_agent: ua,
        });
    };

    // 1. Auth (constant-time)
    const auth = verifyBoardAuth(request.headers.get("authorization"));
    if (auth === "denied") {
        return jsonError("UNAUTHORIZED", "Authentication required", 401);
    }

    // 2. Rate limit (best-effort; never blocks on infra failure)
    const rl = await checkRateLimit(ip);
    if (!rl.ok) {
        const retryAfter = rl.retryAfterSec ?? 60;
        return jsonError("RATE_LIMIT", `Rate limit exceeded. Retry after ${retryAfter} seconds.`, 429, {
            "Retry-After": String(retryAfter),
        });
    }

    // 3. Parse params
    const { searchParams } = new URL(request.url);
    const brand = searchParams.get("brand");
    const start = searchParams.get("start");
    const end = searchParams.get("end");

    if (!brand || !start || !end) {
        return jsonError(
            "MISSING_PARAM",
            "Missing required query params: brand, start, end",
            400
        );
    }

    if (!BRANDS.includes(brand as Brand)) {
        return jsonError("INVALID_BRAND", `Brand must be 'wt' or 'ww', got '${brand}'`, 422);
    }

    auditBrand = brand as Brand;
    auditStart = start;
    auditEnd = end;

    // 4. Validate range (throws PeriodValidationError)
    try {
        validateRange(start, end);
    } catch (err) {
        if (err instanceof PeriodValidationError) {
            const status = err.code === "RANGE_TOO_OLD" ? 422 : 400;
            const resp = jsonError(err.code, err.message, status);
            finalize(status, err.code);
            return resp;
        }
        throw err;
    }

    // 5. Orchestrate (may throw OrchestrationError → 503)
    try {
        const payload = await orchestrateBoard({
            brand: brand as Brand,
            start,
            end,
        });

        const isPartial = isPartialPeriod(end);
        const headers: Record<string, string> = {};

        if (!isPartial) {
            const etag = etagFor(payload);
            headers["ETag"] = etag;
            headers["Cache-Control"] = "public, max-age=3600, immutable";

            const ifNoneMatch = request.headers.get("if-none-match");
            if (ifNoneMatch && ifNoneMatch === etag) {
                finalize(304, null);
                return new NextResponse(null, { status: 304, headers });
            }
        } else {
            headers["Cache-Control"] = "no-store";
        }

        finalize(200, null);
        return NextResponse.json(payload, { status: 200, headers });
    } catch (err) {
        if (err instanceof OrchestrationError) {
            const resp = jsonError(err.code, err.message, 503);
            finalize(503, err.code);
            return resp;
        }

        console.error("[board.weekly] internal error:", err);
        const message = err instanceof Error ? err.message : "Internal error";
        const resp = jsonError("INTERNAL", message, 500);
        finalize(500, "INTERNAL");
        return resp;
    }
}
