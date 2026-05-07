"use client";

import { useEffect, useMemo, useState } from "react";
import {
    BarChart, Bar,
    XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer,
} from "recharts";
import { T } from "./theme";
import { CustomTooltip } from "./CustomTooltip";
import { DealsModal } from "./DealsModal";
import {
    type CloserMetrics,
    type CloserMode,
    type CloserFunnelStage,
    computeCloserMetrics,
} from "@/lib/metrics-closer";
import { resolvePeriodForSdr, type PeriodSelection } from "@/lib/period-selection";
import { type WonDeal, type MonthlyTarget } from "@/lib/schemas";

/* ─── Color refs (reusam paleta T) ──────────────────────────────────────── */
const C = {
    blue: "#4D94FF",
    amber: T.gold,
    red: T.red,
    green: T.green,
    grey: T.muted,
};

/* ─── Estilos compartilhados ────────────────────────────────────────────── */
const s = {
    card: { background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: "18px" } as const,
    label: {
        fontSize: 10,
        color: T.muted,
        fontWeight: 500,
        letterSpacing: "0.7px",
        textTransform: "uppercase" as const,
    },
    mono: { fontFamily: "monospace" },
};

/* ─── Helpers de formatação ─────────────────────────────────────────────── */
const fmtNumber = (n: number | null | undefined): string =>
    n == null ? "—" : new Intl.NumberFormat("pt-BR").format(n);

const fmtBrl = (n: number | null | undefined): string =>
    n == null ? "—" : `R$ ${new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)}`;

const fmtPct = (n: number | null | undefined): string =>
    n == null ? "—" : `${n.toFixed(1)}%`;

/* ─── MiniBar ───────────────────────────────────────────────────────────── */
function MiniBar({ pct, color = C.blue, height = 5 }: { pct: number; color?: string; height?: number }) {
    return (
        <div style={{ height, background: "rgba(255,255,255,0.05)", borderRadius: 3, marginTop: 3 }}>
            <div
                style={{
                    height: "100%",
                    borderRadius: 3,
                    width: `${Math.min(100, Math.max(0, pct))}%`,
                    background: color,
                    transition: "width 0.4s ease",
                }}
            />
        </div>
    );
}

/* ─── Cor de status (atingimento de meta) ───────────────────────────────── */
function targetStatusColor(pct: number | null): string {
    if (pct == null) return T.muted;
    if (pct >= 100) return C.green;
    if (pct >= 85) return C.amber;
    return C.red;
}

/* ─── ModeToggle ─────────────────────────────────────────────────────────── */
function ModeToggle({ mode, onChange }: { mode: CloserMode; onChange: (m: CloserMode) => void }) {
    const opts: { id: CloserMode; label: string; help: string }[] = [
        { id: "evento", label: "Evento", help: "Conta o que aconteceu no período (eventos pelas datas)." },
        { id: "coorte", label: "Coorte", help: "Leads criados no período + onde estão hoje no funil." },
    ];
    const active = opts.find((o) => o.id === mode);
    return (
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
                style={{
                    display: "flex",
                    background: T.surface,
                    border: `1px solid ${T.border}`,
                    borderRadius: 999,
                    padding: 3,
                    gap: 2,
                }}
            >
                {opts.map((o) => {
                    const isActive = mode === o.id;
                    return (
                        <button
                            key={o.id}
                            type="button"
                            onClick={() => onChange(o.id)}
                            aria-pressed={isActive}
                            style={{
                                background: isActive ? T.gold : "transparent",
                                color: isActive ? T.bg : T.muted,
                                border: "none",
                                borderRadius: 999,
                                padding: "5px 14px",
                                fontSize: 11,
                                fontWeight: 600,
                                cursor: "pointer",
                                fontFamily: "inherit",
                                transition: "all 200ms ease",
                            }}
                        >
                            {o.label}
                        </button>
                    );
                })}
            </div>
            <div title={active?.help} style={{ fontSize: 10, color: T.muted, maxWidth: 280, lineHeight: 1.4 }}>
                {active?.help}
            </div>
        </div>
    );
}

