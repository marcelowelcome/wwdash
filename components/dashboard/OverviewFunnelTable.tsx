"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { T } from "./theme";
import { SectionTitle } from "./SectionTitle";
import { MonthSelector } from "./MonthSelector";
import { DealsModal } from "./DealsModal";
import {
    fetchMonthlyTarget,
    fetchAllFunnelDealsForMonth,
    fetchVendasForMonth,
    upsertMonthlyTarget,
} from "@/lib/supabase-api";
import { type WonDeal, type MonthlyTarget, type FunnelMetrics } from "@/lib/schemas";
import {
    getMonthProgress,
    isInMonth,
    isCreatedInMonth,
    calcAchievement,
    calcShouldBe,
    calcConversionRate,
    getMonthName,
} from "@/lib/funnel-utils";

// Pipeline helpers (same as FunnelMetaTab)
const WW_PIPELINE_IDS = [1, 3, 4, 17, 31];
const WW_LEADS_PIPELINE_IDS = [1, 3, 4, 12, 17, 31];
const WW_MQL_PIPELINE_IDS = [1, 3, 4];
const WW_PIPELINE_NAMES = ["SDR Weddings", "Closer Weddings", "Planejamento Weddings", "WW - Internacional", "Outros Desqualificados | Wedding"];
const WW_LEADS_PIPELINE_NAMES = [...WW_PIPELINE_NAMES, "Elopment Wedding"];
const WW_MQL_PIPELINE_NAMES = ["SDR Weddings", "Closer Weddings", "Planejamento Weddings"];

function isElopement(d: WonDeal): boolean {
    return d.is_elopement === true || d.title?.startsWith("EW") === true || d.pipeline === "Elopment Wedding";
}
function isInWwPipeline(d: WonDeal): boolean {
    return (d.pipeline_id != null && WW_PIPELINE_IDS.includes(d.pipeline_id)) || (d.pipeline != null && WW_PIPELINE_NAMES.includes(d.pipeline));
}
function isInWwLeadsPipeline(d: WonDeal): boolean {
    return (d.pipeline_id != null && WW_LEADS_PIPELINE_IDS.includes(d.pipeline_id)) || (d.pipeline != null && WW_LEADS_PIPELINE_NAMES.includes(d.pipeline));
}
function isInWwMqlPipeline(d: WonDeal): boolean {
    return (d.pipeline_id != null && WW_MQL_PIPELINE_IDS.includes(d.pipeline_id)) || (d.pipeline != null && WW_MQL_PIPELINE_NAMES.includes(d.pipeline));
}

type StageKey = "leads" | "mql" | "agendamento" | "reunioes" | "qualificado" | "closerAgendada" | "closerRealizada" | "vendas";

function calcMetrics(deals: WonDeal[], year: number, month: number, vendasCount?: number): FunnelMetrics {
    const wwDeals = deals.filter((d) => !isElopement(d));
    return {
        leads: deals.filter((d) => isInWwLeadsPipeline(d) && isCreatedInMonth(d.cdate, year, month)).length,
        mql: deals.filter((d) => isInWwMqlPipeline(d) && !isElopement(d) && isCreatedInMonth(d.cdate, year, month)).length,
        agendamento: wwDeals.filter((d) => isInWwPipeline(d) && isInMonth(d.data_reuniao_1, year, month)).length,
        reunioes: wwDeals.filter(
            (d) =>
                isInWwPipeline(d) &&
                isInMonth(d.data_reuniao_1, year, month) &&
                d.como_foi_feita_a_1a_reuniao != null &&
                d.como_foi_feita_a_1a_reuniao !== "" &&
                d.como_foi_feita_a_1a_reuniao !== "Não teve reunião"
        ).length,
        qualificado: wwDeals.filter((d) => isInWwPipeline(d) && isInMonth(d.data_qualificado, year, month)).length,
        closerAgendada: wwDeals.filter((d) => isInWwPipeline(d) && isInMonth(d.data_horario_agendamento_closer, year, month)).length,
        closerRealizada: wwDeals.filter(
            (d) =>
                isInWwPipeline(d) &&
                isInMonth(d.data_horario_agendamento_closer, year, month) &&
                d.reuniao_closer != null &&
                d.reuniao_closer !== ""
        ).length,
        vendas: vendasCount ?? wwDeals.filter((d) => isInMonth(d.data_fechamento, year, month)).length,
    };
}

