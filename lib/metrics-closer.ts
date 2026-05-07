/**
 * Closer Funnel Metrics — motor v1 da aba Closer redesenhada (v2.9.0).
 *
 * Continuação do motor SDR (`lib/metrics-sdr.ts`). Onde o SDR vai de Lead até
 * Agendamento Closer, este motor cobre o último trecho da jornada:
 *
 *     Reunião Agendada → Reunião Realizada → Contrato Fechado
 *
 * **Definições canônicas das etapas (modo Evento, default):**
 *
 * | Etapa             | Filtro base                | Coluna de data       |
 * |-------------------|----------------------------|----------------------|
 * | Reunião Agendada  | MQL + data_closer ≠ null   | data_horario_agendamento_closer |
 * | Reunião Realizada | Agendada + realizouCloser  | (mesma)              |
 * | Contrato Fechado  | MQL + data_fechamento ≠ null | data_fechamento     |
 *
 * Modo Coorte: filtra deals criados no período e conta quantos **já alcançaram**
 * cada etapa em qualquer momento (mesmo após o `end` do range).
 *
 * **Cohort de Fechamento** (substitui o cohort 14-28d/29-45d legacy):
 * Para coorte = leads criados no período, classifica em 3 baldes:
 *   ✓ Fechou: data_fechamento ≠ null
 *   ✗ Perdeu: status === "2" (Lost) AND data_fechamento == null
 *   … Em aberto: o resto (continua no funil)
 *
 * Para preset "Este mês", inclui `previousCohortPctFechouSameDay` —
 * % da coorte do mês anterior fechado até o mesmo dia-do-mês — como leitura
 * de velocidade de fechamento da coorte atual vs anterior.
 *
 * **CAC** = (spend Meta + Google) / Contratos Fechados. **CPL** = spend / Leads
 * (mesmo cálculo do SDR — apresentado aqui pra dar contexto de eficiência do
 * funil completo).
 *
 * Decisões alinhadas com a sessão SDR (06/05/2026):
 * - Lead inclui Elopment (`isInWwLeadsPipeline`); MQL exclui (`isInWwMqlPipeline`).
 *   Ver memory/project_sdr_funnel_definition.md.
 * - Modo calendário ("Este mês" estende até endOfMonth) é decidido no caller
 *   via `resolvePeriodForSdr` — este motor só recebe o `period` final.
 * - Comparação vs período anterior é calculada (`previous`) mas não exibida;
 *   pipeline é vivo, comparação não é justa.
 */

import type { Deal, MonthlyTarget, WonDeal } from "./schemas";
import { isInWwLeadsPipeline, isInWwMqlPipeline } from "./funnel-utils";
import { realizouCloser } from "./closer-utils";

// ─── TYPES ──────────────────────────────────────────────────────────────────

export type CloserMode = "coorte" | "evento";

export interface CloserFunnelStage {
    current: number;
    previous: number;
    target: number | null;
    deals: WonDeal[];
}

export interface CloserFunnelDetailed {
    agendada: CloserFunnelStage;
    realizada: CloserFunnelStage;
    contrato: CloserFunnelStage;
}

export interface CloserRates {
    /** realizada / agendada — taxa de comparecimento closer. */
    comparecimento: number | null;
    /** contrato / realizada — close rate. */
    closeRate: number | null;
    /** contrato / mql — conversão geral do funil de venda. */
    mqlToContract: number | null;
}

export interface CloserSpendBlock {
    meta: number;
    google: number;
    total: number;
    previousTotal: number | null;
}

export interface CloserCostBlock {
    /** Custo absoluto = spend / denominator. null se denominator=0 ou sem spend. */
    current: number | null;
    previous: number | null;
    /** Meta. CPL vem de monthly_targets.cpl; CAC não tem coluna → null. */
    target: number | null;
}

export interface CloserCohortBucket {
    count: number;
    pct: number;
    deals: WonDeal[];
}

