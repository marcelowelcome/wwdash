"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { T } from "./theme";
import { SectionTitle } from "./SectionTitle";
import { MonthSelector } from "./MonthSelector";
import { FunnelMetaTable } from "./FunnelMetaTable";
import {
    fetchMonthlyTarget,
    fetchAllFunnelDealsForMonth,
    fetchVendasForMonth,
    fetchAllAdsSpend,
    type AdsSpendData,
} from "@/lib/supabase-api";
import { type WonDeal, type MonthlyTarget, type FunnelMetrics } from "@/lib/schemas";
import { getMonthProgress, isInMonth, isCreatedInMonth } from "@/lib/funnel-utils";

interface FunnelMetaTabProps {
    allDeals: WonDeal[];
}

// Pipeline helpers
const WW_PIPELINE_IDS = [1, 3, 4, 17, 31];
const WW_LEADS_PIPELINE_IDS = [1, 3, 4, 12, 17, 31]; // Includes Elopement (12) for Leads only
const WW_MQL_PIPELINE_IDS = [1, 3, 4];
const WW_PIPELINE_NAMES = ["SDR Weddings", "Closer Weddings", "Planejamento Weddings", "WW - Internacional", "Outros Desqualificados | Wedding"];
const WW_LEADS_PIPELINE_NAMES = ["SDR Weddings", "Closer Weddings", "Planejamento Weddings", "WW - Internacional", "Outros Desqualificados | Wedding", "Elopment Wedding"];
const WW_MQL_PIPELINE_NAMES = ["SDR Weddings", "Closer Weddings", "Planejamento Weddings"];

function isElopement(d: WonDeal): boolean {
    return d.is_elopement === true || d.title?.startsWith("EW") === true || d.pipeline === "Elopment Wedding";
}

function isInWwPipeline(d: WonDeal): boolean {
    if (d.pipeline_id && WW_PIPELINE_IDS.includes(d.pipeline_id)) return true;
    if (d.pipeline && WW_PIPELINE_NAMES.includes(d.pipeline)) return true;
    return false;
}

function isInWwLeadsPipeline(d: WonDeal): boolean {
    if (d.pipeline_id && WW_LEADS_PIPELINE_IDS.includes(d.pipeline_id)) return true;
    if (d.pipeline && WW_LEADS_PIPELINE_NAMES.includes(d.pipeline)) return true;
    return false;
}

function isInWwMqlPipeline(d: WonDeal): boolean {
    if (d.pipeline_id && WW_MQL_PIPELINE_IDS.includes(d.pipeline_id)) return true;
    if (d.pipeline && WW_MQL_PIPELINE_NAMES.includes(d.pipeline)) return true;
    return false;
}

function calculateMetricsFromDeals(deals: WonDeal[], year: number, month: number, vendasCount?: number): FunnelMetrics {
    // Leads: pipes 1, 3, 4, 12, 17, 31 (includes Elopement) + CREATED IN MONTH
    const leadsDeals = deals.filter(
        (d) => isInWwLeadsPipeline(d) && isCreatedInMonth(d.cdate, year, month)
    );

    // MQL: only pipes 1, 3, 4 + exclude Elopement + CREATED IN MONTH
    const mqlDeals = deals.filter(
        (d) => isInWwMqlPipeline(d) && !isElopement(d) && isCreatedInMonth(d.cdate, year, month)
    );

    // All WW deals (for metrics that can include deals created in other months)
    const allWwDeals = deals.filter((d) => isInWwPipeline(d) && !isElopement(d));

    return {
        leads: leadsDeals.length,
        mql: mqlDeals.length,
        // Agendamento: data_reuniao_1 falls within the selected month
        agendamento: allWwDeals.filter((d) => isInMonth(d.data_reuniao_1, year, month)).length,
        // Reuniao: agendamento in month + como_reuniao_1 filled + not "Não teve reunião"
        reunioes: allWwDeals.filter(
            (d) =>
                isInMonth(d.data_reuniao_1, year, month) &&
                d.como_foi_feita_a_1a_reuniao !== null &&
                d.como_foi_feita_a_1a_reuniao !== "" &&
                d.como_foi_feita_a_1a_reuniao !== "Não teve reunião"
        ).length,
        // Qualificado: data_qualificado in month
        qualificado: allWwDeals.filter((d) => isInMonth(d.data_qualificado, year, month)).length,
        // Closer Agendada: data_closer falls within the selected month
        closerAgendada: allWwDeals.filter((d) => isInMonth(d.data_horario_agendamento_closer, year, month)).length,
        // Closer Realizada: data_closer in month + reuniao_closer filled
        closerRealizada: allWwDeals.filter(
            (d) =>
                isInMonth(d.data_horario_agendamento_closer, year, month) &&
                d.reuniao_closer !== null &&
                d.reuniao_closer !== ""
        ).length,
        // Venda: use provided vendasCount if available, otherwise count all deals with data_fechamento (except Elopement)
        vendas: vendasCount ?? deals.filter((d) => !isElopement(d) && isInMonth(d.data_fechamento, year, month)).length,
    };
}

