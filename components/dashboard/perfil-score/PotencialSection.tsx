"use client";

import React, { useMemo, useState, useRef } from "react";
import {
    Bar,
    XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer,
    ComposedChart, Line,
} from "recharts";
import { SectionTitle } from "../SectionTitle";
import { T } from "../theme";
import { BAND_COLOR, ScoreBadge, fmtBRLFull } from "./shared";
import type { MonthlyLeadPotential, SimpleScoredDeal } from "@/lib/lead-score";
import type { WonDeal } from "@/lib/schemas";

// ─── Props ───────────────────────────────────────────────────────────────────

interface PotencialSectionProps {
    monthlyPotential: MonthlyLeadPotential[];
    closerAndWonDeals: WonDeal[];
    scoredAll: SimpleScoredDeal[];
}

// ─── Component ───────────────────────────────────────────────────────────────

function PotencialSectionInner({ monthlyPotential, closerAndWonDeals, scoredAll }: PotencialSectionProps) {
    const [hoveredMonth, setHoveredMonth] = useState<{ monthKey: string; x: number; y: number } | null>(null);
    const hideMonthRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    function showMonthTooltip(monthKey: string, x: number, y: number) {
        if (hideMonthRef.current) clearTimeout(hideMonthRef.current);
        setHoveredMonth({ monthKey, x, y });
    }
    function scheduleHideMonth() {
        hideMonthRef.current = setTimeout(() => setHoveredMonth(null), 200);
    }
    function cancelHideMonth() {
        if (hideMonthRef.current) clearTimeout(hideMonthRef.current);
    }

    const potentialLast12 = useMemo(() => monthlyPotential.slice(-12), [monthlyPotential]);

    if (monthlyPotential.length === 0) {
        return (
            <div style={{ padding: 40, textAlign: "center", color: T.muted, fontSize: 13, background: T.card, borderRadius: 12, border: `1px solid ${T.border}` }}>
                Sem dados de leads no pipeline do closer para análise.
            </div>
        );
    }

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div style={{ fontSize: 10, color: T.muted, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, padding: "8px 14px" }}>
                {"\u{1F4C5}"} Leads agrupados pela <strong style={{ color: T.cream }}>data de criação do deal</strong> no pipeline do closer.
                Score calculado com base em <strong style={{ color: T.cream }}>destino, convidados e orçamento</strong> — campos preenchidos pelo marketing.
                A taxa de conversão mostra ganhos sobre resolvidos (ganhos + perdidos).
            </div>

            {/* Chart: stacked bars + conversion rate line */}
            <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: "20px 22px" }}>
                <SectionTitle>Qualidade dos Leads por Mês de Entrada</SectionTitle>
                <div style={{ fontSize: 10, color: T.muted, marginBottom: 16 }}>
                    Barras empilhadas = distribuição de score (A/B/C/D) · Linha = taxa de conversão (ganhos/resolvidos)
                </div>
                <ResponsiveContainer width="100%" height={260}>
                    <ComposedChart data={potentialLast12} margin={{ top: 10, right: 44, bottom: 0, left: -10 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke={T.border} vertical={false} />
                        <XAxis dataKey="month" tick={{ fontSize: 9, fill: T.muted }} tickLine={false} axisLine={false} />
                        <YAxis yAxisId="left" tick={{ fontSize: 9, fill: T.muted }} tickLine={false} axisLine={false} allowDecimals={false} />
                        <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 9, fill: T.muted }} tickLine={false} axisLine={false} unit="%" domain={[0, 100]} />
                        <Tooltip
                            contentStyle={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 8, fontSize: 11 }}
                            labelStyle={{ color: T.cream, fontWeight: 700 }}
                            formatter={(value, name) => (String(name) === "Conv. %" ? [`${value ?? 0}%`, String(name)] : [value ?? 0, String(name)])}
                        />
                        <Bar yAxisId="left" dataKey="bandA" name="Tier A" stackId="s" fill={BAND_COLOR.A} maxBarSize={36} />
                        <Bar yAxisId="left" dataKey="bandB" name="Tier B" stackId="s" fill={BAND_COLOR.B} maxBarSize={36} />
                        <Bar yAxisId="left" dataKey="bandC" name="Tier C" stackId="s" fill={BAND_COLOR.C} maxBarSize={36} />
                        <Bar yAxisId="left" dataKey="bandD" name="Tier D" stackId="s" fill={BAND_COLOR.D} maxBarSize={36} radius={[4, 4, 0, 0]} />
                        <Line yAxisId="right" type="monotone" dataKey="convResolved" name="Conv. %" stroke={T.white} strokeWidth={2} dot={{ r: 3, fill: T.white }} />
                    </ComposedChart>
                </ResponsiveContainer>
            </div>

            {/* Table */}
            <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: "20px 22px" }}>
                <SectionTitle>Detalhe por Mês</SectionTitle>
                <div style={{ fontSize: 10, color: T.muted, marginTop: 4, marginBottom: 12 }}>
                    Últimos 12 meses · Colunas A/B/C/D: leads (conv%)
                </div>
                <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                        <thead>
                            <tr style={{ borderBottom: `1px solid ${T.border}` }}>
                                {["Mês", "Leads", "Score", "A", "B", "C", "D", "Ganhos", "Conv."].map(h => (
                                    <th key={h} style={{ padding: "8px 10px", textAlign: h === "Mês" ? "left" : "center", color: T.muted, fontWeight: 600, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.05em", whiteSpace: "nowrap" }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {[...potentialLast12].reverse().map((row, i) => {
                                const scoreColor = row.avgScore >= 65 ? T.green : row.avgScore >= 50 ? T.gold : row.avgScore >= 30 ? T.orange : T.red;
                                const convColor = row.convResolved >= 30 ? T.green : row.convResolved >= 15 ? T.gold : T.red;
                                return (
                                    <tr key={row.monthKey} style={{ borderBottom: i < potentialLast12.length - 1 ? `1px solid ${T.border}33` : "none" }}>
                                        <td style={{ padding: "8px 10px", color: T.cream, fontWeight: 600 }}>{row.month}</td>
                                        <td style={{ padding: "8px 10px", color: T.white, textAlign: "center" }}>{row.total}</td>
                                        <td style={{ padding: "8px 10px", textAlign: "center" }}>
                                            <span style={{ fontWeight: 700, color: scoreColor }}>{row.avgScore}</span>
                                        </td>
                                        {(["A", "B", "C", "D"] as const).map(band => {
                                            const tc = row.tierConv[band];
                                            const bandCount = band === "A" ? row.bandA : band === "B" ? row.bandB : band === "C" ? row.bandC : row.bandD;
                                            return (
                                                <td key={band} style={{ padding: "8px 8px", textAlign: "center", whiteSpace: "nowrap" }}>
                                                    <span style={{ color: BAND_COLOR[band], fontWeight: 700 }}>{bandCount}</span>
                                                    {tc.total > 0 && (
                                                        <span style={{ fontSize: 9, color: tc.conv > 0 ? T.green : T.muted, marginLeft: 3 }}>({tc.conv}%)</span>
                                                    )}
                                                </td>
                                            );
                                        })}
                                        <td
                                            style={{ padding: "8px 10px", color: row.won > 0 ? T.green : T.white, fontWeight: row.won > 0 ? 700 : 400, textAlign: "center", cursor: row.won > 0 ? "pointer" : "default" }}
                                            onMouseEnter={row.won > 0 ? (e) => showMonthTooltip(row.monthKey, e.clientX, e.clientY) : undefined}
                                            onMouseLeave={row.won > 0 ? scheduleHideMonth : undefined}
                                        >{row.won}</td>
                                        <td style={{ padding: "8px 10px", textAlign: "center" }}>
                                            <span style={{ fontWeight: 700, color: convColor }}>{row.convResolved}%</span>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Tooltip for won deals in a month */}
            {hoveredMonth && (() => {
                const row = monthlyPotential.find(r => r.monthKey === hoveredMonth.monthKey);
                if (!row || row.wonDealIds.length === 0) return null;
                const wonDealsInMonth = closerAndWonDeals.filter(d => row.wonDealIds.includes(d.id));
                const tooltipW = 280;
                const left = hoveredMonth.x + 14 + tooltipW > (typeof window !== "undefined" ? window.innerWidth : 1200)
                    ? hoveredMonth.x - tooltipW - 14
                    : hoveredMonth.x + 14;
                const top = hoveredMonth.y - 8;
                return (
                    <div
                        onMouseEnter={cancelHideMonth}
                        onMouseLeave={() => setHoveredMonth(null)}
                        style={{
                            position: "fixed", left, top, width: tooltipW, maxHeight: 340, overflowY: "auto",
                            background: "#1a1a2e", border: `1px solid ${T.green}55`,
                            borderRadius: 10, padding: "12px 14px", zIndex: 9999,
                            boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
                        }}
                    >
                        <div style={{ fontSize: 11, fontWeight: 700, color: T.green, marginBottom: 10, borderBottom: `1px solid ${T.border}`, paddingBottom: 6 }}>
                            {row.month} — {row.won} ganho{row.won !== 1 ? "s" : ""}
                        </div>
                        {wonDealsInMonth.map(d => {
                            const scored = scoredAll.find(s => s.id === d.id);
                            return (
                                <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, paddingBottom: 6, borderBottom: `1px solid ${T.border}22` }}>
                                    {scored && <ScoreBadge band={scored.score.band} total={scored.score.total} />}
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: 10, color: T.cream, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                            {d.destino || "Sem destino"}
                                        </div>
                                        <div style={{ fontSize: 9, color: T.muted }}>
                                            {d.valor_fechado_em_contrato ? fmtBRLFull(d.valor_fechado_em_contrato) : "—"}
                                            {d.num_convidados ? ` · ${d.num_convidados} conv.` : ""}
                                        </div>
                                    </div>
                                    <a
                                        href={`https://welcometrips.activehosted.com/app/deals/${d.id}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        style={{ fontSize: 9, color: T.gold, fontWeight: 700, textDecoration: "none", border: `1px solid ${T.gold}55`, borderRadius: 4, padding: "1px 5px", whiteSpace: "nowrap" }}
                                    >
                                        AC ↗
                                    </a>
                                </div>
                            );
                        })}
                    </div>
                );
            })()}
        </div>
    );
}

export const PotencialSection = React.memo(PotencialSectionInner);
