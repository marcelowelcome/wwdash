// Board endpoint — period parsing + BRT↔UTC + range validation
// See: docs/board-api-briefing.md (v1.2) sections 4.3, 4.4, 7

import { fromZonedTime, toZonedTime } from "date-fns-tz";
import { BRT_TZ, MAX_HISTORY_MONTHS, WEEKLY_RANGE_DAYS } from "./constants";
import type { ErrorCode, UtcRange } from "./types";

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export class PeriodValidationError extends Error {
    constructor(public code: ErrorCode, message: string) {
        super(message);
        this.name = "PeriodValidationError";
    }
}

// Convert a YYYY-MM-DD calendar day in São Paulo into UTC Date for SQL.
// `kind = "start"` → 00:00:00.000 BRT. `kind = "end"` → 23:59:59.999 BRT.
export function brtCalendarDayToUtc(date: string, kind: "start" | "end"): Date {
    if (!ISO_DATE_RE.test(date)) {
        throw new PeriodValidationError("INVALID_DATE", `Date must be YYYY-MM-DD, got "${date}"`);
    }
    const localStr = kind === "start" ? `${date}T00:00:00.000` : `${date}T23:59:59.999`;
    return fromZonedTime(localStr, BRT_TZ);
}

export function periodToUtcRange(start: string, end: string): UtcRange {
    return {
        startUtc: brtCalendarDayToUtc(start, "start"),
        endUtc: brtCalendarDayToUtc(end, "end"),
    };
}

// Day-difference (calendar days) between two YYYY-MM-DD in BRT.
// Used for the v1 weekly-only validation (`end - start === 6`).
export function daysBetween(start: string, end: string): number {
    const a = brtCalendarDayToUtc(start, "start").getTime();
    const b = brtCalendarDayToUtc(end, "start").getTime();
    return Math.round((b - a) / (1000 * 60 * 60 * 24));
}

// Returns "today" as a YYYY-MM-DD calendar day in BRT.
export function todayBrt(now: Date = new Date()): string {
    const zoned = toZonedTime(now, BRT_TZ);
    const y = zoned.getFullYear();
    const m = String(zoned.getMonth() + 1).padStart(2, "0");
    const d = String(zoned.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
}

// `is_partial` rule (briefing 4.4 + 7):
// `period.end >= startOfDay(today, BRT)` → partial.
// Equivalently: end calendar-day >= today BRT calendar-day.
export function isPartialPeriod(end: string, now: Date = new Date()): boolean {
    return end >= todayBrt(now);
}

// `is_complete` per window — analogous to !is_partial, with explicit window end.
export function isWindowComplete(windowEnd: string, now: Date = new Date()): boolean {
    return windowEnd < todayBrt(now);
}

// Validate the input range. Throws PeriodValidationError on issues.
// Rules (briefing 3.1, 3.6, 7):
//   - both must match YYYY-MM-DD
//   - end ≥ start
//   - end NOT in the future (today is OK if v1 allows partial → today's range is partial)
//   - end - start === 6 days (weekly-only on v1)
//   - start ≥ today - MAX_HISTORY_MONTHS
export function validateRange(start: string, end: string, now: Date = new Date()): void {
    // Throws INVALID_DATE if format is bad.
    const startUtc = brtCalendarDayToUtc(start, "start");
    const endUtc = brtCalendarDayToUtc(end, "end");

    // Future check: end calendar day must be ≤ today BRT (today itself returns is_partial=true, allowed).
    if (end > todayBrt(now)) {
        throw new PeriodValidationError("INVALID_DATE", `end "${end}" is in the future`);
    }
    if (start > todayBrt(now)) {
        throw new PeriodValidationError("INVALID_DATE", `start "${start}" is in the future`);
    }

    if (endUtc.getTime() < startUtc.getTime()) {
        throw new PeriodValidationError("INVALID_RANGE", `end "${end}" is before start "${start}"`);
    }

    const diffDays = daysBetween(start, end);
    if (diffDays !== WEEKLY_RANGE_DAYS - 1) {
        throw new PeriodValidationError(
            "INVALID_RANGE",
            `v1 accepts only weekly ranges (${WEEKLY_RANGE_DAYS} days). Got ${diffDays + 1} days.`
        );
    }

    // RANGE_TOO_OLD: start older than MAX_HISTORY_MONTHS (calendar months) before now.
    const cutoff = new Date(now);
    cutoff.setUTCMonth(cutoff.getUTCMonth() - MAX_HISTORY_MONTHS);
    if (startUtc.getTime() < cutoff.getTime()) {
        throw new PeriodValidationError(
            "RANGE_TOO_OLD",
            `start "${start}" is more than ${MAX_HISTORY_MONTHS} months in the past`
        );
    }
}

// MTD: dia 1 do mês de `end` até `end` (BRT calendar).
export function mtdRange(end: string): { start: string; end: string } {
    const [y, m] = end.split("-");
    return { start: `${y}-${m}-01`, end };
}

// Rolling 30d ending at `end` (inclusive both ends) → end - 29 days.
export function rolling30dRange(end: string): { start: string; end: string } {
    const endStartUtc = brtCalendarDayToUtc(end, "start");
    const startUtc = new Date(endStartUtc.getTime() - 29 * 24 * 60 * 60 * 1000);
    const startStr = brtIsoDayString(startUtc);
    return { start: startStr, end };
}

// Previous 4 weeks (Mon-Sun) immediately before `start` (briefing 4.4).
// Returns 4 windows ordered from oldest to newest.
export function previous4WeeksRanges(start: string): Array<{ start: string; end: string }> {
    const startUtc = brtCalendarDayToUtc(start, "start");
    const ranges: Array<{ start: string; end: string }> = [];
    for (let i = 4; i >= 1; i--) {
        const wStart = new Date(startUtc.getTime() - i * 7 * 24 * 60 * 60 * 1000);
        const wEnd = new Date(wStart.getTime() + 6 * 24 * 60 * 60 * 1000);
        ranges.push({ start: brtIsoDayString(wStart), end: brtIsoDayString(wEnd) });
    }
    return ranges;
}

// Helper: format a UTC Date back into a YYYY-MM-DD calendar day in BRT.
function brtIsoDayString(utc: Date): string {
    const zoned = toZonedTime(utc, BRT_TZ);
    const y = zoned.getFullYear();
    const m = String(zoned.getMonth() + 1).padStart(2, "0");
    const d = String(zoned.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
}

// "YYYY-MM" string from `end` (calendar month of end), used for `targets.month`.
export function targetMonthFromEnd(end: string): string {
    return end.substring(0, 7);
}
