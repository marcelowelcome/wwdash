import { type FunnelMetrics } from "./schemas";

// ─── FORMAT FUNCTIONS ────────────────────────────────────────────────────────

export function formatCurrency(value: number): string {
    return new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "BRL",
    }).format(value);
}

export function formatPercent(value: number): string {
    return `${value.toFixed(2)}%`;
}

// ─── MONTH PROGRESS ──────────────────────────────────────────────────────────

export function getMonthProgress(selectedYear: number, selectedMonth: number): number {
    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth() + 1;

    // Past month = 100%
    if (selectedYear < currentYear || (selectedYear === currentYear && selectedMonth < currentMonth)) {
        return 100;
    }

    // Future month = 0%
    if (selectedYear > currentYear || (selectedYear === currentYear && selectedMonth > currentMonth)) {
        return 0;
    }

    // Current month = actual progress
    const daysInMonth = new Date(selectedYear, selectedMonth, 0).getDate();
    const dayOfMonth = today.getDate();
    return (dayOfMonth / daysInMonth) * 100;
}

// ─── CALCULATION FUNCTIONS ───────────────────────────────────────────────────

export function calcConversionRate(from: number, to: number): number {
    if (from === 0) return 0;
    return (to / from) * 100;
}

export function calcAchievement(actual: number, target: number): number {
    if (target === 0) return 0;
    return (actual / target) * 100;
}

export function calcShouldBe(target: number, progressPercent: number): number {
    return Math.round(target * (progressPercent / 100));
}

export function calcFunnelCVR(metrics: FunnelMetrics): Record<string, number> {
    return {
        cvrMql: calcConversionRate(metrics.leads, metrics.mql),
        cvrAg: calcConversionRate(metrics.mql, metrics.agendamento),
        cvrReu: calcConversionRate(metrics.agendamento, metrics.reunioes),
        cvrSql: calcConversionRate(metrics.reunioes, metrics.qualificado),
        cvrRa: calcConversionRate(metrics.qualificado, metrics.closerAgendada),
        cvrRr: calcConversionRate(metrics.closerAgendada, metrics.closerRealizada),
        cvrVenda: calcConversionRate(metrics.closerRealizada, metrics.vendas),
        conversaoTotal: calcConversionRate(metrics.leads, metrics.vendas),
    };
}

// ─── DATE HELPERS ────────────────────────────────────────────────────────────

export function isInMonth(dateStr: string | null | undefined, year: number, month: number): boolean {
    if (!dateStr) return false;
    const date = new Date(dateStr);
    return date.getFullYear() === year && date.getMonth() + 1 === month;
}

export function isCreatedInMonth(cdate: string | null | undefined, year: number, month: number): boolean {
    return isInMonth(cdate, year, month);
}

export function getMonthDateRange(year: number, month: number): { start: Date; end: Date } {
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 0, 23, 59, 59);
    return { start, end };
}

// ─── MONTH NAMES ─────────────────────────────────────────────────────────────

export const MONTHS = [
    "Janeiro",
    "Fevereiro",
    "Março",
    "Abril",
    "Maio",
    "Junho",
    "Julho",
    "Agosto",
    "Setembro",
    "Outubro",
    "Novembro",
    "Dezembro",
];

export function getMonthName(month: number): string {
    return MONTHS[month - 1] || "";
}
