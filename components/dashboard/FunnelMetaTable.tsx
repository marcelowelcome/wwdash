"use client";

import { useState, useMemo } from "react";
import { T } from "./theme";
import { DealsModal } from "./DealsModal";
import { type WonDeal, type FunnelMetrics, type MonthlyTarget } from "@/lib/schemas";
import {
    formatPercent,
    formatCurrency,
    calcAchievement,
    calcShouldBe,
    calcFunnelCVR,
    isInMonth,
    isCreatedInMonth,
    isElopement,
    isInWwPipeline,
    isInWwLeadsPipeline,
    isInWwMqlPipeline,
} from "@/lib/funnel-utils";

type ViewMode = "wedding" | "elopement" | "total";

interface FunnelMetaTableProps {
    deals: WonDeal[];
    year: number;
    month: number;
    target: MonthlyTarget | null;
    previousMetrics: FunnelMetrics | null;
    monthProgress: number;
    cpl: number;
    viewMode?: ViewMode;
}

const FUNNEL_COLUMNS = ["Leads", "MQL", "Agendamento", "Reunioes", "Qualificado", "Closer Agendada", "Closer Realizada", "Vendas"];

type StageKey = "leads" | "mql" | "agendamento" | "reunioes" | "qualificado" | "closerAgendada" | "closerRealizada" | "vendas";

