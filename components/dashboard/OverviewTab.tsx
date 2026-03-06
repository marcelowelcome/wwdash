"use client";

import { useState, useMemo } from "react";
import {
    ComposedChart, Line, BarChart, Bar,
    XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, ReferenceLine, Cell
} from "recharts";
import { KpiCard } from "./KpiCard";
import { SectionTitle } from "./SectionTitle";
import { CustomTooltip } from "./CustomTooltip";
import { T, statusColor } from "./theme";
import { computeOverviewMetrics } from "@/lib/metrics-overview";
import { type Deal } from "@/lib/schemas";

interface OverviewTabProps {
    sdrDeals: Deal[];
    closerDeals: Deal[];
    wonDeals: Deal[];
    fieldMap: Record<string, string>;
    stageMap: Record<string, string>;
}

function getWeekStart(): string {
    const now = new Date();
    const day = now.getDay();
    const diff = day === 0 ? 6 : day - 1;
    const monday = new Date(now);
    monday.setDate(now.getDate() - diff);
    return monday.toISOString().slice(0, 10);
}

function todayStr(): string {
    return new Date().toISOString().slice(0, 10);
}

function daysAgoStr(n: number): string {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d.toISOString().slice(0, 10);
}

type Shortcut = "week" | "4weeks" | "3months" | "full" | null;

function detectShortcut(startStr: string, endStr: string): Shortcut {
    const today = todayStr();
    if (endStr !== today) return null;
    if (startStr === getWeekStart()) return "week";
    if (startStr === daysAgoStr(28)) return "4weeks";
    if (startStr === daysAgoStr(90)) return "3months";
    if (startStr <= "2020-01-01") return "full";
    return null;
}

