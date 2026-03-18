"use client";

import React, { useMemo } from "react";
import {
    BarChart, Bar,
    XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer,
} from "recharts";
import { SectionTitle } from "../SectionTitle";
import { CustomTooltip } from "../CustomTooltip";
import { T } from "../theme";
import { fmtBRLFull } from "./shared";
import type { MonthlyProfile } from "@/lib/lead-score";

// ─── Props ───────────────────────────────────────────────────────────────────

interface PerfilSectionProps {
    monthlyProfiles: MonthlyProfile[];
    seasonality: { month: string; monthKey: string; contratos: number; topDestino: string | null }[];
    selectedMonthKey: string | null;
    onSelectMonth: (mk: string) => void;
}

// ─── Component ───────────────────────────────────────────────────────────────

function PerfilSectionInner({ monthlyProfiles, seasonality, selectedMonthKey, onSelectMonth }: PerfilSectionProps) {
    const selectedProfile = useMemo(
        () => monthlyProfiles.find(p => p.monthKey === selectedMonthKey) ?? null,
        [monthlyProfiles, selectedMonthKey]
    );

    if (monthlyProfiles.length === 0) {
        return (
            <div style={{ padding: 40, textAlign: "center", color: T.muted, fontSize: 13 }}>
                Sem contratos fechados com data de fechamento registrada.
            </div>
        );
    }

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {monthlyProfiles.slice(-18).map(p => (
                    <button key={p.monthKey} onClick={() => onSelectMonth(p.monthKey)} style={{
                        background: selectedMonthKey === p.monthKey ? T.rose : T.card,
                        color: selectedMonthKey === p.monthKey ? T.bg : T.muted,
                        border: `1px solid ${selectedMonthKey === p.monthKey ? T.rose : T.border}`,
                        borderRadius: 20, padding: "4px 12px", fontSize: 11, fontWeight: 600, cursor: "pointer", transition: "all 0.15s",
                    }}>
                        {p.month}<span style={{ marginLeft: 4, opacity: 0.7 }}>({p.contratos})</span>
                    </button>
                ))}
            </div>

            {selectedProfile && (
                <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16 }}>
                    <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: "20px 22px" }}>
                        <SectionTitle>Perfil de {selectedProfile.month}</SectionTitle>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginTop: 14 }}>
                            {[
                                { label: "Contratos", value: String(selectedProfile.contratos) },
                                { label: "Convidados (médio)", value: selectedProfile.mediaConvidados ? String(selectedProfile.mediaConvidados) : "—" },
                                { label: "Orçamento Médio", value: selectedProfile.avgOrcamento ? fmtBRLFull(selectedProfile.avgOrcamento) : "—" },
                                { label: "Tempo Médio Fechamento", value: selectedProfile.tempoMedio ? `${selectedProfile.tempoMedio}d` : "—" },
                                { label: "Elopement", value: `${selectedProfile.pctElopement}%` },
                                { label: "Top Tipo Reunião", value: selectedProfile.topReuniao ?? "—" },
                            ].map(kpi => (
                                <div key={kpi.label} style={{ background: T.surface, borderRadius: 8, padding: "12px 14px", border: `1px solid ${T.border}` }}>
                                    <div style={{ fontSize: 9, color: T.muted, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600, marginBottom: 6 }}>{kpi.label}</div>
                                    <div style={{ fontSize: 20, fontWeight: 800, color: T.white, fontFamily: "Georgia, serif" }}>{kpi.value}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                    <div style={{ background: `linear-gradient(135deg, ${T.berry}22, ${T.gold}11)`, border: `1px solid ${T.border}`, borderRadius: 12, padding: "20px 22px" }}>
                        <div style={{ fontSize: 10, color: T.gold, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 14 }}>Perfil Dominante</div>
                        {[
                            { icon: "\u{1F4CD}", label: "Top Destino", value: selectedProfile.topDestinos[0]?.name ?? "—" },
                            { icon: "\u{1F4E3}", label: "Top Origem", value: selectedProfile.topFontes[0]?.name ?? "—" },
                            { icon: "\u{1F91D}", label: "Tipo Reunião", value: selectedProfile.topReuniao ?? "—" },
                            { icon: "\u{1F4B8}", label: "Orçamento Médio", value: selectedProfile.avgOrcamento ? fmtBRLFull(selectedProfile.avgOrcamento) : "—" },
                        ].map(row => (
                            <div key={row.label} style={{ marginBottom: 12 }}>
                                <div style={{ fontSize: 9, color: T.muted, textTransform: "uppercase", letterSpacing: "0.08em" }}>{row.icon} {row.label}</div>
                                <div style={{ fontSize: 13, fontWeight: 700, color: T.cream, marginTop: 2 }}>{row.value}</div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {selectedProfile && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                    {[
                        { title: `Top Destinos — ${selectedProfile.month}`, data: selectedProfile.topDestinos, color: T.rose },
                        { title: `Top Origens — ${selectedProfile.month}`, data: selectedProfile.topFontes, color: T.gold },
                    ].map(({ title, data, color }) => (
                        <div key={title} style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: "20px 22px" }}>
                            <SectionTitle>{title}</SectionTitle>
                            {data.length > 0 ? (
                                <ResponsiveContainer width="100%" height={200}>
                                    <BarChart data={data} layout="vertical" margin={{ top: 6, right: 16, bottom: 0, left: 8 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke={T.border} horizontal={false} />
                                        <XAxis type="number" tick={{ fontSize: 9, fill: T.muted }} tickLine={false} axisLine={false} />
                                        <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 9, fill: T.muted }} tickLine={false} axisLine={false} />
                                        <Tooltip content={<CustomTooltip />} />
                                        <Bar dataKey="count" name="Contratos" fill={color} radius={[0, 4, 4, 0]} barSize={14} />
                                    </BarChart>
                                </ResponsiveContainer>
                            ) : <div style={{ height: 200, display: "flex", alignItems: "center", justifyContent: "center", color: T.muted, fontSize: 12 }}>Sem dados</div>}
                        </div>
                    ))}
                </div>
            )}

            {seasonality.length > 0 && (
                <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: "20px 22px" }}>
                    <SectionTitle>Sazonalidade — Últimos 24 Meses</SectionTitle>
                    <ResponsiveContainer width="100%" height={200}>
                        <BarChart data={seasonality} margin={{ top: 10, right: 20, bottom: 0, left: -10 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke={T.border} vertical={false} />
                            <XAxis dataKey="month" tick={{ fontSize: 8, fill: T.muted }} tickLine={false} axisLine={false} angle={-25} textAnchor="end" height={36} />
                            <YAxis tick={{ fontSize: 9, fill: T.muted }} tickLine={false} axisLine={false} />
                            <Tooltip content={<CustomTooltip />} />
                            <Bar dataKey="contratos" name="Contratos" fill={T.berry} radius={[4, 4, 0, 0]} maxBarSize={28} />
                        </BarChart>
                    </ResponsiveContainer>
                    <div style={{ overflowX: "auto", marginTop: 16 }}>
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                            <thead>
                                <tr style={{ borderBottom: `1px solid ${T.border}` }}>
                                    {["Mês", "Contratos", "Top Destino"].map(h => (
                                        <th key={h} style={{ padding: "6px 10px", textAlign: "left", color: T.muted, fontWeight: 600, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {[...seasonality].reverse().map((s, i) => (
                                    <tr key={s.monthKey} style={{ borderBottom: i < seasonality.length - 1 ? `1px solid ${T.border}33` : "none", background: s.monthKey === selectedMonthKey ? `${T.rose}11` : "transparent" }}>
                                        <td style={{ padding: "6px 10px", color: T.cream, fontWeight: 600 }}>{s.month}</td>
                                        <td style={{ padding: "6px 10px", color: T.white }}>{s.contratos}</td>
                                        <td style={{ padding: "6px 10px", color: T.muted }}>{s.topDestino ?? "—"}</td>
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

export const PerfilSection = React.memo(PerfilSectionInner);
