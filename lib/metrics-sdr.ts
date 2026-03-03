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

export function computeSDRMetrics(
    deals: Deal[],
    fieldMap: Record<string, string>,
    filter: PeriodFilter
): SDRMetrics {
    const now = new Date();

    // Field IDs based on requested labels
    const F_AGEND_1 = fieldMap["Data e horário do agendamento da 1ª reunião"];
    const F_COMO_REUNIAO = fieldMap["Como foi feita a 1ª reunião?"];
    const F_QUAL_SQL = fieldMap["Qualificado para SQL"];
    const F_MOTIVO_SDR = fieldMap["Motivos de qualificação SDR"];
    const F_AGEND_CLOSER = fieldMap["Data e horário do agendamento com a Closer:"];
    const F_MOTIVO_PERDA = fieldMap["Motivo de perda"];

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
    const dealsInPeriod = deals.filter(d => inRange(parseDate(d.cdate), periodRange.start, periodRange.end));

    // M1: MQL
    const mql = dealsInPeriod.length;

    // M2: Agendamentos SDR
    const agendados = dealsInPeriod.filter(d => {
        const val = d._cf[F_AGEND_1] || "";
        return val !== "";
    }).length;

    // M3: Taxa Agendamento
    const taxaAgend = mql > 0 ? (agendados / mql) * 100 : null;

    // M4: Reuniões Realizadas
    const reunioes = dealsInPeriod.filter(d => {
        const val = (d._cf[F_COMO_REUNIAO] || "").toLowerCase();
        return val !== "" && val !== "não teve reunião";
    }).length;

    // M5: Taxa Comparecimento
    const taxaComp = agendados > 0 ? (reunioes / agendados) * 100 : null;

    // M6: Qualificados SQL (Exclusively "Sim")
    const qualificados = dealsInPeriod.filter(d => d._cf[F_QUAL_SQL] === "Sim").length;

    // M7: Taxa Qualificação
    const taxaQual = reunioes > 0 ? (qualificados / reunioes) * 100 : null;

    // M8: Agendamentos Closer
    const agCloser = dealsInPeriod.filter(d => d._cf[F_AGEND_CLOSER] !== "" && d._cf[F_AGEND_CLOSER] != null).length;

    // M9: Taxa Agendamento Closer
    const taxaAgendCloser = qualificados > 0 ? (agCloser / qualificados) * 100 : null;

    // MM4s Logic (previous 4 weeks)
    const currentMon = getRange("week").start;
    const mm4sStart = new Date(currentMon); mm4sStart.setDate(currentMon.getDate() - 28);
    const mm4sEnd = new Date(currentMon); mm4sEnd.setMilliseconds(-1);

    const dealsInMM4s = deals.filter(d => inRange(parseDate(d.cdate), mm4sStart, mm4sEnd));
    const mm4sValue = dealsInMM4s.length / 4;

    // weeklyVolume (12 weeks fixed)
    const weeklyVolume = [];
    for (let i = 11; i >= 0; i--) {
        const wEnd = new Date(currentMon); wEnd.setDate(currentMon.getDate() - (i * 7) + 6);
        const wStart = new Date(currentMon); wStart.setDate(currentMon.getDate() - (i * 7));
        wStart.setHours(0, 0, 0, 0); wEnd.setHours(23, 59, 59, 999);

        const wDeals = deals.filter(d => inRange(parseDate(d.cdate), wStart, wEnd));

        // MM4s for THIS specific week
        const prevStart = new Date(wStart); prevStart.setDate(wStart.getDate() - 28);
        const prevEnd = new Date(wStart); prevEnd.setMilliseconds(-1);
        const prevDeals = deals.filter(d => inRange(parseDate(d.cdate), prevStart, prevEnd));

        weeklyVolume.push({
            week: `${wStart.getDate()} ${["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"][wStart.getMonth()]}`,
            mql: wDeals.length,
            mm4s: prevDeals.length / 4
        });
    }

    // monthlyRates (12 months fixed)
    const monthlyRates = [];
    for (let i = 11; i >= 0; i--) {
        const mDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const nextM = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
        const mEnd = new Date(nextM.getTime() - 1);

        const mDeals = deals.filter(d => inRange(parseDate(d.cdate), mDate, mEnd));
        const mAgend = mDeals.filter(d => d._cf[F_AGEND_1]).length;
        const mReun = mDeals.filter(d => {
            const val = (d._cf[F_COMO_REUNIAO] || "").toLowerCase();
            return val !== "" && val !== "não teve reunião";
        }).length;

        monthlyRates.push({
            month: `${["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"][mDate.getMonth()]}/${String(mDate.getFullYear()).slice(2)}`,
            comparecimento: mAgend > 0 ? (mReun / mAgend) * 100 : 0,
            agendamento: mDeals.length > 0 ? (mAgend / mDeals.length) * 100 : 0,
            isCurrent: i === 0
        });
    }

    // Loss Reasons
    const nonEngagedMotive = "Não fez reunião com a SDR";
    const lostDealsAll = deals.filter(d => d.status === "2" || d.status === "lost");
    const lostDealsInPeriod = dealsInPeriod.filter(d => (d.status === "2" || d.status === "lost") && d._cf[F_MOTIVO_PERDA] !== nonEngagedMotive);

    const notEngagedCount = dealsInPeriod.filter(d => (d.status === "2" || d.status === "lost") && d._cf[F_MOTIVO_PERDA] === nonEngagedMotive).length;

    const getLossStats = (dealsList: Deal[]) => {
        const counts: Record<string, number> = {};
        dealsList.forEach(d => {
            const m = d._cf[F_MOTIVO_PERDA] || "Outros";
            counts[m] = (counts[m] || 0) + 1;
        });
        const total = dealsList.length || 1;
        return Object.entries(counts).map(([motivo, n]) => ({ motivo, pct: (n / total) * 100 }));
    };

    const periodLoss = getLossStats(lostDealsInPeriod);
    const histLoss = getLossStats(lostDealsAll.filter(d => d._cf[F_MOTIVO_PERDA] !== nonEngagedMotive));

    const lossReasons = periodLoss.sort((a, b) => b.pct - a.pct).slice(0, 8).map(p => {
        const h = histLoss.find(x => x.motivo === p.motivo)?.pct || 0;
        return {
            motivo: p.motivo,
            periodoPct: p.pct,
            historicoPct: h,
            delta: p.pct - h
        };
    });

    // Alerts
    const alerts: { level: "red" | "orange"; message: string }[] = [];
    if (taxaComp !== null) {
        if (taxaComp < 35) alerts.push({ level: "red", message: "Alta taxa de no-show SDR — revisar processo de confirmação de agendamentos" });
        else if (taxaComp < 45) alerts.push({ level: "orange", message: "Taxa de comparecimento abaixo do esperado no período" });
    }
    if (taxaQual !== null && taxaQual < 25) alerts.push({ level: "orange", message: "Taxa de qualificação baixa — verificar perfil dos leads e critérios da SDR" });

    // Weekly checks for 0 cases
    const weekDeals = deals.filter(d => inRange(parseDate(d.cdate), currentMon, now));
    const weekComoFEita = weekDeals.filter(d => d._cf[F_COMO_REUNIAO]).length;
    if (weekComoFEita === 0 && weekDeals.length > 0) alerts.push({ level: "orange", message: "Campo de modalidade de reunião não preenchido esta semana — dado de comparecimento incompleto" });

    const weekQual = weekDeals.filter(d => d._cf[F_QUAL_SQL] === "Sim").length;
    if (weekQual === 0 && weekDeals.length > 0) alerts.push({ level: "orange", message: "Nenhuma qualificação registrada esta semana" });

    if (taxaAgendCloser !== null && taxaAgendCloser < 35) alerts.push({ level: "orange", message: "Maioria dos leads qualificados sem reunião Closer agendada" });

    return {
        mqlThisWeek: deals.filter(d => inRange(parseDate(d.cdate), currentMon, now)).length,
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
