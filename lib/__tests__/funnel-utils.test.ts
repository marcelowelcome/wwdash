import { describe, it, expect, vi, afterEach } from "vitest";
import type { WonDeal, FunnelMetrics } from "../schemas";
import {
    isElopement,
    isInWwPipeline,
    isInWwLeadsPipeline,
    isInWwMqlPipeline,
    isInMonth,
    isCreatedInMonth,
    getMonthProgress,
    calcConversionRate,
    calcAchievement,
    calcShouldBe,
    calcFunnelCVR,
    formatCurrency,
    formatPercent,
    getMonthName,
    getMonthDateRange,
} from "../funnel-utils";

// ─── Minimal fixture helper ─────────────────────────────────────────────────

function deal(overrides: Partial<WonDeal> = {}): WonDeal {
    return {
        id: "1",
        cdate: "2025-06-01",
        status: "1",
        stage: "1",
        ...overrides,
    } as WonDeal;
}

// ─── isElopement ────────────────────────────────────────────────────────────

describe("isElopement", () => {
    it("returns true when is_elopement flag is true", () => {
        expect(isElopement(deal({ is_elopement: true }))).toBe(true);
    });

    it("returns false when is_elopement is false and no other signal", () => {
        expect(isElopement(deal({ is_elopement: false, title: "WD Test", pipeline: "Closer Weddings" }))).toBe(false);
    });

    it("returns true when title starts with 'EW'", () => {
        expect(isElopement(deal({ title: "EW - Casal Silva" }))).toBe(true);
    });

    it("returns true when pipeline is 'Elopment Wedding'", () => {
        expect(isElopement(deal({ pipeline: "Elopment Wedding" }))).toBe(true);
    });

    it("returns false for a regular wedding deal", () => {
        expect(isElopement(deal({ title: "WD - Casal", pipeline: "SDR Weddings" }))).toBe(false);
    });
});

// ─── isInWwPipeline ─────────────────────────────────────────────────────────

describe("isInWwPipeline", () => {
    it("matches by pipeline_id (1, 3, 4, 17, 31)", () => {
        expect(isInWwPipeline(deal({ pipeline_id: 1 }))).toBe(true);
        expect(isInWwPipeline(deal({ pipeline_id: 3 }))).toBe(true);
        expect(isInWwPipeline(deal({ pipeline_id: 4 }))).toBe(true);
        expect(isInWwPipeline(deal({ pipeline_id: 17 }))).toBe(true);
        expect(isInWwPipeline(deal({ pipeline_id: 31 }))).toBe(true);
    });

    it("matches by pipeline name", () => {
        expect(isInWwPipeline(deal({ pipeline: "SDR Weddings" }))).toBe(true);
        expect(isInWwPipeline(deal({ pipeline: "Closer Weddings" }))).toBe(true);
    });

    it("returns false for an unrelated pipeline", () => {
        expect(isInWwPipeline(deal({ pipeline_id: 99, pipeline: "Random Pipeline" }))).toBe(false);
    });

    it("returns false when both pipeline_id and pipeline are null", () => {
        expect(isInWwPipeline(deal({ pipeline_id: null, pipeline: null }))).toBe(false);
    });

    it("does NOT include elopement pipeline (12)", () => {
        expect(isInWwPipeline(deal({ pipeline_id: 12 }))).toBe(false);
    });
});

// ─── isInWwLeadsPipeline ────────────────────────────────────────────────────

describe("isInWwLeadsPipeline", () => {
    it("includes all WW pipeline IDs plus elopement (12)", () => {
        expect(isInWwLeadsPipeline(deal({ pipeline_id: 1 }))).toBe(true);
        expect(isInWwLeadsPipeline(deal({ pipeline_id: 12 }))).toBe(true);
        expect(isInWwLeadsPipeline(deal({ pipeline_id: 31 }))).toBe(true);
    });

    it("matches elopement pipeline by name", () => {
        expect(isInWwLeadsPipeline(deal({ pipeline: "Elopment Wedding" }))).toBe(true);
    });

    it("rejects unrelated pipeline", () => {
        expect(isInWwLeadsPipeline(deal({ pipeline_id: 99 }))).toBe(false);
    });
});

// ─── isInWwMqlPipeline ──────────────────────────────────────────────────────

