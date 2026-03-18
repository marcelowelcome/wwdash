"use client";

import React, { useMemo } from "react";
import { SectionTitle } from "../SectionTitle";
import { T } from "../theme";
import { AlignmentBar, BAND_COLOR, getConvBucket } from "./shared";
import type { SimpleScoredDeal } from "@/lib/lead-score";

// ─── Props ───────────────────────────────────────────────────────────────────

interface FunilSectionProps {
    funnelQuality: {
        status: string;
        message: string;
        avgScore: number;
        scoreSummary: { band: string; count: number; pct: number; color: string }[];
        dimensionAlignment: {
            key: string;
            name: string;
            alignment: number;
            openDist: { label: string; pct: number }[];
            winnerDist: { label: string; pct: number }[];
        }[];
    };
    allOpenDeals: import("@/lib/schemas").WonDeal[];
    simpleProfiles: { totalResolvidos: number };
    scoredAll: SimpleScoredDeal[];
}

// ─── Component ───────────────────────────────────────────────────────────────

function FunilSectionInner({ funnelQuality, allOpenDeals, simpleProfiles, scoredAll }: FunilSectionProps) {
    // ── Tabela cruzada: Destino × Faixa de Convidados ────────
    const crossTable = useMemo(() => {
        if (scoredAll.length === 0) return null;

        const BUCKETS = ["\u226450", "51-100", "101-150", "151-200", "201+", "Sem dados"] as const;
        type BucketLabel = typeof BUCKETS[number];

        function getBucket(n: number | null | undefined): BucketLabel {
            if (n == null) return "Sem dados";
            if (n <= 50) return "\u226450";
            if (n <= 100) return "51-100";
            if (n <= 150) return "101-150";
            if (n <= 200) return "151-200";
            return "201+";
        }

        type Cell = { leads: number; won: number; lost: number };
        const destMap = new Map<string, Map<BucketLabel, Cell>>();

        for (const d of scoredAll) {
            const dest = d.destino || "Não informado";
            const bucket = getBucket(d.num_convidados);
            if (!destMap.has(dest)) destMap.set(dest, new Map());
            const bm = destMap.get(dest)!;
            if (!bm.has(bucket)) bm.set(bucket, { leads: 0, won: 0, lost: 0 });
            const cell = bm.get(bucket)!;
            cell.leads++;
            if (d.data_fechamento) cell.won++;
            else if (d.status === "2") cell.lost++;
        }

        const rows = [...destMap.entries()]
            .map(([dest, bm]) => {
                const allCells = [...bm.values()];
                return {
                    dest, bm,
                    totalLeads: allCells.reduce((s, c) => s + c.leads, 0),
                    totalWon: allCells.reduce((s, c) => s + c.won, 0),
                    totalLost: allCells.reduce((s, c) => s + c.lost, 0),
                };
            })
            .sort((a, b) => b.totalLeads - a.totalLeads)
            .slice(0, 12);

        const activeBuckets = BUCKETS.filter(b => rows.some(r => (r.bm.get(b)?.leads ?? 0) > 0));

        return { rows, activeBuckets, BUCKETS };
    }, [scoredAll]);

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div style={{
                background: funnelQuality.status === "green" ? `${T.green}15` : funnelQuality.status === "red" ? `${T.red}15` : `${T.orange}15`,
                border: `1px solid ${funnelQuality.status === "green" ? T.green : funnelQuality.status === "red" ? T.red : T.orange}`,
                borderRadius: 12, padding: "16px 22px", display: "flex", alignItems: "center", gap: 12,
            }}>
                <span style={{ fontSize: 22 }}>{funnelQuality.status === "green" ? "\u{1F7E2}" : funnelQuality.status === "red" ? "\u{1F534}" : "\u{1F7E1}"}</span>
                <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: T.white }}>{funnelQuality.message}</div>
                    <div style={{ fontSize: 10, color: T.muted, marginTop: 2 }}>
                        {simpleProfiles.totalResolvidos} deals resolvidos como referência · {allOpenDeals.length} leads abertos (pipelines SDR + Closer)
                    </div>
                </div>
                <div style={{ marginLeft: "auto", textAlign: "right" }}>
                    <div style={{ fontSize: 28, fontWeight: 900, color: T.white, fontFamily: "Georgia, serif" }}>{funnelQuality.avgScore}</div>
                    <div style={{ fontSize: 9, color: T.muted }}>Score médio</div>
                </div>
            </div>

            {funnelQuality.scoreSummary.length > 0 && (
                <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: "20px 22px" }}>
                    <SectionTitle>Distribuição de Score dos Leads Abertos</SectionTitle>
                    <div style={{ display: "flex", gap: 10, marginTop: 14, height: 120 }}>
                        {funnelQuality.scoreSummary.map(s => (
                            <div key={s.band} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                                <div style={{ flex: 1, width: "100%", display: "flex", alignItems: "flex-end" }}>
                                    <div style={{ width: "100%", height: `${Math.max(4, s.pct)}%`, background: s.color, borderRadius: "4px 4px 0 0", opacity: 0.85 }} />
                                </div>
                                <span style={{ fontSize: 16, fontWeight: 800, color: s.color }}>{s.count}</span>
                                <span style={{ fontSize: 10, color: T.muted }}>Tier {s.band} · {s.pct}%</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {funnelQuality.dimensionAlignment.map(dim => (
                <div key={dim.key} style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: "18px 20px" }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: T.cream, marginBottom: 4 }}>{dim.name}</div>
                    <div style={{ fontSize: 10, color: T.muted, marginBottom: 8 }}>Alinhamento com perfil vencedor (top 3 destinos dos contratos fechados)</div>
                    <AlignmentBar pct={dim.alignment} color={dim.alignment >= 60 ? T.green : dim.alignment >= 35 ? T.orange : T.red} />
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 14 }}>
                        {[
                            { title: "Funil Atual", data: dim.openDist, color: T.white },
                            { title: "Vencedores", data: dim.winnerDist, color: T.gold },
                        ].map(({ title, data, color }) => (
                            <div key={title}>
                                <div style={{ fontSize: 9, color: color === T.gold ? T.gold : T.muted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6, fontWeight: 600 }}>{title}</div>
                                {data.slice(0, 5).map(v => (
                                    <div key={v.label} style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                                        <span style={{ fontSize: 9, color: T.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "70%" }}>{v.label}</span>
                                        <span style={{ fontSize: 9, color, fontWeight: 600 }}>{v.pct}%</span>
                                    </div>
                                ))}
                                {data.length === 0 && <div style={{ fontSize: 9, color: T.muted }}>Sem dados</div>}
                            </div>
                        ))}
                    </div>
                </div>
            ))}

            {crossTable && crossTable.rows.length > 0 && (
                <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: "20px 22px" }}>
                    <SectionTitle>Conversão por Destino × Convidados</SectionTitle>
                    <div style={{ fontSize: 10, color: T.muted, marginBottom: 14 }}>
                        Cada célula: <strong style={{ color: T.cream }}>taxa conv.</strong> (ganhos/resolvidos) · <span style={{ opacity: 0.7 }}>ganhos / total leads</span> abaixo
                    </div>
                    <div style={{ overflowX: "auto" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}>
                            <thead>
                                <tr style={{ borderBottom: `1px solid ${T.border}` }}>
                                    <th style={{ padding: "6px 10px", textAlign: "left", color: T.muted, fontWeight: 700, fontSize: 9, textTransform: "uppercase", whiteSpace: "nowrap" }}>Destino</th>
                                    {crossTable.activeBuckets.map(b => (
                                        <th key={b} style={{ padding: "6px 10px", textAlign: "center", color: T.muted, fontWeight: 600, fontSize: 9, textTransform: "uppercase", whiteSpace: "nowrap" }}>{b}</th>
                                    ))}
                                    <th style={{ padding: "6px 10px", textAlign: "center", color: T.gold, fontWeight: 700, fontSize: 9, textTransform: "uppercase", whiteSpace: "nowrap" }}>Total</th>
                                </tr>
                            </thead>
                            <tbody>
                                {crossTable.rows.map((row, i) => {
                                    const totalResolved = row.totalWon + row.totalLost;
                                    const totalRate = totalResolved > 0 ? Math.round(row.totalWon / totalResolved * 100) : null;
                                    const totalRateColor = totalRate === null ? T.muted : totalRate >= 30 ? T.green : totalRate >= 15 ? T.gold : T.red;
                                    return (
                                        <tr key={row.dest} style={{ borderBottom: i < crossTable.rows.length - 1 ? `1px solid ${T.border}33` : "none", background: i % 2 === 0 ? "transparent" : `${T.surface}44` }}>
                                            <td style={{ padding: "7px 10px", color: T.cream, fontWeight: 600, whiteSpace: "nowrap" }}>{row.dest}</td>
                                            {crossTable.activeBuckets.map(b => {
                                                const cell = row.bm.get(b as any);
                                                if (!cell || cell.leads === 0) {
                                                    return <td key={b} style={{ padding: "7px 10px", textAlign: "center", color: T.border, fontSize: 10 }}>—</td>;
                                                }
                                                const resolved = cell.won + cell.lost;
                                                const rate = resolved > 0 ? Math.round(cell.won / resolved * 100) : null;
                                                const rateColor = rate === null ? T.muted : rate >= 30 ? T.green : rate >= 15 ? T.gold : T.red;
                                                return (
                                                    <td key={b} style={{ padding: "7px 10px", textAlign: "center" }}>
                                                        <div style={{ fontSize: 12, fontWeight: 800, color: rateColor }}>{rate !== null ? `${rate}%` : "—"}</div>
                                                        <div style={{ fontSize: 8, color: T.muted, marginTop: 2 }}>{cell.won}/{cell.leads}</div>
                                                    </td>
                                                );
                                            })}
                                            <td style={{ padding: "7px 10px", textAlign: "center", borderLeft: `1px solid ${T.border}33` }}>
                                                <div style={{ fontSize: 12, fontWeight: 800, color: totalRateColor }}>{totalRate !== null ? `${totalRate}%` : "—"}</div>
                                                <div style={{ fontSize: 8, color: T.muted, marginTop: 2 }}>{row.totalWon}/{row.totalLeads}</div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                    <div style={{ fontSize: 9, color: T.muted, marginTop: 10 }}>
                        Taxa = ganhos / (ganhos + perdidos). Leads abertos não entram no denominador da taxa.
                    </div>
                </div>
            )}
        </div>
    );
}

export const FunilSection = React.memo(FunilSectionInner);
