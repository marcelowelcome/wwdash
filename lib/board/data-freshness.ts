// Board endpoint — data freshness checks
// See: docs/board-api-briefing.md (v1.2) section 9.3 + 7

import { getSupabaseAdmin } from "./supabase-admin";
import { failHours, staleHours } from "./constants";
import type { DataFreshness, UtcRange } from "./types";

// Returns the most recent successful sync_logs.finished_at as ISO UTC,
// plus the count of successful syncs whose finished_at fell within `period`.
//
// Tolerant to schema variants: sync_logs may have `finished_at`, `completed_at`,
// or `created_at` depending on dash-webhook version. We fall back across them.
export async function getDataFreshness(period: UtcRange): Promise<DataFreshness> {
    const supabase = getSupabaseAdmin();

    // Latest successful sync (any time)
    const { data: latestRows, error: latestErr } = await supabase
        .from("sync_logs")
        .select("finished_at, completed_at, created_at, status")
        .eq("status", "success")
        .order("finished_at", { ascending: false, nullsFirst: false })
        .limit(1);

    if (latestErr) {
        // Surface the error to the orchestrator. Do not swallow.
        throw new Error(`Failed to query sync_logs (latest): ${latestErr.message}`);
    }

    const latestRow = latestRows && latestRows.length > 0 ? latestRows[0] : null;
    const acLastSync: string | null = latestRow
        ? (latestRow.finished_at as string) ||
          (latestRow.completed_at as string) ||
          (latestRow.created_at as string) ||
          null
        : null;

    const stale = isStale(acLastSync);

    // Count of successful syncs in [start, end]
    const { count, error: countErr } = await supabase
        .from("sync_logs")
        .select("*", { count: "exact", head: true })
        .eq("status", "success")
        .gte("finished_at", period.startUtc.toISOString())
        .lte("finished_at", period.endUtc.toISOString());

    if (countErr) {
        throw new Error(`Failed to query sync_logs (count): ${countErr.message}`);
    }

    return {
        ac_last_sync: acLastSync,
        stale,
        syncs_in_period: count ?? 0,
    };
}

export function isStale(acLastSyncIso: string | null, now: Date = new Date()): boolean {
    if (!acLastSyncIso) return true;
    const last = Date.parse(acLastSyncIso);
    if (Number.isNaN(last)) return true;
    const ageHours = (now.getTime() - last) / (1000 * 60 * 60);
    return ageHours > staleHours();
}

export function isFailingFresh(acLastSyncIso: string | null, now: Date = new Date()): boolean {
    if (!acLastSyncIso) return true;
    const last = Date.parse(acLastSyncIso);
    if (Number.isNaN(last)) return true;
    const ageHours = (now.getTime() - last) / (1000 * 60 * 60);
    return ageHours > failHours();
}
