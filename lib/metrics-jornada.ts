import type { WonDeal } from "./schemas";

export type JornadaMode = "coorte" | "evento";

export type Responsavel = "MKT" | "SDR" | "SDR→Closer" | "Closer";

export interface StageDef {
    key: StageKey;
    label: string;
    responsavel: Responsavel;
    meta?: number;
}

export type StageKey =
    | "entrada"
    | "agendou"
    | "realizou"
    | "qualificou"
    | "agCloser"
    | "realizouCloser"
    | "vendeu";

export interface StageStats {
    key: StageKey;
    label: string;
    responsavel: Responsavel;
    count: number;
    rateFromPrev: number | null;
    meta?: number;
    metaStatus?: "above" | "within" | "below";
    deals: WonDeal[];
    /** For stages where timing matters: deals whose reference date is in the past (meeting already happened or no-show'd). */
    pastCount?: number;
    /** For stages where timing matters: deals whose reference date is in the future (pending meetings). */
    futureCount?: number;
    /** For show-up stages: the denominator used for rateFromPrev (overrides prev.count — e.g. uses only past meetings). */
    denominatorLabel?: string;
}

export interface JornadaPeriod {
    from: Date;
    to: Date;
    label: string;
}

export interface JornadaResult {
    periodo: JornadaPeriod;
    mode: JornadaMode;
    stages: StageStats[];
    comparison?: JornadaResult;
}

export const STAGE_DEFS: StageDef[] = [
    { key: "entrada", label: "Pessoas que chegaram", responsavel: "MKT" },
    { key: "agendou", label: "Marcaram a 1ª reunião", responsavel: "SDR", meta: 45 },
    { key: "realizou", label: "Reunião com SDR realizada", responsavel: "SDR", meta: 65 },
    { key: "qualificou", label: "Qualificadas para o Closer", responsavel: "SDR", meta: 50 },
    { key: "agCloser", label: "Reunião com Closer marcada", responsavel: "SDR→Closer", meta: 80 },
    { key: "realizouCloser", label: "Reunião com Closer realizada", responsavel: "Closer", meta: 70 },
    { key: "vendeu", label: "Venda fechada", responsavel: "Closer", meta: 30 },
];

function isFilled(v: unknown): boolean {
    return v != null && v !== "" && v !== "Não teve reunião";
}

function isQualified(v: unknown): boolean {
    if (v == null) return false;
    const s = String(v).trim().toLowerCase();
    return s === "sim" || s === "yes" || s === "true" || s === "1";
}

function inRange(dateStr: string | null | undefined, from: Date, to: Date): boolean {
    if (!dateStr) return false;
    const t = new Date(dateStr).getTime();
    if (Number.isNaN(t)) return false;
    return t >= from.getTime() && t < to.getTime();
}

interface StagePredicates {
    coorte: (d: WonDeal) => boolean;
    evento: (d: WonDeal, p: JornadaPeriod) => boolean;
}

const PREDICATES: Record<StageKey, StagePredicates> = {
    entrada: {
        coorte: () => true,
        evento: (d, p) => inRange(d.cdate, p.from, p.to),
    },
    agendou: {
        coorte: (d) => isFilled(d.data_reuniao_1),
        evento: (d, p) => inRange(d.data_reuniao_1, p.from, p.to),
    },
    realizou: {
        coorte: (d) => isFilled(d.como_foi_feita_a_1a_reuniao),
        evento: (d, p) =>
            isFilled(d.como_foi_feita_a_1a_reuniao) && inRange(d.data_reuniao_1, p.from, p.to),
    },
    qualificou: {
        coorte: (d) => isQualified(d.qualificado_para_sql) || isFilled(d.data_qualificado),
        evento: (d, p) => inRange(d.data_qualificado, p.from, p.to),
    },
    agCloser: {
        coorte: (d) => isFilled(d.data_horario_agendamento_closer),
        evento: (d, p) => inRange(d.data_horario_agendamento_closer, p.from, p.to),
    },
    realizouCloser: {
        coorte: (d) => isFilled(d.reuniao_closer),
        evento: (d, p) =>
            isFilled(d.reuniao_closer) && inRange(d.data_horario_agendamento_closer, p.from, p.to),
    },
    vendeu: {
        coorte: (d) => isFilled(d.data_fechamento),
        evento: (d, p) => inRange(d.data_fechamento, p.from, p.to),
    },
};

function metaStatus(rate: number, meta: number): "above" | "within" | "below" {
    if (rate >= meta) return "above";
    if (rate >= meta * 0.85) return "within";
    return "below";
}