export function FunnelMetaTable({ deals, year, month, target, previousMetrics, monthProgress, cpl, viewMode = "wedding" }: FunnelMetaTableProps) {
    const [modalOpen, setModalOpen] = useState(false);
    const [modalTitle, setModalTitle] = useState("");
    const [modalDeals, setModalDeals] = useState<WonDeal[]>([]);
    const [modalStageKey, setModalStageKey] = useState<StageKey>("leads");

    const getDealsForStage = (stage: StageKey): WonDeal[] => {
        // Elopement mode: only Elopement deals
        if (viewMode === "elopement") {
            const elopDeals = deals.filter((d) => isElopement(d));
            switch (stage) {
                case "leads":
                    return elopDeals.filter((d) => isCreatedInMonth(d.cdate, year, month));
                case "mql":
                    return elopDeals.filter((d) => isCreatedInMonth(d.cdate, year, month));
                case "agendamento":
                    return elopDeals.filter((d) => isInMonth(d.data_reuniao_1, year, month));
                case "reunioes":
                    return elopDeals.filter(
                        (d) =>
                            isInMonth(d.data_reuniao_1, year, month) &&
                            d.como_foi_feita_a_1a_reuniao !== null &&
                            d.como_foi_feita_a_1a_reuniao !== "" &&
                            d.como_foi_feita_a_1a_reuniao !== "Nao teve reuniao"
                    );
                case "qualificado":
                    return elopDeals.filter((d) => isInMonth(d.data_qualificado, year, month));
                case "closerAgendada":
                    return elopDeals.filter((d) => isInMonth(d.data_horario_agendamento_closer, year, month));
                case "closerRealizada":
                    return elopDeals.filter(
                        (d) =>
                            isInMonth(d.data_horario_agendamento_closer, year, month) &&
                            d.reuniao_closer !== null &&
                            d.reuniao_closer !== ""
                    );
                case "vendas":
                    return elopDeals.filter((d) => isInMonth(d.data_fechamento, year, month));
                default:
                    return [];
            }
        }

        // Total mode: all deals (Wedding + Elopement combined)
        if (viewMode === "total") {
            switch (stage) {
                case "leads":
                    return deals.filter((d) => isInWwLeadsPipeline(d) && isCreatedInMonth(d.cdate, year, month));
                case "mql":
                    return deals.filter((d) => isInWwLeadsPipeline(d) && isCreatedInMonth(d.cdate, year, month));
                case "agendamento":
                    return deals.filter((d) => isInMonth(d.data_reuniao_1, year, month));
                case "reunioes":
                    return deals.filter(
                        (d) =>
                            isInMonth(d.data_reuniao_1, year, month) &&
                            d.como_foi_feita_a_1a_reuniao !== null &&
                            d.como_foi_feita_a_1a_reuniao !== "" &&
                            d.como_foi_feita_a_1a_reuniao !== "Nao teve reuniao"
                    );
                case "qualificado":
                    return deals.filter((d) => isInMonth(d.data_qualificado, year, month));
                case "closerAgendada":
                    return deals.filter((d) => isInMonth(d.data_horario_agendamento_closer, year, month));
                case "closerRealizada":
                    return deals.filter(
                        (d) =>
                            isInMonth(d.data_horario_agendamento_closer, year, month) &&
                            d.reuniao_closer !== null &&
                            d.reuniao_closer !== ""
                    );
                case "vendas":
                    return deals.filter((d) => isInMonth(d.data_fechamento, year, month));
                default:
                    return [];
            }
        }

        // Wedding mode: exclude Elopement completely
        const wwDeals = deals.filter((d) => !isElopement(d));
        switch (stage) {
            case "leads":
                return wwDeals.filter((d) => isInWwPipeline(d) && isCreatedInMonth(d.cdate, year, month));
            case "mql":
                return wwDeals.filter((d) => isInWwMqlPipeline(d) && isCreatedInMonth(d.cdate, year, month));
            case "agendamento":
                return wwDeals.filter((d) => isInWwPipeline(d) && isInMonth(d.data_reuniao_1, year, month));
            case "reunioes":
                return wwDeals.filter(
                    (d) =>
                        isInWwPipeline(d) &&
                        isInMonth(d.data_reuniao_1, year, month) &&
                        d.como_foi_feita_a_1a_reuniao !== null &&
                        d.como_foi_feita_a_1a_reuniao !== "" &&
                        d.como_foi_feita_a_1a_reuniao !== "Nao teve reuniao"
                );
            case "qualificado":
                return wwDeals.filter((d) => isInWwPipeline(d) && isInMonth(d.data_qualificado, year, month));
            case "closerAgendada":
                return wwDeals.filter((d) => isInWwPipeline(d) && isInMonth(d.data_horario_agendamento_closer, year, month));
            case "closerRealizada":
                return wwDeals.filter(
                    (d) =>
                        isInWwPipeline(d) &&
                        isInMonth(d.data_horario_agendamento_closer, year, month) &&
                        d.reuniao_closer !== null &&
                        d.reuniao_closer !== ""
                );
            case "vendas":
                return wwDeals.filter((d) => isInMonth(d.data_fechamento, year, month));
            default:
                return [];
        }
    };

    const metrics: FunnelMetrics = useMemo(
        () => ({
            leads: getDealsForStage("leads").length,
            mql: getDealsForStage("mql").length,
            agendamento: getDealsForStage("agendamento").length,
            reunioes: getDealsForStage("reunioes").length,
            qualificado: getDealsForStage("qualificado").length,
            closerAgendada: getDealsForStage("closerAgendada").length,
            closerRealizada: getDealsForStage("closerRealizada").length,
            vendas: getDealsForStage("vendas").length,
        }),
        [deals, year, month, viewMode]
    );

    const cvr = calcFunnelCVR(metrics);
    const prevCvr = previousMetrics ? calcFunnelCVR(previousMetrics) : null;

    const handleStageClick = (stage: StageKey, title: string) => {
        setModalTitle(title);
        setModalDeals(getDealsForStage(stage));
        setModalStageKey(stage);
        setModalOpen(true);
    };

    const defaultTarget: MonthlyTarget = target || {
        month: "",
        pipeline_type: "wedding",
        leads: 0,
        mql: 0,
        agendamento: 0,
        reunioes: 0,
        qualificado: 0,
        closer_agendada: 0,
        closer_realizada: 0,
        vendas: 0,
        cpl: 0,
    };

    const shouldBe = {
        leads: calcShouldBe(defaultTarget.leads, monthProgress),
        mql: calcShouldBe(defaultTarget.mql, monthProgress),
        agendamento: calcShouldBe(defaultTarget.agendamento, monthProgress),
        reunioes: calcShouldBe(defaultTarget.reunioes, monthProgress),
        qualificado: calcShouldBe(defaultTarget.qualificado, monthProgress),
        closerAgendada: calcShouldBe(defaultTarget.closer_agendada, monthProgress),
        closerRealizada: calcShouldBe(defaultTarget.closer_realizada, monthProgress),
        vendas: calcShouldBe(defaultTarget.vendas, monthProgress),
    };

    const planejado = [defaultTarget.leads, defaultTarget.mql, defaultTarget.agendamento, defaultTarget.reunioes, defaultTarget.qualificado, defaultTarget.closer_agendada, defaultTarget.closer_realizada, defaultTarget.vendas];

    const realizado = [metrics.leads, metrics.mql, metrics.agendamento, metrics.reunioes, metrics.qualificado, metrics.closerAgendada, metrics.closerRealizada, metrics.vendas];

    const atingimento = [
        formatPercent(calcAchievement(metrics.leads, shouldBe.leads) - 100),
        formatPercent(calcAchievement(metrics.mql, shouldBe.mql) - 100),
        formatPercent(calcAchievement(metrics.agendamento, shouldBe.agendamento) - 100),
        formatPercent(calcAchievement(metrics.reunioes, shouldBe.reunioes) - 100),
        formatPercent(calcAchievement(metrics.qualificado, shouldBe.qualificado) - 100),
        formatPercent(calcAchievement(metrics.closerAgendada, shouldBe.closerAgendada) - 100),
        formatPercent(calcAchievement(metrics.closerRealizada, shouldBe.closerRealizada) - 100),
        formatPercent(calcAchievement(metrics.vendas, shouldBe.vendas) - 100),
    ];

    const deveria = [shouldBe.leads, shouldBe.mql, shouldBe.agendamento, shouldBe.reunioes, shouldBe.qualificado, shouldBe.closerAgendada, shouldBe.closerRealizada, shouldBe.vendas];

    const periodoAnteriorPct = previousMetrics
        ? [
              formatPercent(calcAchievement(metrics.leads, previousMetrics.leads) - 100),
              formatPercent(calcAchievement(metrics.mql, previousMetrics.mql) - 100),
              formatPercent(calcAchievement(metrics.agendamento, previousMetrics.agendamento) - 100),
              formatPercent(calcAchievement(metrics.reunioes, previousMetrics.reunioes) - 100),
              formatPercent(calcAchievement(metrics.qualificado, previousMetrics.qualificado) - 100),
              formatPercent(calcAchievement(metrics.closerAgendada, previousMetrics.closerAgendada) - 100),
              formatPercent(calcAchievement(metrics.closerRealizada, previousMetrics.closerRealizada) - 100),
              formatPercent(calcAchievement(metrics.vendas, previousMetrics.vendas) - 100),
          ]
        : Array(8).fill("-");

    const periodoAnterior = previousMetrics
        ? [previousMetrics.leads, previousMetrics.mql, previousMetrics.agendamento, previousMetrics.reunioes, previousMetrics.qualificado, previousMetrics.closerAgendada, previousMetrics.closerRealizada, previousMetrics.vendas]
        : Array(8).fill("-");

    const custos = [
        formatCurrency(cpl * metrics.leads),
        formatCurrency(cpl * 1.5 * metrics.mql),
        formatCurrency(cpl * 2 * metrics.agendamento),
        formatCurrency(cpl * 2.5 * metrics.reunioes),
        formatCurrency(cpl * 3 * metrics.qualificado),
        formatCurrency(cpl * 3.5 * metrics.closerAgendada),
        formatCurrency(cpl * 4 * metrics.closerRealizada),
        "-",
    ];

    const rows = [
        { label: "Planejado", data: planejado },
        { label: "Realizado", data: realizado, clickable: true },
        { label: "Atingimento (%)", data: atingimento },
        { label: "Deveria", data: deveria },
        { label: "Periodo anterior (%)", data: periodoAnteriorPct },
        { label: "Periodo Anterior", data: periodoAnterior },
        { label: "Custos", data: custos },
    ];

    const stageKeys: StageKey[] = ["leads", "mql", "agendamento", "reunioes", "qualificado", "closerAgendada", "closerRealizada", "vendas"];

    const cvrCards = [
        { label: "Leads → MQL", value: cvr.cvrMql, prev: prevCvr?.cvrMql, target: 70 },
        { label: "MQL → Agend.", value: cvr.cvrAg, prev: prevCvr?.cvrAg, target: 45 },
        { label: "Agend. → Reuniao", value: cvr.cvrReu, prev: prevCvr?.cvrReu, target: 70 },
        { label: "Reuniao → SQL", value: cvr.cvrSql, prev: prevCvr?.cvrSql, target: 65 },
        { label: "SQL → Closer Ag.", value: cvr.cvrRa, prev: prevCvr?.cvrRa, target: 100 },
        { label: "Closer Ag. → Real.", value: cvr.cvrRr, prev: prevCvr?.cvrRr, target: 87 },
        { label: "Closer → Venda", value: cvr.cvrVenda, prev: prevCvr?.cvrVenda, target: 35 },
    ];

    return (
        <>
            {/* Main Table */}
            <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead>
                        <tr>
                            <th style={{ ...thStyle, width: 140 }}></th>
                            {FUNNEL_COLUMNS.map((col, i) => (
                                <th key={i} style={{ ...thStyle, color: T.gold }}>
                                    {col}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((row, rowIndex) => (
                            <tr key={rowIndex}>
                                <td style={{ ...tdStyle, fontWeight: 600, color: T.muted }}>{row.label}</td>
                                {row.data.map((value, colIndex) => {
                                    const isClickable = row.clickable && colIndex < 8;
                                    const isNegative = typeof value === "string" && value.startsWith("-") && value !== "-";

                                    return (
                                        <td
                                            key={colIndex}
                                            onClick={isClickable ? () => handleStageClick(stageKeys[colIndex], FUNNEL_COLUMNS[colIndex]) : undefined}
                                            style={{
                                                ...tdStyle,
                                                cursor: isClickable ? "pointer" : "default",
                                                color: isNegative ? T.red : T.white,
                                                textDecoration: isClickable ? "underline" : "none",
                                                textDecorationStyle: isClickable ? "dotted" : undefined,
                                                textUnderlineOffset: 3,
                                            }}
                                        >
                                            {value}
                                        </td>
                                    );
                                })}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Metrics Cards */}
            <div style={{ marginTop: 24, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
                <div style={cardStyle}>
                    <div style={{ fontSize: 10, color: T.muted, marginBottom: 4 }}>CPL</div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: T.white }}>{formatCurrency(cpl)}</div>
                    <div style={{ fontSize: 10, color: T.muted }}>Meta: {formatCurrency(defaultTarget.cpl)}</div>
                </div>
                <div style={cardStyle}>
                    <div style={{ fontSize: 10, color: T.muted, marginBottom: 4 }}>Conversao Total</div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: T.gold }}>{formatPercent(cvr.conversaoTotal)}</div>
                    <div style={{ fontSize: 10, color: T.muted }}>Leads → Vendas</div>
                </div>
                <div style={cardStyle}>
                    <div style={{ fontSize: 10, color: T.muted, marginBottom: 4 }}>Custo por Venda</div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: T.white }}>{metrics.vendas > 0 ? formatCurrency((cpl * metrics.leads) / metrics.vendas) : "-"}</div>
                    <div style={{ fontSize: 10, color: T.muted }}>Investimento / Vendas</div>
                </div>
                <div style={cardStyle}>
                    <div style={{ fontSize: 10, color: T.muted, marginBottom: 4 }}>Progresso do Mes</div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: T.white }}>{formatPercent(monthProgress)}</div>
                    <div style={{ fontSize: 10, color: T.muted }}>Dias decorridos</div>
                </div>
            </div>

            {/* CVR Cards */}
            <div style={{ marginTop: 24 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: T.muted, marginBottom: 12 }}>Taxas de Conversao do Funil</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 8 }}>
                    {cvrCards.map((card, i) => {
                        const isAboveTarget = card.value >= card.target;
                        const diff = card.prev !== undefined ? card.value - card.prev : null;

                        return (
                            <div key={i} style={{ ...cardStyle, padding: 12 }}>
                                <div style={{ fontSize: 9, color: T.muted, marginBottom: 4 }}>{card.label}</div>
                                <div style={{ fontSize: 16, fontWeight: 700, color: isAboveTarget ? T.green : T.red }}>{formatPercent(card.value)}</div>
                                <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
                                    <span style={{ fontSize: 9, color: T.muted }}>Meta: {card.target}%</span>
                                    {diff !== null && (
                                        <span style={{ fontSize: 9, color: diff >= 0 ? T.green : T.red }}>
                                            {diff >= 0 ? "+" : ""}
                                            {diff.toFixed(1)}%
                                        </span>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            <DealsModal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={modalTitle} deals={modalDeals} stageKey={modalStageKey} />
        </>
    );
}

const thStyle: React.CSSProperties = {
    padding: "12px 10px",
    textAlign: "center",
    fontWeight: 600,
    borderBottom: `1px solid ${T.border}`,
    color: T.muted,
};

const tdStyle: React.CSSProperties = {
    padding: "10px",
    textAlign: "center",
    borderBottom: `1px solid ${T.border}`,
    color: T.white,
};

const cardStyle: React.CSSProperties = {
    background: T.card,
    border: `1px solid ${T.border}`,
    borderRadius: 8,
    padding: 16,
};
