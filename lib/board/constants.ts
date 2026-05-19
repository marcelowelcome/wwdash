// Board endpoint — constants + KPI definition hashes
// See: docs/board-api-briefing.md (v1.2) section 4 + 4.6

import { createHash } from "node:crypto";
import type { Brand, PipelineType } from "./types";

// ─── Pipeline filters ────────────────────────────────────────────────────────
//
// **Alinhado com convenção canônica do dashboard** (lib/funnel-utils.ts):
//   - Lead (aquisição bruta) = 6 pipelines incluindo Elopment
//   - MQL (funil de venda) = 3 pipelines (SDR/Closer/Planejamento), sem Elopment
//   - Pós-venda WW = 5 pipelines (deal migra após data_fechamento)
//   - Contrato = qualquer pipeline aquisição OU pós-venda + sinal de funil
//
// Mudança 2026-05-07 (briefing v1.3): antes LEADS_PIPELINES tinha 5 sem
// Elopment, contratos só contavam em MQL. Resultado: subestimação de ~67%
// historicamente. Ver memória `project_ww_contract_definition.md`.

export const LEADS_PIPELINES: readonly string[] = [
    "SDR Weddings",
    "Closer Weddings",
    "Planejamento Weddings",
    "WW - Internacional",
    "Outros Desqualificados | Wedding",
    "Elopment Wedding",
] as const;

/** 3 pipelines do funil de venda principal — exclui Elopment, Internacional, Desqualificados. */
export const WW_MQL_PIPELINES: readonly string[] = [
    "SDR Weddings",
    "Closer Weddings",
    "Planejamento Weddings",
] as const;

/** 5 pipelines de pós-venda WW — deals migram após fechar contrato. */
export const WW_POST_SALES_PIPELINES: readonly string[] = [
    "Convidados",
    "Convidados - Michelly",
    "WW - Gestão Casamento",
    "WW - Gestão Convidados",
    "Produção",
] as const;

/** 11 pipelines onde contratos WW podem residir hoje (aquisição + pós-venda). */
export const WW_CONTRACT_PIPELINES: readonly string[] = [
    ...LEADS_PIPELINES,
    ...WW_POST_SALES_PIPELINES,
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
        // Lead = entrada bruta (inclui Elopment). Prefixo EW no título não exclui
        // (decisão Marketing 06/05/2026). Pós-venda inclui apenas com sinal de funil.
        filters: [
            "pipeline IN (LEADS_PIPELINES ∪ WW_POST_SALES_PIPELINES)",
            "if pipeline IN WW_POST_SALES_PIPELINES: data_qualificado IS NOT NULL OR data_closer IS NOT NULL",
        ],
    },
    qualificados_sdr: {
        table: "deals",
        date_col: "data_qualificado",
        // MQL exclui Elopment + Internacional + Desqualificados. Pós-venda
        // inclui com sinal de funil (deals que passaram pelo SDR e fecharam).
        filters: [
            "is_elopement=false",
            "pipeline IN (WW_MQL_PIPELINES ∪ WW_POST_SALES_PIPELINES)",
            "if pipeline IN WW_POST_SALES_PIPELINES: data_qualificado IS NOT NULL OR data_closer IS NOT NULL",
        ],
    },
    reunioes_closer: {
        table: "deals",
        date_col: "data_closer",
        // Detecção de "reunião realizada" usa os campos vivos do AC, não a
        // coluna legada `reuniao_closer` (que não tem FIELD_MAP entry).
        filters: [
            "is_elopement=false",
            "pipeline IN (WW_MQL_PIPELINES ∪ WW_POST_SALES_PIPELINES)",
            "if pipeline IN WW_POST_SALES_PIPELINES: data_qualificado IS NOT NULL OR data_closer IS NOT NULL",
            "(ww_como_foi_feita_reuni_o_closer IS NOT NULL AND TRIM(ww_como_foi_feita_reuni_o_closer) NOT IN ('', 'Não teve reunião'))",
            "OR (tipo_da_reuni_o_com_a_closer IS NOT NULL AND TRIM(tipo_da_reuni_o_com_a_closer) NOT IN ('', 'Não teve reunião'))",
        ],
    },
    contratos_vol: {
        table: "deals",
        date_col: "data_fechamento",
        // Regra canônica isClosedWwContract — 3 sinais cumulativos. Antes contava
        // apenas LEADS_PIPELINES (5 sem Elopment, sem pós-venda) → subestimava ~67%.
        // Validado 19 meses Supabase: mai/2025 tinha 13 contratos fechados
        // (12 WW + 1 Trips), endpoint mostrava 4. Ver project_ww_contract_definition.
        filters: [
            "data_fechamento IS NOT NULL",
            "pipeline IN WW_CONTRACT_PIPELINES (6 aquisição + 5 pós-venda)",
            "data_qualificado IS NOT NULL OR data_closer IS NOT NULL (sinal de funil)",
        ],
    },
    conversao_sdr_closer_pct: {
        derived: "reunioes_closer / qualificados_sdr * 100",
        on_zero: "null",
        rounding: "1 decimal",
    },
    pipelines: WW_CONTRACT_PIPELINES,
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
