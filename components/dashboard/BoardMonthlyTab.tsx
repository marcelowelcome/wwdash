"use client";
import { useMemo, useState } from "react";
import { T } from "./theme";
import type { WonDeal, MonthlyTarget } from "@/lib/schemas";
import {
    computeBoardMonthly,
    buildMonthsForPreset,
    BOARD_WINDOW_LABELS,
    type BoardCell,
    type BoardKpiRow,
    type BoardMonthlyMode,
    type BoardWindowPreset,
    type KpiFormat,
} from "@/lib/metrics-board-monthly";

const MODE_STORAGE_KEY = "ww-board-monthly-mode";
const WINDOW_STORAGE_KEY = "ww-board-monthly-window";

function loadModeFromStorage(): BoardMonthlyMode {
    if (typeof window === "undefined") return "evento";
    const v = window.localStorage.getItem(MODE_STORAGE_KEY);
    return v === "coorte" ? "coorte" : "evento";
}

function loadWindowFromStorage(): BoardWindowPreset {
    if (typeof window === "undefined") return "6m";
    const v = window.localStorage.getItem(WINDOW_STORAGE_KEY);
    if (v === "3m" || v === "6m" || v === "12m" || v === "ytd") return v;
    return "6m";
}

// ─── Props ──────────────────────────────────────────────────────────────────

interface BoardMonthlyTabProps {
    /** Deals dos 6 grupos WW + buffer 90d (mesmo universo que o SDRTab). */
    deals: WonDeal[];
    /** Map "YYYY-MM" → MonthlyTarget. Caller fetcha. */
    targetsByMonth: Map<string, MonthlyTarget | null>;
    /** Map "YYYY-MM" → { meta, google, partial }. Caller fetcha. */
    spendByMonth: Map<string, { meta: number; google: number; partial: boolean }>;
}

// ─── Formatters ─────────────────────────────────────────────────────────────

function fmtCurrency(v: number | null): string {
    if (v == null) return "—";
    if (v >= 10000) {
        return `R$ ${(v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}k`;
    }
    return `R$ ${v.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`;
}

function fmtNumber(v: number | null): string {
    if (v == null) return "—";
    return v.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
}

function fmtPercent(v: number | null): string {
    if (v == null) return "—";
    return `${v.toFixed(1).replace(".", ",")}%`;
}

function fmtByKind(v: number | null, kind: KpiFormat): string {
    if (kind === "currency") return fmtCurrency(v);
    if (kind === "percent") return fmtPercent(v);
    return fmtNumber(v);
}

function fmtAttainment(pct: number | null, inversion: "higher-is-better" | "lower-is-better"): string {
    if (pct == null) return "—";
    // Para "higher-is-better" (MQL, contratos…): exibe como (atingido - 100)
    // Para "lower-is-better" (CAC): exibe como (100 - atingido) → quanto menor, melhor
    const delta = inversion === "higher-is-better" ? pct - 100 : 100 - pct;
    const sign = delta > 0 ? "+" : "";
    return `${sign}${delta.toFixed(0)}%`;
}

// ─── Color logic ────────────────────────────────────────────────────────────
// Para higher-is-better: pct >= 90 verde, 70-90 âmbar, <70 vermelho
// Para lower-is-better: pct <= 110 verde, 110-130 âmbar, >130 vermelho

function statusColor(pct: number | null, inversion: "higher-is-better" | "lower-is-better"): string {
    if (pct == null) return T.muted;
    if (inversion === "higher-is-better") {
        if (pct >= 90) return T.green;
        if (pct >= 70) return T.gold;
        return T.red;
    }
    if (pct <= 110) return T.green;
    if (pct <= 130) return T.gold;
    return T.red;
}

// ─── Component ──────────────────────────────────────────────────────────────

