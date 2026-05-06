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

// ─── IN-MEMORY CACHE (keyed by ISO range) ─────────────────────────────────

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const STALE_TTL_MS = 10 * 60 * 1000; // 10 minutes

// Cache key é "<startISO>|<endISO>" (ou "legacy:<period>" para chamadas antigas).
// Usamos string para suportar ranges arbitrários (presets de calendário,
// custom ranges) sem amassar tudo em "daysBack".
const cache = new Map<string, { data: CachedPayload; at: number }>();
const revalidatingSet = new Set<string>();

const VALID_PERIODS = new Set([30, 90, 180, 365, 0]);

interface ResolvedRange {
  cacheKey: string;
  range: { start: Date; end: Date };
}

function rangeFromLegacyPeriod(period: number): ResolvedRange {
  const validPeriod = VALID_PERIODS.has(period) ? period : 180;
  const daysBack = periodToDaysBack(validPeriod as import("@/lib/supabase-api").GlobalPeriod);
  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - daysBack);
  return {
    cacheKey: `legacy:${validPeriod}`,
    range: { start, end },
  };
}

function rangeFromIsoParams(startStr: string, endStr: string): ResolvedRange | null {
  const start = new Date(startStr);
  const end = new Date(endStr);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  if (end.getTime() < start.getTime()) return null;
  return {
    cacheKey: `${start.toISOString()}|${end.toISOString()}`,
    range: { start, end },
  };
}

// ─── DATA FETCHER ──────────────────────────────────────────────────────────

async function fetchAndCompute(range: { start: Date; end: Date }): Promise<CachedPayload> {
  const results = await Promise.allSettled([
    fetchFieldMetaFromDb(),
    fetchStagesFromDb(),
    fetchAllDealsFromDb("1", range),
    fetchAllDealsFromDb("3", range),
    fetchAllDealsFromDb(CLOSER_GROUP_ID, range),
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
const failedAt = new Map<string, number>(); // cacheKey → timestamp of last failure

function triggerRevalidation(resolved: ResolvedRange) {
  const { cacheKey, range } = resolved;
  if (revalidatingSet.has(cacheKey)) return;
  const lastFail = failedAt.get(cacheKey) || 0;
  if (Date.now() - lastFail < BACKOFF_MS) return;

  revalidatingSet.add(cacheKey);
  fetchAndCompute(range)
    .then((payload) => {
      cache.set(cacheKey, { data: payload, at: Date.now() });
      failedAt.delete(cacheKey);
    })
    .catch((err) => {
      console.error(`[api/metrics] Revalidation failed for key=${cacheKey}:`, err);
      failedAt.set(cacheKey, Date.now());
    })
    .finally(() => {
      revalidatingSet.delete(cacheKey);
    });
}

// ─── GET ────────────────────────────────────────────────────────────────────
//
// Aceita 2 formatos de query:
//   1. Novo: ?start=<ISO>&end=<ISO>  (preferido)
//   2. Legacy: ?period=<30|90|180|365|0>  (mapeado para um range relativo)
// Se ambos vierem, `start/end` ganha. Se nenhum, usa period=180.

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const startParam = searchParams.get("start");
    const endParam = searchParams.get("end");

    let resolved: ResolvedRange;
    if (startParam && endParam) {
      const r = rangeFromIsoParams(startParam, endParam);
      if (!r) {
        return NextResponse.json(
          { error: "Parâmetros start/end inválidos" },
          { status: 400 },
        );
      }
      resolved = r;
    } else {
      const periodParam = parseInt(searchParams.get("period") || "180", 10);
      const period = VALID_PERIODS.has(periodParam) ? periodParam : 180;
      resolved = rangeFromLegacyPeriod(period);
    }

    const { cacheKey, range } = resolved;
    const now = Date.now();
    const entry = cache.get(cacheKey);
    const age = entry ? now - entry.at : Infinity;

    // Cache HIT (fresh)
    if (entry && age < CACHE_TTL_MS) {
      return NextResponse.json(entry.data, {
        headers: {
          "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
          "X-Cache": "HIT",
          "X-Cache-Age": String(Math.round(age / 1000)),
          "X-Cache-Key": cacheKey,
        },
      });
    }

    // Cache STALE — return stale data, revalidate in background
    if (entry && age < STALE_TTL_MS) {
      triggerRevalidation(resolved);
      return NextResponse.json(entry.data, {
        headers: {
          "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
          "X-Cache": "STALE",
          "X-Cache-Age": String(Math.round(age / 1000)),
          "X-Cache-Key": cacheKey,
        },
      });
    }

    // Cache MISS — fetch synchronously
    const payload = await fetchAndCompute(range);
    cache.set(cacheKey, { data: payload, at: Date.now() });

    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
        "X-Cache": "MISS",
        "X-Cache-Age": "0",
        "X-Cache-Key": cacheKey,
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
