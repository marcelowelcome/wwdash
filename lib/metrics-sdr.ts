import { type Deal, type WonDeal, type MonthlyTarget } from "./schemas";
import { parseDate, inRange, daysAgo } from "./utils";
import {
    isElopement,
    isInWwPipeline,
    isInWwMqlPipeline,
} from "./funnel-utils";

const DOW_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"] as const;

export interface SDRMetrics {
    // Block 1: KPIs
    mqlThisWeek: number;
    mm4s: number;
    taxaAgendamento: number | null;
    taxaComparecimento: number | null;
    taxaQualificacao: number | null;

    // Block 2: Funnel
    funnel: {
        mql: number;
        agendamentos: number;
        reunioes: number;
        qualificados: number;
        agCloser: number;
    };

    // Block 3: Weekly Volume (12 weeks)
    weeklyVolume: {
        week: string;
        mql: number;
        mm4s: number;
    }[];

    // Block 4: Monthly Rates (12 months)
    monthlyRates: {
        month: string;
        comparecimento: number;
        agendamento: number;
        isCurrent: boolean;
    }[];

    // Block 5: Loss Reasons
    lossReasons: {
        motivo: string;
        periodoPct: number;
        historicoPct: number;
        delta: number;
    }[];
    notEngagedNote: { count: number; pct: number };

    // Block 6: Alerts
    alerts: { level: "red" | "orange"; message: string }[];

    // Block 7: Daily trend data (for the daily ComposedChart)
    dailyTrend: {
        date: string;       // YYYY-MM-DD
        label: string;      // "DD/MM"
        diaSemana: string;  // "Seg", "Ter", etc.
        isWeekend: boolean;
        mql: number;
        agendamentos: number;
        reunioes: number;
        qualificados: number;
        taxaAgend: number;  // percentage 0-100
        taxaComp: number;
        sdrData: { ownerId: string; mql: number; agendamentos: number; taxa: number }[];
        motivoBreakdown: { motivo: string; count: number }[];
        deals: { id: string; title: string | null; agendou: boolean; status: string }[];
    }[];

    // Block 8: Anomaly detection (dip detection)
    anomaly: {
        recentAvg: number;    // avg taxaAgend last 10 business days
        prevAvg: number;      // avg taxaAgend prev 10 business days
        delta: number;        // recentAvg - prevAvg (in pp)
        alert: boolean;       // true if delta < -5
    } | null;

    // Block 9: Investigation (7d vs prev 7d decomposition)
    investigation: {
        last: { mql: number; agend: number; taxa: number };
        prev: { mql: number; agend: number; taxa: number };
        volEffect: number;    // (lastMql - prevMql) * (prevTaxa/100)
        rateEffect: number;   // lastMql * ((lastTaxa - prevTaxa)/100)
        sdrComp: {
            ownerId: string;
            mqlLast: number; agendLast: number; taxaLast: number;
            taxaPrev: number; delta: number;
        }[];
        motivosComp: {
            motivo: string; pctLast: number; pctPrev: number; delta: number;
        }[];
    } | null;

    // Block 10: SDR ranking for the period
    sdrRanking: {
        ownerId: string;
        mql: number;
        agendamentos: number;
        taxa: number;
    }[];

    // Block 11: Day-of-week pattern
    dowPattern: {
        dow: string;      // "Seg", "Ter", etc.
        avgTaxa: number;  // avg taxaAgend for that DOW
        avgMql: number;   // avg MQL for that DOW
    }[];

    // Block 12: KPI deltas vs previous period
    deltaVsPrev: {
        dMql: number | null;    // % change in MQL vs previous period
        dAgend: number | null;  // % change in agendamentos
    };

    // Block 13: Motivos with visual card data + deal references for drill-down
    motivosCards: {
        motivo: string;
        count: number;
        pct: number;        // percentage in current period
        histPct: number;    // historical percentage
        delta: number;      // pct - histPct (in pp)
        deals: { id: string; title: string | null; cdate: string }[];
    }[];

    // ─── REDESIGN v2 (mode coorte/evento + targets + spend) ──────────────────
    // Os campos abaixo alimentam o redesign de aba SDR (kpi-weddings v2.8.0).
    // Os campos acima são preservados para back-compat com testes legados;
    // o componente SDRTab v2 não os consume.

    /** Modo de cálculo do funil principal: 'evento' (default) ou 'coorte'. */
    mode: SDRMode;

    /** Funil rico (6 etapas) com current/previous/target e lista de deals por etapa. */
    funnelDetailed: SDRFunnelDetailed;

    /** Bloco de investimento (Meta + Google) ou null se spend não disponível. */
    spend: SDRSpendBlock | null;

    /** Custo por Lead (spend total / Lead.current). null se spend ou Lead ausentes. */
    cpl: SDRCplBlock | null;

    /** Custo por MQL (spend total / MQL.current). null se spend ou MQL ausentes. */
    cpMql: SDRCplBlock | null;

    /** Sinais de dados ausentes — alimenta o banner do redesign. */
    missingData: SDRMissingData;
}

export type PeriodFilter = "week" | "4weeks" | "3months" | "full";

// ─── REDESIGN v2 — Types ─────────────────────────────────────────────────────

export type SDRMode = "coorte" | "evento";

export interface FunnelStage {
    /** Contagem no período atual (semântica varia por mode). */
    current: number;
    /** Mesma medição no período imediatamente anterior. */
    previous: number;
    /** Meta prorrateada para o range (`monthly_target × daysBack / daysInTargetMonth`). */
    target: number | null;
    /** Lista de deals contados em `current` — alimenta o DealsModal. */
    deals: WonDeal[];
}