export function OverviewTab({ sdrDeals, closerDeals, wonDeals, fieldMap, stageMap }: OverviewTabProps) {
    const [startStr, setStartStr] = useState(getWeekStart);
    const [endStr, setEndStr] = useState(todayStr);

    const activeShortcut = detectShortcut(startStr, endStr);

    const periodStart = useMemo(() => {
        const d = new Date(startStr + "T00:00:00");
        return isNaN(d.getTime()) ? new Date() : d;
    }, [startStr]);

    const periodEnd = useMemo(() => {
        const d = new Date(endStr + "T23:59:59");
        return isNaN(d.getTime()) ? new Date() : d;
    }, [endStr]);

    const m = useMemo(
        () => computeOverviewMetrics(sdrDeals, closerDeals, wonDeals, fieldMap, stageMap, periodStart, periodEnd),
        [sdrDeals, closerDeals, wonDeals, fieldMap, stageMap, periodStart, periodEnd]
    );

    const applyShortcut = (key: string) => {
        const today = todayStr();
        setEndStr(today);
        switch (key) {
            case "week": setStartStr(getWeekStart()); break;
            case "4weeks": setStartStr(daysAgoStr(28)); break;
            case "3months": setStartStr(daysAgoStr(90)); break;
            case "full": setStartStr("2020-01-01"); break;
        }
    };

    const shortcuts = [
        { key: "week", label: "Semana" },
        { key: "4weeks", label: "4 Semanas" },
        { key: "3months", label: "3 Meses" },
        { key: "full", label: "Tudo" },
    ];

    const inputStyle: React.CSSProperties = {
        background: T.surface,
        color: T.white,
        border: `1px solid ${T.border}`,
        borderRadius: 6,
        padding: "4px 8px",
        fontSize: 11,
        fontFamily: "inherit",
        cursor: "pointer",
        colorScheme: "dark",
    };

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
            {/* Period Selector */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8, flexWrap: "wrap" }}>
                {shortcuts.map(s => (
                    <button
                        key={s.key}
                        onClick={() => applyShortcut(s.key)}
                        style={{
                            background: activeShortcut === s.key ? T.gold : T.card,
                            color: activeShortcut === s.key ? T.bg : T.muted,
                            border: `1px solid ${T.border}`,
                            borderRadius: 6,
                            padding: "4px 10px",
                            fontSize: 11,
                            fontWeight: 600,
                            cursor: "pointer",
                            transition: "all 0.2s"
                        }}
                    >
                        {s.label}
                    </button>
                ))}
                <span style={{ color: T.muted, fontSize: 11, margin: "0 4px" }}>|</span>
                <input
                    type="date"
                    value={startStr}
                    onChange={e => setStartStr(e.target.value)}
                    style={inputStyle}
                />
                <span style={{ color: T.muted, fontSize: 11 }}>ate</span>
                <input
                    type="date"
                    value={endStr}
                    onChange={e => setEndStr(e.target.value)}
                    style={inputStyle}
                />
            </div>

            {/* KPI Row */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 14 }}>
                <KpiCard
                    label="Leads SDR"
                    value={m.sdrLeads}
                    status={m.sdrStatus}
                    delta={`Media ${m.sdrAvgPerWeek}/sem.`}
                    metricKey="sdrThisWeek"
                />
                <KpiCard
                    label="Conversao Closer"
                    value={`${m.conv_curr}%`}
                    status={m.convStatus}
                    delta={`${m.conv_curr > m.histRate ? "▲" : "▼"} vs ${m.histRate}% bench`}
                    metricKey="conv_curr"
                />
                <KpiCard
                    label="Ganhos / Perdidos"
                    value={`${m.wonCount} / ${m.lostCount}`}
                    sub="no periodo"
                    status={m.convStatus}
                />
                <KpiCard
                    label="Deals Closer em aberto"
                    value={m.openDeals}
                    sub={`${m.sentContractsCount} contratos enviados`}
                    status={m.pipelineStatus}
                    metricKey="openDeals"
                />
                <KpiCard
                    label="Casamentos em plan."
                    value={m.planActiveCount}
                    sub={`${m.planCancelledCount} cancelamentos hist.`}
                    status="green"
                />
            </div>

            {/* Alertas Ativos */}
            {m.activeAlerts && m.activeAlerts.length > 0 && (
                <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: "16px 22px" }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: T.white, marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
                        ALERTAS ATIVOS
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {m.activeAlerts.map((alert, i) => (
                            <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12 }}>
                                <span style={{ color: statusColor(alert.type) }}>●</span>
                                <span style={{ color: T.white }}>{alert.message}</span>
                                {alert.action && (
                                    <span style={{ color: T.gold, fontWeight: 600, marginLeft: 4 }}>— {alert.action}</span>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Charts Row */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
                <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: "20px 22px" }}>
                    <SectionTitle tag={m.sdrStatus === "green" ? "SAUDAVEL" : "CRITICO"} metricKey="sdrThisWeek">Volume SDR</SectionTitle>
                    <ResponsiveContainer width="100%" height={200}>
                        <ComposedChart data={m.sdrWeeklyHistory} margin={{ top: 20, right: 4, bottom: 0, left: -20 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke={T.border} vertical={false} />
                            <XAxis dataKey="week" tick={{ fontSize: 9, fill: T.muted }} tickLine={false} axisLine={false} angle={-30} textAnchor="end" height={44} />
                            <YAxis tick={{ fontSize: 9, fill: T.muted }} tickLine={false} axisLine={false} />
                            <Tooltip content={<CustomTooltip />} />
                            <Bar dataKey="leads" name="Volume SDR" fill={T.berry} radius={[4, 4, 0, 0]} barSize={32} />
                            <Line type="monotone" dataKey="qualRate" name="Taxa Qual. (%)" stroke={T.gold} strokeWidth={2.5} dot={false} />
                        </ComposedChart>
                    </ResponsiveContainer>
                </div>

                <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: "20px 22px" }}>
                    <SectionTitle tag={m.convStatus === "red" ? "CRITICO" : m.convStatus === "orange" ? "ATENCAO" : "SAUDAVEL"} metricKey="conv_curr">Conversao Closer</SectionTitle>
                    <ResponsiveContainer width="100%" height={200}>
                        <BarChart data={m.convTrend} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke={T.border} vertical={false} />
                            <XAxis dataKey="periodo" tick={{ fontSize: 9, fill: T.muted }} tickLine={false} axisLine={false} angle={-20} textAnchor="end" height={42} />
                            <YAxis tick={{ fontSize: 9, fill: T.muted }} tickLine={false} axisLine={false} tickFormatter={(v: number) => v + "%"} domain={[0, Math.max(60, ...m.convTrend.map((d) => d.taxa)) + 10]} />
                            <Tooltip content={<CustomTooltip />} />
                            {m.histRate > 0 && (
                                <ReferenceLine y={m.histRate} stroke={T.gold} strokeDasharray="4 4" label={{ value: `Hist ${m.histRate}%`, fill: T.gold, fontSize: 9, position: "insideTopLeft" }} />
                            )}
                            <ReferenceLine y={20} stroke={T.red} strokeDasharray="3 3" label={{ value: "20%", fill: T.red, fontSize: 9, position: "insideBottomRight" }} />
                            <Bar dataKey="taxa" name="Taxa %" radius={[4, 4, 0, 0]}>
                                {m.convTrend.map((d, i) => (
                                    <Cell key={i} fill={d.taxa < 20 ? "#A03030" : d.taxa < 25 ? T.orange : T.green} />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Snapshot do Pipeline Closer */}
            <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: "20px 22px" }}>
                <SectionTitle>Snapshot do Pipeline Closer</SectionTitle>
                <div style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 8 }}>
                    {m.pipeByStage.map((stageItem, i) => (
                        <div
                            key={i}
                            style={{
                                flex: 1,
                                minWidth: 140,
                                background: T.surface,
                                borderRadius: 10,
                                border: `1px solid ${T.border}`,
                                padding: "14px",
                                textAlign: "center",
                                display: "flex",
                                flexDirection: "column",
                                alignItems: "center",
                                justifyContent: "center"
                            }}
                        >
                            <div style={{ fontSize: 11, color: T.muted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6, minHeight: 28, display: "flex", alignItems: "center" }}>
                                {stageItem.stage}
                            </div>
                            <div style={{ fontSize: 22, color: T.gold, fontWeight: 800, fontFamily: "Georgia, serif" }}>
                                {stageItem.n}
                            </div>
                        </div>
                    ))}
                    {m.pipeByStage.length === 0 && (
                        <div style={{ fontSize: 13, color: T.muted, padding: "20px 0" }}>Nenhum negocio ativo no momento.</div>
                    )}
                </div>
            </div>
        </div>
    );
}
