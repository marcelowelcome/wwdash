import { type Deal } from "./schemas";
import { parseDate, inRange, daysAgo } from "./utils";

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
}

export type PeriodFilter = "week" | "4weeks" | "3months" | "full";

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

export function computeSDRMetrics(
    deals: Deal[],
    fieldMap: Record<string, string>,
    filter: PeriodFilter
): SDRMetrics {
    const now = new Date();

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

    const periodRange = getRange(filter);
    const currentMon = getRange("week").start;

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
    let lostPeriodEngagedTotal = 0;
    let notEngagedCount = 0;

    // Period funnel accumulators
    let periodMql = 0;
    let periodAgendados = 0;
    let periodReunioes = 0;
    let periodQualificados = 0;
    let periodAgCloser = 0;

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

        // Period deals + funnel accumulators
        if (parsed >= periodRange.start && parsed <= periodRange.end) {
            dealsInPeriod.push(d);
            periodMql++;

            if (d.data_reuniao_1 && d.data_reuniao_1 !== "") {
                periodAgendados++;
            }

            const comoVal = (d.como_foi_feita_a_1a_reuniao || "").toLowerCase();
            if (comoVal !== "" && comoVal !== "não teve reunião" && comoVal !== "não") {
                periodReunioes++;
            }

            if (d._cf[F_SQL_ID] === "Sim") {
                periodQualificados++;
            }

            if (d.data_horario_agendamento_closer !== "" && d.data_horario_agendamento_closer != null) {
                periodAgCloser++;
            }

            // Period loss reasons
            const isLost = d.status === "2" || d.status === "lost";
            if (isLost) {
                const motivo = d._cf[FL_ID];
                if (motivo === nonEngagedMotive) {
                    notEngagedCount++;
                } else {
                    const m = motivo || "Outros";
                    lostPeriodEngagedCounts[m] = (lostPeriodEngagedCounts[m] || 0) + 1;
                    lostPeriodEngagedTotal++;
                }
            }
        }

        // Historical loss reasons (all deals)
        const isLost = d.status === "2" || d.status === "lost";
        if (isLost) {
            const motivo = d._cf[FL_ID];
            if (motivo !== nonEngagedMotive) {
                const m = motivo || "Outros";
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
        alerts
    };
}