/* ─── MissingDataBanner ──────────────────────────────────────────────────── */
const STAGE_LABEL_BR: Record<string, string> = {
    closer_agendada: "Reunião Agendada (Closer)",
    closer_realizada: "Reunião Realizada (Closer)",
    vendas: "Contratos / Vendas",
};

function MissingDataBanner({
    targetsMissing,
    spendUnavailable,
    staleSync,
    onDismiss,
}: {
    targetsMissing: string[];
    spendUnavailable: boolean;
    staleSync: boolean;
    onDismiss: () => void;
}) {
    const items: string[] = [];
    if (targetsMissing.length > 0) {
        const labels = targetsMissing.map((k) => STAGE_LABEL_BR[k] ?? k).join(", ");
        items.push(`Meta não definida para: ${labels}.`);
    }
    if (spendUnavailable) items.push("Investimento de mídia parcial (faltam dias no cache) — CAC/CPL podem estar incompletos.");
    if (staleSync) items.push("Sync com ActiveCampaign atrasada (>6h).");
    if (items.length === 0) return null;

    return (
        <div
            role="status"
            style={{
                background: T.surface,
                borderLeft: `3px solid ${C.amber}`,
                borderRadius: 8,
                padding: "12px 16px",
                display: "flex",
                alignItems: "flex-start",
                gap: 12,
                marginBottom: 18,
                fontSize: 12,
                color: T.cream,
                lineHeight: 1.55,
            }}
        >
            <span style={{ color: C.amber, fontSize: 14, lineHeight: 1 }}>⚠</span>
            <div style={{ flex: 1 }}>
                {items.map((it, i) => (
                    <div key={i}>{it}</div>
                ))}
            </div>
            <button
                type="button"
                onClick={onDismiss}
                aria-label="Dispensar avisos"
                style={{
                    background: "transparent",
                    border: "none",
                    color: T.muted,
                    cursor: "pointer",
                    fontSize: 14,
                    padding: 0,
                    lineHeight: 1,
                }}
            >
                ✕
            </button>
        </div>
    );
}

/* ─── FunnelKpiCard ──────────────────────────────────────────────────────── */
function FunnelKpiCard({
    label,
    stage,
    onOpenDeals,
    definition,
}: {
    label: string;
    stage: CloserFunnelStage;
    onOpenDeals: () => void;
    definition?: string;
}) {
    const { current, target } = stage;
    const targetPct = target != null && target > 0 ? (current / target) * 100 : null;
    const statusColor = targetStatusColor(targetPct);
    const [hover, setHover] = useState(false);

    return (
        <button
            type="button"
            onClick={onOpenDeals}
            onMouseEnter={() => setHover(true)}
            onMouseLeave={() => setHover(false)}
            title={definition}
            aria-label={`${label}: ${current}. Abrir lista de deals.`}
            style={{
                width: "100%",
                textAlign: "left",
                background: hover
                    ? `linear-gradient(135deg, ${T.surface} 0%, ${T.card} 100%)`
                    : T.surface,
                border: `1px solid ${T.border}`,
                borderRadius: 10,
                padding: "20px 18px 18px",
                cursor: "pointer",
                transform: hover ? "translateY(-2px)" : "translateY(0)",
                boxShadow: hover ? "0 8px 24px rgba(0,0,0,0.4)" : "none",
                transition: "all 200ms ease-out",
                fontFamily: "inherit",
                color: T.cream,
            }}
        >
            <div style={s.label}>{label}</div>
            <div
                style={{
                    fontSize: 32,
                    fontWeight: 200,
                    color: T.white,
                    marginTop: 8,
                    lineHeight: 1.1,
                    ...s.mono,
                }}
            >
                {fmtNumber(current)}
            </div>
            {targetPct != null ? (
                <div style={{ marginTop: 14 }}>
                    <MiniBar pct={targetPct} color={statusColor} height={4} />
                    <div
                        style={{
                            display: "flex",
                            justifyContent: "space-between",
                            marginTop: 5,
                            fontSize: 10,
                            color: T.muted,
                        }}
                    >
                        <span>{targetPct.toFixed(0)}% da meta</span>
                        <span style={{ color: statusColor, fontWeight: 600 }}>meta {fmtNumber(target)}</span>
                    </div>
                </div>
            ) : (
                <div style={{ marginTop: 12, fontSize: 10, color: T.muted, fontStyle: "italic" }}>
                    sem meta definida
                </div>
            )}
        </button>
    );
}

