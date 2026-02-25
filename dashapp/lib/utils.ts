import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merges Tailwind CSS classes using clsx and tailwind-merge.
 * Prevents conflicting class names and supports conditional classes.
 */
export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

/**
 * Parses an ISO date string into a Date object, or returns null if invalid.
 */
export const parseDate = (s: string | undefined): Date | null =>
    s ? new Date(s) : null;

/**
 * Returns the number of days since a given date relative to a reference date.
 * Returns 999 if the date is null (to push it to the "old" bucket).
 */
export const daysSince = (d: Date | null, ref = new Date()): number =>
    d ? Math.floor((ref.getTime() - d.getTime()) / 86400000) : 999;

/**
 * Returns a week key (Monday's date string) for a given ISO date string.
 */
export const weekKey = (d: string): string => {
    const dt = new Date(d);
    dt.setHours(0, 0, 0, 0);
    const day = dt.getDay();
    const mon = new Date(dt);
    mon.setDate(dt.getDate() - ((day + 6) % 7));
    return mon.toISOString().split("T")[0];
};

/**
 * Returns true if a date is within a given range [start, end] inclusive.
 */
export const inRange = (d: Date | null, s: Date, e: Date): boolean =>
    !!d && d >= s && d <= e;

/**
 * Returns a Date object for n days ago from now.
 */
export const daysAgo = (n: number): Date => {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d;
};