export interface CloserCohort {
    /** Tamanho total da coorte (leads criados no período). */
    total: number;
    fechou: CloserCohortBucket;
    aberto: CloserCohortBucket;
    perdeu: CloserCohortBucket;
    /**
     * Para preset "Este mês": % da coorte do mês anterior que estava fechada
     * no mesmo dia-do-mês. Permite leitura de velocidade da coorte atual.
     * null para outros presets (ex: "Mês passado" já tem mês completo).
     */
    previousCohortPctFechouSameDay: number | null;
}

export interface CloserTempoFechamento {
    /** Média de dias entre `created_at` e `data_fechamento` dos contratos fechados no período. */
    dias: number | null;
    /** Quantidade de contratos usados na média (transparência para janelas curtas). */
    n: number;
}

export interface LossReason {
    motivo: string;
    n: number;
    pct: number;
}

export interface CloserMissingData {
    targetsMissing: string[];
    spendUnavailable: boolean;
    staleSync: boolean;
}

export interface CloserOptions {
    /** 'evento' (default) ou 'coorte'. */
    mode?: CloserMode;
    /** Linha de monthly_targets para o mês de end. null = sem meta. */
    targets?: MonthlyTarget | null;
    /** Spend agregado do período (Meta + Google). null = sem dado. */
    spend?: { meta: number; google: number } | null;
    previousSpend?: { meta: number; google: number } | null;
    /** Dias no mês do `end` (ex: 30 ou 31). Default 30. */
    daysInTargetMonth?: number;
    /**
     * Dias do período já decorridos (até hoje). Quando o range estende para o
     * futuro (modo calendário), prorrateio de meta usa este valor — não
     * `(end - start)` em dias — pra preservar leitura de ritmo.
     */
    daysElapsedInPeriod?: number;
    staleSync?: boolean;
    spendPartial?: boolean;
}

export interface CloserMetrics {
    mode: CloserMode;
    funnelDetailed: CloserFunnelDetailed;
    rates: CloserRates;
    spend: CloserSpendBlock | null;
    cac: CloserCostBlock | null;
    cpl: CloserCostBlock | null;
    /** Lead count usado como denominador do CPL (também útil para o caller). */
    leadCount: number;
    /** MQL count usado como denominador da conv geral (idem). */
    mqlCount: number;
    tempoFechamento: CloserTempoFechamento;
    cohortFechamento: CloserCohort;
    lossReasons: LossReason[];
    missingData: CloserMissingData;
}

// ─── HELPERS PURE ───────────────────────────────────────────────────────────

function dateInRange(value: string | null | undefined, start: Date, end: Date): boolean {
    if (!value) return false;
    const t = new Date(value).getTime();
    if (Number.isNaN(t)) return false;
    return t >= start.getTime() && t <= end.getTime();
}

function isInLeadScope(d: WonDeal): boolean {
    return isInWwLeadsPipeline(d);
}

function isInMqlScope(d: WonDeal): boolean {
    return isInWwMqlPipeline(d);
}

/** Agrega motivos de perda para os deals perdidos no período. Top N. */
export function aggregateLossReasons(
    lostDeals: WonDeal[],
    fieldMap: Record<string, string>,
    topN = 8,
): LossReason[] {
    const FL_ID = fieldMap["Motivo de Perda"] ?? "custom_field_loss";
    const counts: Record<string, number> = {};
    let total = 0;
    for (const d of lostDeals) {
        const motivo =
            (d as Deal)._cf?.[FL_ID]?.toString().trim() ||
            d.ww_closer_motivo_de_perda?.toString().trim() ||
            null;
        if (!motivo) continue;
        counts[motivo] = (counts[motivo] || 0) + 1;
        total++;
    }
    const sorted = Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, topN);
    return sorted.map(([motivo, n]) => ({
        motivo,
        n,
        pct: total > 0 ? Math.round((n / total) * 1000) / 10 : 0,
    }));
}

// ─── STAGE COUNTS ───────────────────────────────────────────────────────────

interface StageCounts {
    lead: { count: number; deals: WonDeal[] };
    mql: { count: number; deals: WonDeal[] };
    agendada: { count: number; deals: WonDeal[] };
    realizada: { count: number; deals: WonDeal[] };
    contrato: { count: number; deals: WonDeal[] };
}

