import { describe, expect, it } from "vitest";
import {
    PeriodValidationError,
    brtCalendarDayToUtc,
    daysBetween,
    isPartialPeriod,
    isWindowComplete,
    mtdRange,
    periodToUtcRange,
    previous4WeeksRanges,
    rolling30dRange,
    targetMonthFromEnd,
    todayBrt,
    validateRange,
} from "../period";

// BRT is UTC-03 (no DST since 2019). 2026-04-20 00:00 BRT = 2026-04-20 03:00 UTC.

describe("brtCalendarDayToUtc", () => {
    it("converts start-of-day BRT to UTC", () => {
        expect(brtCalendarDayToUtc("2026-04-20", "start").toISOString()).toBe(
            "2026-04-20T03:00:00.000Z"
        );
    });

    it("converts end-of-day BRT to UTC", () => {
        expect(brtCalendarDayToUtc("2026-04-26", "end").toISOString()).toBe(
            "2026-04-27T02:59:59.999Z"
        );
    });

    it("rejects malformed date", () => {
        expect(() => brtCalendarDayToUtc("2026-4-1", "start")).toThrow(PeriodValidationError);
        expect(() => brtCalendarDayToUtc("not-a-date", "start")).toThrow(PeriodValidationError);
    });
});

describe("periodToUtcRange", () => {
    it("returns both ends in UTC", () => {
        const r = periodToUtcRange("2026-04-20", "2026-04-26");
        expect(r.startUtc.toISOString()).toBe("2026-04-20T03:00:00.000Z");
        expect(r.endUtc.toISOString()).toBe("2026-04-27T02:59:59.999Z");
    });
});

describe("daysBetween", () => {
    it("returns calendar-day delta in BRT", () => {
        expect(daysBetween("2026-04-20", "2026-04-26")).toBe(6);
        expect(daysBetween("2026-04-20", "2026-04-20")).toBe(0);
        expect(daysBetween("2026-04-20", "2026-05-04")).toBe(14);
    });
});

describe("todayBrt", () => {
    it("formats BRT today as YYYY-MM-DD", () => {
        // 2026-04-30 02:00 UTC = 2026-04-29 23:00 BRT (one day before in BRT calendar)
        const utcMidnight = new Date("2026-04-30T02:00:00.000Z");
        expect(todayBrt(utcMidnight)).toBe("2026-04-29");
        // 2026-04-30 04:00 UTC = 2026-04-30 01:00 BRT (same calendar day in BRT)
        const utcAfterBrtMidnight = new Date("2026-04-30T04:00:00.000Z");
        expect(todayBrt(utcAfterBrtMidnight)).toBe("2026-04-30");
    });
});

describe("isPartialPeriod", () => {
    const now = new Date("2026-04-30T12:00:00.000Z"); // 2026-04-30 09:00 BRT

    it("returns false when end is strictly before today", () => {
        expect(isPartialPeriod("2026-04-29", now)).toBe(false);
    });
    it("returns true when end is today", () => {
        expect(isPartialPeriod("2026-04-30", now)).toBe(true);
    });
    it("returns true when end is in the future", () => {
        expect(isPartialPeriod("2026-05-04", now)).toBe(true);
    });
});

describe("isWindowComplete", () => {
    const now = new Date("2026-04-30T12:00:00.000Z");
    it("complete when end is in the past", () => {
        expect(isWindowComplete("2026-04-26", now)).toBe(true);
    });
    it("incomplete when end is today", () => {
        expect(isWindowComplete("2026-04-30", now)).toBe(false);
    });
});

describe("validateRange", () => {
    const now = new Date("2026-04-30T12:00:00.000Z");

    it("accepts a valid Mon–Sun week", () => {
        expect(() => validateRange("2026-04-20", "2026-04-26", now)).not.toThrow();
    });

    it("rejects malformed date as INVALID_DATE", () => {
        try {
            validateRange("bad", "2026-04-26", now);
            expect.fail("should throw");
        } catch (e) {
            expect((e as PeriodValidationError).code).toBe("INVALID_DATE");
        }
    });

    it("rejects future end as INVALID_DATE", () => {
        try {
            validateRange("2026-05-04", "2026-05-10", now);
            expect.fail();
        } catch (e) {
            expect((e as PeriodValidationError).code).toBe("INVALID_DATE");
        }
    });

    it("rejects end < start as INVALID_RANGE", () => {
        try {
            validateRange("2026-04-26", "2026-04-20", now);
            expect.fail();
        } catch (e) {
            expect((e as PeriodValidationError).code).toBe("INVALID_RANGE");
        }
    });

    it("rejects non-7-day range as INVALID_RANGE", () => {
        try {
            // 14-day range, end in the past, so future-check passes and range-check kicks in.
            validateRange("2026-04-13", "2026-04-26", now);
            expect.fail();
        } catch (e) {
            expect((e as PeriodValidationError).code).toBe("INVALID_RANGE");
        }
    });

    it("rejects start > 24 months ago as RANGE_TOO_OLD", () => {
        try {
            validateRange("2024-04-15", "2024-04-21", now);
            expect.fail();
        } catch (e) {
            expect((e as PeriodValidationError).code).toBe("RANGE_TOO_OLD");
        }
    });
});

describe("mtdRange", () => {
    it("returns first day of end's month", () => {
        expect(mtdRange("2026-04-26")).toEqual({ start: "2026-04-01", end: "2026-04-26" });
    });
});

describe("rolling30dRange", () => {
    it("returns end - 29 days through end", () => {
        const r = rolling30dRange("2026-04-26");
        expect(r).toEqual({ start: "2026-03-28", end: "2026-04-26" });
        expect(daysBetween(r.start, r.end)).toBe(29); // 30 days inclusive
    });
});

describe("previous4WeeksRanges", () => {
    it("returns 4 weeks immediately before start, oldest first", () => {
        const ranges = previous4WeeksRanges("2026-04-20");
        expect(ranges).toHaveLength(4);
        expect(ranges[0]).toEqual({ start: "2026-03-23", end: "2026-03-29" });
        expect(ranges[1]).toEqual({ start: "2026-03-30", end: "2026-04-05" });
        expect(ranges[2]).toEqual({ start: "2026-04-06", end: "2026-04-12" });
        expect(ranges[3]).toEqual({ start: "2026-04-13", end: "2026-04-19" });
    });
});

describe("targetMonthFromEnd", () => {
    it("returns YYYY-MM", () => {
        expect(targetMonthFromEnd("2026-04-26")).toBe("2026-04");
    });
});
