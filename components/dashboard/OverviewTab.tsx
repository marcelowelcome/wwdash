"use client";

import {
    ComposedChart, Line, BarChart, Bar,
    XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, ReferenceLine, Cell
} from "recharts";
import { KpiCard } from "./KpiCard";
import { SectionTitle } from "./SectionTitle";
import { CustomTooltip } from "./CustomTooltip";
import { T, statusColor } from "./theme";
import { type Metrics } from "@/lib/metrics";

interface OverviewTabProps {
    m: Metrics;
}

export function OverviewTab({ m }: OverviewTabProps) {
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
            {/* KPI Row */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 14 }}>
                <KpiCard
                    label="Leads SDR (sem.)"
                    value={m.sdrThisWeek}
                    status={m.sdrStatus}
                    delta={`${m.sdrVsAvg > 100 ? "▲" : "▼"} ${Math.abs(m.sdrThisWeek - m.sdrAvg4).toFixed(0)} vs MM4s`}
                    metricKey="sdrThisWeek"
                />
                <KpiCard
                    label="Média 4 sem (SDR)"
                    value={m.sdrAvg4}
                    sub="Linha de base"
                    status="green"
                    metricKey="sdrAvg4"
                />
                <KpiCard
                    label="Conversão Closer MM4s"
                    value={`${m.conv_curr}%`}
                    status={m.convStatus}
                    delta={`${m.conv_curr > m.histRate ? "▲" : "▼"} vs ${m.histRate}% bench`}
                    metricKey="conv_curr"
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
                        ⚠ ALERTAS ATIVOS
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {m.activeAlerts.map((alert, i) => (
                            <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12 }}>
                                <span>{alert.type === "red" ? "🔴" : alert.type === "orange" ? "🟡" : "🟢"}</span>
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
                    <SectionTitle tag={m.sdrStatus === "green" ? "🟢 SAUDÁVEL" : "🔴 CRÍTICO"} metricKey="sdrThisWeek">Volume SDR</SectionTitle>
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
                    <SectionTitle tag={m.convStatus === "red" ? "🔴 CRÍTICO" : m.convStatus === "orange" ? "🟡 ATENÇÃO" : "🟢 SAUDÁVEL"} metricKey="conv_curr">Conversão Closer MM4s</SectionTitle>
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
                        <div style={{ fontSize: 13, color: T.muted, padding: "20px 0" }}>Nenhum negócio ativo no momento.</div>
                    )}
                </div>
            </div>
        </div>
    );
}
