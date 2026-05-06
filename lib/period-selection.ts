// Period selection — types, presets, and resolution to UTC date ranges.
//
// Used by the global period filter (header) and any future per-tab pickers.
// All calendar math happens in BRT (`America/Sao_Paulo`); ranges are returned
// as UTC `Date` objects ready for Supabase queries.

import { fromZonedTime, toZonedTime } from "date-fns-tz";

const TZ = "America/Sao_Paulo";

// ─── Preset IDs ─────────────────────────────────────────────────────────────
export type PeriodPresetId =
    | "today"
    | "yesterday"
    | "this-week"      // domingo → hoje
    | "last-week"      // domingo → sábado da semana passada
    | "last-7-days"    // últimos 7 dias (rolling, inclui hoje)
    | "this-month"     // dia 1 → hoje
    | "last-month"     // dia 1 → último dia do mês passado
    | "last-30-days"
    | "last-90-days"
    | "last-180-days"
    | "last-365-days"
    | "all-time"
    | "custom";

export interface PeriodSelection {
    preset: PeriodPresetId;
    // Apenas usado quando preset === "custom"
    customStart?: string; // YYYY-MM-DD (BRT calendar day)
    customEnd?: string;   // YYYY-MM-DD (BRT calendar day)
}

export interface PeriodRange {
    /** UTC Date marcando o início do período (inclusivo). */
    start: Date;
    /** UTC Date marcando o fim do período (inclusivo, 23:59:59.999 BRT). */
    end: Date;
    /**
     * Distância em dias entre `start` e o dia atual (em BRT). Útil para
     * compatibilidade com fetchers que usam `daysBack` literal. Para presets
     * de calendário (ex: "this-week"), reflete o spread real do range.
     */
    daysBack: number;
    /** Label humano (em pt-BR), pronto para exibição. */
    label: string;
    /** Preset que originou o range (mesmo para "custom"). */
    preset: PeriodPresetId;
}

// ─── Catálogo de presets ────────────────────────────────────────────────────
export const PRESET_CATALOG: Array<{ id: PeriodPresetId; label: string }> = [
    { id: "today", label: "Hoje" },
    { id: "yesterday", label: "Ontem" },
    { id: "this-week", label: "Esta semana" },
    { id: "last-week", label: "Semana passada" },
    { id: "last-7-days", label: "Últimos 7 dias" },
    { id: "this-month", label: "Este mês" },
    { id: "last-month", label: "Mês passado" },
    { id: "last-30-days", label: "Últimos 30 dias" },
    { id: "last-90-days", label: "Últimos 90 dias" },
    { id: "last-180-days", label: "Últimos 180 dias" },
    { id: "last-365-days", label: "Último ano" },
    { id: "all-time", label: "Todo o período" },
    { id: "custom", label: "Personalizado" },
];

export const DEFAULT_SELECTION: PeriodSelection = { preset: "last-180-days" };

// ─── Helpers de calendário BRT ──────────────────────────────────────────────
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function brtCalendarDayToUtc(date: string, kind: "start" | "end"): Date {
    const local = kind === "start" ? `${date}T00:00:00.000` : `${date}T23:59:59.999`;
    return fromZonedTime(local, TZ);
}

