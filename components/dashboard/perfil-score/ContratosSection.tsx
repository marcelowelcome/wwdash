"use client";

import React, { useState, useRef, useMemo } from "react";
import { T } from "../theme";
import {
    BAND_COLOR, BAND_BG, ScoreBadge,
    fmtBRL, fmtBRLFull,
    monthKeyToLabel, sortDeals,
    type SortState,
} from "./shared";
import type { SimpleScoredDeal } from "@/lib/lead-score";

// ─── Props ───────────────────────────────────────────────────────────────────

interface ContratosSectionProps {
    tierConvStats: { band: string; total: number; won: number; lost: number; open: number; convRate: number | null }[];
    availableContractMonths: string[];
    allByCreationMonth: Map<string, SimpleScoredDeal[]>;
    monthA: string | null;
    monthB: string | null;
    setMonthA: (v: string | null) => void;
    setMonthB: (v: string | null) => void;
}

// ─── Component ───────────────────────────────────────────────────────────────

function ContratosSectionInner({
    tierConvStats, availableContractMonths, allByCreationMonth,
    monthA, monthB, setMonthA, setMonthB,
}: ContratosSectionProps) {
    const [sortA, setSortA] = useState<SortState>({ col: "score", dir: "desc" });
    const [sortB, setSortB] = useState<SortState>({ col: "score", dir: "desc" });
    const [hoveredDeal, setHoveredDeal] = useState<{ deal: SimpleScoredDeal; x: number; y: number } | null>(null);
    const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    function showTooltip(deal: SimpleScoredDeal, x: number, y: number) {
        if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
        setHoveredDeal({ deal, x, y });
    }
    function scheduleHide() {
        hideTimeoutRef.current = setTimeout(() => setHoveredDeal(null), 200);
    }
    function cancelHide() {
        if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
    }

    if (availableContractMonths.length === 0) {
        return (
            <div style={{ padding: 40, textAlign: "center", color: T.muted, fontSize: 13, background: T.card, borderRadius: 12, border: `1px solid ${T.border}` }}>
                Sem contratos fechados com data de fechamento registrada.
            </div>
        );
    }

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {/* Tier conversion summary */}
            <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: "18px 20px" }}>
                <div style={{ fontSize: 10, color: T.gold, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 14 }}>
                    Volume e Conversão por Tier — últimos 365 dias (pipelines SDR + Closer)
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
                    {tierConvStats.map(t => {
                        const convColor = t.convRate === null ? T.muted : t.convRate >= 40 ? T.green : t.convRate >= 20 ? T.gold : T.red;
                        return (
                            <div key={t.band} style={{ background: BAND_BG[t.band], border: `1px solid ${BAND_COLOR[t.band]}44`, borderRadius: 10, padding: "14px 16px", position: "relative", overflow: "hidden" }}>
                                <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: BAND_COLOR[t.band] }} />
                                <div style={{ fontSize: 10, color: BAND_COLOR[t.band], fontWeight: 700, marginBottom: 8 }}>Tier {t.band}</div>
                                <div style={{ fontSize: 30, fontWeight: 900, color: BAND_COLOR[t.band], fontFamily: "Georgia, serif", lineHeight: 1 }}>{t.total}</div>
                                <div style={{ fontSize: 9, color: T.muted, marginTop: 4 }}>leads totais</div>
                                <div style={{ marginTop: 12, borderTop: `1px solid ${BAND_COLOR[t.band]}33`, paddingTop: 10, display: "flex", flexDirection: "column", gap: 3 }}>
                                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10 }}>
                                        <span style={{ color: T.muted }}>Ganhos</span>
                                        <span style={{ color: T.green, fontWeight: 700 }}>{t.won}</span>
                                    </div>
                                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10 }}>
                                        <span style={{ color: T.muted }}>Perdidos</span>
                                        <span style={{ color: T.red, fontWeight: 700 }}>{t.lost}</span>
                                    </div>
                                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10 }}>
                                        <span style={{ color: T.muted }}>Abertos</span>
                                        <span style={{ color: T.white }}>{t.open}</span>
                                    </div>
                                </div>
                                <div style={{ marginTop: 10 }}>
                                    <div style={{ fontSize: 9, color: T.muted, marginBottom: 4 }}>Taxa conv. (resolvidos)</div>
                                    <div style={{ fontSize: 18, fontWeight: 900, color: convColor, fontFamily: "Georgia, serif" }}>
                                        {t.convRate !== null ? `${t.convRate}%` : "—"}
                                    </div>
                                    {t.convRate !== null && (
                                        <div style={{ marginTop: 4, height: 4, background: T.border, borderRadius: 2 }}>
                                            <div style={{ width: `${t.convRate}%`, height: "100%", background: convColor, borderRadius: 2, transition: "width 0.4s" }} />
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
                <div style={{ fontSize: 9, color: T.muted, marginTop: 10 }}>
                    Taxa de conversão = ganhos / (ganhos + perdidos). Leads abertos ainda não resolvidos.
                </div>
            </div>

            {/* Month selectors */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                {([
                    { label: "Mês A", value: monthA, set: setMonthA, color: T.rose },
                    { label: "Mês B", value: monthB, set: setMonthB, color: T.gold },
                ] as const).map(({ label, value, set, color }) => (
                    <div key={label} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        <span style={{ fontSize: 9, color: T.muted, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</span>
                        <select
                            value={value ?? ""}
                            onChange={e => set(e.target.value || null)}
                            style={{ background: T.card, border: `1px solid ${color}66`, borderRadius: 8, padding: "8px 12px", color: T.cream, fontSize: 12, fontWeight: 600, fontFamily: "inherit", outline: "none", cursor: "pointer" }}
                        >
                            <option value="">— Selecionar mês —</option>
                            {availableContractMonths.map(mk => (
                                <option key={mk} value={mk}>{monthKeyToLabel(mk)}</option>
                            ))}
                        </select>
                    </div>
                ))}
            </div>

            {/* Side-by-side comparison panels */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                {([
                    { mk: monthA, color: T.rose, sort: sortA, setSort: setSortA },
                    { mk: monthB, color: T.gold, sort: sortB, setSort: setSortB },
                ] as const).map(({ mk, color, sort, setSort }) => {
                    if (!mk) {
                        return (
                            <div key={color} style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: 32, display: "flex", alignItems: "center", justifyContent: "center", color: T.muted, fontSize: 12 }}>
                                Selecione um mês acima
                            </div>
                        );
                    }
                    const deals = allByCreationMonth.get(mk) ?? [];
                    const label = monthKeyToLabel(mk);
                    const avgScore = deals.length > 0 ? Math.round(deals.reduce((s, d) => s + d.score.total, 0) / deals.length) : 0;
                    const scoreColor = avgScore >= 75 ? T.green : avgScore >= 50 ? T.gold : avgScore >= 25 ? T.orange : T.red;

                    const tierRows = (["A", "B", "C", "D"] as const).map(band => {
                        const t = deals.filter(d => d.score.band === band);
                        const won = t.filter(d => !!d.data_fechamento).length;
                        const lost = t.filter(d => !d.data_fechamento && d.status === "2").length;
                        const open = t.length - won - lost;
                        const resolved = won + lost;
                        return { band, total: t.length, won, lost, open, convRate: resolved > 0 ? Math.round(won / resolved * 100) : null };
                    });

                    const totalWon = deals.filter(d => !!d.data_fechamento).length;
                    const totalLost = deals.filter(d => !d.data_fechamento && d.status === "2").length;
                    const sorted = sortDeals(deals, sort);

                    const COLS: { label: string; key: string }[] = [
                        { label: "Tier", key: "score" },
                        { label: "Status", key: "status" },
                        { label: "Destino", key: "destino" },
                        { label: "Convidados", key: "convidados" },
                        { label: "Orçamento", key: "orcamento" },
                        { label: "Fechado", key: "fechado" },
                    ];

                    function toggleSort(key: string) {
                        setSort(prev => prev.col === key
                            ? { col: key, dir: prev.dir === "desc" ? "asc" : "desc" }
                            : { col: key, dir: "desc" }
                        );
                    }

                    return (
                        <div key={color} style={{ background: T.card, border: `1px solid ${color}44`, borderRadius: 12, overflow: "hidden" }}>
                            {/* Panel header */}
                            <div style={{ background: `${color}15`, borderBottom: `1px solid ${color}33`, padding: "14px 18px", display: "flex", alignItems: "center", gap: 12 }}>
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontSize: 16, fontWeight: 800, color: T.white, fontFamily: "Georgia, serif" }}>{label}</div>
                                    <div style={{ fontSize: 10, color: T.muted, marginTop: 3, display: "flex", gap: 12 }}>
                                        <span>{deals.length} leads</span>
                                        <span style={{ color: T.green }}>{"\u2713"} {totalWon} ganhos</span>
                                        <span style={{ color: T.red }}>{"\u2717"} {totalLost} perdidos</span>
                                    </div>
                                </div>
                                <div style={{ textAlign: "right" }}>
                                    <div style={{ fontSize: 26, fontWeight: 900, color: scoreColor, fontFamily: "Georgia, serif", lineHeight: 1 }}>{avgScore}</div>
                                    <div style={{ fontSize: 9, color: T.muted }}>Score médio</div>
                                </div>
                            </div>

                            {/* Per-tier conversion table */}
                            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10, borderBottom: `1px solid ${T.border}` }}>
                                <thead>
                                    <tr style={{ borderBottom: `1px solid ${T.border}` }}>
                                        {["Tier", "Leads", "Ganhos", "Perdidos", "Abertos", "Taxa"].map(h => (
                                            <th key={h} style={{ padding: "6px 10px", textAlign: h === "Tier" ? "left" : "center", color: T.muted, fontWeight: 600, fontSize: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {tierRows.map(t => {
                                        const convColor = t.convRate === null ? T.muted : t.convRate >= 40 ? T.green : t.convRate >= 20 ? T.gold : T.red;
                                        return (
                                            <tr key={t.band} style={{ borderBottom: `1px solid ${T.border}22` }}>
                                                <td style={{ padding: "5px 10px" }}>
                                                    <span style={{ color: BAND_COLOR[t.band], fontWeight: 800, fontSize: 11 }}>Tier {t.band}</span>
                                                </td>
                                                <td style={{ padding: "5px 10px", color: T.white, textAlign: "center", fontWeight: 700 }}>{t.total}</td>
                                                <td style={{ padding: "5px 10px", color: T.green, textAlign: "center", fontWeight: 700 }}>{t.won}</td>
                                                <td style={{ padding: "5px 10px", color: T.red, textAlign: "center" }}>{t.lost}</td>
                                                <td style={{ padding: "5px 10px", color: T.muted, textAlign: "center" }}>{t.open}</td>
                                                <td style={{ padding: "5px 10px", textAlign: "center" }}>
                                                    <span style={{ fontWeight: 700, color: convColor }}>{t.convRate !== null ? `${t.convRate}%` : "—"}</span>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>

                            {/* Individual deals table */}
                            {deals.length === 0 ? (
                                <div style={{ padding: 24, textAlign: "center", color: T.muted, fontSize: 12 }}>Sem leads</div>
                            ) : (
                                <div style={{ overflowX: "auto", maxHeight: 360, overflowY: "auto" }}>
                                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}>
                                        <thead style={{ position: "sticky", top: 0, background: T.card, zIndex: 1 }}>
                                            <tr style={{ borderBottom: `1px solid ${T.border}` }}>
                                                {COLS.map(col => {
                                                    const active = sort.col === col.key;
                                                    const icon = active ? (sort.dir === "desc" ? " \u25BC" : " \u25B2") : " \u21C5";
                                                    return (
                                                        <th
                                                            key={col.key}
                                                            onClick={() => toggleSort(col.key)}
                                                            style={{
                                                                padding: "6px 10px", textAlign: "left",
                                                                color: active ? color : T.muted,
                                                                fontWeight: 600, fontSize: 8,
                                                                textTransform: "uppercase", letterSpacing: "0.05em",
                                                                whiteSpace: "nowrap", cursor: "pointer",
                                                                userSelect: "none",
                                                            }}
                                                        >
                                                            {col.label}<span style={{ opacity: active ? 1 : 0.4 }}>{icon}</span>
                                                        </th>
                                                    );
                                                })}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {sorted.map((d, i) => {
                                                const isWon = !!d.data_fechamento;
                                                const isLost = !isWon && d.status === "2";
                                                const statusLabel = isWon ? "Ganho" : isLost ? "Perdido" : "Aberto";
                                                const statusColor = isWon ? T.green : isLost ? T.red : T.muted;
                                                return (
                                                    <tr
                                                        key={d.id}
                                                        onMouseEnter={isWon ? (e) => showTooltip(d, e.clientX, e.clientY) : undefined}
                                                        onMouseMove={isWon ? (e) => setHoveredDeal(prev => prev ? { ...prev, x: e.clientX, y: e.clientY } : null) : undefined}
                                                        onMouseLeave={isWon ? scheduleHide : undefined}
                                                        style={{
                                                            borderBottom: i < sorted.length - 1 ? `1px solid ${T.border}22` : "none",
                                                            background: i % 2 === 0 ? "transparent" : `${T.surface}66`,
                                                            cursor: isWon ? "default" : undefined,
                                                        }}
                                                    >
                                                        <td style={{ padding: "5px 10px", whiteSpace: "nowrap" }}>
                                                            <ScoreBadge band={d.score.band} total={d.score.total} />
                                                        </td>
                                                        <td style={{ padding: "5px 10px", whiteSpace: "nowrap" }}>
                                                            <span style={{ color: statusColor, fontWeight: 600, fontSize: 9 }}>{statusLabel}</span>
                                                        </td>
                                                        <td style={{ padding: "5px 10px", color: T.cream, whiteSpace: "nowrap" }}>{d.destino || "—"}</td>
                                                        <td style={{ padding: "5px 10px", color: T.white, textAlign: "center" }}>{d.num_convidados ?? "—"}</td>
                                                        <td style={{ padding: "5px 10px", color: T.white, whiteSpace: "nowrap" }}>{d.orcamento ? fmtBRL(d.orcamento) : "—"}</td>
                                                        <td style={{ padding: "5px 10px", color: T.white, whiteSpace: "nowrap" }}>{d.valor_fechado_em_contrato ? fmtBRL(d.valor_fechado_em_contrato) : "—"}</td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Tooltip overlay for won deals */}
            {hoveredDeal && (() => {
                const d = hoveredDeal.deal;
                const tooltipW = 220;
                const left = hoveredDeal.x + 14 + tooltipW > window.innerWidth
                    ? hoveredDeal.x - tooltipW - 14
                    : hoveredDeal.x + 14;
                const top = hoveredDeal.y - 8;
                return (
                    <div
                        onMouseEnter={cancelHide}
                        onMouseLeave={() => setHoveredDeal(null)}
                        style={{
                            position: "fixed", left, top, width: tooltipW,
                            background: "#1a1a2e", border: `1px solid ${T.green}55`,
                            borderRadius: 10, padding: "12px 14px", zIndex: 9999,
                            boxShadow: `0 8px 32px rgba(0,0,0,0.6)`,
                        }}
                    >
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, borderBottom: `1px solid ${T.border}`, paddingBottom: 8 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <ScoreBadge band={d.score.band} total={d.score.total} />
                                <span style={{ fontSize: 10, color: T.green, fontWeight: 700 }}>{"\u2713"} Ganho</span>
                            </div>
                            <a
                                href={`https://welcometrips.activehosted.com/app/deals/${d.id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{ fontSize: 10, color: T.gold, fontWeight: 700, textDecoration: "none", border: `1px solid ${T.gold}55`, borderRadius: 5, padding: "2px 7px", whiteSpace: "nowrap" }}
                            >
                                AC {"\u2197"}
                            </a>
                        </div>
                        {[
                            ["Destino", d.destino],
                            ["Convidados", d.num_convidados],
                            ["Orçamento est.", d.orcamento ? fmtBRLFull(d.orcamento) : null],
                            ["Valor fechado", d.valor_fechado_em_contrato ? fmtBRLFull(d.valor_fechado_em_contrato) : null],
                            ["Fechamento", d.data_fechamento ? d.data_fechamento.substring(0, 10) : null],
                            ["Entrada CRM", d.cdate ? d.cdate.substring(0, 10) : null],
                            ["Fonte", d.ww_fonte_do_lead],
                            ["Cidade", d.cidade],
                        ].map(([label, val]) => val != null && val !== "" ? (
                            <div key={String(label)} style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 4 }}>
                                <span style={{ fontSize: 9, color: T.muted, whiteSpace: "nowrap" }}>{label}</span>
                                <span style={{ fontSize: 9, color: T.cream, fontWeight: 600, textAlign: "right" }}>{String(val)}</span>
                            </div>
                        ) : null)}
                    </div>
                );
            })()}
        </div>
    );
}

export const ContratosSection = React.memo(ContratosSectionInner);
