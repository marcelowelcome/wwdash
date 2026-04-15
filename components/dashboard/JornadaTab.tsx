"use client";

import { useMemo, useState } from "react";
import { T } from "./theme";
import { DealsModal } from "./DealsModal";
import { StageChart } from "./StageChart";
import { StageDeepDive } from "./StageDeepDive";
import { type WonDeal } from "@/lib/schemas";
import { isInWwLeadsPipeline, isElopement } from "@/lib/funnel-utils";
import {
    type JornadaMode,
    type JornadaPeriod,
    type StageStats,
    type SubView,
    type DropoutAnalysis,
    SUBVIEWS,
    computeJornada,
    computeDropout,
    daysBackPeriod,
    monthPeriod,
    previousPeriod,
    sliceStages,
    targetRateBetween,
} from "@/lib/metrics-jornada";

interface JornadaTabProps {
    allDeals: WonDeal[];
}

type PeriodPreset = "mes-corrente" | "mes-anterior" | "ultimos-90d" | "personalizado";

const PERIOD_PRESETS: { id: PeriodPreset; label: string }[] = [
    { id: "mes-corrente", label: "Mês corrente" },
    { id: "mes-anterior", label: "Mês anterior" },
    { id: "ultimos-90d", label: "Últimos 90 dias" },
    { id: "personalizado", label: "Personalizado" },
];

function buildPeriod(preset: PeriodPreset, today: Date = new Date()): JornadaPeriod {
    if (preset === "ultimos-90d") return daysBackPeriod(90, today);
    const y = today.getFullYear();
    const m = today.getMonth();
    if (preset === "mes-anterior") return monthPeriod(y, m - 1);
    // Mês corrente = do dia 1 até hoje (MTD), não o mês inteiro
    const from = new Date(y, m, 1);
    const to = new Date(y, m, today.getDate() + 1);
    const fmt = (d: Date) =>
        d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
    const endInclusive = new Date(to.getTime() - 1);
    return { from, to, label: `${fmt(from)} a ${fmt(endInclusive)}` };
}

function buildCustomPeriod(startStr: string, endStr: string): JornadaPeriod {
    const from = new Date(startStr + "T00:00:00");
    const end = new Date(endStr + "T00:00:00");
    const to = new Date(end.getTime() + 24 * 60 * 60 * 1000);
    const fmt = (d: Date) => d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
    return { from, to, label: `${fmt(from)} a ${fmt(end)}` };
}

function todayStr(): string {
    return new Date().toISOString().slice(0, 10);
}

function firstOfMonthStr(): string {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().slice(0, 10);
}

const RESP_COLOR: Record<string, string> = {
    "MKT": "#7AB8FF",
    "SDR": "#D4A35A",
    "SDR→Closer": "#C2758A",
    "Closer": "#3DBF8A",
};

const STATUS_COLOR: Record<string, string> = {
    above: T.green,
    within: T.gold,
    below: T.red,
};

const STATUS_LABEL: Record<string, string> = {
    above: "acima da meta",
    within: "próximo da meta",
    below: "abaixo da meta",
};

// Distinct glyphs so status is distinguishable without relying on color alone
const STATUS_GLYPH: Record<string, string> = {
    above: "●",
    within: "◐",
    below: "○",
};

const fmtNumber = (n: number) => new Intl.NumberFormat("pt-BR").format(n);
const fmtRate = (r: number | null) => (r == null ? "—" : `${r.toFixed(1)}%`);

function DealsPreview({ deals }: { deals: WonDeal[] }) {
    const preview = deals.slice(0, 8);
    return (
        <div
            style={{
                position: "absolute",
                top: "calc(100% + 8px)",
                right: 0,
                zIndex: 20,
                background: T.surface,
                border: `1px solid ${T.border}`,
                borderRadius: 10,
                padding: "10px 14px",
                minWidth: 280,
                maxWidth: 360,
                boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
                pointerEvents: "none",
            }}
        >
            <div style={{ fontSize: 10, color: T.muted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
                Primeiros {preview.length} de {deals.length}
            </div>
            {preview.map((d) => (
                <div key={d.id} style={{ fontSize: 11, color: T.white, padding: "3px 0", display: "flex", gap: 8 }}>
                    <span style={{ color: T.muted, fontFamily: "monospace", minWidth: 46 }}>#{d.id}</span>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {d.title || d.destino || "(sem título)"}
                    </span>
                </div>
            ))}
            {deals.length > preview.length && (
                <div style={{ fontSize: 10, color: T.gold, marginTop: 8, fontStyle: "italic" }}>
                    Clique para ver todos ({deals.length})
                </div>
            )}
        </div>
    );
}

function StageCard({
    stage,
    prevStage,
    comparison,
    isFirst,
    onOpenModal,
    onOpenDeepDive,
}: {
    stage: StageStats;
    prevStage?: StageStats;
    comparison?: StageStats;
    isFirst: boolean;
    onOpenModal: (stage: StageStats) => void;
    onOpenDeepDive: (stage: StageStats) => void;
}) {
    const [hover, setHover] = useState(false);
    const respColor = RESP_COLOR[stage.responsavel] || T.muted;
    const statusColor = stage.metaStatus ? STATUS_COLOR[stage.metaStatus] : T.muted;
    const statusLabel = stage.metaStatus ? STATUS_LABEL[stage.metaStatus] : "";

    const compRate = comparison?.rateFromPrev ?? null;
    const deltaCount = comparison ? stage.count - comparison.count : null;

    const interactive = stage.count > 0;
    const handleActivate = () => { if (interactive) onOpenModal(stage); };

    return (
        <div
            onMouseEnter={() => setHover(true)}
            onMouseLeave={() => setHover(false)}
            onFocus={() => setHover(true)}
            onBlur={() => setHover(false)}
            onClick={handleActivate}
            onKeyDown={(e) => {
                if (!interactive) return;
                if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    handleActivate();
                }
            }}
            role={interactive ? "button" : undefined}
            tabIndex={interactive ? 0 : undefined}
            aria-label={interactive ? `Ver deals: ${stage.label}, ${stage.count} registros` : undefined}
            style={{
                background: T.card,
                border: `1px solid ${hover && interactive ? T.gold : T.border}`,
                borderRadius: 12,
                padding: "20px 24px",
                display: "grid",
                gridTemplateColumns: "1fr auto",
                gap: 24,
                alignItems: "center",
                cursor: interactive ? "pointer" : "default",
                position: "relative",
                transition: "border-color 0.15s ease",
            }}
        >
            <div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                    <div
                        style={{
                            width: 8,
                            height: 8,
                            borderRadius: 2,
                            background: respColor,
                        }}
                    />
                    <span
                        style={{
                            fontSize: 10,
                            color: T.muted,
                            letterSpacing: "0.08em",
                            textTransform: "uppercase",
                            fontWeight: 600,
                        }}
                    >
                        Responsável: {stage.responsavel}
                    </span>
                </div>
                <div
                    style={{
                        fontSize: 16,
                        color: T.white,
                        fontWeight: 600,
                        marginBottom: 4,
                    }}
                >
                    {stage.label}
                </div>
                {!isFirst && (
                    <div style={{ fontSize: 12, color: T.muted, lineHeight: 1.6 }}>
                        Conversão a partir {stage.denominatorLabel ? `das ${stage.denominatorLabel}` : "da etapa anterior"}:{" "}
                        <span style={{ color: statusColor, fontWeight: 700 }}>
                            {fmtRate(stage.rateFromPrev)}
                        </span>
                        {stage.meta != null && (
                            <>
                                <span style={{ color: T.muted }}> · meta {stage.meta}%</span>
                                {stage.metaStatus && (
                                    <span style={{ color: statusColor, marginLeft: 6 }}>
                                        ({statusLabel})
                                    </span>
                                )}
                            </>
                        )}
                        {compRate != null && (
                            <div style={{ color: T.muted, fontSize: 11, marginTop: 2 }}>
                                Período anterior: {fmtRate(compRate)}
                            </div>
                        )}
                    </div>
                )}
                {stage.pastCount != null && stage.futureCount != null && (stage.pastCount + stage.futureCount) > 0 && (
                    <div style={{ fontSize: 11, color: T.muted, marginTop: 6, lineHeight: 1.6 }}>
                        <span style={{ color: T.cream, fontFamily: "monospace" }}>{fmtNumber(stage.pastCount)}</span>{" "}
                        já passaram
                        {stage.futureCount > 0 && (
                            <>
                                {" · "}
                                <span style={{ color: T.gold, fontFamily: "monospace" }}>
                                    {fmtNumber(stage.futureCount)}
                                </span>{" "}
                                ainda vão acontecer
                            </>
                        )}
                    </div>
                )}
                {isFirst && (
                    <div style={{ fontSize: 12, color: T.muted, lineHeight: 1.6 }}>
                        Topo do funil — todas as pessoas que chegaram no período
                        {(() => {
                            const stillSdr = stage.deals.filter((d) => d.group_id === "1").length;
                            const progressed = stage.count - stillSdr;
                            if (stage.count === 0) return null;
                            return (
                                <div style={{ fontSize: 11, color: T.muted, marginTop: 4 }}>
                                    <span style={{ color: T.cream }}>{fmtNumber(stillSdr)}</span> ainda no SDR ·{" "}
                                    <span style={{ color: T.cream }}>{fmtNumber(progressed)}</span> já avançou
                                </div>
                            );
                        })()}
                    </div>
                )}
            </div>
            <div style={{ textAlign: "right" }}>
                <div
                    style={{
                        fontSize: 36,
                        color: T.white,
                        fontWeight: 700,
                        fontFamily: "monospace",
                        lineHeight: 1,
                    }}
                >
                    {fmtNumber(stage.count)}
                </div>
                {deltaCount != null && comparison && (
                    <div
                        style={{
                            fontSize: 11,
                            color: deltaCount >= 0 ? T.green : T.red,
                            marginTop: 6,
                            fontFamily: "monospace",
                        }}
                    >
                        {deltaCount >= 0 ? "+" : ""}{fmtNumber(deltaCount)} vs período anterior
                    </div>
                )}
                {prevStage && (
                    <div style={{ fontSize: 10, color: T.muted, marginTop: 4 }}>
                        de {fmtNumber(prevStage.count)}
                    </div>
                )}
                {stage.count > 0 && (
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onOpenDeepDive(stage);
                        }}
                        style={{
                            marginTop: 10,
                            background: "transparent",
                            border: `1px solid ${T.border}`,
                            color: T.gold,
                            fontSize: 10,
                            fontWeight: 600,
                            letterSpacing: "0.06em",
                            textTransform: "uppercase",
                            padding: "8px 14px",
                            minHeight: 32,
                            borderRadius: 6,
                            cursor: "pointer",
                            fontFamily: "inherit",
                            transition: "background 0.15s ease",
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = `${T.gold}22`)}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                        title="Ver análise aprofundada desta etapa"
                    >
                        Deep dive ↗
                    </button>
                )}
            </div>
            {hover && stage.count > 0 && <DealsPreview deals={stage.deals} />}
        </div>
    );
}

