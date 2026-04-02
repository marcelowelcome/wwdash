"use client";

import {
    ResponsiveContainer,
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
} from "recharts";
import { T } from "./theme";
import type { DailyChartRow } from "@/lib/supabase-api";

interface AdsDailyChartProps {
    data: DailyChartRow[];
}

function ChartTooltip({
    active,
    payload,
    label,
}: {
    active?: boolean;
    payload?: Array<{ name: string; value: number; color: string }>;
    label?: string;
}) {
    if (!active || !payload?.length) return null;

    const meta = payload.find((p) => p.name === "Meta")?.value ?? 0;
    const google = payload.find((p) => p.name === "Google")?.value ?? 0;

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
            <div style={{ color: "#1877F2" }}>
                Meta: <strong>R$ {meta.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</strong>
            </div>
            <div style={{ color: "#4285F4" }}>
                Google: <strong>R$ {google.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</strong>
            </div>
            <div style={{ color: T.cream, marginTop: 4, borderTop: `1px solid ${T.border}`, paddingTop: 4 }}>
                Total: <strong>R$ {(meta + google).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</strong>
            </div>
        </div>
    );
}

export function AdsDailyChart({ data }: AdsDailyChartProps) {
    // Format date labels: show just the day number
    const chartData = data.map((d) => ({
        ...d,
        day: d.date.split("-")[2],
    }));

    return (
        <div
            style={{
                background: T.card,
                border: `1px solid ${T.border}`,
                borderRadius: 12,
                padding: "20px 22px",
            }}
        >
            <div style={{ fontSize: 13, fontWeight: 700, color: T.cream, marginBottom: 16 }}>
                Spend Diário
            </div>
            <ResponsiveContainer width="100%" height={220}>
                <BarChart data={chartData} barCategoryGap="20%">
                    <CartesianGrid strokeDasharray="3 3" stroke={T.border} vertical={false} />
                    <XAxis
                        dataKey="day"
                        tick={{ fontSize: 9, fill: T.muted }}
                        axisLine={{ stroke: T.border }}
                        tickLine={false}
                    />
                    <YAxis
                        tick={{ fontSize: 9, fill: T.muted }}
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={(v: number) => `R$${(v / 1000).toFixed(0)}k`}
                    />
                    <Tooltip content={<ChartTooltip />} />
                    <Bar dataKey="metaSpend" name="Meta" stackId="spend" fill="#1877F2" radius={[0, 0, 0, 0]} />
                    <Bar dataKey="googleSpend" name="Google" stackId="spend" fill="#4285F4" radius={[4, 4, 0, 0]} />
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
}
