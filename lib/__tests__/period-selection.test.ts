import { describe, expect, it } from "vitest";
import {
    DEFAULT_SELECTION,
    PRESET_CATALOG,
    __testing,
    resolvePeriod,
} from "../period-selection";

const { todayBrtCalendar, addDaysBrt, startOfWeekBrt, startOfMonthBrt, endOfPreviousMonthBrt } =
    __testing;

// 2026-04-30 12:00 UTC = 2026-04-30 09:00 BRT (terça-feira)
const NOW = new Date("2026-04-30T12:00:00.000Z");

describe("BRT calendar helpers", () => {
    it("todayBrtCalendar returns BRT day", () => {
        expect(todayBrtCalendar(NOW)).toBe("2026-04-30");
        // 02:00 UTC ainda é dia anterior em BRT
        expect(todayBrtCalendar(new Date("2026-04-30T02:00:00.000Z"))).toBe("2026-04-29");
    });

    it("addDaysBrt soma e subtrai sem drift de timezone", () => {
        expect(addDaysBrt("2026-04-30", 1)).toBe("2026-05-01");
        expect(addDaysBrt("2026-04-30", -1)).toBe("2026-04-29");
        expect(addDaysBrt("2026-04-01", -1)).toBe("2026-03-31");
        expect(addDaysBrt("2026-12-31", 1)).toBe("2027-01-01");
        expect(addDaysBrt("2024-02-28", 1)).toBe("2024-02-29"); // bissexto
    });

    it("startOfWeekBrt retorna o domingo da semana", () => {
        // 2026-04-30 é quinta-feira. Domingo = 2026-04-26.
        expect(startOfWeekBrt("2026-04-30")).toBe("2026-04-26");
        // 2026-04-26 (domingo) → ele mesmo
        expect(startOfWeekBrt("2026-04-26")).toBe("2026-04-26");
        // 2026-05-02 (sábado) → domingo anterior
        expect(startOfWeekBrt("2026-05-02")).toBe("2026-04-26");
    });

    it("startOfMonthBrt", () => {
        expect(startOfMonthBrt("2026-04-30")).toBe("2026-04-01");
        expect(startOfMonthBrt("2026-04-01")).toBe("2026-04-01");
    });

    it("endOfPreviousMonthBrt", () => {
        expect(endOfPreviousMonthBrt("2026-04-30")).toBe("2026-03-31");
        expect(endOfPreviousMonthBrt("2026-04-01")).toBe("2026-03-31");
        expect(endOfPreviousMonthBrt("2026-03-15")).toBe("2026-02-28");
        expect(endOfPreviousMonthBrt("2024-03-15")).toBe("2024-02-29"); // bissexto
        expect(endOfPreviousMonthBrt("2026-01-15")).toBe("2025-12-31"); // virada de ano
    });
});

describe("PRESET_CATALOG", () => {
    it("expõe 13 presets em ordem", () => {
        expect(PRESET_CATALOG).toHaveLength(13);
        expect(PRESET_CATALOG[0].id).toBe("today");
        expect(PRESET_CATALOG[PRESET_CATALOG.length - 1].id).toBe("custom");
    });
});

