// Board endpoint — orchestration: composes deals + freshness + funnel × 4 windows + targets.
// See: docs/board-api-briefing.md (v1.2) sections 4 + 9.3 + 11.

import {
    isPartialPeriod,
    isWindowComplete,
    mtdRange,
    periodToUtcRange,
    previous4WeeksRanges,
    rolling30dRange,
    targetMonthFromEnd,
} from "./period";
import { kpiCaveatsFor, kpiHashFor } from "./constants";
import { fetchBoardDeals } from "./deals-fetcher";
import { averageWwWeeks, computeFunnelWw, computeRollingWw } from "./funnel-ww";
import { averageWtWeeks, computeFunnelWt, computeRollingWt } from "./funnel-wt";
import { getDataFreshness, isFailingFresh } from "./data-freshness";
import { fetchTargets } from "./targets";
import type {
    BoardDeal,
    BoardResponse,
    Brand,
    DataFreshness,
    FunnelWT,
    FunnelWW,
    UtcRange,
} from "./types";

// Computed orchestration error to be mapped by the route handler to 503/etc.
export class OrchestrationError extends Error {
    constructor(public code: "DATA_STALE" | "NO_SYNC_IN_PERIOD", message: string) {
        super(message);
        this.name = "OrchestrationError";
    }
}

export interface OrchestrationInput {
    brand: Brand;
    start: string; // YYYY-MM-DD
    end: string;
    now?: Date;
}

// Filter the broad fetch into a date-narrowed slice for a window.
// We don't strictly need to slice (computers are fast), but it keeps the
// per-window code clean and allows the funnel functions to assume "all rows
// touch this window in some way."
function narrowDeals(all: BoardDeal[], range: UtcRange): BoardDeal[] {
    const startMs = range.startUtc.getTime();
    const endMs = range.endUtc.getTime();
    return all.filter((d) => {
        const cols: Array<string | null> = [
            d.created_at,
            d.data_qualificado,
            d.data_closer,
            d.data_fechamento,
            d.sdr_wt_data_fechamento_taxa,
        ];
        return cols.some((iso) => {
            if (!iso) return false;
            const t = Date.parse(iso);
            if (Number.isNaN(t)) return false;
            return t >= startMs && t <= endMs;
        });
    });
}

export async function orchestrateBoard(input: OrchestrationInput): Promise<BoardResponse> {
    const { brand, start, end } = input;
    const now = input.now ?? new Date();

    const periodRange = periodToUtcRange(start, end);
    const isPartial = isPartialPeriod(end, now);

    // 1. Data freshness — single round trip
    const freshness: DataFreshness = await getDataFreshness(periodRange);

    // 503 DATA_STALE: AC last sync is older than BOARD_FAIL_HOURS
    if (isFailingFresh(freshness.ac_last_sync, now)) {
        const ageStr = freshness.ac_last_sync ?? "never";
        throw new OrchestrationError(
            "DATA_STALE",
            `AC last sync was at ${ageStr} (older than BOARD_FAIL_HOURS). Check sync-deals Edge Function.`
        );
    }

    // 503 NO_SYNC_IN_PERIOD: zero successful syncs covered the period
    if (freshness.syncs_in_period === 0) {
        throw new OrchestrationError(
            "NO_SYNC_IN_PERIOD",
            `No successful sync log found in [${start}, ${end}].`
        );
    }

    // 2. Determine the broadest fetch span: from previous-4w-start to end.
    const prev4w = previous4WeeksRanges(start);
    const earliestStart = prev4w[0].start;
    const broadestRange = periodToUtcRange(earliestStart, end);

    // 3. Fetch deals once (covers all windows including rolling_30d).
    //    rolling_30d ends at `end`; its start is end-29d. For weekly start (Mon),
    //    earliestStart = start-28d ≤ rolling_30d start in a Mon-Sun input. Safe.
    const allDeals = await fetchBoardDeals(brand, broadestRange);

    // 4. Compute 4 windows.
    const weeklyRange = periodRange;
    const mtd = mtdRange(end);
    const mtdRangeUtc = periodToUtcRange(mtd.start, mtd.end);
    const r30 = rolling30dRange(end);
    const r30RangeUtc = periodToUtcRange(r30.start, r30.end);

    const weeklyComplete = isWindowComplete(end, now);
    const mtdComplete = isWindowComplete(mtd.end, now); // same as weekly's `is_complete` but explicit
    const r30Complete = isWindowComplete(r30.end, now);

    // 5. Compute previous_4w_avg: 4 weeks (oldest → newest), excluding any
    //    week that did NOT have a successful sync covering it.
    const weekFreshness = await Promise.all(
        prev4w.map(async (wk) => {
            const wkRange = periodToUtcRange(wk.start, wk.end);
            const fresh = await getDataFreshness(wkRange);
            return { wk, included: fresh.syncs_in_period > 0 };
        })
    );

    if (brand === "ww") {
        return composeWw({
            allDeals,
            weeklyRange,
            mtdRangeUtc,
            r30RangeUtc,
            prev4wWindows: weekFreshness.map(({ wk, included }) => ({
                range: periodToUtcRange(wk.start, wk.end),
                included,
            })),
            isPartial,
            weeklyComplete,
            mtdComplete,
            r30Complete,
            brand,
            start,
            end,
            freshness,
            now,
        });
    }

    return composeWt({
        allDeals,
        weeklyRange,
        mtdRangeUtc,
        r30RangeUtc,
        prev4wWindows: weekFreshness.map(({ wk, included }) => ({
            range: periodToUtcRange(wk.start, wk.end),
            included,
        })),
        isPartial,
        weeklyComplete,
        mtdComplete,
        r30Complete,
        brand,
        start,
        end,
        freshness,
        now,
    });
}

