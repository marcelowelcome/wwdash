// Board endpoint — audit log writer (fire-and-forget)
// See: docs/board-api-briefing.md (v1.2) section 9.1

import { getSupabaseAdmin } from "./supabase-admin";
import type { Brand } from "./types";

export interface AuditEntry {
    brand: Brand;
    period_start: string; // YYYY-MM-DD
    period_end: string;
    status_code: number;
    error_code: string | null;
    latency_ms: number;
    client_ip: string | null;
    user_agent: string | null;
}

// Write a single entry. Never throws; never blocks the response.
// On Vercel runtime, the Promise is allowed to settle in the background
// (route handler returns response without awaiting).
export function recordAudit(entry: AuditEntry): Promise<void> {
    return (async () => {
        try {
            const supabase = getSupabaseAdmin();
            const { error } = await supabase.from("board_audit_log").insert({
                brand: entry.brand,
                period_start: entry.period_start,
                period_end: entry.period_end,
                status_code: entry.status_code,
                error_code: entry.error_code,
                latency_ms: entry.latency_ms,
                client_ip: entry.client_ip,
                user_agent: entry.user_agent,
            });
            if (error) {
                // Silent log only; never throw.
                console.error("[board-audit] insert failed:", error.message);
            }
        } catch (err) {
            console.error("[board-audit] unexpected error:", err);
        }
    })();
}

// Convenience: extract client IP and UA from request headers.
// Vercel sets `x-forwarded-for`. We take the first hop.
export function extractClientMeta(headers: Headers): { ip: string | null; ua: string | null } {
    const xff = headers.get("x-forwarded-for");
    const ip = xff ? xff.split(",")[0].trim() : null;
    const ua = headers.get("user-agent");
    return { ip, ua };
}