/* ─── FunnelChevron ─────────────────────────────────────────────────────── */
function FunnelChevron({
    numerator,
    denominator,
    numeratorLabel,
    denominatorLabel,
}: {
    numerator: number;
    denominator: number;
    numeratorLabel: string;
    denominatorLabel: string;
}) {
    const rate = denominator > 0 ? (numerator / denominator) * 100 : null;
    return (
        <div
            title={
                rate != null
                    ? `${numerator} ${numeratorLabel} ÷ ${denominator} ${denominatorLabel} = ${rate.toFixed(1)}%`
                    : `${denominator} ${denominatorLabel} (sem dados)`
            }
            style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                color: T.muted,
                fontSize: 10,
                fontFamily: "monospace",
                fontWeight: 500,
                padding: "0 4px",
                userSelect: "none",
                cursor: "help",
            }}
        >
            <span style={{ fontSize: 18, lineHeight: 1, marginBottom: 2 }}>›</span>
            <span style={{ color: rate != null ? T.cream : T.muted }}>
                {rate != null ? `${rate.toFixed(0)}%` : "—"}
            </span>
        </div>
    );
}

/* ─── CostCard (CAC e CPL) ──────────────────────────────────────────────── */
function CostCard({
    label,
    cost,
    denominatorLabel,
    helpText,
}: {
    label: string;
    cost: { current: number | null; target: number | null } | null;
    denominatorLabel: string;
    helpText?: string;
}) {
    if (!cost) {
        return (
            <div style={s.card} title={helpText}>
                <div style={s.label}>{label}</div>
                <div style={{ fontSize: 22, fontWeight: 200, color: T.muted, marginTop: 8, ...s.mono }}>—</div>
                <div style={{ fontSize: 11, color: T.muted, marginTop: 6 }}>Sem spend disponível.</div>
            </div>
        );
    }
    // Para CAC: target null → mostra valor + denominator. Para CPL: target presente → barra.
    // CAC (sem meta): "abaixo da meta" não faz sentido.
    const targetPct =
        cost.target != null && cost.current != null && cost.target > 0
            ? (cost.current / cost.target) * 100
            : null;
    // Cor invertida: para custo, abaixo da meta = bom (verde).
    const statusColor =
        targetPct == null
            ? T.muted
            : targetPct <= 100
                ? C.green
                : targetPct <= 115
                    ? C.amber
                    : C.red;

    return (
        <div style={s.card} title={helpText}>
            <div style={s.label}>{label}</div>
            <div
                style={{
                    fontSize: 30,
                    fontWeight: 200,
                    color: T.white,
                    marginTop: 8,
                    lineHeight: 1.1,
                    ...s.mono,
                }}
            >
                {fmtBrl(cost.current)}
            </div>
            <div style={{ fontSize: 11, color: T.muted, marginTop: 6 }}>
                {denominatorLabel}
            </div>
            {targetPct != null && cost.target != null && (
                <div style={{ marginTop: 14 }}>
                    <MiniBar pct={targetPct} color={statusColor} height={4} />
                    <div
                        style={{
                            display: "flex",
                            justifyContent: "space-between",
                            marginTop: 5,
                            fontSize: 10,
                            color: T.muted,
                        }}
                    >
                        <span>{targetPct.toFixed(0)}% da meta</span>
                        <span style={{ color: statusColor, fontWeight: 600 }}>meta {fmtBrl(cost.target)}</span>
                    </div>
                </div>
            )}
        </div>
    );
}

