"use client";

import { useMemo, useState } from "react";
import {
    ResponsiveContainer,
    LineChart, Line,
    BarChart, Bar,
    AreaChart, Area,
    XAxis, YAxis, Tooltip,
} from "recharts";
import { T } from "./theme";
import { type WonDeal } from "@/lib/schemas";
import {
    type StageKey,
    type Granularity,
    type JornadaPeriod,
    bucketTimeSeries,
    STAGE_DEFS,
} from "@/lib/metrics-jornada";

type ChartType = "linha" | "barra" | "area";

interface StageChartProps {
    deals: WonDeal[];
    periodo: JornadaPeriod;
    periodoAnterior: JornadaPeriod;
    stageRange: [StageKey, StageKey];
}

type ConversionKey = `${StageKey}→${StageKey}`;

interface MetricOption {
    id: string;
    label: string;
    color: string;
    strokePattern: string;
    isRate: boolean;
    getValue: (stageCounts: Record<StageKey, number>, prevStageCounts?: Record<StageKey, number>) => number | null;
}

const COLOR_POOL = ["#7AB8FF", "#D4A35A", "#C2758A", "#3DBF8A", "#E08C3A", "#E05252", "#9F7AEA"];

// Distinct stroke patterns per metric so series remain distinguishable
// even without color (colorblind users, print). Applied by index.
const STROKE_PATTERN_POOL = ["0", "6 3", "2 3", "8 3 2 3", "4 2 1 2", "10 3 1 3"];

function stageLabel(key: StageKey): string {
    return STAGE_DEFS.find((s) => s.key === key)?.label ?? key;
}

function buildMetrics(stageRange: [StageKey, StageKey]): MetricOption[] {
    const allKeys = STAGE_DEFS.map((s) => s.key);
    const fromIdx = allKeys.indexOf(stageRange[0]);
    const toIdx = allKeys.indexOf(stageRange[1]);
    const keys = allKeys.slice(fromIdx, toIdx + 1);

    const metrics: MetricOption[] = [];
    // Count metrics
    keys.forEach((k, i) => {
        metrics.push({
            id: `count:${k}`,
            label: stageLabel(k),
            color: COLOR_POOL[i % COLOR_POOL.length],
            strokePattern: STROKE_PATTERN_POOL[i % STROKE_PATTERN_POOL.length],
            isRate: false,
            getValue: (counts) => counts[k],
        });
    });
    // Rate metrics (transitions)
    for (let i = 1; i < keys.length; i++) {
        const prev = keys[i - 1];
        const cur = keys[i];
        const idx = keys.length + i;
        metrics.push({
            id: `rate:${prev}→${cur}`,
            label: `Taxa ${stageLabel(prev)} → ${stageLabel(cur)}`,
            color: COLOR_POOL[idx % COLOR_POOL.length],
            strokePattern: STROKE_PATTERN_POOL[idx % STROKE_PATTERN_POOL.length],
            isRate: true,
            getValue: (counts) => {
                const p = counts[prev];
                const c = counts[cur];
                if (p <= 0) return null;
                return (c / p) * 100;
            },
        });
    }
    return metrics;
}

const CARD: React.CSSProperties = {
    background: "transparent",
    border: `1px solid ${T.border}`,
    borderRadius: 12,
    padding: "18px 22px",
    marginTop: 20,
};

const PILL_ACTIVE: React.CSSProperties = {
    background: T.surface,
    color: T.white,
    border: `1px solid ${T.border}`,
};
const PILL_INACTIVE: React.CSSProperties = {
    background: "transparent",
    color: T.muted,
    border: `1px solid ${T.border}`,
};

function PillGroup<T extends string>({
    options, value, onChange,
}: {
    options: { id: T; label: string }[];
    value: T;
    onChange: (v: T) => void;
}) {
    return (
        <div style={{ display: "flex", gap: 0 }}>
            {options.map((o, i) => (
                <button
                    key={o.id}
                    onClick={() => onChange(o.id)}
                    style={{
                        ...(value === o.id ? PILL_ACTIVE : PILL_INACTIVE),
                        padding: "6px 12px",
                        fontSize: 11,
                        fontWeight: 600,
                        cursor: "pointer",
                        fontFamily: "inherit",
                        borderRadius:
                            i === 0 ? "6px 0 0 6px" :
                            i === options.length - 1 ? "0 6px 6px 0" : "0",
                        borderLeft: i === 0 ? `1px solid ${T.border}` : "none",
                    }}
                >
                    {o.label}
                </button>
            ))}
        </div>
    );
}