export function BoardMonthlyTab({ deals, targetsByMonth, spendByMonth }: BoardMonthlyTabProps) {
    const [mode, setMode] = useState<BoardMonthlyMode>(loadModeFromStorage);
    const [windowPreset, setWindowPreset] = useState<BoardWindowPreset>(loadWindowFromStorage);

    const months = useMemo(() => buildMonthsForPreset(windowPreset), [windowPreset]);

    function handleModeChange(next: BoardMonthlyMode) {
        setMode(next);
        if (typeof window !== "undefined") window.localStorage.setItem(MODE_STORAGE_KEY, next);
    }

    function handleWindowChange(next: BoardWindowPreset) {
        setWindowPreset(next);
        if (typeof window !== "undefined") window.localStorage.setItem(WINDOW_STORAGE_KEY, next);
    }

    const data = useMemo(
        () =>
            computeBoardMonthly({
                deals,
                months,
                targetsByMonth,
                spendByMonth,
                mode,
            }),
        [deals, months, targetsByMonth, spendByMonth, mode],
    );

    const periodLabel = useMemo(() => {
        if (data.months.length === 0) return "";
        const first = data.months[0].label;
        const last = data.months[data.months.length - 1].label;
        return `${first} → ${last}`;
    }, [data.months]);

    // Estilos
    const s = {
        sectionLabel: {
            fontSize: 10,
            color: T.muted,
            letterSpacing: "0.1em",
            textTransform: "uppercase" as const,
            fontWeight: 600,
        },
        cellRealized: {
            fontSize: 14,
            fontWeight: 500,
            color: T.white,
            ...{ fontVariantNumeric: "tabular-nums" } as React.CSSProperties,
        },
        cellTarget: {
            fontSize: 10,
            color: T.muted,
            marginTop: 2,
            ...{ fontVariantNumeric: "tabular-nums" } as React.CSSProperties,
        },
        cellPct: {
            fontSize: 10,
            fontWeight: 700,
            marginTop: 4,
            ...{ fontVariantNumeric: "tabular-nums" } as React.CSSProperties,
        },
    };

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: "0 4px" }}>
            {/* Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
                <div>
                    <div style={{ ...s.sectionLabel, marginBottom: 6 }}>Board Mensal · Welcome Weddings</div>
                    <h1
                        style={{
                            fontSize: 24,
                            color: T.white,
                            fontWeight: 700,
                            margin: 0,
                            marginBottom: 4,
                        }}
                    >
                        {periodLabel}
                    </h1>
                    <div style={{ fontSize: 12, color: T.muted, maxWidth: 720 }}>
                        Cada coluna = um mês completo, exceto a última (em curso, meta prorrateada por dias decorridos).
                        Verde ≥ 90% (ou ≤ 110% para CAC) · âmbar 70–90% · vermelho &lt; 70% (ou &gt; 130% para CAC).
                    </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "flex-end" }}>
                    <WindowPicker preset={windowPreset} onChange={handleWindowChange} />
                    <ModeToggle mode={mode} onChange={handleModeChange} />
                </div>
            </div>

            {/* Aviso de coorte imatura */}
            {mode === "coorte" && (
                <div
                    style={{
                        background: T.surface,
                        border: `1px solid ${T.border}`,
                        borderLeft: `3px solid ${T.gold}`,
                        borderRadius: 8,
                        padding: "10px 14px",
                        fontSize: 11,
                        color: T.cream,
                        lineHeight: 1.6,
                    }}
                >
                    <strong style={{ color: T.gold }}>Modo Coorte:</strong> cada coluna mostra o que aconteceu
                    com os leads <em>criados naquele mês</em>, em qualquer momento. Taxas são reais. Coortes recentes
                    (últimos 1-2 meses) têm leads ainda no funil — Contratos e taxas de fechamento aparecem
                    subestimados. Tempo médio até fechamento ≈ 23 dias.
                </div>
            )}

            {/* Banners de alertas */}
            {(data.monthsWithoutTargets.length > 0 || data.monthsWithPartialSpend.length > 0) && (
                <div
                    style={{
                        background: T.surface,
                        border: `1px solid ${T.border}`,
                        borderLeft: `3px solid ${T.gold}`,
                        borderRadius: 8,
                        padding: "10px 14px",
                        fontSize: 11,
                        color: T.cream,
                        lineHeight: 1.6,
                    }}
                >
                    {data.monthsWithoutTargets.length > 0 && (
                        <div>
                            <strong style={{ color: T.gold }}>⚠ Meses sem meta cadastrada:</strong>{" "}
                            {data.monthsWithoutTargets.join(", ")} — colunas exibem "—" no campo Meta.
                        </div>
                    )}
                    {data.monthsWithPartialSpend.length > 0 && (
                        <div style={{ marginTop: 4 }}>
                            <strong style={{ color: T.gold }}>⚠ Spend parcial em:</strong>{" "}
                            {data.monthsWithPartialSpend.join(", ")} — Investimento e CAC podem estar subestimados.
                        </div>
                    )}
                </div>
            )}

            {/* Tabela principal */}
            <div
                style={{
                    background: T.card,
                    border: `1px solid ${T.border}`,
                    borderRadius: 12,
                    padding: 16,
                    overflowX: "auto",
                }}
            >
                <table
                    style={{
                        width: "100%",
                        borderCollapse: "separate",
                        borderSpacing: 0,
                        minWidth: 880,
                    }}
                >
                    <thead>
                        <tr>
                            <th
                                style={{
                                    textAlign: "left",
                                    padding: "10px 12px",
                                    borderBottom: `1px solid ${T.border}`,
                                    color: T.muted,
                                    fontSize: 10,
                                    fontWeight: 600,
                                    letterSpacing: "0.08em",
                                    textTransform: "uppercase",
                                    width: 220,
                                    position: "sticky",
                                    left: 0,
                                    background: T.card,
                                    zIndex: 1,
                                }}
                            >
                                KPI
                            </th>
                            {data.months.map((m) => (
                                <th
                                    key={m.key}
                                    style={{
                                        textAlign: "center",
                                        padding: "10px 8px",
                                        borderBottom: `1px solid ${T.border}`,
                                        color: m.isCurrent ? T.gold : T.muted,
                                        fontSize: 11,
                                        fontWeight: 600,
                                        minWidth: 92,
                                    }}
                                >
                                    <div>{m.label}</div>
                                    {m.isCurrent && (
                                        <div
                                            style={{
                                                fontSize: 9,
                                                color: T.gold,
                                                fontWeight: 500,
                                                marginTop: 2,
                                                letterSpacing: "0.04em",
                                            }}
                                        >
                                            em curso · {m.daysElapsed}/{m.daysInMonth}d
                                        </div>
                                    )}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {data.rows.map((row, rowIdx) => (
                            <KpiRowComponent
                                key={row.key}
                                row={row}
                                isLast={rowIdx === data.rows.length - 1}
                                cardBg={T.card}
                            />
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Legenda / disclaimer */}
            <div
                style={{
                    fontSize: 11,
                    color: T.muted,
                    fontStyle: "italic",
                    lineHeight: 1.6,
                    padding: "0 4px",
                }}
            >
                Investimento, MQL, Qualificados, Reuniões e Contratos têm meta prorrateada no mês corrente
                ({"target × dias_decorridos / dias_no_mês"}). Custo por Contrato e Conversão SDR→Closer
                são taxas — sem prorrateio. Hover no nome do KPI para ver a definição completa.
            </div>
        </div>
    );
}

// ─── KPI row ────────────────────────────────────────────────────────────────

function KpiRowComponent({
    row,
    isLast,
    cardBg,
}: {
    row: BoardKpiRow;
    isLast: boolean;
    cardBg: string;
}) {
    return (
        <tr>
            <td
                style={{
                    padding: "12px",
                    borderBottom: isLast ? "none" : `1px solid ${T.border}`,
                    color: T.cream,
                    fontSize: 12,
                    fontWeight: 500,
                    cursor: "help",
                    position: "sticky",
                    left: 0,
                    background: cardBg,
                    zIndex: 1,
                }}
                title={row.definition}
            >
                {row.label}
            </td>
            {row.cells.map((cell, idx) => (
                <CellComponent key={idx} cell={cell} format={row.format} inversion={row.inversion} isLast={isLast} />
            ))}
        </tr>
    );
}

function CellComponent({
    cell,
    format,
    inversion,
    isLast,
}: {
    cell: BoardCell;
    format: KpiFormat;
    inversion: "higher-is-better" | "lower-is-better";
    isLast: boolean;
}) {
    const color = statusColor(cell.pctAttainment, inversion);
    return (
        <td
            style={{
                padding: "10px 8px",
                borderBottom: isLast ? "none" : `1px solid ${T.border}`,
                textAlign: "center",
                verticalAlign: "top",
                background: cell.isCurrent ? "rgba(212, 175, 55, 0.04)" : "transparent",
            }}
        >
            <div style={{ fontSize: 14, fontWeight: 500, color: T.white, fontVariantNumeric: "tabular-nums" }}>
                {fmtByKind(cell.realized, format)}
                {cell.spendPartial && (format === "currency") && (
                    <span title="Spend parcial (gap em ads_daily_cache)" style={{ color: T.gold, marginLeft: 4 }}>
                        ⚠
                    </span>
                )}
            </div>
            <div style={{ fontSize: 10, color: T.muted, marginTop: 2, fontVariantNumeric: "tabular-nums" }}>
                {cell.target != null ? `meta ${fmtByKind(cell.target, format)}` : "sem meta"}
            </div>
            <div
                style={{
                    fontSize: 10,
                    fontWeight: 700,
                    marginTop: 6,
                    color,
                    fontVariantNumeric: "tabular-nums",
                }}
            >
                {fmtAttainment(cell.pctAttainment, inversion)}
            </div>
        </td>
    );
}

// ─── WindowPicker ───────────────────────────────────────────────────────────

function WindowPicker({
    preset,
    onChange,
}: {
    preset: BoardWindowPreset;
    onChange: (next: BoardWindowPreset) => void;
}) {
    const options: BoardWindowPreset[] = ["3m", "6m", "12m", "ytd"];
    const shortLabel: Record<BoardWindowPreset, string> = {
        "3m": "3m",
        "6m": "6m",
        "12m": "12m",
        "ytd": "Ano",
    };
    return (
        <div
            style={{
                display: "inline-flex",
                background: T.surface,
                border: `1px solid ${T.border}`,
                borderRadius: 999,
                padding: 3,
            }}
            title={`Janela: ${BOARD_WINDOW_LABELS[preset]}`}
        >
            {options.map((opt) => {
                const active = opt === preset;
                return (
                    <button
                        key={opt}
                        type="button"
                        onClick={() => onChange(opt)}
                        aria-pressed={active}
                        title={BOARD_WINDOW_LABELS[opt]}
                        style={{
                            background: active ? T.gold : "transparent",
                            color: active ? "#1a1422" : T.cream,
                            border: "none",
                            borderRadius: 999,
                            padding: "4px 12px",
                            fontSize: 11,
                            fontWeight: 600,
                            cursor: "pointer",
                            fontFamily: "inherit",
                            letterSpacing: "0.02em",
                            transition: "all 180ms ease",
                            minWidth: 38,
                        }}
                    >
                        {shortLabel[opt]}
                    </button>
                );
            })}
        </div>
    );
}

// ─── ModeToggle ─────────────────────────────────────────────────────────────

function ModeToggle({
    mode,
    onChange,
}: {
    mode: BoardMonthlyMode;
    onChange: (next: BoardMonthlyMode) => void;
}) {
    const help =
        "Evento: cada etapa conta no mês em que o evento aconteceu (default, espelha o Funil do Mês).\n" +
        "Coorte: ancora pelo created_at — cada coluna mostra o que aconteceu com os leads criados naquele mês.\n" +
        "Taxas em modo Coorte são reais; em Evento são informativas.";
    return (
        <div
            style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                fontSize: 11,
            }}
            title={help}
        >
            <div
                style={{
                    display: "inline-flex",
                    background: T.surface,
                    border: `1px solid ${T.border}`,
                    borderRadius: 999,
                    padding: 3,
                }}
            >
                {(["evento", "coorte"] as const).map((m) => {
                    const active = m === mode;
                    return (
                        <button
                            key={m}
                            type="button"
                            onClick={() => onChange(m)}
                            aria-pressed={active}
                            style={{
                                background: active ? T.gold : "transparent",
                                color: active ? "#1a1422" : T.cream,
                                border: "none",
                                borderRadius: 999,
                                padding: "5px 14px",
                                fontSize: 11,
                                fontWeight: 600,
                                cursor: "pointer",
                                fontFamily: "inherit",
                                letterSpacing: "0.02em",
                                transition: "all 180ms ease",
                            }}
                        >
                            {m === "evento" ? "Evento" : "Coorte"}
                        </button>
                    );
                })}
            </div>
            <span style={{ color: T.muted, fontSize: 11, maxWidth: 240, lineHeight: 1.4 }}>
                {mode === "evento"
                    ? "Conta o que aconteceu no mês."
                    : "Acompanha a coorte do mês."}
            </span>
        </div>
    );
}
