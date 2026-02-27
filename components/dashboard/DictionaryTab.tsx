"use client";

import React, { useState } from "react";
import { METRIC_DEFINITIONS } from "@/lib/metrics-definitions";
import { T } from "./theme";
import { SectionTitle } from "./SectionTitle";
import { BookOpen, Database, Calculator, PenTool, Search, Activity, AlertCircle } from "lucide-react";

export function DictionaryTab() {
    const [search, setSearch] = useState("");

    const filteredMetrics = Object.entries(METRIC_DEFINITIONS).filter(([key, def]) => {
        const query = search.toLowerCase();
        return (
            key.toLowerCase().includes(query) ||
            def.label.toLowerCase().includes(query) ||
            def.description.toLowerCase().includes(query)
        );
    });

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <BookOpen size={32} style={{ color: T.rose }} />
                    <div>
                        <h1 style={{ fontSize: 22, fontWeight: 700, color: T.white, margin: 0 }}>Dicionário de Métricas</h1>
                        <p style={{ color: T.muted, fontSize: 13, margin: "4px 0 0" }}>Entenda a origem e o cálculo de cada indicador do dashboard.</p>
                    </div>
                </div>

                {/* Search Input */}
                <div style={{ position: "relative", width: 300 }}>
                    <div style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: T.muted }}>
                        <Search size={16} />
                    </div>
                    <input
                        type="text"
                        placeholder="Buscar métrica..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        style={{
                            width: "100%",
                            padding: "10px 14px 10px 36px",
                            borderRadius: 8,
                            border: `1px solid ${T.border}`,
                            background: T.surface,
                            color: T.white,
                            fontSize: 14,
                            outline: "none"
                        }}
                    />
                </div>
            </header>

            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {filteredMetrics.length === 0 ? (
                    <div style={{ padding: 40, textAlign: "center", color: T.muted, background: T.card, borderRadius: 12, border: `1px solid ${T.border}` }}>
                        Nenhuma métrica encontrada para "{search}"
                    </div>
                ) : (
                    filteredMetrics.map(([key, def]) => (
                        <div
                            key={key}
                            style={{
                                padding: 24,
                                borderRadius: 12,
                                border: `1px solid ${T.border}`,
                                background: T.surface,
                                transition: "background 0.2s",
                            }}
                        >
                            <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 16 }}>
                                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                                    <div>
                                        <h3 style={{ fontSize: 18, fontWeight: 700, color: T.rose, margin: 0 }}>{def.label}</h3>
                                        <code style={{ fontSize: 10, opacity: 0.3, userSelect: "all" }}>{key}</code>
                                    </div>
                                    <Badge type={def.type} />
                                </div>
                            </div>

                            <p style={{ marginBottom: 16, fontSize: 13, lineHeight: 1.6, color: T.white }}>{def.description}</p>

                            <div style={{
                                display: "grid",
                                gridTemplateColumns: def.normalRange || def.alertRule ? "1fr 1fr 1fr" : "1fr 1fr",
                                gap: 24,
                                background: "rgba(0,0,0,0.2)",
                                padding: 16,
                                borderRadius: 8,
                            }}>
                                <div>
                                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                                        <Database size={14} style={{ color: T.gold }} />
                                        <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", opacity: 0.5, color: T.white }}>Origem dos Dados</span>
                                    </div>
                                    <div style={{ fontSize: 13, color: T.gold }}>{def.origin}</div>
                                </div>
                                <div>
                                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                                        <Calculator size={14} style={{ color: T.green }} />
                                        <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", opacity: 0.5, color: T.white }}>Fórmula de Cálculo</span>
                                    </div>
                                    <div style={{ fontSize: 13, color: T.green }}>{def.calculation}</div>
                                </div>
                                {(def.normalRange || def.alertRule) && (
                                    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                                        {def.normalRange && (
                                            <div>
                                                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                                                    <Activity size={14} style={{ color: "#4D94FF" }} />
                                                    <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", opacity: 0.5, color: T.white }}>Faixa Normal</span>
                                                </div>
                                                <div style={{ fontSize: 13, color: T.white }}>{def.normalRange}</div>
                                            </div>
                                        )}
                                        {def.alertRule && (
                                            <div>
                                                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                                                    <AlertCircle size={14} style={{ color: T.orange }} />
                                                    <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", opacity: 0.5, color: T.white }}>Regra de Alerta</span>
                                                </div>
                                                <div style={{ fontSize: 13, color: T.orange }}>{def.alertRule}</div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}

function Badge({ type }: { type: "Automática" | "Manual" | "Cálculo" }) {
    const colors = {
        "Automática": { bg: `rgba(77, 148, 255, 0.15)`, text: "#4D94FF", border: `rgba(77, 148, 255, 0.33)`, icon: Database },
        "Manual": { bg: `${T.orange}15`, text: T.orange, border: `${T.orange}33`, icon: PenTool },
        "Cálculo": { bg: `${T.green}15`, text: T.green, border: `${T.green}33`, icon: Calculator }
    };
    const c = colors[type];
    const Icon = c.icon;
    return (
        <span style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            background: c.bg,
            color: c.text,
            border: `1px solid ${c.border}`,
            padding: "4px 10px",
            borderRadius: 20,
            fontSize: 10,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.05em"
        }}>
            <Icon size={12} />
            {type}
        </span>
    );
}
