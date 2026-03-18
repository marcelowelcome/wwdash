import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import {
  fetchFieldMetaFromDb,
  fetchStagesFromDb,
  fetchAllDealsFromDb,
  fetchWonDealsFromDb,
  CLOSER_GROUP_ID,
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

// ─── IN-MEMORY CACHE ────────────────────────────────────────────────────────

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const STALE_TTL_MS = 10 * 60 * 1000; // 10 minutes (serve stale while revalidating)

let cachedData: CachedPayload | null = null;
let cachedAt = 0; // timestamp ms
let revalidating = false; // prevents concurrent revalidation

// ─── DATA FETCHER (mirrors Dashboard.tsx loadData) ──────────────────────────

async function fetchAndCompute(): Promise<CachedPayload> {
  const results = await Promise.allSettled([
    fetchFieldMetaFromDb(), // 0
    fetchStagesFromDb(), // 1
    fetchAllDealsFromDb("1", 180), // 2  SDR P1
    fetchAllDealsFromDb("3", 180), // 3  SDR P3
    fetchAllDealsFromDb(CLOSER_GROUP_ID, 365), // 4  Closer
    fetchWonDealsFromDb(CLOSER_GROUP_ID), // 5  Won
    supabase
      .from("sync_logs")
      .select("*")
      .order("id", { ascending: false })
      .limit(1), // 6
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

  // If ALL deal fetches failed, propagate error
  const dealsFailed = [2, 3, 4, 5].filter(
    (i) => results[i].status === "rejected"
  );
  if (dealsFailed.length === 4) {
    const firstErr = (results[2] as PromiseRejectedResult).reason;
    throw new Error(`Falha ao buscar deals: ${firstErr}`);
  }

  const combinedSdr = [...sdrP1, ...sdrP3];
  const metrics = computeMetrics(sdrP1, closerData, wonData, fieldMap, stageMap);

  // Sync log (non-critical)
  const syncResult = get<{ data: SyncLog[] | null }>(6, { data: null });
  const lastSyncLog =
    syncResult.data && syncResult.data.length > 0 ? syncResult.data[0] : null;

  // Log partial failures
  const failures = results
    .map((r, i) => (r.status === "rejected" ? i : null))
    .filter((i) => i !== null);
  if (failures.length > 0) {
    console.warn(
      `[api/metrics] Partial load failures at indices: ${failures.join(", ")}`
    );
  }

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

function triggerRevalidation() {
  if (revalidating) return;
  revalidating = true;
  fetchAndCompute()
    .then((payload) => {
      cachedData = payload;
      cachedAt = Date.now();
      console.log("[api/metrics] Cache revalidated at", payload.computedAt);
    })
    .catch((err) => {
      console.error("[api/metrics] Background revalidation failed:", err);
    })
    .finally(() => {
      revalidating = false;
    });
}

// ─── GET: return cached or fresh metrics ────────────────────────────────────

export async function GET() {
  try {
    const now = Date.now();
    const age = now - cachedAt;

    // Cache hit: fresh
    if (cachedData && age < CACHE_TTL_MS) {
      return NextResponse.json(cachedData, {
        headers: {
          "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
          "X-Cache": "HIT",
          "X-Cache-Age": String(Math.round(age / 1000)),
        },
      });
    }

    // Cache hit: stale — return stale data but revalidate in background
    if (cachedData && age < STALE_TTL_MS) {
      triggerRevalidation();
      return NextResponse.json(cachedData, {
        headers: {
          "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
          "X-Cache": "STALE",
          "X-Cache-Age": String(Math.round(age / 1000)),
        },
      });
    }

    // Cache miss or expired: fetch synchronously
    const payload = await fetchAndCompute();
    cachedData = payload;
    cachedAt = Date.now();

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
      {
        error: "Falha ao computar métricas",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

// ─── POST: invalidate cache (called after sync) ────────────────────────────

export async function POST() {
  cachedData = null;
  cachedAt = 0;
  console.log("[api/metrics] Cache invalidated via POST");

  return NextResponse.json({ ok: true, message: "Cache invalidado" });
}
