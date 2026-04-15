"use client";

import { useMemo } from "react";
import { X } from "lucide-react";
import { T } from "./theme";
import { type WonDeal } from "@/lib/schemas";
import type { StageStats } from "@/lib/metrics-jornada";

interface StageDeepDiveProps {
    isOpen: boolean;
    onClose: () => void;
    stage: StageStats | null;
    stagePrev?: StageStats;
    periodoLabel: string;
    periodoAnteriorLabel: string;
}

interface BucketRow {
    key: string;
    label: string;
    count: number;
    pct: number;
    prevCount: number;
    delta: number;
}

type Kind = "categorical" | "boolean" | "numeric-range" | "list";

interface Range {
    label: string;
    min: number;
    max: number; // exclusive
}

interface FieldDef {
    key: keyof WonDeal;
    label: string;
    kind: Kind;
    ranges?: Range[];
    trueLabel?: string;
    falseLabel?: string;
}

const LEAD_FIELDS: FieldDef[] = [
    { key: "como_conheceu_a_ww", label: "Como conheceu a WW", kind: "categorical" },
    { key: "destino", label: "Destino desejado", kind: "categorical" },
    { key: "cidade", label: "Cidade", kind: "categorical" },
    {
        key: "orcamento",
        label: "Orçamento",
        kind: "numeric-range",
        ranges: [
            { label: "Até R$ 50 mil", min: 0, max: 50000 },
            { label: "R$ 50 – 100 mil", min: 50000, max: 100000 },
            { label: "R$ 100 – 200 mil", min: 100000, max: 200000 },
            { label: "R$ 200 – 500 mil", min: 200000, max: 500000 },
            { label: "Acima de R$ 500 mil", min: 500000, max: Infinity },
        ],
    },
    {
        key: "num_convidados",
        label: "Número de convidados",
        kind: "numeric-range",
        ranges: [
            { label: "Até 20", min: 0, max: 21 },
            { label: "20 – 50", min: 21, max: 51 },
            { label: "50 – 100", min: 51, max: 101 },
            { label: "100 – 200", min: 101, max: 201 },
            { label: "200+", min: 201, max: Infinity },
        ],
    },
    { key: "previsao_data_casamento", label: "Previsão do casamento", kind: "categorical" },
    { key: "previsao_contratar_assessoria", label: "Previsão para contratar assessoria", kind: "categorical" },
    { key: "status_do_relacionamento", label: "Status do relacionamento", kind: "categorical" },
    { key: "costumam_viajar", label: "Costumam viajar", kind: "boolean" },
    { key: "ja_foi_destination_wedding", label: "Já foi em um DW", kind: "boolean" },
    { key: "ja_tem_destino_definido", label: "Já tem destino definido", kind: "boolean" },
];

const SDR_FIELDS: FieldDef[] = [
    { key: "como_foi_feita_a_1a_reuniao", label: "Como foi feita a 1ª reunião", kind: "categorical" },
    { key: "tipo_reuniao_closer", label: "Como foi feita a reunião com o Closer", kind: "categorical" },
    { key: "qualificado_para_sql", label: "Qualificado para o Closer", kind: "categorical" },
    { key: "motivos_qualificacao_sdr", label: "Motivos de qualificação", kind: "list" },
    { key: "motivo_desqualificacao_sdr", label: "Motivos de desqualificação", kind: "list" },
    { key: "motivo_de_perda", label: "Motivo de perda", kind: "categorical" },
];

function toBucket(value: unknown, field: FieldDef): string | string[] | null {
    if (value == null || value === "") return null;
    if (field.kind === "boolean") {
        if (typeof value === "boolean") return value ? (field.trueLabel ?? "Sim") : (field.falseLabel ?? "Não");
        const s = String(value).trim().toLowerCase();
        if (s === "true" || s === "sim" || s === "1") return field.trueLabel ?? "Sim";
        if (s === "false" || s === "não" || s === "nao" || s === "0") return field.falseLabel ?? "Não";
        return String(value);
    }
    if (field.kind === "numeric-range" && field.ranges) {
        const n = typeof value === "number" ? value : parseFloat(String(value));
        if (!Number.isFinite(n)) return null;
        const r = field.ranges.find((r) => n >= r.min && n < r.max);
        return r ? r.label : null;
    }
    if (field.kind === "list") {
        const s = String(value).trim();
        if (!s) return null;
        // split on commas / semicolons
        return s.split(/[,;]\s*/).map((v) => v.trim()).filter(Boolean);
    }
    return String(value).trim();
}

