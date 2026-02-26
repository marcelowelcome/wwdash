"use client";

import { T, statusColor, statusIcon } from "./theme";
import { type Status } from "@/lib/schemas";
import { MetricHelper } from "./MetricHelper";

interface KpiCardProps {
    label: string;
    value: string | number;
    sub?: string;
    status: Status;
    delta?: string;
    metricKey?: string;
}

export function KpiCard({ label, value, sub, status, delta, metricKey }: KpiCardProps) {
    const c = statusColor(status);
    return (
        <div
            style={{
                background: T.card,
                border: `1px solid ${T.border}`,
                borderRadius: 12,
                padding: "18px 20px",
                position: "relative",
                overflow: "hidden",
                flex: 1,
                minWidth: 150,
            }}
        >
            <div
                style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    right: 0,
                    height: 3,
                    background: c,
                    borderRadius: "12px 12px 0 0",
                }}
            />
            <div
                style={{
                    fontSize: 10,
                    color: T.muted,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    fontWeight: 600,
                    marginBottom: 8,
                    display: "flex",
                    alignItems: "center"
                }}
            >
                {label}
                {metricKey && <MetricHelper metricKey={metricKey} />}
            </div>
            <div
                style={{
                    fontSize: 30,
                    fontWeight: 800,
                    color: T.white,
                    fontFamily: "Georgia, serif",
                    letterSpacing: "-0.02em",
                    lineHeight: 1,
                }}
            >
                {value}
            </div>
            {sub && (
                <div style={{ fontSize: 11, color: T.muted, marginTop: 5 }}>{sub}</div>
            )}
            {delta && (
                <div style={{ fontSize: 11, color: c, marginTop: 6, fontWeight: 600 }}>
                    {delta}
                </div>
            )}
            <div
                style={{
                    position: "absolute",
                    bottom: 12,
                    right: 14,
                    fontSize: 20,
                    color: c,
                    opacity: 0.7,
                }}
            >
                {statusIcon(status)}
            </div>
        </div>
    );
}