/** Date column used to split a stage into past/future for pending-meeting logic. */
const STAGE_TIMING_FIELD: Partial<Record<StageKey, keyof WonDeal>> = {
    agendou: "data_reuniao_1",
    agCloser: "data_horario_agendamento_closer",
};

/** Maps each show-up stage to the scheduling stage it measures attendance from. */
const SHOWUP_SOURCE: Partial<Record<StageKey, StageKey>> = {
    realizou: "agendou",
    realizouCloser: "agCloser",
};

function splitPastFuture(stageDeals: WonDeal[], field: keyof WonDeal, today: Date): { past: number; future: number } {
    let past = 0;
    let future = 0;
    const t = today.getTime();
    for (const d of stageDeals) {
        const v = d[field];
        if (typeof v !== "string" || !v) continue;
        const dt = new Date(v).getTime();
        if (Number.isNaN(dt)) continue;
        if (dt <= t) past++;
        else future++;
    }
    return { past, future };
}

export function computeJornada(
    deals: WonDeal[],
    periodo: JornadaPeriod,
    mode: JornadaMode,
    today: Date = new Date(),
): JornadaResult {
    const cohortDeals = mode === "coorte"
        ? deals.filter((d) => inRange(d.cdate, periodo.from, periodo.to))
        : deals;

    const stages: StageStats[] = STAGE_DEFS.map((def) => {
        const pred = PREDICATES[def.key];
        const stageDeals = mode === "coorte"
            ? cohortDeals.filter(pred.coorte)
            : cohortDeals.filter((d) => pred.evento(d, periodo));
        const out: StageStats = {
            key: def.key,
            label: def.label,
            responsavel: def.responsavel,
            count: stageDeals.length,
            rateFromPrev: null,
            meta: def.meta,
            deals: stageDeals,
        };
        const timingField = STAGE_TIMING_FIELD[def.key];
        if (timingField) {
            const { past, future } = splitPastFuture(stageDeals, timingField, today);
            out.pastCount = past;
            out.futureCount = future;
        }
        return out;
    });

    for (let i = 1; i < stages.length; i++) {
        const prev = stages[i - 1];
        const cur = stages[i];

        // If the current stage is a "show-up", measure against the source stage's past meetings only
        const sourceKey = SHOWUP_SOURCE[cur.key];
        let denominator = prev.count;
        let denominatorLabel: string | undefined;
        if (sourceKey) {
            const sourceStage = stages.find((s) => s.key === sourceKey);
            if (sourceStage?.pastCount != null) {
                denominator = sourceStage.pastCount;
                denominatorLabel = "reuniões já passadas";
            }
        }

        cur.rateFromPrev = denominator > 0 ? (cur.count / denominator) * 100 : null;
        cur.denominatorLabel = denominatorLabel;
        if (cur.rateFromPrev != null && cur.meta != null) {
            cur.metaStatus = metaStatus(cur.rateFromPrev, cur.meta);
        }
    }

    return { periodo, mode, stages };
}

function subCalendarMonth(d: Date): Date {
    return new Date(
        d.getFullYear(),
        d.getMonth() - 1,
        d.getDate(),
        d.getHours(),
        d.getMinutes(),
        d.getSeconds(),
        d.getMilliseconds(),
    );
}

function labelForPeriod(from: Date, to: Date): string {
    const isFirstOfMonth = from.getDate() === 1;
    const isFullMonth = isFirstOfMonth && to.getDate() === 1 &&
        ((to.getMonth() - from.getMonth() + 12) % 12 === 1);
    if (isFullMonth) {
        const name = from.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
        return name.charAt(0).toUpperCase() + name.slice(1);
    }
    const endInclusive = new Date(to.getTime() - 1);
    const fmt = (d: Date) =>
        d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
    return `${fmt(from)} a ${fmt(endInclusive)}`;
}

/**
 * Returns the same day-range one calendar month earlier.
 * Example: Apr 1–15 → Mar 1–15 (fair comparison, not span-based).
 */
export function previousPeriod(periodo: JornadaPeriod): JornadaPeriod {
    const from = subCalendarMonth(periodo.from);
    const to = subCalendarMonth(periodo.to);
    return { from, to, label: labelForPeriod(from, to) };
}

export function monthPeriod(year: number, month: number): JornadaPeriod {
    const from = new Date(year, month, 1);
    const to = new Date(year, month + 1, 1);
    const label = from.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
    return { from, to, label: label.charAt(0).toUpperCase() + label.slice(1) };
}

export function daysBackPeriod(daysBack: number, today: Date = new Date()): JornadaPeriod {
    const to = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
    const from = new Date(to.getTime() - daysBack * 24 * 60 * 60 * 1000);
    return { from, to, label: `Últimos ${daysBack} dias` };
}