function todayBrtCalendar(now: Date): string {
    const z = toZonedTime(now, TZ);
    const y = z.getFullYear();
    const m = String(z.getMonth() + 1).padStart(2, "0");
    const d = String(z.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
}

function addDaysBrt(brtDay: string, days: number): string {
    const [y, m, d] = brtDay.split("-").map(Number);
    // Constrói no fuso UTC para evitar artefatos do host;
    // depois soma `days` em milissegundos.
    const utc = Date.UTC(y, m - 1, d) + days * 24 * 60 * 60 * 1000;
    const dt = new Date(utc);
    const yy = dt.getUTCFullYear();
    const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(dt.getUTCDate()).padStart(2, "0");
    return `${yy}-${mm}-${dd}`;
}

// Domingo da semana corrente em BRT (com `today` no formato YYYY-MM-DD).
// JS: getDay() retorna 0=domingo, 1=segunda, ..., 6=sábado.
function startOfWeekBrt(brtDay: string): string {
    const [y, m, d] = brtDay.split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    const dayOfWeek = dt.getUTCDay(); // 0=Sun..6=Sat
    return addDaysBrt(brtDay, -dayOfWeek);
}

function startOfMonthBrt(brtDay: string): string {
    const [y, m] = brtDay.split("-");
    return `${y}-${m}-01`;
}

function endOfPreviousMonthBrt(brtDay: string): string {
    const [y, m] = brtDay.split("-").map(Number);
    // Último dia do mês anterior = dia 0 do mês corrente em UTC
    const dt = new Date(Date.UTC(y, m - 1, 0));
    const yy = dt.getUTCFullYear();
    const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(dt.getUTCDate()).padStart(2, "0");
    return `${yy}-${mm}-${dd}`;
}

function startOfPreviousMonthBrt(brtDay: string): string {
    const lastDay = endOfPreviousMonthBrt(brtDay);
    const [y, m] = lastDay.split("-");
    return `${y}-${m}-01`;
}

function diffDaysBrt(startBrt: string, endBrt: string): number {
    const sUtc = Date.UTC(
        ...(startBrt.split("-").map(Number) as [number, number, number]).map(
            (x, i) => (i === 1 ? x - 1 : x),
        ) as [number, number, number],
    );
    const eUtc = Date.UTC(
        ...(endBrt.split("-").map(Number) as [number, number, number]).map(
            (x, i) => (i === 1 ? x - 1 : x),
        ) as [number, number, number],
    );
    return Math.round((eUtc - sUtc) / (24 * 60 * 60 * 1000));
}

// ─── Resolução central ──────────────────────────────────────────────────────
/** Converte uma seleção em range UTC concreto. `now` é injetável para testes. */
export function resolvePeriod(
    selection: PeriodSelection,
    now: Date = new Date(),
): PeriodRange {
    const today = todayBrtCalendar(now);
    let startBrt: string;
    let endBrt: string;
    let label: string;

    switch (selection.preset) {
        case "today":
            startBrt = today;
            endBrt = today;
            label = "Hoje";
            break;
        case "yesterday": {
            const y = addDaysBrt(today, -1);
            startBrt = y;
            endBrt = y;
            label = "Ontem";
            break;
        }
        case "this-week":
            startBrt = startOfWeekBrt(today);
            endBrt = today;
            label = "Esta semana";
            break;
        case "last-week": {
            const sunOfThisWeek = startOfWeekBrt(today);
            const satOfLastWeek = addDaysBrt(sunOfThisWeek, -1);
            const sunOfLastWeek = addDaysBrt(satOfLastWeek, -6);
            startBrt = sunOfLastWeek;
            endBrt = satOfLastWeek;
            label = "Semana passada";
            break;
        }
        case "last-7-days":
            startBrt = addDaysBrt(today, -6);
            endBrt = today;
            label = "Últimos 7 dias";
            break;
        case "this-month":
            startBrt = startOfMonthBrt(today);
            endBrt = today;
            label = "Este mês";
            break;
        case "last-month":
            startBrt = startOfPreviousMonthBrt(today);
            endBrt = endOfPreviousMonthBrt(today);
            label = "Mês passado";
            break;
        case "last-30-days":
            startBrt = addDaysBrt(today, -29);
            endBrt = today;
            label = "Últimos 30 dias";
            break;
        case "last-90-days":
            startBrt = addDaysBrt(today, -89);
            endBrt = today;
            label = "Últimos 90 dias";
            break;
        case "last-180-days":
            startBrt = addDaysBrt(today, -179);
            endBrt = today;
            label = "Últimos 180 dias";
            break;
        case "last-365-days":
            startBrt = addDaysBrt(today, -364);
            endBrt = today;
            label = "Último ano";
            break;
        case "all-time":
            // 10 anos atrás = "tudo" pragmaticamente
            startBrt = addDaysBrt(today, -3650);
            endBrt = today;
            label = "Todo o período";
            break;
        case "custom": {
            if (
                !selection.customStart ||
                !selection.customEnd ||
                !ISO_DATE_RE.test(selection.customStart) ||
                !ISO_DATE_RE.test(selection.customEnd) ||
                selection.customEnd < selection.customStart
            ) {
                // Fallback seguro
                startBrt = addDaysBrt(today, -179);
                endBrt = today;
                label = "Personalizado (inválido — usando 180d)";
                break;
            }
            startBrt = selection.customStart;
            endBrt = selection.customEnd;
            label = `${formatBrtLabel(startBrt)} – ${formatBrtLabel(endBrt)}`;
            break;
        }
    }

    const start = brtCalendarDayToUtc(startBrt, "start");
    const end = brtCalendarDayToUtc(endBrt, "end");
    const daysBack = diffDaysBrt(startBrt, today) + 1; // inclusivo

    return { start, end, daysBack, label, preset: selection.preset };
}

function formatBrtLabel(brtDay: string): string {
    const [y, m, d] = brtDay.split("-");
    return `${d}/${m}/${y}`;
}

// ─── localStorage (com migração do schema antigo) ──────────────────────────
const STORAGE_KEY = "ww-period-selection";
const LEGACY_KEY = "ww-global-period";

const LEGACY_MAP: Record<string, PeriodPresetId> = {
    "30": "last-30-days",
    "90": "last-90-days",
    "180": "last-180-days",
    "365": "last-365-days",
    "0": "all-time",
};

export function loadPeriodFromStorage(): PeriodSelection {
    if (typeof window === "undefined") return DEFAULT_SELECTION;
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw) as PeriodSelection;
            if (isValidSelection(parsed)) return parsed;
        }
        // Migra do legacy "ww-global-period"
        const legacy = window.localStorage.getItem(LEGACY_KEY);
        if (legacy && LEGACY_MAP[legacy]) {
            const migrated: PeriodSelection = { preset: LEGACY_MAP[legacy] };
            window.localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
            return migrated;
        }
    } catch {
        // ignora corrupção
    }
    return DEFAULT_SELECTION;
}