function getDealsForStage(deals: WonDeal[], stage: StageKey, year: number, month: number): WonDeal[] {
    const wwDeals = deals.filter((d) => !isElopement(d));
    switch (stage) {
        case "leads":
            return deals.filter((d) => isInWwLeadsPipeline(d) && isCreatedInMonth(d.cdate, year, month));
        case "mql":
            return wwDeals.filter((d) => isInWwMqlPipeline(d) && isCreatedInMonth(d.cdate, year, month));
        case "agendamento":
            return wwDeals.filter((d) => isInWwPipeline(d) && isInMonth(d.data_reuniao_1, year, month));
        case "reunioes":
            return wwDeals.filter(
                (d) =>
                    isInWwPipeline(d) &&
                    isInMonth(d.data_reuniao_1, year, month) &&
                    d.como_foi_feita_a_1a_reuniao != null &&
                    d.como_foi_feita_a_1a_reuniao !== "" &&
                    d.como_foi_feita_a_1a_reuniao !== "Não teve reunião"
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
                    d.reuniao_closer != null &&
                    d.reuniao_closer !== ""
            );
        case "vendas":
            return wwDeals.filter((d) => isInMonth(d.data_fechamento, year, month));
        default:
            return [];
    }
}

function fmt(v: number): string {
    return v.toFixed(2).replace(".", ",") + "%";
}

function fmtDelta(actual: number, target: number): string {
    if (target === 0) return "-";
    const pct = ((actual / target) - 1) * 100;
    return fmt(pct);
}

function deltaColor(actual: number, target: number): string {
    if (target === 0) return T.muted;
    const pct = ((actual / target) - 1) * 100;
    return pct >= 0 ? T.green : T.red;
}

function rateDeltaColor(actual: number, target: number): string {
    const diff = actual - target;
    if (Math.abs(diff) < 0.01) return T.muted;
    return diff >= 0 ? T.green : T.red;
}

interface OverviewFunnelTableProps {
    allDeals: WonDeal[];
}

