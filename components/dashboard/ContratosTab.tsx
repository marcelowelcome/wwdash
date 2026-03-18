"use client";

import { useState, useMemo } from "react";
import {
    BarChart, Bar, ComposedChart, Line,
    XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, Cell,
} from "recharts";
import { KpiCard } from "./KpiCard";
import { SectionTitle } from "./SectionTitle";
import { CustomTooltip } from "./CustomTooltip";
import { T } from "./theme";
import { type WonDeal } from "@/lib/schemas";
import { type PeriodFilter } from "@/lib/metrics-sdr";
import { computeContractMetrics } from "@/lib/metrics-contracts";

interface ContratosTabProps {
    deals: WonDeal[];
    fieldMap: Record<string, string>;
}

const fmtBRL = (v: number) => v >= 1000 ? `R$ ${(v / 1000).toFixed(0)}k` : `R$ ${v}`;
const fmtBRLFull = (v: number) => `R$ ${v.toLocaleString("pt-BR")}`;

const TEMPO_COLORS = [T.green, T.green, T.orange, T.red, T.red];

export function ContratosTab({ deals, fieldMap }: ContratosTabProps) {
    const [filter, setFilter] = useState<PeriodFilter>("full");

    const m = useMemo(() => computeContractMetrics(deals, fieldMap, filter), [deals, fieldMap, filter]);

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>

            {/* ── Filter ─────────────────────────────────────────────── */}
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
                            transition: "all 0.2s",
                        }}
                    >
                        {f === "week" ? "Semana Atual" : f === "4weeks" ? "Últimas 4 Semanas" : f === "3months" ? "Últimos 3 Meses" : "Histórico Completo"}
                    </button>
                ))}
            </div>

            {/* ── KPIs Row 1 ─────────────────────────────────────────── */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
                <KpiCard
                    label="Total de Contratos"
                    value={m.totalContratos}
                    status="green"
                    metricKey="totalContratos"
                />
                <KpiCard
                    label="Receita Total"
                    value={fmtBRLFull(m.receitaTotal)}
                    status="green"
                    metricKey="receitaTotal"
                />
                <KpiCard
                    label="Ticket Médio"
                    value={fmtBRLFull(m.ticketMedio)}
                    status="green"
                    metricKey="ticketMedio"
                />
            </div>

            {/* ── KPIs Row 2 ─────────────────────────────────────────── */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
                <KpiCard
                    label="Média de Convidados"
                    value={m.mediaConvidados || "—"}
                    sub={m.mediaConvidados > 0 ? "por contrato" : "Sem dados"}
                    status="green"
                    metricKey="mediaConvidados"
                />
                <KpiCard
                    label="Tempo Médio de Fechamento"
                    value={m.tempoMedioFechamento > 0 ? `${m.tempoMedioFechamento} dias` : "—"}
                    status={m.tempoMedioFechamento <= 30 ? "green" : m.tempoMedioFechamento <= 60 ? "orange" : "red"}
                    metricKey="tempoMedioFechamento"
                />
                <KpiCard
                    label="Ticket por Convidado"
                    value={m.ticketPorConvidado > 0 ? fmtBRLFull(m.ticketPorConvidado) : "—"}
                    status="green"
                    metricKey="ticketPorConvidado"
                />
            </div>

            {/* ── Charts Row 1: Receita Mensal + Top Destinos ──────── */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
                {/* Receita Mensal */}
                <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: "20px 22px" }}>
                    <SectionTitle>Receita Mensal</SectionTitle>
                    {m.receitaMensal.length > 0 ? (
                        <ResponsiveContainer width="100%" height={240}>
                            <ComposedChart data={m.receitaMensal} margin={{ top: 10, right: 20, bottom: 0, left: -10 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke={T.border} vertical={false} />
                                <XAxis dataKey="month" tick={{ fontSize: 9, fill: T.muted }} tickLine={false} axisLine={false} />
                                <YAxis yAxisId="left" tick={{ fontSize: 9, fill: T.muted }} tickLine={false} axisLine={false} tickFormatter={(v: number) => fmtBRL(v)} />
                                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 9, fill: T.muted }} tickLine={false} axisLine={false} />
                                <Tooltip content={<CustomTooltip />} />
                                <Bar yAxisId="left" dataKey="receita" name="Receita" fill={T.berry} radius={[4, 4, 0, 0]} maxBarSize={30} />
                                <Line yAxisId="right" type="monotone" dataKey="contratos" name="Contratos" stroke={T.gold} strokeWidth={2} dot={false} />
                            </ComposedChart>
                        </ResponsiveContainer>
                    ) : (
                        <div style={{ height: 240, display: "flex", alignItems: "center", justifyContent: "center", color: T.muted, fontSize: 12 }}>Sem dados no período</div>
                    )}
                </div>

                {/* Top Destinos */}
                <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: "20px 22px" }}>
                    <SectionTitle>Top Destinos por Receita</SectionTitle>
                    {m.porDestino.length > 0 ? (
                        <ResponsiveContainer width="100%" height={240}>
                            <BarChart data={m.porDestino.slice(0, 8)} layout="vertical" margin={{ top: 10, right: 20, bottom: 0, left: 10 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke={T.border} horizontal={false} />
                                <XAxis type="number" tick={{ fontSize: 9, fill: T.muted }} tickLine={false} axisLine={false} tickFormatter={(v: number) => fmtBRL(v)} />
                                <YAxis type="category" dataKey="destino" width={110} tick={{ fontSize: 9, fill: T.muted }} tickLine={false} axisLine={false} />
                                <Tooltip content={<CustomTooltip />} />
                                <Bar dataKey="receita" name="Receita" fill={T.rose} radius={[0, 4, 4, 0]} barSize={14} />
                            </BarChart>
                        </ResponsiveContainer>
                    ) : (
                        <div style={{ height: 240, display: "flex", alignItems: "center", justifyContent: "center", color: T.muted, fontSize: 12 }}>Sem dados no período</div>
                    )}
                </div>
            </div>

            {/* ── Charts Row 2: Fonte + Tempo de Fechamento ────────── */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
                {/* Por Fonte */}
                <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: "20px 22px" }}>
                    <SectionTitle>Origem dos Leads Fechados</SectionTitle>
                    {m.porFonte.length > 0 ? (
                        <ResponsiveContainer width="100%" height={220}>
                            <BarChart data={m.porFonte.slice(0, 6)} layout="vertical" margin={{ top: 10, right: 20, bottom: 0, left: 10 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke={T.border} horizontal={false} />
                                <XAxis type="number" tick={{ fontSize: 9, fill: T.muted }} tickLine={false} axisLine={false} />
                                <YAxis type="category" dataKey="fonte" width={110} tick={{ fontSize: 9, fill: T.muted }} tickLine={false} axisLine={false} />
                                <Tooltip content={<CustomTooltip />} />
                                <Bar dataKey="contratos" name="Contratos" fill={T.gold} radius={[0, 4, 4, 0]} barSize={14} />
                            </BarChart>
                        </ResponsiveContainer>
                    ) : (
                        <div style={{ height: 220, display: "flex", alignItems: "center", justifyContent: "center", color: T.muted, fontSize: 12 }}>Sem dados no período</div>
                    )}
                </div>

                {/* Tempo de Fechamento */}
                <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: "20px 22px" }}>
                    <SectionTitle>Tempo de Fechamento</SectionTitle>
                    {m.tempoFechamento.some(b => b.count > 0) ? (
                        <ResponsiveContainer width="100%" height={220}>
                            <BarChart data={m.tempoFechamento} margin={{ top: 10, right: 20, bottom: 0, left: -10 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke={T.border} vertical={false} />
                                <XAxis dataKey="faixa" tick={{ fontSize: 9, fill: T.muted }} tickLine={false} axisLine={false} />
                                <YAxis tick={{ fontSize: 9, fill: T.muted }} tickLine={false} axisLine={false} />
                                <Tooltip content={<CustomTooltip />} />
                                <Bar dataKey="count" name="Contratos" radius={[4, 4, 0, 0]} maxBarSize={40}>
                                    {m.tempoFechamento.map((_, i) => (
                                        <Cell key={i} fill={TEMPO_COLORS[i]} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    ) : (
                        <div style={{ height: 220, display: "flex", alignItems: "center", justifyContent: "center", color: T.muted, fontSize: 12 }}>Sem dados no período</div>
                    )}
                </div>
            </div>

            {/* ── Charts Row 3: Convidados + Pipeline ─────────────── */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
                {/* Distribuição de Convidados */}
                <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: "20px 22px" }}>
                    <SectionTitle>Distribuição de Convidados</SectionTitle>
                    {m.distribuicaoConvidados.some(b => b.count > 0) ? (
                        <ResponsiveContainer width="100%" height={220}>
                            <BarChart data={m.distribuicaoConvidados} margin={{ top: 10, right: 20, bottom: 0, left: -10 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke={T.border} vertical={false} />
                                <XAxis dataKey="faixa" tick={{ fontSize: 9, fill: T.muted }} tickLine={false} axisLine={false} />
                                <YAxis tick={{ fontSize: 9, fill: T.muted }} tickLine={false} axisLine={false} />
                                <Tooltip content={<CustomTooltip />} />
                                <Bar dataKey="count" name="Contratos" fill={T.berry} radius={[4, 4, 0, 0]} maxBarSize={40} />
                            </BarChart>
                        </ResponsiveContainer>
                    ) : (
                        <div style={{ height: 220, display: "flex", alignItems: "center", justifyContent: "center", color: T.muted, fontSize: 12 }}>Sem dados de convidados</div>
                    )}
                </div>

                {/* Wedding vs Elopement */}
                <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: "20px 22px" }}>
                    <SectionTitle>Wedding vs Elopement</SectionTitle>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 16 }}>
                        {m.porPipeline.length > 0 ? m.porPipeline.map(p => (
                            <div key={p.pipeline} style={{
                                background: T.surface,
                                border: `1px solid ${T.border}`,
                                borderRadius: 10,
                                padding: "18px 16px",
                                textAlign: "center",
                            }}>
                                <div style={{ fontSize: 13, fontWeight: 700, color: T.gold, marginBottom: 12 }}>{p.pipeline}</div>
                                <div style={{ fontSize: 28, fontWeight: 800, color: T.white, fontFamily: "Georgia, serif" }}>{p.contratos}</div>
                                <div style={{ fontSize: 10, color: T.muted, marginTop: 4 }}>contratos</div>
                                <div style={{ fontSize: 14, fontWeight: 700, color: T.rose, marginTop: 10 }}>{fmtBRLFull(p.receita)}</div>
                                <div style={{ fontSize: 10, color: T.muted, marginTop: 2 }}>receita total</div>
                                <div style={{ fontSize: 12, color: T.cream, marginTop: 8 }}>Ticket: {fmtBRLFull(p.ticketMedio)}</div>
                            </div>
                        )) : (
                            <div style={{ gridColumn: "1 / -1", height: 160, display: "flex", alignItems: "center", justifyContent: "center", color: T.muted, fontSize: 12 }}>Sem dados no período</div>
                        )}
                    </div>
                </div>
            </div>

            {/* ── Table: Top Destinos ─────────────────────────────── */}
            {m.porDestino.length > 0 && (
                <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: "20px 22px" }}>
                    <SectionTitle>Detalhamento por Destino</SectionTitle>
                    <div style={{ overflowX: "auto", marginTop: 12 }}>
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                            <thead>
                                <tr style={{ borderBottom: `1px solid ${T.border}` }}>
                                    {["Destino", "Contratos", "Receita", "Ticket Médio", "Média Convidados", "% Receita"].map(h => (
                                        <th key={h} style={{ padding: "8px 10px", textAlign: "left", color: T.muted, fontWeight: 600, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {m.porDestino.map((d, i) => (
                                    <tr key={d.destino} style={{ borderBottom: i < m.porDestino.length - 1 ? `1px solid ${T.border}` : "none" }}>
                                        <td style={{ padding: "8px 10px", color: T.cream, fontWeight: 600 }}>{d.destino}</td>
                                        <td style={{ padding: "8px 10px", color: T.white }}>{d.contratos}</td>
                                        <td style={{ padding: "8px 10px", color: T.gold }}>{fmtBRLFull(d.receita)}</td>
                                        <td style={{ padding: "8px 10px", color: T.white }}>{fmtBRLFull(d.ticketMedio)}</td>
                                        <td style={{ padding: "8px 10px", color: T.white }}>{d.mediaConvidados || "—"}</td>
                                        <td style={{ padding: "8px 10px" }}>
                                            <span style={{
                                                background: `${T.gold}15`,
                                                color: T.gold,
                                                padding: "2px 8px",
                                                borderRadius: 12,
                                                fontSize: 10,
                                                fontWeight: 700,
                                            }}>{d.pctReceita}%</span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* ── Table: Performance por Closer ───────────────────── */}
            {m.porCloser.length > 0 && (
                <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: "20px 22px" }}>
                    <SectionTitle>Performance por Closer</SectionTitle>
                    <div style={{ overflowX: "auto", marginTop: 12 }}>
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                            <thead>
                                <tr style={{ borderBottom: `1px solid ${T.border}` }}>
                                    {["Closer", "Contratos", "Receita", "Ticket Médio", "Tempo Médio", "Média Convidados"].map(h => (
                                        <th key={h} style={{ padding: "8px 10px", textAlign: "left", color: T.muted, fontWeight: 600, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {m.porCloser.map((c, i) => (
                                    <tr key={c.closer} style={{ borderBottom: i < m.porCloser.length - 1 ? `1px solid ${T.border}` : "none" }}>
                                        <td style={{ padding: "8px 10px", color: T.cream, fontWeight: 600 }}>{c.closer}</td>
                                        <td style={{ padding: "8px 10px", color: T.white }}>{c.contratos}</td>
                                        <td style={{ padding: "8px 10px", color: T.gold }}>{fmtBRLFull(c.receita)}</td>
                                        <td style={{ padding: "8px 10px", color: T.white }}>{fmtBRLFull(c.ticketMedio)}</td>
                                        <td style={{ padding: "8px 10px", color: c.tempoMedio <= 30 ? T.green : c.tempoMedio <= 60 ? T.orange : T.red }}>{c.tempoMedio > 0 ? `${c.tempoMedio} dias` : "—"}</td>
                                        <td style={{ padding: "8px 10px", color: T.white }}>{c.mediaConvidados || "—"}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}