describe("resolvePeriod — presets que mudam com o calendário", () => {
    // 2026-04-30 (quinta) → semana de domingo 2026-04-26 a sábado 2026-05-02

    it("today: range é dia atual em BRT", () => {
        const r = resolvePeriod({ preset: "today" }, NOW);
        expect(r.start.toISOString()).toBe("2026-04-30T03:00:00.000Z");
        expect(r.end.toISOString()).toBe("2026-05-01T02:59:59.999Z");
        expect(r.daysBack).toBe(1);
        expect(r.label).toBe("Hoje");
    });

    it("yesterday: range é dia anterior em BRT", () => {
        const r = resolvePeriod({ preset: "yesterday" }, NOW);
        expect(r.start.toISOString()).toBe("2026-04-29T03:00:00.000Z");
        expect(r.end.toISOString()).toBe("2026-04-30T02:59:59.999Z");
        expect(r.daysBack).toBe(2);
        expect(r.label).toBe("Ontem");
    });

    it("this-week: domingo passado até hoje", () => {
        const r = resolvePeriod({ preset: "this-week" }, NOW);
        expect(r.start.toISOString()).toBe("2026-04-26T03:00:00.000Z");
        expect(r.end.toISOString()).toBe("2026-05-01T02:59:59.999Z");
        // 26→30 = 5 dias (incluindo extremos)
        expect(r.daysBack).toBe(5);
        expect(r.label).toBe("Esta semana");
    });

    it("last-week: domingo a sábado anteriores", () => {
        const r = resolvePeriod({ preset: "last-week" }, NOW);
        expect(r.start.toISOString()).toBe("2026-04-19T03:00:00.000Z");
        expect(r.end.toISOString()).toBe("2026-04-26T02:59:59.999Z");
        expect(r.daysBack).toBe(12); // 19 a 30
        expect(r.label).toBe("Semana passada");
    });

    it("this-month: dia 1 até hoje", () => {
        const r = resolvePeriod({ preset: "this-month" }, NOW);
        expect(r.start.toISOString()).toBe("2026-04-01T03:00:00.000Z");
        expect(r.end.toISOString()).toBe("2026-05-01T02:59:59.999Z");
        expect(r.daysBack).toBe(30);
    });

    it("last-month: mês inteiro anterior", () => {
        const r = resolvePeriod({ preset: "last-month" }, NOW);
        expect(r.start.toISOString()).toBe("2026-03-01T03:00:00.000Z");
        expect(r.end.toISOString()).toBe("2026-04-01T02:59:59.999Z");
        expect(r.daysBack).toBe(61); // 01-mar a 30-abr
    });
});

describe("resolvePeriod — presets rolling fixos", () => {
    it("last-7-days inclui hoje (= 7 dias)", () => {
        const r = resolvePeriod({ preset: "last-7-days" }, NOW);
        expect(r.start.toISOString()).toBe("2026-04-24T03:00:00.000Z");
        expect(r.end.toISOString()).toBe("2026-05-01T02:59:59.999Z");
        expect(r.daysBack).toBe(7);
    });

    it("last-30-days", () => {
        const r = resolvePeriod({ preset: "last-30-days" }, NOW);
        expect(r.start.toISOString()).toBe("2026-04-01T03:00:00.000Z");
        expect(r.daysBack).toBe(30);
    });

    it("last-180-days", () => {
        const r = resolvePeriod({ preset: "last-180-days" }, NOW);
        expect(r.daysBack).toBe(180);
    });

    it("last-365-days", () => {
        const r = resolvePeriod({ preset: "last-365-days" }, NOW);
        expect(r.daysBack).toBe(365);
    });

    it("all-time é ~10 anos", () => {
        const r = resolvePeriod({ preset: "all-time" }, NOW);
        expect(r.daysBack).toBeGreaterThanOrEqual(3650);
        expect(r.daysBack).toBeLessThanOrEqual(3651);
    });
});

describe("resolvePeriod — custom", () => {
    it("aceita range válido", () => {
        const r = resolvePeriod(
            { preset: "custom", customStart: "2026-04-10", customEnd: "2026-04-20" },
            NOW,
        );
        expect(r.start.toISOString()).toBe("2026-04-10T03:00:00.000Z");
        expect(r.end.toISOString()).toBe("2026-04-21T02:59:59.999Z");
        expect(r.label).toContain("10/04/2026");
        expect(r.label).toContain("20/04/2026");
    });

    it("range invertido cai no fallback de 180d", () => {
        const r = resolvePeriod(
            { preset: "custom", customStart: "2026-04-30", customEnd: "2026-04-01" },
            NOW,
        );
        expect(r.daysBack).toBe(180);
        expect(r.label).toContain("inválido");
    });

    it("falta de datas cai no fallback", () => {
        const r = resolvePeriod({ preset: "custom" }, NOW);
        expect(r.daysBack).toBe(180);
    });

    it("formato inválido cai no fallback", () => {
        const r = resolvePeriod(
            { preset: "custom", customStart: "abc", customEnd: "def" },
            NOW,
        );
        expect(r.daysBack).toBe(180);
    });
});

describe("DEFAULT_SELECTION", () => {
    it("é last-180-days (mantém compat com legacy DEFAULT_GLOBAL_PERIOD=180)", () => {
        expect(DEFAULT_SELECTION.preset).toBe("last-180-days");
    });
});