interface ComposeArgs {
    allDeals: BoardDeal[];
    weeklyRange: UtcRange;
    mtdRangeUtc: UtcRange;
    r30RangeUtc: UtcRange;
    prev4wWindows: Array<{ range: UtcRange; included: boolean }>;
    isPartial: boolean;
    weeklyComplete: boolean;
    mtdComplete: boolean;
    r30Complete: boolean;
    brand: Brand;
    start: string;
    end: string;
    freshness: DataFreshness;
    now: Date;
}

async function composeWw(args: ComposeArgs): Promise<BoardResponse> {
    const { allDeals, weeklyRange, mtdRangeUtc, r30RangeUtc, prev4wWindows } = args;

    const weekly = computeFunnelWw({
        deals: narrowDeals(allDeals, weeklyRange),
        range: weeklyRange,
        isComplete: args.weeklyComplete,
    });

    const mtd = computeFunnelWw({
        deals: narrowDeals(allDeals, mtdRangeUtc),
        range: mtdRangeUtc,
        isComplete: args.mtdComplete,
    });

    const rolling = computeRollingWw({
        deals: narrowDeals(allDeals, r30RangeUtc),
        range: r30RangeUtc,
        isComplete: args.r30Complete,
    });

    const weeks: Array<FunnelWW | null> = prev4wWindows.map((w) =>
        w.included
            ? computeFunnelWw({
                  deals: narrowDeals(allDeals, w.range),
                  range: w.range,
                  isComplete: true,
              })
            : null
    );
    const previous_4w_avg = averageWwWeeks(weeks);

    const targets = await fetchTargets("ww", targetMonthFromEnd(args.end));

    return {
        meta: {
            version: "v1",
            kpi_definitions_hash: kpiHashFor("ww"),
            generated_at: new Date().toISOString(),
            period: { start: args.start, end: args.end, is_partial: args.isPartial },
            brand: "ww",
            data_freshness: args.freshness,
            kpi_caveats: kpiCaveatsFor("ww"),
        },
        funnel: { weekly, mtd, rolling_30d: rolling, previous_4w_avg },
        targets: targets as Extract<BoardResponse, { meta: { brand: "ww" } }>["targets"],
    };
}

async function composeWt(args: ComposeArgs): Promise<BoardResponse> {
    const { allDeals, weeklyRange, mtdRangeUtc, r30RangeUtc, prev4wWindows } = args;

    const weekly = computeFunnelWt({
        deals: narrowDeals(allDeals, weeklyRange),
        range: weeklyRange,
        isComplete: args.weeklyComplete,
    });

    const mtd = computeFunnelWt({
        deals: narrowDeals(allDeals, mtdRangeUtc),
        range: mtdRangeUtc,
        isComplete: args.mtdComplete,
    });

    const rolling = computeRollingWt({
        deals: narrowDeals(allDeals, r30RangeUtc),
        range: r30RangeUtc,
        isComplete: args.r30Complete,
    });

    const weeks: Array<FunnelWT | null> = prev4wWindows.map((w) =>
        w.included
            ? computeFunnelWt({
                  deals: narrowDeals(allDeals, w.range),
                  range: w.range,
                  isComplete: true,
              })
            : null
    );
    const previous_4w_avg = averageWtWeeks(weeks);

    const targets = await fetchTargets("wt", targetMonthFromEnd(args.end));

    return {
        meta: {
            version: "v1",
            kpi_definitions_hash: kpiHashFor("wt"),
            generated_at: new Date().toISOString(),
            period: { start: args.start, end: args.end, is_partial: args.isPartial },
            brand: "wt",
            data_freshness: args.freshness,
            kpi_caveats: kpiCaveatsFor("wt"),
        },
        funnel: { weekly, mtd, rolling_30d: rolling, previous_4w_avg },
        targets: targets as Extract<BoardResponse, { meta: { brand: "wt" } }>["targets"],
    };
}