describe("isInWwMqlPipeline", () => {
    it("includes only pipes 1, 3, 4", () => {
        expect(isInWwMqlPipeline(deal({ pipeline_id: 1 }))).toBe(true);
        expect(isInWwMqlPipeline(deal({ pipeline_id: 3 }))).toBe(true);
        expect(isInWwMqlPipeline(deal({ pipeline_id: 4 }))).toBe(true);
    });

    it("excludes pipe 17 and 31", () => {
        expect(isInWwMqlPipeline(deal({ pipeline_id: 17 }))).toBe(false);
        expect(isInWwMqlPipeline(deal({ pipeline_id: 31 }))).toBe(false);
    });

    it("matches by name", () => {
        expect(isInWwMqlPipeline(deal({ pipeline: "SDR Weddings" }))).toBe(true);
        expect(isInWwMqlPipeline(deal({ pipeline: "Closer Weddings" }))).toBe(true);
        expect(isInWwMqlPipeline(deal({ pipeline: "Planejamento Weddings" }))).toBe(true);
    });

    it("rejects WW - Internacional by name", () => {
        expect(isInWwMqlPipeline(deal({ pipeline: "WW - Internacional" }))).toBe(false);
    });
});

// ─── isInMonth ──────────────────────────────────────────────────────────────

describe("isInMonth", () => {
    it("returns true for a date in the specified month", () => {
        expect(isInMonth("2025-06-15", 2025, 6)).toBe(true);
    });

    it("returns false for a date in a different month", () => {
        expect(isInMonth("2025-07-15T12:00:00", 2025, 6)).toBe(false);
    });

    it("returns false for a date in a different year", () => {
        expect(isInMonth("2024-06-15", 2025, 6)).toBe(false);
    });

    it("returns false for null", () => {
        expect(isInMonth(null, 2025, 6)).toBe(false);
    });

    it("returns false for undefined", () => {
        expect(isInMonth(undefined, 2025, 6)).toBe(false);
    });
});

// ─── isCreatedInMonth ───────────────────────────────────────────────────────

describe("isCreatedInMonth", () => {
    it("delegates to isInMonth correctly", () => {
        expect(isCreatedInMonth("2025-03-10", 2025, 3)).toBe(true);
        expect(isCreatedInMonth("2025-03-10", 2025, 4)).toBe(false);
        expect(isCreatedInMonth(null, 2025, 3)).toBe(false);
    });
});

// ─── getMonthProgress ───────────────────────────────────────────────────────

describe("getMonthProgress", () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    it("returns 100 for a past month", () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2025-06-15T12:00:00Z"));
        expect(getMonthProgress(2025, 5)).toBe(100);
        expect(getMonthProgress(2024, 12)).toBe(100);
    });

    it("returns 0 for a future month", () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2025-06-15T12:00:00Z"));
        expect(getMonthProgress(2025, 7)).toBe(0);
        expect(getMonthProgress(2026, 1)).toBe(0);
    });

    it("returns proportional progress for the current month", () => {
        vi.useFakeTimers();
        // June 15 — June has 30 days, so progress = 15/30 * 100 = 50
        vi.setSystemTime(new Date("2025-06-15T12:00:00Z"));
        expect(getMonthProgress(2025, 6)).toBe(50);
    });

    it("returns ~100 on the last day of the current month", () => {
        vi.useFakeTimers();
        // March 31 — March has 31 days, so progress = 31/31 * 100 = 100
        vi.setSystemTime(new Date("2025-03-31T12:00:00Z"));
        expect(getMonthProgress(2025, 3)).toBe(100);
    });
});

// ─── calcConversionRate ─────────────────────────────────────────────────────

describe("calcConversionRate", () => {
    it("returns 0 when denominator is 0", () => {
        expect(calcConversionRate(0, 10)).toBe(0);
    });

    it("calculates percentage correctly", () => {
        expect(calcConversionRate(100, 25)).toBe(25);
    });

    it("can exceed 100%", () => {
        expect(calcConversionRate(10, 20)).toBe(200);
    });
});

// ─── calcAchievement ────────────────────────────────────────────────────────

describe("calcAchievement", () => {
    it("returns 0 when target is 0", () => {
        expect(calcAchievement(50, 0)).toBe(0);
    });

    it("calculates achievement percentage", () => {
        expect(calcAchievement(75, 100)).toBe(75);
    });
});

