"use client";

import {
    BarChart, Bar,
    XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, ReferenceLine, Cell
} from "recharts";
import { SectionTitle } from "./SectionTitle";
import { CustomTooltip } from "./CustomTooltip";
import { T, statusColor } from "./theme";
import { type Metrics } from "@/lib/metrics";

interface CloserTabProps {
    m: Metrics;
}

export function CloserTab({ m }: CloserTabProps) {
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
            {/* Velocity + Key KPIs */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
                {[
                    { label: "Conversão MM4s", value: `${m.conv_curr}%`, color: statusColor(m.convStatus), sub: `Anterior: ${m.conv_prev}%` },
                    { label: "Velocidade de Decisão", value: `${m.velocity}%`, color: statusColor(m.velocityStatus), sub: `${m.enteredMM4} entraram no MM4` },
                    { label: "Ganhos no Período", value: m.won_curr, color: T.green, sub: "Últimos 28 dias" },
                    { label: "Perdidos no Período", value: m.lost_curr, color: T.red, sub: "Últimos 28 dias" },
                ].map((kpi, i) => (
                    <div key={i} style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: "16px 18px", position: "relative", overflow: "hidden" }}>
                        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: kpi.color, borderRadius: "12px 12px 0 0" }} />
                        <div style={{ fontSize: 10, color: T.muted, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600, marginBottom: 6 }}>{kpi.label}</div>
                        <div style={{ fontSize: 28, fontWeight: 800, color: T.white, fontFamily: "Georgia, serif" }}>{kpi.value}</div>
                        <div style={{ fontSize: 10, color: T.muted, marginTop: 4 }}>{kpi.sub}</div>
                    </div>
                ))}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "3fr 2fr", gap: 18 }}>
                {/* Conversion trend over 4-week windows */}
                <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: "20px 22px" }}>
                    <SectionTitle tag={m.convStatus === "red" ? "🔴 CRÍTICO" : "🟡 ATENÇÃO"} metricKey="conv_curr">
                        Conversão — Janelas 4 Semanas
                    </SectionTitle>
                    <ResponsiveContainer width="100%" height={240}>
                        <BarChart data={m.convTrend} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke={T.border} vertical={false} />
                            <XAxis dataKey="periodo" tick={{ fontSize: 10, fill: T.muted }} tickLine={false} axisLine={false} />
                            <YAxis tick={{ fontSize: 9, fill: T.muted }} tickLine={false} axisLine={false} tickFormatter={(v: number) => v + "%"} />
                            <Tooltip content={<CustomTooltip />} />
                            {m.histRate > 0 && (
                                <ReferenceLine y={m.histRate} stroke={T.gold} strokeDasharray="4 4" label={{ value: `Histórico ${m.histRate}%`, fill: T.gold, fontSize: 9, position: "insideTopLeft" }} />
                            )}
                            <ReferenceLine y={20} stroke={T.red} strokeDasharray="3 3" label={{ value: "Limite crítico 20%", fill: T.red, fontSize: 9, position: "insideBottomLeft" }} />
                            <Bar dataKey="taxa" name="Taxa %" radius={[5, 5, 0, 0]} maxBarSize={70}>
                                {m.convTrend.map((d, i) => (
                                    <Cell key={i} fill={d.taxa < 20 ? "#A03030" : d.taxa < 25 ? T.orange : T.green} />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>

                {/* Current period breakdown */}
                <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: "20px 22px" }}>
                    <SectionTitle metricKey="conv_curr">Período Atual (28 dias)</SectionTitle>
                    <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 4 }}>
                        {[
                            { label: "Entraram no Closer", v: m.enteredMM4, color: T.rose },
                            { label: "Fecharam Won", v: m.won_curr, color: T.green },
                            { label: "Perdidos Lost", v: m.lost_curr, color: T.red },
                            { label: "Ainda Open", v: m.open_curr, color: T.orange },
                        ].map((row, i) => (
                            <div key={i}>
                                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, fontSize: 12, color: T.muted }}>
                                    <span>{row.label}</span>
                                    <span style={{ color: row.color, fontWeight: 700 }}>{row.v}</span>
                                </div>
                                <div style={{ height: 6, background: T.border, borderRadius: 3 }}>
                                    <div style={{ height: "100%", width: `${m.enteredMM4 > 0 ? (row.v / m.enteredMM4) * 100 : 0}%`, background: row.color, borderRadius: 3 }} />
                                </div>
                            </div>
                        ))}
                        <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 12, marginTop: 4, display: "flex", justifyContent: "space-between" }}>
                            <span style={{ fontSize: 13, color: T.muted, fontWeight: 600 }}>Taxa conversão</span>
                            <span style={{ fontSize: 24, fontWeight: 800, color: statusColor(m.convStatus), fontFamily: "Georgia, serif" }}>{m.conv_curr}%</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Loss Reasons */}
            {m.lossReasons.length > 0 && (
                <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: "20px 22px" }}>
                    <SectionTitle metricKey="lossReasons">Motivos de Perda — Últimas 4 Semanas</SectionTitle>
                    <ResponsiveContainer width="100%" height={240}>
                        <BarChart data={m.lossReasons} layout="vertical" margin={{ top: 4, right: 50, bottom: 4, left: 130 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke={T.border} horizontal={false} />
                            <XAxis type="number" tick={{ fontSize: 10, fill: T.muted }} tickLine={false} axisLine={false} tickFormatter={(v: number) => v + "%"} />
                            <YAxis type="category" dataKey="motivo" tick={{ fontSize: 10, fill: T.muted }} tickLine={false} axisLine={false} width={125} />
                            <Tooltip content={<CustomTooltip />} />
                            <Bar dataKey="pct" name="Pct %" radius={[0, 3, 3, 0]} barSize={12} fill={T.rose} label={{ position: "right", fontSize: 10, fill: T.muted, formatter: (v: unknown) => `${v}%` }} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            )}

            {/* Destination Analysis */}
            {m.dealsByDestination.length > 0 && (
                <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: "20px 22px" }}>
                    <SectionTitle>Análise por Destino</SectionTitle>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr 1fr", gap: 8, fontSize: 10, color: T.muted, textTransform: "uppercase", letterSpacing: "0.04em", fontWeight: 700, padding: "0 4px" }}>
                            <span>Destino</span>
                            <span style={{ textAlign: "center" }}>Total</span>
                            <span style={{ textAlign: "center" }}>Won</span>
                            <span style={{ textAlign: "center" }}>Lost</span>
                            <span style={{ textAlign: "center" }}>Open</span>
                            <span style={{ textAlign: "center" }}>Conv %</span>
                        </div>
                        {m.dealsByDestination.map((row, i) => (
                            <div key={i} style={{
                                display: "grid",
                                gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr 1fr",
                                gap: 8,
                                fontSize: 12,
                                padding: "8px 4px",
                                background: i % 2 === 0 ? "transparent" : T.surface,
                                borderRadius: 6,
                            }}>
                                <span style={{ color: T.white, fontWeight: 600 }}>{row.destino}</span>
                                <span style={{ textAlign: "center", color: T.muted }}>{row.total}</span>
                                <span style={{ textAlign: "center", color: T.green, fontWeight: 700 }}>{row.won}</span>
                                <span style={{ textAlign: "center", color: T.red, fontWeight: 700 }}>{row.lost}</span>
                                <span style={{ textAlign: "center", color: T.orange }}>{row.open}</span>
                                <span style={{ textAlign: "center", color: row.rate >= 25 ? T.green : row.rate >= 20 ? T.orange : T.red, fontWeight: 700 }}>{row.rate}%</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Cohort Analysis */}
            <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: "20px 22px" }}>
                <SectionTitle tag={m.coh1.rate < 20 ? "🔴 CRÍTICO" : "🟢 NORMAL"} metricKey="cohorts">Análise de Cohort</SectionTitle>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                    {[
                        { label: "Cohort Atual (14–28 dias atrás)", c: m.coh1 },
                        { label: "Cohort Anterior (29–45 dias atrás)", c: m.coh2 },
                    ].map(({ label, c }, i) => (
                        <div key={i} style={{ background: T.surface, borderRadius: 10, border: `1px solid ${c.rate < 20 ? T.red : T.border}44`, padding: "16px 18px" }}>
                            <div style={{ fontSize: 10, color: T.muted, marginBottom: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
                            <div style={{ display: "flex", gap: 16, marginBottom: 12 }}>
                                {(
                                    [["Won", c.won, T.green], ["Lost", c.lost, T.red], ["Open", c.open, T.orange]] as [string, number, string][]
                                ).map(([l, v, color]) => (
                                    <div key={l} style={{ textAlign: "center" }}>
                                        <div style={{ fontSize: 20, fontWeight: 800, color, fontFamily: "Georgia, serif" }}>{v}</div>
                                        <div style={{ fontSize: 10, color: T.muted }}>{l}</div>
                                    </div>
                                ))}
                            </div>
                            <div style={{ fontSize: 12, color: T.muted }}>
                                Taxa atual:{" "}
                                <span style={{ color: c.rate < 20 ? T.red : T.green, fontWeight: 700 }}>
                                    {c.rate.toFixed(1)}%
                                </span>{" "}
                                ({c.won}/{c.won + c.lost} decididos)
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
