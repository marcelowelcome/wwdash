"use client";

import { useState, useMemo } from "react";
import {
    BarChart, Bar, LineChart, Line,
    XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, ReferenceLine, Cell, ComposedChart, ReferenceArea,
    Area, AreaChart
} from "recharts";
import { SectionTitle } from "./SectionTitle";
import { CustomTooltip } from "./CustomTooltip";
import { T, statusColor } from "./theme";
import { type SDRMetrics, type PeriodFilter, computeSDRMetrics } from "@/lib/metrics-sdr";
import { type Deal } from "@/lib/schemas";

interface SDRTabProps {
    deals: Deal[];
    fieldMap: Record<string, string>;
}

export function SDRTab({ deals, fieldMap }: SDRTabProps) {
    const [filter, setFilter] = useState<PeriodFilter>("4weeks");

    const m = useMemo(() => computeSDRMetrics(deals, fieldMap, filter), [deals, fieldMap, filter]);

    const renderChip = (val: number | null, type: "agendamento" | "comparecimento" | "qualificacao" | "closer") => {
        if (val === null) return <span style={{ color: T.muted }}>—</span>;

        let color = T.green;
        if (type === "agendamento") {
            if (val < 25) color = T.red;
            else if (val < 35) color = T.orange;
        } else if (type === "comparecimento") {
            if (val < 35) color = T.red;
            else if (val < 45) color = T.orange;
        } else if (type === "qualificacao") {
            if (val < 25) color = T.red;
            else if (val < 40) color = T.orange;
        } else if (type === "closer") {
            if (val < 35) color = T.red;
            else if (val < 50) color = T.orange;
        }

        return (
            <span style={{
                background: `${color}15`,
                color: color,
                padding: "2px 8px",
                borderRadius: 12,
                fontSize: 10,
                fontWeight: 700,
                border: `1px solid ${color}33`
            }}>
                {val.toFixed(1)}%
            </span>
        );
    };

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>

            {/* Filter Selector */}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                {(["week", "4weeks", "3months", "full"] as PeriodFilter[]).map(f => (
                    <button
                        key={f}
                        onClick={() => setFilter(f)}
                        style={{
                            background: filter === f ? T.gold : T.card,
                            color: filter === f ? T.bg : T.muted,
                            border: `1px solid ${T.border}`,
                            borderRadius: 6,
                            padding: "4px 12px",
                            fontSize: 11,
                            fontWeight: 600,
                            cursor: "pointer",
                            transition: "all 0.2s"
                        }}
                    >
                        {f === "week" ? "Semana Atual" : f === "4weeks" ? "Últimas 4 Semanas" : f === "3months" ? "Últimos 3 Meses" : "Histórico Completo"}
                    </button>
                ))}
            </div>

            {/* Block 1: KPIs */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 16 }}>
                <KpiCard
                    label="Leads SDR"
                    value={m.mqlThisWeek}
                    sub={`▲/▼ ${m.mqlThisWeek - Math.round(m.mm4s)} vs MM4s`}
                    color={m.mqlThisWeek >= m.mm4s ? T.green : T.red}
                />
                <KpiCard
                    label="MM4s"
                    value={Math.round(m.mm4s)}
                    sub="base de comparação"
                    color={T.muted}
                />
                <KpiCard
                    label="Taxa Agendamento"
                    value={m.taxaAgendamento !== null ? `${m.taxaAgendamento.toFixed(1)}%` : "—"}
                    chip={renderChip(m.taxaAgendamento, "agendamento")}
                />
                <KpiCard
                    label="Taxa Comparecimento"
                    value={m.taxaComparecimento !== null ? `${m.taxaComparecimento.toFixed(1)}%` : "—"}
                    chip={renderChip(m.taxaComparecimento, "comparecimento")}
                />
                <KpiCard
                    label="Taxa Qualificação"
                    value={m.taxaQualificacao !== null ? `${m.taxaQualificacao.toFixed(1)}%` : "—"}
                    chip={renderChip(m.taxaQualificacao, "qualificacao")}
                />
            </div>

            {/* Block 6: Alerts (Conditional) */}
            {m.alerts.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {m.alerts.map((a, i) => (
                        <div key={i} style={{
                            background: a.level === "red" ? "#3B1515" : "#2E2415",
                            border: `1px solid ${a.level === "red" ? T.red : T.orange}`,
                            borderRadius: 8, padding: "12px 16px", display: "flex", gap: 12, alignItems: "center"
                        }}>
                            <span style={{ fontSize: 18 }}>{a.level === "red" ? "🔴" : "🟡"}</span>
                            <div style={{ flex: 1 }}>
                                <div style={{ fontSize: 11, fontWeight: 700, color: a.level === "red" ? T.red : T.orange, textTransform: "uppercase" }}>{a.level === "red" ? "Crítico" : "Atenção"}</div>
                                <div style={{ fontSize: 13, color: T.white }}>{a.message}</div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
                {/* Block 2: Funnel SDR */}
                <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: "20px 22px" }}>
                    <SectionTitle>Funil Visual SDR</SectionTitle>
                    <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 20 }}>
                        <FunnelBar label="MQL" value={m.funnel.mql} pctMQL={100} pctPrev={100} width="100%" color="#4D94FF" />
                        <FunnelBar label="Agendamentos" value={m.funnel.agendamentos} pctMQL={(m.funnel.agendamentos / m.funnel.mql) * 100} pctPrev={(m.funnel.agendamentos / m.funnel.mql) * 100} width={`${Math.max((m.funnel.agendamentos / m.funnel.mql) * 100, 5)}%`} color={T.berry} />
                        <FunnelBar label="Reuniões" value={m.funnel.reunioes} pctMQL={(m.funnel.reunioes / m.funnel.mql) * 100} pctPrev={(m.funnel.reunioes / (m.funnel.agendamentos || 1)) * 100} width={`${Math.max((m.funnel.reunioes / m.funnel.mql) * 100, 5)}%`} color={T.orange} />
                        <FunnelBar label="Qualificados" value={m.funnel.qualificados} pctMQL={(m.funnel.qualificados / m.funnel.mql) * 100} pctPrev={(m.funnel.qualificados / (m.funnel.reunioes || 1)) * 100} width={`${Math.max((m.funnel.qualificados / m.funnel.mql) * 100, 5)}%`} color={T.green} />
                        <FunnelBar label="Ag. Closer" value={m.funnel.agCloser} pctMQL={(m.funnel.agCloser / m.funnel.mql) * 100} pctPrev={(m.funnel.agCloser / (m.funnel.qualificados || 1)) * 100} width={`${Math.max((m.funnel.agCloser / m.funnel.mql) * 100, 5)}%`} color={T.rose} />
                    </div>
                </div>

                {/* Block 3: Weekly Volume (Fixed 12 weeks) */}
                <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: "20px 22px" }}>
                    <SectionTitle>Volume Semanal (MQL vs MM4s)</SectionTitle>
                    <ResponsiveContainer width="100%" height={240}>
                        <ComposedChart data={m.weeklyVolume} margin={{ top: 20, right: 20, bottom: 0, left: -20 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke={T.border} vertical={false} />
                            <XAxis dataKey="week" tick={{ fontSize: 9, fill: T.muted }} tickLine={false} axisLine={false} />
                            <YAxis tick={{ fontSize: 9, fill: T.muted }} tickLine={false} axisLine={false} />
                            <Tooltip content={<CustomTooltip />} />
                            <Bar dataKey="mql" name="MQL" fill="#4D94FF" radius={[4, 4, 0, 0]} maxBarSize={30} />
                            <Line type="monotone" dataKey="mm4s" name="MM4s" stroke={T.orange} strokeWidth={2} dot={false} />
                        </ComposedChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Block 4: Monthly Rates (Fixed 12 months) */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
                <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: "20px 22px" }}>
                    <SectionTitle>Taxa de Comparecimento Mensal</SectionTitle>
                    <ResponsiveContainer width="100%" height={220}>
                        <LineChart data={m.monthlyRates} margin={{ top: 20, right: 20, bottom: 0, left: -20 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke={T.border} vertical={false} />
                            <XAxis dataKey="month" tick={{ fontSize: 9, fill: T.muted }} tickLine={false} axisLine={false} />
                            <YAxis tick={{ fontSize: 9, fill: T.muted }} tickLine={false} axisLine={false} domain={[0, 100]} tickFormatter={v => `${v}%`} />
                            <Tooltip content={<CustomTooltip />} />
                            <ReferenceArea y1={0} y2={45} fill={T.red} fillOpacity={0.05} />
                            <Line
                                type="monotone"
                                dataKey="comparecimento"
                                stroke={T.berry}
                                strokeWidth={3}
                                dot={(props: any) => {
                                    const { cx, cy, payload } = props;
                                    const isCurrent = payload.isCurrent;
                                    return (
                                        <circle
                                            key={`dot-comp-${cx}`}
                                            cx={cx}
                                            cy={cy}
                                            r={4}
                                            fill={T.card}
                                            stroke={T.berry}
                                            strokeWidth={2}
                                            strokeDasharray={isCurrent ? "2 2" : "0"}
                                        />
                                    );
                                }}
                            />
                        </LineChart>
                    </ResponsiveContainer>
                </div>

                <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: "20px 22px" }}>
                    <SectionTitle>Taxa de Agendamento Mensal</SectionTitle>
                    <ResponsiveContainer width="100%" height={220}>
                        <LineChart data={m.monthlyRates} margin={{ top: 20, right: 20, bottom: 0, left: -20 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke={T.border} vertical={false} />
                            <XAxis dataKey="month" tick={{ fontSize: 9, fill: T.muted }} tickLine={false} axisLine={false} />
                            <YAxis tick={{ fontSize: 9, fill: T.muted }} tickLine={false} axisLine={false} domain={[0, 100]} tickFormatter={v => `${v}%`} />
                            <Tooltip content={<CustomTooltip />} />
                            <ReferenceArea y1={35} y2={45} fill={T.green} fillOpacity={0.05} />
                            <Line
                                type="monotone"
                                dataKey="agendamento"
                                stroke={T.green}
                                strokeWidth={3}
                                dot={(props: any) => {
                                    const { cx, cy, payload } = props;
                                    const isCurrent = payload.isCurrent;
                                    return (
                                        <circle
                                            key={`dot-agend-${cx}`}
                                            cx={cx}
                                            cy={cy}
                                            r={4}
                                            fill={T.card}
                                            stroke={T.green}
                                            strokeWidth={2}
                                            strokeDasharray={isCurrent ? "2 2" : "0"}
                                        />
                                    );
                                }}
                            />
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Block 5: Loss Reasons */}
            <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: "20px 22px" }}>
                <SectionTitle>Motivos de Perda SDR</SectionTitle>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 32, marginTop: 16 }}>
                    <div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                            {m.lossReasons.map((item, idx) => (
                                <div key={idx}>
                                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                                        <span style={{ fontSize: 12, color: T.white }}>{item.motivo}</span>
                                        <span style={{ fontSize: 12, fontWeight: 700, color: T.muted }}>{item.periodoPct.toFixed(1)}%</span>
                                    </div>
                                    <div style={{ height: 6, background: T.border, borderRadius: 3 }}>
                                        <div style={{ height: "100%", width: `${item.periodoPct}%`, background: T.berry, borderRadius: 3 }} />
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div style={{ marginTop: 24, fontSize: 12, color: T.muted, fontStyle: "italic" }}>
                            * {m.notEngagedNote.count} leads ({m.notEngagedNote.pct.toFixed(1)}%) não engajaram com a SDR no período
                        </div>
                    </div>

                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                        <thead>
                            <tr style={{ borderBottom: `1px solid ${T.border}` }}>
                                <th style={{ textAlign: "left", padding: "8px", fontSize: 10, color: T.muted, textTransform: "uppercase" }}>Motivo</th>
                                <th style={{ textAlign: "right", padding: "8px", fontSize: 10, color: T.muted, textTransform: "uppercase" }}>Período</th>
                                <th style={{ textAlign: "right", padding: "8px", fontSize: 10, color: T.muted, textTransform: "uppercase" }}>Histórico</th>
                                <th style={{ textAlign: "right", padding: "8px", fontSize: 10, color: T.muted, textTransform: "uppercase" }}>Δ</th>
                            </tr>
                        </thead>
                        <tbody>
                            {m.lossReasons.map((item, idx) => (
                                <tr key={idx} style={{ borderBottom: `1px solid ${T.border}33` }}>
                                    <td style={{ padding: "10px 8px", fontSize: 12, color: T.white }}>{item.motivo}</td>
                                    <td style={{ padding: "10px 8px", fontSize: 12, color: T.white, textAlign: "right", fontWeight: 600 }}>{item.periodoPct.toFixed(1)}%</td>
                                    <td style={{ padding: "10px 8px", fontSize: 12, color: T.muted, textAlign: "right" }}>{item.historicoPct.toFixed(1)}%</td>
                                    <td style={{ padding: "10px 8px", textAlign: "right" }}>
                                        {Math.abs(item.delta) > 5 && (
                                            <span style={{
                                                fontSize: 9,
                                                fontWeight: 800,
                                                color: item.delta > 0 ? T.red : T.green,
                                                background: `${item.delta > 0 ? T.red : T.green}15`,
                                                padding: "2px 6px",
                                                borderRadius: 4
                                            }}>
                                                {item.delta > 0 ? "▲" : "▼"} {Math.abs(item.delta).toFixed(1)}pp
                                            </span>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

        </div>
    );
}

function KpiCard({ label, value, sub, color, chip }: { label: string, value: string | number, sub?: string, color?: string, chip?: React.ReactNode }) {
    return (
        <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: "20px", display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ fontSize: 10, color: T.muted, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                <div style={{ fontSize: 28, fontWeight: 800, color: T.white, fontFamily: "Georgia, serif" }}>{value}</div>
                {chip}
            </div>
            {sub && <div style={{ fontSize: 11, color: color || T.muted }}>{sub}</div>}
        </div>
    );
}

function FunnelBar({ label, value, pctMQL, pctPrev, width, color }: { label: string, value: number, pctMQL: number, pctPrev: number, width: string, color: string }) {
    return (
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ flex: 1, display: "flex", justifyContent: "flex-end" }}>
                <div style={{ height: 32, width: width, background: color, borderRadius: 4, opacity: 0.8 }} />
            </div>
            <div style={{ width: 280, display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 50, fontSize: 18, fontWeight: 800, color: T.white, fontFamily: "Georgia, serif", textAlign: "right" }}>{value}</div>
                <div style={{ flex: 1, fontSize: 13, color: T.white }}>{label}</div>
                <div style={{ display: "flex", gap: 6 }}>
                    <span style={{ fontSize: 10, color: T.muted }}>({pctMQL.toFixed(0)}% MQL)</span>
                    <span style={{ fontSize: 10, color: color, fontWeight: 700 }}>{pctPrev.toFixed(1)}%</span>
                </div>
            </div>
        </div>
    );
}
