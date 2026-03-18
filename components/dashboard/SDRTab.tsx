"use client";

import { useState, useMemo } from "react";
import {
    ComposedChart, Bar, Line,
    XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, ReferenceLine, Cell,
} from "recharts";
import { SectionTitle } from "./SectionTitle";
import { CustomTooltip } from "./CustomTooltip";
import { T } from "./theme";
import { type SDRMetrics, type PeriodFilter, computeSDRMetrics } from "@/lib/metrics-sdr";
import { type Deal } from "@/lib/schemas";

/* ─── Color mapping (prototype C → T) ────────────────────────────────────── */
const C = {
    blue: "#4D94FF",
    blueDim: "rgba(77,148,255,0.10)",
    amber: T.gold,
    amberDim: `${T.gold}1A`,
    red: T.red,
    redDim: `${T.red}1A`,
    redBright: `${T.red}40`,
    green: T.green,
    greenDim: `${T.green}1A`,
    purple: T.rose,
};

/* ─── Shared styles ───────────────────────────────────────────────────────── */
const s = {
    card: { background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: "18px" } as const,
    label: { fontSize: 10, color: T.muted, fontWeight: 500, letterSpacing: "0.7px", textTransform: "uppercase" as const },
    mono: { fontFamily: "monospace" },
    sep: { borderTop: `1px solid ${T.border}`, marginTop: 10, paddingTop: 10 },
};

/* ─── Helper: MiniBar ─────────────────────────────────────────────────────── */
function MiniBar({ pct, color = C.blue }: { pct: number; color?: string }) {
    return (
        <div style={{ height: 5, background: "rgba(255,255,255,0.05)", borderRadius: 3, marginTop: 3 }}>
            <div style={{ height: "100%", borderRadius: 3, width: `${Math.min(100, pct)}%`, background: color, transition: "width 0.4s ease" }} />
        </div>
    );
}

/* ─── Helper: Badge ───────────────────────────────────────────────────────── */
function Badge({ v, suffix = "%" }: { v: number; suffix?: string }) {
    const c = v < 15 ? C.red : v < 25 ? C.amber : C.green;
    return <span style={{ color: c, fontFamily: "monospace", fontWeight: 700 }}>{v}{suffix}</span>;
}

/* ─── Helper: Trend chart tooltip ─────────────────────────────────────────── */
function TrendTooltip({ active, payload }: { active?: boolean; payload?: any[] }) {
    if (!active || !payload?.length) return null;
    const d = payload[0]?.payload;
    if (!d) return null;
    return (
        <div style={{ background: "#231740", border: `1px solid ${T.border}`, borderRadius: 8, padding: "10px 14px", fontSize: 11 }}>
            <div style={{ color: T.white, fontWeight: 700, marginBottom: 5 }}>
                {d.label} {d.diaSemana ? `· ${d.diaSemana}` : ""}
                {d.isWeekend && <span style={{ marginLeft: 6, background: C.blueDim, color: C.blue, padding: "1px 6px", borderRadius: 3 }}>FDS</span>}
            </div>
            <div style={{ color: C.blue }}>MQL: <strong>{d.mql}</strong></div>
            <div style={{ color: C.amber }}>Agendamentos: <strong>{d.agendamentos}</strong></div>
            <div style={{ color: T.muted }}>
                Taxa: <strong style={{ color: d.taxaAgend < 15 ? C.red : d.taxaAgend < 25 ? C.amber : C.green }}>{d.taxaAgend.toFixed(1)}%</strong>
                {" "}(meta: 45%)
            </div>
            {d.reunioes > 0 && <div style={{ color: C.purple }}>Reunioes: <strong>{d.reunioes}</strong></div>}
        </div>
    );
}

/* ─── Helper: Delta chip ──────────────────────────────────────────────────── */
function DeltaChip({ delta }: { delta: number | null }) {
    if (delta == null) return null;
    return (
        <div style={{ fontSize: 10, marginTop: 4, color: delta >= 0 ? C.green : C.red }}>
            {delta >= 0 ? "+" : ""}{delta.toFixed(1)}% vs ant.
        </div>
    );
}