export interface SDRFunnelDetailed {
    lead: FunnelStage;
    mql: FunnelStage;
    agendamento: FunnelStage;
    realizada: FunnelStage;
    qualificacao: FunnelStage;
    agCloser: FunnelStage;
}

export interface SDRSpendBlock {
    meta: number;
    google: number;
    total: number;
    /** Mesma soma no período imediatamente anterior; null se sem dado. */
    previousTotal: number | null;
}

/**
 * Bloco genérico de "custo por X". Usado tanto para Custo por Lead (cpl)
 * quanto Custo por MQL (cpMql) — denominador difere, denominador.value é
 * cravado pelo motor.
 */
export interface SDRCplBlock {
    /** Custo absoluto = total spend / denominator. null se denominator=0. */
    current: number | null;
    /** Mesmo cálculo no período anterior (mantido para futura comparação). */
    previous: number | null;
    /**
     * Meta. Para CPL (custo por lead) vem de `monthly_targets.cpl` direto.
     * Para Custo por MQL não há coluna dedicada → null.
     * NÃO prorrateia (é taxa, não volume).
     */
    target: number | null;
}

export interface SDRMissingData {
    /** Lista de campos do funil sem meta no `monthly_targets` (ex: ['mql','agendamento']). */
    targetsMissing: string[];
    /** True quando o caller não conseguiu fornecer spend (ads_daily_cache vazio/parcial). */
    spendUnavailable: boolean;
    /** True se o caller marcou que a sync com AC está atrasada (>6h). */
    staleSync: boolean;
}

export interface SDROptions {
    /** 'evento' (default) ou 'coorte'. Ver lib/metrics-sdr.ts header. */
    mode?: SDRMode;
    /** Linha de `monthly_targets` para o mês de `end`. null = sem meta. */
    targets?: MonthlyTarget | null;
    /** Spend agregado do período (Meta + Google). null = sem dado. */
    spend?: { meta: number; google: number } | null;
    /** Spend agregado do período imediatamente anterior. */
    previousSpend?: { meta: number; google: number } | null;
    /**
     * Dias no mês do `end` (ex: 30 ou 31) — usado para prorratear target.
     * Caller calcula com `new Date(year, month, 0).getDate()`. Default 30.
     */
    daysInTargetMonth?: number;
    /** Sinaliza ao motor que a sync AC está atrasada (>6h). */
    staleSync?: boolean;
    /** Sinaliza ao motor que o spend retornado é parcial (gaps no daily cache). */
    spendPartial?: boolean;
}

/**
 * Aceita o preset legacy (string) ou um range concreto `{start, end}`.
 * O caller (Dashboard/SDRTab) passa `{start, end}` derivado do
 * `<PeriodSelector />` global; testes legados ainda passam strings.
 */
export type SDRPeriodInput = PeriodFilter | { start: Date; end: Date };

/** Returns the Monday 00:00:00 for the week containing date d */
function getMonday(d: Date): Date {
    const day = d.getDay();
    const mon = new Date(d);
    mon.setDate(d.getDate() - ((day + 6) % 7));
    mon.setHours(0, 0, 0, 0);
    return mon;
}

