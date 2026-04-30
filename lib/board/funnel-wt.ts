// Board endpoint — Welcome Trips (WT) pure funnel calculator
// See: docs/board-api-briefing.md (v1.2) section 4.2
//
// All inputs are pre-fetched BoardDeal[]. No I/O.

import { TRIPS_PIPELINES } from "./constants";
import type { BoardDeal, FunnelWT, NullFunnelWT, RollingWT, UtcRange } from "./types";

// ─── Filter primitives ──────────────────────────────────────────────────────
function isWtBaseQualified(d: BoardDeal): boolean {
    if (!d.pipeline || !TRIPS_PIPELINES.includes(d.pipeline)) return false;
    return true;
}

function inRange(iso: string | null, range: UtcRange): boolean {
    if (!iso) return false;
    const t = Date.parse(iso);
    if (Number.isNaN(t)) return false;
    return t >= range.startUtc.getTime() && t <= range.endUtc.getTime();
}

// "Pagou a taxa?" — fallback entre os dois campos legacy (parity com dashboard).
// See: lib/supabase-api.ts:168
function taxaPaid(d: BoardDeal): boolean {
    const a = (d.pagamento_de_taxa ?? "").trim();
    const b = (d.pagou_a_taxa ?? "").trim();
    return a.length > 0 || b.length > 0;
}

// ─── Main computation ───────────────────────────────────────────────────────
export interface ComputeWtInput {
    deals: BoardDeal[];
    range: UtcRange;
    isComplete: boolean;
}

export function computeFunnelWt(input: ComputeWtInput): FunnelWT {
    const { deals, range, isComplete } = input;

    let leads_gerados = 0;
    let qualificados = 0;
    let vendas = 0;

    for (const d of deals) {
        if (!isWtBaseQualified(d)) continue;

        if (inRange(d.created_at, range)) leads_gerados++;
        if (d.pipeline === "SDR - Trips" && inRange(d.created_at, range)) qualificados++;
        if (inRange(d.sdr_wt_data_fechamento_taxa, range) && taxaPaid(d)) vendas++;
    }

    return { leads_gerados, qualificados, vendas, is_complete: isComplete };
}

export function computeRollingWt(input: ComputeWtInput): RollingWT {
    const full = computeFunnelWt(input);
    return {
        vendas: full.vendas,
        qualificados: full.qualificados,
        is_complete: full.is_complete,
    };
}

export function averageWtWeeks(weeks: Array<FunnelWT | null>): FunnelWT | NullFunnelWT {
    const valid = weeks.filter((w): w is FunnelWT => w !== null);
    if (valid.length === 0) {
        return {
            leads_gerados: null,
            qualificados: null,
            vendas: null,
            is_complete: true,
        };
    }

    const sum = valid.reduce(
        (acc, w) => ({
            leads_gerados: acc.leads_gerados + w.leads_gerados,
            qualificados: acc.qualificados + w.qualificados,
            vendas: acc.vendas + w.vendas,
        }),
        { leads_gerados: 0, qualificados: 0, vendas: 0 }
    );

    const n = valid.length;
    const avg = (x: number) => Math.round(x / n);

    return {
        leads_gerados: avg(sum.leads_gerados),
        qualificados: avg(sum.qualificados),
        vendas: avg(sum.vendas),
        is_complete: true,
    };
}

export const __testing = { isWtBaseQualified, inRange, taxaPaid };
