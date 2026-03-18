"use client";

import React from "react";
import { SectionTitle } from "../SectionTitle";
import { T } from "../theme";
import { BAND_COLOR, BAND_BG, ScoreBadge, fmtBRL } from "./shared";
import type { SimpleScoredDeal } from "@/lib/lead-score";

// ─── Props ───────────────────────────────────────────────────────────────────

interface ScoreSectionProps {
    scored: SimpleScoredDeal[];
    scoreCounts: Record<"A" | "B" | "C" | "D", number>;
}

// ─── Component ───────────────────────────────────────────────────────────────

function ScoreSectionInner({ scored, scoreCounts }: ScoreSectionProps) {
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

            {/* Band summary cards */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
                {(["A", "B", "C", "D"] as const).map(band => (
                    <div key={band} style={{ background: BAND_BG[band], border: `1px solid ${BAND_COLOR[band]}44`, borderRadius: 12, padding: "18px 20px", position: "relative", overflow: "hidden" }}>
                        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: BAND_COLOR[band] }} />
                        <div style={{ fontSize: 10, color: BAND_COLOR[band], fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>
                            Tier {band}{band === "A" ? " · Alta prioridade" : band === "B" ? " · Bom potencial" : band === "C" ? " · Potencial médio" : " · Revisar fit"}
                        </div>
                        <div style={{ fontSize: 36, fontWeight: 900, color: BAND_COLOR[band], fontFamily: "Georgia, serif", lineHeight: 1 }}>{scoreCounts[band]}</div>
                        <div style={{ fontSize: 10, color: T.muted, marginTop: 4 }}>
                            {scored.length > 0 ? `${Math.round(scoreCounts[band] / scored.length * 100)}% dos leads` : "—"}
                        </div>
                    </div>
                ))}
            </div>

            {/* Score board table */}
            {scored.length === 0 ? (
                <div style={{ padding: 32, textAlign: "center", color: T.muted, fontSize: 13, background: T.card, borderRadius: 12, border: `1px solid ${T.border}` }}>
                    Sem leads abertos no pipeline da closer (grupo 3) para pontuar.
                </div>
            ) : (
                <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: "20px 22px" }}>
                    <SectionTitle>Leads em Aberto — Pontuados</SectionTitle>
                    <div style={{ fontSize: 10, color: T.muted, marginBottom: 12 }}>
                        {scored.length} leads · ordenados por score · baseado em destino, convidados e orçamento (campos do marketing)
                    </div>
                    <div style={{ overflowX: "auto" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                            <thead>
                                <tr style={{ borderBottom: `1px solid ${T.border}` }}>
                                    {["Score", "Destino", "Convidados", "Orçamento", "Stage", "Dias no Funil"].map(h => (
                                        <th key={h} style={{ padding: "8px 10px", textAlign: "left", color: T.muted, fontWeight: 600, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.05em", whiteSpace: "nowrap" }}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {[...scored].sort((a, b) => b.score.total - a.score.total).map((d, i) => (
                                    <tr key={d.id} style={{ borderBottom: i < scored.length - 1 ? `1px solid ${T.border}33` : "none", background: i % 2 === 0 ? "transparent" : `${T.surface}88` }}>
                                        <td style={{ padding: "8px 10px" }}>
                                            <ScoreBadge band={d.score.band} total={d.score.total} />
                                        </td>
                                        <td style={{ padding: "8px 10px" }}>
                                            <div style={{ color: T.cream }}>{d.destino || "—"}</div>
                                            <div style={{ fontSize: 9, color: d.score.destino.hasData ? T.muted : T.orange, marginTop: 1 }}>{d.score.destino.detail}</div>
                                        </td>
                                        <td style={{ padding: "8px 10px" }}>
                                            <div style={{ color: T.white }}>{d.num_convidados ?? "—"}</div>
                                            <div style={{ fontSize: 9, color: d.score.convidados.hasData ? T.muted : T.orange, marginTop: 1 }}>{d.score.convidados.detail}</div>
                                        </td>
                                        <td style={{ padding: "8px 10px" }}>
                                            <div style={{ color: T.white }}>{d.orcamento ? fmtBRL(d.orcamento) : "—"}</div>
                                            <div style={{ fontSize: 9, color: d.score.orcamento.hasData ? T.muted : T.orange, marginTop: 1 }}>{d.score.orcamento.detail}</div>
                                        </td>
                                        <td style={{ padding: "8px 10px", color: T.muted, maxWidth: 130, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.stage}</td>
                                        <td style={{ padding: "8px 10px", color: T.white }}>{d.diasNoFunil}d</td>
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

export const ScoreSection = React.memo(ScoreSectionInner);