function emptyStageCounts(): StageCounts {
    return {
        lead: { count: 0, deals: [] },
        mql: { count: 0, deals: [] },
        agendada: { count: 0, deals: [] },
        realizada: { count: 0, deals: [] },
        contrato: { count: 0, deals: [] },
    };
}

function computeStageCounts(
    deals: WonDeal[],
    range: { start: Date; end: Date },
    mode: CloserMode,
): StageCounts {
    const acc = emptyStageCounts();

    for (const d of deals) {
        if (!isInLeadScope(d)) continue;
        const createdAtIso = d.created_at ?? d.cdate ?? null;
        const inLeadByCreated = dateInRange(createdAtIso, range.start, range.end);

        // Lead/MQL — sempre por created_at no período (não diferem entre modos).
        if (inLeadByCreated) {
            acc.lead.count++;
            acc.lead.deals.push(d);
            if (isInMqlScope(d)) {
                acc.mql.count++;
                acc.mql.deals.push(d);
            }
        }

        // Etapas restritas ao escopo MQL.
        if (!isInMqlScope(d)) continue;

        if (mode === "evento") {
            // Agendada: data_closer no período.
            if (dateInRange(d.data_horario_agendamento_closer, range.start, range.end)) {
                acc.agendada.count++;
                acc.agendada.deals.push(d);
                if (realizouCloser(d)) {
                    acc.realizada.count++;
                    acc.realizada.deals.push(d);
                }
            }
            // Contrato: data_fechamento no período.
            if (dateInRange(d.data_fechamento, range.start, range.end)) {
                acc.contrato.count++;
                acc.contrato.deals.push(d);
            }
        } else {
            // Coorte: lead criado no período + alcançou etapa em qualquer momento.
            if (!inLeadByCreated) continue;
            if (d.data_horario_agendamento_closer) {
                acc.agendada.count++;
                acc.agendada.deals.push(d);
                if (realizouCloser(d)) {
                    acc.realizada.count++;
                    acc.realizada.deals.push(d);
                }
            }
            if (d.data_fechamento) {
                acc.contrato.count++;
                acc.contrato.deals.push(d);
            }
        }
    }

    return acc;
}

// ─── COHORT DE FECHAMENTO ──────────────────────────────────────────────────

function computeCohortFechamento(
    deals: WonDeal[],
    range: { start: Date; end: Date },
    options: CloserOptions,
    now: Date,
): CloserCohort {
    const inCohort: WonDeal[] = [];
    for (const d of deals) {
        if (!isInLeadScope(d)) continue;
        const createdAtIso = d.created_at ?? d.cdate ?? null;
        if (dateInRange(createdAtIso, range.start, range.end)) inCohort.push(d);
    }

    const fechou: WonDeal[] = [];
    const perdeu: WonDeal[] = [];
    const aberto: WonDeal[] = [];
    for (const d of inCohort) {
        if (d.data_fechamento) {
            fechou.push(d);
        } else if (d.status === "2") {
            perdeu.push(d);
        } else {
            aberto.push(d);
        }
    }

    const total = inCohort.length;
    const pct = (n: number) => (total > 0 ? Math.round((n / total) * 1000) / 10 : 0);

    // Comparação vs coorte do mês anterior, no mesmo dia-do-mês — apenas para
    // ranges que terminam após hoje (ou seja, "Este mês" no modo calendário).
    let previousCohortPctFechouSameDay: number | null = null;
    if (options.daysElapsedInPeriod != null && range.end.getTime() > now.getTime()) {
        const elapsed = options.daysElapsedInPeriod;
        const prevYear = range.start.getUTCFullYear();
        const prevMonth = range.start.getUTCMonth() - 1;
        const prevStart = new Date(Date.UTC(prevYear, prevMonth, 1, 0, 0, 0));
        // limite "mesmo dia-do-mês": início do mês anterior + (elapsed - 1) dias, fim do dia
        const prevSameDayCutoff = new Date(prevStart.getTime());
        prevSameDayCutoff.setUTCDate(prevSameDayCutoff.getUTCDate() + elapsed);
        prevSameDayCutoff.setUTCHours(0, 0, 0, 0);
        prevSameDayCutoff.setUTCMilliseconds(prevSameDayCutoff.getUTCMilliseconds() - 1);

        const prevEnd = new Date(Date.UTC(prevYear, prevMonth + 1, 0, 23, 59, 59));

        let prevTotal = 0;
        let prevFechouUntilSameDay = 0;
        for (const d of deals) {
            if (!isInLeadScope(d)) continue;
            const createdAtIso = d.created_at ?? d.cdate ?? null;
            if (!dateInRange(createdAtIso, prevStart, prevEnd)) continue;
            prevTotal++;
            if (d.data_fechamento) {
                const fechT = new Date(d.data_fechamento).getTime();
                if (!Number.isNaN(fechT) && fechT <= prevSameDayCutoff.getTime()) {
                    prevFechouUntilSameDay++;
                }
            }
        }
        if (prevTotal > 0) {
            previousCohortPctFechouSameDay = Math.round((prevFechouUntilSameDay / prevTotal) * 1000) / 10;
        }
    }

    return {
        total,
        fechou: { count: fechou.length, pct: pct(fechou.length), deals: fechou },
        aberto: { count: aberto.length, pct: pct(aberto.length), deals: aberto },
        perdeu: { count: perdeu.length, pct: pct(perdeu.length), deals: perdeu },
        previousCohortPctFechouSameDay,
    };
}

