"use client";

import {
    AreaChart, Area, BarChart, Bar,
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
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
                <KpiCard
                    label="Leads SDR (sem.)"
                    value={m.sdrThisWeek}
                    sub={`Média 4 sem: ${m.sdrAvg4}`}
                    status={m.sdrStatus}
                    delta={`${m.sdrVsAvg > 100 ? "▲" : "▼"} ${m.sdrVsAvg.toFixed(0)}% vs média`}
                    metricKey="sdrThisWeek"
                />
                <KpiCard
                    label="Taxa Qualificação SDR"
                    value={`${m.qualRate}%`}
                    sub="Range ideal: 10–15%"
                    status={m.qualStatus}
                    delta={m.qualRate < 10 ? "🔴 Restritiva" : m.qualRate > 20 ? "🔴 Alta demais" : "✓ Normal"}
                    metricKey="qualRate"
                />
                <KpiCard
                    label="Conversão Closer MM4s"
                    value={`${m.conv_curr}%`}
                    sub={`Hist. calc: ${m.histRate}%`}
                    status={m.convStatus}
                    delta={`${m.conv_curr > m.conv_prev ? "▲" : "▼"} ${Math.abs(m.conv_curr - m.conv_prev).toFixed(1)}pp vs anterior`}
                    metricKey="conv_curr"
                />
                <KpiCard
                    label="Velocity do Pipeline"
                    value={`${m.velocity}%`}
                    sub="Meta: >60%"
                    status={m.velocityStatus}
                    delta={m.velocity >= 60 ? "✓ Deals se movendo" : "🔴 Deals travados"}
                    metricKey="velocity"
                />
                <KpiCard
                    label="Pipeline Ativo"
                    value={m.openDeals}
                    sub={`${m.pipeByStage[0]?.stage || "—"}: ${m.pipeByStage[0]?.n || 0}`}
                    status={m.pipelineStatus}
                    delta={`${m.won_curr} won · ${m.lost_curr} lost (4 sem)`}
                    metricKey="pipelineStatus"
                />
            </div>

            {/* Charts Row */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
                <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: "20px 22px" }}>
                    <SectionTitle tag={m.sdrStatus === "green" ? "🟢 SAUDÁVEL" : "🔴 CRÍTICO"} metricKey="sdrThisWeek">Volume SDR</SectionTitle>
                    <ResponsiveContainer width="100%" height={200}>
                        <AreaChart data={m.sdrWeeks} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                            <defs>
                                <linearGradient id="sg" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor={T.gold} stopOpacity={0.3} />
                                    <stop offset="95%" stopColor={T.gold} stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke={T.border} vertical={false} />
                            <XAxis dataKey="week" tick={{ fontSize: 9, fill: T.muted }} tickLine={false} axisLine={false} angle={-30} textAnchor="end" height={44} />
                            <YAxis tick={{ fontSize: 9, fill: T.muted }} tickLine={false} axisLine={false} />
                            <Tooltip content={<CustomTooltip />} />
                            {m.sdrAvg4 > 0 && (
                                <ReferenceLine y={m.sdrAvg4} stroke={T.rose} strokeDasharray="4 4" label={{ value: `Média ${m.sdrAvg4}`, fill: T.rose, fontSize: 9, position: "insideTopLeft" }} />
                            )}
                            <Area type="monotone" dataKey="leads" name="Leads SDR" stroke={T.gold} fill="url(#sg)" strokeWidth={2.5} dot={{ r: 3, fill: T.gold }} />
                        </AreaChart>
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

            {/* Consolidated Status */}
            <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: "20px 22px" }}>
                <SectionTitle>Status Consolidado do Funil</SectionTitle>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10 }}>
                    {[
                        { label: "Leads SDR", status: m.sdrStatus, val: `${m.sdrThisWeek}` },
                        { label: "Qualificação", status: m.qualStatus, val: `${m.qualRate}%` },
                        { label: "Conversão", status: m.convStatus, val: `${m.conv_curr}%` },
                        { label: "Velocity", status: m.velocityStatus, val: `${m.velocity}%` },
                        { label: "Pipeline", status: m.pipelineStatus, val: `${m.openDeals} deals` },
                    ].map((item, i) => (
                        <div
                            key={i}
                            style={{ background: T.surface, borderRadius: 10, border: `1px solid ${statusColor(item.status)}33`, padding: "14px", textAlign: "center" }}
                        >
                            <div style={{ fontSize: 22, color: statusColor(item.status), fontWeight: 800, fontFamily: "Georgia, serif" }}>{item.val}</div>
                            <div style={{ fontSize: 10, color: T.muted, marginTop: 4, textTransform: "uppercase", letterSpacing: "0.06em" }}>{item.label}</div>
                            <div style={{ marginTop: 6, fontSize: 16 }}>{item.status === "green" ? "🟢" : item.status === "orange" ? "🟡" : "🔴"}</div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
