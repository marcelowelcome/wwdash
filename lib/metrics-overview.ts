import { type Deal, type Status } from "./schemas";
import { parseDate, daysSince, weekKey, inRange, daysAgo } from "./utils";
import { TRAINING_MOTIVE, buildWeekLabel, CLOSER_GROUP_ID } from "./supabase-api";

// ─── OVERVIEW METRICS ─────────────────────────────────────────────────────────

export function computeOverviewMetrics(
    rawSdrDeals: Deal[],
    rawCloserDeals: Deal[],
    rawWonDeals: Deal[],
    fieldMap: Record<string, string>,
    stageMap: Record<string, string>,
    periodStart: Date,
    periodEnd: Date
) {
    const today = new Date();

    // ── PIPELINE ISOLATION ────────────────────────────────────────────────────
    const sdrDeals = rawSdrDeals.filter(d => d.group_id === "1");
    const closerBase = rawCloserDeals.filter(d => d.group_id === CLOSER_GROUP_ID);
    const closerDeals = closerBase.filter(d =>
        (d._cf[fieldMap["Motivos de qualificação SDR"] || ""] || "") !== TRAINING_MOTIVE
    );

    const closer = [...closerDeals];
    rawWonDeals.forEach((wd: Deal) => {
        const isTraining = (wd._cf[fieldMap["Motivos de qualificação SDR"] || ""] || "") === TRAINING_MOTIVE;
        if (!isTraining && !closer.some(cd => cd.id === wd.id)) {
            closer.push(wd);
        }
    });
    const wonDeals = rawWonDeals;

    const FQ = fieldMap["Motivos de qualificação SDR"] || fieldMap["Motivo de qualificação SDR"];
    const FL = fieldMap["[WW] [Closer] Motivo de Perda"] || fieldMap["Motivo de Perda"];
    const FD = fieldMap["Motivo Desqualificação SDR"];

    // ── CLOSER HELPER ─────────────────────────────────────────────────────────
    const getCloserStatus = (d: Deal) => {
        if (d.status === "0" && !d.data_fechamento) return "1";
        return d.status;
    };

    const getPerformanceDate = (d: Deal) => {
        if (d.data_fechamento) return parseDate(d.data_fechamento);
        return parseDate(d.mdate || d.cdate);
    };

    // ── SDR: FILTER BY PERIOD ─────────────────────────────────────────────────
    const sdrInPeriod = sdrDeals.filter(d => {
        const cd = parseDate(d.cdate);
        return cd && inRange(cd, periodStart, periodEnd);
    });

    const sdrLeads = sdrInPeriod.length;

    // Weekly history — show all weeks available, filtered by period
    const weekCounts: Record<string, { received: number; engaged: number; qualified: number }> = {};
    sdrInPeriod.forEach(d => {
        const k = weekKey(d.cdate);
        if (!weekCounts[k]) weekCounts[k] = { received: 0, engaged: 0, qualified: 0 };
        weekCounts[k].received++;
        if (d.stage !== "StandBy") weekCounts[k].engaged++;
    });
    closer.forEach(d => {
        const cd = parseDate(d.cdate);
        if (!cd || !inRange(cd, periodStart, periodEnd)) return;
        const k = weekKey(d.cdate);
        if (weekCounts[k]) weekCounts[k].qualified++;
    });

    const sdrWeeksKeys = Object.keys(weekCounts).sort();
    const sdrWeeklyHistory = sdrWeeksKeys.map(k => {
        const data = weekCounts[k];
        const qualRate = data.received > 0 ? (data.qualified / data.received) * 100 : 0;
        return {
            week: buildWeekLabel(k),
            leads: data.received,
            engaged: data.engaged,
            qualified: data.qualified,
            qualRate: parseFloat(qualRate.toFixed(1)),
        };
    });

    // Current week data (last entry in history)
    const currentWeekData = sdrWeeklyHistory[sdrWeeklyHistory.length - 1] || { leads: 0, qualRate: 0 };
    const qualRate = currentWeekData.qualRate;

    // Average per week in the period
    const sdrAvgPerWeek = sdrWeeklyHistory.length > 0
        ? sdrWeeklyHistory.reduce((sum, w) => sum + w.leads, 0) / sdrWeeklyHistory.length
        : 0;

    const sdrStatus: Status =
        sdrLeads === 0 ? "red" :
            sdrWeeklyHistory.length >= 2
                ? (currentWeekData.leads / sdrAvgPerWeek >= 0.8 ? "green" : currentWeekData.leads / sdrAvgPerWeek >= 0.6 ? "orange" : "red")
                : "green";

    // ── CLOSER CONVERSION IN PERIOD ───────────────────────────────────────────
    const wonInPeriod = closer.filter(d => {
        const date = getPerformanceDate(d);
        return getCloserStatus(d) === "0" && date && inRange(date, periodStart, periodEnd);
    });
    const lostInPeriod = closer.filter(d => {
        const date = getPerformanceDate(d);
        return getCloserStatus(d) === "2" && date && inRange(date, periodStart, periodEnd);
    });

    const conv_curr = wonInPeriod.length + lostInPeriod.length > 0
        ? (wonInPeriod.length / (wonInPeriod.length + lostInPeriod.length)) * 100
        : 0;

    const convStatus: Status = conv_curr < 20 ? "red" : conv_curr < 25 ? "orange" : "green";

    // Historical benchmark (all-time)
    const allDecided = closer.filter(d => getCloserStatus(d) === "0" || getCloserStatus(d) === "2");
    const allWon = closer.filter(d => getCloserStatus(d) === "0");
    const histRate = allDecided.length > 0 ? (allWon.length / allDecided.length) * 100 : 0;

    // ── CONVERSION TREND (divide period into 4 equal windows) ──────────────
    const pe = periodEnd;
    const totalDays = Math.max(1, Math.round((periodEnd.getTime() - periodStart.getTime()) / 86400000));
    const windowSize = Math.max(7, Math.round(totalDays / 4));
    const windowCount = 4;

    const convTrend = Array.from({ length: windowCount }, (_, i) => {
        const offset = (windowCount - i) * windowSize;
        const prevOffset = offset - windowSize;
        const s = new Date(pe);
        s.setDate(pe.getDate() - offset);
        const e = new Date(pe);
        e.setDate(pe.getDate() - prevOffset);

        const w_won = closer.filter(d => {
            const date = getPerformanceDate(d);
            return getCloserStatus(d) === "0" && date && inRange(date, s, e);
        });
        const w_lost = closer.filter(d => {
            const date = getPerformanceDate(d);
            return getCloserStatus(d) === "2" && date && inRange(date, s, e);
        });
        const rate = w_won.length + w_lost.length > 0
            ? (w_won.length / (w_won.length + w_lost.length)) * 100
            : 0;
        const label = `${s.getDate()}/${s.getMonth() + 1}–${e.getDate()}/${e.getMonth() + 1}`;
        return {
            periodo: label,
            taxa: parseFloat(rate.toFixed(1)),
            won: w_won.length,
            lost: w_lost.length,
        };
    });

    // ── PIPELINE SNAPSHOT (current state, not period-dependent) ───────────────
    const openDeals = closerDeals.filter(d => getCloserStatus(d) === "1");

    const stageCount: Record<string, number> = {};
    openDeals.forEach(d => {
        const name = stageMap[d.stage] || `Stage ${d.stage}`;
        stageCount[name] = (stageCount[name] || 0) + 1;
    });
    const pipeByStage = Object.entries(stageCount)
        .sort(([, a], [, b]) => b - a)
        .map(([stage, n]) => ({ stage, n }));

    const sentContractsList = openDeals.filter(d => {
        const stageLabel = (stageMap[d.stage] || d.stage).toLowerCase();
        return stageLabel.includes("contrato");
    });
    const sentContractsCount = sentContractsList.length;

    const staleDealsPct = openDeals.filter(d => daysSince(parseDate(d.cdate)) > 60).length / (openDeals.length || 1);
    const pipelineStatus: Status = staleDealsPct > 0.3 ? "red" : "orange";

    // ── WEDDINGS IN PLANNING (current state) ──────────────────────────────────
    const planActiveCount = wonDeals.filter(d => d.status !== "2").length;
    const planCancelledCount = wonDeals.filter(d => d.status === "2").length;

    // ── ACTIVE ALERTS ─────────────────────────────────────────────────────────
    const activeAlerts: { type: Status; message: string; action?: string }[] = [];

    const leadFakeCount = lostInPeriod.filter(d => (d._cf[FL] || "").toLowerCase().includes("lead fake")).length;
    const leadFakePct = lostInPeriod.length > 0 ? (leadFakeCount / lostInPeriod.length) * 100 : 0;

    if (leadFakePct >= 15) {
        activeAlerts.push({
            type: "red",
            message: `Lead Fake: ${leadFakeCount} casos no periodo — ${leadFakePct.toFixed(0)}% das perdas.`,
            action: "Verificar fonte dos leads."
        });
    }

    if (qualRate < 8 && sdrWeeklyHistory.length > 0) {
        activeAlerts.push({
            type: "orange",
            message: `Taxa de qualificacao SDR abaixo de 8% no periodo atual.`,
            action: "Avaliar abordagem do SDR."
        });
    }

    const contratosParados = sentContractsList.filter(d => daysSince(parseDate(d.mdate || d.cdate)) > 14).length;
    if (contratosParados > 0) {
        activeAlerts.push({
            type: "orange",
            message: `${contratosParados} contratos enviados ha mais de 14 dias sem retorno.`,
            action: "Acionar follow-up."
        });
    }

    if (activeAlerts.length === 0) {
        activeAlerts.push({
            type: "green",
            message: "Nenhum alerta critico ativo hoje. Funil operando dentro dos parametros normais."
        });
    }

    return {
        sdrLeads,
        sdrAvgPerWeek: parseFloat(sdrAvgPerWeek.toFixed(1)),
        sdrStatus,
        sdrWeeklyHistory,
        qualRate: parseFloat(qualRate.toFixed(1)),
        conv_curr: parseFloat(conv_curr.toFixed(1)),
        convStatus,
        convTrend,
        histRate: parseFloat(histRate.toFixed(1)),
        wonCount: wonInPeriod.length,
        lostCount: lostInPeriod.length,
        openDeals: openDeals.length,
        sentContractsCount,
        pipelineStatus,
        planActiveCount,
        planCancelledCount,
        pipeByStage,
        activeAlerts,
    };
}

export type OverviewMetrics = ReturnType<typeof computeOverviewMetrics>;