export function savePeriodToStorage(selection: PeriodSelection): void {
    if (typeof window === "undefined") return;
    try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(selection));
        // Mantém o legacy em sync (caso algum código antigo ainda leia)
        const legacy = legacyEquivalent(selection.preset);
        if (legacy !== null) {
            window.localStorage.setItem(LEGACY_KEY, legacy);
        }
    } catch {
        // ignora corrupção
    }
}

function isValidSelection(s: unknown): s is PeriodSelection {
    if (!s || typeof s !== "object") return false;
    const obj = s as Record<string, unknown>;
    return typeof obj.preset === "string" && PRESET_CATALOG.some((p) => p.id === obj.preset);
}

function legacyEquivalent(preset: PeriodPresetId): string | null {
    switch (preset) {
        case "last-30-days": return "30";
        case "last-90-days": return "90";
        case "last-180-days": return "180";
        case "last-365-days": return "365";
        case "all-time": return "0";
        default: return null; // sem mapeamento; legacy fica intocado
    }
}

// ─── Bridge para JornadaPeriod (usado pelo motor de Jornada) ───────────────
// `JornadaPeriod` (lib/metrics-jornada.ts) usa `to` exclusivo (millisegundo
// após o último instante do período), enquanto `PeriodRange.end` é inclusivo.
// Compensamos com +1ms.
export interface JornadaPeriodLite {
    from: Date;
    to: Date;
    label: string;
}

export function toJornadaPeriod(
    selection: PeriodSelection,
    now: Date = new Date(),
): JornadaPeriodLite {
    const r = resolvePeriod(selection, now);
    return {
        from: r.start,
        to: new Date(r.end.getTime() + 1),
        label: r.label,
    };
}

// ─── Test exports ───────────────────────────────────────────────────────────
export const __testing = {
    todayBrtCalendar,
    addDaysBrt,
    startOfWeekBrt,
    startOfMonthBrt,
    startOfPreviousMonthBrt,
    endOfPreviousMonthBrt,
    diffDaysBrt,
    brtCalendarDayToUtc,
};