type ViewMode = "wedding" | "elopement" | "total";

export function FunnelMetaTab({ allDeals }: FunnelMetaTabProps) {
    const now = new Date();
    const [selectedYear, setSelectedYear] = useState(now.getFullYear());
    const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);
    const [dateRange, setDateRange] = useState<{ start: Date; end: Date } | null>(null);
    const [target, setTarget] = useState<MonthlyTarget | null>(null);
    const [monthDeals, setMonthDeals] = useState<WonDeal[]>([]);
    const [loading, setLoading] = useState(false);
    const [previousMetrics, setPreviousMetrics] = useState<FunnelMetrics | null>(null);
    const [cpl, setCpl] = useState(50);
    const [adsData, setAdsData] = useState<{ meta: AdsSpendData; google: AdsSpendData; total: AdsSpendData } | null>(null);
    const [viewMode, setViewMode] = useState<ViewMode>("wedding");

    const monthProgress = getMonthProgress(selectedYear, selectedMonth);

    const handleMonthChange = (year: number, month: number) => {
        setSelectedYear(year);
        setSelectedMonth(month);
        setDateRange(null); // Clear custom date range when selecting month
    };

    const handleDateRangeChange = (start: Date, end: Date) => {
        setDateRange({ start, end });
    };

    const loadMonthData = useCallback(async () => {
        setLoading(true);
        try {
            // Fetch target, deals, and ads data for selected month
            const [targetData, dealsData, vendasData, allAds] = await Promise.all([
                fetchMonthlyTarget(selectedYear, selectedMonth, "wedding"),
                fetchAllFunnelDealsForMonth(selectedYear, selectedMonth),
                fetchVendasForMonth(selectedYear, selectedMonth),
                fetchAllAdsSpend(selectedYear, selectedMonth),
            ]);

            setTarget(targetData);
            setAdsData(allAds);

            // Combine fetched deals with vendas deals (deduplicated)
            const existingIds = new Set(dealsData.map((d) => d.id));
            const combinedDeals = [
                ...dealsData,
                ...vendasData.deals.filter((d) => !existingIds.has(d.id)),
            ];
            setMonthDeals(combinedDeals);

            // Calculate CPL from total ads spend or use target
            const leadsCount = combinedDeals.filter(
                (d) => isInWwLeadsPipeline(d) && isCreatedInMonth(d.cdate, selectedYear, selectedMonth)
            ).length;
            const calculatedCpl = leadsCount > 0 ? allAds.total.spend / leadsCount : targetData?.cpl || 50;
            setCpl(calculatedCpl);

            // Calculate previous month metrics
            let prevYear = selectedYear;
            let prevMonth = selectedMonth - 1;
            if (prevMonth === 0) {
                prevMonth = 12;
                prevYear = selectedYear - 1;
            }

            const [prevDeals, prevVendas] = await Promise.all([
                fetchAllFunnelDealsForMonth(prevYear, prevMonth),
                fetchVendasForMonth(prevYear, prevMonth),
            ]);

            // Combine prev deals with prev vendas (deduplicated)
            const prevExistingIds = new Set(prevDeals.map((d) => d.id));
            const prevCombined = [
                ...prevDeals,
                ...prevVendas.deals.filter((d) => !prevExistingIds.has(d.id)),
            ];

            const prevMetrics = calculateMetricsFromDeals(prevCombined, prevYear, prevMonth, prevVendas.count);
            setPreviousMetrics(prevMetrics);
        } catch (error) {
            console.error("[FunnelMetaTab] Error loading data:", error);
        } finally {
            setLoading(false);
        }
    }, [selectedYear, selectedMonth]);

    useEffect(() => {
        loadMonthData();
    }, [loadMonthData]);

    // Combine allDeals with monthDeals (deduplicated)
    // Filtering by viewMode is handled in FunnelMetaTable
    const combinedDeals = useMemo(() => {
        const existingIds = new Set(allDeals.map((d) => d.id));
        const newDeals = monthDeals.filter((d) => !existingIds.has(d.id));
        return [...allDeals, ...newDeals];
    }, [allDeals, monthDeals]);

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                    <SectionTitle>Funil de Metas</SectionTitle>
                    {/* View Mode Toggle */}
                    <div style={{ display: "flex", background: T.card, borderRadius: 6, padding: 2, border: `1px solid ${T.border}` }}>
                        <button
                            onClick={() => setViewMode("wedding")}
                            style={{
                                padding: "6px 12px",
                                fontSize: 11,
                                fontWeight: 600,
                                border: "none",
                                borderRadius: 4,
                                cursor: "pointer",
                                background: viewMode === "wedding" ? T.gold : "transparent",
                                color: viewMode === "wedding" ? T.bg : T.muted,
                                transition: "all 0.15s",
                            }}
                        >
                            Wedding
                        </button>
                        <button
                            onClick={() => setViewMode("elopement")}
                            style={{
                                padding: "6px 12px",
                                fontSize: 11,
                                fontWeight: 600,
                                border: "none",
                                borderRadius: 4,
                                cursor: "pointer",
                                background: viewMode === "elopement" ? T.berry : "transparent",
                                color: viewMode === "elopement" ? T.white : T.muted,
                                transition: "all 0.15s",
                            }}
                        >
                            Elopement
                        </button>
                        <button
                            onClick={() => setViewMode("total")}
                            style={{
                                padding: "6px 12px",
                                fontSize: 11,
                                fontWeight: 600,
                                border: "none",
                                borderRadius: 4,
                                cursor: "pointer",
                                background: viewMode === "total" ? T.green : "transparent",
                                color: viewMode === "total" ? T.bg : T.muted,
                                transition: "all 0.15s",
                            }}
                        >
                            Total
                        </button>
                    </div>
                </div>
                <MonthSelector
                    selectedYear={selectedYear}
                    selectedMonth={selectedMonth}
                    onChange={handleMonthChange}
                    onDateRangeChange={handleDateRangeChange}
                    dateRange={dateRange}
                />
            </div>

            {/* Loading state */}
            {loading && (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 40 }}>
                    <div style={{ fontSize: 14, color: T.muted }}>Carregando dados...</div>
                </div>
            )}

            {/* Ads Breakdown Cards */}
            {!loading && adsData && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
                    <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 8, padding: 16 }}>
                        <div style={{ fontSize: 10, color: T.muted, marginBottom: 4 }}>Meta Ads</div>
                        <div style={{ fontSize: 18, fontWeight: 700, color: "#1877F2" }}>
                            R$ {adsData.meta.spend.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                        </div>
                        <div style={{ fontSize: 10, color: T.muted, marginTop: 4 }}>
                            {adsData.meta.clicks.toLocaleString()} cliques · CPM R$ {adsData.meta.cpm.toFixed(2)}
                        </div>
                    </div>
                    <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 8, padding: 16 }}>
                        <div style={{ fontSize: 10, color: T.muted, marginBottom: 4 }}>Google Ads</div>
                        <div style={{ fontSize: 18, fontWeight: 700, color: "#4285F4" }}>
                            R$ {adsData.google.spend.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                        </div>
                        <div style={{ fontSize: 10, color: T.muted, marginTop: 4 }}>
                            {adsData.google.clicks.toLocaleString()} cliques · CPM R$ {adsData.google.cpm.toFixed(2)}
                        </div>
                    </div>
                    <div style={{ background: T.card, border: `1px solid ${T.gold}40`, borderRadius: 8, padding: 16 }}>
                        <div style={{ fontSize: 10, color: T.muted, marginBottom: 4 }}>Total Ads</div>
                        <div style={{ fontSize: 18, fontWeight: 700, color: T.gold }}>
                            R$ {adsData.total.spend.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                        </div>
                        <div style={{ fontSize: 10, color: T.muted, marginTop: 4 }}>
                            {adsData.total.clicks.toLocaleString()} cliques · CPL R$ {cpl.toFixed(2)}
                        </div>
                    </div>
                </div>
            )}

            {/* Table */}
            {!loading && (
                <FunnelMetaTable
                    deals={combinedDeals}
                    year={selectedYear}
                    month={selectedMonth}
                    dateRange={dateRange}
                    target={target}
                    previousMetrics={previousMetrics}
                    monthProgress={monthProgress}
                    cpl={cpl}
                    viewMode={viewMode}
                />
            )}

            {/* Info */}
            {!loading && !target && (
                <div
                    style={{
                        background: `${T.orange}15`,
                        border: `1px solid ${T.orange}40`,
                        borderRadius: 8,
                        padding: 12,
                        fontSize: 12,
                        color: T.orange,
                    }}
                >
                    Nenhuma meta definida para este mês. Os valores de "Planejado" estão zerados.
                </div>
            )}
        </div>
    );
}
