"use client";

import {
    AreaChart, Area, BarChart, Bar,
    XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, ReferenceLine, Cell
} from "recharts";
import { SectionTitle } from "./SectionTitle";
import { CustomTooltip } from "./CustomTooltip";
import { T } from "./theme";
import { type Metrics } from "@/lib/metrics";

interface FunnelTabProps {
    m: Metrics;
}

export function FunnelTab({ m }: FunnelTabProps) {
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
                {/* SDR Volume Chart */}
                <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: "20px 22px" }}>
                    <SectionTitle metricKey="sdrThisWeek">Volume SDR por Semana</SectionTitle>
                    <ResponsiveContainer width="100%" height={240}>
                        <AreaChart data={m.sdrWeeks} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                            <defs>
                                <linearGradient id="sg2" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor={T.gold} stopOpacity={0.25} />
                                    <stop offset="95%" stopColor={T.gold} stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke={T.border} vertical={false} />
                            <XAxis dataKey="week" tick={{ fontSize: 9, fill: T.muted }} tickLine={false} axisLine={false} angle={-35} textAnchor="end" height={50} />
                            <YAxis tick={{ fontSize: 9, fill: T.muted }} tickLine={false} axisLine={false} />
                            <Tooltip content={<CustomTooltip />} />
                            {m.sdrAvg4 > 0 && (
                                <ReferenceLine y={m.sdrAvg4} stroke={T.rose} strokeDasharray="4 4" label={{ value: `Média: ${m.sdrAvg4}`, fill: T.rose, fontSize: 9, position: "insideTopLeft" }} />
                            )}
                            <Area type="monotone" dataKey="leads" name="Leads SDR" stroke={T.gold} fill="url(#sg2)" strokeWidth={2.5} />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>

                {/* Qualification Rate Chart */}
                <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: "20px 22px" }}>
                    <SectionTitle metricKey="qualRate">Taxa de Qualificação SDR → Closer</SectionTitle>
                    <ResponsiveContainer width="100%" height={240}>
                        <BarChart data={m.sdrQualTrend} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke={T.border} vertical={false} />
                            <XAxis dataKey="week" tick={{ fontSize: 9, fill: T.muted }} tickLine={false} axisLine={false} angle={-25} textAnchor="end" height={46} />
                            <YAxis tick={{ fontSize: 9, fill: T.muted }} tickLine={false} axisLine={false} tickFormatter={(v: number) => v + "%"} domain={[0, 30]} />
                            <Tooltip content={<CustomTooltip />} />
                            <ReferenceLine y={10} stroke={T.red} strokeDasharray="3 3" label={{ value: "Min 10%", fill: T.red, fontSize: 9, position: "insideBottomLeft" }} />
                            <ReferenceLine y={15} stroke={T.green} strokeDasharray="3 3" label={{ value: "Ideal 15%", fill: T.green, fontSize: 9, position: "insideTopRight" }} />
                            <Bar dataKey="taxa" name="Taxa qualificação" radius={[4, 4, 0, 0]}>
                                {m.sdrQualTrend.map((d, i) => (
                                    <Cell key={i} fill={d.taxa < 10 ? T.red : d.taxa > 20 ? T.orange : T.rose} />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Funnel of Current Week */}
            <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: "20px 22px" }}>
                <SectionTitle metricKey="qualRate">Funil da Semana Atual</SectionTitle>
                <div style={{ display: "flex", alignItems: "stretch", gap: 0 }}>
                    {[
                        { label: "Leads SDR", n: m.sdrThisWeek, color: T.gold, sub: "Entradas brutas" },
                        { label: "Qualificados", n: m.closerThisWeek, color: T.rose, sub: `${m.qualRate}% de ${m.sdrThisWeek}` },
                    ].map((step, i, arr) => (
                        <div key={i} style={{ display: "flex", alignItems: "center", flex: 1 }}>
                            <div style={{ flex: 1, padding: "0 4px" }}>
                                <div style={{ fontSize: 10, color: T.muted, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>{step.label}</div>
                                <div style={{ height: 52, background: `${step.color}18`, border: `1px solid ${step.color}44`, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" }}>
                                    <span style={{ fontSize: 24, fontWeight: 800, color: step.color, fontFamily: "Georgia, serif" }}>{step.n}</span>
                                </div>
                                <div style={{ fontSize: 10, color: T.muted, marginTop: 4 }}>{step.sub}</div>
                            </div>
                            {i < arr.length - 1 && <div style={{ padding: "0 8px", color: T.muted, fontSize: 20 }}>›</div>}
                        </div>
                    ))}
                </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
                {/* SDR Loss Reasons */}
                {m.sdrLossReasons.length > 0 && (
                    <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: "20px 22px" }}>
                        <SectionTitle metricKey="sdrLossReasons">Motivos de Perda / Desqualificação SDR</SectionTitle>
                        <ResponsiveContainer width="100%" height={200}>
                            <BarChart data={m.sdrLossReasons} layout="vertical" margin={{ top: 4, right: 50, bottom: 4, left: 110 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke={T.border} horizontal={false} />
                                <XAxis type="number" tick={{ fontSize: 10, fill: T.muted }} tickLine={false} axisLine={false} tickFormatter={(v: number) => v + "%"} />
                                <YAxis type="category" dataKey="motivo" tick={{ fontSize: 10, fill: T.muted }} tickLine={false} axisLine={false} width={105} />
                                <Tooltip content={<CustomTooltip />} />
                                <Bar dataKey="pct" name="Pct %" radius={[0, 3, 3, 0]} barSize={12} fill={T.orange} label={{ position: "right", fontSize: 10, fill: T.muted, formatter: (v: unknown) => `${v}%` }} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                )}

                {/* No-Show Rate */}
                <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: "20px 22px" }}>
                    <SectionTitle>No-Show de Reunião SDR</SectionTitle>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, padding: "20px 0" }}>
                        <div style={{ fontSize: 42, fontWeight: 800, color: m.sdrNoShowRate > 20 ? T.red : m.sdrNoShowRate > 10 ? T.orange : T.green, fontFamily: "Georgia, serif" }}>
                            {m.sdrNoShowRate}%
                        </div>
                        <div style={{ fontSize: 12, color: T.muted }}>
                            {m.sdrNoShowCount} no-shows de {m.sdrWithMeetingCount} agendados
                        </div>
                        <div style={{
                            marginTop: 8,
                            padding: "4px 12px",
                            borderRadius: 20,
                            fontSize: 10,
                            fontWeight: 700,
                            color: m.sdrNoShowRate > 20 ? T.red : m.sdrNoShowRate > 10 ? T.orange : T.green,
                            background: `${m.sdrNoShowRate > 20 ? T.red : m.sdrNoShowRate > 10 ? T.orange : T.green}18`,
                            border: `1px solid ${m.sdrNoShowRate > 20 ? T.red : m.sdrNoShowRate > 10 ? T.orange : T.green}44`,
                        }}>
                            {m.sdrNoShowRate > 20 ? "🔴 CRÍTICO" : m.sdrNoShowRate > 10 ? "🟡 ATENÇÃO" : "🟢 SAUDÁVEL"}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