/** Format a Date as YYYY-MM-DD for use as a Map key */
function dateKey(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${dd}`;
}

/** Format a Date as YYYY-MM for month Map key */
function monthKey(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Helper: is deal agendado? */
function isDealAgendado(d: Deal): boolean {
    return !!(d.data_reuniao_1 && d.data_reuniao_1 !== "");
}

/** Helper: is deal reuniao realizada? */
function isDealReuniao(d: Deal): boolean {
    const v = (d.como_foi_feita_a_1a_reuniao || "").toLowerCase();
    return v !== "" && v !== "não teve reunião" && v !== "não";
}

/** Helper: is deal qualificado? */
function isDealQualificado(d: Deal, fSqlId: string): boolean {
    return d._cf[fSqlId] === "Sim";
}

/** Helper: is deal lost? */
function isDealLost(d: Deal): boolean {
    return d.status === "2" || d.status === "lost";
}

// ─── Daily bucket accumulator ────────────────────────────────────────────────
interface DayBucket {
    mql: number;
    agendamentos: number;
    reunioes: number;
    qualificados: number;
    sdrMql: Record<string, number>;
    sdrAgend: Record<string, number>;
    motivoCounts: Record<string, number>;
    deals: { id: string; title: string | null; agendou: boolean; status: string }[];
}

function emptyDayBucket(): DayBucket {
    return { mql: 0, agendamentos: 0, reunioes: 0, qualificados: 0, sdrMql: {}, sdrAgend: {}, motivoCounts: {}, deals: [] };
}

export function computeSDRMetrics(
    deals: Deal[],
    fieldMap: Record<string, string>,
    period: SDRPeriodInput,
    options: SDROptions = {},
): SDRMetrics {
    const now = new Date();
    const mode: SDRMode = options.mode ?? "evento";

    // Internal IDs from supabase-api.ts
    const F_SQL_ID = fieldMap["SQL"];
    const FL_ID = fieldMap["Motivo de Perda"];

    // Date Ranges
    const getRange = (f: PeriodFilter) => {
        const end = new Date(now);
        let start = new Date(0); // full
        if (f === "week") {
            const day = now.getDay();
            start = new Date(now);
            start.setDate(now.getDate() - ((day + 6) % 7)); // Monday
            start.setHours(0, 0, 0, 0);
        } else if (f === "4weeks") {
            start = daysAgo(28);
        } else if (f === "3months") {
            start = daysAgo(90);
        }
        return { start, end };
    };

    const periodRange =
        typeof period === "string"
            ? getRange(period)
            : { start: period.start, end: period.end };
    const currentMon = getRange("week").start;

    // Previous period range (same duration, immediately before)
    const periodDurationMs = periodRange.end.getTime() - periodRange.start.getTime();
    const prevPeriodEnd = new Date(periodRange.start.getTime() - 1);
    const prevPeriodStart = new Date(periodRange.start.getTime() - periodDurationMs);

    // ── Single-pass indexing ────────────────────────────────────────────
    // Pre-compute week keys for the 12 chart weeks (+ 4 extra for MM4s lookback)
    const weekKeys: string[] = [];
    for (let i = 15; i >= 0; i--) {
        const ws = new Date(currentMon);
        ws.setDate(currentMon.getDate() - i * 7);
        weekKeys.push(dateKey(ws));
    }
    const weekKeySet = new Set(weekKeys);

    // Pre-compute month keys for the 12 chart months
    const monthKeys: string[] = [];
    for (let i = 11; i >= 0; i--) {
        const md = new Date(now.getFullYear(), now.getMonth() - i, 1);
        monthKeys.push(monthKey(md));
    }
    const monthKeySet = new Set(monthKeys);

    // Maps for week/month indexing
    const weekMap = new Map<string, Deal[]>();
    const monthMap = new Map<string, Deal[]>();

    // Period filter accumulators (avoid separate filter pass)
    const dealsInPeriod: Deal[] = [];

    // MM4s range
    const mm4sStart = new Date(currentMon);
    mm4sStart.setDate(currentMon.getDate() - 28);
    const mm4sEnd = new Date(currentMon);
    mm4sEnd.setMilliseconds(-1);
    let mm4sCount = 0;

    // Current-week deals for alerts
    const weekDeals: Deal[] = [];

    // Loss reason accumulators (avoid separate filter passes)
    const nonEngagedMotive = "Não fez reunião com a SDR";
    // All lost deals excluding non-engaged (for historical loss stats)
    const lostAllEngagedCounts: Record<string, number> = {};
    let lostAllEngagedTotal = 0;
    // Period lost deals excluding non-engaged
    const lostPeriodEngagedCounts: Record<string, number> = {};
    const lostPeriodEngagedDeals: Record<string, { id: string; title: string | null; cdate: string }[]> = {};
    let lostPeriodEngagedTotal = 0;
    let notEngagedCount = 0;

    // Period funnel accumulators
    let periodMql = 0;
    let periodAgendados = 0;
    let periodReunioes = 0;
    let periodQualificados = 0;
    let periodAgCloser = 0;

    // NEW: Daily trend map (only for period deals)
    const dayMap = new Map<string, DayBucket>();

    // NEW: Per-SDR period accumulators
    const sdrPeriodMql: Record<string, number> = {};
    const sdrPeriodAgend: Record<string, number> = {};

    // NEW: Previous period accumulators
    let prevMql = 0;
    let prevAgendados = 0;

    // Single pass over all deals
    for (const d of deals) {
        const parsed = parseDate(d.cdate);
        if (!parsed) continue;

        // Week map — only index weeks we actually need (chart 12 + 4 lookback)
        const mon = getMonday(parsed);
        const wk = dateKey(mon);
        if (weekKeySet.has(wk)) {
            let arr = weekMap.get(wk);
            if (!arr) { arr = []; weekMap.set(wk, arr); }
            arr.push(d);
        }

        // Month map — only index months we need for the chart
        const mk = monthKey(parsed);
        if (monthKeySet.has(mk)) {
            let arr = monthMap.get(mk);
            if (!arr) { arr = []; monthMap.set(mk, arr); }
            arr.push(d);
        }

        // MM4s accumulator
        if (parsed >= mm4sStart && parsed <= mm4sEnd) {
            mm4sCount++;
        }

        // Current week deals for alerts
        if (parsed >= currentMon && parsed <= now) {
            weekDeals.push(d);
        }

        // NEW: Previous period accumulators
        if (parsed >= prevPeriodStart && parsed <= prevPeriodEnd) {
            prevMql++;
            if (isDealAgendado(d)) prevAgendados++;
        }

        // Period deals + funnel accumulators
        if (parsed >= periodRange.start && parsed <= periodRange.end) {
            dealsInPeriod.push(d);
            periodMql++;

            const agendado = isDealAgendado(d);
            if (agendado) periodAgendados++;

            const reuniao = isDealReuniao(d);
            if (reuniao) periodReunioes++;

            const qualificado = isDealQualificado(d, F_SQL_ID);
            if (qualificado) periodQualificados++;

            if (d.data_horario_agendamento_closer !== "" && d.data_horario_agendamento_closer != null) {
                periodAgCloser++;
            }

            // NEW: Daily trend bucket
            const dk = dateKey(parsed);
            let bucket = dayMap.get(dk);
            if (!bucket) { bucket = emptyDayBucket(); dayMap.set(dk, bucket); }
            bucket.mql++;
            if (agendado) bucket.agendamentos++;
            if (reuniao) bucket.reunioes++;
            if (qualificado) bucket.qualificados++;
            bucket.deals.push({ id: d.id, title: (d as any).title || null, agendou: agendado, status: d.status });

            const ownerId = d.owner_id || "unknown";
            bucket.sdrMql[ownerId] = (bucket.sdrMql[ownerId] || 0) + 1;
            if (agendado) bucket.sdrAgend[ownerId] = (bucket.sdrAgend[ownerId] || 0) + 1;

            // NEW: Per-SDR period accumulators
            sdrPeriodMql[ownerId] = (sdrPeriodMql[ownerId] || 0) + 1;
            if (agendado) sdrPeriodAgend[ownerId] = (sdrPeriodAgend[ownerId] || 0) + 1;

            // Period loss reasons
            if (isDealLost(d)) {
                const motivo = d._cf[FL_ID];
                if (motivo === nonEngagedMotive) {
                    notEngagedCount++;
                } else {
                    const m = motivo || "Não informado";
                    lostPeriodEngagedCounts[m] = (lostPeriodEngagedCounts[m] || 0) + 1;
                    if (!lostPeriodEngagedDeals[m]) lostPeriodEngagedDeals[m] = [];
                    lostPeriodEngagedDeals[m].push({ id: d.id, title: (d as any).title || null, cdate: d.cdate });
                    lostPeriodEngagedTotal++;

                    // Daily motivo breakdown
                    bucket.motivoCounts[m] = (bucket.motivoCounts[m] || 0) + 1;
                }
            }
        }

        // Historical loss reasons (all deals)
        if (isDealLost(d)) {
            const motivo = d._cf[FL_ID];
            if (motivo !== nonEngagedMotive) {
                const m = motivo || "Não informado";
                lostAllEngagedCounts[m] = (lostAllEngagedCounts[m] || 0) + 1;
                lostAllEngagedTotal++;
            }
        }
    }

    // ── KPIs (from accumulators) ────────────────────────────────────────
    const mql = periodMql;
    const agendados = periodAgendados;
    const reunioes = periodReunioes;
    const qualificados = periodQualificados;
    const agCloser = periodAgCloser;

    const taxaAgend = mql > 0 ? (agendados / mql) * 100 : null;
    const taxaComp = agendados > 0 ? (reunioes / agendados) * 100 : null;
    const taxaQual = reunioes > 0 ? (qualificados / reunioes) * 100 : null;
    const taxaAgendCloser = qualificados > 0 ? (agCloser / qualificados) * 100 : null;

    const mm4sValue = mm4sCount > 0 ? mm4sCount / 4 : 0;

    // ── Weekly Volume (12 weeks, using pre-indexed weekMap) ─────────────
    const monthLabels = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
    const weeklyVolume = [];
    for (let i = 11; i >= 0; i--) {
        const wStart = new Date(currentMon);
        wStart.setDate(currentMon.getDate() - i * 7);
        wStart.setHours(0, 0, 0, 0);

        const wk = dateKey(wStart);
        const wCount = weekMap.get(wk)?.length || 0;

        // MM4s for this week: sum of 4 preceding weeks
        let prev4Count = 0;
        for (let j = 1; j <= 4; j++) {
            const prevMon = new Date(wStart);
            prevMon.setDate(wStart.getDate() - j * 7);
            const pk = dateKey(prevMon);
            prev4Count += weekMap.get(pk)?.length || 0;
        }

        weeklyVolume.push({
            week: `${wStart.getDate()} ${monthLabels[wStart.getMonth()]}`,
            mql: wCount,
            mm4s: prev4Count / 4
        });
    }

    // ── Monthly Rates (12 months, using pre-indexed monthMap) ───────────
    const monthLabelsUpper = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
    const monthlyRates = [];
    for (let i = 11; i >= 0; i--) {
        const mDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const mk = monthKey(mDate);
        const mDeals = monthMap.get(mk) || [];

        let mAgend = 0;
        let mReun = 0;
        for (const d of mDeals) {
            if (d.data_reuniao_1) mAgend++;
            const val = (d.como_foi_feita_a_1a_reuniao || "").toLowerCase();
            if (val !== "" && val !== "não teve reunião") mReun++;
        }

        monthlyRates.push({
            month: `${monthLabelsUpper[mDate.getMonth()]}/${String(mDate.getFullYear()).slice(2)}`,
            comparecimento: mAgend > 0 ? (mReun / mAgend) * 100 : 0,
            agendamento: mDeals.length > 0 ? (mAgend / mDeals.length) * 100 : 0,
            isCurrent: i === 0
        });
    }

    // ── Loss Reasons (from pre-computed counts) ─────────────────────────
    const periodTotal = lostPeriodEngagedTotal || 1;
    const histTotal = lostAllEngagedTotal || 1;

    const periodLoss = Object.entries(lostPeriodEngagedCounts)
        .map(([motivo, n]) => ({ motivo, pct: (n / periodTotal) * 100 }));

    const lossReasons = periodLoss
        .sort((a, b) => b.pct - a.pct)
        .slice(0, 8)
        .map(p => {
            const hCount = lostAllEngagedCounts[p.motivo] || 0;
            const h = (hCount / histTotal) * 100;
            return {
                motivo: p.motivo,
                periodoPct: p.pct,
                historicoPct: h,
                delta: p.pct - h
            };
        });

    // ── Alerts ──────────────────────────────────────────────────────────
    const alerts: { level: "red" | "orange"; message: string }[] = [];
    if (taxaComp !== null) {
        if (taxaComp < 35) alerts.push({ level: "red", message: "Alta taxa de no-show SDR — revisar processo de confirmação de agendamentos" });
        else if (taxaComp < 45) alerts.push({ level: "orange", message: "Taxa de comparecimento abaixo do esperado no período" });
    }
    if (taxaQual !== null && taxaQual < 25) alerts.push({ level: "orange", message: "Taxa de qualificação baixa — verificar perfil dos leads e critérios da SDR" });

    // Weekly checks for 0 cases (weekDeals already computed in single pass)
    const weekComoFeita = weekDeals.filter(d => d.como_foi_feita_a_1a_reuniao).length;
    if (weekComoFeita === 0 && weekDeals.length > 0) alerts.push({ level: "orange", message: "Campo de modalidade de reunião não preenchido esta semana — dado de comparecimento incompleto" });

    const weekQual = weekDeals.filter(d => d._cf[F_SQL_ID] === "Sim").length;
    if (weekQual === 0 && weekDeals.length > 0) alerts.push({ level: "orange", message: "Nenhuma qualificação registrada esta semana" });

    if (taxaAgendCloser !== null && taxaAgendCloser < 35) alerts.push({ level: "orange", message: "Maioria dos leads qualificados sem reunião Closer agendada" });

    // ── NEW: dailyTrend ─────────────────────────────────────────────────
    // Build sorted array of days within the period
    const sortedDayKeys = Array.from(dayMap.keys()).sort();
    const dailyTrend: SDRMetrics["dailyTrend"] = sortedDayKeys.map(dk => {
        const b = dayMap.get(dk)!;
        const dt = new Date(dk + "T12:00:00"); // noon to avoid TZ edge
        const dow = dt.getDay();
        const dayNum = String(dt.getDate()).padStart(2, "0");
        const monthNum = String(dt.getMonth() + 1).padStart(2, "0");

        const allOwnerIds = new Set([...Object.keys(b.sdrMql), ...Object.keys(b.sdrAgend)]);
        const sdrData = Array.from(allOwnerIds).map(ownerId => {
            const sMql = b.sdrMql[ownerId] || 0;
            const sAgend = b.sdrAgend[ownerId] || 0;
            return { ownerId, mql: sMql, agendamentos: sAgend, taxa: sMql > 0 ? (sAgend / sMql) * 100 : 0 };
        });

        const motivoBreakdown = Object.entries(b.motivoCounts)
            .map(([motivo, count]) => ({ motivo, count }))
            .sort((a, bb) => bb.count - a.count);

        return {
            date: dk,
            label: `${dayNum}/${monthNum}`,
            diaSemana: DOW_LABELS[dow],
            isWeekend: dow === 0 || dow === 6,
            mql: b.mql,
            agendamentos: b.agendamentos,
            reunioes: b.reunioes,
            qualificados: b.qualificados,
            taxaAgend: b.mql > 0 ? (b.agendamentos / b.mql) * 100 : 0,
            taxaComp: b.agendamentos > 0 ? (b.reunioes / b.agendamentos) * 100 : 0,
            sdrData,
            motivoBreakdown,
            deals: b.deals,
        };
    });

    // ── NEW: anomaly detection ──────────────────────────────────────────
    const businessDays = dailyTrend.filter(d => !d.isWeekend);
    let anomaly: SDRMetrics["anomaly"] = null;
    if (businessDays.length >= 20) {
        const recent10 = businessDays.slice(-10);
        const prev10 = businessDays.slice(-20, -10);
        const recentAvg = recent10.reduce((s, d) => s + d.taxaAgend, 0) / 10;
        const prevAvg = prev10.reduce((s, d) => s + d.taxaAgend, 0) / 10;
        const delta = recentAvg - prevAvg;
        anomaly = { recentAvg, prevAvg, delta, alert: delta < -5 };
    }

    // ── NEW: investigation (7d vs prev 7d) ──────────────────────────────
    let investigation: SDRMetrics["investigation"] = null;
    {
        const today = new Date(now);
        today.setHours(23, 59, 59, 999);
        const last7Start = new Date(today);
        last7Start.setDate(today.getDate() - 6);
        last7Start.setHours(0, 0, 0, 0);
        const prev7End = new Date(last7Start);
        prev7End.setMilliseconds(-1);
        const prev7Start = new Date(last7Start);
        prev7Start.setDate(last7Start.getDate() - 7);
        prev7Start.setHours(0, 0, 0, 0);

        const last7Key = dateKey(last7Start);
        const prev7Key = dateKey(prev7Start);
        const todayKey = dateKey(today);
        const prev7EndKey = dateKey(prev7End);

        // Filter dailyTrend for last7 and prev7
        const last7Days = dailyTrend.filter(d => d.date >= last7Key && d.date <= todayKey);
        const prev7Days = dailyTrend.filter(d => d.date >= prev7Key && d.date <= prev7EndKey);

        const sumMql = (arr: typeof dailyTrend) => arr.reduce((s, d) => s + d.mql, 0);
        const sumAgend = (arr: typeof dailyTrend) => arr.reduce((s, d) => s + d.agendamentos, 0);

        const lastMql = sumMql(last7Days);
        const lastAgend = sumAgend(last7Days);
        const pMql = sumMql(prev7Days);
        const pAgend = sumAgend(prev7Days);

        const lastTaxa = lastMql > 0 ? (lastAgend / lastMql) * 100 : 0;
        const prevTaxa = pMql > 0 ? (pAgend / pMql) * 100 : 0;

        // Per-SDR comparison
        const sdrLast: Record<string, { mql: number; agend: number }> = {};
        const sdrPrev: Record<string, { mql: number; agend: number }> = {};
        for (const day of last7Days) {
            for (const s of day.sdrData) {
                if (!sdrLast[s.ownerId]) sdrLast[s.ownerId] = { mql: 0, agend: 0 };
                sdrLast[s.ownerId].mql += s.mql;
                sdrLast[s.ownerId].agend += s.agendamentos;
            }
        }
        for (const day of prev7Days) {
            for (const s of day.sdrData) {
                if (!sdrPrev[s.ownerId]) sdrPrev[s.ownerId] = { mql: 0, agend: 0 };
                sdrPrev[s.ownerId].mql += s.mql;
                sdrPrev[s.ownerId].agend += s.agendamentos;
            }
        }
        const allSdrIds = new Set([...Object.keys(sdrLast), ...Object.keys(sdrPrev)]);
        const sdrComp = Array.from(allSdrIds).map(ownerId => {
            const l = sdrLast[ownerId] || { mql: 0, agend: 0 };
            const p = sdrPrev[ownerId] || { mql: 0, agend: 0 };
            const tLast = l.mql > 0 ? (l.agend / l.mql) * 100 : 0;
            const tPrev = p.mql > 0 ? (p.agend / p.mql) * 100 : 0;
            return { ownerId, mqlLast: l.mql, agendLast: l.agend, taxaLast: tLast, taxaPrev: tPrev, delta: tLast - tPrev };
        });

        // Motivo comparison
        const motivoLastCounts: Record<string, number> = {};
        let motivoLastTotal = 0;
        const motivoPrevCounts: Record<string, number> = {};
        let motivoPrevTotal = 0;
        for (const day of last7Days) {
            for (const m of day.motivoBreakdown) {
                motivoLastCounts[m.motivo] = (motivoLastCounts[m.motivo] || 0) + m.count;
                motivoLastTotal += m.count;
            }
        }
        for (const day of prev7Days) {
            for (const m of day.motivoBreakdown) {
                motivoPrevCounts[m.motivo] = (motivoPrevCounts[m.motivo] || 0) + m.count;
                motivoPrevTotal += m.count;
            }
        }
        const allMotivos = new Set([...Object.keys(motivoLastCounts), ...Object.keys(motivoPrevCounts)]);
        const motivosComp = Array.from(allMotivos).map(motivo => {
            const pctLast = motivoLastTotal > 0 ? ((motivoLastCounts[motivo] || 0) / motivoLastTotal) * 100 : 0;
            const pctPrev = motivoPrevTotal > 0 ? ((motivoPrevCounts[motivo] || 0) / motivoPrevTotal) * 100 : 0;
            return { motivo, pctLast, pctPrev, delta: pctLast - pctPrev };
        }).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

        investigation = {
            last: { mql: lastMql, agend: lastAgend, taxa: lastTaxa },
            prev: { mql: pMql, agend: pAgend, taxa: prevTaxa },
            volEffect: (lastMql - pMql) * (prevTaxa / 100),
            rateEffect: lastMql * ((lastTaxa - prevTaxa) / 100),
            sdrComp,
            motivosComp,
        };
    }

    // ── NEW: sdrRanking ─────────────────────────────────────────────────
    const allSdrOwners = new Set([...Object.keys(sdrPeriodMql), ...Object.keys(sdrPeriodAgend)]);
    const sdrRanking = Array.from(allSdrOwners)
        .map(ownerId => {
            const m = sdrPeriodMql[ownerId] || 0;
            const a = sdrPeriodAgend[ownerId] || 0;
            return { ownerId, mql: m, agendamentos: a, taxa: m > 0 ? (a / m) * 100 : 0 };
        })
        .sort((a, b) => b.taxa - a.taxa);

    // ── NEW: dowPattern ─────────────────────────────────────────────────
    // Group business days by DOW
    const dowGroups: Record<string, { taxas: number[]; mqls: number[] }> = {};
    for (const day of businessDays) {
        if (!dowGroups[day.diaSemana]) dowGroups[day.diaSemana] = { taxas: [], mqls: [] };
        dowGroups[day.diaSemana].taxas.push(day.taxaAgend);
        dowGroups[day.diaSemana].mqls.push(day.mql);
    }
    // Maintain Mon-Fri order
    const dowOrder = ["Seg", "Ter", "Qua", "Qui", "Sex"];
    const dowPattern: SDRMetrics["dowPattern"] = dowOrder
        .filter(dow => dowGroups[dow])
        .map(dow => {
            const g = dowGroups[dow];
            return {
                dow,
                avgTaxa: g.taxas.length > 0 ? g.taxas.reduce((s, v) => s + v, 0) / g.taxas.length : 0,
                avgMql: g.mqls.length > 0 ? g.mqls.reduce((s, v) => s + v, 0) / g.mqls.length : 0,
            };
        });

    // ── NEW: deltaVsPrev ────────────────────────────────────────────────
    const dMql = prevMql > 0 ? ((mql - prevMql) / prevMql) * 100 : null;
    const dAgend = prevAgendados > 0 ? ((agendados - prevAgendados) / prevAgendados) * 100 : null;

    // ── NEW: motivosCards ───────────────────────────────────────────────
    const motivosCards: SDRMetrics["motivosCards"] = Object.entries(lostPeriodEngagedCounts)
        .map(([motivo, count]) => {
            const pct = (count / periodTotal) * 100;
            const histPct = ((lostAllEngagedCounts[motivo] || 0) / histTotal) * 100;
            return { motivo, count, pct, histPct, delta: pct - histPct, deals: lostPeriodEngagedDeals[motivo] || [] };
        })
        .sort((a, b) => b.count - a.count);

    // ─── REDESIGN v2 — Funil rico com mode/coorte/evento, target prorrateado, ──
    //     spend, CPL e missingData. Os helpers acima usam Deal[] (legacy);
    //     aqui re-cast para WonDeal[] (test fixtures vão passar; produção
    //     sempre passa WonDeal já que sdrDeals do Dashboard é WonDeal[]).
    const wonDeals = deals as unknown as WonDeal[];
    const funnelDetailed = computeFunnelDetailedV2(
        wonDeals,
        periodRange,
        prevPeriodStart,
        prevPeriodEnd,
        F_SQL_ID,
        mode,
        options,
    );
    const spendBlock = buildSpendBlock(options);
    // Custo por Lead = spend / Lead. Meta vem de monthly_targets.cpl direto.
    const cplBlock = buildCostBlock(
        spendBlock,
        funnelDetailed.lead,
        options.targets?.cpl ?? null,
    );
    // Custo por MQL = spend / MQL. Sem coluna de meta em monthly_targets → null.
    const cpMqlBlock = buildCostBlock(spendBlock, funnelDetailed.mql, null);
    const missingData = buildMissingData(options, funnelDetailed);

    return {
        mqlThisWeek: mql,
        mm4s: mm4sValue,
        taxaAgendamento: taxaAgend,
        taxaComparecimento: taxaComp,
        taxaQualificacao: taxaQual,
        funnel: { mql, agendamentos: agendados, reunioes, qualificados, agCloser },
        weeklyVolume,
        monthlyRates,
        lossReasons,
        notEngagedNote: { count: notEngagedCount, pct: mql > 0 ? (notEngagedCount / mql) * 100 : 0 },
        alerts,
        dailyTrend,
        anomaly,
        investigation,
        sdrRanking,
        dowPattern,
        deltaVsPrev: { dMql, dAgend },
        motivosCards,

        // v2 redesign fields
        mode,
        funnelDetailed,
        spend: spendBlock,
        cpl: cplBlock,
        cpMql: cpMqlBlock,
        missingData,
    };
}

// ═══════════════════════════════════════════════════════════════════════════
// REDESIGN v2 — Helpers do funil rico (modos coorte/evento + target/spend/cpl)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Filtros de escopo WW para o funil v2.
 * Lead = todo deal criado em pipeline WW (5 pipelines), excluindo apenas
 * `is_elopement === true` (deals tagueados explicitamente como elopement).
 * Títulos com prefixo `EW` SÃO incluídos — leads bonafide podem usar esse
 * prefixo (decisão de marketing 06/05/2026).
 *
 * MQL = Lead + pipeline IN ['SDR Weddings','Closer Weddings','Planejamento
 * Weddings'] (i.e., sem 'WW - Internacional' nem 'Outros Desqualificados |
 * Wedding').
 */
function isInLeadScope(d: WonDeal): boolean {
    if (d.is_elopement === true) return false;
    return isInWwPipeline(d);
}

function isInMqlScope(d: WonDeal): boolean {
    return isInLeadScope(d) && isInWwMqlPipeline(d);
}

/** True se a coluna de data está dentro de [start, end] (ambos inclusivos). */
function dateInRange(value: string | null | undefined, start: Date, end: Date): boolean {
    if (!value) return false;
    const t = parseDate(value)?.getTime();
    if (t == null || Number.isNaN(t)) return false;
    return t >= start.getTime() && t <= end.getTime();
}

/** "Reunião realizada": como_foi_feita preenchido E ≠ '' E ≠ 'Não teve reunião'. */
function isReuniaoRealizadaV2(d: WonDeal): boolean {
    const v = (d.como_foi_feita_a_1a_reuniao || "").trim().toLowerCase();
    return v !== "" && v !== "não teve reunião" && v !== "não";
}

/** "Qualificado SDR": SQL='Sim' OU data_qualificado preenchida (paridade com Jornada). */
function isQualificadoV2(d: WonDeal, fSqlId: string): boolean {
    const sqlVal = fSqlId ? d._cf?.[fSqlId] : undefined;
    if (sqlVal === "Sim") return true;
    return !!(d.data_qualificado && d.data_qualificado !== "");
}

/** "Agendamento Closer": data_horario_agendamento_closer preenchido. */
function hasCloserAgendado(d: WonDeal): boolean {
    return !!(d.data_horario_agendamento_closer && d.data_horario_agendamento_closer !== "");
}

interface CountedStage {
    count: number;
    deals: WonDeal[];
}

/**
 * Aplica os critérios de cada etapa no modo Evento ou Coorte e devolve
 * tanto o count quanto a lista de deals (para alimentar o DealsModal no UI).
 */
function computeStageCounts(
    deals: WonDeal[],
    range: { start: Date; end: Date },
    fSqlId: string,
    mode: SDRMode,
): {
    lead: CountedStage;
    mql: CountedStage;
    agendamento: CountedStage;
    realizada: CountedStage;
    qualificacao: CountedStage;
    agCloser: CountedStage;
} {
    const accLead: WonDeal[] = [];
    const accMql: WonDeal[] = [];
    const accAg: WonDeal[] = [];
    const accReal: WonDeal[] = [];
    const accQual: WonDeal[] = [];
    const accCloser: WonDeal[] = [];

    for (const d of deals) {
        if (!isInLeadScope(d)) continue;
        // Defensive fallback: alguns mappers populam apenas o campo legacy
        // `cdate`. Aceitamos ambos para não silenciar deals válidos.
        const createdAtIso = d.created_at ?? d.cdate ?? null;
        const inLeadByCreated = dateInRange(createdAtIso, range.start, range.end);

        // Lead — sempre por created_at no período (Lead/MQL não diferem entre modos).
        if (inLeadByCreated) {
            accLead.push(d);
            if (isInWwMqlPipeline(d)) accMql.push(d);
        }

        // Etapas de evento (agendamento, realizada, qualif, agCloser).
        if (!isInMqlScope(d)) continue;

        if (mode === "evento") {
            // Conta o evento dentro do período.
            if (dateInRange(d.data_reuniao_1, range.start, range.end)) {
                accAg.push(d);
                if (isReuniaoRealizadaV2(d)) accReal.push(d);
            }
            if (dateInRange(d.data_qualificado, range.start, range.end)) {
                accQual.push(d);
            }
            if (dateInRange(d.data_horario_agendamento_closer, range.start, range.end)) {
                accCloser.push(d);
            }
        } else {
            // Coorte: lead nasceu no período; etapa conta se já alcançou.
            if (!inLeadByCreated) continue;
            if (d.data_reuniao_1) {
                accAg.push(d);
                if (isReuniaoRealizadaV2(d)) accReal.push(d);
            }
            if (isQualificadoV2(d, fSqlId)) accQual.push(d);
            if (hasCloserAgendado(d)) accCloser.push(d);
        }
    }

    return {
        lead: { count: accLead.length, deals: accLead },
        mql: { count: accMql.length, deals: accMql },
        agendamento: { count: accAg.length, deals: accAg },
        realizada: { count: accReal.length, deals: accReal },
        qualificacao: { count: accQual.length, deals: accQual },
        agCloser: { count: accCloser.length, deals: accCloser },
    };
}

function computeFunnelDetailedV2(
    deals: WonDeal[],
    period: { start: Date; end: Date },
    prevStart: Date,
    prevEnd: Date,
    fSqlId: string,
    mode: SDRMode,
    options: SDROptions,
): SDRFunnelDetailed {
    const cur = computeStageCounts(deals, period, fSqlId, mode);
    const prev = computeStageCounts(deals, { start: prevStart, end: prevEnd }, fSqlId, mode);

    // Prorrateio de target.
    const daysInMonth = options.daysInTargetMonth ?? 30;
    const periodMs = period.end.getTime() - period.start.getTime();
    const periodDays = Math.max(1, Math.round(periodMs / (24 * 60 * 60 * 1000) + 0.5));
    const proratedTarget = (monthly: number | null | undefined): number | null => {
        if (monthly == null || monthly < 0) return null;
        return Math.round((monthly * periodDays) / daysInMonth);
    };

    const t = options.targets ?? null;
    const targets = {
        leads: proratedTarget(t?.leads),
        mql: proratedTarget(t?.mql),
        agendamento: proratedTarget(t?.agendamento),
        reunioes: proratedTarget(t?.reunioes),
        qualificado: proratedTarget(t?.qualificado),
        closer_agendada: proratedTarget(t?.closer_agendada),
    };

    return {
        lead: { current: cur.lead.count, previous: prev.lead.count, target: targets.leads, deals: cur.lead.deals },
        mql: { current: cur.mql.count, previous: prev.mql.count, target: targets.mql, deals: cur.mql.deals },
        agendamento: { current: cur.agendamento.count, previous: prev.agendamento.count, target: targets.agendamento, deals: cur.agendamento.deals },
        realizada: { current: cur.realizada.count, previous: prev.realizada.count, target: targets.reunioes, deals: cur.realizada.deals },
        qualificacao: { current: cur.qualificacao.count, previous: prev.qualificacao.count, target: targets.qualificado, deals: cur.qualificacao.deals },
        agCloser: { current: cur.agCloser.count, previous: prev.agCloser.count, target: targets.closer_agendada, deals: cur.agCloser.deals },
    };
}

function buildSpendBlock(options: SDROptions): SDRSpendBlock | null {
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

/**
 * Custo por X. `denominatorStage` é a etapa do funil cujo `current`/`previous`
 * vira denominador. `target` é opcional — passe null para custo-por-MQL (sem
 * coluna em monthly_targets) ou monthly_targets.cpl para custo-por-lead.
 */
function buildCostBlock(
    spend: SDRSpendBlock | null,
    denominatorStage: FunnelStage,
    target: number | null,
): SDRCplBlock | null {
    if (!spend) return null;
    const current =
        denominatorStage.current > 0
            ? Math.round((spend.total / denominatorStage.current) * 100) / 100
            : null;
    const previous =
        spend.previousTotal != null && denominatorStage.previous > 0
            ? Math.round((spend.previousTotal / denominatorStage.previous) * 100) / 100
            : null;
    return { current, previous, target };
}

function buildMissingData(options: SDROptions, funnel: SDRFunnelDetailed): SDRMissingData {
    const targetsMissing: string[] = [];
    if (funnel.lead.target == null) targetsMissing.push("leads");
    if (funnel.mql.target == null) targetsMissing.push("mql");
    if (funnel.agendamento.target == null) targetsMissing.push("agendamento");
    if (funnel.realizada.target == null) targetsMissing.push("reunioes");
    if (funnel.qualificacao.target == null) targetsMissing.push("qualificado");
    if (funnel.agCloser.target == null) targetsMissing.push("closer_agendada");
    return {
        targetsMissing,
        spendUnavailable: !options.spend || options.spendPartial === true,
        staleSync: options.staleSync === true,
    };
}