type Display = "detalhada" | "narrada";

const TRANSITION_TEXT: Record<string, { intro: (prev: string, cur: string) => string; subject: string }> = {
    "entrada→agendou": {
        intro: (prev, cur) => `${prev} chegaram até nós e, dessas, ${cur} marcaram a primeira reunião`,
        subject: "taxa de agendamento",
    },
    "agendou→realizou": {
        intro: (_prev, cur) => `${cur} dessas reuniões aconteceram de fato`,
        subject: "show-up da 1ª reunião",
    },
    "realizou→qualificou": {
        intro: (_prev, cur) => `${cur} das reuniões realizadas foram qualificadas para o Closer`,
        subject: "taxa de qualificação",
    },
    "qualificou→agCloser": {
        intro: (_prev, cur) => `${cur} das qualificadas tiveram reunião com o Closer marcada`,
        subject: "passagem para o Closer",
    },
    "agCloser→realizouCloser": {
        intro: (_prev, cur) => `${cur} dessas reuniões com o Closer aconteceram`,
        subject: "show-up do Closer",
    },
    "realizouCloser→vendeu": {
        intro: (_prev, cur) => `${cur} viraram venda fechada`,
        subject: "taxa de fechamento",
    },
};

function Bold({ children }: { children: React.ReactNode }) {
    return <strong style={{ color: T.white, fontWeight: 700 }}>{children}</strong>;
}

function MetaLine({ rate, meta, compRate }: { rate: number | null; meta?: number; compRate: number | null }) {
    if (rate == null) return null;
    const status = meta != null ? rateStatus(rate, meta) : null;
    const statusColor = status ? STATUS_COLOR[status] : T.muted;
    const statusText =
        status === "above" ? "acima da meta" :
        status === "within" ? "em linha com a meta" :
        status === "below" ? "abaixo da meta" : "";
    const deltaVsPrev = compRate != null ? rate - compRate : null;
    return (
        <div style={{ fontSize: 12, color: T.muted, marginTop: 4, lineHeight: 1.7 }}>
            Taxa: <span style={{ color: statusColor, fontWeight: 700, fontFamily: "monospace" }}>{rate.toFixed(1)}%</span>
            {meta != null && (
                <>
                    <span> · meta {meta}% · </span>
                    <span style={{ color: statusColor, fontWeight: 600 }}>{statusText}</span>
                </>
            )}
            {compRate != null && (
                <>
                    {" · período anterior: "}
                    <span style={{ fontFamily: "monospace" }}>{compRate.toFixed(1)}%</span>
                    {deltaVsPrev != null && (
                        <span style={{ color: deltaVsPrev >= 0 ? T.green : T.red, marginLeft: 4 }}>
                            ({deltaVsPrev >= 0 ? "+" : ""}{deltaVsPrev.toFixed(1)} p.p.)
                        </span>
                    )}
                </>
            )}
        </div>
    );
}

