"use client";

import { T } from "./theme";

interface TooltipPayloadItem {
    color: string;
    name: string;
    value: number;
}

interface CustomTooltipProps {
    active?: boolean;
    payload?: TooltipPayloadItem[];
    label?: string;
}

export function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
    if (!active || !payload?.length) return null;

    return (
        <div
            style={{
                background: "#231740",
                border: `1px solid ${T.border}`,
                borderRadius: 8,
                padding: "10px 14px",
                fontSize: 12,
                color: T.cream,
            }}
        >
            <div style={{ color: T.gold, fontWeight: 700, marginBottom: 4 }}>
                {label}
            </div>
            {payload.map((p, i) => (
                <div key={i} style={{ color: p.color }}>
                    {p.name}:{" "}
                    <strong>
                        {p.value}
                        {p.name?.includes("Taxa") || p.name?.includes("taxa") ? "%" : ""}
                    </strong>
                </div>
            ))}
        </div>
    );
}
