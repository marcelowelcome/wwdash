// Board endpoint — constants + KPI definition hashes
// See: docs/board-api-briefing.md (v1.2) section 4 + 4.6

import { createHash } from "node:crypto";
import type { Brand, PipelineType } from "./types";

// ─── Pipeline filters ────────────────────────────────────────────────────────
export const LEADS_PIPELINES: readonly string[] = [
    "SDR Weddings",
    "Closer Weddings",
    "Planejamento Weddings",
    "WW - Internacional",
    "Outros Desqualificados | Wedding",
] as const;

export const TRIPS_PIPELINES: readonly string[] = [
    "Consultoras TRIPS",
    "SDR - Trips",
    "WTN - Desqualificados",
] as const;

// "Reunião realizada" exclusion (paridade com dashboard)
// See: dash-webhook/src/lib/queries.ts:114-116 (calculateFunnelMetrics)
export const REUNIAO_EXCLUDE = ["Não teve reunião", ""] as const;

// ─── Brand ↔ pipeline_type (monthly_targets) ─────────────────────────────────
export const BRAND_TO_PIPELINE_TYPE: Record<Brand, PipelineType> = {
    ww: "wedding",
    wt: "trips",
};

// ─── Timezone ───────────────────────────────────────────────────────────────
export const BRT_TZ = "America/Sao_Paulo";

// ─── Range constraints ──────────────────────────────────────────────────────
export const WEEKLY_RANGE_DAYS = 7;
export const MAX_HISTORY_MONTHS = 24;

// ─── Stale thresholds (parametrizable via env) ──────────────────────────────
export function staleHours(): number {
    return Number(process.env.BOARD_STALE_HOURS) || 6;
}
export function failHours(): number {
    return Number(process.env.BOARD_FAIL_HOURS) || 24;
}
export function rateLimitRpm(): number {
    return Number(process.env.BOARD_RATE_LIMIT_RPM) || 10;
}

// ─── KPI definitions (canonical, hashed for drift detection) ────────────────
// Any change to these constants triggers a different `kpi_definitions_hash`,
// alerting Cowork to validate/recalibrate.
export const WW_DEFINITIONS = {
    leads_gerados: {
        table: "deals",
        date_col: "created_at",
        filters: ["is_elopement=false", "title NOT ILIKE 'EW%'", "pipeline IN LEADS_PIPELINES"],
    },
    qualificados_sdr: {
        table: "deals",
        date_col: "data_qualificado",
        filters: ["is_elopement=false", "title NOT ILIKE 'EW%'", "pipeline IN LEADS_PIPELINES"],
    },
    reunioes_closer: {
        table: "deals",
        date_col: "data_closer",
        filters: [
            "is_elopement=false",
            "title NOT ILIKE 'EW%'",
            "pipeline IN LEADS_PIPELINES",
            "reuniao_closer NOT NULL",
            "reuniao_closer != ''",
            "reuniao_closer != 'Não teve reunião'",
        ],
    },
    contratos_vol: {
        table: "deals",
        date_col: "data_fechamento",
        filters: ["is_elopement=false", "title NOT ILIKE 'EW%'", "pipeline IN LEADS_PIPELINES"],
    },
    conversao_sdr_closer_pct: {
        derived: "reunioes_closer / qualificados_sdr * 100",
        on_zero: "null",
        rounding: "1 decimal",
    },
    pipelines: LEADS_PIPELINES,
} as const;

export const WT_DEFINITIONS = {
    leads_gerados: {
        table: "deals",
        date_col: "created_at",
        filters: ["pipeline IN TRIPS_PIPELINES"],
    },
    qualificados: {
        table: "deals",
        date_col: "created_at",
        filters: ["pipeline = 'SDR - Trips'"],
        approximation: true,
        caveat: "qualificados_wt is approximated by deal.created_at within period; deals migrated to 'SDR - Trips' from other pipelines after creation are not detected.",
    },
    vendas: {
        table: "deals",
        date_col: "sdr_wt_data_fechamento_taxa",
        filters: [
            "pipeline IN TRIPS_PIPELINES",
            "(pagamento_de_taxa NOT NULL AND pagamento_de_taxa != '') OR (pagou_a_taxa NOT NULL AND pagou_a_taxa != '')",
        ],
    },
    pipelines: TRIPS_PIPELINES,
} as const;

function sha256Hex(input: unknown): string {
    return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

export const WW_HASH = sha256Hex(WW_DEFINITIONS);
export const WT_HASH = sha256Hex(WT_DEFINITIONS);

export function kpiHashFor(brand: Brand): string {
    return brand === "ww" ? WW_HASH : WT_HASH;
}

export function kpiCaveatsFor(brand: Brand): string[] {
    if (brand === "wt") {
        return [WT_DEFINITIONS.qualificados.caveat];
    }
    return [];
}
