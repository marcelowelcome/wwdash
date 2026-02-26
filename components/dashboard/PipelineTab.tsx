"use client";

import { SectionTitle } from "./SectionTitle";
import { T, statusColor } from "./theme";
import { type Metrics } from "@/lib/metrics";

interface PipelineTabProps {
    m: Metrics;
}

export function PipelineTab({ m }: PipelineTabProps) {
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
                {/* By Stage */}
                <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: "20px 22px" }}>
                    <SectionTitle metricKey="pipeByStage">Por Estágio — {m.openDeals} Deals Abertos</SectionTitle>
                    <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 4 }}>
                        {m.pipeByStage.map((st, i) => {
                            const colors = [T.muted, T.rose, T.gold, T.green, T.orange, T.berry];
                            const c = colors[i % colors.length];
                            return (
                                <div key={i}>
                                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, fontSize: 12 }}>
                                        <span style={{ color: T.white }}>{st.stage}</span>
                                        <span style={{ color: c, fontWeight: 700 }}>
                                            {st.n} · {Math.round((st.n / m.openDeals) * 100)}%
                                        </span>
                                    </div>
                                    <div style={{ height: 7, background: T.border, borderRadius: 4 }}>
                                        <div
                                            style={{
                                                height: "100%",
                                                width: `${(st.n / (m.pipeByStage[0]?.n || 1)) * 100}%`,
                                                background: c,
                                                borderRadius: 4,
                                            }}
                                        />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* By Age */}
                <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: "20px 22px" }}>
                    <SectionTitle metricKey="pipeByAge">Por Idade no Pipeline</SectionTitle>
                    <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 4 }}>
                        {m.pipeByAge.map((ag, i) => {
                            const c = statusColor(ag.status);
                            return (
                                <div
                                    key={i}
                                    style={{
                                        background: T.surface,
                                        borderRadius: 8,
                                        border: `1px solid ${c}33`,
                                        padding: "12px 16px",
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "space-between",
                                    }}
                                >
                                    <div>
                                        <div style={{ fontSize: 13, fontWeight: 600, color: T.white }}>{ag.label}</div>
                                        <div style={{ fontSize: 10, color: c, marginTop: 2 }}>
                                            {ag.status === "green" ? "alta chance" : ag.status === "orange" ? "maturando" : "baixa chance"}
                                        </div>
                                    </div>
                                    <div style={{ textAlign: "right" }}>
                                        <div style={{ fontSize: 26, fontWeight: 800, color: ag.n === 0 ? T.muted : c, fontFamily: "Georgia, serif" }}>
                                            {ag.n}
                                        </div>
                                        <div style={{ fontSize: 10, color: T.muted }}>
                                            {m.openDeals > 0 ? Math.round((ag.n / m.openDeals) * 100) : 0}%
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* 7-Day Projection */}
            <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: "20px 22px" }}>
                <SectionTitle>Projeção — Próximos 7 Dias</SectionTitle>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
                    {(() => {
                        const contracts =
                            m.pipeByStage.find((s) => s.stage?.toLowerCase().includes("contrato"))?.n || 0;
                        const mature = m.pipeByAge.find((a) => a.label === "15–30 dias")?.n || 0;
                        const best = Math.round(contracts * 0.6 + mature * 0.276);
                        const real = Math.round(contracts * 0.4 + mature * 0.2);

                        return [
                            { label: "Contratos Enviados", n: contracts, proj: Math.round(contracts * 0.6), color: T.green, note: "~60% fecham" },
                            { label: "Pipeline Maduro (15–30d)", n: mature, proj: Math.round(mature * 0.25), color: T.gold, note: "~25% fecham" },
                            { label: "Total Esperado", n: "–", proj: `${real}–${best}`, color: T.rose, note: "Cenário realista" },
                        ].map((p, i) => (
                            <div
                                key={i}
                                style={{ background: T.surface, borderRadius: 10, border: `1px solid ${p.color}44`, padding: "16px 18px" }}
                            >
                                <div style={{ fontSize: 10, color: T.muted, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>{p.label}</div>
                                <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                                    <span style={{ fontSize: 32, fontWeight: 800, color: p.color, fontFamily: "Georgia, serif" }}>{p.proj}</span>
                                    <span style={{ fontSize: 12, color: T.muted }}>fech.</span>
                                </div>
                                <div style={{ fontSize: 11, color: T.muted, marginTop: 4 }}>
                                    {p.n !== "–" && `${p.n} deals · `}{p.note}
                                </div>
                            </div>
                        ));
                    })()}
                </div>
            </div>
        </div>
    );
}
