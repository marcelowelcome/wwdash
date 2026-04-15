"use client";

import { useMemo } from "react";
import { X } from "lucide-react";
import { T } from "./theme";
import { ownerName } from "@/lib/supabase-api";
import { type WonDeal } from "@/lib/schemas";
import type { StageStats, StageKey } from "@/lib/metrics-jornada";

interface StageDeepDiveProps {
    isOpen: boolean;
    onClose: () => void;
    stage: StageStats | null;
    stagePrev?: StageStats;
    periodoLabel: string;
    periodoAnteriorLabel: string;
}

interface Breakdown {
    key: string;
    label: string;
    count: number;
    pct: number;
    prevCount: number;
    delta: number;
}

const TOP_N = 8;

function buildBreakdown(
    deals: WonDeal[],
    prevDeals: WonDeal[],
    keyFn: (d: WonDeal) => string | null | undefined,
): Breakdown[] {
    const bucket = new Map<string, number>();
    const bucketPrev = new Map<string, number>();
    for (const d of deals) {
        const k = keyFn(d);
        if (!k) continue;
        bucket.set(k, (bucket.get(k) ?? 0) + 1);
    }
    for (const d of prevDeals) {
        const k = keyFn(d);
        if (!k) continue;
        bucketPrev.set(k, (bucketPrev.get(k) ?? 0) + 1);
    }
    const allKeys = new Set([...bucket.keys(), ...bucketPrev.keys()]);
    const total = deals.length || 1;
    return [...allKeys]
        .map((k) => {
            const count = bucket.get(k) ?? 0;
            const prev = bucketPrev.get(k) ?? 0;
            return {
                key: k,
                label: k,
                count,
                prevCount: prev,
                delta: count - prev,
                pct: (count / total) * 100,
            };
        })
        .filter((b) => b.count > 0)
        .sort((a, b) => b.count - a.count);
}