// ─── TEMPO ATÉ FECHAMENTO ──────────────────────────────────────────────────

function computeTempoFechamento(contratoDeals: WonDeal[]): CloserTempoFechamento {
    const dias: number[] = [];
    for (const d of contratoDeals) {
        const start = d.created_at ?? d.cdate ?? null;
        const end = d.data_fechamento;
        if (!start || !end) continue;
        const t1 = new Date(start).getTime();
        const t2 = new Date(end).getTime();
        if (Number.isNaN(t1) || Number.isNaN(t2) || t2 < t1) continue;
        dias.push((t2 - t1) / (24 * 60 * 60 * 1000));
    }
    if (dias.length === 0) return { dias: null, n: 0 };
    const avg = dias.reduce((a, b) => a + b, 0) / dias.length;
    return { dias: Math.round(avg), n: dias.length };
}

// ─── BUILDERS DE BLOCOS ────────────────────────────────────────────────────

function buildSpendBlock(options: CloserOptions): CloserSpendBlock | null {
    if (!options.spend) return null;
    const total = (options.spend.meta || 0) + (options.spend.google || 0);
    const previousTotal = options.previousSpend
        ? (options.previousSpend.meta || 0) + (options.previousSpend.google || 0)
        : null;
    return {
        meta: options.spend.meta || 0,
        google: options.spend.google || 0,
        total,
        previousTotal,
    };
}

function buildCostBlock(
    spend: CloserSpendBlock | null,
    denominatorCurrent: number,
    denominatorPrevious: number,
    target: number | null,
): CloserCostBlock | null {
    if (!spend) return null;
    const current =
        denominatorCurrent > 0
            ? Math.round((spend.total / denominatorCurrent) * 100) / 100
            : null;
    const previous =
        spend.previousTotal != null && denominatorPrevious > 0
            ? Math.round((spend.previousTotal / denominatorPrevious) * 100) / 100
            : null;
    return { current, previous, target };
}

function buildMissingData(
    options: CloserOptions,
    funnel: CloserFunnelDetailed,
): CloserMissingData {
    const targetsMissing: string[] = [];
    if (funnel.agendada.target == null) targetsMissing.push("closer_agendada");
    if (funnel.realizada.target == null) targetsMissing.push("closer_realizada");
    if (funnel.contrato.target == null) targetsMissing.push("vendas");
    return {
        targetsMissing,
        spendUnavailable: !options.spend || options.spendPartial === true,
        staleSync: options.staleSync === true,
    };
}

// ─── FUNÇÃO PRINCIPAL ──────────────────────────────────────────────────────

