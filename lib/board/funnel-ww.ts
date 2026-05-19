// Board endpoint — Welcome Weddings (WW) pure funnel calculator
// See: docs/board-api-briefing.md (v1.3) section 4.1
//
// All inputs are pre-fetched BoardDeal[] (already brand-filtered if desired).
// Output is the FunnelWW shape — no I/O, no global state.
//
// **Refatorado 2026-05-07** para alinhar com convenção canônica do dashboard
// (lib/funnel-utils.ts). Antes filtrava todas as etapas por LEADS_PIPELINES
// (5 pipelines sem Elopment, sem pós-venda) — subestimava contratos em ~67%
// historicamente e divergia da aba Funil do Mês para Lead/MQL.
// Ver memória `project_ww_contract_definition.md`.

import { LEADS_PIPELINES, WW_MQL_PIPELINES, WW_POST_SALES_PIPELINES, WW_CONTRACT_PIPELINES, REUNIAO_EXCLUDE } from "./constants";
import type { BoardDeal, FunnelWW, NullFunnelWW, RollingWW, UtcRange } from "./types";

// ─── Filter primitives (pure) ───────────────────────────────────────────────

/** True se o deal tem sinal de ter passado pelo funil (data_qualificado OR data_closer). */
function hasFunnelSignal(d: BoardDeal): boolean {
    return (d.data_qualificado !== null && d.data_qualificado !== "") ||
        (d.data_closer !== null && d.data_closer !== "");
}

/**
 * Lead WW: 6 pipelines de aquisição (inclui Elopment) + pós-venda WW com
 * sinal de funil. Não exclui mais títulos com prefixo `EW` (decisão
 * Marketing 06/05/2026 — leads bonafide podem usar esse prefixo).
 */
function isWwLead(d: BoardDeal): boolean {
    if (!d.pipeline) return false;
    if (LEADS_PIPELINES.includes(d.pipeline)) return true;
    return WW_POST_SALES_PIPELINES.includes(d.pipeline) && hasFunnelSignal(d);
}

/**
 * MQL WW: 3 pipelines do funil de venda principal + pós-venda WW com sinal
 * de funil. Sempre exclui Elopment (linha de produto separada). Usado para
 * Qualif SDR e Reunião Closer.
 */
function isWwMql(d: BoardDeal): boolean {
    if (d.is_elopement === true) return false;
    if (!d.pipeline) return false;
    if (WW_MQL_PIPELINES.includes(d.pipeline)) return true;
    return WW_POST_SALES_PIPELINES.includes(d.pipeline) && hasFunnelSignal(d);
}

/**
 * Contrato WW fechado — regra canônica (3 sinais cumulativos):
 *   1. data_fechamento preenchida
 *   2. pipeline ∈ WW_CONTRACT_PIPELINES (11: aquisição + pós-venda)
 *   3. sinal de funil (data_qualificado OR data_closer)
 *
 * Antes o filtro era apenas `pipeline ∈ LEADS_PIPELINES (5 sem Elopment)` —
 * perdia deals que migraram para pós-venda após fechar. Subestimação ~67%
 * historicamente. Espelha lib/funnel-utils.ts:isClosedWwContract no dashboard.
 */
function isWwClosedContract(d: BoardDeal): boolean {
    if (!d.data_fechamento) return false;
    if (!d.pipeline || !WW_CONTRACT_PIPELINES.includes(d.pipeline)) return false;
    return hasFunnelSignal(d);
}

function inRange(iso: string | null, range: UtcRange): boolean {
    if (!iso) return false;
    const t = Date.parse(iso);
    if (Number.isNaN(t)) return false;
    return t >= range.startUtc.getTime() && t <= range.endUtc.getTime();
}

// Reunião com Closer é "realizada" se houver SINAL preenchido em pelo menos
// um dos dois campos vivos do AC, e o sinal não for "Não teve reunião".
// Ver types.ts (BoardDeal) para a justificativa do uso de duas colunas.
function reuniaoCounts(d: BoardDeal): boolean {
    const candidates: Array<string | null> = [
        d.ww_como_foi_feita_reuni_o_closer,
        d.tipo_da_reuni_o_com_a_closer,
    ];
    for (const raw of candidates) {
        if (raw === null) continue;
        const trimmed = raw.trim();
        if (trimmed === "") continue;
        if ((REUNIAO_EXCLUDE as readonly string[]).includes(trimmed)) continue;
        return true;
    }
    return false;
}

