import { type FunnelMetrics, type WonDeal } from "./schemas";

// ─── PIPELINE CONSTANTS (shared by OverviewFunnelTable & FunnelMetaTable) ────

export const WW_PIPELINE_IDS = [1, 3, 4, 17, 31];
export const WW_LEADS_PIPELINE_IDS = [1, 3, 4, 12, 17, 31];
export const WW_MQL_PIPELINE_IDS = [1, 3, 4];
export const WW_PIPELINE_NAMES = ["SDR Weddings", "Closer Weddings", "Planejamento Weddings", "WW - Internacional", "Outros Desqualificados | Wedding"];
export const WW_LEADS_PIPELINE_NAMES = [...WW_PIPELINE_NAMES, "Elopment Wedding"];
export const WW_MQL_PIPELINE_NAMES = ["SDR Weddings", "Closer Weddings", "Planejamento Weddings"];

// Convert to Sets for O(1) lookup (used in tight loops)
const WW_IDS_SET = new Set(WW_PIPELINE_IDS);
const WW_LEADS_IDS_SET = new Set(WW_LEADS_PIPELINE_IDS);
const WW_MQL_IDS_SET = new Set(WW_MQL_PIPELINE_IDS);
const WW_NAMES_SET = new Set(WW_PIPELINE_NAMES);
const WW_LEADS_NAMES_SET = new Set(WW_LEADS_PIPELINE_NAMES);
const WW_MQL_NAMES_SET = new Set(WW_MQL_PIPELINE_NAMES);

export function isElopement(d: WonDeal): boolean {
    return d.is_elopement === true || d.title?.startsWith("EW") === true || d.pipeline === "Elopment Wedding";
}

export function isInWwPipeline(d: WonDeal): boolean {
    return (d.pipeline_id != null && WW_IDS_SET.has(d.pipeline_id)) || (d.pipeline != null && WW_NAMES_SET.has(d.pipeline));
}

export function isInWwLeadsPipeline(d: WonDeal): boolean {
    return (d.pipeline_id != null && WW_LEADS_IDS_SET.has(d.pipeline_id)) || (d.pipeline != null && WW_LEADS_NAMES_SET.has(d.pipeline));
}

export function isInWwMqlPipeline(d: WonDeal): boolean {
    return (d.pipeline_id != null && WW_MQL_IDS_SET.has(d.pipeline_id)) || (d.pipeline != null && WW_MQL_NAMES_SET.has(d.pipeline));
}

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