export function OverviewFunnelTable({ allDeals }: OverviewFunnelTableProps) {
    const now = new Date();
    const [year, setYear] = useState(now.getFullYear());
    const [month, setMonth] = useState(now.getMonth() + 1);
    const [target, setTarget] = useState<MonthlyTarget | null>(null);
    const [monthDeals, setMonthDeals] = useState<WonDeal[]>([]);
    const [prevMetrics, setPrevMetrics] = useState<FunnelMetrics | null>(null);
    const [yearAgoMetrics, setYearAgoMetrics] = useState<FunnelMetrics | null>(null);
    const [loading, setLoading] = useState(false);
    const [modalOpen, setModalOpen] = useState(false);
    const [modalTitle, setModalTitle] = useState("");
    const [modalDeals, setModalDeals] = useState<WonDeal[]>([]);
    const [modalStageKey, setModalStageKey] = useState<StageKey>("leads");
    const [editing, setEditing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [editValues, setEditValues] = useState<Record<string, number>>({});

    const monthProgress = getMonthProgress(year, month);

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            // Previous month
            let prevY = year, prevM = month - 1;
            if (prevM === 0) { prevM = 12; prevY--; }
            // Year ago
            const yaY = year - 1, yaM = month;

            const [tgt, deals, vendas, prevDeals, prevVendas, yaDeals, yaVendas] = await Promise.all([
                fetchMonthlyTarget(year, month, "wedding"),
                fetchAllFunnelDealsForMonth(year, month),
                fetchVendasForMonth(year, month),
                fetchAllFunnelDealsForMonth(prevY, prevM),
                fetchVendasForMonth(prevY, prevM),
                fetchAllFunnelDealsForMonth(yaY, yaM),
                fetchVendasForMonth(yaY, yaM),
            ]);

            setTarget(tgt);

            // Combine deals, deduplicated
            const ids = new Set(deals.map((d) => d.id));
            const combined = [...deals, ...vendas.deals.filter((d) => !ids.has(d.id))];
            setMonthDeals(combined);

            // Previous month combined
            const prevIds = new Set(prevDeals.map((d) => d.id));
            const prevCombined = [...prevDeals, ...prevVendas.deals.filter((d) => !prevIds.has(d.id))];
            setPrevMetrics(calcMetrics(prevCombined, prevY, prevM, prevVendas.count));

            // Year ago combined
            const yaIds = new Set(yaDeals.map((d) => d.id));
            const yaCombined = [...yaDeals, ...yaVendas.deals.filter((d) => !yaIds.has(d.id))];
            setYearAgoMetrics(calcMetrics(yaCombined, yaY, yaM, yaVendas.count));
        } catch (err) {
            console.error("[OverviewFunnelTable] Error:", err);
        } finally {
            setLoading(false);
        }
    }, [year, month]);

    useEffect(() => { loadData(); }, [loadData]);

    // Combine allDeals with monthDeals (dedup)
    const combinedDeals = useMemo(() => {
        const ids = new Set(allDeals.map((d) => d.id));
        return [...allDeals, ...monthDeals.filter((d) => !ids.has(d.id))];
    }, [allDeals, monthDeals]);

    const m = useMemo(() => calcMetrics(combinedDeals, year, month), [combinedDeals, year, month]);

    const tgt: MonthlyTarget = target || {
        month: "", pipeline_type: "wedding",
        leads: 0, mql: 0, agendamento: 0, reunioes: 0,
        qualificado: 0, closer_agendada: 0, closer_realizada: 0, vendas: 0, cpl: 0,
    };

    const sb = {
        leads: calcShouldBe(tgt.leads, monthProgress),
        mql: calcShouldBe(tgt.mql, monthProgress),
        agendamento: calcShouldBe(tgt.agendamento, monthProgress),
        reunioes: calcShouldBe(tgt.reunioes, monthProgress),
        qualificado: calcShouldBe(tgt.qualificado, monthProgress),
        closerAgendada: calcShouldBe(tgt.closer_agendada, monthProgress),
        closerRealizada: calcShouldBe(tgt.closer_realizada, monthProgress),
        vendas: calcShouldBe(tgt.vendas, monthProgress),
    };

    // Target rates for conversions
    const tgtRates = {
        qualificacao: tgt.leads > 0 ? (tgt.mql / tgt.leads) * 100 : 0,
        agendamento: tgt.mql > 0 ? (tgt.agendamento / tgt.mql) * 100 : 0,
        comparecimento: tgt.agendamento > 0 ? (tgt.reunioes / tgt.agendamento) * 100 : 0,
        qualSdr: tgt.reunioes > 0 ? (tgt.qualificado / tgt.reunioes) * 100 : 0,
        taxQualificados: tgt.leads > 0 ? (tgt.qualificado / tgt.leads) * 100 : 0,
        agendCloser: tgt.qualificado > 0 ? (tgt.closer_agendada / tgt.qualificado) * 100 : 0,
        compCloser: tgt.closer_agendada > 0 ? (tgt.closer_realizada / tgt.closer_agendada) * 100 : 0,
        convCloserReuniao: tgt.closer_realizada > 0 ? (tgt.vendas / tgt.closer_realizada) * 100 : 0,
        convCloserMql: tgt.mql > 0 ? (tgt.vendas / tgt.mql) * 100 : 0,
    };

    // Map stage keys to monthly_targets column names
    const stageToTargetField: Record<StageKey, keyof MonthlyTarget> = {
        leads: "leads",
        mql: "mql",
        agendamento: "agendamento",
        reunioes: "reunioes",
        qualificado: "qualificado",
        closerAgendada: "closer_agendada",
        closerRealizada: "closer_realizada",
        vendas: "vendas",
    };

    const startEditing = () => {
        setEditValues({
            leads: tgt.leads,
            mql: tgt.mql,
            agendamento: tgt.agendamento,
            reunioes: tgt.reunioes,
            qualificado: tgt.qualificado,
            closer_agendada: tgt.closer_agendada,
            closer_realizada: tgt.closer_realizada,
            vendas: tgt.vendas,
            cpl: tgt.cpl,
        });
        setEditing(true);
    };

    const cancelEditing = () => {
        setEditing(false);
        setEditValues({});
    };

    const saveTargets = async () => {
        setSaving(true);
        const result = await upsertMonthlyTarget(year, month, "wedding", {
            leads: editValues.leads || 0,
            mql: editValues.mql || 0,
            agendamento: editValues.agendamento || 0,
            reunioes: editValues.reunioes || 0,
            qualificado: editValues.qualificado || 0,
            closer_agendada: editValues.closer_agendada || 0,
            closer_realizada: editValues.closer_realizada || 0,
            vendas: editValues.vendas || 0,
            cpl: editValues.cpl || 0,
        });
        setSaving(false);
        if (result) {
            setTarget(result);
            setEditing(false);
        }
    };

    const handleClick = (stage: StageKey, title: string) => {
        setModalDeals(getDealsForStage(combinedDeals, stage, year, month));
        setModalTitle(title);
        setModalStageKey(stage);
        setModalOpen(true);
    };

    const prevM = prevMetrics;
    const yaM = yearAgoMetrics;

    // Previous month label
    let prevLabel = "";
    {
        let pm = month - 1, py = year;
        if (pm === 0) { pm = 12; py--; }
        prevLabel = `${getMonthName(pm).slice(0, 3).toLowerCase()}. ${py}`;
    }
    const yaLabel = `${getMonthName(month).slice(0, 3).toLowerCase()}. ${year - 1}`;
    const curLabel = getMonthName(month).slice(0, 3).toLowerCase();

    // Helper to compute % change for previous/year-ago
    function prevPct(cur: number, prev: number | undefined): string {
        if (prev == null || prev === 0) return "-";
        return fmt(((cur / prev) - 1) * 100);
    }
    function prevPctColor(cur: number, prev: number | undefined): string {
        if (prev == null || prev === 0) return T.muted;
        return cur >= prev ? T.green : T.red;
    }

    type Row = {
        section?: string;
        sectionColor?: string;
        label: string;
        realizado: string;
        realizadoColor?: string;
        planejado: string;
        pct: string;
        pctColor: string;
        deveria: string;
        diferenca: string;
        diferencaColor: string;
        prevPct: string;
        prevPctColor: string;
        yaPct: string;
        yaPctColor: string;
        stage?: StageKey;
        isRate?: boolean;
        targetField?: string; // key in editValues for editable rows
    };

    const rows: Row[] = [];

    // Helper for absolute metric rows
    function addAbsRow(
        label: string, stage: StageKey,
        real: number, plan: number, shouldBe: number,
        prev: number | undefined, ya: number | undefined,
        section?: string, sectionColor?: string
    ) {
        rows.push({
            section, sectionColor,
            label, stage,
            targetField: stage ? String(stageToTargetField[stage]) : undefined,
            realizado: String(real),
            planejado: String(plan || "-"),
            pct: plan > 0 ? fmtDelta(real, plan) : "-",
            pctColor: plan > 0 ? deltaColor(real, plan) : T.muted,
            deveria: String(shouldBe || "-"),
            diferenca: shouldBe > 0 ? String(real - shouldBe) : "-",
            diferencaColor: shouldBe > 0 ? (real >= shouldBe ? T.green : T.red) : T.muted,
            prevPct: prevPct(real, prev),
            prevPctColor: prevPctColor(real, prev),
            yaPct: prevPct(real, ya),
            yaPctColor: prevPctColor(real, ya),
        });
    }

    // Helper for rate rows
    function addRateRow(label: string, rate: number, planRate: number, prevRate: number | undefined, yaRate: number | undefined) {
        const diff = rate - planRate;
        rows.push({
            label, isRate: true,
            realizado: fmt(rate),
            planejado: planRate > 0 ? fmt(planRate) : "-",
            pct: planRate > 0 ? fmt(diff) : "-",
            pctColor: planRate > 0 ? (diff >= 0 ? T.green : T.red) : T.muted,
            deveria: "-",
            diferenca: "-",
            diferencaColor: T.muted,
            prevPct: prevRate != null ? fmt(rate - prevRate) : "-",
            prevPctColor: prevRate != null ? rateDeltaColor(rate, prevRate) : T.muted,
            yaPct: yaRate != null ? fmt(rate - yaRate) : "-",
            yaPctColor: yaRate != null ? rateDeltaColor(rate, yaRate) : T.muted,
        });
    }

    // Rates
    const rQualificacao = calcConversionRate(m.leads, m.mql);
    const rAgendamento = calcConversionRate(m.mql, m.agendamento);
    const rComparecimento = calcConversionRate(m.agendamento, m.reunioes);
    const rQualSdr = calcConversionRate(m.reunioes, m.qualificado);
    const rTaxQual = calcConversionRate(m.leads, m.qualificado);
    const rAgendCloser = calcConversionRate(m.qualificado, m.closerAgendada);
    const rCompCloser = calcConversionRate(m.closerAgendada, m.closerRealizada);
    const rConvReuniao = calcConversionRate(m.closerRealizada, m.vendas);
    const rConvMql = calcConversionRate(m.mql, m.vendas);

    // Previous rates
    const prQualificacao = prevM ? calcConversionRate(prevM.leads, prevM.mql) : undefined;
    const prAgendamento = prevM ? calcConversionRate(prevM.mql, prevM.agendamento) : undefined;
    const prComparecimento = prevM ? calcConversionRate(prevM.agendamento, prevM.reunioes) : undefined;
    const prQualSdr = prevM ? calcConversionRate(prevM.reunioes, prevM.qualificado) : undefined;
    const prTaxQual = prevM ? calcConversionRate(prevM.leads, prevM.qualificado) : undefined;
    const prAgendCloser = prevM ? calcConversionRate(prevM.qualificado, prevM.closerAgendada) : undefined;
    const prCompCloser = prevM ? calcConversionRate(prevM.closerAgendada, prevM.closerRealizada) : undefined;
    const prConvReuniao = prevM ? calcConversionRate(prevM.closerRealizada, prevM.vendas) : undefined;
    const prConvMql = prevM ? calcConversionRate(prevM.mql, prevM.vendas) : undefined;

    // Year ago rates
    const yrQualificacao = yaM ? calcConversionRate(yaM.leads, yaM.mql) : undefined;
    const yrAgendamento = yaM ? calcConversionRate(yaM.mql, yaM.agendamento) : undefined;
    const yrComparecimento = yaM ? calcConversionRate(yaM.agendamento, yaM.reunioes) : undefined;
    const yrQualSdr = yaM ? calcConversionRate(yaM.reunioes, yaM.qualificado) : undefined;
    const yrTaxQual = yaM ? calcConversionRate(yaM.leads, yaM.qualificado) : undefined;
    const yrAgendCloser = yaM ? calcConversionRate(yaM.qualificado, yaM.closerAgendada) : undefined;
    const yrCompCloser = yaM ? calcConversionRate(yaM.closerAgendada, yaM.closerRealizada) : undefined;
    const yrConvReuniao = yaM ? calcConversionRate(yaM.closerRealizada, yaM.vendas) : undefined;
    const yrConvMql = yaM ? calcConversionRate(yaM.mql, yaM.vendas) : undefined;

    // === SECTION 1: Aquisição qualificada ===
    addAbsRow("Leads", "leads", m.leads, tgt.leads, sb.leads, prevM?.leads, yaM?.leads, "Aquisição qualificada", "#E07020");
    addAbsRow("MQL", "mql", m.mql, tgt.mql, sb.mql, prevM?.mql, yaM?.mql);
    addRateRow("Taxa qualificação", rQualificacao, tgtRates.qualificacao, prQualificacao, yrQualificacao);
    addAbsRow("Agendamento", "agendamento", m.agendamento, tgt.agendamento, sb.agendamento, prevM?.agendamento, yaM?.agendamento);
    addRateRow("Taxa agendamento", rAgendamento, tgtRates.agendamento, prAgendamento, yrAgendamento);
    addAbsRow("Reuniões", "reunioes", m.reunioes, tgt.reunioes, sb.reunioes, prevM?.reunioes, yaM?.reunioes);
    addRateRow("Taxa comparecimento", rComparecimento, tgtRates.comparecimento, prComparecimento, yrComparecimento);

    // === SECTION 2: Qualificação SDR ===
    addAbsRow("Qualificado closer", "qualificado", m.qualificado, tgt.qualificado, sb.qualificado, prevM?.qualificado, yaM?.qualificado, "Qualificação SDR", "#3366CC");
    addRateRow("Taxa Qualificação SDR", rQualSdr, tgtRates.qualSdr, prQualSdr, yrQualSdr);
    addRateRow("Tax de Qualificados", rTaxQual, tgtRates.taxQualificados, prTaxQual, yrTaxQual);
    addAbsRow("Agendado closer", "closerAgendada", m.closerAgendada, tgt.closer_agendada, sb.closerAgendada, prevM?.closerAgendada, yaM?.closerAgendada);
    addRateRow("Taxa agendamento closer", rAgendCloser, tgtRates.agendCloser, prAgendCloser, yrAgendCloser);

    // === SECTION 3: Conversão Closer ===
    addAbsRow("Closer realizada", "closerRealizada", m.closerRealizada, tgt.closer_realizada, sb.closerRealizada, prevM?.closerRealizada, yaM?.closerRealizada, "Conversão Closer", "#CC3366");
    addRateRow("Taxa comparecimento - Closer", rCompCloser, tgtRates.compCloser, prCompCloser, yrCompCloser);
    addAbsRow("Vendas", "vendas", m.vendas, tgt.vendas, sb.vendas, prevM?.vendas, yaM?.vendas);
    addRateRow("Taxa conversão Closer (Reunião)", rConvReuniao, tgtRates.convCloserReuniao, prConvReuniao, yrConvReuniao);
    addRateRow("Taxa conversão Closer (MQL)", rConvMql, tgtRates.convCloserMql, prConvMql, yrConvMql);

    if (loading) {
        return (
            <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: "20px 22px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                    <SectionTitle>Funil do Mês</SectionTitle>
                </div>
                <div style={{ textAlign: "center", padding: 30, color: T.muted, fontSize: 13 }}>Carregando...</div>
            </div>
        );
    }

    return (
        <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: "20px 22px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <SectionTitle>Funil do Mês</SectionTitle>
                    {!editing ? (
                        <button
                            onClick={startEditing}
                            style={{
                                background: "transparent",
                                border: `1px solid ${T.border}`,
                                borderRadius: 4,
                                padding: "3px 8px",
                                fontSize: 10,
                                color: T.muted,
                                cursor: "pointer",
                            }}
                        >
                            Editar metas
                        </button>
                    ) : (
                        <div style={{ display: "flex", gap: 6 }}>
                            <button
                                onClick={saveTargets}
                                disabled={saving}
                                style={{
                                    background: T.green,
                                    border: "none",
                                    borderRadius: 4,
                                    padding: "3px 10px",
                                    fontSize: 10,
                                    fontWeight: 600,
                                    color: T.bg,
                                    cursor: saving ? "wait" : "pointer",
                                    opacity: saving ? 0.6 : 1,
                                }}
                            >
                                {saving ? "Salvando..." : "Salvar"}
                            </button>
                            <button
                                onClick={cancelEditing}
                                style={{
                                    background: "transparent",
                                    border: `1px solid ${T.border}`,
                                    borderRadius: 4,
                                    padding: "3px 8px",
                                    fontSize: 10,
                                    color: T.muted,
                                    cursor: "pointer",
                                }}
                            >
                                Cancelar
                            </button>
                        </div>
                    )}
                </div>
                <MonthSelector selectedYear={year} selectedMonth={month} onChange={(y, m) => { setYear(y); setMonth(m); }} />
            </div>

            <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                    <thead>
                        <tr>
                            <th style={{ ...thBase, width: 36 }}></th>
                            <th style={{ ...thBase, textAlign: "left", width: 190 }}>Mês</th>
                            <th style={thBase}>
                                <div style={{ fontSize: 9, color: T.muted }}>Realizado</div>
                                <div style={{ color: T.gold }}>{curLabel}</div>
                            </th>
                            <th style={thBase}>
                                <div style={{ fontSize: 9, color: T.muted }}>Planejado</div>
                                <div>{curLabel}</div>
                            </th>
                            <th style={thBase}>%</th>
                            <th style={thBase}>Deveria</th>
                            <th style={thBase}>Diferença</th>
                            <th style={thBase}>
                                <div style={{ fontSize: 9, color: T.muted }}>Mês Anterior</div>
                                <div>{prevLabel}</div>
                            </th>
                            <th style={thBase}>
                                <div style={{ fontSize: 9, color: T.muted }}>Ano Anterior</div>
                                <div>{yaLabel}</div>
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((r, i) => (
                            <tr key={i} style={{ background: r.isRate ? `${T.surface}80` : "transparent" }}>
                                {/* Section color bar */}
                                <td style={{ ...tdBase, padding: 0, width: 4 }}>
                                    {r.section && (
                                        <div style={{
                                            width: 4, height: "100%", minHeight: 32,
                                            background: r.sectionColor || T.gold,
                                            borderRadius: "2px 0 0 2px",
                                        }} />
                                    )}
                                </td>
                                {/* Label */}
                                <td style={{
                                    ...tdBase,
                                    textAlign: "left",
                                    fontWeight: r.section ? 700 : r.isRate ? 400 : 600,
                                    color: r.section ? T.white : r.isRate ? T.muted : T.white,
                                    paddingLeft: r.section ? 8 : r.isRate ? 16 : 12,
                                    fontSize: r.isRate ? 10 : 11,
                                }}>
                                    {r.section && (
                                        <span style={{ fontSize: 9, color: r.sectionColor, display: "block", marginBottom: 1, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                                            {r.section}
                                        </span>
                                    )}
                                    {r.label}
                                </td>
                                {/* Realizado */}
                                <td
                                    style={{
                                        ...tdBase,
                                        fontWeight: 700,
                                        color: r.realizadoColor || T.gold,
                                        cursor: r.stage ? "pointer" : "default",
                                        textDecoration: r.stage ? "underline" : "none",
                                        textDecorationStyle: r.stage ? "dotted" : undefined,
                                        textUnderlineOffset: 3,
                                    }}
                                    onClick={r.stage ? () => handleClick(r.stage!, r.label) : undefined}
                                >
                                    {r.realizado}
                                </td>
                                {/* Planejado */}
                                <td style={{ ...tdBase, color: T.white }}>
                                    {editing && r.targetField ? (
                                        <input
                                            type="number"
                                            value={editValues[r.targetField] ?? 0}
                                            onChange={(e) => setEditValues((prev) => ({ ...prev, [r.targetField!]: Number(e.target.value) || 0 }))}
                                            style={{
                                                width: 56,
                                                background: T.surface,
                                                color: T.gold,
                                                border: `1px solid ${T.gold}60`,
                                                borderRadius: 4,
                                                padding: "2px 4px",
                                                fontSize: 11,
                                                textAlign: "center",
                                                fontFamily: "inherit",
                                                outline: "none",
                                            }}
                                        />
                                    ) : (
                                        r.planejado
                                    )}
                                </td>
                                {/* % */}
                                <td style={{ ...tdBase, color: r.pctColor, fontWeight: 600 }}>{r.pct}</td>
                                {/* Deveria */}
                                <td style={{ ...tdBase, color: T.muted }}>{r.deveria}</td>
                                {/* Diferença */}
                                <td style={{ ...tdBase, color: r.diferencaColor, fontWeight: 600 }}>{r.diferenca}</td>
                                {/* Mês Anterior */}
                                <td style={{ ...tdBase, color: r.prevPctColor }}>{r.prevPct}</td>
                                {/* Ano Anterior */}
                                <td style={{ ...tdBase, color: r.yaPctColor }}>{r.yaPct}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {editing && (
                <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 10, color: T.muted }}>CPL meta:</span>
                    <input
                        type="number"
                        step="0.01"
                        value={editValues.cpl ?? 0}
                        onChange={(e) => setEditValues((prev) => ({ ...prev, cpl: Number(e.target.value) || 0 }))}
                        style={{
                            width: 72,
                            background: T.surface,
                            color: T.gold,
                            border: `1px solid ${T.gold}60`,
                            borderRadius: 4,
                            padding: "2px 6px",
                            fontSize: 11,
                            fontFamily: "inherit",
                            outline: "none",
                        }}
                    />
                </div>
            )}

            {!target && !editing && (
                <div style={{ marginTop: 12, fontSize: 10, color: T.orange, opacity: 0.7 }}>
                    Nenhuma meta definida para este mês. Clique em "Editar metas" para definir.
                </div>
            )}

            <DealsModal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={modalTitle} deals={modalDeals} stageKey={modalStageKey} />
        </div>
    );
}

const thBase: React.CSSProperties = {
    padding: "10px 8px",
    textAlign: "center",
    fontWeight: 600,
    color: "#999",
    borderBottom: `1px solid ${T.border}`,
    fontSize: 10,
    whiteSpace: "nowrap",
};

const tdBase: React.CSSProperties = {
    padding: "8px 8px",
    textAlign: "center",
    borderBottom: `1px solid ${T.border}22`,
    whiteSpace: "nowrap",
};
