"use client";

import {
    AreaChart, Area, BarChart, Bar, LineChart, Line,
    XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, ReferenceLine, Cell, ComposedChart, ReferenceArea
} from "recharts";
import { SectionTitle } from "./SectionTitle";
import { CustomTooltip } from "./CustomTooltip";
import { T } from "./theme";
import { type Metrics } from "@/lib/metrics";

interface FunnelTabProps {
    m: Metrics;
}

export function FunnelTab({ m }: FunnelTabProps) {
    const fnl = m.sdrFunnel;

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>

            {/* Bloco 2.1 — KPIs SDR (4 cards) */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 18 }}>
                {/* 1. Leads semana atual */}
                <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: "20px" }}>
                    <div style={{ fontSize: 11, color: T.muted, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 12 }}>Leads semana atual</div>
                    <div style={{ fontSize: 32, fontWeight: 700, color: T.white, fontFamily: "Georgia, serif", marginBottom: 8 }}>{m.sdrThisWeek}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
                        <span style={{ color: m.sdrStatus === "green" ? T.green : m.sdrStatus === "orange" ? T.orange : T.red }}>
                            {m.sdrThisWeek >= m.sdrAvg4 ? '▲' : '▼'} vs {m.sdrAvg4} (MM4s)
                        </span>
                    </div>
                </div>

                {/* 2. MM4s */}
                <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: "20px" }}>
                    <div style={{ fontSize: 11, color: T.muted, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 12 }}>MM4s (média 4 sem)</div>
                    <div style={{ fontSize: 32, fontWeight: 700, color: T.white, fontFamily: "Georgia, serif", marginBottom: 8 }}>{m.sdrAvg4}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: T.muted }}>
                        base dinâmica
                    </div>
                </div>

                {/* 3. Taxa qualificação SDR */}
                <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: "20px" }}>
                    <div style={{ fontSize: 11, color: T.muted, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 12 }}>Taxa Qualificação SDR</div>
                    <div style={{ fontSize: 32, fontWeight: 700, color: m.qualRate < 10 ? T.red : T.white, fontFamily: "Georgia, serif", marginBottom: 8 }}>{m.qualRate}%</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
                        {m.qualRate < 10 ? (
                            <span style={{ color: T.red }}>⚠ abaixo de 10%</span>
                        ) : (
                            <span style={{ color: T.green }}>✔ Saudável</span>
                        )}
                    </div>
                </div>

                {/* 4. Taxa No-Show */}
                <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: "20px" }}>
                    <div style={{ fontSize: 11, color: T.muted, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 12 }}>Taxa No-Show → Closer</div>
                    <div style={{ fontSize: 32, fontWeight: 700, color: m.sdrNoShowRate > 20 ? T.red : T.white, fontFamily: "Georgia, serif", marginBottom: 8 }}>{m.sdrNoShowRate}%</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
                        {m.sdrNoShowRate < 15 ? (
                            <span style={{ color: T.green }}>▼ melhora recente</span>
                        ) : (
                            <span style={{ color: T.orange }}>— estável</span>
                        )}
                    </div>
                </div>
            </div>

            {/* Bloco 2.2 — Gráfico SDR: Volume + Qualificação (12 semanas) */}
            <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: "20px 22px" }}>
                <SectionTitle metricKey="sdrThisWeek">Volume + Engajamento + Qualificação (12 Semanas)</SectionTitle>
                <ResponsiveContainer width="100%" height={280}>
                    <ComposedChart data={m.sdrWeeklyHistory} margin={{ top: 20, right: 20, bottom: 0, left: -20 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke={T.border} vertical={false} />
                        <XAxis dataKey="week" tick={{ fontSize: 9, fill: T.muted }} tickLine={false} axisLine={false} angle={-30} textAnchor="end" height={44} />

                        {/* Eixo Esquerdo: Volume */}
                        <YAxis yAxisId="left" tick={{ fontSize: 9, fill: T.muted }} tickLine={false} axisLine={false} />
                        {/* Eixo Direito: Taxa Qualificação (%) */}
                        <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 9, fill: T.muted }} tickLine={false} axisLine={false} domain={[0, 30]} tickFormatter={(v) => `${v}%`} />

                        <Tooltip content={<CustomTooltip />} />

                        {/* Banda Sombreada: Range Normal 10-15% (eixo direito) */}
                        <ReferenceArea yAxisId="right" y1={10} y2={15} fill={T.green} fillOpacity={0.06} strokeOpacity={0} />
                        <ReferenceLine yAxisId="right" y={10} stroke={T.red} strokeDasharray="3 3" strokeOpacity={0.4} />

                        {/* Barras Agrupadas */}
                        <Bar yAxisId="left" dataKey="leads" name="Leads Recebidos" fill="#4D94FF" radius={[4, 4, 0, 0]} maxBarSize={32} />
                        <Bar yAxisId="left" dataKey="engaged" name="Engajados" fill={T.berry} radius={[4, 4, 0, 0]} maxBarSize={32} />

                        {/* Linha de Qualificação */}
                        <Line yAxisId="right" type="monotone" dataKey="qualRate" name="Taxa de Qualificação %" stroke={T.orange} strokeWidth={3} dot={{ r: 3, fill: T.card, stroke: T.orange, strokeWidth: 2 }} />
                    </ComposedChart>
                </ResponsiveContainer>
            </div>

            {/* Bloco 2.3 — Funil Visual SDR */}
            <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: "20px 22px" }}>
                <SectionTitle>FUNIL SDR — etapas e taxas de passagem (Global)</SectionTitle>

                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 16 }}>
                    <FunnelStep
                        label="Leads recebidos (MQL)"
                        count={fnl.received}
                        pctText="100%"
                        barWidth="100%"
                        color="#4D94FF"
                    />
                    <FunnelStep
                        label="Engajaram com a SDR"
                        count={fnl.engaged}
                        pctText={`${fnl.engagedPct.toFixed(1)}%`}
                        barWidth={`${Math.max(fnl.engagedPct, 10)}%`}
                        color={T.berry}
                    />
                    <FunnelStep
                        label="Fechados com decisão"
                        count={fnl.decided}
                        pctText={`${fnl.decidedPct.toFixed(1)}% dos engajados`}
                        barWidth={`${Math.max((fnl.decided / fnl.received) * 100, 10)}%`}
                        color="#8884d8"
                    />
                    <FunnelStep
                        label="Passaram da barreira da taxa"
                        count={fnl.passedTaxa}
                        pctText={`~${Math.round(fnl.passedTaxaPct)}%`}
                        barWidth={`${Math.max((fnl.passedTaxa / fnl.received) * 100, 10)}%`}
                        color={T.orange}
                    />
                    <FunnelStep
                        label="Qualificados → Closer"
                        count={fnl.qualified}
                        pctText={`${fnl.qualifiedPctFromReceived.toFixed(1)}%`}
                        barWidth={`${Math.max((fnl.qualified / fnl.received) * 100, 5)}%`}
                        color={T.green}
                    />
                </div>
            </div>

            {/* Bloco 2.4 — Motivos de Perda SDR (2 painéis) */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
                {/* Histórico Completo */}
                <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: "20px 22px" }}>
                    <SectionTitle>Histórico completo (excl. StandBy)</SectionTitle>
                    <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 16 }}>
                        {m.sdrLossPanels.histLoss.map((item, idx) => (
                            <div key={idx} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: T.muted }} />
                                    <span style={{ fontSize: 13, color: T.white }}>{item.motivo}</span>
                                </div>
                                <span style={{ fontSize: 13, color: T.muted, fontWeight: 600 }}>{item.pct}%</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Últimos 4 Meses */}
                <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: "20px 22px" }}>
                    <SectionTitle>Últimos 4 meses (Tendência Atual)</SectionTitle>
                    <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 16 }}>
                        {m.sdrLossPanels.recentLoss.map((item, idx) => {
                            // Find corresponding hist value to compare
                            const histItem = m.sdrLossPanels.histLoss.find(h => h.motivo === item.motivo);
                            let badge = null;
                            if (!histItem || histItem.pct === 0) {
                                badge = <span style={{ fontSize: 9, background: `rgba(77, 148, 255, 0.33)`, color: "#4D94FF", padding: "2px 6px", borderRadius: 4, fontWeight: 700 }}>NOVO</span>;
                            } else if (item.pct > histItem.pct * 1.2) { // 20% relative increase
                                badge = <span style={{ fontSize: 9, color: T.red, fontWeight: 700 }}>▲ ALTA</span>;
                            } else if (item.pct < histItem.pct * 0.8) {
                                badge = <span style={{ fontSize: 9, color: T.green, fontWeight: 700 }}>▼ QUEDA</span>;
                            }

                            return (
                                <div key={idx} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                        <div style={{ width: 8, height: 8, borderRadius: "50%", background: T.orange }} />
                                        <span style={{ fontSize: 13, color: T.white }}>{item.motivo}</span>
                                    </div>
                                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                        <span style={{ fontSize: 13, color: T.white, fontWeight: 600 }}>{item.pct}%</span>
                                        <div style={{ width: 44, textAlign: "right" }}>{badge}</div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* Bloco 2.5 — Evolução Mensal: Taxa de Serviço */}
            <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: "20px 22px" }}>
                <SectionTitle>Evolução Mensal: Objeção à Taxa de Serviço</SectionTitle>
                <div style={{ fontSize: 12, color: T.muted, marginBottom: 16 }}>
                    Percentual de deals engajados perdidos especificamente por "Taxa de Serviço" / "Orçamento não condiz".
                </div>
                <ResponsiveContainer width="100%" height={240}>
                    <LineChart data={m.sdrTaxaTrend} margin={{ top: 20, right: 20, bottom: 0, left: -20 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke={T.border} vertical={false} />
                        <XAxis dataKey="month" tick={{ fontSize: 9, fill: T.muted }} tickLine={false} axisLine={false} />
                        <YAxis tick={{ fontSize: 9, fill: T.muted }} tickLine={false} axisLine={false} domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
                        <Tooltip
                            contentStyle={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: '8px' }}
                            itemStyle={{ color: T.orange }}
                            formatter={(value: any) => [`${value}%`, 'Rejeição p/ Taxa']}
                        />
                        <Line type="monotone" dataKey="rate" stroke={T.orange} strokeWidth={3} dot={{ r: 4, fill: T.card, stroke: T.orange, strokeWidth: 2 }} />
                    </LineChart>
                </ResponsiveContainer>
            </div>

        </div>
    );
}

// Custom internal component for Funnel Steps
function FunnelStep({ label, count, pctText, barWidth, color }: { label: string, count: number, pctText: string, barWidth: string | number, color: string }) {
    return (
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ flex: 1, display: "flex", justifyContent: "flex-end" }}>
                <div style={{
                    height: 28,
                    width: barWidth,
                    background: color,
                    borderRadius: 4,
                    opacity: 0.85,
                    transition: "width 0.5s ease-out"
                }} />
            </div>
            <div style={{ width: 300, display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: T.white, width: 50, textAlign: "right", fontFamily: "Georgia, serif" }}>
                    {count}
                </div>
                <div style={{ fontSize: 13, color: T.muted, width: 140 }}>
                    {label}
                </div>
                <div style={{ fontSize: 11, color: color, fontWeight: 600, background: `${color}15`, padding: "2px 8px", borderRadius: 4 }}>
                    {pctText}
                </div>
            </div>
        </div>
    );
}