function BreakdownBlock({
    title,
    rows,
    emptyMessage = "Nenhum dado",
}: {
    title: string;
    rows: Breakdown[];
    emptyMessage?: string;
}) {
    const visible = rows.slice(0, TOP_N);
    const maxCount = visible.reduce((m, r) => Math.max(m, r.count), 1);
    return (
        <div
            style={{
                background: T.card,
                border: `1px solid ${T.border}`,
                borderRadius: 10,
                padding: "16px 18px",
            }}
        >
            <div style={{ fontSize: 10, color: T.muted, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700, marginBottom: 12 }}>
                {title}
            </div>
            {rows.length === 0 ? (
                <div style={{ fontSize: 12, color: T.muted, fontStyle: "italic" }}>{emptyMessage}</div>
            ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {visible.map((r) => {
                        const bar = (r.count / maxCount) * 100;
                        const isNew = r.prevCount === 0 && r.count > 0;
                        const deltaColor = r.delta === 0 ? T.muted : r.delta > 0 ? T.green : T.red;
                        return (
                            <div key={r.key} style={{ fontSize: 12 }}>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 3, gap: 10 }}>
                                    <span style={{ color: T.cream, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                        {r.label}
                                    </span>
                                    <span style={{ whiteSpace: "nowrap", color: T.muted }}>
                                        <span style={{ color: T.white, fontFamily: "monospace", fontWeight: 600 }}>{r.count}</span>
                                        <span style={{ fontFamily: "monospace", marginLeft: 4 }}>({r.pct.toFixed(0)}%)</span>
                                        {isNew ? (
                                            <span style={{ color: T.gold, fontFamily: "monospace", marginLeft: 6, fontWeight: 700, fontSize: 10 }}>NOVO</span>
                                        ) : (
                                            <span style={{ color: deltaColor, fontFamily: "monospace", marginLeft: 6, fontSize: 10 }}>
                                                {r.delta === 0 ? "~" : `${r.delta > 0 ? "▲+" : "▼"}${r.delta}`}
                                            </span>
                                        )}
                                    </span>
                                </div>
                                <div style={{ height: 3, background: `${T.border}` }}>
                                    <div style={{ height: "100%", width: `${bar}%`, background: T.gold, opacity: 0.6 }} />
                                </div>
                            </div>
                        );
                    })}
                    {rows.length > TOP_N && (
                        <div style={{ fontSize: 11, color: T.muted, fontStyle: "italic", marginTop: 4 }}>
                            +{rows.length - TOP_N} outros
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

function generateInsights(
    stage: StageStats,
    stagePrev: StageStats | undefined,
    sources: Breakdown[],
    owners: Breakdown[],
    channels: Breakdown[],
): string[] {
    const out: string[] = [];
    if (sources.length > 0) {
        const top = sources[0];
        if (top.pct >= 40) {
            out.push(`Concentração em <strong>${top.label}</strong>: ${top.pct.toFixed(0)}% vem dessa fonte. Diversificar reduz risco.`);
        }
        const grower = sources.find((s) => s.delta >= Math.max(3, s.prevCount * 0.3));
        if (grower) {
            out.push(`<strong>${grower.label}</strong> cresceu ${grower.delta > 0 ? "+" : ""}${grower.delta} vs período anterior.`);
        }
        const dropper = sources.find((s) => s.delta <= -Math.max(3, s.prevCount * 0.3));
        if (dropper) {
            out.push(`<strong>${dropper.label}</strong> caiu ${dropper.delta} vs período anterior.`);
        }
    }
    if (owners.length > 1) {
        const top = owners[0];
        const bot = owners[owners.length - 1];
        if (top.count >= bot.count * 2 && top.count >= 3) {
            out.push(`Distribuição desigual entre responsáveis: <strong>${top.label}</strong> (${top.count}) vs <strong>${bot.label}</strong> (${bot.count}).`);
        }
    }
    if (channels.length > 0) {
        const top = channels[0];
        if (top.pct >= 60) {
            out.push(`Canal <strong>${top.label}</strong> domina (${top.pct.toFixed(0)}%). Testar alternativas pode render melhores resultados.`);
        }
    }
    if (stagePrev && stage.count >= stagePrev.count * 1.2) {
        out.push(`Volume cresceu ${((stage.count / stagePrev.count - 1) * 100).toFixed(0)}% vs período anterior.`);
    } else if (stagePrev && stage.count <= stagePrev.count * 0.8 && stagePrev.count > 0) {
        out.push(`Volume caiu ${((1 - stage.count / stagePrev.count) * 100).toFixed(0)}% vs período anterior.`);
    }
    if (out.length === 0) {
        out.push("Distribuição estável, sem concentração crítica ou mudanças relevantes vs período anterior.");
    }
    return out;
}

const CHANNEL_FIELD_BY_STAGE: Partial<Record<StageKey, keyof WonDeal>> = {
    agendou: "como_foi_feita_a_1a_reuniao",
    realizou: "como_foi_feita_a_1a_reuniao",
    qualificou: "como_foi_feita_a_1a_reuniao",
    agCloser: "tipo_reuniao_closer",
    realizouCloser: "tipo_reuniao_closer",
    vendeu: "tipo_reuniao_closer",
};

export function StageDeepDive({ isOpen, onClose, stage, stagePrev, periodoLabel, periodoAnteriorLabel }: StageDeepDiveProps) {
    const sources = useMemo(
        () => (stage ? buildBreakdown(stage.deals, stagePrev?.deals ?? [], (d) => d.ww_fonte_do_lead) : []),
        [stage, stagePrev],
    );
    const owners = useMemo(
        () => (stage ? buildBreakdown(stage.deals, stagePrev?.deals ?? [], (d) => d.owner_id ? ownerName(d.owner_id) : null) : []),
        [stage, stagePrev],
    );
    const destinations = useMemo(
        () => (stage ? buildBreakdown(stage.deals, stagePrev?.deals ?? [], (d) => d.destino) : []),
        [stage, stagePrev],
    );
    const channels = useMemo(() => {
        if (!stage) return [];
        const field = CHANNEL_FIELD_BY_STAGE[stage.key];
        if (!field) return [];
        return buildBreakdown(stage.deals, stagePrev?.deals ?? [], (d) => {
            const v = d[field];
            return typeof v === "string" ? v : null;
        });
    }, [stage, stagePrev]);

    const stages = useMemo(
        () => (stage ? buildBreakdown(stage.deals, stagePrev?.deals ?? [], (d) => d.stage) : []),
        [stage, stagePrev],
    );

    const insights = useMemo(
        () => (stage ? generateInsights(stage, stagePrev, sources, owners, channels) : []),
        [stage, stagePrev, sources, owners, channels],
    );

    if (!isOpen || !stage) return null;

    return (
        <div
            onClick={(e) => e.target === e.currentTarget && onClose()}
            style={{
                position: "fixed",
                inset: 0,
                background: "rgba(0, 0, 0, 0.8)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 1000,
                padding: 24,
            }}
        >
            <div
                style={{
                    background: T.surface,
                    borderRadius: 12,
                    border: `1px solid ${T.border}`,
                    width: "100%",
                    maxWidth: 1100,
                    maxHeight: "88vh",
                    display: "flex",
                    flexDirection: "column",
                    overflow: "hidden",
                }}
            >
                {/* Header */}
                <div
                    style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "18px 22px",
                        borderBottom: `1px solid ${T.border}`,
                    }}
                >
                    <div>
                        <div style={{ fontSize: 10, color: T.gold, letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 700, marginBottom: 4 }}>
                            Deep Dive · {stage.responsavel}
                        </div>
                        <h2 style={{ fontSize: 18, fontWeight: 700, color: T.white, margin: 0 }}>
                            {stage.label}
                        </h2>
                        <div style={{ fontSize: 11, color: T.muted, marginTop: 4 }}>
                            {periodoLabel} · {stage.count} registros · comparado com {periodoAnteriorLabel} ({stagePrev?.count ?? 0})
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        style={{ background: "transparent", border: "none", cursor: "pointer", padding: 4 }}
                    >
                        <X size={22} color={T.muted} />
                    </button>
                </div>

                {/* Body */}
                <div style={{ flex: 1, overflowY: "auto", padding: "20px 22px" }}>
                    {/* Insights */}
                    {insights.length > 0 && (
                        <div
                            style={{
                                background: T.card,
                                border: `1px solid ${T.border}`,
                                borderLeft: `3px solid ${T.gold}`,
                                borderRadius: 10,
                                padding: "16px 20px",
                                marginBottom: 16,
                            }}
                        >
                            <div style={{ fontSize: 10, color: T.gold, letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 700, marginBottom: 8 }}>
                                Insights automáticos
                            </div>
                            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.7, color: T.cream }}>
                                {insights.map((i, idx) => (
                                    <li key={idx} dangerouslySetInnerHTML={{ __html: i }} />
                                ))}
                            </ul>
                        </div>
                    )}

                    {/* Breakdowns */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                        <BreakdownBlock title="Fonte do lead" rows={sources} emptyMessage="Sem origem registrada" />
                        <BreakdownBlock title="Responsável" rows={owners} emptyMessage="Sem responsável atribuído" />
                        <BreakdownBlock title="Destino" rows={destinations} emptyMessage="Sem destino registrado" />
                        {channels.length > 0 && (
                            <BreakdownBlock title="Canal da reunião" rows={channels} />
                        )}
                        <BreakdownBlock title="Stage atual no AC" rows={stages} />
                    </div>
                </div>
            </div>
        </div>
    );
}
