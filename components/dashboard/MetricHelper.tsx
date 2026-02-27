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
        <div style={{ position: "relative", display: "inline-flex", alignItems: "center", marginLeft: 6 }}>
            <Info
                size={14}
                style={{ color: show ? T.white : T.muted, cursor: "help", transition: "color 0.15s" }}
                onMouseEnter={() => setShow(true)}
                onMouseLeave={() => setShow(false)}
            />

            {show && (
                <div
                    style={{
                        position: "absolute",
                        bottom: "100%",
                        left: "50%",
                        transform: "translateX(-50%)",
                        marginBottom: 8,
                        width: 256,
                        padding: 12,
                        borderRadius: 8,
                        boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
                        zIndex: 50,
                        border: `1px solid ${T.border}`,
                        pointerEvents: "none",
                        background: T.surface,
                        color: T.white,
                        fontSize: 12,
                        lineHeight: "1.4",
                    }}
                >
                    <div style={{ fontWeight: 700, marginBottom: 4, color: T.rose }}>{def.label}</div>
                    <p style={{ marginBottom: 8, opacity: 0.9 }}>{def.description}</p>
                    <div style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        gap: 8,
                        paddingTop: 8,
                        borderTop: `1px solid ${T.border}`,
                    }}>
                        <div>
                            <span style={{ display: "block", opacity: 0.5, textTransform: "uppercase", fontSize: 10, fontWeight: 700 }}>Origem</span>
                            <span style={{ color: T.gold }}>{def.origin}</span>
                        </div>
                        <div>
                            <span style={{ display: "block", opacity: 0.5, textTransform: "uppercase", fontSize: 10, fontWeight: 700 }}>Tipo</span>
                            <span style={{ color: T.green }}>{def.type}</span>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
