"use client";

import { useMemo, useState } from "react";
import { T } from "./theme";
import { DealsModal } from "./DealsModal";
import { type SDRMetrics, type FunnelStage, type SDRMode, computeSDRMetrics } from "@/lib/metrics-sdr";
import { resolvePeriodForSdr, type PeriodSelection } from "@/lib/period-selection";
import { type Deal, type WonDeal, type MonthlyTarget } from "@/lib/schemas";
import { ownerName } from "@/lib/supabase-api";

/* ─── Color references (reusam paleta T) ─────────────────────────────────── */
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

/* ─── Estilos compartilhados ─────────────────────────────────────────────── */
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
    sep: { borderTop: `1px solid ${T.border}`, marginTop: 10, paddingTop: 10 },
};

/* ─── Helpers de formatação ──────────────────────────────────────────────── */
const fmtNumber = (n: number | null | undefined): string =>
    n == null ? "—" : new Intl.NumberFormat("pt-BR").format(n);

const fmtBrl = (n: number | null | undefined): string =>
    n == null ? "—" : `R$ ${new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)}`;

/* ─── MiniBar (preservado, usado no InvestigationPanel + ProgressBar) ───── */
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

/* ─── Cor de status (atingimento de meta) ────────────────────────────────── */
function targetStatusColor(pct: number | null): string {
    if (pct == null) return T.muted;
    if (pct >= 100) return C.green;
    if (pct >= 85) return C.amber;
    return C.red;
}

/* ─── ModeToggle ─────────────────────────────────────────────────────────── */
function ModeToggle({ mode, onChange }: { mode: SDRMode; onChange: (m: SDRMode) => void }) {
    const opts: { id: SDRMode; label: string; help: string }[] = [
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
            <div
                title={active?.help}
                style={{ fontSize: 10, color: T.muted, maxWidth: 280, lineHeight: 1.4 }}
            >
                {active?.help}
            </div>
        </div>
    );
}

