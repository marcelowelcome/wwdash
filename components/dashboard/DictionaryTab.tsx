"use client";

import React from "react";
import { METRIC_DEFINITIONS } from "@/lib/metrics-definitions";
import { T } from "./theme";
import { SectionTitle } from "./SectionTitle";
import { BookOpen, Database, Calculator, PenTool } from "lucide-react";

export function DictionaryTab() {
    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <header className="flex items-center gap-3">
                <BookOpen size={32} style={{ color: T.rose }} />
                <div>
                    <h1 className="text-2xl font-bold" style={{ color: T.white }}>Dicionário de Métricas</h1>
                    <p style={{ color: T.muted }}>Entenda a origem e o cálculo de cada indicador do dashboard.</p>
                </div>
            </header>

            <div className="grid grid-cols-1 gap-4">
                {Object.entries(METRIC_DEFINITIONS).map(([key, def]) => (
                    <div
                        key={key}
                        className="p-6 rounded-xl border transition-all hover:bg-[#1E1530]"
                        style={{ backgroundColor: T.surface, borderColor: T.border }}
                    >
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
                            <div>
                                <h3 className="text-xl font-bold" style={{ color: T.rose }}>{def.label}</h3>
                                <code className="text-[10px] opacity-30 select-all">{key}</code>
                            </div>
                            <div className="flex items-center gap-2">
                                <Badge type={def.type} />
                            </div>
                        </div>

                        <p className="mb-4 text-sm leading-relaxed" style={{ color: T.white }}>{def.description}</p>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-black/20 p-4 rounded-lg">
                            <div>
                                <div className="flex items-center gap-2 mb-2">
                                    <Database size={14} style={{ color: T.gold }} />
                                    <span className="text-[10px] font-bold uppercase tracking-wider opacity-50">Origem dos Dados</span>
                                </div>
                                <div className="text-sm" style={{ color: T.gold }}>{def.origin}</div>
                            </div>
                            <div>
                                <div className="flex items-center gap-2 mb-2">
                                    <Calculator size={14} style={{ color: T.green }} />
                                    <span className="text-[10px] font-bold uppercase tracking-wider opacity-50">Logica de Cálculo</span>
                                </div>
                                <div className="text-sm" style={{ color: T.green }}>{def.calculation}</div>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

function Badge({ type }: { type: string }) {
    const icons: Record<string, any> = {
        Automática: <Database size={12} />,
        Cálculo: <Calculator size={12} />,
        Manual: <PenTool size={12} />,
    };

    const colors: Record<string, string> = {
        Automática: T.gold,
        Cálculo: T.green,
        Manual: T.orange,
    };

    return (
        <span
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-tight"
            style={{
                backgroundColor: `${colors[type]}20`,
                color: colors[type],
                border: `1px solid ${colors[type]}40`
            }}
        >
            {icons[type]}
            {type}
        </span>
    );
}
