import { type Deal, type Status } from "./schemas";
import { parseDate, daysSince, weekKey, inRange, daysAgo } from "./utils";
import { TRAINING_MOTIVE, buildWeekLabel } from "./supabase-api";

// ─── METRICS COMPUTATION ───────────────────────────────────────────────────────
/**
 * Pure function that derives all dashboard metrics from raw AC deal data.
 * Does not perform any side effects or API calls.
 */
export function computeMetrics(
    sdrDeals: Deal[],
    closerDeals: Deal[],
    fieldMap: Record<string, string>,
    stageMap: Record<string, string>
) {
    const today = new Date();
    const FQ =
        fieldMap["Motivos de qualificação SDR"] ||
        fieldMap["Motivo de qualificação SDR"];
    const FL =
        fieldMap["[WW] [Closer] Motivo de Perda"] ||
        fieldMap["Motivo de Perda"];

    // Exclude training/mock deals from the Closer pipeline
    const closer = closerDeals.filter(
        (d) => (d._cf[FQ] || "") !== TRAINING_MOTIVE
    );

    // ── SDR VOLUME TREND ────────────────────────────────────────────────────────
    const weekCounts: Record<string, number> = {};
    sdrDeals.forEach((d) => {
        const k = weekKey(d.cdate);
        weekCounts[k] = (weekCounts[k] || 0) + 1;
    });

    const sdrWeeks = Object.entries(weekCounts)
        .sort(([a], [b]) => a.localeCompare(b))
        .slice(-9)
        .map(([k, n]) => ({ week: buildWeekLabel(k), leads: n, key: k }));

    // Current week = last complete Mon–Sun
    const todayDay = today.getDay();
    const lastSunday = new Date(today);
    lastSunday.setDate(today.getDate() - ((todayDay + 1) % 7) - 1);
    const lastMonday = new Date(lastSunday);
    lastMonday.setDate(lastSunday.getDate() - 6);
    lastMonday.setHours(0, 0, 0, 0);
    lastSunday.setHours(23, 59, 59, 999);

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

    // ── SDR QUALIFICATION RATE ──────────────────────────────────────────────────
    const closerThisWeek = closer.filter((d) =>
        inRange(parseDate(d.cdate), lastMonday, lastSunday)
    ).length;
    const qualRate = sdrThisWeek > 0 ? (closerThisWeek / sdrThisWeek) * 100 : 0;
    const qualStatus: Status =
        qualRate < 8 || qualRate > 20 ? "red" : qualRate >= 10 ? "green" : "orange";

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
    const sdrQualTrend = sdrWeeks.slice(-5).map((sw) => {
        const wStart = new Date(sw.key);
        const wEnd = new Date(sw.key);
        wEnd.setDate(wEnd.getDate() + 7);
        const closerInWeek = closer.filter((d) =>
            inRange(parseDate(d.cdate), wStart, wEnd)
        ).length;
        const taxa =
            sw.leads > 0 ? parseFloat(((closerInWeek / sw.leads) * 100).toFixed(1)) : 0;
        return { week: sw.week, taxa };
    });

    const staleDealsPct =
        openDeals.filter((d) => daysSince(parseDate(d.cdate)) > 60).length /
        (openDeals.length || 1);

    return {
        sdrThisWeek,
        sdrAvg4: parseFloat(sdrAvg4.toFixed(1)),
        sdrVsAvg: parseFloat(sdrVsAvg.toFixed(1)),
        sdrStatus,
        sdrWeeks,
        qualRate: parseFloat(qualRate.toFixed(1)),
        qualStatus,
        sdrQualTrend,
        closerThisWeek,
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
        pipeByAge,
        pipeByStage,
        coh1,
        coh2,
        pipelineStatus: (staleDealsPct > 0.3 ? "red" : "orange") as Status,
    };
}

export type Metrics = ReturnType<typeof computeMetrics>;