export type SubView = "entrada-sdr" | "sdr-closer" | "closer-venda" | "completa";

export interface SubViewDef {
    id: SubView;
    title: string;
    subtitle: string;
    stageRange: [StageKey, StageKey];
    naturalWindowDays: number;
}

export const SUBVIEWS: SubViewDef[] = [
    {
        id: "entrada-sdr",
        title: "Entrada e Agendamento",
        subtitle: "Quantas pessoas chegam até nós e marcam a primeira reunião",
        stageRange: ["entrada", "agendou"],
        naturalWindowDays: 30,
    },
    {
        id: "sdr-closer",
        title: "Reunião e Qualificação",
        subtitle: "Da primeira conversa até a passagem para o Closer",
        stageRange: ["agendou", "agCloser"],
        naturalWindowDays: 60,
    },
    {
        id: "closer-venda",
        title: "Fechamento",
        subtitle: "Da reunião com o Closer até a venda fechada",
        stageRange: ["agCloser", "vendeu"],
        naturalWindowDays: 90,
    },
    {
        id: "completa",
        title: "Visão Completa",
        subtitle: "Do primeiro contato até a venda fechada",
        stageRange: ["entrada", "vendeu"],
        naturalWindowDays: 90,
    },
];

// ─── TIME-SERIES BUCKETING ────────────────────────────────────────────────────

export type Granularity = "diaria" | "semanal" | "mensal";

/** Date field used for "evento" counting of each stage. */
export const STAGE_EVENT_DATE: Record<StageKey, keyof WonDeal> = {
    entrada: "cdate",
    agendou: "data_reuniao_1",
    realizou: "data_reuniao_1",
    qualificou: "data_qualificado",
    agCloser: "data_horario_agendamento_closer",
    realizouCloser: "data_horario_agendamento_closer",
    vendeu: "data_fechamento",
};

/** Additional predicate beyond the date field — e.g. "realizou" needs como_foi_feita_a_1a_reuniao set. */
const STAGE_EXTRA: Partial<Record<StageKey, (d: WonDeal) => boolean>> = {
    realizou: (d) =>
        d.como_foi_feita_a_1a_reuniao != null &&
        d.como_foi_feita_a_1a_reuniao !== "" &&
        d.como_foi_feita_a_1a_reuniao !== "Não teve reunião",
    realizouCloser: (d) => d.reuniao_closer != null && d.reuniao_closer !== "",
};

function startOfDay(d: Date): Date {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function startOfWeek(d: Date): Date {
    // ISO week — Monday as start
    const day = d.getDay();
    const diff = day === 0 ? 6 : day - 1;
    const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - diff);
    return monday;
}

function startOfMonth(d: Date): Date {
    return new Date(d.getFullYear(), d.getMonth(), 1);
}

function bucketStart(d: Date, g: Granularity): Date {
    if (g === "diaria") return startOfDay(d);
    if (g === "semanal") return startOfWeek(d);
    return startOfMonth(d);
}

function bucketStep(d: Date, g: Granularity): Date {
    if (g === "diaria") return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
    if (g === "semanal") return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7);
    return new Date(d.getFullYear(), d.getMonth() + 1, 1);
}

function formatBucket(d: Date, g: Granularity): string {
    if (g === "diaria") {
        return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
    }
    if (g === "semanal") {
        const end = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 6);
        return `${d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} – ${end.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}`;
    }
    return d.toLocaleDateString("pt-BR", { month: "short", year: "numeric" });
}

export interface TimeSeriesBucket {
    key: string;
    label: string;
    start: Date;
    counts: Record<StageKey, number>;
}

export interface TimeSeries {
    buckets: TimeSeriesBucket[];
    granularity: Granularity;
}

function parseDate(s: string | null | undefined): Date | null {
    if (!s) return null;
    const t = new Date(s).getTime();
    if (Number.isNaN(t)) return null;
    return new Date(t);
}