/* ─── TimeCard ──────────────────────────────────────────────────────────── */
function TimeCard({
    dias,
    n,
}: {
    dias: number | null;
    n: number;
}) {
    const definition =
        "Tempo até Fechamento — média de dias entre created_at do lead e data_fechamento, " +
        "considerando apenas contratos fechados no período. Janelas curtas têm n pequeno; " +
        "interpretar com cuidado quando n < 5.";
    return (
        <div style={s.card} title={definition}>
            <div style={s.label}>Tempo até Fechamento</div>
            <div
                style={{
                    fontSize: 30,
                    fontWeight: 200,
                    color: T.white,
                    marginTop: 8,
                    lineHeight: 1.1,
                    ...s.mono,
                }}
            >
                {dias == null ? "—" : `${dias} dias`}
            </div>
            <div style={{ fontSize: 11, color: T.muted, marginTop: 6, lineHeight: 1.6 }}>
                {dias == null
                    ? "Sem contratos no período."
                    : `entrada do lead → data_fechamento  ·  n = ${n}`}
            </div>
        </div>
    );
}

/* ─── CohortFechamentoCard ──────────────────────────────────────────────── */
function CohortFechamentoCard({
    cohort,
    periodLabel,
    onOpenDeals,
}: {
    cohort: CloserMetrics["cohortFechamento"];
    periodLabel: string;
    onOpenDeals: (bucket: "fechou" | "aberto" | "perdeu") => void;
}) {
    const { total, fechou, aberto, perdeu, previousCohortPctFechouSameDay } = cohort;
    if (total === 0) {
        return (
            <div style={s.card}>
                <div style={s.label}>Cohort de Fechamento — {periodLabel}</div>
                <div style={{ fontSize: 14, color: T.muted, marginTop: 14 }}>Nenhum lead criado no período.</div>
            </div>
        );
    }
    return (
        <div style={s.card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <div style={s.label}>Cohort de Fechamento — {periodLabel}</div>
                <div style={{ fontSize: 11, color: T.muted }}>{fmtNumber(total)} leads na coorte</div>
            </div>

            {/* Barra empilhada */}
            <div
                style={{
                    display: "flex",
                    height: 14,
                    borderRadius: 7,
                    overflow: "hidden",
                    marginTop: 16,
                    background: T.border,
                }}
                title={
                    `${fechou.count} fecharam (${fmtPct(fechou.pct)}) · ` +
                    `${aberto.count} em aberto (${fmtPct(aberto.pct)}) · ` +
                    `${perdeu.count} perderam (${fmtPct(perdeu.pct)})`
                }
            >
                {fechou.count > 0 && (
                    <div style={{ width: `${fechou.pct}%`, background: C.green, transition: "width 0.4s ease" }} />
                )}
                {aberto.count > 0 && (
                    <div style={{ width: `${aberto.pct}%`, background: T.muted, opacity: 0.4, transition: "width 0.4s ease" }} />
                )}
                {perdeu.count > 0 && (
                    <div style={{ width: `${perdeu.pct}%`, background: C.red, opacity: 0.7, transition: "width 0.4s ease" }} />
                )}
            </div>

            {/* 3 contadores clicáveis */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginTop: 16 }}>
                {([
                    { key: "fechou" as const, label: "✓ Fecharam", color: C.green, b: fechou },
                    { key: "aberto" as const, label: "… Em aberto", color: T.muted, b: aberto },
                    { key: "perdeu" as const, label: "✗ Perderam", color: C.red, b: perdeu },
                ]).map(({ key, label, color, b }) => (
                    <button
                        key={key}
                        type="button"
                        onClick={() => onOpenDeals(key)}
                        style={{
                            background: T.surface,
                            border: `1px solid ${T.border}`,
                            borderRadius: 8,
                            padding: "12px 14px",
                            cursor: "pointer",
                            textAlign: "left",
                            color: T.cream,
                            fontFamily: "inherit",
                            transition: "all 150ms ease",
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.transform = "translateY(-1px)";
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.transform = "translateY(0)";
                        }}
                    >
                        <div style={{ fontSize: 10, color: T.muted, fontWeight: 500, letterSpacing: "0.05em" }}>{label}</div>
                        <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 4 }}>
                            <span style={{ fontSize: 22, fontWeight: 200, color, ...s.mono }}>{fmtNumber(b.count)}</span>
                            <span style={{ fontSize: 11, color: T.muted }}>{fmtPct(b.pct)}</span>
                        </div>
                    </button>
                ))}
            </div>

            {previousCohortPctFechouSameDay != null && (
                <div style={{ marginTop: 14, fontSize: 11, color: T.muted, lineHeight: 1.6 }}>
                    No mesmo dia-do-mês, a coorte do mês anterior estava em{" "}
                    <span style={{ color: T.cream, fontWeight: 600 }}>{fmtPct(previousCohortPctFechouSameDay)}</span> fechado.
                    Coorte atual:{" "}
                    <span
                        style={{
                            color: fechou.pct >= previousCohortPctFechouSameDay ? C.green : C.amber,
                            fontWeight: 600,
                        }}
                    >
                        {fmtPct(fechou.pct)}
                    </span>{" "}
                    (Δ {(fechou.pct - previousCohortPctFechouSameDay).toFixed(1)}pp).
                </div>
            )}
        </div>
    );
}

