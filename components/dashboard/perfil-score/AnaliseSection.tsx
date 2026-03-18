"use client";

import React, { useState, useMemo } from "react";
import { SectionTitle } from "../SectionTitle";
import { T } from "../theme";
import {
    CONV_BUCKETS, ORC_BUCKETS,
    getConvBucket, getOrcBucket,
    buildHeatmapPivot,
    monthKeyToLabel,
    type HeatCell, type HeatRow,
} from "./shared";
import type { SimpleScoredDeal } from "@/lib/lead-score";

// ─── Props ───────────────────────────────────────────────────────────────────

interface AnaliseSectionProps {
    scoredWon: SimpleScoredDeal[];
    scoredAll: SimpleScoredDeal[];
    allPipelineDeals: import("@/lib/schemas").WonDeal[];
    availableCloseDateMonths: string[];
    availableCdateMonths: string[];
    monthsLeft: string[];
    monthsRight: string[];
    setMonthsLeft: React.Dispatch<React.SetStateAction<string[]>>;
    setMonthsRight: React.Dispatch<React.SetStateAction<string[]>>;
}

// ─── Component ───────────────────────────────────────────────────────────────

function AnaliseSectionInner({
    scoredWon, scoredAll, allPipelineDeals,
    availableCloseDateMonths, availableCdateMonths,
    monthsLeft, monthsRight, setMonthsLeft, setMonthsRight,
}: AnaliseSectionProps) {
    const [dimCol, setDimCol] = useState<"convidados" | "orcamento">("convidados");
    const [drillCell, setDrillCell] = useState<{ side: "left" | "right"; dest: string; bucket: string | null } | null>(null);

    // ── Pivots
    const leadsP13 = useMemo(
        () => scoredAll.filter(d => d.group_id === "1" || d.group_id === "3"),
        [scoredAll]
    );

    const leftConv  = useMemo(() => buildHeatmapPivot(scoredWon, monthsLeft,  "convidados", "data_fechamento"), [scoredWon, monthsLeft]);
    const leftOrc   = useMemo(() => buildHeatmapPivot(scoredWon, monthsLeft,  "orcamento",  "data_fechamento"), [scoredWon, monthsLeft]);
    const rightConv = useMemo(() => buildHeatmapPivot(leadsP13, monthsRight, "convidados", "cdate"), [leadsP13, monthsRight]);
    const rightOrc  = useMemo(() => buildHeatmapPivot(leadsP13, monthsRight, "orcamento",  "cdate"), [leadsP13, monthsRight]);

    const totalClosedInMonths = useMemo(() =>
        monthsLeft.length === 0
            ? scoredWon.length
            : scoredWon.filter(d => {
                const mk = d.data_fechamento ? d.data_fechamento.substring(0, 7) : null;
                return mk !== null && monthsLeft.includes(mk);
            }).length,
        [scoredWon, monthsLeft]
    );

    const totalRightLeads = useMemo(() =>
        monthsRight.length === 0
            ? leadsP13.length
            : leadsP13.filter(d => {
                const mk = d.cdate ? d.cdate.substring(0, 7) : null;
                return mk !== null && monthsRight.includes(mk);
            }).length,
        [leadsP13, monthsRight]
    );

    // ── Aligned destinos
    const alignedDests = useMemo(() => {
        const destTotals = new Map<string, number>();
        for (const p of [leftConv, leftOrc, rightConv, rightOrc]) {
            for (const r of p.rows) destTotals.set(r.dest, (destTotals.get(r.dest) ?? 0) + r.total.leads);
        }
        return [...destTotals.entries()]
            .sort((a, b) => {
                if (a[0] === "Não informado") return 1;
                if (b[0] === "Não informado") return -1;
                return b[1] - a[1];
            })
            .slice(0, 12).map(([d]) => d);
    }, [leftConv, leftOrc, rightConv, rightOrc]);

    const activeBucketsConv = useMemo(() => [...CONV_BUCKETS].filter(b => b !== "Sem dados"), []);
    const activeBucketsOrc  = useMemo(() => [...ORC_BUCKETS].filter(b => b !== "Sem dados"), []);
    const activeBucketsDim  = dimCol === "convidados" ? activeBucketsConv : activeBucketsOrc;

    const lConvMap = useMemo(() => new Map(leftConv.rows.map(r => [r.dest, r])), [leftConv]);
    const lOrcMap  = useMemo(() => new Map(leftOrc.rows.map(r => [r.dest, r])), [leftOrc]);
    const rConvMap = useMemo(() => new Map(rightConv.rows.map(r => [r.dest, r])), [rightConv]);
    const rOrcMap  = useMemo(() => new Map(rightOrc.rows.map(r => [r.dest, r])), [rightOrc]);

    const toggleLeft  = (m: string) => setMonthsLeft(prev  => prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m]);
    const toggleRight = (m: string) => setMonthsRight(prev => prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m]);

    // ── Drill-down
    const getDrillDeals = (side: "left" | "right", dest: string, bucket: string | null) => {
        const source = side === "left" ? scoredWon : leadsP13;
        const months = side === "left" ? monthsLeft : monthsRight;
        return source.filter(d => {
            if (months.length > 0) {
                const raw = side === "left" ? d.data_fechamento : d.cdate;
                const mk = raw ? raw.substring(0, 7) : null;
                if (!mk || !months.includes(mk)) return false;
            }
            if ((d.destino || "Não informado") !== dest) return false;
            if (bucket !== null) {
                const bkt = dimCol === "convidados"
                    ? getConvBucket(d.num_convidados)
                    : getOrcBucket(d.orcamento);
                if (bkt !== bucket) return false;
            }
            return true;
        });
    };

    // ── Cell renderers
    const emptyTd = (key: string) => (
        <td key={key} style={{ padding: "6px 8px", textAlign: "center", color: T.border, fontSize: 9 }}>—</td>
    );

    const renderHeatTd = (pct: number | null, sub: string, maxPct: number, rgb: string, key: string, onClick?: () => void) => {
        if (pct === null || pct === 0) return emptyTd(key);
        const intensity = Math.min(0.85, (pct / Math.max(0.01, maxPct)) * 0.85);
        const bg = `rgba(${rgb},${intensity.toFixed(2)})`;
        return (
            <td key={key} onClick={onClick} style={{ padding: "6px 8px", textAlign: "center", background: bg, cursor: onClick ? "pointer" : "default" }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: "#fff" }}>{pct.toFixed(1)}%</div>
                <div style={{ fontSize: 8, color: "rgba(255,255,255,0.5)", marginTop: 1 }}>{sub}</div>
            </td>
        );
    };

    const renderHeatTotalTd = (pct: number | null, sub: string, maxPct: number, rgb: string, onClick?: () => void) => {
        const intensity = pct !== null && pct > 0 ? Math.min(0.85, (pct / Math.max(0.01, maxPct)) * 0.85) : 0;
        const bg = intensity > 0 ? `rgba(${rgb},${intensity.toFixed(2)})` : "transparent";
        return (
            <td onClick={onClick} style={{ padding: "6px 8px", textAlign: "center", background: bg, borderLeft: `1px solid ${T.border}33`, cursor: onClick ? "pointer" : "default" }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: "#fff" }}>{pct !== null ? `${pct.toFixed(1)}%` : "—"}</div>
                <div style={{ fontSize: 8, color: "rgba(255,255,255,0.5)", marginTop: 1 }}>{sub}</div>
            </td>
        );
    };

    const matchScore = (lCell: HeatCell | undefined, rCell: HeatCell | undefined, maxCR: number, maxVR: number) => {
        const lRate = lCell && totalClosedInMonths > 0 ? lCell.won / totalClosedInMonths * 100 : 0;
        const rPct  = rCell && totalRightLeads > 0 ? rCell.leads / totalRightLeads * 100 : 0;
        const lNorm = lRate / Math.max(0.01, maxCR);
        const rNorm = rPct  / Math.max(0.01, maxVR);
        const score = Math.sqrt(lNorm * rNorm) * 100;
        const sub   = `${lRate.toFixed(1)}% conv · ${rPct.toFixed(1)}% leads`;
        return { score, sub };
    };

    const thS = { padding: "5px 8px", textAlign: "center" as const, color: T.muted, fontWeight: 600, fontSize: 9, textTransform: "uppercase" as const, whiteSpace: "nowrap" as const };
    const thDestS = { ...thS, textAlign: "left" as const, color: T.gold, fontWeight: 700 };
    const tdDestS = { padding: "6px 8px", color: T.cream, fontWeight: 600, fontSize: 10, whiteSpace: "nowrap" as const };
    const panelLabel = (title: string, color = T.gold) => (
        <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.08em", color, marginBottom: 6 }}>{title}</div>
    );

    // ── Render tables
    const lMap = dimCol === "convidados" ? lConvMap : lOrcMap;
    const rMap = dimCol === "convidados" ? rConvMap : rOrcMap;

    let maxConvRate = 0.01;
    let maxVolRate  = 0.01;
    for (const dest of alignedDests) {
        const lRow = lMap.get(dest);
        const rRow = rMap.get(dest);
        for (const b of activeBucketsDim) {
            const lc = lRow?.bm.get(b);
            const rc = rRow?.bm.get(b);
            if (lc && totalClosedInMonths > 0) maxConvRate = Math.max(maxConvRate, lc.won / totalClosedInMonths * 100);
            if (rc && totalRightLeads > 0)     maxVolRate  = Math.max(maxVolRate,  rc.leads / totalRightLeads * 100);
        }
        if (lRow && totalClosedInMonths > 0) maxConvRate = Math.max(maxConvRate, lRow.total.won / totalClosedInMonths * 100);
        if (rRow && totalRightLeads > 0)     maxVolRate  = Math.max(maxVolRate,  rRow.total.leads / totalRightLeads * 100);
    }

    const makeTable = (
        side: "left" | "right",
        id: string,
        title: string,
        subTitle: string,
        color: string,
        rgb: string,
        rowMap: Map<string, HeatRow>,
        getCellPct:  (cell: HeatCell) => number,
        getCellSub:  (cell: HeatCell) => string,
        getTotalPct: (total: HeatCell) => number,
        getTotalSub: (total: HeatCell) => string,
        maxPct: number,
    ) => (
        <div key={id}>
            {panelLabel(title, color)}
            <div style={{ fontSize: 9, color: T.muted, marginBottom: 8 }}>{subTitle}</div>
            <div style={{ overflowX: "auto" }}>
                <table style={{ borderCollapse: "collapse", fontSize: 10, minWidth: "100%" }}>
                    <thead>
                        <tr style={{ borderBottom: `1px solid ${T.border}` }}>
                            <th style={thDestS}>Destino</th>
                            {activeBucketsDim.map(b => <th key={b} style={thS}>{b}</th>)}
                            <th style={{ ...thS, color, borderLeft: `1px solid ${T.border}33` }}>Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        {alignedDests.map((dest, i) => {
                            const row = rowMap.get(dest);
                            return (
                                <tr key={dest} style={{ borderBottom: `1px solid ${T.border}22`, background: i % 2 ? `${T.surface}33` : "transparent" }}>
                                    <td style={tdDestS}>{dest}</td>
                                    {activeBucketsDim.map(b => {
                                        const cell = row?.bm.get(b);
                                        const pct = cell ? getCellPct(cell) : 0;
                                        return pct > 0
                                            ? renderHeatTd(pct, getCellSub(cell!), maxPct, rgb, b,
                                                () => setDrillCell({ side, dest, bucket: b }))
                                            : emptyTd(b);
                                    })}
                                    {row && getTotalPct(row.total) > 0
                                        ? renderHeatTotalTd(getTotalPct(row.total), getTotalSub(row.total), maxPct, rgb,
                                            () => setDrillCell({ side, dest, bucket: null }))
                                        : emptyTd("total")}
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );

    // ── Match table
    let maxMatch = 0.01;
    for (const dest of alignedDests) {
        for (const b of activeBucketsDim) {
            const { score } = matchScore(lMap.get(dest)?.bm.get(b), rMap.get(dest)?.bm.get(b), maxConvRate, maxVolRate);
            maxMatch = Math.max(maxMatch, score);
        }
        const { score: ts } = matchScore(lMap.get(dest)?.total, rMap.get(dest)?.total, maxConvRate, maxVolRate);
        maxMatch = Math.max(maxMatch, ts);
    }

    const matchTable = (
        <div style={{ gridColumn: "1 / -1" }}>
            {panelLabel("Match — Potencial × Captação", "#6366F1")}
            <div style={{ fontSize: 9, color: T.muted, marginBottom: 8 }}>
                Score 0–100 = √(taxa_conv_norm × share_leads_norm) · 100.
                Alto score = segmento que tanto converte quanto recebe leads.
                Baixo score = oportunidade perdida (alta conversão, poucos leads) ou ruído (muitos leads, baixa conversão).
            </div>
            <div style={{ overflowX: "auto" }}>
                <table style={{ borderCollapse: "collapse", fontSize: 10, minWidth: "100%" }}>
                    <thead>
                        <tr style={{ borderBottom: `1px solid ${T.border}` }}>
                            <th style={{ ...thDestS, color: "#6366F1" }}>Destino</th>
                            {activeBucketsDim.map(b => <th key={b} style={thS}>{b}</th>)}
                            <th style={{ ...thS, color: "#6366F1", borderLeft: `1px solid ${T.border}33` }}>Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        {alignedDests.map((dest, i) => {
                            const lRow = lMap.get(dest);
                            const rRow = rMap.get(dest);
                            const { score: ts, sub: tsub } = matchScore(lRow?.total, rRow?.total, maxConvRate, maxVolRate);
                            return (
                                <tr key={dest} style={{ borderBottom: `1px solid ${T.border}22`, background: i % 2 ? `${T.surface}33` : "transparent" }}>
                                    <td style={tdDestS}>{dest}</td>
                                    {activeBucketsDim.map(b => {
                                        const { score, sub } = matchScore(lRow?.bm.get(b), rRow?.bm.get(b), maxConvRate, maxVolRate);
                                        return score > 0
                                            ? renderHeatTd(score, sub, maxMatch, "99,102,241", b)
                                            : emptyTd(b);
                                    })}
                                    {ts > 0
                                        ? renderHeatTotalTd(ts, tsub, maxMatch, "99,102,241")
                                        : emptyTd("total")}
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );

    const leftTable = makeTable(
        "left", "left",
        `Fechamentos (${totalClosedInMonths} no período)`,
        "% = contratos da célula / total fechamentos do período",
        "#3DBF8A", "61,191,138",
        lMap,
        c => totalClosedInMonths > 0 ? c.won / totalClosedInMonths * 100 : 0,
        c => `${c.won} gan.`,
        c => totalClosedInMonths > 0 ? c.won / totalClosedInMonths * 100 : 0,
        c => `${c.won}/${totalClosedInMonths}`,
        maxConvRate,
    );
    const rightTable = makeTable(
        "right", "right",
        `Captação de Leads (${totalRightLeads} no período)`,
        "% = leads da célula / total leads captados no período",
        "#D4A35A", "212,163,90",
        rMap,
        c => totalRightLeads > 0 ? c.leads / totalRightLeads * 100 : 0,
        c => `${c.leads} leads`,
        c => totalRightLeads > 0 ? c.leads / totalRightLeads * 100 : 0,
        c => `${c.leads}/${totalRightLeads}`,
        maxVolRate,
    );

    // ── Drill panel
    const drillPanel = drillCell && (() => {
        const deals = getDrillDeals(drillCell.side, drillCell.dest, drillCell.bucket);
        const sideLabel = drillCell.side === "left" ? "Fechamentos" : "Captação de Leads";
        const bucketLabel = drillCell.bucket ?? "Total";
        const sideColor = drillCell.side === "left" ? "#3DBF8A" : "#D4A35A";
        return (
            <div style={{ gridColumn: "1 / -1", background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, padding: "14px 18px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                    <div style={{ fontSize: 11, color: T.cream }}>
                        <span style={{ color: sideColor, fontWeight: 700 }}>{sideLabel}</span>
                        {" · "}{drillCell.dest}{" · "}{bucketLabel}
                        <span style={{ color: T.muted, marginLeft: 8 }}>({deals.length} deals)</span>
                    </div>
                    <button onClick={() => setDrillCell(null)} style={{
                        background: "transparent", border: `1px solid ${T.border}`,
                        borderRadius: 4, color: T.muted, cursor: "pointer",
                        padding: "2px 8px", fontFamily: "inherit", fontSize: 11,
                    }}>{"\u2715"} fechar</button>
                </div>
                <div style={{ overflowX: "auto", maxHeight: 320, overflowY: "auto" }}>
                    <table style={{ borderCollapse: "collapse", fontSize: 10, width: "100%" }}>
                        <thead>
                            <tr style={{ borderBottom: `1px solid ${T.border}` }}>
                                <th style={{ ...thS, textAlign: "left" as const }}>ID</th>
                                <th style={{ ...thS, textAlign: "left" as const }}>Destino</th>
                                <th style={thS}>Convidados</th>
                                <th style={thS}>Orçamento</th>
                                <th style={thS}>Data</th>
                                <th style={{ ...thS, textAlign: "left" as const }}>Pipeline</th>
                                <th style={{ ...thS, textAlign: "left" as const }}>Etapa</th>
                            </tr>
                        </thead>
                        <tbody>
                            {deals.map((d, i) => {
                                const date = drillCell.side === "left"
                                    ? d.data_fechamento?.substring(0, 10)
                                    : d.cdate?.substring(0, 10);
                                return (
                                    <tr key={d.id} style={{ borderBottom: `1px solid ${T.border}22`, background: i % 2 ? T.card : "transparent" }}>
                                        <td style={{ padding: "5px 8px" }}>
                                            <a href={`https://welcometrips.activehosted.com/app/deals/${d.id}`}
                                               target="_blank" rel="noreferrer"
                                               style={{ color: T.gold, textDecoration: "none", fontWeight: 700 }}>
                                                {d.id}
                                            </a>
                                        </td>
                                        <td style={{ padding: "5px 8px", color: T.cream }}>{d.destino || "—"}</td>
                                        <td style={{ padding: "5px 8px", textAlign: "center", color: T.white }}>{d.num_convidados ?? "—"}</td>
                                        <td style={{ padding: "5px 8px", textAlign: "center", color: T.white }}>
                                            {d.orcamento ? `${(d.orcamento / 1000).toFixed(0)}k` : "—"}
                                        </td>
                                        <td style={{ padding: "5px 8px", textAlign: "center", color: T.muted }}>{date ?? "—"}</td>
                                        <td style={{ padding: "5px 8px", color: T.muted, fontSize: 9 }}>{d.pipeline ?? "—"}</td>
                                        <td style={{ padding: "5px 8px", color: T.muted, fontSize: 9 }}>{d.stage}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    })();

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>

            {/* Seletor de meses compartilhado */}
            <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: "18px 22px" }}>
                <SectionTitle>Seletor de Meses</SectionTitle>
                <div style={{ fontSize: 10, color: T.muted, marginBottom: 12 }}>
                    Selecione meses para cada painel. Nenhum selecionado = todos os dados.
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
                    {([
                        { label: "Fechamentos (esquerda)", subLabel: "por data de fechamento de contrato", months: availableCloseDateMonths, selected: monthsLeft, toggle: toggleLeft, color: "#3DBF8A" },
                        { label: "Captação de leads (direita)", subLabel: "por data de criação do lead · pipelines SDR + Closer", months: availableCdateMonths, selected: monthsRight, toggle: toggleRight, color: "#D4A35A" },
                    ] as const).map(({ label, subLabel, months, selected, toggle, color }) => (
                        <div key={label}>
                            <div style={{ fontSize: 10, color, fontWeight: 700, textTransform: "uppercase" as const, marginBottom: 2 }}>{label}</div>
                            <div style={{ fontSize: 9, color: T.muted, marginBottom: 6 }}>{subLabel}</div>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                                {months.slice(0, 18).map(m => {
                                    const active = selected.includes(m);
                                    return (
                                        <button key={m} onClick={() => toggle(m)} style={{
                                            background: active ? color : "transparent",
                                            border: `1px solid ${active ? color : T.border}`,
                                            borderRadius: 6, padding: "3px 9px", fontSize: 10,
                                            fontWeight: active ? 700 : 400,
                                            color: active ? T.bg : T.muted,
                                            cursor: "pointer", fontFamily: "inherit",
                                        }}>
                                            {monthKeyToLabel(m)}
                                        </button>
                                    );
                                })}
                                {selected.length === 0 && (
                                    <span style={{ fontSize: 10, color: T.muted, alignSelf: "center" }}>Todos os meses</span>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Heat map: Destino × Dimensão */}
            <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: "18px 22px" }}>
                <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 16 }}>
                    <span style={{ fontSize: 10, color: T.muted }}>Dimensão:</span>
                    {(["convidados", "orcamento"] as const).map(d => (
                        <button key={d} onClick={() => setDimCol(d)} style={{
                            background: dimCol === d ? T.gold : "transparent",
                            border: `1px solid ${dimCol === d ? T.gold : T.border}`,
                            borderRadius: 6, padding: "4px 14px", fontSize: 11,
                            color: dimCol === d ? T.bg : T.muted,
                            cursor: "pointer", fontFamily: "inherit", fontWeight: dimCol === d ? 700 : 400,
                        }}>
                            {d === "convidados" ? "Nº Convidados" : "Orçamento"}
                        </button>
                    ))}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                    {leftTable}
                    {rightTable}
                    {matchTable}
                    {drillPanel}
                </div>
            </div>

            <div style={{ fontSize: 9, color: T.muted, textAlign: "center" }}>
                Esquerda: todos os contratos com data de fechamento, qualquer pipeline · Direita: leads das pipelines SDR + Closer Weddings.
                Destino = "Onde você quer casar?" · Convidados = "Quantas pessoas?" · Investimento = "Quanto pensa em investir?".
                Match = √(conv_norm × lead_norm) × 100 — identifica segmentos com alto alinhamento entre conversão e captação.
            </div>
        </div>
    );
}

export const AnaliseSection = React.memo(AnaliseSectionInner);