function formatRate(v: number | null | undefined): string {
    return v == null ? "—" : `${v.toFixed(1)}%`;
}

function ChartTooltip({ active, payload, label }: any) {
    if (!active || !payload?.length) return null;
    return (
        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, padding: "10px 14px", fontSize: 11 }}>
            <div style={{ color: T.white, fontWeight: 700, marginBottom: 6 }}>{label}</div>
            {payload.map((p: any) => (
                <div key={p.dataKey} style={{ color: p.color, padding: "2px 0" }}>
                    {p.name}: <strong>{p.dataKey.includes("rate:") ? formatRate(p.value) : p.value ?? "—"}</strong>
                </div>
            ))}
        </div>
    );
}

export function StageChart({ deals, periodo, periodoAnterior, stageRange }: StageChartProps) {
    const allMetrics = useMemo(() => buildMetrics(stageRange), [stageRange]);
    const [selectedIds, setSelectedIds] = useState<string[]>(() =>
        allMetrics.filter((m) => !m.isRate).slice(0, 2).map((m) => m.id),
    );
    const [granularity, setGranularity] = useState<Granularity>("diaria");
    const [chartType, setChartType] = useState<ChartType>("linha");
    const [showPrev, setShowPrev] = useState(true);

    const series = useMemo(() => bucketTimeSeries(deals, periodo, granularity), [deals, periodo, granularity]);
    const prevSeries = useMemo(() => bucketTimeSeries(deals, periodoAnterior, granularity), [deals, periodoAnterior, granularity]);

    const data = useMemo(() => {
        return series.buckets.map((b, i) => {
            const prevB = prevSeries.buckets[i];
            const row: Record<string, number | string | null> = { name: b.label };
            for (const m of allMetrics) {
                if (!selectedIds.includes(m.id)) continue;
                row[m.id] = m.getValue(b.counts);
                if (showPrev && prevB) {
                    row[`prev:${m.id}`] = m.getValue(prevB.counts);
                }
            }
            return row;
        });
    }, [series, prevSeries, allMetrics, selectedIds, showPrev]);

    const visibleMetrics = allMetrics.filter((m) => selectedIds.includes(m.id));
    const hasRate = visibleMetrics.some((m) => m.isRate);
    const hasCount = visibleMetrics.some((m) => !m.isRate);

    const toggleMetric = (id: string) => {
        setSelectedIds((prev) => {
            if (prev.includes(id)) return prev.filter((x) => x !== id);
            if (prev.length >= 3) return prev;
            return [...prev, id];
        });
    };

    const ChartComp = chartType === "barra" ? BarChart : chartType === "area" ? AreaChart : LineChart;

    const renderSeries = (m: MetricOption, isPrev: boolean) => {
        const seriesKey = isPrev ? `prev:${m.id}` : m.id;
        const name = isPrev ? `${m.label} (período anterior)` : m.label;
        const stroke = m.color;
        // Previous period always uses a sparse dashed pattern; current uses the
        // per-metric pattern. So shape + color distinguishes every series.
        const dashArray = isPrev ? "3 3" : (m.strokePattern === "0" ? undefined : m.strokePattern);
        const common: any = {
            dataKey: seriesKey,
            name,
            stroke,
            fill: stroke,
            yAxisId: m.isRate ? "right" : "left",
            strokeDasharray: dashArray,
            opacity: isPrev ? 0.45 : 1,
            strokeWidth: isPrev ? 1 : 1.75,
            dot: false,
            activeDot: { r: 3 },
        };
        if (chartType === "barra") return <Bar key={seriesKey} {...common} fillOpacity={isPrev ? 0.25 : 0.75} />;
        if (chartType === "area") return <Area key={seriesKey} {...common} fillOpacity={isPrev ? 0.04 : 0.14} />;
        return <Line key={seriesKey} {...common} type="monotone" />;
    };

    return (
        <div style={CARD}>
            <div style={{ fontSize: 10, color: T.muted, letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 700, marginBottom: 12 }}>
                Evolução no tempo
            </div>

            {/* Metric picker */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
                {allMetrics.map((m) => {
                    const on = selectedIds.includes(m.id);
                    const disabled = !on && selectedIds.length >= 3;
                    return (
                        <button
                            key={m.id}
                            onClick={() => toggleMetric(m.id)}
                            disabled={disabled}
                            aria-pressed={on}
                            style={{
                                background: on ? `${m.color}22` : "transparent",
                                color: on ? m.color : (disabled ? T.border : T.muted),
                                border: `1px solid ${on ? m.color : T.border}`,
                                borderRadius: 6,
                                padding: "6px 12px",
                                fontSize: 11,
                                fontWeight: 600,
                                fontFamily: "inherit",
                                cursor: disabled ? "not-allowed" : "pointer",
                                opacity: disabled ? 0.5 : 1,
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 8,
                            }}
                        >
                            {/* Pattern swatch — matches the stroke used in the chart for this metric */}
                            <svg width="18" height="6" aria-hidden="true" style={{ flexShrink: 0 }}>
                                <line
                                    x1="0" y1="3" x2="18" y2="3"
                                    stroke={on ? m.color : T.muted}
                                    strokeWidth="1.75"
                                    strokeDasharray={m.strokePattern === "0" ? undefined : m.strokePattern}
                                />
                            </svg>
                            {on ? "✓ " : ""}{m.label}
                            {m.isRate ? " %" : ""}
                        </button>
                    );
                })}
            </div>

            {/* Chart controls */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 14, marginBottom: 14, alignItems: "center" }}>
                <PillGroup<Granularity>
                    options={[
                        { id: "diaria", label: "Diária" },
                        { id: "semanal", label: "Semanal" },
                        { id: "mensal", label: "Mensal" },
                    ]}
                    value={granularity}
                    onChange={setGranularity}
                />
                <PillGroup<ChartType>
                    options={[
                        { id: "linha", label: "Linhas" },
                        { id: "barra", label: "Barras" },
                        { id: "area", label: "Área" },
                    ]}
                    value={chartType}
                    onChange={setChartType}
                />
                <label style={{ fontSize: 11, color: T.muted, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
                    <input type="checkbox" checked={showPrev} onChange={(e) => setShowPrev(e.target.checked)} />
                    Comparar com período anterior
                </label>
            </div>

            <div style={{ width: "100%", height: 240 }}>
                <ResponsiveContainer>
                    <ChartComp data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                        <XAxis
                            dataKey="name"
                            stroke={T.muted}
                            fontSize={10}
                            tickLine={false}
                            axisLine={{ stroke: T.border }}
                            tick={{ fill: T.muted }}
                            interval="preserveStartEnd"
                            minTickGap={24}
                        />
                        {hasCount && (
                            <YAxis
                                yAxisId="left"
                                stroke={T.muted}
                                fontSize={10}
                                tickLine={false}
                                axisLine={false}
                                tick={{ fill: T.muted }}
                                width={34}
                            />
                        )}
                        {hasRate && (
                            <YAxis
                                yAxisId="right"
                                orientation="right"
                                stroke={T.muted}
                                fontSize={10}
                                tickLine={false}
                                axisLine={false}
                                tick={{ fill: T.muted }}
                                tickFormatter={(v) => `${v}%`}
                                width={34}
                            />
                        )}
                        {!hasCount && !hasRate && (
                            <YAxis yAxisId="left" stroke={T.muted} fontSize={10} tickLine={false} axisLine={false} />
                        )}
                        <Tooltip
                            content={<ChartTooltip />}
                            cursor={{ stroke: T.border, strokeDasharray: "2 2" }}
                        />
                        {visibleMetrics.flatMap((m) => {
                            const out = [renderSeries(m, false)];
                            if (showPrev) out.push(renderSeries(m, true));
                            return out;
                        })}
                    </ChartComp>
                </ResponsiveContainer>
            </div>

            {selectedIds.length === 0 && (
                <div style={{ textAlign: "center", fontSize: 12, color: T.muted, padding: "20px 0" }}>
                    Selecione ao menos uma métrica acima.
                </div>
            )}
        </div>
    );
}