function NarrativeView({
    stages,
    comparisonStages,
    periodoLabel,
    periodoAnteriorLabel,
}: {
    stages: StageStats[];
    comparisonStages: StageStats[];
    periodoLabel: string;
    periodoAnteriorLabel: string;
}) {
    if (stages.length === 0) return null;
    const entrada = stages[0];
    const entradaComp = comparisonStages.find((c) => c.key === entrada.key);
    const entradaDelta = entradaComp ? entrada.count - entradaComp.count : null;

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <div
                style={{
                    background: T.card,
                    border: `1px solid ${T.border}`,
                    borderRadius: 12,
                    padding: "20px 24px",
                }}
            >
                <div style={{ fontSize: 13, color: T.cream, lineHeight: 1.8 }}>
                    Em <strong style={{ color: T.white }}>{periodoLabel}</strong>,{" "}
                    <Bold>{fmtNumber(entrada.count)} pessoas</Bold> chegaram até nós.
                    {entradaComp && entradaDelta != null && (
                        <>
                            {" "}No período anterior ({periodoAnteriorLabel.toLowerCase()}) foram{" "}
                            <span style={{ fontFamily: "monospace", color: T.cream }}>{fmtNumber(entradaComp.count)}</span>
                            {" — "}
                            <span style={{ color: entradaDelta >= 0 ? T.green : T.red, fontWeight: 600 }}>
                                {entradaDelta >= 0 ? "+" : ""}{fmtNumber(entradaDelta)}
                            </span>
                            .
                        </>
                    )}
                </div>
            </div>

            {stages.slice(1).map((cur, idx) => {
                const prev = stages[idx];
                const compCur = comparisonStages.find((c) => c.key === cur.key);
                const transitionKey = `${prev.key}→${cur.key}`;
                const tpl = TRANSITION_TEXT[transitionKey];
                if (!tpl) return null;
                const sentence = tpl.intro(fmtNumber(prev.count), fmtNumber(cur.count));
                const [pre, mid] = splitOnSecondNumber(sentence);

                return (
                    <div
                        key={cur.key}
                        style={{
                            background: T.card,
                            border: `1px solid ${T.border}`,
                            borderRadius: 12,
                            padding: "18px 24px",
                        }}
                    >
                        <div style={{ fontSize: 10, color: T.muted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
                            {tpl.subject} · responsável: {cur.responsavel}
                        </div>
                        <div style={{ fontSize: 14, color: T.cream, lineHeight: 1.7 }}>
                            {pre}<Bold>{mid}</Bold>.
                        </div>
                        <MetaLine
                            rate={cur.rateFromPrev}
                            meta={cur.meta}
                            compRate={compCur?.rateFromPrev ?? null}
                        />
                    </div>
                );
            })}
        </div>
    );
}

/** Splits the sentence so the second number+clause becomes the bolded emphasis. */
function splitOnSecondNumber(text: string): [string, string] {
    const matches = [...text.matchAll(/[\d.,]+/g)];
    if (matches.length < 2) return [text, ""];
    const second = matches[1];
    const idx = second.index ?? 0;
    return [text.slice(0, idx), text.slice(idx)];
}

const SUGGESTION_BY_STAGE: Record<string, string[]> = {
    agendou: [
        "Revisar qualidade de mídia no topo do funil (origens, criativos, LP).",
        "Validar se o SDR está respondendo em tempo hábil após a chegada do lead.",
        "Auditar leads recentes marcados como descartados ou em standby sem justificativa.",
    ],
    realizou: [
        "Reforçar lembrete de reunião (WhatsApp + e-mail) 24h e 1h antes.",
        "Oferecer reagendamento proativo para no-shows antes de descartar.",
        "Analisar horários com maior no-show e propor janelas alternativas.",
    ],
    qualificou: [
        "Revisar critérios de qualificação SDR com o time para consistência.",
        "Cruzar motivos de desqualificação com perfil de leads que converteram no passado.",
        "Treinar discovery para extrair sinais de orçamento e intenção mais cedo.",
    ],
    agCloser: [
        "Medir tempo médio entre qualificação e agendamento do Closer — há gargalo?",
        "Padronizar o handoff SDR→Closer (handover note + contexto do lead).",
        "Avaliar disponibilidade de agenda do Closer no período — bloqueios, férias, etc.",
    ],
    realizouCloser: [
        "Implementar lembrete de reunião específico para a etapa Closer.",
        "Confirmação ativa (ligação/WhatsApp) 1h antes com o Closer.",
        "Analisar se reuniões por vídeo vs. telefone têm show-up diferente.",
    ],
    vendeu: [
        "Revisar discurso de fechamento e objeções mais comuns neste período.",
        "Inspecionar propostas enviadas e tempo até resposta do lead.",
        "Validar qualidade da qualificação — talvez estejam chegando leads fora do perfil.",
    ],
};

interface ClosingData {
    prose: string;
    diagnosisLines: { text: string; color: string }[];
    suggestions: string[];
}

function buildClosing(
    stages: StageStats[],
    comparisonStages: StageStats[],
    periodoLabel: string,
    periodoAnteriorLabel: string,
): ClosingData {
    if (stages.length === 0) {
        return { prose: "", diagnosisLines: [], suggestions: [] };
    }
    const entrada = stages[0];
    const proseParts: string[] = [];
    proseParts.push(
        `Em ${periodoLabel}, ${fmtNumber(entrada.count)} pessoas entraram no funil.`,
    );

    for (let i = 1; i < stages.length; i++) {
        const prev = stages[i - 1];
        const cur = stages[i];
        const key = `${prev.key}→${cur.key}`;
        const tpl = TRANSITION_TEXT[key];
        if (!tpl) continue;
        const rate = cur.rateFromPrev;
        const meta = cur.meta;
        const conectivo = i === 1 ? "Dessas," : i === stages.length - 1 ? "Por fim," : "Em seguida,";
        let sentence = `${conectivo} ${fmtNumber(cur.count)} ${verbFor(cur.key)}`;
        if (rate != null) {
            sentence += ` (${rate.toFixed(1)}%)`;
        }
        if (rate != null && meta != null) {
            const status = rateStatus(rate, meta);
            if (status === "below") sentence += `, abaixo da meta de ${meta}%`;
            else if (status === "above") sentence += `, acima da meta de ${meta}%`;
            else sentence += `, próximo da meta de ${meta}%`;
        }
        sentence += ".";
        proseParts.push(sentence);
    }

    // Diagnosis — find worst gaps and regressions
    const diagnosisLines: { text: string; color: string }[] = [];
    let worstGap: { key: string; label: string; rate: number; meta: number; gap: number } | null = null;
    const regressions: string[] = [];

    for (let i = 1; i < stages.length; i++) {
        const cur = stages[i];
        const comp = comparisonStages.find((c) => c.key === cur.key);
        if (cur.rateFromPrev == null) continue;
        if (cur.meta != null) {
            const gap = cur.meta - cur.rateFromPrev;
            if (gap > 0 && (worstGap == null || gap > worstGap.gap)) {
                worstGap = {
                    key: cur.key,
                    label: TRANSITION_TEXT[`${stages[i - 1].key}→${cur.key}`]?.subject || cur.label,
                    rate: cur.rateFromPrev,
                    meta: cur.meta,
                    gap,
                };
            }
        }
        if (comp?.rateFromPrev != null) {
            const delta = cur.rateFromPrev - comp.rateFromPrev;
            if (delta <= -5) {
                regressions.push(
                    `${TRANSITION_TEXT[`${stages[i - 1].key}→${cur.key}`]?.subject || cur.label} caiu ${Math.abs(delta).toFixed(1)} p.p. em relação a ${periodoAnteriorLabel.toLowerCase()}`,
                );
            }
        }
    }

    // Entrada volume comparison
    const entradaComp = comparisonStages.find((c) => c.key === entrada.key);
    if (entradaComp) {
        const vol = entrada.count - entradaComp.count;
        if (Math.abs(vol) >= Math.max(5, entradaComp.count * 0.15)) {
            diagnosisLines.push({
                text: `Volume de entrada ${vol < 0 ? "caiu" : "subiu"} ${fmtNumber(Math.abs(vol))} pessoas em relação a ${periodoAnteriorLabel.toLowerCase()} (${fmtNumber(entradaComp.count)} → ${fmtNumber(entrada.count)}).`,
                color: vol < 0 ? T.red : T.green,
            });
        }
    }

    if (worstGap) {
        diagnosisLines.push({
            text: `Gargalo principal: ${worstGap.label} está em ${worstGap.rate.toFixed(1)}% (meta ${worstGap.meta}%, gap de ${worstGap.gap.toFixed(1)} p.p.).`,
            color: T.red,
        });
    }
    for (const r of regressions) {
        diagnosisLines.push({ text: r, color: T.orange });
    }
    if (diagnosisLines.length === 0) {
        diagnosisLines.push({
            text: "Taxas dentro ou acima das metas e sem quedas significativas vs. período anterior.",
            color: T.green,
        });
    }

    // Suggestions — from the worst gap + any regressed stages
    const suggestionKeys = new Set<string>();
    if (worstGap) suggestionKeys.add(worstGap.key);
    for (let i = 1; i < stages.length; i++) {
        const cur = stages[i];
        const comp = comparisonStages.find((c) => c.key === cur.key);
        if (cur.rateFromPrev != null && comp?.rateFromPrev != null &&
            (cur.rateFromPrev - comp.rateFromPrev) <= -5) {
            suggestionKeys.add(cur.key);
        }
    }
    const suggestions: string[] = [];
    for (const k of suggestionKeys) {
        const pool = SUGGESTION_BY_STAGE[k] || [];
        for (const s of pool) suggestions.push(s);
    }

    return { prose: proseParts.join(" "), diagnosisLines, suggestions };
}

function verbFor(key: string): string {
    switch (key) {
        case "agendou": return "marcaram a primeira reunião";
        case "realizou": return "tiveram essa reunião de fato";
        case "qualificou": return "foram qualificadas para o Closer";
        case "agCloser": return "tiveram reunião Closer marcada";
        case "realizouCloser": return "tiveram reunião Closer realizada";
        case "vendeu": return "viraram venda fechada";
        default: return "avançaram";
    }
}

type TrendEmphasis = "negative" | "positive" | "neutral";

function TrendBadge({
    delta,
    emphasis,
    isNew,
}: {
    delta: number;
    emphasis: TrendEmphasis;
    isNew?: boolean;
}) {
    if (isNew) {
        return (
            <span style={{ color: T.gold, fontSize: 10, fontFamily: "monospace", marginLeft: 6, fontWeight: 700 }}>
                NOVO
            </span>
        );
    }
    if (delta === 0) {
        return (
            <span style={{ color: T.muted, fontSize: 10, fontFamily: "monospace", marginLeft: 6 }}>
                ~
            </span>
        );
    }
    const goingUp = delta > 0;
    // emphasis determines whether up or down is colored green/red/neutral
    let color = T.muted;
    if (emphasis === "negative") {
        color = goingUp ? T.red : T.green;
    } else if (emphasis === "positive") {
        color = goingUp ? T.green : T.red;
    }
    const arrow = goingUp ? "▲" : "▼";
    return (
        <span style={{ color, fontSize: 10, fontFamily: "monospace", marginLeft: 6, fontWeight: 600 }}>
            {arrow} {goingUp ? "+" : ""}{delta}
        </span>
    );
}

function BreakdownRow({
    label,
    count,
    prevCount,
    emphasis,
}: {
    label: string;
    count: number;
    prevCount: number | null;
    emphasis: TrendEmphasis;
}) {
    const isNew = prevCount === null || prevCount === 0;
    const delta = prevCount == null ? count : count - prevCount;
    return (
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
            <span style={{ whiteSpace: "nowrap" }}>
                <span style={{ fontFamily: "monospace", color: T.cream }}>{fmtNumber(count)}</span>
                <TrendBadge delta={delta} emphasis={emphasis} isNew={isNew && count > 0 && prevCount === 0} />
            </span>
        </div>
    );
}

function DropoutView({
    fromStage,
    toStage,
    fromStagePrev,
    toStagePrev,
    onOpenDeals,
}: {
    fromStage: StageStats;
    toStage: StageStats;
    fromStagePrev?: StageStats;
    toStagePrev?: StageStats;
    onOpenDeals: (title: string, deals: any[]) => void;
}) {
    const dropout = useMemo(() => computeDropout(fromStage, toStage), [fromStage, toStage]);
    const dropoutPrev = useMemo(
        () => (fromStagePrev && toStagePrev ? computeDropout(fromStagePrev, toStagePrev) : null),
        [fromStagePrev, toStagePrev],
    );
    if (dropout.total === 0) return null;
    const lookupPrev = (key: string, from: "stage" | "reason"): number | null => {
        if (!dropoutPrev) return null;
        const source = from === "stage" ? dropoutPrev.stillOpen.byStage : dropoutPrev.lost.byReason;
        const found = source.find((b) => b.key === key);
        return found ? found.count : 0;
    };

    const fromLabel = fromStage.label.toLowerCase();
    const notAdvanced = toStage.label.toLowerCase();

    const totalPrev = dropoutPrev?.total ?? null;
    const totalDelta = totalPrev == null ? 0 : dropout.total - totalPrev;

    return (
        <div
            style={{
                marginTop: 16,
                background: T.card,
                border: `1px solid ${T.border}`,
                borderRadius: 12,
                padding: "18px 22px",
            }}
        >
            <div style={{ fontSize: 10, color: T.muted, letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 700, marginBottom: 10 }}>
                O que aconteceu com os demais
            </div>
            <div style={{ fontSize: 13, color: T.cream, lineHeight: 1.7, marginBottom: 12 }}>
                Dos <strong style={{ color: T.white }}>{fmtNumber(fromStage.count)}</strong> em{" "}
                <em>{fromLabel}</em>,{" "}
                <strong style={{ color: T.white }}>{fmtNumber(dropout.total)}</strong> não avançaram para{" "}
                <em>{notAdvanced}</em>.
                {totalPrev != null && (
                    <span style={{ color: T.muted, marginLeft: 8, fontSize: 11 }}>
                        (período anterior: {fmtNumber(totalPrev)}
                        <TrendBadge delta={totalDelta} emphasis="negative" />)
                    </span>
                )}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                {/* Still open */}
                {dropout.stillOpen.total > 0 && (
                    <div>
                        <button
                            onClick={() => onOpenDeals(`Ainda ativas — ${fromStage.label}`, dropout.stillOpen.deals)}
                            style={{
                                background: "transparent", border: "none", padding: 0, cursor: "pointer",
                                fontFamily: "inherit", color: "inherit", textAlign: "left", width: "100%",
                            }}
                        >
                            <div style={{ fontSize: 11, color: T.muted, marginBottom: 4 }}>
                                <span style={{ color: T.green, marginRight: 6 }}>●</span>
                                Ainda ativas (em contato)
                            </div>
                            <div style={{ fontSize: 20, color: T.white, fontWeight: 700, fontFamily: "monospace", marginBottom: 6 }}>
                                {fmtNumber(dropout.stillOpen.total)}
                                {dropoutPrev && (
                                    <TrendBadge
                                        delta={dropout.stillOpen.total - dropoutPrev.stillOpen.total}
                                        emphasis="neutral"
                                    />
                                )}
                            </div>
                        </button>
                        <div style={{ fontSize: 11, color: T.muted, lineHeight: 1.7 }}>
                            {dropout.stillOpen.byStage.slice(0, 5).map((b) => (
                                <BreakdownRow
                                    key={b.key}
                                    label={b.label}
                                    count={b.count}
                                    prevCount={lookupPrev(b.key, "stage")}
                                    emphasis="neutral"
                                />
                            ))}
                            {dropout.stillOpen.byStage.length > 5 && (
                                <div style={{ fontStyle: "italic", color: T.muted, marginTop: 2 }}>
                                    +{dropout.stillOpen.byStage.length - 5} outros stages
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Lost */}
                {dropout.lost.total > 0 && (
                    <div>
                        <button
                            onClick={() => onOpenDeals(`Perdidas — ${fromStage.label}`, dropout.lost.deals)}
                            style={{
                                background: "transparent", border: "none", padding: 0, cursor: "pointer",
                                fontFamily: "inherit", color: "inherit", textAlign: "left", width: "100%",
                            }}
                        >
                            <div style={{ fontSize: 11, color: T.muted, marginBottom: 4 }}>
                                <span style={{ color: T.red, marginRight: 6 }}>●</span>
                                Perdidas (Lost)
                            </div>
                            <div style={{ fontSize: 20, color: T.white, fontWeight: 700, fontFamily: "monospace", marginBottom: 6 }}>
                                {fmtNumber(dropout.lost.total)}
                                {dropoutPrev && (
                                    <TrendBadge
                                        delta={dropout.lost.total - dropoutPrev.lost.total}
                                        emphasis="negative"
                                    />
                                )}
                            </div>
                        </button>
                        <div style={{ fontSize: 11, color: T.muted, lineHeight: 1.7 }}>
                            {dropout.lost.byReason.length === 0 ? (
                                <div style={{ fontStyle: "italic" }}>Sem motivo registrado</div>
                            ) : (
                                <>
                                    {dropout.lost.byReason.slice(0, 5).map((b) => (
                                        <BreakdownRow
                                            key={b.key}
                                            label={b.label}
                                            count={b.count}
                                            prevCount={lookupPrev(b.key, "reason")}
                                            emphasis="negative"
                                        />
                                    ))}
                                    {dropout.lost.byReason.length > 5 && (
                                        <div style={{ fontStyle: "italic", color: T.muted, marginTop: 2 }}>
                                            +{dropout.lost.byReason.length - 5} outros motivos
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

function DropoutNarrative({
    fromStage,
    toStage,
    fromStagePrev,
    toStagePrev,
}: {
    fromStage: StageStats;
    toStage: StageStats;
    fromStagePrev?: StageStats;
    toStagePrev?: StageStats;
}) {
    const dropout = useMemo(() => computeDropout(fromStage, toStage), [fromStage, toStage]);
    const dropoutPrev = useMemo(
        () => (fromStagePrev && toStagePrev ? computeDropout(fromStagePrev, toStagePrev) : null),
        [fromStagePrev, toStagePrev],
    );
    if (dropout.total === 0) return null;

    const topLostReason = dropout.lost.byReason[0];
    const topOpenStage = dropout.stillOpen.byStage[0];

    const topLostPrev =
        topLostReason && dropoutPrev
            ? dropoutPrev.lost.byReason.find((r) => r.key === topLostReason.key)?.count ?? 0
            : null;
    const topOpenPrev =
        topOpenStage && dropoutPrev
            ? dropoutPrev.stillOpen.byStage.find((s) => s.key === topOpenStage.key)?.count ?? 0
            : null;

    const lostDelta = dropoutPrev ? dropout.lost.total - dropoutPrev.lost.total : null;
    const openDelta = dropoutPrev ? dropout.stillOpen.total - dropoutPrev.stillOpen.total : null;

    return (
        <div
            style={{
                background: T.card,
                border: `1px solid ${T.border}`,
                borderRadius: 12,
                padding: "18px 22px",
            }}
        >
            <div style={{ fontSize: 10, color: T.muted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
                O que aconteceu com os demais
            </div>
            <div style={{ fontSize: 14, color: T.cream, lineHeight: 1.75 }}>
                Dos <strong style={{ color: T.white }}>{fmtNumber(fromStage.count)}</strong> em <em>{fromStage.label.toLowerCase()}</em>,{" "}
                <strong style={{ color: T.white }}>{fmtNumber(dropout.total)}</strong> não seguiram para <em>{toStage.label.toLowerCase()}</em>.
                {" "}
                {dropout.stillOpen.total > 0 && (
                    <>
                        <strong style={{ color: T.white }}>{fmtNumber(dropout.stillOpen.total)}</strong> ainda estão ativas
                        {openDelta != null && <TrendBadge delta={openDelta} emphasis="neutral" />}
                        {topOpenStage && (
                            <>
                                {" "}(a maioria em <em>{topOpenStage.label}</em>, {fmtNumber(topOpenStage.count)}
                                {topOpenPrev != null && <TrendBadge delta={topOpenStage.count - topOpenPrev} emphasis="neutral" isNew={topOpenPrev === 0} />})
                            </>
                        )}
                        .{" "}
                    </>
                )}
                {dropout.lost.total > 0 && (
                    <>
                        <strong style={{ color: T.red }}>{fmtNumber(dropout.lost.total)}</strong> foram marcadas como perdidas
                        {lostDelta != null && <TrendBadge delta={lostDelta} emphasis="negative" />}
                        {topLostReason && (
                            <>
                                {" "}(motivo mais comum: <em>{topLostReason.label}</em>, {fmtNumber(topLostReason.count)}
                                {topLostPrev != null && <TrendBadge delta={topLostReason.count - topLostPrev} emphasis="negative" isNew={topLostPrev === 0} />})
                            </>
                        )}
                        .
                    </>
                )}
            </div>
        </div>
    );
}

function ClosingBox({
    stages,
    comparisonStages,
    periodoLabel,
    periodoAnteriorLabel,
    subViewTitle,
}: {
    stages: StageStats[];
    comparisonStages: StageStats[];
    periodoLabel: string;
    periodoAnteriorLabel: string;
    subViewTitle: string;
}) {
    const closing = useMemo(
        () => buildClosing(stages, comparisonStages, periodoLabel, periodoAnteriorLabel),
        [stages, comparisonStages, periodoLabel, periodoAnteriorLabel],
    );
    if (!closing.prose) return null;

    return (
        <div
            style={{
                marginTop: 24,
                background: T.card,
                border: `1px solid ${T.border}`,
                borderLeft: `3px solid ${T.gold}`,
                borderRadius: 12,
                padding: "22px 26px",
            }}
        >
            <div
                style={{
                    fontSize: 10,
                    color: T.gold,
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    fontWeight: 700,
                    marginBottom: 10,
                }}
            >
                Resumo · {subViewTitle}
            </div>

            <p style={{ fontSize: 14, color: T.cream, lineHeight: 1.8, margin: 0 }}>
                {closing.prose}
            </p>

            <div style={{ marginTop: 18 }}>
                <div
                    style={{
                        fontSize: 10,
                        color: T.muted,
                        letterSpacing: "0.08em",
                        textTransform: "uppercase",
                        fontWeight: 700,
                        marginBottom: 8,
                    }}
                >
                    Diagnóstico
                </div>
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.7 }}>
                    {closing.diagnosisLines.map((line, i) => (
                        <li key={i} style={{ color: T.cream, marginBottom: 4 }}>
                            <span style={{ color: line.color, marginRight: 6 }}>●</span>
                            {line.text}
                        </li>
                    ))}
                </ul>
            </div>

            {closing.suggestions.length > 0 && (
                <div style={{ marginTop: 16 }}>
                    <div
                        style={{
                            fontSize: 10,
                            color: T.muted,
                            letterSpacing: "0.08em",
                            textTransform: "uppercase",
                            fontWeight: 700,
                            marginBottom: 8,
                        }}
                    >
                        Sugestões de ação
                    </div>
                    <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.7 }}>
                        {closing.suggestions.map((s, i) => (
                            <li key={i} style={{ color: T.cream, marginBottom: 4 }}>
                                {s}
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
}

function StageList({
    stages,
    comparisonStages,
    onOpenModal,
    onOpenDeepDive,
}: {
    stages: StageStats[];
    comparisonStages?: StageStats[];
    onOpenModal: (stage: StageStats) => void;
    onOpenDeepDive: (stage: StageStats) => void;
}) {
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {stages.map((s, i) => (
                <StageCard
                    key={s.key}
                    stage={s}
                    prevStage={i > 0 ? stages[i - 1] : undefined}
                    comparison={comparisonStages?.find((c) => c.key === s.key)}
                    isFirst={i === 0}
                    onOpenModal={onOpenModal}
                    onOpenDeepDive={onOpenDeepDive}
                />
            ))}
        </div>
    );
}

function SubViewNav({ active, onChange }: { active: SubView; onChange: (v: SubView) => void }) {
    return (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
            {SUBVIEWS.map((v) => {
                const isActive = v.id === active;
                return (
                    <button
                        key={v.id}
                        onClick={() => onChange(v.id)}
                        style={{
                            background: isActive ? T.berry : "transparent",
                            border: `1px solid ${isActive ? T.berry : T.border}`,
                            color: isActive ? T.white : T.muted,
                            padding: "10px 16px",
                            borderRadius: 8,
                            fontSize: 13,
                            fontWeight: 600,
                            cursor: "pointer",
                            fontFamily: "inherit",
                            transition: "all 0.15s ease",
                        }}
                    >
                        {v.title}
                    </button>
                );
            })}
        </div>
    );
}

function ModeToggle({ mode, onChange }: { mode: JornadaMode; onChange: (m: JornadaMode) => void }) {
    const opts: { id: JornadaMode; label: string; help: string }[] = [
        { id: "coorte", label: "Coorte", help: "Pessoas que entraram no período e onde elas estão hoje" },
        { id: "evento", label: "Evento", help: "Eventos (reuniões, vendas) que aconteceram no período" },
    ];
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ display: "flex", gap: 0 }}>
                {opts.map((o, i) => (
                    <button
                        key={o.id}
                        onClick={() => onChange(o.id)}
                        title={o.help}
                        style={{
                            background: mode === o.id ? T.gold : "transparent",
                            color: mode === o.id ? T.bg : T.muted,
                            border: `1px solid ${T.border}`,
                            borderRight: i === 0 ? "none" : `1px solid ${T.border}`,
                            borderRadius: i === 0 ? "6px 0 0 6px" : "0 6px 6px 0",
                            padding: "9px 16px",
                            minHeight: 36,
                            fontSize: 11,
                            fontWeight: 700,
                            cursor: "pointer",
                            fontFamily: "inherit",
                            letterSpacing: "0.05em",
                            textTransform: "uppercase",
                        }}
                    >
                        {o.label}
                    </button>
                ))}
            </div>
            <div style={{ fontSize: 10, color: T.muted, maxWidth: 280, textAlign: "right" }}>
                {opts.find((o) => o.id === mode)?.help}
            </div>
        </div>
    );
}

function PeriodPicker({
    preset,
    onChange,
    customStart,
    customEnd,
    onCustomChange,
}: {
    preset: PeriodPreset;
    onChange: (p: PeriodPreset) => void;
    customStart: string;
    customEnd: string;
    onCustomChange: (start: string, end: string) => void;
}) {
    const inputStyle: React.CSSProperties = {
        background: T.surface,
        color: T.white,
        border: `1px solid ${T.border}`,
        borderRadius: 6,
        padding: "6px 10px",
        fontSize: 12,
        fontFamily: "inherit",
        cursor: "pointer",
        colorScheme: "dark",
    };
    return (
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <div style={{ display: "flex", gap: 0 }}>
                {PERIOD_PRESETS.map((p, i) => (
                    <button
                        key={p.id}
                        onClick={() => onChange(p.id)}
                        style={{
                            background: preset === p.id ? T.surface : "transparent",
                            color: preset === p.id ? T.white : T.muted,
                            border: `1px solid ${T.border}`,
                            borderLeft: i === 0 ? `1px solid ${T.border}` : "none",
                            borderRadius:
                                i === 0
                                    ? "6px 0 0 6px"
                                    : i === PERIOD_PRESETS.length - 1
                                        ? "0 6px 6px 0"
                                        : "0",
                            padding: "10px 16px",
                            minHeight: 38,
                            fontSize: 12,
                            fontWeight: 600,
                            cursor: "pointer",
                            fontFamily: "inherit",
                        }}
                    >
                        {p.label}
                    </button>
                ))}
            </div>
            {preset === "personalizado" && (
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <input
                        type="date"
                        value={customStart}
                        max={customEnd}
                        onChange={(e) => onCustomChange(e.target.value, customEnd)}
                        style={inputStyle}
                    />
                    <span style={{ color: T.muted, fontSize: 11 }}>até</span>
                    <input
                        type="date"
                        value={customEnd}
                        min={customStart}
                        onChange={(e) => onCustomChange(customStart, e.target.value)}
                        style={inputStyle}
                    />
                </div>
            )}
        </div>
    );
}

function rateStatus(rate: number, meta: number): "above" | "within" | "below" {
    if (rate >= meta) return "above";
    if (rate >= meta * 0.85) return "within";
    return "below";
}

const SHORT_STAGE_LABEL: Record<string, string> = {
    entrada: "Entrada",
    agendou: "Ag. 1ª",
    realizou: "Real. 1ª",
    qualificou: "Qualif.",
    agCloser: "Ag. Closer",
    realizouCloser: "Real. Closer",
    vendeu: "Venda",
};

function MiniFunnel({
    stages,
    comparisonStages,
    periodoAnteriorLabel,
    onClickStage,
}: {
    stages: StageStats[];
    comparisonStages: StageStats[];
    periodoAnteriorLabel: string;
    onClickStage: (subView: SubView) => void;
}) {
    const stageToSubview = (key: string): SubView => {
        if (key === "entrada" || key === "agendou") return "entrada-sdr";
        if (key === "realizou" || key === "qualificou" || key === "agCloser") return "sdr-closer";
        return "closer-venda";
    };

    return (
        <div
            style={{
                background: T.surface,
                border: `1px solid ${T.border}`,
                borderRadius: 10,
                padding: "16px 18px",
                marginBottom: 20,
            }}
        >
            <div style={{ display: "flex", alignItems: "stretch", gap: 0, flexWrap: "nowrap", overflowX: "auto" }}>
                {stages.map((s, i) => {
                    const prev = i > 0 ? stages[i - 1] : null;
                    const prevDenom = prev ? (prev.pastCount != null ? prev.pastCount : prev.count) : 0;
                    const rate = prev && prevDenom > 0 ? (s.count / prevDenom) * 100 : null;
                    const status = rate != null && s.meta != null ? rateStatus(rate, s.meta) : null;
                    const rateColor = status ? STATUS_COLOR[status] : T.muted;
                    const respColor = RESP_COLOR[s.responsavel] || T.muted;
                    const compStage = comparisonStages.find((c) => c.key === s.key);
                    return (
                        <div key={s.key} style={{ display: "flex", alignItems: "stretch", flex: "1 1 0" }}>
                            {/* Arrow + rate between stages */}
                            {i > 0 && (
                                <div
                                    style={{
                                        display: "flex",
                                        flexDirection: "column",
                                        justifyContent: "center",
                                        alignItems: "center",
                                        minWidth: 44,
                                        color: T.muted,
                                    }}
                                >
                                    <div style={{ fontSize: 11, color: rateColor, fontFamily: "monospace", fontWeight: 700, display: "flex", alignItems: "baseline", gap: 3 }}>
                                        {status && (
                                            <span aria-hidden="true" style={{ fontSize: 9 }}>
                                                {STATUS_GLYPH[status]}
                                            </span>
                                        )}
                                        {rate != null ? `${rate.toFixed(1)}%` : "—"}
                                    </div>
                                    <div aria-hidden="true" style={{ fontSize: 14, color: T.border, lineHeight: 0.5, marginTop: 2 }}>
                                        ▸
                                    </div>
                                </div>
                            )}
                            {/* Stage node */}
                            <button
                                onClick={() => onClickStage(stageToSubview(s.key))}
                                style={{
                                    flex: "1 1 0",
                                    background: "transparent",
                                    border: "none",
                                    padding: "4px 6px",
                                    cursor: "pointer",
                                    fontFamily: "inherit",
                                    color: "inherit",
                                    textAlign: "center",
                                    minWidth: 70,
                                }}
                                title={`${s.label} · ${s.responsavel}${compStage ? ` · anterior: ${fmtNumber(compStage.count)}` : ""}`}
                            >
                                <div
                                    style={{
                                        fontSize: 9,
                                        color: respColor,
                                        letterSpacing: "0.05em",
                                        textTransform: "uppercase",
                                        fontWeight: 700,
                                        marginBottom: 4,
                                    }}
                                >
                                    {SHORT_STAGE_LABEL[s.key] ?? s.key}
                                </div>
                                <div
                                    style={{
                                        fontSize: 20,
                                        color: T.white,
                                        fontFamily: "monospace",
                                        fontWeight: 700,
                                        lineHeight: 1.1,
                                    }}
                                >
                                    {fmtNumber(s.count)}
                                </div>
                                {s.futureCount != null && s.futureCount > 0 && (
                                    <div style={{ fontSize: 9, color: T.gold, marginTop: 2 }}>
                                        +{fmtNumber(s.futureCount)} pend.
                                    </div>
                                )}
                                {compStage && (
                                    <div style={{ fontSize: 10, color: T.muted, fontFamily: "monospace", marginTop: 3 }}>
                                        {fmtNumber(compStage.count)} ant.
                                    </div>
                                )}
                            </button>
                        </div>
                    );
                })}
            </div>

            {/* End-to-end summary line */}
            <div
                style={{
                    marginTop: 14,
                    paddingTop: 12,
                    borderTop: `1px dashed ${T.border}`,
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "baseline",
                    gap: 12,
                    flexWrap: "wrap",
                    fontSize: 11,
                    color: T.muted,
                }}
            >
                <div>
                    De <span style={{ color: T.white, fontWeight: 700, fontFamily: "monospace" }}>{fmtNumber(stages[0]?.count ?? 0)}</span>{" "}
                    pessoas,{" "}
                    <span style={{ color: T.white, fontWeight: 700, fontFamily: "monospace" }}>
                        {fmtNumber(stages[stages.length - 1]?.count ?? 0)}
                    </span>{" "}
                    viraram venda.
                </div>
                <div>
                    {(() => {
                        const first = stages[0];
                        const last = stages[stages.length - 1];
                        if (!first || !last || first.count === 0) return null;
                        const overall = (last.count / first.count) * 100;
                        const target = targetRateBetween(stages, "entrada", "vendeu");
                        return (
                            <>
                                Conversão ponta-a-ponta:{" "}
                                <span style={{ color: T.cream, fontFamily: "monospace", fontWeight: 700 }}>
                                    {overall.toFixed(2)}%
                                </span>
                                {target != null && (
                                    <span style={{ color: T.muted, fontFamily: "monospace" }}>
                                        {" "}· meta {target.toFixed(2)}%
                                    </span>
                                )}
                            </>
                        );
                    })()}
                </div>
                <div style={{ fontSize: 10, color: T.muted }}>
                    Cinza = {periodoAnteriorLabel}
                </div>
            </div>
        </div>
    );
}

function HeadlineStrip({
    stages,
    comparisonStages,
    periodoAnteriorLabel,
    onClickSegment,
}: {
    stages: StageStats[];
    comparisonStages: StageStats[];
    periodoAnteriorLabel: string;
    onClickSegment: (v: SubView) => void;
}) {
    const segs = SUBVIEWS.filter((v) => v.id !== "completa").map((v) => {
        const fromIdx = stages.findIndex((s) => s.key === v.stageRange[0]);
        const toIdx = stages.findIndex((s) => s.key === v.stageRange[1]);
        const a = stages[fromIdx];
        const b = stages[toIdx];
        // When the start is a scheduling stage, only past meetings are reachable for conversion.
        const aDenom = a?.pastCount != null ? a.pastCount : a?.count ?? 0;
        const rate = a && b && aDenom > 0 ? (b.count / aDenom) * 100 : null;
        const target = targetRateBetween(stages, v.stageRange[0], v.stageRange[1]);
        const status = rate != null && target != null ? rateStatus(rate, target) : null;

        const aPrev = comparisonStages.find((c) => c.key === v.stageRange[0]);
        const bPrev = comparisonStages.find((c) => c.key === v.stageRange[1]);
        const aPrevDenom = aPrev?.pastCount != null ? aPrev.pastCount : aPrev?.count ?? 0;
        const ratePrev = aPrev && bPrev && aPrevDenom > 0 ? (bPrev.count / aPrevDenom) * 100 : null;
        const delta = rate != null && ratePrev != null ? rate - ratePrev : null;

        return { v, a, b, rate, target, status, aPrev, bPrev, ratePrev, delta, aDenom };
    });

    return (
        <div
            style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr",
                gap: 8,
                marginBottom: 20,
            }}
        >
            {segs.map(({ v, a, b, rate, target, status, aPrev, bPrev, ratePrev, delta }) => {
                const rateColor = status ? STATUS_COLOR[status] : T.gold;
                const deltaColor = delta == null ? T.muted : delta >= 0 ? T.green : T.red;
                return (
                    <button
                        key={v.id}
                        onClick={() => onClickSegment(v.id)}
                        style={{
                            background: T.surface,
                            border: `1px solid ${T.border}`,
                            borderRadius: 8,
                            padding: "12px 16px",
                            textAlign: "left",
                            cursor: "pointer",
                            fontFamily: "inherit",
                            color: "inherit",
                        }}
                    >
                        <div
                            style={{
                                fontSize: 10,
                                color: T.muted,
                                letterSpacing: "0.06em",
                                textTransform: "uppercase",
                                marginBottom: 6,
                            }}
                        >
                            {v.title}
                        </div>
                        <div style={{ fontSize: 16, color: T.white, fontWeight: 700, fontFamily: "monospace" }}>
                            {a && a.pastCount != null && a.futureCount != null && a.futureCount > 0 ? (
                                <>
                                    {fmtNumber(a.pastCount)}
                                    <span style={{ color: T.muted, fontWeight: 400, fontSize: 12 }}>
                                        /{fmtNumber(a.count)}
                                    </span>
                                </>
                            ) : (
                                a ? fmtNumber(a.count) : "—"
                            )}
                            {" → "}
                            {b ? fmtNumber(b.count) : "—"}
                        </div>
                        {a && a.futureCount != null && a.futureCount > 0 && (
                            <div style={{ fontSize: 10, color: T.muted, marginTop: 2 }}>
                                {fmtNumber(a.futureCount)} ainda {a.futureCount === 1 ? "vai acontecer" : "vão acontecer"}
                            </div>
                        )}
                        <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 2 }}>
                            <span style={{ fontSize: 13, color: rateColor, fontFamily: "monospace", fontWeight: 700 }}>
                                {fmtRate(rate)}
                            </span>
                            {target != null && (
                                <span style={{ fontSize: 11, color: T.muted, fontFamily: "monospace" }}>
                                    meta {target.toFixed(1)}%
                                </span>
                            )}
                        </div>
                        <div
                            style={{
                                marginTop: 8,
                                paddingTop: 8,
                                borderTop: `1px dashed ${T.border}`,
                                fontSize: 10,
                                color: T.muted,
                                lineHeight: 1.5,
                            }}
                        >
                            <div>
                                {periodoAnteriorLabel}:{" "}
                                <span style={{ fontFamily: "monospace", color: T.cream }}>
                                    {aPrev ? fmtNumber(aPrev.count) : "—"} → {bPrev ? fmtNumber(bPrev.count) : "—"}
                                </span>
                                {ratePrev != null && (
                                    <span style={{ fontFamily: "monospace", color: T.muted }}>
                                        {" "}({ratePrev.toFixed(1)}%)
                                    </span>
                                )}
                            </div>
                            {delta != null && (
                                <div style={{ color: deltaColor, fontFamily: "monospace", fontWeight: 600 }}>
                                    {delta >= 0 ? "▲" : "▼"} {delta >= 0 ? "+" : ""}{delta.toFixed(1)} p.p.
                                </div>
                            )}
                        </div>
                    </button>
                );
            })}
        </div>
    );
}

export function JornadaTab({ allDeals }: JornadaTabProps) {
    const [activeView, setActiveView] = useState<SubView>("entrada-sdr");
    const [mode, setMode] = useState<JornadaMode>("coorte");
    const [preset, setPreset] = useState<PeriodPreset>("mes-corrente");
    const [customStart, setCustomStart] = useState<string>(firstOfMonthStr);
    const [customEnd, setCustomEnd] = useState<string>(todayStr);
    const [modalStage, setModalStage] = useState<StageStats | null>(null);
    const [deepDiveStage, setDeepDiveStage] = useState<StageStats | null>(null);
    const [display, setDisplay] = useState<Display>("narrada");

    const wwDeals = useMemo(
        () => allDeals.filter((d) => isInWwLeadsPipeline(d) && !isElopement(d)),
        [allDeals],
    );

    const periodo = useMemo(
        () => (preset === "personalizado" ? buildCustomPeriod(customStart, customEnd) : buildPeriod(preset)),
        [preset, customStart, customEnd],
    );
    const periodoAnterior = useMemo(() => previousPeriod(periodo), [periodo]);

    const jornada = useMemo(() => computeJornada(wwDeals, periodo, mode), [wwDeals, periodo, mode]);
    const jornadaAnterior = useMemo(
        () => computeJornada(wwDeals, periodoAnterior, mode),
        [wwDeals, periodoAnterior, mode],
    );

    const subviewDef = SUBVIEWS.find((v) => v.id === activeView)!;
    const visibleStages =
        activeView === "completa"
            ? jornada.stages
            : sliceStages(jornada.stages, subviewDef.stageRange);
    const visibleStagesAnterior =
        activeView === "completa"
            ? jornadaAnterior.stages
            : sliceStages(jornadaAnterior.stages, subviewDef.stageRange);

    return (
        <div style={{ padding: "8px 4px", maxWidth: 980, margin: "0 auto" }}>
            <div
                style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    marginBottom: 18,
                    gap: 16,
                    flexWrap: "wrap",
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
                        Jornada do Lead
                    </h1>
                    <div style={{ fontSize: 12, color: T.muted }}>
                        {periodo.label} · responsabilidade de cada número visível em todas as etapas
                    </div>
                </div>
                <ModeToggle mode={mode} onChange={setMode} />
            </div>

            <div style={{ marginBottom: 18 }}>
                <PeriodPicker
                    preset={preset}
                    onChange={setPreset}
                    customStart={customStart}
                    customEnd={customEnd}
                    onCustomChange={(s, e) => { setCustomStart(s); setCustomEnd(e); }}
                />
            </div>

            <MiniFunnel
                stages={jornada.stages}
                comparisonStages={jornadaAnterior.stages}
                periodoAnteriorLabel={periodoAnterior.label}
                onClickStage={setActiveView}
            />

            <SubViewNav active={activeView} onChange={setActiveView} />

            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 14 }}>
                <div style={{ display: "flex", gap: 0 }}>
                    {(["narrada", "detalhada"] as Display[]).map((d, i) => (
                        <button
                            key={d}
                            onClick={() => setDisplay(d)}
                            style={{
                                background: display === d ? T.surface : "transparent",
                                color: display === d ? T.white : T.muted,
                                border: `1px solid ${T.border}`,
                                borderLeft: i === 0 ? `1px solid ${T.border}` : "none",
                                borderRadius: i === 0 ? "6px 0 0 6px" : "0 6px 6px 0",
                                padding: "9px 16px",
                                minHeight: 36,
                                fontSize: 11,
                                fontWeight: 600,
                                cursor: "pointer",
                                fontFamily: "inherit",
                                letterSpacing: "0.05em",
                                textTransform: "uppercase",
                            }}
                        >
                            {d}
                        </button>
                    ))}
                </div>
            </div>

            <div
                style={{
                    background: T.surface,
                    border: `1px solid ${T.border}`,
                    borderRadius: 12,
                    padding: "20px 24px",
                    marginBottom: 16,
                }}
            >
                <h2
                    style={{
                        fontSize: 18,
                        color: T.white,
                        fontWeight: 700,
                        margin: 0,
                        marginBottom: 4,
                    }}
                >
                    {subviewDef.title}
                </h2>
                <div style={{ fontSize: 13, color: T.muted }}>{subviewDef.subtitle}</div>
            </div>

            {display === "detalhada" ? (
                <StageList
                    stages={visibleStages}
                    comparisonStages={visibleStagesAnterior}
                    onOpenModal={(s) => setModalStage(s)}
                    onOpenDeepDive={(s) => setDeepDiveStage(s)}
                />
            ) : (
                <NarrativeView
                    stages={visibleStages}
                    comparisonStages={visibleStagesAnterior}
                    periodoLabel={periodo.label}
                    periodoAnteriorLabel={periodoAnterior.label}
                />
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 18 }}>
                {visibleStages.slice(0, -1).map((fromStage, i) => {
                    const toStage = visibleStages[i + 1];
                    const fromStagePrev = visibleStagesAnterior.find((s) => s.key === fromStage.key);
                    const toStagePrev = visibleStagesAnterior.find((s) => s.key === toStage.key);
                    if (display === "detalhada") {
                        return (
                            <DropoutView
                                key={`${fromStage.key}-${toStage.key}`}
                                fromStage={fromStage}
                                toStage={toStage}
                                fromStagePrev={fromStagePrev}
                                toStagePrev={toStagePrev}
                                onOpenDeals={(title, deals) => {
                                    setModalStage({
                                        key: fromStage.key,
                                        label: title,
                                        responsavel: fromStage.responsavel,
                                        count: deals.length,
                                        rateFromPrev: null,
                                        deals,
                                    });
                                }}
                            />
                        );
                    }
                    return (
                        <DropoutNarrative
                            key={`${fromStage.key}-${toStage.key}`}
                            fromStage={fromStage}
                            toStage={toStage}
                            fromStagePrev={fromStagePrev}
                            toStagePrev={toStagePrev}
                        />
                    );
                })}
            </div>

            <StageChart
                deals={wwDeals}
                periodo={periodo}
                periodoAnterior={periodoAnterior}
                stageRange={activeView === "completa" ? ["entrada", "vendeu"] : subviewDef.stageRange}
            />

            <ClosingBox
                stages={visibleStages}
                comparisonStages={visibleStagesAnterior}
                periodoLabel={periodo.label}
                periodoAnteriorLabel={periodoAnterior.label}
                subViewTitle={subviewDef.title}
            />

            <DealsModal
                isOpen={modalStage !== null}
                onClose={() => setModalStage(null)}
                title={modalStage ? `${modalStage.label} · ${periodo.label}` : ""}
                deals={modalStage?.deals || []}
            />

            <StageDeepDive
                isOpen={deepDiveStage !== null}
                onClose={() => setDeepDiveStage(null)}
                stage={deepDiveStage}
                stagePrev={deepDiveStage ? jornadaAnterior.stages.find((s) => s.key === deepDiveStage.key) : undefined}
                periodoLabel={periodo.label}
                periodoAnteriorLabel={periodoAnterior.label}
            />

            <div
                style={{
                    marginTop: 20,
                    padding: "14px 18px",
                    background: T.surface,
                    border: `1px solid ${T.border}`,
                    borderRadius: 10,
                    fontSize: 11,
                    color: T.muted,
                    lineHeight: 1.6,
                }}
            >
                <strong style={{ color: T.cream }}>Como ler:</strong>{" "}
                {mode === "coorte" ? (
                    <>
                        <em>Coorte</em> — segue as pessoas que <strong>entraram no período selecionado</strong>{" "}
                        e mostra em que etapa elas estão hoje. Útil para medir conversão real, mas estágios
                        finais podem aparecer baixos quando o período é recente (leads ainda não tiveram tempo
                        de fechar).
                    </>
                ) : (
                    <>
                        <em>Evento</em> — conta os <strong>eventos que aconteceram no período</strong>{" "}
                        (reuniões marcadas, qualificações, vendas), independente de quando o lead entrou. Útil
                        para medir carga operacional e o que aconteceu em cada mês.
                    </>
                )}
            </div>
        </div>
    );
}
