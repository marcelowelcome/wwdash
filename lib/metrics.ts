import { type Deal, type Status } from "./schemas";
import { parseDate, daysSince, weekKey, inRange, daysAgo } from "./utils";
import { TRAINING_MOTIVE, buildWeekLabel } from "./supabase-api";

// ─── METRICS COMPUTATION ───────────────────────────────────────────────────────
/**
 * Pure function that derives all dashboard metrics from raw AC deal data.
 * Does not perform any side effects or API calls.
 */
export function computeMetrics(
    rawSdrDeals: Deal[],
    rawCloserDeals: Deal[],
    rawWonDeals: Deal[],
    fieldMap: Record<string, string>,
    stageMap: Record<string, string>
) {
    // ── STRICT PIPELINE ISOLATION ──
    const sdrDeals = rawSdrDeals.filter(d => d.group_id === "1");
    // Closer uses group_id 8.
    const closerDeals = rawCloserDeals.filter(d => d.group_id === "8");
    const wonDeals = rawWonDeals.filter(d => d.group_id === "8");

    const today = new Date();
    const FQ =
        fieldMap["Motivos de qualificação SDR"] ||
        fieldMap["Motivo de qualificação SDR"];
    const FL =
        fieldMap["[WW] [Closer] Motivo de Perda"] ||
        fieldMap["Motivo de Perda"];
    const FD = fieldMap["Motivo Desqualificação SDR"];

    // Exclude training/mock deals from the Closer pipeline
    const closer = closerDeals.filter(
        (d) => (d._cf[FQ] || "") !== TRAINING_MOTIVE
    );

    // ── SDR WEEKLY HISTORY & VOLUME TREND ───────────────────────────────────────
    // Current week = last complete Mon–Sun
    const todayDay = today.getDay();
    const lastSunday = new Date(today);
    lastSunday.setDate(today.getDate() - ((todayDay + 1) % 7) - 1);
    const lastMonday = new Date(lastSunday);
    lastMonday.setDate(lastSunday.getDate() - 6);
    lastMonday.setHours(0, 0, 0, 0);
    lastSunday.setHours(23, 59, 59, 999);

    const weekCounts: Record<string, { received: number, engaged: number, qualified: number }> = {};
    sdrDeals.forEach((d) => {
        const k = weekKey(d.cdate);
        if (!weekCounts[k]) weekCounts[k] = { received: 0, engaged: 0, qualified: 0 };
        weekCounts[k].received++;
        if (d.stage !== "StandBy") {
            weekCounts[k].engaged++;
        }
    });
    closer.forEach(d => {
        const k = weekKey(d.cdate); // using creation date of the closer deal
        if (weekCounts[k]) {
            weekCounts[k].qualified++;
        }
    });

    const sdrWeeksKeys = Object.keys(weekCounts).sort();
    const sdrWeeklyHistory = sdrWeeksKeys
        .slice(-12)
        .map((k) => {
            const data = weekCounts[k];
            const qualRate = data.received > 0 ? (data.qualified / data.received) * 100 : 0;
            return {
                week: buildWeekLabel(k),
                leads: data.received,
                engaged: data.engaged,
                qualRate: parseFloat(qualRate.toFixed(1)),
            };
        });

    const sdrThisWeek = sdrDeals.filter((d) =>
        inRange(parseDate(d.cdate), lastMonday, lastSunday)
    ).length;

    const prev4weeks = sdrDeals.filter((d) => {
        const cd = parseDate(d.cdate);
        const from = daysAgo(56);
        const to = new Date(lastMonday);
        to.setDate(to.getDate() - 1);
        return inRange(cd, from, to);
    });

    const weeklyVols: Record<string, number> = {};
    prev4weeks.forEach((d) => {
        const k = weekKey(d.cdate);
        weeklyVols[k] = (weeklyVols[k] || 0) + 1;
    });

    const prev4arr = Object.values(weeklyVols).slice(-4);
    const sdrAvg4 = prev4arr.length
        ? prev4arr.reduce((a, b) => a + b, 0) / prev4arr.length
        : 0;
    const sdrVsAvg = sdrAvg4 ? (sdrThisWeek / sdrAvg4) * 100 : 0;
    const sdrStatus: Status =
        sdrVsAvg >= 80 ? "green" : sdrVsAvg >= 60 ? "orange" : "red";

    const closerThisWeek = closer.filter((d) =>
        inRange(parseDate(d.cdate), lastMonday, lastSunday)
    ).length;

    const qualRate = sdrThisWeek > 0 ? (closerThisWeek / sdrThisWeek) * 100 : 0;
    const qualStatus: Status =
        qualRate < 8 || qualRate > 20 ? "red" : qualRate >= 10 ? "green" : "orange";

    // ── SDR FUNNEL (ALL TIME) ───────────────────────────────────────────────────
    const sdrReceived = sdrDeals.length;
    const sdrEngagedDeals = sdrDeals.filter(d => d.stage !== "StandBy");
    const sdrEngagedCount = sdrEngagedDeals.length;
    const sdrDecidedDeals = sdrEngagedDeals.filter(d => d.status !== "1"); // not Open
    const sdrDecidedCount = sdrDecidedDeals.length;
    let taxaLost = 0;
    sdrDecidedDeals.forEach(d => {
        if (d.status === "2") {
            const m = (FD ? d._cf[FD] : "").trim().toLowerCase();
            if (m.includes("taxa") || m.includes("orçamento não condiz") || m.includes("não passou orçamento") || m.includes("15 convidados") || m.includes("pagar a viagem")) {
                taxaLost++;
            }
        }
    });
    const sdrPassedTaxa = sdrDecidedCount - taxaLost;
    const sdrQualified = closerDeals.length; // all deals that entered the Closer pipeline

    const sdrFunnel = {
        received: sdrReceived,
        engaged: sdrEngagedCount,
        decided: sdrDecidedCount,
        passedTaxa: sdrPassedTaxa,
        qualified: sdrQualified,
        engagedPct: sdrReceived > 0 ? (sdrEngagedCount / sdrReceived) * 100 : 0,
        decidedPct: sdrEngagedCount > 0 ? (sdrDecidedCount / sdrEngagedCount) * 100 : 0,
        passedTaxaPct: sdrDecidedCount > 0 ? (sdrPassedTaxa / sdrDecidedCount) * 100 : 0,
        qualifiedPctFromReceived: sdrReceived > 0 ? (sdrQualified / sdrReceived) * 100 : 0,
    };


    // ── CLOSER HELPER: Deal Resolution ──────────────────────────────────────────
    // A deal is only officially Won if it has data_fechamento.
    // If it is marked as Won (0) but has no data_fechamento, we treat it as Open (1).
    const getCloserStatus = (d: Deal) => {
        if (d.status === "0" && !d.data_fechamento) {
            return "1"; // Treat as Open
        }
        return d.status;
    };

    // ── CLOSER 4-WEEK ROLLING CONVERSION ───────────────────────────────────────
    const mm4s = daysAgo(28);
    const mm4e = today;
    const mm4prev_s = daysAgo(56);
    const mm4prev_e = daysAgo(28);

    const wonInPeriod = (s: Date, e: Date) =>
        closer.filter((d) => {
            const md = parseDate(d.mdate || d.cdate);
            return getCloserStatus(d) === "0" && inRange(md, s, e);
        });

    const lostInPeriod = (s: Date, e: Date) =>
        closer.filter((d) => {
            const md = parseDate(d.mdate || d.cdate);
            return getCloserStatus(d) === "2" && inRange(md, s, e);
        });

    const won_curr = wonInPeriod(mm4s, mm4e);
    const lost_curr = lostInPeriod(mm4s, mm4e);
    const open_curr = closer.filter((d) => {
        const cd = parseDate(d.cdate);
        return getCloserStatus(d) === "1" && inRange(cd, mm4s, mm4e);
    });

    const conv_curr =
        won_curr.length + lost_curr.length > 0
            ? (won_curr.length / (won_curr.length + lost_curr.length)) * 100
            : 0;

    const won_prev = wonInPeriod(mm4prev_s, mm4prev_e);
    const lost_prev = lostInPeriod(mm4prev_s, mm4prev_e);
    const conv_prev =
        won_prev.length + lost_prev.length > 0
            ? (won_prev.length / (won_prev.length + lost_prev.length)) * 100
            : 0;

    const convStatus: Status =
        conv_curr < 20 ? "red" : conv_curr < 25 ? "orange" : "green";

    // ── HISTORICAL BENCHMARK ────────────────────────────────────────────────────
    const allDecided = closer.filter(
        (d) => getCloserStatus(d) === "0" || getCloserStatus(d) === "2"
    );
    const allWon = closer.filter((d) => getCloserStatus(d) === "0");
    const histRate =
        allDecided.length > 0 ? (allWon.length / allDecided.length) * 100 : 0;

    // ── VELOCITY ────────────────────────────────────────────────────────────────
    const enteredMM4 = closer.filter((d) =>
        inRange(parseDate(d.cdate), mm4s, mm4e)
    );
    const decidedMM4 = enteredMM4.filter((d) => getCloserStatus(d) !== "1");
    const velocity =
        enteredMM4.length > 0
            ? (decidedMM4.length / enteredMM4.length) * 100
            : 0;

    // ── ROLLING 4-WEEK WINDOWS ──────────────────────────────────────────────────
    const rollingWindows = [
        { label: "MM1", s: daysAgo(112), e: daysAgo(84) },
        { label: "MM2", s: daysAgo(84), e: daysAgo(56) },
        { label: "MM3", s: daysAgo(56), e: daysAgo(28) },
        { label: "MM4", s: daysAgo(28), e: today },
    ];

    const convTrend = rollingWindows.map((w) => {
        const w_won = wonInPeriod(w.s, w.e);
        const w_lost = lostInPeriod(w.s, w.e);
        const rate =
            w_won.length + w_lost.length > 0
                ? (w_won.length / (w_won.length + w_lost.length)) * 100
                : 0;
        const label = `${w.s.getDate()}/${w.s.getMonth() + 1}–${w.e.getDate()}/${w.e.getMonth() + 1}`;
        return {
            periodo: label,
            taxa: parseFloat(rate.toFixed(1)),
            won: w_won.length,
            lost: w_lost.length,
        };
    });

    // ── LOSS REASONS ────────────────────────────────────────────────────────────
    const lossMap: Record<string, number> = {};
    lost_curr.forEach((d) => {
        const m = (d._cf[FL] || "Não informado").trim();
        lossMap[m] = (lossMap[m] || 0) + 1;
    });

    const lossReasons = Object.entries(lossMap)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 8)
        .map(([motivo, n]) => ({
            motivo: motivo.length > 25 ? motivo.slice(0, 23) + "…" : motivo,
            n,
            pct: parseFloat(((n / (lost_curr.length || 1)) * 100).toFixed(1)),
        }));

    // ── PIPELINE ACTIVE ─────────────────────────────────────────────────────────
    const openDeals = closer.filter((d) => getCloserStatus(d) === "1");
    const pipeByAge = [
        {
            label: "0–14 dias",
            n: openDeals.filter((d) => daysSince(parseDate(d.cdate)) <= 14).length,
            status: "green" as Status,
        },
        {
            label: "15–30 dias",
            n: openDeals.filter((d) => {
                const a = daysSince(parseDate(d.cdate));
                return a > 14 && a <= 30;
            }).length,
            status: "orange" as Status,
        },
        {
            label: "31–60 dias",
            n: openDeals.filter((d) => {
                const a = daysSince(parseDate(d.cdate));
                return a > 30 && a <= 60;
            }).length,
            status: "red" as Status,
        },
        {
            label: "60+ dias",
            n: openDeals.filter((d) => daysSince(parseDate(d.cdate)) > 60).length,
            status: "red" as Status,
        },
    ];

    const stageCount: Record<string, number> = {};
    openDeals.forEach((d) => {
        const name = stageMap[d.stage] || `Stage ${d.stage}`;
        stageCount[name] = (stageCount[name] || 0) + 1;
    });
    const pipeByStage = Object.entries(stageCount)
        .sort(([, a], [, b]) => b - a)
        .map(([stage, n]) => ({ stage, n }));

    // ── COHORT ANALYSIS ─────────────────────────────────────────────────────────
    const cohortCurr = closer.filter((d) =>
        inRange(parseDate(d.cdate), daysAgo(28), daysAgo(14))
    );
    const cohortPrev = closer.filter((d) =>
        inRange(parseDate(d.cdate), daysAgo(45), daysAgo(28))
    );

    const cohortStats = (cohort: Deal[]) => ({
        total: cohort.length,
        won: cohort.filter((d) => getCloserStatus(d) === "0").length,
        lost: cohort.filter((d) => getCloserStatus(d) === "2").length,
        open: cohort.filter((d) => getCloserStatus(d) === "1").length,
        rate: 0,
    });

    const coh1 = cohortStats(cohortCurr);
    const coh2 = cohortStats(cohortPrev);
    coh1.rate =
        coh1.won + coh1.lost > 0
            ? (coh1.won / (coh1.won + coh1.lost)) * 100
            : 0;
    coh2.rate =
        coh2.won + coh2.lost > 0
            ? (coh2.won / (coh2.won + coh2.lost)) * 100
            : 0;

    // ── SDR QUAL WEEKS TREND ────────────────────────────────────────────────────
    const sdrQualTrend = sdrWeeklyHistory.slice(-5).map((sw) => ({
        week: sw.week,
        qualRate: sw.qualRate
    }));

    const staleDealsPct =
        openDeals.filter((d) => daysSince(parseDate(d.cdate)) > 60).length /
        (openDeals.length || 1);

    // ── ACTIVE ALERTS ───────────────────────────────────────────────────────────
    const activeAlerts: { type: Status; message: string; action?: string }[] = [];
    const leadFakeCount = lost_curr.filter(d => (d._cf[FL] || "").toLowerCase().includes("lead fake")).length;
    const leadFakePct = lost_curr.length > 0 ? (leadFakeCount / lost_curr.length) * 100 : 0;

    if (leadFakePct >= 15) {
        activeAlerts.push({
            type: "red",
            message: `Lead Fake: ${leadFakeCount} casos no período — ${leadFakePct.toFixed(0)}% das perdas.`,
            action: "Verificar fonte dos leads."
        });
    }

    if (qualRate < 8) {
        activeAlerts.push({
            type: "orange",
            message: `Taxa de qualificação SDR abaixo de 8% no período atual.`,
            action: "Avaliar abordagem do SDR."
        });
    }

    // Contratos parados > 14 dias
    const sentContractsList = openDeals.filter(d => {
        const stageLabel = (stageMap[d.stage] || d.stage).toLowerCase();
        return stageLabel.includes("contrato");
    });
    const contratosParados = sentContractsList.filter(d => daysSince(parseDate(d.mdate || d.cdate)) > 14).length;
    const sentContractsCount = sentContractsList.length;

    if (contratosParados > 0) {
        activeAlerts.push({
            type: "orange",
            message: `${contratosParados} contratos enviados há mais de 14 dias sem retorno.`,
            action: "Acionar follow-up."
        });
    }

    if (activeAlerts.length === 0) {
        activeAlerts.push({
            type: "green",
            message: "Nenhum alerta crítico ativo hoje. Funil operando dentro dos parâmetros normais."
        });
    }

    // ── WEDDINGS IN PLANNING ────────────────────────────────────────────────────
    const planActiveCount = wonDeals.filter(d => d.status !== "2").length;
    const planCancelledCount = wonDeals.filter(d => d.status === "2").length;

    // ── SDR LOSS / DISQUALIFICATION REASONS ─────────────────────────────────────────
    const sdrLostDeals = sdrDeals.filter(d => d.status === "2");
    const sdrLossMap: Record<string, number> = {};
    sdrLostDeals.forEach(d => {
        const reason = (FD ? d._cf[FD] : "") || "Não informado";
        const trimmed = reason.trim();
        if (trimmed) {
            sdrLossMap[trimmed] = (sdrLossMap[trimmed] || 0) + 1;
        }
    });
    const sdrLossReasons = Object.entries(sdrLossMap)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 8)
        .map(([motivo, n]) => ({
            motivo: motivo.length > 25 ? motivo.slice(0, 23) + "…" : motivo,
            n,
            pct: parseFloat(((n / (sdrLostDeals.length || 1)) * 100).toFixed(1)),
        }));

    // ── SDR NO-SHOW RATE ────────────────────────────────────────────────────
    const sdrWithMeeting = sdrDeals.filter(d => d.data_reuniao_1);
    const sdrNoShowCount = sdrWithMeeting.filter(d => {
        const meetingDate = parseDate(d.data_reuniao_1 || "");
        return meetingDate && d.status === "2" && daysSince(meetingDate) > 0;
    }).length;
    const sdrNoShowRate = sdrWithMeeting.length > 0
        ? parseFloat(((sdrNoShowCount / sdrWithMeeting.length) * 100).toFixed(1))
        : 0;

    // ── CLOSER DEALS BY DESTINATION ─────────────────────────────────────────
    const destMap: Record<string, { total: number; won: number; lost: number; open: number }> = {};
    closer.forEach(d => {
        const dest = (d.destino || "Não informado").trim();
        if (!destMap[dest]) destMap[dest] = { total: 0, won: 0, lost: 0, open: 0 };
        destMap[dest].total++;
        const st = getCloserStatus(d);
        if (st === "0") destMap[dest].won++;
        else if (st === "2") destMap[dest].lost++;
        else destMap[dest].open++;
    });
    const dealsByDestination = Object.entries(destMap)
        .sort(([, a], [, b]) => b.total - a.total)
        .slice(0, 10)
        .map(([destino, stats]) => ({
            destino: destino.length > 20 ? destino.slice(0, 18) + "…" : destino,
            ...stats,
            rate: stats.won + stats.lost > 0
                ? parseFloat(((stats.won / (stats.won + stats.lost)) * 100).toFixed(1))
                : 0,
        }));

    // ── SDR NEW LOSS PANELS ─────────────────────────────────────────────────
    // History Panel (all time minus non-engaged) vs Recent Panel (last 120 days)
    const histLostDeals = sdrDeals.filter(d => d.stage !== "StandBy" && d.status === "2");
    const threshold120 = daysAgo(120);
    const recentLostDeals = histLostDeals.filter(d => {
        const cd = parseDate(d.cdate);
        return cd ? cd >= threshold120 : false;
    });

    const getLossRanking = (deals: Deal[]) => {
        const map: Record<string, number> = {};
        deals.forEach(d => {
            const m = (FD ? d._cf[FD] : "").trim() || "Outros";
            const norm = m.toLowerCase().includes("taxa") ? "Taxa de Serviço" :
                m.toLowerCase().includes("fake") ? "Lead Fake" :
                    m.toLowerCase().includes("interesse") ? "Sem Interesse" :
                        m.toLowerCase().includes("informações") ? "Informações Erradas" :
                            m.toLowerCase().includes("nc com closer") ? "NC com Closer" :
                                m.toLowerCase().includes("duplicado") ? "Lead Duplicado" :
                                    m.toLowerCase().includes("destino") ? "Quer destino" : "Outros";
            map[norm] = (map[norm] || 0) + 1;
        });
        const total = deals.length || 1;
        return Object.entries(map)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 6)
            .map(([motivo, n]) => ({
                motivo,
                n,
                pct: parseFloat(((n / total) * 100).toFixed(1)),
            }));
    };

    const sdrLossPanels = {
        histLoss: getLossRanking(histLostDeals),
        recentLoss: getLossRanking(recentLostDeals),
    };

    // ── SDR TAXA DE SERVIÇO MONTHLY TREND ───────────────────────────────────
    const monthStats: Record<string, { lostTotal: number, taxaTotal: number }> = {};
    histLostDeals.forEach(d => {
        const cd = parseDate(d.cdate);
        if (!cd) return;
        const mKey = `${cd.getFullYear()}-${String(cd.getMonth() + 1).padStart(2, "0")}`;
        if (!monthStats[mKey]) monthStats[mKey] = { lostTotal: 0, taxaTotal: 0 };
        monthStats[mKey].lostTotal++;
        const m = (FD ? d._cf[FD] : "").trim().toLowerCase();
        if (m.includes("taxa")) {
            monthStats[mKey].taxaTotal++;
        }
    });
    const sdrTaxaTrend = Object.keys(monthStats)
        .sort()
        .slice(-8)
        .map(k => {
            const data = monthStats[k];
            const [y, m] = k.split("-");
            const mapMonths = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
            return {
                month: `${mapMonths[parseInt(m, 10) - 1]}/${y.slice(2)}`,
                rate: data.lostTotal > 0 ? parseFloat(((data.taxaTotal / data.lostTotal) * 100).toFixed(1)) : 0,
            };
        });

    return {
        sdrThisWeek,
        sdrAvg4: parseFloat(sdrAvg4.toFixed(1)),
        sdrVsAvg: parseFloat(sdrVsAvg.toFixed(1)),
        sdrStatus,
        sdrWeeklyHistory,
        sdrFunnel,
        qualRate: parseFloat(qualRate.toFixed(1)),
        qualStatus,
        sdrQualTrend,
        sdrLossReasons, // kept for backward compatibility if used elsewhere, but ideally remove if not needed
        sdrLossPanels,
        sdrTaxaTrend,
        sdrNoShowRate,
        sdrNoShowCount,
        sdrWithMeetingCount: sdrWithMeeting.length,
        closerThisWeek: closerThisWeek,
        conv_curr: parseFloat(conv_curr.toFixed(1)),
        conv_prev: parseFloat(conv_prev.toFixed(1)),
        convStatus,
        convTrend,
        histRate: parseFloat(histRate.toFixed(1)),
        velocity: parseFloat(velocity.toFixed(1)),
        velocityStatus: (velocity < 60 ? "red" : velocity < 80 ? "orange" : "green") as Status,
        won_curr: won_curr.length,
        lost_curr: lost_curr.length,
        open_curr: open_curr.length,
        enteredMM4: enteredMM4.length,
        lossReasons,
        openDeals: openDeals.length,
        sentContractsCount,
        planActiveCount,
        planCancelledCount,
        pipeByAge,
        pipeByStage,
        coh1,
        coh2,
        pipelineStatus: (staleDealsPct > 0.3 ? "red" : "orange") as Status,
        activeAlerts,
        dealsByDestination,
    };
}

export type Metrics = ReturnType<typeof computeMetrics>;