/* ─── LossReasonsChart ──────────────────────────────────────────────────── */
function LossReasonsChart({ reasons }: { reasons: CloserMetrics["lossReasons"] }) {
    if (reasons.length === 0) {
        return (
            <div style={s.card}>
                <div style={s.label}>Top motivos de perda</div>
                <div style={{ fontSize: 14, color: T.muted, marginTop: 14 }}>Nenhuma perda registrada no período.</div>
            </div>
        );
    }
    return (
        <div style={s.card}>
            <div style={s.label}>Top motivos de perda</div>
            <div style={{ marginTop: 14 }}>
                <ResponsiveContainer width="100%" height={Math.max(180, reasons.length * 32)}>
                    <BarChart data={reasons} layout="vertical" margin={{ top: 4, right: 50, bottom: 4, left: 130 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke={T.border} horizontal={false} />
                        <XAxis
                            type="number"
                            tick={{ fontSize: 10, fill: T.muted }}
                            tickLine={false}
                            axisLine={false}
                            tickFormatter={(v: number) => v + "%"}
                        />
                        <YAxis
                            type="category"
                            dataKey="motivo"
                            tick={{ fontSize: 10, fill: T.muted }}
                            tickLine={false}
                            axisLine={false}
                            width={125}
                        />
                        <Tooltip content={<CustomTooltip />} />
                        <Bar
                            dataKey="pct"
                            name="Pct %"
                            radius={[0, 3, 3, 0]}
                            barSize={12}
                            fill={T.rose}
                            label={{ position: "right", fontSize: 10, fill: T.muted, formatter: (v: unknown) => `${v}%` }}
                        />
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}

/* ─── STAGE_DEFINITION (tooltip por card) ─────────────────────────────── */
const STAGE_DEFINITION: Record<keyof CloserMetrics["funnelDetailed"], string> = {
    agendada:
        "Reunião Agendada — MQL com data_horario_agendamento_closer dentro do período (modo Evento) ou já marcada (modo Coorte). Pipeline ∈ {SDR Weddings, Closer Weddings, Planejamento Weddings}.",
    realizada:
        "Reunião Realizada — Agendada + tipo_reuniao_closer ≠ vazio E ≠ 'Não teve reunião'. Reuniões marcadas pro futuro ainda não têm tipo preenchido — não contam até acontecerem.",
    contrato:
        "Contrato Fechado — MQL com data_fechamento dentro do período. Equivale ao status 'Won' no AC. data_fechamento = ww_closer_data_hora_ganho || data_fechamento (campo legacy preferido).",
};

const STAGE_LABEL_SHORT: Record<keyof CloserMetrics["funnelDetailed"], string> = {
    agendada: "R. Agendada",
    realizada: "R. Realizada",
    contrato: "Contratos",
};

const STAGE_TITLE: Record<keyof CloserMetrics["funnelDetailed"], string> = {
    agendada: "Reuniões Agendadas (Closer)",
    realizada: "Reuniões Realizadas (Closer)",
    contrato: "Contratos Fechados",
};

/* ─── Persist mode ──────────────────────────────────────────────────────── */
const MODE_STORAGE_KEY = "ww-closer-mode";
function loadModeFromStorage(): CloserMode {
    if (typeof window === "undefined") return "evento";
    const saved = window.localStorage.getItem(MODE_STORAGE_KEY);
    return saved === "coorte" ? "coorte" : "evento";
}

/* ─── CloserTab principal ───────────────────────────────────────────────── */
interface CloserTabProps {
    deals: WonDeal[];
    fieldMap: Record<string, string>;
    period: PeriodSelection;
    targets: MonthlyTarget | null;
    spend: { meta: number; google: number; partial: boolean } | null;
}

interface ModalState {
    title: string;
    deals: WonDeal[];
}

export function CloserTab({ deals, fieldMap, period, targets, spend }: CloserTabProps) {
    const [mode, setMode] = useState<CloserMode>(loadModeFromStorage);
    const [bannerDismissed, setBannerDismissed] = useState(false);
    const [modal, setModal] = useState<ModalState | null>(null);

    // Range UTC + dias decorridos (modo calendário "Este mês")
    const range = useMemo(() => resolvePeriodForSdr(period), [period]);
    const daysInTargetMonth = useMemo(() => {
        const y = range.end.getUTCFullYear();
        const m = range.end.getUTCMonth();
        return new Date(y, m + 1, 0).getDate();
    }, [range]);

    function handleModeChange(next: CloserMode) {
        setMode(next);
        if (typeof window !== "undefined") window.localStorage.setItem(MODE_STORAGE_KEY, next);
    }

    const m = useMemo(
        () =>
            computeCloserMetrics(deals, fieldMap, { start: range.start, end: range.end }, {
                mode,
                targets,
                spend: spend ? { meta: spend.meta, google: spend.google } : null,
                daysInTargetMonth,
                daysElapsedInPeriod: range.daysElapsedInPeriod,
                spendPartial: spend?.partial === true,
            }),
        [deals, fieldMap, range, mode, targets, spend, daysInTargetMonth],
    );

    // Reset banner-dismissed quando mode/period mudam, pra manter alertas visíveis se permanecerem.
    useEffect(() => {
        setBannerDismissed(false);
    }, [period, mode]);

    const f = m.funnelDetailed;
    const stageOrder: (keyof CloserMetrics["funnelDetailed"])[] = ["agendada", "realizada", "contrato"];

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: "0 4px" }}>
            {/* Topo: header + ModeToggle */}
            <div
                style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: 12,
                }}
            >
                <div>
                    <h1
                        style={{
                            fontSize: 22,
                            color: T.white,
                            fontWeight: 700,
                            margin: 0,
                            marginBottom: 4,
                        }}
                    >
                        Closer
                    </h1>
                    <div style={{ fontSize: 12, color: T.muted, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                        <span>{range.label}</span>
                        {range.extendsToFuture && (
                            <span
                                title={
                                    "Modo calendário: o funil Closer cobre o mês inteiro, incluindo " +
                                    "agendamentos e contratos já marcados para o futuro. Lead/MQL/Reunião realizada " +
                                    "naturalmente só contam até hoje. Metas continuam prorrateadas pelos dias decorridos."
                                }
                                style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    width: 14,
                                    height: 14,
                                    borderRadius: "50%",
                                    border: `1px solid ${T.muted}`,
                                    fontSize: 9,
                                    color: T.muted,
                                    cursor: "help",
                                    userSelect: "none",
                                    fontWeight: 600,
                                }}
                                aria-label="Modo calendário"
                            >
                                i
                            </span>
                        )}
                        <span>· reunião agendada → realizada → contrato fechado</span>
                    </div>
                </div>
                <ModeToggle mode={mode} onChange={handleModeChange} />
            </div>

            {/* Banner alertas */}
            {!bannerDismissed && (
                <MissingDataBanner
                    targetsMissing={m.missingData.targetsMissing}
                    spendUnavailable={m.missingData.spendUnavailable}
                    staleSync={m.missingData.staleSync}
                    onDismiss={() => setBannerDismissed(true)}
                />
            )}

            {/* HERO: funil 3 etapas + chevrons */}
            <div
                style={{
                    background: T.card,
                    border: `1px solid ${T.border}`,
                    borderRadius: 14,
                    padding: 18,
                }}
            >
                <div style={{ ...s.label, marginBottom: 14 }}>Funil Closer</div>
                <div
                    style={{
                        display: "grid",
                        gridTemplateColumns:
                            "minmax(0,1fr) auto minmax(0,1fr) auto minmax(0,1fr)",
                        alignItems: "stretch",
                        gap: 10,
                    }}
                >
                    {stageOrder.map((stageKey, idx) => {
                        const stage = f[stageKey];
                        const card = (
                            <FunnelKpiCard
                                key={stageKey}
                                label={STAGE_LABEL_SHORT[stageKey]}
                                stage={stage}
                                definition={STAGE_DEFINITION[stageKey]}
                                onOpenDeals={() =>
                                    setModal({
                                        title: STAGE_TITLE[stageKey],
                                        deals: stage.deals,
                                    })
                                }
                            />
                        );
                        if (idx === stageOrder.length - 1) return card;
                        const next = stageOrder[idx + 1];
                        const chevron = (
                            <FunnelChevron
                                key={`chevron-${stageKey}-${next}`}
                                numerator={f[next].current}
                                denominator={stage.current}
                                numeratorLabel={STAGE_LABEL_SHORT[next].toLowerCase()}
                                denominatorLabel={STAGE_LABEL_SHORT[stageKey].toLowerCase()}
                            />
                        );
                        return [card, chevron];
                    })}
                </div>

                {/* Linha de taxas derivadas */}
                <div
                    style={{
                        marginTop: 14,
                        paddingTop: 12,
                        borderTop: `1px solid ${T.border}`,
                        display: "flex",
                        gap: 24,
                        flexWrap: "wrap",
                        fontSize: 11,
                        color: T.muted,
                    }}
                >
                    <span title="Realizada / Agendada">
                        Comparecimento: <strong style={{ color: T.cream }}>{fmtPct(m.rates.comparecimento)}</strong>
                    </span>
                    <span title="Contrato / Realizada (close rate)">
                        Close rate: <strong style={{ color: T.cream }}>{fmtPct(m.rates.closeRate)}</strong>
                    </span>
                    <span title="Contrato / MQL — conversão geral do funil de venda">
                        Conv. MQL → Contrato: <strong style={{ color: T.cream }}>{fmtPct(m.rates.mqlToContract)}</strong>
                    </span>
                </div>
            </div>

            {/* CAC + CPL + Tempo (3 cards) */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
                <CostCard
                    label="Custo por Contrato (CAC)"
                    cost={m.cac}
                    denominatorLabel={`Spend ÷ ${fmtNumber(f.contrato.current)} contratos`}
                    helpText={
                        "CAC = (spend Meta + Google) ÷ contratos fechados no período. " +
                        "Sem meta no monthly_targets — apresenta valor absoluto."
                    }
                />
                <CostCard
                    label="Custo por Lead (CPL)"
                    cost={m.cpl}
                    denominatorLabel={`Spend ÷ ${fmtNumber(m.leadCount)} leads`}
                    helpText={
                        "CPL = (spend Meta + Google) ÷ leads (entrada bruta, inclui Elopment). " +
                        "Mesma métrica vista na aba SDR — repetida aqui pra contexto de eficiência. " +
                        "Meta de monthly_targets.cpl."
                    }
                />
                <TimeCard dias={m.tempoFechamento.dias} n={m.tempoFechamento.n} />
            </div>

            {/* Cohort de Fechamento */}
            <CohortFechamentoCard
                cohort={m.cohortFechamento}
                periodLabel={range.label}
                onOpenDeals={(bucket) =>
                    setModal({
                        title:
                            bucket === "fechou"
                                ? "Coorte: já fecharam contrato"
                                : bucket === "aberto"
                                    ? "Coorte: ainda em aberto"
                                    : "Coorte: perderam",
                        deals: m.cohortFechamento[bucket].deals,
                    })
                }
            />

            {/* Top motivos de perda */}
            <LossReasonsChart reasons={m.lossReasons} />

            {/* Modal de deals */}
            {modal && (
                <DealsModal
                    isOpen={true}
                    onClose={() => setModal(null)}
                    deals={modal.deals}
                    title={modal.title}
                />
            )}
        </div>
    );
}