function buildFieldBreakdown(
    field: FieldDef,
    deals: WonDeal[],
    prevDeals: WonDeal[],
): { rows: BucketRow[]; answered: number; total: number; answeredPrev: number; totalPrev: number } {
    const counts = new Map<string, number>();
    const countsPrev = new Map<string, number>();
    let answered = 0;
    let answeredPrev = 0;

    for (const d of deals) {
        const b = toBucket(d[field.key], field);
        if (b == null) continue;
        answered++;
        if (Array.isArray(b)) {
            for (const v of b) counts.set(v, (counts.get(v) ?? 0) + 1);
        } else {
            counts.set(b, (counts.get(b) ?? 0) + 1);
        }
    }
    for (const d of prevDeals) {
        const b = toBucket(d[field.key], field);
        if (b == null) continue;
        answeredPrev++;
        if (Array.isArray(b)) {
            for (const v of b) countsPrev.set(v, (countsPrev.get(v) ?? 0) + 1);
        } else {
            countsPrev.set(b, (countsPrev.get(b) ?? 0) + 1);
        }
    }

    const allKeys = new Set<string>([...counts.keys(), ...countsPrev.keys()]);
    const denom = answered || 1;
    const rows: BucketRow[] = [...allKeys]
        .map((k) => {
            const c = counts.get(k) ?? 0;
            const p = countsPrev.get(k) ?? 0;
            return { key: k, label: k, count: c, prevCount: p, delta: c - p, pct: (c / denom) * 100 };
        })
        .filter((r) => r.count > 0)
        .sort((a, b) => b.count - a.count);

    return { rows, answered, total: deals.length, answeredPrev, totalPrev: prevDeals.length };
}

