"use client";

import { T } from "./theme";

interface SectionTitleProps {
    children: React.ReactNode;
    tag?: string;
}

export function SectionTitle({ children, tag }: SectionTitleProps) {
    const isCritical = tag?.includes("CRÍTICO");
    const isWarning = tag?.includes("ATENÇÃO");

    const tagBg = isCritical ? T.red : isWarning ? T.orange : T.green;

    return (
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
            <div
                style={{
                    width: 4,
                    height: 18,
                    background: T.gold,
                    borderRadius: 2,
                    flexShrink: 0,
                }}
            />
            <span
                style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: T.white,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                }}
            >
                {children}
            </span>
            {tag && (
                <span
                    style={{
                        fontSize: 10,
                        fontWeight: 700,
                        color: T.bg,
                        background: tagBg,
                        borderRadius: 20,
                        padding: "2px 9px",
                        letterSpacing: "0.04em",
                    }}
                >
                    {tag}
                </span>
            )}
        </div>
    );
}
