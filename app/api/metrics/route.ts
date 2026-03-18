import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import {
  fetchFieldMetaFromDb,
  fetchStagesFromDb,
  fetchAllDealsFromDb,
  fetchWonDealsFromDb,
  CLOSER_GROUP_ID,
  periodToDaysBack,
} from "@/lib/supabase-api";
import { computeMetrics, type Metrics } from "@/lib/metrics";
import { type WonDeal } from "@/lib/schemas";

// ─── TYPES ──────────────────────────────────────────────────────────────────

interface SyncLog {
  id: number;
  started_at: string;
  finished_at: string;
  hours_back: number;
  synced: number;
  pages: number;
  errors: string[] | null;
  trigger_source: string;
}

interface CachedPayload {
  metrics: Metrics;
  sdrDeals: WonDeal[];
  closerDeals: WonDeal[];
  wonDeals: WonDeal[];
  fieldMap: Record<string, string>;
  stageMap: Record<string, string>;
  lastSyncLog: SyncLog | null;
  computedAt: string;
}

// ─── IN-MEMORY CACHE (keyed by period) ─────────────────────────────────────

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const STALE_TTL_MS = 10 * 60 * 1000; // 10 minutes

const cache = new Map<number, { data: CachedPayload; at: number }>();
const revalidatingSet = new Set<number>();

const VALID_PERIODS = new Set([30, 90, 180, 365, 0]);

// ─── DATA FETCHER ──────────────────────────────────────────────────────────

async function fetchAndCompute(period: number): Promise<CachedPayload> {
  const validPeriod = VALID_PERIODS.has(period) ? period : 180;
  const daysBack = periodToDaysBack(validPeriod as import("@/lib/supabase-api").GlobalPeriod);

  const results = await Promise.allSettled([
    fetchFieldMetaFromDb(),
    fetchStagesFromDb(),
    fetchAllDealsFromDb("1", daysBack),
    fetchAllDealsFromDb("3", daysBack),
    fetchAllDealsFromDb(CLOSER_GROUP_ID, daysBack),
    fetchWonDealsFromDb(CLOSER_GROUP_ID), // always all time
    supabase.from("sync_logs").select("*").order("id", { ascending: false }).limit(1),
  ]);

  const get = <T,>(idx: number, fallback: T): T =>
    results[idx].status === "fulfilled"
      ? (results[idx] as PromiseFulfilledResult<T>).value
      : fallback;

  const fieldMap = get<Record<string, string>>(0, {});
  const stageMap = get<Record<string, string>>(1, {});
  const sdrP1 = get<WonDeal[]>(2, []);
  const sdrP3 = get<WonDeal[]>(3, []);
  const closerData = get<WonDeal[]>(4, []);
  const wonData = get<WonDeal[]>(5, []);

  const dealsFailed = [2, 3, 4, 5].filter((i) => results[i].status === "rejected");
  if (dealsFailed.length === 4) {
    const firstErr = (results[2] as PromiseRejectedResult).reason;
    throw new Error(`Falha ao buscar deals: ${firstErr}`);
  }

  const combinedSdr = [...sdrP1, ...sdrP3];
  const metrics = computeMetrics(sdrP1, closerData, wonData, fieldMap, stageMap);

  const syncResult = get<{ data: SyncLog[] | null }>(6, { data: null });
  const lastSyncLog = syncResult.data && syncResult.data.length > 0 ? syncResult.data[0] : null;

  return {
    metrics,
    sdrDeals: combinedSdr,
    closerDeals: closerData,
    wonDeals: wonData,
    fieldMap,
    stageMap,
    lastSyncLog,
    computedAt: new Date().toISOString(),
  };
}

// ─── BACKGROUND REVALIDATION ────────────────────────────────────────────────

const BACKOFF_MS = 30_000; // 30s backoff after failed revalidation
const failedAt = new Map<number, number>(); // period → timestamp of last failure

function triggerRevalidation(period: number) {
  if (revalidatingSet.has(period)) return;
  // Backoff: skip if last failure was recent
  const lastFail = failedAt.get(period) || 0;
  if (Date.now() - lastFail < BACKOFF_MS) return;

  revalidatingSet.add(period);
  fetchAndCompute(period)
    .then((payload) => {
      cache.set(period, { data: payload, at: Date.now() });
      failedAt.delete(period); // clear backoff on success
    })
    .catch((err) => {
      console.error(`[api/metrics] Revalidation failed for period=${period}:`, err);
      failedAt.set(period, Date.now()); // set backoff timer
    })
    .finally(() => {
      revalidatingSet.delete(period);
    });
}

// ─── GET ────────────────────────────────────────────────────────────────────

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const periodParam = parseInt(searchParams.get("period") || "180", 10);
    const period = VALID_PERIODS.has(periodParam) ? periodParam : 180;

    const now = Date.now();
    const entry = cache.get(period);
    const age = entry ? now - entry.at : Infinity;

    // Cache HIT (fresh)
    if (entry && age < CACHE_TTL_MS) {
      return NextResponse.json(entry.data, {
        headers: {
          "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
          "X-Cache": "HIT",
          "X-Cache-Age": String(Math.round(age / 1000)),
        },
      });
    }

    // Cache STALE — return stale data, revalidate in background
    if (entry && age < STALE_TTL_MS) {
      triggerRevalidation(period);
      return NextResponse.json(entry.data, {
        headers: {
          "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
          "X-Cache": "STALE",
          "X-Cache-Age": String(Math.round(age / 1000)),
        },
      });
    }

    // Cache MISS — fetch synchronously
    const payload = await fetchAndCompute(period);
    cache.set(period, { data: payload, at: Date.now() });

    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
        "X-Cache": "MISS",
        "X-Cache-Age": "0",
      },
    });
  } catch (error) {
    console.error("[api/metrics] GET error:", error);
    return NextResponse.json(
      { error: "Falha ao computar métricas", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

// ─── POST: invalidate all period caches ─────────────────────────────────────

export async function POST() {
  cache.clear();
  revalidatingSet.clear();
  return NextResponse.json({ ok: true, message: "Cache invalidado" });
}