function FieldBlock({
    field,
    deals,
    prevDeals,
}: {
    field: FieldDef;
    deals: WonDeal[];
    prevDeals: WonDeal[];
}) {
    const { rows, answered, total, answeredPrev, totalPrev } = useMemo(
        () => buildFieldBreakdown(field, deals, prevDeals),
        [field, deals, prevDeals],
    );
    // Hide blocks without context in either the current or the previous period
    if (answered === 0 && answeredPrev === 0) return null;
    const fillPct = total > 0 ? (answered / total) * 100 : 0;
    const fillPctPrev = totalPrev > 0 ? (answeredPrev / totalPrev) * 100 : null;
    const maxCount = rows.reduce((m, r) => Math.max(m, r.count), 1);

    return (
        <div style={{ padding: "14px 0", borderBottom: `1px solid ${T.border}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8, gap: 12 }}>
                <div style={{ fontSize: 13, color: T.white, fontWeight: 600 }}>
                    {field.label}
                </div>
                <div style={{ fontSize: 10, color: T.muted, fontFamily: "monospace", whiteSpace: "nowrap" }}>
                    {answered}/{total} preenchido ({fillPct.toFixed(0)}%)
                    {fillPctPrev != null && (
                        <span style={{ marginLeft: 6 }}>
                            · antes {fillPctPrev.toFixed(0)}%
                        </span>
                    )}
                </div>
            </div>

            {rows.length === 0 ? (
                <div style={{ fontSize: 12, color: T.muted, fontStyle: "italic" }}>
                    Sem respostas neste período.
                </div>
            ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {rows.slice(0, 8).map((r) => {
                        const bar = (r.count / maxCount) * 100;
                        const isNew = r.prevCount === 0 && r.count > 0;
                        const deltaColor = r.delta === 0 ? T.muted : r.delta > 0 ? T.green : T.red;
                        return (
                            <div key={r.key} style={{ fontSize: 12 }}>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
                                    <span
                                        style={{
                                            color: T.cream,
                                            overflow: "hidden",
                                            textOverflow: "ellipsis",
                                            whiteSpace: "nowrap",
                                            flex: 1,
                                        }}
                                        title={r.label}
                                    >
                                        {r.label}
                                    </span>
                                    <span style={{ whiteSpace: "nowrap", color: T.muted }}>
                                        <span style={{ color: T.white, fontFamily: "monospace", fontWeight: 600 }}>{r.count}</span>
                                        <span style={{ fontFamily: "monospace", marginLeft: 4 }}>({r.pct.toFixed(0)}%)</span>
                                        {isNew ? (
                                            <span style={{ color: T.gold, fontFamily: "monospace", marginLeft: 6, fontWeight: 700, fontSize: 10 }}>
                                                NOVO
                                            </span>
                                        ) : (
                                            <span style={{ color: deltaColor, fontFamily: "monospace", marginLeft: 6, fontSize: 10 }}>
                                                {r.delta === 0 ? "~" : `${r.delta > 0 ? "▲+" : "▼"}${r.delta}`}
                                            </span>
                                        )}
                                    </span>
                                </div>
                                <div style={{ height: 3, background: T.border, marginTop: 3 }}>
                                    <div style={{ height: "100%", width: `${bar}%`, background: T.gold, opacity: 0.55 }} />
                                </div>
                            </div>
                        );
                    })}
                    {rows.length > 8 && (
                        <div style={{ fontSize: 11, color: T.muted, fontStyle: "italic", marginTop: 2 }}>
                            +{rows.length - 8} outras respostas
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

function hasContext(field: FieldDef, deals: WonDeal[], prevDeals: WonDeal[]): boolean {
    for (const d of deals) {
        if (toBucket(d[field.key], field) != null) return true;
    }
    for (const d of prevDeals) {
        if (toBucket(d[field.key], field) != null) return true;
    }
    return false;
}

function FieldGroup({
    title,
    subtitle,
    fields,
    deals,
    prevDeals,
}: {
    title: string;
    subtitle: string;
    fields: FieldDef[];
    deals: WonDeal[];
    prevDeals: WonDeal[];
}) {
    const visibleFields = fields.filter((f) => hasContext(f, deals, prevDeals));
    if (visibleFields.length === 0) return null;
    return (
        <div
            style={{
                background: T.card,
                border: `1px solid ${T.border}`,
                borderRadius: 12,
                padding: "18px 22px",
            }}
        >
            <div style={{ fontSize: 11, color: T.gold, letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 700, marginBottom: 4 }}>
                {title}
            </div>
            <div style={{ fontSize: 12, color: T.muted, marginBottom: 10 }}>{subtitle}</div>
            <div>
                {visibleFields.map((f) => (
                    <FieldBlock key={f.key as string} field={f} deals={deals} prevDeals={prevDeals} />
                ))}
            </div>
        </div>
    );
}

export function StageDeepDive({ isOpen, onClose, stage, stagePrev, periodoLabel, periodoAnteriorLabel }: StageDeepDiveProps) {
    if (!isOpen || !stage) return null;
    const prevDeals = stagePrev?.deals ?? [];

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
                            {periodoLabel} · {stage.count} registros
                            {stagePrev && ` · comparado com ${periodoAnteriorLabel} (${stagePrev.count})`}
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        aria-label="Fechar"
                        style={{ background: "transparent", border: "none", cursor: "pointer", padding: 4 }}
                        title="Fechar"
                    >
                        <X size={22} color={T.muted} aria-hidden="true" />
                    </button>
                </div>

                {/* Body */}
                <div style={{ flex: 1, overflowY: "auto", padding: "20px 22px", display: "flex", flexDirection: "column", gap: 14 }}>
                    <FieldGroup
                        title="Respostas do lead"
                        subtitle="O que o lead disse pelo formulário ou na primeira conversa"
                        fields={LEAD_FIELDS}
                        deals={stage.deals}
                        prevDeals={prevDeals}
                    />
                    <FieldGroup
                        title="Registro do SDR"
                        subtitle="Decisões e motivos anotados pelo SDR"
                        fields={SDR_FIELDS}
                        deals={stage.deals}
                        prevDeals={prevDeals}
                    />
                </div>
            </div>
        </div>
    );
}