export function bucketTimeSeries(
    deals: WonDeal[],
    periodo: JornadaPeriod,
    granularity: Granularity,
): TimeSeries {
    const buckets: TimeSeriesBucket[] = [];
    let cursor = bucketStart(periodo.from, granularity);
    while (cursor.getTime() < periodo.to.getTime()) {
        const key = cursor.toISOString().slice(0, 10);
        buckets.push({
            key,
            label: formatBucket(cursor, granularity),
            start: new Date(cursor),
            counts: {
                entrada: 0, agendou: 0, realizou: 0, qualificou: 0,
                agCloser: 0, realizouCloser: 0, vendeu: 0,
            },
        });
        cursor = bucketStep(cursor, granularity);
    }
    if (buckets.length === 0) return { buckets, granularity };

    const lookup = new Map<string, TimeSeriesBucket>();
    for (const b of buckets) lookup.set(b.key, b);

    const findBucket = (d: Date): TimeSeriesBucket | undefined => {
        const bs = bucketStart(d, granularity);
        return lookup.get(bs.toISOString().slice(0, 10));
    };

    for (const deal of deals) {
        for (const stageKey of Object.keys(STAGE_EVENT_DATE) as StageKey[]) {
            const field = STAGE_EVENT_DATE[stageKey];
            const rawVal = deal[field];
            const raw = typeof rawVal === "string" ? rawVal : null;
            const d = parseDate(raw);
            if (!d) continue;
            if (d.getTime() < periodo.from.getTime() || d.getTime() >= periodo.to.getTime()) continue;
            const extra = STAGE_EXTRA[stageKey];
            if (extra && !extra(deal)) continue;
            const b = findBucket(d);
            if (b) b.counts[stageKey]++;
        }
    }

    return { buckets, granularity };
}

export interface DropoutBreakdown {
    key: string;
    label: string;
    count: number;
}

export interface DropoutAnalysis {
    total: number;
    /** Deals in the dropout set */
    deals: WonDeal[];
    /** Deals whose status is "1" (still open / in contact) */
    stillOpen: { total: number; byStage: DropoutBreakdown[]; deals: WonDeal[] };
    /** Deals whose status is "2" (Lost) */
    lost: { total: number; byReason: DropoutBreakdown[]; deals: WonDeal[] };
    /** Other (e.g. Won but without having passed through this stage — rare) */
    other: { total: number; deals: WonDeal[] };
}

function countBy<T>(items: T[], keyFn: (x: T) => string | null | undefined, labelFn?: (key: string) => string): DropoutBreakdown[] {
    const bucket = new Map<string, number>();
    for (const it of items) {
        const k = keyFn(it);
        if (k == null || k === "") continue;
        bucket.set(k, (bucket.get(k) ?? 0) + 1);
    }
    return [...bucket.entries()]
        .map(([key, count]) => ({ key, label: labelFn ? labelFn(key) : key, count }))
        .sort((a, b) => b.count - a.count);
}

/**
 * For a pair of consecutive stages, identifies the deals that didn't cross the boundary
 * and breaks them down by current status / stage / motivo de desqualificação.
 */
export function computeDropout(fromStage: StageStats, toStage: StageStats): DropoutAnalysis {
    const toIds = new Set(toStage.deals.map((d) => d.id));
    const dropout = fromStage.deals.filter((d) => !toIds.has(d.id));

    const stillOpen = dropout.filter((d) => d.status !== "2" && !d.data_fechamento);
    const lost = dropout.filter((d) => d.status === "2" && !d.data_fechamento);
    const other = dropout.filter((d) => !!d.data_fechamento);

    return {
        total: dropout.length,
        deals: dropout,
        stillOpen: {
            total: stillOpen.length,
            byStage: countBy(stillOpen, (d) => d.stage),
            deals: stillOpen,
        },
        lost: {
            total: lost.length,
            byReason: countBy(lost, (d) =>
                d.motivo_desqualificacao_sdr ||
                d.motivo_de_perda ||
                d.ww_closer_motivo_de_perda ||
                null,
            ),
            deals: lost,
        },
        other: {
            total: other.length,
            deals: other,
        },
    };
}

export function sliceStages(stages: StageStats[], range: [StageKey, StageKey]): StageStats[] {
    const fromIdx = stages.findIndex((s) => s.key === range[0]);
    const toIdx = stages.findIndex((s) => s.key === range[1]);
    if (fromIdx === -1 || toIdx === -1) return stages;
    return stages.slice(fromIdx, toIdx + 1);
}

/**
 * Target conversion rate between two stages — product of individual stage metas.
 * Example: MKT→SDR handoff with meta 45% gives 45; SDR→Closer with metas 65·50·80 gives ~26%.
 */
export function targetRateBetween(
    stages: StageStats[],
    from: StageKey,
    to: StageKey,
): number | null {
    const fromIdx = stages.findIndex((s) => s.key === from);
    const toIdx = stages.findIndex((s) => s.key === to);
    if (fromIdx === -1 || toIdx === -1 || toIdx <= fromIdx) return null;
    let product = 1;
    for (let i = fromIdx + 1; i <= toIdx; i++) {
        const m = stages[i].meta;
        if (m == null) return null;
        product *= m / 100;
    }
    return product * 100;
}