/* ─── MissingDataBanner ──────────────────────────────────────────────────── */
const STAGE_LABEL_BR: Record<string, string> = {
    leads: "Leads",
    mql: "MQL",
    agendamento: "Agendamentos",
    reunioes: "Reuniões",
    qualificado: "Qualificações",
    closer_agendada: "Closer agendada",
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
    if (spendUnavailable) items.push("Investimento de mídia parcial (faltam dias no cache).");
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
}: {
    label: string;
    stage: FunnelStage;
    onOpenDeals: () => void;
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

/* ─── FunnelChevron (taxa entre etapas) ──────────────────────────────────── */
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

/* ─── InvestmentCard ────────────────────────────────────────────────────── */
function InvestmentCard({
    spend,
    target,
    daysInTargetMonth,
    daysInPeriod,
}: {
    spend: { meta: number; google: number; total: number; previousTotal: number | null } | null;
    target: { totalProrated: number | null } | null;
    daysInTargetMonth: number;
    daysInPeriod: number;
}) {
    if (!spend) {
        return (
            <div style={s.card}>
                <div style={s.label}>Investimento mídia</div>
                <div style={{ fontSize: 22, fontWeight: 200, color: T.muted, marginTop: 8, ...s.mono }}>—</div>
                <div style={{ fontSize: 11, color: T.muted, marginTop: 6 }}>Spend não disponível no período.</div>
            </div>
        );
    }

    const targetPct =
        target?.totalProrated != null && target.totalProrated > 0
            ? (spend.total / target.totalProrated) * 100
            : null;
    const statusColor = targetStatusColor(targetPct);
    void daysInTargetMonth;
    void daysInPeriod;

    return (
        <div style={s.card}>
            <div style={s.label}>Investimento mídia</div>
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
                {fmtBrl(spend.total)}
            </div>
            <div style={{ fontSize: 11, color: T.muted, marginTop: 6, lineHeight: 1.6 }}>
                Meta {fmtBrl(spend.meta)} · Google {fmtBrl(spend.google)}
            </div>
            {targetPct != null && target?.totalProrated != null && (
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
                        <span>{targetPct.toFixed(0)}% da meta prorrateada</span>
                        <span style={{ color: statusColor, fontWeight: 600 }}>{fmtBrl(target.totalProrated)}</span>
                    </div>
                </div>
            )}
        </div>
    );
}

/* ─── CostCard (genérico para Custo por Lead e Custo por MQL) ───────────── */
function CostCard({
    label,
    cost,
    denominatorLabel,
}: {
    label: string;
    cost: { current: number | null; previous: number | null; target: number | null } | null;
    denominatorLabel: string;
}) {
    if (!cost) {
        return (
            <div style={s.card}>
                <div style={s.label}>{label}</div>
                <div style={{ fontSize: 22, fontWeight: 200, color: T.muted, marginTop: 8, ...s.mono }}>—</div>
                <div style={{ fontSize: 11, color: T.muted, marginTop: 6 }}>
                    Spend e/ou {denominatorLabel} não disponíveis.
                </div>
            </div>
        );
    }

    // Custo: menor é melhor → "verde" quando atual <= meta.
    const targetPct =
        cost.current != null && cost.target != null && cost.target > 0
            ? (cost.current / cost.target) * 100
            : null;
    const statusColor =
        targetPct == null ? T.muted : targetPct <= 100 ? C.green : targetPct <= 120 ? C.amber : C.red;

    return (
        <div style={s.card}>
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
            {targetPct != null && cost.target != null ? (
                <div style={{ marginTop: 14 }}>
                    <MiniBar pct={Math.min(targetPct, 200)} color={statusColor} height={4} />
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
            ) : (
                <div style={{ marginTop: 14, fontSize: 10, color: T.muted, fontStyle: "italic" }}>
                    sem meta definida
                </div>
            )}
        </div>
    );
}

/* ─── InvestigationPanel (PRESERVADO do design anterior) ─────────────────── */
function InvestigationPanel({ m }: { m: SDRMetrics }) {
    const inv = m.investigation;
    if (!inv) return null;

    return (
        <div
            style={{
                padding: "18px",
                background: T.surface,
                border: `1px solid ${C.redBright}`,
                borderRadius: 12,
            }}
        >
            <div
                style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: "#fca5a5",
                    marginBottom: 14,
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                }}
            >
                Investigação · Últimos 7 dias vs 7 dias anteriores
                <span style={{ fontWeight: 400, color: T.muted, fontSize: 11 }}>
                    · {inv.last.agend} agend vs {inv.prev.agend} agend
                </span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                {/* Diagnóstico volume vs taxa */}
                <div style={{ ...s.card, padding: 16 }}>
                    <div style={{ ...s.label, marginBottom: 12 }}>Diagnóstico</div>
                    <div style={{ marginBottom: 10 }}>
                        <div style={{ fontSize: 12, color: T.muted, marginBottom: 3 }}>Agendamentos</div>
                        <div style={{ fontSize: 20, fontWeight: 700, ...s.mono, color: C.red }}>
                            {inv.last.agend}{" "}
                            <span style={{ fontSize: 13, color: T.muted }}>vs {inv.prev.agend}</span>
                        </div>
                    </div>
                    <div style={s.sep}>
                        <div style={{ ...s.label, marginBottom: 8 }}>Decomposição</div>
                        <div style={{ fontSize: 11, color: T.muted, marginBottom: 5 }}>
                            <span
                                style={{
                                    width: 8,
                                    height: 8,
                                    background: C.blue,
                                    borderRadius: "50%",
                                    display: "inline-block",
                                    marginRight: 6,
                                }}
                            />
                            Efeito volume:
                            <strong
                                style={{
                                    color: inv.volEffect < 0 ? C.red : C.green,
                                    marginLeft: 6,
                                    ...s.mono,
                                }}
                            >
                                {inv.volEffect > 0 ? "+" : ""}
                                {inv.volEffect.toFixed(1)} agend
                            </strong>
                        </div>
                        <div style={{ fontSize: 11, color: T.muted, marginBottom: 10 }}>
                            <span
                                style={{
                                    width: 8,
                                    height: 8,
                                    background: C.amber,
                                    borderRadius: "50%",
                                    display: "inline-block",
                                    marginRight: 6,
                                }}
                            />
                            Efeito taxa:
                            <strong
                                style={{
                                    color: inv.rateEffect < 0 ? C.red : C.green,
                                    marginLeft: 6,
                                    ...s.mono,
                                }}
                            >
                                {inv.rateEffect > 0 ? "+" : ""}
                                {inv.rateEffect.toFixed(1)} agend
                            </strong>
                        </div>
                        <div
                            style={{
                                padding: "8px 10px",
                                background:
                                    Math.abs(inv.rateEffect) > Math.abs(inv.volEffect) ? C.redDim : C.blueDim,
                                borderRadius: 7,
                                fontSize: 11,
                                fontWeight: 700,
                                color: T.white,
                            }}
                        >
                            Causa principal:{" "}
                            {Math.abs(inv.rateEffect) > Math.abs(inv.volEffect)
                                ? "CONVERSÃO (taxa caiu)"
                                : "VOLUME (menos MQLs)"}
                        </div>
                    </div>
                </div>

                {/* Por SDR */}
                <div style={{ ...s.card, padding: 16 }}>
                    <div style={{ ...s.label, marginBottom: 12 }}>Por SDR</div>
                    {inv.sdrComp.map((sdr) => {
                        const statusDot = sdr.delta < -12 ? C.red : sdr.delta < -4 ? C.amber : C.green;
                        return (
                            <div key={ownerName(sdr.ownerId)} style={{ marginBottom: 12 }}>
                                <div
                                    style={{
                                        display: "flex",
                                        justifyContent: "space-between",
                                        marginBottom: 4,
                                        alignItems: "center",
                                    }}
                                >
                                    <span
                                        style={{
                                            fontSize: 12,
                                            color: T.white,
                                            display: "flex",
                                            alignItems: "center",
                                            gap: 5,
                                        }}
                                    >
                                        <span
                                            style={{
                                                width: 8,
                                                height: 8,
                                                borderRadius: "50%",
                                                background: statusDot,
                                                display: "inline-block",
                                                flexShrink: 0,
                                            }}
                                        />
                                        {ownerName(sdr.ownerId)}
                                    </span>
                                    <span
                                        style={{
                                            fontSize: 11,
                                            ...s.mono,
                                            color: sdr.delta < 0 ? C.red : C.green,
                                        }}
                                    >
                                        {sdr.taxaLast.toFixed(0)}%
                                        <span style={{ fontSize: 10, marginLeft: 4 }}>
                                            ({sdr.delta > 0 ? "+" : ""}
                                            {sdr.delta.toFixed(1)}pp)
                                        </span>
                                    </span>
                                </div>
                                <MiniBar
                                    pct={sdr.taxaLast * 2.5}
                                    color={sdr.delta < -12 ? C.red : sdr.delta < 0 ? C.amber : C.green}
                                />
                                <div style={{ fontSize: 10, color: T.muted, marginTop: 3 }}>
                                    {sdr.mqlLast} MQL · {sdr.agendLast} agend · prev: {sdr.taxaPrev.toFixed(0)}%
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Motivos de variação */}
                <div style={{ ...s.card, padding: 16 }}>
                    <div style={{ ...s.label, marginBottom: 12 }}>Motivos (variação)</div>
                    {inv.motivosComp.slice(0, 6).map((mo) => (
                        <div
                            key={mo.motivo}
                            style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                                marginBottom: 8,
                                padding: "4px 0",
                                borderBottom: `1px solid ${T.border}`,
                            }}
                        >
                            <span
                                style={{
                                    fontSize: 11,
                                    color: T.muted,
                                    maxWidth: "60%",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "nowrap",
                                }}
                            >
                                {mo.motivo}
                            </span>
                            <div style={{ textAlign: "right" }}>
                                <div style={{ fontSize: 11, ...s.mono, color: T.white }}>
                                    {mo.pctLast.toFixed(1)}%
                                </div>
                                <div
                                    style={{
                                        fontSize: 10,
                                        color: mo.delta > 5 ? C.red : mo.delta < -5 ? C.green : T.muted,
                                    }}
                                >
                                    {mo.delta > 0 ? "+" : ""}
                                    {mo.delta.toFixed(1)}pp
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

/* ─── SDRTab principal ───────────────────────────────────────────────────── */

interface SDRTabProps {
    deals: WonDeal[];
    fieldMap: Record<string, string>;
    period: PeriodSelection;
    targets: MonthlyTarget | null;
    spend: { meta: number; google: number; partial: boolean } | null;
}

const MODE_STORAGE_KEY = "ww-sdr-mode";

function loadModeFromStorage(): SDRMode {
    if (typeof window === "undefined") return "evento";
    const stored = window.localStorage.getItem(MODE_STORAGE_KEY);
    return stored === "coorte" ? "coorte" : "evento";
}

interface ModalState {
    stageKey: keyof SDRMetrics["funnelDetailed"];
    title: string;
    deals: WonDeal[];
}

const STAGE_TITLE: Record<keyof SDRMetrics["funnelDetailed"], string> = {
    lead: "Leads (entrada bruta)",
    mql: "MQLs (entraram no SDR)",
    agendamento: "Agendamentos (1ª reunião marcada)",
    realizada: "Reuniões realizadas (1ª)",
    qualificacao: "Qualificações SDR",
    agCloser: "Agendamentos com Closer",
};

const STAGE_LABEL_SHORT: Record<keyof SDRMetrics["funnelDetailed"], string> = {
    lead: "Leads",
    mql: "MQL",
    agendamento: "Agendamento",
    realizada: "Reunião",
    qualificacao: "Qualificação",
    agCloser: "Ag. Closer",
};

export function SDRTab({ deals, fieldMap, period, targets, spend }: SDRTabProps) {
    const [mode, setMode] = useState<SDRMode>(loadModeFromStorage);
    const [bannerDismissed, setBannerDismissed] = useState(false);
    const [modal, setModal] = useState<ModalState | null>(null);

    // Range UTC + dias. SDR usa "modo calendário": preset "Este mês" estende
    // até o fim do mês para que agendamentos futuros (data_reuniao_1, data_closer)
    // entrem no funil. Outras presets continuam terminando em hoje.
    const range = useMemo(() => resolvePeriodForSdr(period), [period]);
    // Para o prorrateio de meta, o que importa é quantos dias do período já
    // passaram (até hoje). Quando `extendsToFuture=true`, isso é < daysBack.
    const daysInPeriod = range.daysElapsedInPeriod;
    const daysInTargetMonth = useMemo(() => {
        // Mês do "fim efetivo" — para "Este mês" estendido, é o mês corrente.
        const y = range.end.getUTCFullYear();
        const m = range.end.getUTCMonth(); // 0-indexed; +1 para o "0 day" trick
        return new Date(y, m + 1, 0).getDate();
    }, [range]);

    // Persistência do mode
    function handleModeChange(next: SDRMode) {
        setMode(next);
        if (typeof window !== "undefined") window.localStorage.setItem(MODE_STORAGE_KEY, next);
    }

    // Computa as métricas com mode + targets + spend.
    const m = useMemo(
        () =>
            computeSDRMetrics(deals as unknown as Deal[], fieldMap, { start: range.start, end: range.end }, {
                mode,
                targets,
                spend: spend ? { meta: spend.meta, google: spend.google } : null,
                daysInTargetMonth,
                daysElapsedInPeriod: range.daysElapsedInPeriod,
                spendPartial: spend?.partial === true,
            }),
        [deals, fieldMap, range, mode, targets, spend, daysInTargetMonth],
    );

    // Meta de spend prorrateada (apenas para apresentação no InvestmentCard).
    // Heurística: target_total = (cpl × mql_target_mes), prorrateado.
    const spendTargetTotal = useMemo(() => {
        if (!targets || !targets.cpl || !targets.mql) return null;
        const monthlyTotal = targets.cpl * targets.mql;
        return Math.round((monthlyTotal * daysInPeriod) / daysInTargetMonth);
    }, [targets, daysInPeriod, daysInTargetMonth]);

    const f = m.funnelDetailed;
    const stageOrder: (keyof SDRMetrics["funnelDetailed"])[] = [
        "lead",
        "mql",
        "agendamento",
        "realizada",
        "qualificacao",
        "agCloser",
    ];

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: "0 4px" }}>
            {/* Topo: ModeToggle + (futuramente) ações */}
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
                        SDR
                    </h1>
                    <div style={{ fontSize: 12, color: T.muted, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                        <span>{range.label}</span>
                        {range.extendsToFuture && (
                            <span
                                title={
                                    "Modo calendário: o funil SDR conta o mês inteiro " +
                                    "(01 → fim do mês), incluindo agendamentos já marcados " +
                                    "para o futuro (data_reuniao_1, data_closer). Lead/MQL/Reunião " +
                                    "realizada/Qualificação naturalmente só contam até hoje. " +
                                    "Metas continuam prorrateadas pelos dias decorridos."
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
                        <span>· funil de entrada → MQL → agendamento → reunião → qualificação → closer</span>
                    </div>
                </div>
                <ModeToggle mode={mode} onChange={handleModeChange} />
            </div>

            {/* Banner de alertas (só se houver problema) */}
            {!bannerDismissed && (
                <MissingDataBanner
                    targetsMissing={m.missingData.targetsMissing}
                    spendUnavailable={m.missingData.spendUnavailable}
                    staleSync={m.missingData.staleSync}
                    onDismiss={() => setBannerDismissed(true)}
                />
            )}

            {/* HERO FUNIL: 6 cards + chevrons */}
            <div
                style={{
                    background: T.card,
                    border: `1px solid ${T.border}`,
                    borderRadius: 14,
                    padding: 18,
                }}
            >
                <div style={{ ...s.label, marginBottom: 14 }}>Funil</div>
                <div
                    style={{
                        display: "grid",
                        gridTemplateColumns:
                            "minmax(0,1fr) auto minmax(0,1fr) auto minmax(0,1fr) auto minmax(0,1fr) auto minmax(0,1fr) auto minmax(0,1fr)",
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
                                onOpenDeals={() =>
                                    setModal({
                                        stageKey,
                                        title: STAGE_TITLE[stageKey],
                                        deals: stage.deals,
                                    })
                                }
                            />
                        );
                        if (idx === stageOrder.length - 1) return card;
                        // Chevron entre este card e o próximo, com taxa numerador/denominador
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
                <div style={{ marginTop: 14, fontSize: 10, color: T.muted, fontStyle: "italic" }}>
                    Clique em qualquer etapa para ver a lista de deals contados. Metas são proporcionalizadas
                    linearmente a partir de monthly_targets ({daysInPeriod} dias × meta_mensal /{" "}
                    {daysInTargetMonth} dias do mês).
                </div>
            </div>

            {/* INVESTIMENTO + Custo por Lead + Custo por MQL */}
            <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr", gap: 14 }}>
                <InvestmentCard
                    spend={m.spend}
                    target={spendTargetTotal != null ? { totalProrated: spendTargetTotal } : null}
                    daysInTargetMonth={daysInTargetMonth}
                    daysInPeriod={daysInPeriod}
                />
                <CostCard label="Custo por Lead" cost={m.cpl} denominatorLabel="Lead" />
                <CostCard label="Custo por MQL" cost={m.cpMql} denominatorLabel="MQL" />
            </div>

            {/* INVESTIGATION (preservado) */}
            {m.investigation && <InvestigationPanel m={m} />}

            {/* DealsModal (única instância, controlada por estado) */}
            <DealsModal
                isOpen={modal !== null}
                onClose={() => setModal(null)}
                title={modal?.title ?? ""}
                deals={modal?.deals ?? []}
            />
        </div>
    );
}