export function computeCloserMetrics(
    deals: WonDeal[],
    fieldMap: Record<string, string>,
    period: { start: Date; end: Date },
    options: CloserOptions = {},
): CloserMetrics {
    const mode: CloserMode = options.mode ?? "evento";
    const now = new Date();

    // Período anterior (mesma duração imediatamente antes) — para `previous`
    // dos blocos de funnel/cost. Não é exibido na UI atualmente, mas mantido
    // para consistência com SDRMetrics e futura comparação opcional.
    const periodMs = period.end.getTime() - period.start.getTime();
    const prevEnd = new Date(period.start.getTime() - 1);
    const prevStart = new Date(prevEnd.getTime() - periodMs);

    const cur = computeStageCounts(deals, period, mode);
    const prev = computeStageCounts(deals, { start: prevStart, end: prevEnd }, mode);

    // Prorrateio de target — segue padrão do SDR.
    const daysInMonth = options.daysInTargetMonth ?? 30;
    let periodDays: number;
    if (options.daysElapsedInPeriod != null) {
        periodDays = Math.max(1, options.daysElapsedInPeriod);
    } else {
        periodDays = Math.max(1, Math.round(periodMs / (24 * 60 * 60 * 1000) + 0.5));
    }
    const proratedTarget = (monthly: number | null | undefined): number | null => {
        if (monthly == null || monthly < 0) return null;
        return Math.round((monthly * periodDays) / daysInMonth);
    };

    const t = options.targets ?? null;
    const funnelDetailed: CloserFunnelDetailed = {
        agendada: {
            current: cur.agendada.count,
            previous: prev.agendada.count,
            target: proratedTarget(t?.closer_agendada),
            deals: cur.agendada.deals,
        },
        realizada: {
            current: cur.realizada.count,
            previous: prev.realizada.count,
            target: proratedTarget(t?.closer_realizada),
            deals: cur.realizada.deals,
        },
        contrato: {
            current: cur.contrato.count,
            previous: prev.contrato.count,
            target: proratedTarget(t?.vendas),
            deals: cur.contrato.deals,
        },
    };

    const safeRate = (num: number, den: number): number | null =>
        den > 0 ? Math.round((num / den) * 1000) / 10 : null;

    const rates: CloserRates = {
        comparecimento: safeRate(cur.realizada.count, cur.agendada.count),
        closeRate: safeRate(cur.contrato.count, cur.realizada.count),
        mqlToContract: safeRate(cur.contrato.count, cur.mql.count),
    };

    const spendBlock = buildSpendBlock(options);
    const cac = buildCostBlock(spendBlock, cur.contrato.count, prev.contrato.count, null);
    const cpl = buildCostBlock(
        spendBlock,
        cur.lead.count,
        prev.lead.count,
        t?.cpl ?? null,
    );

    const tempoFechamento = computeTempoFechamento(cur.contrato.deals);
    const cohortFechamento = computeCohortFechamento(deals, period, options, now);

    // Motivos de perda — usa deals perdidos no período (data_fechamento NULL +
    // status Lost com mdate no período não é confiável, então usamos `cdate`
    // como proxy do "perdido recentemente"). Para consistência, restringimos
    // ao escopo MQL.
    const lostInPeriod: WonDeal[] = [];
    for (const d of deals) {
        if (!isInMqlScope(d)) continue;
        if (d.status !== "2") continue;
        if (d.data_fechamento) continue; // tem data_fechamento → Won, não Lost
        const createdAtIso = d.created_at ?? d.cdate ?? null;
        if (!dateInRange(createdAtIso, period.start, period.end)) continue;
        lostInPeriod.push(d);
    }
    const lossReasons = aggregateLossReasons(lostInPeriod, fieldMap, 8);

    const missingData = buildMissingData(options, funnelDetailed);

    return {
        mode,
        funnelDetailed,
        rates,
        spend: spendBlock,
        cac,
        cpl,
        leadCount: cur.lead.count,
        mqlCount: cur.mql.count,
        tempoFechamento,
        cohortFechamento,
        lossReasons,
        missingData,
    };
}