/* ─── Helper: KPI Card ────────────────────────────────────────────────────── */
function KpiCard({ label, value, delta, color, alert }: {
    label: string; value: string | number; delta?: number | null; color: string; alert?: boolean;
}) {
    return (
        <div style={{
            background: alert ? C.redDim : T.card,
            border: `1px solid ${alert ? C.redBright : T.border}`,
            borderRadius: 10, padding: "12px 12px 10px", cursor: "default",
            transition: "border-color 0.2s",
        }}>
            <div style={s.label}>{label}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color, ...s.mono, lineHeight: 1.2, marginTop: 5 }}>{value}</div>
            <DeltaChip delta={delta ?? null} />
        </div>
    );
}

/* ─── Helper: Investigation Panel ─────────────────────────────────────────── */
function InvestigationPanel({ m }: { m: SDRMetrics }) {
    const inv = m.investigation;
    if (!inv) return null;

    return (
        <div style={{ padding: "18px", background: T.surface, border: `1px solid ${C.redBright}`, borderRadius: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#fca5a5", marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
                Investigacao · Ultimos 7 dias vs 7 dias anteriores
                <span style={{ fontWeight: 400, color: T.muted, fontSize: 11 }}>
                    · {inv.last.agend} agend vs {inv.prev.agend} agend
                </span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>

                {/* Diagnostico volume vs taxa */}
                <div style={{ ...s.card, padding: 16 }}>
                    <div style={{ ...s.label, marginBottom: 12 }}>Diagnostico da queda</div>
                    <div style={{ marginBottom: 10 }}>
                        <div style={{ fontSize: 12, color: T.muted, marginBottom: 3 }}>Agendamentos</div>
                        <div style={{ fontSize: 20, fontWeight: 700, ...s.mono, color: C.red }}>
                            {inv.last.agend} <span style={{ fontSize: 13, color: T.muted }}>vs {inv.prev.agend}</span>
                        </div>
                    </div>
                    <div style={s.sep}>
                        <div style={{ ...s.label, marginBottom: 8 }}>Decomposicao da queda</div>
                        <div style={{ fontSize: 11, color: T.muted, marginBottom: 5 }}>
                            <span style={{ width: 8, height: 8, background: C.blue, borderRadius: "50%", display: "inline-block", marginRight: 6 }} />
                            Efeito volume (MQL):
                            <strong style={{ color: inv.volEffect < 0 ? C.red : C.green, marginLeft: 6, ...s.mono }}>
                                {inv.volEffect > 0 ? "+" : ""}{inv.volEffect.toFixed(1)} agend
                            </strong>
                        </div>
                        <div style={{ fontSize: 11, color: T.muted, marginBottom: 10 }}>
                            <span style={{ width: 8, height: 8, background: C.amber, borderRadius: "50%", display: "inline-block", marginRight: 6 }} />
                            Efeito taxa (conversao):
                            <strong style={{ color: inv.rateEffect < 0 ? C.red : C.green, marginLeft: 6, ...s.mono }}>
                                {inv.rateEffect > 0 ? "+" : ""}{inv.rateEffect.toFixed(1)} agend
                            </strong>
                        </div>
                        <div style={{
                            padding: "8px 10px",
                            background: Math.abs(inv.rateEffect) > Math.abs(inv.volEffect) ? C.redDim : C.blueDim,
                            borderRadius: 7, fontSize: 11, fontWeight: 700, color: T.white,
                        }}>
                            Causa principal: {Math.abs(inv.rateEffect) > Math.abs(inv.volEffect) ? "CONVERSAO (taxa caiu)" : "VOLUME (menos MQLs)"}
                        </div>
                    </div>
                </div>

                {/* SDR breakdown */}
                <div style={{ ...s.card, padding: 16 }}>
                    <div style={{ ...s.label, marginBottom: 12 }}>Performance por SDR</div>
                    {inv.sdrComp.map(sdr => {
                        const statusDot = sdr.delta < -12 ? C.red : sdr.delta < -4 ? C.amber : C.green;
                        return (
                            <div key={sdr.ownerId} style={{ marginBottom: 12 }}>
                                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, alignItems: "center" }}>
                                    <span style={{ fontSize: 12, color: T.white, display: "flex", alignItems: "center", gap: 5 }}>
                                        <span style={{ width: 8, height: 8, borderRadius: "50%", background: statusDot, display: "inline-block", flexShrink: 0 }} />
                                        {sdr.ownerId}
                                    </span>
                                    <span style={{ fontSize: 11, ...s.mono, color: sdr.delta < 0 ? C.red : C.green }}>
                                        {sdr.taxaLast.toFixed(0)}%
                                        <span style={{ fontSize: 10, marginLeft: 4 }}>({sdr.delta > 0 ? "+" : ""}{sdr.delta.toFixed(1)}pp)</span>
                                    </span>
                                </div>
                                <MiniBar pct={sdr.taxaLast * 2.5} color={sdr.delta < -12 ? C.red : sdr.delta < 0 ? C.amber : C.green} />
                                <div style={{ fontSize: 10, color: T.muted, marginTop: 3 }}>
                                    {sdr.mqlLast} MQL · {sdr.agendLast} agend · prev: {sdr.taxaPrev.toFixed(0)}%
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Motivos variacao */}
                <div style={{ ...s.card, padding: 16 }}>
                    <div style={{ ...s.label, marginBottom: 12 }}>Motivos de Perda (variacao)</div>
                    {inv.motivosComp.slice(0, 6).map(mo => (
                        <div key={mo.motivo} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, padding: "4px 0", borderBottom: `1px solid ${T.border}` }}>
                            <span style={{ fontSize: 11, color: T.muted, maxWidth: "60%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{mo.motivo}</span>
                            <div style={{ textAlign: "right" }}>
                                <div style={{ fontSize: 11, ...s.mono, color: T.white }}>{mo.pctLast.toFixed(1)}%</div>
                                <div style={{ fontSize: 10, color: mo.delta > 5 ? C.red : mo.delta < -5 ? C.green : T.muted }}>
                                    {mo.delta > 0 ? "+" : ""}{mo.delta.toFixed(1)}pp
                                </div>
                            </div>
                        </div>
                    ))}
                    <div style={{ ...s.sep, fontSize: 11, color: T.muted }}>
                        "Outros" em alta = motivo nao registrado. Revisar preenchimento no AC.
                    </div>
                </div>
            </div>
        </div>
    );
}

/* ─── Helper: Day Detail Panel ────────────────────────────────────────────── */
function DayDetail({ day, onClose }: {
    day: SDRMetrics["dailyTrend"][number];
    onClose: () => void;
}) {
    return (
        <div style={s.card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: T.white }}>{day.label} · {day.diaSemana}</span>
                    {day.isWeekend && <span style={{ fontSize: 10, background: C.blueDim, color: C.blue, padding: "2px 8px", borderRadius: 4 }}>FDS</span>}
                </div>
                <button onClick={onClose} style={{ background: "none", border: `1px solid ${T.border}`, borderRadius: 5, color: T.muted, cursor: "pointer", fontSize: 11, padding: "3px 10px" }}>
                    Voltar
                </button>
            </div>

            {/* Day KPIs */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 14 }}>
                {[
                    { l: "MQL", v: day.mql, c: C.blue },
                    { l: "Agendamentos", v: day.agendamentos, c: C.amber },
                    { l: "Taxa Agend.", v: `${day.taxaAgend.toFixed(1)}%`, c: day.taxaAgend < 15 ? C.red : day.taxaAgend < 25 ? C.amber : C.green },
                    { l: "Reunioes", v: day.reunioes, c: C.purple },
                    { l: "Comparecimento", v: `${day.taxaComp.toFixed(1)}%`, c: C.green },
                    { l: "Qualificados", v: day.qualificados, c: T.muted },
                ].map(kpi => (
                    <div key={kpi.l} style={{ background: "rgba(255,255,255,0.025)", borderRadius: 8, padding: "9px 11px" }}>
                        <div style={{ ...s.label, marginBottom: 4 }}>{kpi.l}</div>
                        <div style={{ fontSize: 20, fontWeight: 700, color: kpi.c, ...s.mono }}>{kpi.v}</div>
                    </div>
                ))}
            </div>

            {/* SDRs on this day */}
            <div style={s.sep}>
                <div style={{ ...s.label, marginBottom: 8 }}>SDRs neste dia</div>
                {day.sdrData.map(sdr => {
                    const dotColor = sdr.taxa < 5 ? C.red : sdr.taxa < 15 ? C.amber : C.green;
                    return (
                        <div key={sdr.ownerId} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 8px", borderRadius: 6, marginBottom: 3 }}>
                            <span style={{ fontSize: 12, color: T.white, display: "flex", alignItems: "center", gap: 5 }}>
                                <span style={{ width: 8, height: 8, borderRadius: "50%", background: dotColor, display: "inline-block" }} />
                                {sdr.ownerId}
                            </span>
                            <div style={{ display: "flex", gap: 12, fontSize: 11, ...s.mono }}>
                                <span style={{ color: T.muted }}>{sdr.mql} MQL</span>
                                <span style={{ color: C.amber }}>{sdr.agendamentos} agend</span>
                                <span style={{ color: sdr.taxa < 15 ? C.red : C.green, fontWeight: 700 }}>{sdr.taxa.toFixed(0)}%</span>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Motivos for this day */}
            {day.motivoBreakdown.some(mb => mb.count > 0) && (
                <div style={s.sep}>
                    <div style={{ ...s.label, marginBottom: 8 }}>Motivos de Perda ({day.mql - day.agendamentos} leads)</div>
                    {day.motivoBreakdown.filter(mb => mb.count > 0).map(mb => (
                        <div key={mb.motivo} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, padding: "4px 0", borderBottom: `1px solid ${T.border}` }}>
                            <span style={{ color: T.muted }}>{mb.motivo}</span>
                            <span style={{ color: T.white, ...s.mono }}>{mb.count}</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

/* ─── Helper: DOW Heatmap ─────────────────────────────────────────────────── */
function DOWHeatmap({ dowPattern }: { dowPattern: SDRMetrics["dowPattern"] }) {
    return (
        <div style={s.card}>
            <div style={{ fontSize: 13, fontWeight: 700, color: T.white, marginBottom: 4 }}>Taxa Agendamento por Dia da Semana</div>
            <div style={{ fontSize: 11, color: T.muted, marginBottom: 16 }}>Media do periodo — identifica padroes de cadencia</div>
            {dowPattern.map(d => (
                <div key={d.dow} style={{ marginBottom: 14 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5, alignItems: "center" }}>
                        <span style={{ fontSize: 12, color: T.white, fontWeight: 500 }}>{d.dow}</span>
                        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                            <span style={{ fontSize: 10, color: T.muted }}>~{d.avgMql.toFixed(1)} MQL/dia</span>
                            <span style={{ fontSize: 13, fontWeight: 700, ...s.mono, color: d.avgTaxa < 15 ? C.red : d.avgTaxa < 25 ? C.amber : C.green }}>
                                {Math.round(d.avgTaxa)}%
                            </span>
                        </div>
                    </div>
                    <div style={{ height: 8, background: "rgba(255,255,255,0.04)", borderRadius: 4 }}>
                        <div style={{
                            height: "100%", borderRadius: 4,
                            width: `${(d.avgTaxa / 50) * 100}%`,
                            background: d.avgTaxa < 15 ? C.red : d.avgTaxa < 25 ? C.amber : C.green,
                            transition: "width 0.4s ease",
                        }} />
                    </div>
                </div>
            ))}
            <div style={s.sep}>
                <div style={{ ...s.label, marginBottom: 8 }}>Interpretacao</div>
                <div style={{ fontSize: 11, color: T.muted, lineHeight: 1.6 }}>
                    Dias com taxa abaixo de 20% requerem revisao da cadencia de resposta da SDR. Verifique tempo de primeiro contato e volume de tentativas.
                </div>
            </div>
        </div>
    );
}

/* ─── Helper: Motivos Cards Full-Width ────────────────────────────────────── */
function MotivosSection({ motivosCards }: { motivosCards: SDRMetrics["motivosCards"] }) {
    const totalCount = motivosCards.reduce((sum, m) => sum + m.count, 0);
    return (
        <div style={s.card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: T.white }}>Motivos de Perda SDR</div>
                    <div style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>Periodo vs. benchmark historico</div>
                </div>
                <div style={{ fontSize: 11, color: T.muted }}>
                    {totalCount} leads perdidos no periodo
                </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
                {motivosCards.map(mo => (
                    <div key={mo.motivo} style={{
                        background: T.surface, borderRadius: 9, padding: "12px 14px",
                        border: `1px solid ${Math.abs(mo.delta) > 10 ? (mo.delta > 0 ? C.redBright : `${C.green}4D`) : T.border}`,
                    }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                            <span style={{ fontSize: 11, color: T.muted, maxWidth: "75%", lineHeight: 1.4 }}>{mo.motivo}</span>
                            <span style={{ fontSize: 10, color: mo.delta > 5 ? C.red : mo.delta < -5 ? C.green : T.muted, fontWeight: 700 }}>
                                {mo.delta > 0 ? "+" : ""}{mo.delta.toFixed(1)}pp
                            </span>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
                            <div>
                                <div style={{ fontSize: 20, fontWeight: 700, color: T.white, ...s.mono }}>{mo.pct.toFixed(1)}%</div>
                                <div style={{ fontSize: 10, color: T.muted }}>hist: {mo.histPct.toFixed(1)}%</div>
                            </div>
                            <div style={{ fontSize: 13, ...s.mono, color: T.muted }}>{mo.count}</div>
                        </div>
                        <MiniBar pct={mo.pct * 1.2} color={mo.delta > 10 ? C.red : mo.delta > 3 ? C.amber : C.blue} />
                    </div>
                ))}
            </div>
            {motivosCards.some(mo => mo.pct > 40) && (
                <div style={{ marginTop: 14, padding: "10px 14px", background: C.redDim, borderRadius: 8, fontSize: 11, color: T.muted, border: `1px solid ${T.border}` }}>
                    <strong style={{ color: "#fca5a5" }}>Atencao:</strong> Motivo com mais de 40% pode indicar subnotificacao — verificar preenchimento no ActiveCampaign.
                </div>
            )}
        </div>
    );
}


/* ═════════════════════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═════════════════════════════════════════════════════════════════════════════ */

interface SDRTabProps {
    deals: Deal[];
    fieldMap: Record<string, string>;
}

export function SDRTab({ deals, fieldMap }: SDRTabProps) {
    const [filter, setFilter] = useState<PeriodFilter>("4weeks");
    const [selectedDay, setSelectedDay] = useState<number | null>(null);
    const [investigateOpen, setInvestigateOpen] = useState(false);

    const m = useMemo(() => computeSDRMetrics(deals, fieldMap, filter), [deals, fieldMap, filter]);

    const periodLabel = filter === "week" ? "Semana Atual" : filter === "4weeks" ? "Ultimas 4 Semanas" : filter === "3months" ? "Ultimos 3 Meses" : "Historico Completo";

    // Aggregated KPIs from dailyTrend
    const kpis = useMemo(() => {
        const dt = m.dailyTrend;
        const mql = dt.reduce((sum, d) => sum + d.mql, 0);
        const agend = dt.reduce((sum, d) => sum + d.agendamentos, 0);
        const reun = dt.reduce((sum, d) => sum + d.reunioes, 0);
        const qual = dt.reduce((sum, d) => sum + d.qualificados, 0);
        const taxaAgend = mql > 0 ? (agend / mql) * 100 : 0;
        const taxaComp = agend > 0 ? (reun / agend) * 100 : 0;
        return { mql, agend, reun, qual, taxaAgend, taxaComp };
    }, [m.dailyTrend]);

    const dayData = selectedDay !== null ? m.dailyTrend[selectedDay] ?? null : null;

    // Detect if any day in dailyTrend is in anomaly zone (low taxa)
    // Used for bar coloring — days in last 10 with avg below threshold
    const anomalyDaySet = useMemo(() => {
        if (!m.anomaly?.alert) return new Set<number>();
        // Mark last 10 workdays as anomaly zone
        const workIndices: number[] = [];
        m.dailyTrend.forEach((d, i) => { if (!d.isWeekend) workIndices.push(i); });
        return new Set(workIndices.slice(-10));
    }, [m.anomaly, m.dailyTrend]);

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

            {/* ── 1. PERIOD FILTER ──────────────────────────────────────────── */}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 5 }}>
                {(["week", "4weeks", "3months", "full"] as PeriodFilter[]).map(f => (
                    <button
                        key={f}
                        onClick={() => { setFilter(f); setSelectedDay(null); }}
                        style={{
                            padding: "5px 12px", borderRadius: 6, border: "none", cursor: "pointer",
                            fontSize: 11, fontWeight: 600, transition: "all 0.15s",
                            background: filter === f ? T.gold : "rgba(255,255,255,0.06)",
                            color: filter === f ? "#000" : T.muted,
                        }}
                    >
                        {f === "week" ? "Semana" : f === "4weeks" ? "4 Semanas" : f === "3months" ? "3 Meses" : "Completo"}
                    </button>
                ))}
            </div>

            {/* ── 2. ALERT BANNER ───────────────────────────────────────────── */}
            {m.anomaly?.alert && (
                <div style={{
                    padding: "10px 16px", background: C.redDim,
                    border: `1px solid ${C.redBright}`, borderRadius: 10,
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ fontSize: 16, color: C.red, fontWeight: 700 }}>!</span>
                        <div>
                            <span style={{ fontSize: 12, color: "#fca5a5", fontWeight: 700 }}>Anomalia detectada · </span>
                            <span style={{ fontSize: 12, color: T.muted }}>
                                Taxa de agendamento: <strong style={{ color: T.white }}>{m.anomaly.prevAvg.toFixed(0)}%</strong>
                                {" → "}<strong style={{ color: C.red }}>{m.anomaly.recentAvg.toFixed(0)}%</strong>
                                {" "}({m.anomaly.delta > 0 ? "+" : ""}{m.anomaly.delta.toFixed(0)}pp nos ultimos 10 dias uteis)
                            </span>
                        </div>
                    </div>
                    <button
                        onClick={() => setInvestigateOpen(!investigateOpen)}
                        style={{
                            padding: "6px 14px", borderRadius: 7, border: "none", cursor: "pointer",
                            fontSize: 11, fontWeight: 700,
                            background: investigateOpen ? C.red : `${C.red}59`,
                            color: "#fff",
                        }}
                    >
                        {investigateOpen ? "Fechar" : "Investigar queda"}
                    </button>
                </div>
            )}

            {/* ── 3. KPI STRIP ──────────────────────────────────────────────── */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 8 }}>
                <KpiCard label="MQL" value={kpis.mql} delta={m.deltaVsPrev.dMql} color={C.blue} />
                <KpiCard label="Agendamentos" value={kpis.agend} delta={m.deltaVsPrev.dAgend} color={C.amber} />
                <KpiCard
                    label="Taxa Agend."
                    value={`${kpis.taxaAgend.toFixed(1)}%`}
                    color={kpis.taxaAgend < 20 ? C.red : kpis.taxaAgend < 30 ? C.amber : C.green}
                    alert={kpis.taxaAgend < 20}
                />
                <KpiCard label="Reunioes" value={kpis.reun} color={C.purple} />
                <KpiCard label="Taxa Comparec." value={`${kpis.taxaComp.toFixed(1)}%`} color={C.green} />
                <KpiCard label="Qualificados" value={kpis.qual} color={T.muted} />
                <KpiCard label="Meta Agend." value="45%" color={T.muted} />
            </div>

            {/* ── 4. INVESTIGATION PANEL ────────────────────────────────────── */}
            {investigateOpen && <InvestigationPanel m={m} />}

            {/* ── 5. DAILY TREND CHART ──────────────────────────────────────── */}
            <div style={s.card}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
                    <div>
                        <SectionTitle>Tendencia Diaria</SectionTitle>
                        <div style={{ fontSize: 11, color: T.muted, marginTop: -8 }}>
                            Clique em qualquer dia para detalhar · Barras avermelhadas = periodo de queda
                        </div>
                    </div>
                    <div style={{ display: "flex", gap: 14, alignItems: "center", fontSize: 11, color: T.muted }}>
                        <span><span style={{ display: "inline-block", width: 10, height: 10, background: `${C.blue}80`, borderRadius: 2, marginRight: 4 }} />MQL</span>
                        <span><span style={{ display: "inline-block", width: 10, height: 3, background: C.amber, marginRight: 4, verticalAlign: "middle" }} />Taxa %</span>
                        <span><span style={{ display: "inline-block", width: 10, height: 3, background: `${C.purple}80`, marginRight: 4, verticalAlign: "middle", borderTop: "1px dashed" }} />Meta 45%</span>
                    </div>
                </div>
                <ResponsiveContainer width="100%" height={190}>
                    <ComposedChart
                        data={m.dailyTrend}
                        onClick={(e: any) => {
                            if (e?.activeTooltipIndex != null) setSelectedDay(e.activeTooltipIndex);
                        }}
                    >
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                        <XAxis dataKey="label" tick={{ fill: T.muted, fontSize: 10 }} axisLine={false} tickLine={false} />
                        <YAxis yAxisId="l" tick={{ fill: T.muted, fontSize: 10 }} axisLine={false} tickLine={false} width={22} />
                        <YAxis yAxisId="r" orientation="right" tick={{ fill: T.muted, fontSize: 10 }} axisLine={false} tickLine={false} width={30} domain={[0, 80]} unit="%" />
                        <Tooltip content={<TrendTooltip />} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
                        <ReferenceLine yAxisId="r" y={45} stroke={`${C.purple}59`} strokeDasharray="5 3" />
                        <Bar yAxisId="l" dataKey="mql" radius={[3, 3, 0, 0]} maxBarSize={20} cursor="pointer">
                            {m.dailyTrend.map((entry, idx) => (
                                <Cell
                                    key={idx}
                                    fill={
                                        idx === selectedDay ? C.blue :
                                        anomalyDaySet.has(idx) ? `${C.red}66` :
                                        `${C.blue}59`
                                    }
                                    stroke={idx === selectedDay ? C.blue : "transparent"}
                                    strokeWidth={1.5}
                                />
                            ))}
                        </Bar>
                        <Line yAxisId="r" type="monotone" dataKey="taxaAgend" stroke={C.amber} strokeWidth={2.5} dot={false} activeDot={{ r: 5, fill: C.amber, strokeWidth: 0 }} />
                    </ComposedChart>
                </ResponsiveContainer>
            </div>

            {/* ── 6. BOTTOM GRID ────────────────────────────────────────────── */}
            <div style={{ display: "grid", gridTemplateColumns: dayData ? "1.1fr 0.9fr" : "1fr", gap: 12 }}>
                {dayData && (
                    <DayDetail day={dayData} onClose={() => setSelectedDay(null)} />
                )}
                <DOWHeatmap dowPattern={m.dowPattern} />
            </div>

            {/* ── 7. MOTIVOS FULL WIDTH ─────────────────────────────────────── */}
            <MotivosSection motivosCards={m.motivosCards} />

        </div>
    );
}