// ─── calcShouldBe ───────────────────────────────────────────────────────────

describe("calcShouldBe", () => {
    it("returns rounded expected value", () => {
        expect(calcShouldBe(100, 50)).toBe(50);
        expect(calcShouldBe(33, 33.33)).toBe(11); // 33 * 0.3333 = 10.999 → 11
    });

    it("returns 0 for 0% progress", () => {
        expect(calcShouldBe(100, 0)).toBe(0);
    });
});

// ─── calcFunnelCVR ──────────────────────────────────────────────────────────

describe("calcFunnelCVR", () => {
    it("computes all conversion rates correctly", () => {
        const metrics: FunnelMetrics = {
            leads: 1000,
            mql: 500,
            agendamento: 250,
            reunioes: 200,
            qualificado: 100,
            closerAgendada: 80,
            closerRealizada: 60,
            vendas: 30,
        };
        const cvr = calcFunnelCVR(metrics);

        expect(cvr.cvrMql).toBe(50);          // 500/1000
        expect(cvr.cvrAg).toBe(50);           // 250/500
        expect(cvr.cvrReu).toBe(80);          // 200/250
        expect(cvr.cvrSql).toBe(50);          // 100/200
        expect(cvr.cvrRa).toBe(80);           // 80/100
        expect(cvr.cvrRr).toBe(75);           // 60/80
        expect(cvr.cvrVenda).toBe(50);        // 30/60
        expect(cvr.conversaoTotal).toBe(3);   // 30/1000
    });

    it("handles zero leads gracefully (all rates = 0)", () => {
        const metrics: FunnelMetrics = {
            leads: 0, mql: 0, agendamento: 0, reunioes: 0,
            qualificado: 0, closerAgendada: 0, closerRealizada: 0, vendas: 0,
        };
        const cvr = calcFunnelCVR(metrics);
        expect(Object.values(cvr).every((v) => v === 0)).toBe(true);
    });
});

// ─── formatCurrency ─────────────────────────────────────────────────────────

describe("formatCurrency", () => {
    it("formats a number as BRL currency", () => {
        const result = formatCurrency(1234.5);
        // Intl can use different whitespace chars; normalize
        const normalized = result.replace(/\s/g, " ");
        expect(normalized).toContain("R$");
        expect(normalized).toContain("1.234,50");
    });

    it("formats zero", () => {
        const result = formatCurrency(0);
        expect(result).toContain("R$");
        expect(result).toContain("0,00");
    });
});

// ─── formatPercent ──────────────────────────────────────────────────────────

describe("formatPercent", () => {
    it("formats a number with 2 decimal places and % suffix", () => {
        expect(formatPercent(75)).toBe("75.00%");
    });

    it("formats zero", () => {
        expect(formatPercent(0)).toBe("0.00%");
    });

    it("formats a decimal value", () => {
        expect(formatPercent(33.333)).toBe("33.33%");
    });
});

// ─── getMonthName ───────────────────────────────────────────────────────────

describe("getMonthName", () => {
    it("returns correct month names (1-indexed)", () => {
        expect(getMonthName(1)).toBe("Janeiro");
        expect(getMonthName(6)).toBe("Junho");
        expect(getMonthName(12)).toBe("Dezembro");
    });

    it("returns empty string for out-of-range", () => {
        expect(getMonthName(0)).toBe("");
        expect(getMonthName(13)).toBe("");
    });
});

// ─── getMonthDateRange ──────────────────────────────────────────────────────

describe("getMonthDateRange", () => {
    it("returns correct start and end for a month", () => {
        const { start, end } = getMonthDateRange(2025, 3);
        expect(start.getFullYear()).toBe(2025);
        expect(start.getMonth()).toBe(2); // March = 2
        expect(start.getDate()).toBe(1);
        expect(end.getDate()).toBe(31);
        expect(end.getHours()).toBe(23);
    });

    it("handles February in a leap year", () => {
        const { end } = getMonthDateRange(2024, 2);
        expect(end.getDate()).toBe(29);
    });

    it("handles February in a non-leap year", () => {
        const { end } = getMonthDateRange(2025, 2);
        expect(end.getDate()).toBe(28);
    });
});