// ─── Main computation ───────────────────────────────────────────────────────
export interface ComputeWwInput {
    deals: BoardDeal[];
    range: UtcRange;
    isComplete: boolean;
}

export function computeFunnelWw(input: ComputeWwInput): FunnelWW {
    const { deals, range, isComplete } = input;

    let leads_gerados = 0;
    let qualificados_sdr = 0;
    let reunioes_closer = 0;
    let contratos_vol = 0;

    for (const d of deals) {
        // Cada KPI usa o filtro próprio (Lead = 6 + pós-venda, MQL = 3 + pós-venda,
        // Contrato = 11 + sinal de funil). Não há mais base único — ver helpers
        // isWwLead / isWwMql / isWwClosedContract acima.

        if (isWwLead(d) && inRange(d.created_at, range)) leads_gerados++;

        if (isWwMql(d)) {
            if (inRange(d.data_qualificado, range)) qualificados_sdr++;
            if (inRange(d.data_closer, range) && reuniaoCounts(d)) reunioes_closer++;
        }

        if (isWwClosedContract(d) && inRange(d.data_fechamento, range)) contratos_vol++;
    }

    const conversao =
        qualificados_sdr === 0 ? null : Math.round((reunioes_closer / qualificados_sdr) * 1000) / 10;

    return {
        leads_gerados,
        qualificados_sdr,
        reunioes_closer,
        contratos_vol,
        conversao_sdr_closer_pct: conversao,
        is_complete: isComplete,
    };
}

// Subset for rolling_30d (briefing 3.4).
export function computeRollingWw(input: ComputeWwInput): RollingWW {
    const full = computeFunnelWw(input);
    return {
        contratos_vol: full.contratos_vol,
        qualificados_sdr: full.qualificados_sdr,
        is_complete: full.is_complete,
    };
}

// Average 4 weekly FunnelWW into a single FunnelWW.
// Excludes weeks where data was unavailable (passed in as `null` entries).
// If all 4 are excluded, returns NullFunnelWW.
export function averageWwWeeks(weeks: Array<FunnelWW | null>): FunnelWW | NullFunnelWW {
    const valid = weeks.filter((w): w is FunnelWW => w !== null);
    if (valid.length === 0) {
        return {
            leads_gerados: null,
            qualificados_sdr: null,
            reunioes_closer: null,
            contratos_vol: null,
            conversao_sdr_closer_pct: null,
            is_complete: true,
        };
    }

    const sum = valid.reduce(
        (acc, w) => ({
            leads_gerados: acc.leads_gerados + w.leads_gerados,
            qualificados_sdr: acc.qualificados_sdr + w.qualificados_sdr,
            reunioes_closer: acc.reunioes_closer + w.reunioes_closer,
            contratos_vol: acc.contratos_vol + w.contratos_vol,
        }),
        { leads_gerados: 0, qualificados_sdr: 0, reunioes_closer: 0, contratos_vol: 0 }
    );

    const n = valid.length;
    const avg = (x: number) => Math.round(x / n);
    const avgLeads = avg(sum.leads_gerados);
    const avgQual = avg(sum.qualificados_sdr);
    const avgReu = avg(sum.reunioes_closer);
    const avgCont = avg(sum.contratos_vol);

    const conversao =
        avgQual === 0 ? null : Math.round((avgReu / avgQual) * 1000) / 10;

    return {
        leads_gerados: avgLeads,
        qualificados_sdr: avgQual,
        reunioes_closer: avgReu,
        contratos_vol: avgCont,
        conversao_sdr_closer_pct: conversao,
        is_complete: true,
    };
}

export const __testing = { isWwLead, isWwMql, isWwClosedContract, hasFunnelSignal, inRange, reuniaoCounts };
