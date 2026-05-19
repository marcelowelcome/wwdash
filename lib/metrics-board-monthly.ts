// Board mensal — KPIs por mês para visão executiva longitudinal.
//
// Espelha o "Board Executivo" semanal (lib/board/*) mas em granularidade
// mensal: cada coluna = um mês fechado (ou o mês corrente parcial), cada
// linha = um KPI. Mês corrente usa **meta prorrateada** (target × dias
// decorridos / dias no mês) para comparação justa (alvo = 100%).
//
// Motor puro — sem I/O. Caller (Dashboard) fetcha deals (6 grupos WW +
// buffer 90d), targets mensais e spend agregado por mês.

import { brtCalendarDayToUtc } from "./board/period";
import type { UtcRange } from "./board/types";
import { isWwLeadHistoric, isWwMqlHistoric, isClosedWwContract } from "./funnel-utils";
import { realizouCloser } from "./closer-utils";
import type { WonDeal, MonthlyTarget } from "./schemas";

export type BoardMonthlyMode = "evento" | "coorte";

// ─── Tipos ──────────────────────────────────────────────────────────────────

export interface BoardMonth {
    /** "YYYY-MM" */
    key: string;
    /** "Mai/26" para a UI */
    label: string;
    /** Verdadeiro para o mês corrente (parcial). */
    isCurrent: boolean;
    /** Dias no mês (28-31). */
    daysInMonth: number;
    /** Dias do mês já decorridos até `now` (= daysInMonth para meses passados). */
    daysElapsed: number;
}

export interface BoardCell {
    /** Valor realizado no mês (null se dado indisponível, ex. spend faltando). */
    realized: number | null;
    /** Meta efetiva (prorrateada para mês corrente, completa para passados). null = sem meta cadastrada. */
    target: number | null;
    /** % de atingimento (realized / target × 100). null se target ausente ou zero. */
    pctAttainment: number | null;
    /** Verdadeiro para o mês corrente — UI pode marcar com badge. */
    isCurrent: boolean;
    /** Fator de prorrateio aplicado (1 para meses passados, <1 para mês corrente). */
    proratedFactor: number;
    /** Spend parcial (gap em ads_daily_cache) — afeta KPIs derivados de spend. */
    spendPartial?: boolean;
}

export type KpiFormat = "currency" | "number" | "percent";
export type KpiInversion = "higher-is-better" | "lower-is-better";

export type BoardKpiKey =
    | "invest"
    | "leads"
    | "mql"
    | "qualif_sdr"
    | "reun_closer"
    | "contratos"
    | "cac"
    | "conv_lead_mql"
    | "conv_sdr_closer"
    | "close_rate"
    | "win_rate";

export interface BoardKpiRow {
    /** ID interno (estável). */
    key: BoardKpiKey;
    /** Label exibido. */
    label: string;
    /** Como formatar `realized` e `target` na célula. */
    format: KpiFormat;
    /** "higher-is-better" — pct >= 100 é bom. "lower-is-better" — pct <= 100 é bom (CAC, CPL). */
    inversion: KpiInversion;
    /** Tooltip com definição precisa do KPI. */
    definition: string;
    /** Uma célula por mês, na mesma ordem de `months`. */
    cells: BoardCell[];
}

export interface BoardMonthlyData {
    months: BoardMonth[];
    rows: BoardKpiRow[];
    /** Lista de "YYYY-MM" sem target cadastrado (UI mostra banner). */
    monthsWithoutTargets: string[];
    /** Lista de "YYYY-MM" com spend parcial. */
    monthsWithPartialSpend: string[];
    /** Modo usado neste cômputo (refletido na UI). */
    mode: BoardMonthlyMode;
}

