import { describe, it, expect } from "vitest";
import { parseDate, daysSince, weekKey, inRange, daysAgo } from "../utils";

describe("parseDate", () => {
    it("returns null for undefined input", () => {
        expect(parseDate(undefined)).toBeNull();
    });

    it("returns null for empty string", () => {
        expect(parseDate("")).toBeNull();
    });

    it("parses a valid ISO date string", () => {
        const result = parseDate("2025-06-15T10:00:00Z");
        expect(result).toBeInstanceOf(Date);
        expect(result!.getFullYear()).toBe(2025);
        expect(result!.getMonth()).toBe(5); // June = 5
        expect(result!.getDate()).toBe(15);
    });

    it("parses a date-only string", () => {
        const result = parseDate("2025-01-15");
        expect(result).toBeInstanceOf(Date);
        // Date-only strings are parsed as UTC; just verify it produces a valid date
        expect(Number.isNaN(result!.getTime())).toBe(false);
    });

    it("returns an invalid Date for a garbage string (not null)", () => {
        const result = parseDate("not-a-date");
        expect(result).toBeInstanceOf(Date);
        expect(Number.isNaN(result!.getTime())).toBe(true);
    });
});

describe("daysSince", () => {
    it("returns Infinity when date is null", () => {
        expect(daysSince(null)).toBe(Infinity);
    });

    it("returns 0 for the same day (same timestamp)", () => {
        const now = new Date("2025-03-10T12:00:00Z");
        expect(daysSince(now, now)).toBe(0);
    });

    it("returns 10 for a date 10 days ago", () => {
        const ref = new Date("2025-03-20T12:00:00Z");
        const past = new Date("2025-03-10T12:00:00Z");
        expect(daysSince(past, ref)).toBe(10);
    });

    it("returns negative for a future date", () => {
        const ref = new Date("2025-03-10T12:00:00Z");
        const future = new Date("2025-03-15T12:00:00Z");
        expect(daysSince(future, ref)).toBe(-5);
    });
});

describe("weekKey", () => {
    // weekKey subtracts getDay() (Sunday=0..Saturday=6) so it returns the
    // most recent Sunday as the week key. We use full ISO timestamps to
    // avoid timezone ambiguity with date-only strings.

    it("returns the previous Sunday for a Wednesday", () => {
        // 2025-03-12 Wed → Sunday 2025-03-09
        expect(weekKey("2025-03-12T12:00:00")).toBe("2025-03-09");
    });

    it("returns the same date for a Sunday", () => {
        // 2025-03-09 is a Sunday → stays 2025-03-09
        expect(weekKey("2025-03-09T12:00:00")).toBe("2025-03-09");
    });

    it("returns the previous Sunday for a Saturday", () => {
        // 2025-03-15 Sat → Sunday 2025-03-09
        expect(weekKey("2025-03-15T12:00:00")).toBe("2025-03-09");
    });

    it("returns the previous Sunday for a Monday", () => {
        // 2025-03-10 Mon → Sunday 2025-03-09
        expect(weekKey("2025-03-10T12:00:00")).toBe("2025-03-09");
    });
});

describe("inRange", () => {
    const start = new Date("2025-01-01T00:00:00Z");
    const end = new Date("2025-12-31T23:59:59Z");

    it("returns true for a date within the range", () => {
        const d = new Date("2025-06-15T00:00:00Z");
        expect(inRange(d, start, end)).toBe(true);
    });

    it("returns true for a date equal to the start", () => {
        expect(inRange(start, start, end)).toBe(true);
    });

    it("returns true for a date equal to the end", () => {
        expect(inRange(end, start, end)).toBe(true);
    });

    it("returns false for a date before the range", () => {
        const d = new Date("2024-12-31T00:00:00Z");
        expect(inRange(d, start, end)).toBe(false);
    });

    it("returns false for a date after the range", () => {
        const d = new Date("2026-01-01T00:00:00Z");
        expect(inRange(d, start, end)).toBe(false);
    });

    it("returns false for null", () => {
        expect(inRange(null, start, end)).toBe(false);
    });
});

describe("daysAgo", () => {
    it("returns a Date object", () => {
        expect(daysAgo(5)).toBeInstanceOf(Date);
    });

    it("returns approximately the correct date for n=0", () => {
        const result = daysAgo(0);
        const now = new Date();
        // Should be within a few seconds of now
        expect(Math.abs(result.getTime() - now.getTime())).toBeLessThan(1000);
    });

    it("returns a date n days in the past", () => {
        const n = 7;
        const result = daysAgo(n);
        const now = new Date();
        const diffMs = now.getTime() - result.getTime();
        const diffDays = diffMs / 86400000;
        // Allow small tolerance for execution time
        expect(diffDays).toBeGreaterThan(n - 0.01);
        expect(diffDays).toBeLessThan(n + 0.01);
    });
});
