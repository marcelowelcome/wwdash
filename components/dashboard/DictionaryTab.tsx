"use client";

import React from "react";
import { METRIC_DEFINITIONS } from "@/lib/metrics-definitions";
import { T } from "./theme";
import { SectionTitle } from "./SectionTitle";
import { BookOpen, Database, Calculator, PenTool } from "lucide-react";

export function DictionaryTab() {
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            <header style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <BookOpen size={32} style={{ color: T.rose }} />
                <div>
                    <h1 style={{ fontSize: 22, fontWeight: 700, color: T.white, margin: 0 }}>Dicionário de Métricas</h1>
                    <p style={{ color: T.muted, fontSize: 13, margin: "4px 0 0" }}>Entenda a origem e o cálculo de cada indicador do dashboard.</p>
                </div>
            </header>

            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {Object.entries(METRIC_DEFINITIONS).map(([key, def]) => (
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
                            gridTemplateColumns: "1fr 1fr",
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
                                    <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", opacity: 0.5, color: T.white }}>Lógica de Cálculo</span>
                                </div>
                                <div style={{ fontSize: 13, color: T.green }}>{def.calculation}</div>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

function Badge({ type }: { type: string }) {
    const icons: Record<string, React.ReactNode> = {
        Automática: <Database size={12} />,
        Cálculo: <Calculator size={12} />,
        Manual: <PenTool size={12} />,
    };

    const colors: Record<string, string> = {
        Automática: T.gold,
        Cálculo: T.green,
        Manual: T.orange,
    };

    const color = colors[type] || T.muted;

    return (
        <span
            style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "4px 10px",
                borderRadius: 20,
                fontSize: 10,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.04em",
                background: `${color}20`,
                color: color,
                border: `1px solid ${color}40`,
            }}
        >
            {icons[type]}
            {type}
        </span>
    );
}
