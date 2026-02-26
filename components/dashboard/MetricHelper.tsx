"use client";

import React, { useState } from "react";
import { Info } from "lucide-react";
import { METRIC_DEFINITIONS } from "@/lib/metrics-definitions";
import { T } from "./theme";

interface MetricHelperProps {
    metricKey: string;
}

export function MetricHelper({ metricKey }: MetricHelperProps) {
    const [show, setShow] = useState(false);
    const def = METRIC_DEFINITIONS[metricKey];

    if (!def) return null;

    return (
        <div className="relative inline-flex items-center ml-1.5 group">
            <Info
                size={14}
                className="cursor-help transition-colors"
                style={{ color: show ? T.white : T.muted }}
                onMouseEnter={() => setShow(true)}
                onMouseLeave={() => setShow(false)}
            />

            {show && (
                <div
                    className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-3 rounded-lg shadow-xl z-50 border pointer-events-none"
                    style={{
                        backgroundColor: T.surface,
                        borderColor: T.border,
                        color: T.white,
                        fontSize: "0.75rem",
                        lineHeight: "1.4"
                    }}
                >
                    <div className="font-bold mb-1" style={{ color: T.rose }}>{def.label}</div>
                    <p className="mb-2 opacity-90">{def.description}</p>
                    <div className="grid grid-cols-2 gap-2 pt-2 border-t" style={{ borderColor: T.border }}>
                        <div>
                            <span className="block opacity-50 uppercase text-[10px] font-bold">Origem</span>
                            <span style={{ color: T.gold }}>{def.origin}</span>
                        </div>
                        <div>
                            <span className="block opacity-50 uppercase text-[10px] font-bold">Tipo</span>
                            <span style={{ color: T.green }}>{def.type}</span>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
