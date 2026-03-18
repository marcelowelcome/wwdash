"use client";

import React from "react";
import { SectionTitle } from "../SectionTitle";
import { T } from "../theme";
import { BAND_COLOR, BAND_BG } from "./shared";
import type { ScoreBands } from "@/lib/lead-score";

// ─── Props ───────────────────────────────────────────────────────────────────

interface ConfigSectionProps {
    bands: ScoreBands;
    onBandChange: (key: "A" | "B" | "C", val: number) => void;
    onSave: () => void;
    onReset: () => void;
}

// ─── Component ───────────────────────────────────────────────────────────────

function ConfigSectionInner({ bands, onBandChange, onSave, onReset }: ConfigSectionProps) {
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div style={{ background: `${T.gold}11`, border: `1px solid ${T.gold}33`, borderRadius: 10, padding: "12px 18px", fontSize: 11, color: T.muted, lineHeight: 1.6 }}>
                <span style={{ color: T.gold, fontWeight: 700 }}>Como funciona o score: </span>
                Soma direta de 3 dimensões com pontuação fixa:
                <strong style={{ color: T.cream }}> Destino</strong> (0-30 pts),
                <strong style={{ color: T.cream }}> Investimento</strong> (0-30 pts),
                <strong style={{ color: T.cream }}> Convidados</strong> (0-30 pts — varia por grupo de destino).
                Score máximo: <strong style={{ color: T.cream }}>90 pontos</strong>. Configure os limiares abaixo para classificar leads em tiers A/B/C/D.
            </div>

            {/* Score bands */}
            <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: "20px 22px" }}>
                <SectionTitle>Faixas de Score (A / B / C / D)</SectionTitle>
                <div style={{ fontSize: 10, color: T.muted, marginBottom: 16 }}>
                    Define o score mínimo para cada faixa. Scores abaixo de C caem em D automaticamente.
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
                    {(["A", "B", "C"] as const).map(band => (
                        <div key={band} style={{ background: BAND_BG[band], border: `1px solid ${BAND_COLOR[band]}44`, borderRadius: 10, padding: "14px 16px" }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: BAND_COLOR[band], marginBottom: 8 }}>Tier {band} — mínimo</div>
                            <input
                                type="number" min={0} max={90}
                                value={bands[band]}
                                onChange={e => onBandChange(band, Math.min(90, Math.max(0, Number(e.target.value))))}
                                style={{ width: "100%", background: T.surface, border: `1px solid ${T.border}`, borderRadius: 6, padding: "6px 10px", color: T.white, fontSize: 16, fontWeight: 700, fontFamily: "Georgia, serif", outline: "none" }}
                            />
                        </div>
                    ))}
                </div>
            </div>

            {/* Scoring reference tables — 3 cards */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>

                {/* Card 1 — Destino */}
                <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: "18px 20px" }}>
                    <SectionTitle>Destino (0-30)</SectionTitle>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, marginTop: 10 }}>
                        <thead>
                            <tr style={{ borderBottom: `1px solid ${T.border}` }}>
                                {["Destino", "Pts"].map(h => (
                                    <th key={h} style={{ padding: "5px 8px", textAlign: "left", color: T.muted, fontWeight: 600, fontSize: 9, textTransform: "uppercase" }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {[
                                { dest: "Caribe", pts: 30 },
                                { dest: "Nordeste", pts: 20 },
                                { dest: "Europa / Itália / Grécia / Portugal / Toscana / Sicília / Santorini / Amsterdam / Paris", pts: 10 },
                                { dest: "Mendoza / Patagônia", pts: 10 },
                                { dest: "Maldivas / Bali", pts: 5 },
                                { dest: "Outros", pts: 5 },
                            ].map((row, i, arr) => (
                                <tr key={row.dest} style={{ borderBottom: i < arr.length - 1 ? `1px solid ${T.border}33` : "none" }}>
                                    <td style={{ padding: "6px 8px", color: T.cream, fontWeight: 600 }}>{row.dest}</td>
                                    <td style={{ padding: "6px 8px", fontWeight: 700, color: row.pts >= 20 ? T.green : row.pts >= 10 ? T.gold : T.muted }}>{row.pts}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* Card 2 — Investimento */}
                <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: "18px 20px" }}>
                    <SectionTitle>Investimento (0-30)</SectionTitle>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, marginTop: 10 }}>
                        <thead>
                            <tr style={{ borderBottom: `1px solid ${T.border}` }}>
                                {["Faixa", "Pts"].map(h => (
                                    <th key={h} style={{ padding: "5px 8px", textAlign: "left", color: T.muted, fontWeight: 600, fontSize: 9, textTransform: "uppercase" }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {[
                                { faixa: "Até R$ 50 mil", pts: 5 },
                                { faixa: "R$ 51-80 mil", pts: 10 },
                                { faixa: "R$ 81-100 mil", pts: 15 },
                                { faixa: "R$ 101-200 mil", pts: 20 },
                                { faixa: "R$ 201-500 mil", pts: 25 },
                                { faixa: "Mais de R$ 500 mil", pts: 30 },
                            ].map((row, i, arr) => (
                                <tr key={row.faixa} style={{ borderBottom: i < arr.length - 1 ? `1px solid ${T.border}33` : "none" }}>
                                    <td style={{ padding: "6px 8px", color: T.cream, fontWeight: 600 }}>{row.faixa}</td>
                                    <td style={{ padding: "6px 8px", fontWeight: 700, color: row.pts >= 20 ? T.green : row.pts >= 10 ? T.gold : T.muted }}>{row.pts}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* Card 3 — Convidados */}
                <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: "18px 20px" }}>
                    <SectionTitle>Convidados (0-30)</SectionTitle>
                    <div style={{ fontSize: 9, color: T.muted, marginTop: 4, marginBottom: 6 }}>Pontuação varia por grupo de destino</div>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                        <thead>
                            <tr style={{ borderBottom: `1px solid ${T.border}` }}>
                                {["Faixa", "Caribe/NE/Outros", "Europa", "Mendoza"].map(h => (
                                    <th key={h} style={{ padding: "5px 6px", textAlign: h === "Faixa" ? "left" : "center", color: T.muted, fontWeight: 600, fontSize: 9, textTransform: "uppercase" }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {[
                                { faixa: "Apenas casal", cno: 5, eur: 5, mza: 5 },
                                { faixa: "Até 20", cno: 10, eur: 25, mza: 10 },
                                { faixa: "20-50", cno: 15, eur: 30, mza: 25 },
                                { faixa: "51-80", cno: 20, eur: 20, mza: 30 },
                                { faixa: "81-100", cno: 25, eur: 15, mza: 20 },
                                { faixa: "100+", cno: 30, eur: 10, mza: 15 },
                            ].map((row, i, arr) => (
                                <tr key={row.faixa} style={{ borderBottom: i < arr.length - 1 ? `1px solid ${T.border}33` : "none" }}>
                                    <td style={{ padding: "6px 6px", color: T.cream, fontWeight: 600 }}>{row.faixa}</td>
                                    {[row.cno, row.eur, row.mza].map((v, j) => (
                                        <td key={j} style={{ padding: "6px 6px", textAlign: "center", fontWeight: 700, color: v >= 25 ? T.green : v >= 15 ? T.gold : T.muted }}>{v}</td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
                <button onClick={onReset} style={{ background: "transparent", border: `1px solid ${T.border}`, borderRadius: 8, padding: "8px 20px", color: T.muted, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
                    Restaurar Padrão
                </button>
                <button onClick={onSave} style={{ background: T.gold, border: "none", borderRadius: 8, padding: "8px 24px", color: T.bg, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                    Salvar Configuração
                </button>
            </div>
        </div>
    );
}

export const ConfigSection = React.memo(ConfigSectionInner);