export interface ComputeBoardMonthlyInput {
    /** Deals dos 6 grupos WW + buffer 90d (para garantir que deals com eventos no período entrem). */
    deals: WonDeal[];
    /** Lista de meses a exibir, mais antigo → mais recente. O último deve ser `isCurrent=true` se incluir o mês corrente. */
    months: Array<{ year: number; month: number; isCurrent: boolean }>;
    /** Mapa de "YYYY-MM" → MonthlyTarget. Meses sem target ficam fora do mapa. */
    targetsByMonth: Map<string, MonthlyTarget | null>;
    /** Mapa de "YYYY-MM" → spend agregado (meta + google) + flag `partial`. */
    spendByMonth: Map<string, { meta: number; google: number; partial: boolean }>;
    /**
     * "evento" (default): cada etapa conta pelo timestamp do evento próprio.
     *   Ex: Qualif Mar/26 = data_qualificado em Mar (mesmo se MQL foi criado em Jan).
     *   Taxas entre etapas NÃO são taxas verdadeiras (denom e num são universos diferentes).
     *
     * "coorte": ancora pelo `created_at`. Coorte Mar/26 = leads criados em Mar.
     *   Cada etapa conta quantos da coorte JÁ alcançaram (em qualquer momento).
     *   Taxas são taxas reais de conversão (subset). Coortes recentes têm dados imaturos.
     */
    mode?: BoardMonthlyMode;
    /** Injeta `Date.now()` em testes. */
    now?: Date;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const MONTH_LABELS_PT = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

function monthKey(year: number, month: number): string {
    return `${year}-${String(month).padStart(2, "0")}`;
}

function monthLabel(year: number, month: number): string {
    return `${MONTH_LABELS_PT[month - 1]}/${String(year).slice(-2)}`;
}

function daysInMonthOf(year: number, month: number): number {
    return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function daysElapsedInMonth(year: number, month: number, now: Date): number {
    const todayY = now.getUTCFullYear();
    const todayM = now.getUTCMonth() + 1;
    if (year < todayY || (year === todayY && month < todayM)) {
        return daysInMonthOf(year, month);
    }
    if (year > todayY || (year === todayY && month > todayM)) return 0;
    // Mesmo mês — dias decorridos = dia atual (1..31)
    return now.getUTCDate();
}

function monthRangeUtc(year: number, month: number): UtcRange {
    const days = daysInMonthOf(year, month);
    const startBrt = `${year}-${String(month).padStart(2, "0")}-01`;
    const endBrt = `${year}-${String(month).padStart(2, "0")}-${String(days).padStart(2, "0")}`;
    return {
        startUtc: brtCalendarDayToUtc(startBrt, "start"),
        endUtc: brtCalendarDayToUtc(endBrt, "end"),
    };
}

function attainment(realized: number | null, target: number | null): number | null {
    if (realized == null || target == null || target === 0) return null;
    return (realized / target) * 100;
}

function dateInUtcRange(value: string | null | undefined, range: UtcRange): boolean {
    if (!value) return false;
    const t = Date.parse(value);
    if (Number.isNaN(t)) return false;
    return t >= range.startUtc.getTime() && t <= range.endUtc.getTime();
}

interface MonthFunnel {
    /** Lead bruto: 6 pipelines WW incluindo Elopment (isInWwLeadsPipeline). */
    leads: number;
    /** MQL: subset de Lead em pipelines de funil (isInWwMqlPipeline = 3 pipelines). */
    mql: number;
    qualificados_sdr: number;
    reunioes_closer: number;
    contratos_vol: number;
}

/**
 * Conta etapas do funil para o mês.
 *
 * - **Modo "evento"**: cada etapa filtra pelo timestamp do evento (created_at,
 *   data_qualificado, data_closer, data_fechamento) dentro do range. Etapas
 *   podem contar deals de coortes diferentes — taxas entre etapas NÃO são
 *   taxas reais de conversão.
 *
 * - **Modo "coorte"**: filtra pela coorte (created_at no range). Cada etapa
 *   conta os deals da coorte que JÁ alcançaram aquele estágio (em qualquer
 *   momento, mesmo após o end do range). Taxas entre etapas são reais.
 *
 * Convenção (alinha com Funil do Mês):
 *   - Lead = isInWwLeadsPipeline (6 pipelines incl. Elopment)
 *   - MQL/Qualif/Reun/Contratos = isInWwMqlPipeline (3 pipelines)
 *
 * Divergência conhecida: o motor `computeFunnelWw` do board endpoint usa 5
 * pipelines (sem Elopment, sem MQL real). Itens de sprint dedicados.
 */
function countMonthFunnel(deals: WonDeal[], range: UtcRange, mode: BoardMonthlyMode): MonthFunnel {
    let leads = 0;
    let mql = 0;
    let qualif = 0;
    let reun = 0;
    let contratos = 0;

    // Convenções (ver funnel-utils.ts):
    //   - Lead: isWwLeadHistoric — 6 pipelines aquisição + pós-venda WW com
    //     sinal de funil. Captura deals que migraram para pós-venda após fechar.
    //   - MQL/Qualif/Reun: isWwMqlHistoric — 3 MQL pipelines + pós-venda WW
    //     com sinal de funil. Sem Elopment.
    //   - Contratos: isClosedWwContract (regra canônica — pipeline whitelist
    //     + data_fechamento + sinal de funil).
    if (mode === "evento") {
        for (const d of deals) {
            const createdAt = d.created_at ?? d.cdate ?? null;
            const inCreated = dateInUtcRange(createdAt, range);

            if (inCreated && isWwLeadHistoric(d)) leads++;

            if (isWwMqlHistoric(d)) {
                if (inCreated) mql++;
                if (dateInUtcRange(d.data_qualificado, range)) qualif++;
                if (dateInUtcRange(d.data_horario_agendamento_closer, range) && realizouCloser(d)) reun++;
            }

            if (isClosedWwContract(d) && dateInUtcRange(d.data_fechamento, range)) contratos++;
        }
    } else {
        // Modo Coorte: ancorada por `created_at` no range; cada etapa conta os
        // deals da coorte que JÁ alcançaram aquele estágio (em qualquer momento).
        for (const d of deals) {
            const createdAt = d.created_at ?? d.cdate ?? null;
            if (!dateInUtcRange(createdAt, range)) continue;

            if (isWwLeadHistoric(d)) leads++;
            if (!isWwMqlHistoric(d)) continue;

            mql++;
            if (d.data_qualificado) qualif++;
            if (d.data_horario_agendamento_closer && realizouCloser(d)) reun++;
            if (isClosedWwContract(d)) contratos++;
        }
    }

    return { leads, mql, qualificados_sdr: qualif, reunioes_closer: reun, contratos_vol: contratos };
}

// ─── Main ───────────────────────────────────────────────────────────────────

export function computeBoardMonthly(input: ComputeBoardMonthlyInput): BoardMonthlyData {
    const now = input.now ?? new Date();
    const mode: BoardMonthlyMode = input.mode ?? "evento";

    // 1. Construir lista de meses com metadados
    const months: BoardMonth[] = input.months.map((m) => ({
        key: monthKey(m.year, m.month),
        label: monthLabel(m.year, m.month),
        isCurrent: m.isCurrent,
        daysInMonth: daysInMonthOf(m.year, m.month),
        daysElapsed: daysElapsedInMonth(m.year, m.month, now),
    }));

    // 2. Computar funnel + spend por mês usando a convenção do dashboard
    // (3 pipelines: SDR + Closer + Planejamento). Alinhado com Funil do Mês.
    const perMonth = input.months.map((m, idx) => {
        const range = monthRangeUtc(m.year, m.month);
        const funnel = countMonthFunnel(input.deals, range, mode);
        const monthMeta = months[idx];
        const spend = input.spendByMonth.get(monthMeta.key) ?? { meta: 0, google: 0, partial: false };
        const target = input.targetsByMonth.get(monthMeta.key) ?? null;
        const proratedFactor = monthMeta.isCurrent
            ? Math.min(1, monthMeta.daysElapsed / monthMeta.daysInMonth)
            : 1;
        return { month: monthMeta, funnel, spend, target, proratedFactor };
    });

    // 4. Helpers para construir células
    function makeCell(realized: number | null, monthlyTarget: number | null, monthIdx: number): BoardCell {
        const m = perMonth[monthIdx];
        const effectiveTarget = monthlyTarget != null ? monthlyTarget * m.proratedFactor : null;
        return {
            realized,
            target: effectiveTarget,
            pctAttainment: attainment(realized, effectiveTarget),
            isCurrent: m.month.isCurrent,
            proratedFactor: m.proratedFactor,
            spendPartial: m.spend.partial,
        };
    }

    // Para KPIs derivados (CAC, Conversão) onde o atingimento usa fórmula
    // diferente — não escalonar pelo proratedFactor (já é uma taxa).
    function makeRateCell(realized: number | null, target: number | null, monthIdx: number): BoardCell {
        const m = perMonth[monthIdx];
        return {
            realized,
            target,
            pctAttainment: attainment(realized, target),
            isCurrent: m.month.isCurrent,
            proratedFactor: m.proratedFactor,
            spendPartial: m.spend.partial,
        };
    }

    // Helpers para taxas (sem prorrateio).
    const ratePct = (num: number, den: number): number | null =>
        den > 0 ? (num / den) * 100 : null;
    const safeDiv = (a: number | null | undefined, b: number | null | undefined): number | null =>
        a != null && b != null && b !== 0 ? (a / b) * 100 : null;

    // Definições de etapa por modo, para compor tooltips precisos.
    const modeNote = mode === "coorte"
        ? "Modo Coorte: contagem das coortes do mês (created_at ∈ mês) que JÁ alcançaram esta etapa."
        : "Modo Evento: contagem pelo timestamp do evento próprio dentro do mês.";

    // 5. Construir rows
    const rows: BoardKpiRow[] = [
        {
            key: "invest",
            label: "Investimento em mídia paga",
            format: "currency",
            inversion: "higher-is-better",
            definition:
                "Soma do gasto em Meta Ads + Google Ads agregado de ads_daily_cache (pipeline=wedding). Meta derivada: cpl × mql do monthly_targets. Mês corrente prorrateia meta. Não muda entre modos (spend é sempre do mês do evento).",
            cells: perMonth.map((m, idx) => {
                const spend = m.spend.meta + m.spend.google;
                const target = m.target?.cpl != null && m.target?.mql != null
                    ? m.target.cpl * m.target.mql
                    : null;
                return makeCell(spend, target, idx);
            }),
        },
        {
            key: "leads",
            label: "Leads",
            format: "number",
            inversion: "higher-is-better",
            definition:
                `Entrada bruta. Deals em qualquer pipeline WW (5 + Elopment = isInWwLeadsPipeline). ${modeNote}`,
            cells: perMonth.map((m, idx) => makeCell(m.funnel.leads, m.target?.leads ?? null, idx)),
        },
        {
            key: "mql",
            label: "MQL gerados",
            format: "number",
            inversion: "higher-is-better",
            definition:
                `Lead que entrou no funil de venda principal: pipeline ∈ {SDR Weddings, Closer Weddings, Planejamento Weddings} = isInWwMqlPipeline. Exclui Elopment. ${modeNote} Alinhado com aba Funil do Mês.`,
            cells: perMonth.map((m, idx) => makeCell(m.funnel.mql, m.target?.mql ?? null, idx)),
        },
        {
            key: "qualif_sdr",
            label: "Leads qualificados pelo SDR",
            format: "number",
            inversion: "higher-is-better",
            definition:
                `MQL com data_qualificado preenchido. ${modeNote} Sinal de que o SDR aprovou o lead para o Closer.`,
            cells: perMonth.map((m, idx) => makeCell(m.funnel.qualificados_sdr, m.target?.qualificado ?? null, idx)),
        },
        {
            key: "reun_closer",
            label: "Reuniões realizadas com Closer",
            format: "number",
            inversion: "higher-is-better",
            definition:
                `MQL com data_closer preenchida + sinal de realização (ww_como_foi_feita_reuni_o_closer ou tipo_da_reuni_o_com_a_closer não-vazio e ≠ 'Não teve reunião'). ${modeNote}`,
            cells: perMonth.map((m, idx) => makeCell(m.funnel.reunioes_closer, m.target?.closer_realizada ?? null, idx)),
        },
        {
            key: "contratos",
            label: "Contratos assinados",
            format: "number",
            inversion: "higher-is-better",
            definition:
                `MQL com data_fechamento preenchida — fonte de verdade de ganho. ${modeNote}`,
            cells: perMonth.map((m, idx) => makeCell(m.funnel.contratos_vol, m.target?.vendas ?? null, idx)),
        },
        {
            key: "cac",
            label: "Custo por Contrato",
            format: "currency",
            inversion: "lower-is-better",
            definition:
                "Investimento em mídia / Contratos assinados no mês. Meta derivada: (cpl × mql) / vendas. Pct ≤ 100 é bom (CAC abaixo da meta). Sem prorrateio — é uma taxa.",
            cells: perMonth.map((m, idx) => {
                const spend = m.spend.meta + m.spend.google;
                const contratos = m.funnel.contratos_vol;
                const cac = contratos > 0 ? spend / contratos : null;
                const targetCac =
                    m.target?.cpl != null && m.target?.mql != null && m.target?.vendas != null && m.target.vendas > 0
                        ? (m.target.cpl * m.target.mql) / m.target.vendas
                        : null;
                return makeRateCell(cac, targetCac, idx);
            }),
        },
        {
            key: "conv_lead_mql",
            label: "Conv. Lead → MQL",
            format: "percent",
            inversion: "higher-is-better",
            definition:
                "MQL / Leads × 100. Qualidade do filtro de pré-qualificação (quanto da entrada bruta passa pro funil de venda). Em modo Coorte é taxa real; em modo Evento é informativa (denominadores podem ser de coortes diferentes).",
            cells: perMonth.map((m, idx) => {
                const conv = ratePct(m.funnel.mql, m.funnel.leads);
                const targetConv = m.target?.mql != null && m.target?.leads != null
                    ? ratePct(m.target.mql, m.target.leads)
                    : null;
                return makeRateCell(conv, targetConv, idx);
            }),
        },
        {
            key: "conv_sdr_closer",
            label: "Conv. SDR → Closer",
            format: "percent",
            inversion: "higher-is-better",
            definition:
                "Contratos assinados / Leads qualificados pelo SDR × 100. Sinaliza qualidade da qualificação do SDR (do que ele aprovou, quanto fechou). Meta derivada: vendas / qualificado × 100. Sem prorrateio.",
            cells: perMonth.map((m, idx) => {
                const conv = ratePct(m.funnel.contratos_vol, m.funnel.qualificados_sdr);
                const targetConv = m.target?.vendas != null && m.target?.qualificado != null
                    ? ratePct(m.target.vendas, m.target.qualificado)
                    : null;
                return makeRateCell(conv, targetConv, idx);
            }),
        },
        {
            key: "close_rate",
            label: "Close Rate",
            format: "percent",
            inversion: "higher-is-better",
            definition:
                "Contratos / Reuniões realizadas × 100. Eficiência do Closer dentro da reunião — independente de volume de input. Meta derivada: vendas / closer_realizada × 100.",
            cells: perMonth.map((m, idx) => {
                const conv = ratePct(m.funnel.contratos_vol, m.funnel.reunioes_closer);
                const targetConv = m.target?.vendas != null && m.target?.closer_realizada != null
                    ? ratePct(m.target.vendas, m.target.closer_realizada)
                    : null;
                return makeRateCell(conv, targetConv, idx);
            }),
        },
        {
            key: "win_rate",
            label: "Win Rate (MQL → Contrato)",
            format: "percent",
            inversion: "higher-is-better",
            definition:
                "Contratos / MQL × 100. Conversão ponta a ponta do funil de venda. Em modo Coorte é a leitura mais honesta de saúde do funil; em modo Evento mistura coortes. Meta derivada: vendas / mql × 100.",
            cells: perMonth.map((m, idx) => {
                const conv = ratePct(m.funnel.contratos_vol, m.funnel.mql);
                const targetConv = m.target?.vendas != null && m.target?.mql != null
                    ? ratePct(m.target.vendas, m.target.mql)
                    : null;
                return makeRateCell(conv, targetConv, idx);
            }),
        },
    ];

    // Silence unused warning (safeDiv reservado pra debug futuro).
    void safeDiv;

    const monthsWithoutTargets = months
        .filter((m) => input.targetsByMonth.get(m.key) == null)
        .map((m) => m.key);

    const monthsWithPartialSpend = months
        .filter((m) => input.spendByMonth.get(m.key)?.partial === true)
        .map((m) => m.key);

    return { months, rows, monthsWithoutTargets, monthsWithPartialSpend, mode };
}

// ─── Helpers públicos para o Dashboard montar a lista de meses ──────────────

/**
 * Gera N meses passados + mês corrente. Default: 6 + atual = 7 colunas.
 * Para `now = 2026-05-06` retorna [Nov/25, Dez/25, Jan/26, Fev/26, Mar/26, Abr/26, Mai/26(current)].
 */
export function lastNMonthsPlusCurrent(
    n: number,
    now: Date = new Date(),
): Array<{ year: number; month: number; isCurrent: boolean }> {
    const result: Array<{ year: number; month: number; isCurrent: boolean }> = [];
    const currentY = now.getUTCFullYear();
    const currentM = now.getUTCMonth() + 1;
    for (let i = n; i >= 0; i--) {
        const date = new Date(Date.UTC(currentY, currentM - 1 - i, 1));
        result.push({
            year: date.getUTCFullYear(),
            month: date.getUTCMonth() + 1,
            isCurrent: i === 0,
        });
    }
    return result;
}

/**
 * Gera Jan → mês corrente do ano atual. Para `now = 2026-05-06` retorna
 * 5 entradas: Jan/26 a Mai/26(current).
 */
export function currentYearToDate(
    now: Date = new Date(),
): Array<{ year: number; month: number; isCurrent: boolean }> {
    const year = now.getUTCFullYear();
    const currentM = now.getUTCMonth() + 1;
    const result = [];
    for (let m = 1; m <= currentM; m++) {
        result.push({ year, month: m, isCurrent: m === currentM });
    }
    return result;
}

export type BoardWindowPreset = "3m" | "6m" | "12m" | "ytd";

export function buildMonthsForPreset(
    preset: BoardWindowPreset,
    now: Date = new Date(),
): Array<{ year: number; month: number; isCurrent: boolean }> {
    switch (preset) {
        case "3m": return lastNMonthsPlusCurrent(3, now);
        case "6m": return lastNMonthsPlusCurrent(6, now);
        case "12m": return lastNMonthsPlusCurrent(12, now);
        case "ytd": return currentYearToDate(now);
    }
}

export const BOARD_WINDOW_LABELS: Record<BoardWindowPreset, string> = {
    "3m": "Últimos 3m + atual",
    "6m": "Últimos 6m + atual",
    "12m": "Últimos 12m + atual",
    "ytd": "Ano corrente",
};
