"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { T } from "./theme";
import { SectionTitle } from "./SectionTitle";
import { MonthSelector, type DateRangeValue } from "./MonthSelector";
import { FunnelMetaTable } from "./FunnelMetaTable";
import {
    fetchMonthlyTarget,
    fetchAllFunnelDealsForMonth,
    fetchVendasForMonth,
    fetchAllAdsSpend,
    fetchAllAdsDailyData,
    fetchAdsCampaignData,
    upsertMonthlyTarget,
    type AdsSpendData,
    type DailyChartRow,
    type AdsCampaignRow,
} from "@/lib/supabase-api";
import { AdsDailyChart } from "./AdsDailyChart";
import { AdsCampaignTable } from "./AdsCampaignTable";
import { type WonDeal, type MonthlyTarget, type FunnelMetrics } from "@/lib/schemas";
import {
    getMonthProgress,
    isInMonth,
    isCreatedInMonth,
    isElopement,
    isInWwPipeline,
    isInWwLeadsPipeline,
    isInWwMqlPipeline,
    isCloserRealizada,
} from "@/lib/funnel-utils";

interface FunnelMetaTabProps {
    allDeals: WonDeal[];
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
        // Closer Realizada: data_closer in month + reunion evidence filled (reuniao_closer or tipo_reuniao_closer)
        closerRealizada: allWwDeals.filter(
            (d) =>
                isInMonth(d.data_horario_agendamento_closer, year, month) &&
                isCloserRealizada(d)
        ).length,
        // Venda: use provided vendasCount if available, otherwise count all deals with data_fechamento (except Elopement)
        vendas: vendasCount ?? deals.filter((d) => !isElopement(d) && isInMonth(d.data_fechamento, year, month)).length,
    };
}

type ViewMode = "wedding" | "elopement" | "outros" | "total";

/** Aggregates daily chart data into AdsSpendData for a given date range. */
function aggregateDailyToAds(
    daily: DailyChartRow[],
    range: DateRangeValue
): { meta: AdsSpendData; google: AdsSpendData; total: AdsSpendData } {
    const from = range.from.toISOString().slice(0, 10);
    const to = range.to.toISOString().slice(0, 10);
    const filtered = daily.filter((d) => d.date >= from && d.date <= to);

    const meta = { spend: 0, impressions: 0, clicks: 0, cpc: 0, cpm: 0 };
    const google = { spend: 0, impressions: 0, clicks: 0, cpc: 0, cpm: 0 };

    for (const row of filtered) {
        meta.spend += row.metaSpend;
        meta.clicks += row.metaClicks;
        google.spend += row.googleSpend;
        google.clicks += row.googleClicks;
    }

    meta.cpc = meta.clicks > 0 ? meta.spend / meta.clicks : 0;
    google.cpc = google.clicks > 0 ? google.spend / google.clicks : 0;

    const total = {
        spend: meta.spend + google.spend,
        impressions: meta.impressions + google.impressions,
        clicks: meta.clicks + google.clicks,
        cpc: (meta.clicks + google.clicks) > 0 ? (meta.spend + google.spend) / (meta.clicks + google.clicks) : 0,
        cpm: 0,
    };

    return { meta, google, total };
}

export function FunnelMetaTab({ allDeals }: FunnelMetaTabProps) {
    const now = new Date();
    const [selectedYear, setSelectedYear] = useState(now.getFullYear());
    const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);
    const [target, setTarget] = useState<MonthlyTarget | null>(null);
    const [monthDeals, setMonthDeals] = useState<WonDeal[]>([]);
    const [loading, setLoading] = useState(false);
    const [previousMetrics, setPreviousMetrics] = useState<FunnelMetrics | null>(null);
    const [cpl, setCpl] = useState(50);
    const [adsData, setAdsData] = useState<{ meta: AdsSpendData; google: AdsSpendData; total: AdsSpendData } | null>(null);
    const [dailyData, setDailyData] = useState<DailyChartRow[]>([]);
    const [campaignData, setCampaignData] = useState<AdsCampaignRow[]>([]);
    const [dateRange, setDateRange] = useState<DateRangeValue | null>(null);
    const [viewMode, setViewMode] = useState<ViewMode>("wedding");
    const [adsDetailOpen, setAdsDetailOpen] = useState(false);

    const monthProgress = getMonthProgress(selectedYear, selectedMonth);

    const handleDateChange = (year: number, month: number, range?: DateRangeValue | null) => {
        setSelectedYear(year);
        setSelectedMonth(month);
        setDateRange(range ?? null);
    };

    // Sync ads for current month if cache is empty
    const syncAdsIfNeeded = useCallback(async (year: number, month: number, currentAds: { meta: AdsSpendData; google: AdsSpendData }) => {
        const now = new Date();
        const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1;
        const headers = { "Content-Type": "application/json" };

        const fireSync = (endpoint: string, type: string) =>
            fetch(endpoint, {
                method: "POST",
                headers,
                body: JSON.stringify({ year, month, pipeline: "wedding", type }),
            }).then(() => {}).catch((e) => console.warn(`[FunnelMetaTab] ${endpoint} ${type} sync failed:`, e));

        const syncs: Promise<void>[] = [];

        const needsMeta = isCurrentMonth || (currentAds.meta.spend === 0 && currentAds.meta.impressions === 0);
        const needsGoogle = isCurrentMonth || (currentAds.google.spend === 0 && currentAds.google.impressions === 0);

        // Monthly syncs
        if (needsMeta) syncs.push(fireSync("/api/sync-meta-ads", "monthly"));
        if (needsGoogle) syncs.push(fireSync("/api/sync-google-ads", "monthly"));

        // Daily and campaign syncs (always for current month, or if no data)
        if (needsMeta || needsGoogle) {
            syncs.push(fireSync("/api/sync-meta-ads", "daily"));
            syncs.push(fireSync("/api/sync-google-ads", "daily"));
            syncs.push(fireSync("/api/sync-meta-ads", "campaign"));
            syncs.push(fireSync("/api/sync-google-ads", "campaign"));
        }

        await Promise.all(syncs);
    }, []);

    const loadMonthData = useCallback(async () => {
        setLoading(true);
        try {
            // Fetch target, deals, ads, daily, and campaign data for selected month
            const [targetData, dealsData, vendasData, allAds, daily, campaigns] = await Promise.all([
                fetchMonthlyTarget(selectedYear, selectedMonth, "wedding"),
                fetchAllFunnelDealsForMonth(selectedYear, selectedMonth),
                fetchVendasForMonth(selectedYear, selectedMonth),
                fetchAllAdsSpend(selectedYear, selectedMonth),
                fetchAllAdsDailyData(selectedYear, selectedMonth),
                fetchAdsCampaignData(selectedYear, selectedMonth),
            ]);

            setDailyData(daily);
            setCampaignData(campaigns);

            // Sync ads if needed (non-blocking)
            syncAdsIfNeeded(selectedYear, selectedMonth, allAds).then(async () => {
                const [updatedAds, updatedDaily, updatedCampaigns] = await Promise.all([
                    fetchAllAdsSpend(selectedYear, selectedMonth),
                    fetchAllAdsDailyData(selectedYear, selectedMonth),
                    fetchAdsCampaignData(selectedYear, selectedMonth),
                ]);
                if (updatedAds.meta.spend !== allAds.meta.spend || updatedAds.google.spend !== allAds.google.spend) {
                    setAdsData(dateRange ? aggregateDailyToAds(updatedDaily, dateRange) : updatedAds);
                }
                if (updatedDaily.length > daily.length) {
                    setDailyData(updatedDaily);
                    if (dateRange) setAdsData(aggregateDailyToAds(updatedDaily, dateRange));
                }
                if (updatedCampaigns.length > campaigns.length) setCampaignData(updatedCampaigns);
            });

            setTarget(targetData);
            // When dateRange is set, aggregate ads from daily data for that range
            setAdsData(dateRange ? aggregateDailyToAds(daily, dateRange) : allAds);

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
    }, [selectedYear, selectedMonth, dateRange]);

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
                            onClick={() => setViewMode("outros")}
                            style={{
                                padding: "6px 12px",
                                fontSize: 11,
                                fontWeight: 600,
                                border: "none",
                                borderRadius: 4,
                                cursor: "pointer",
                                background: viewMode === "outros" ? T.orange : "transparent",
                                color: viewMode === "outros" ? T.bg : T.muted,
                                transition: "all 0.15s",
                            }}
                            title="Outros Desqualificados + Internacional"
                        >
                            Outros / Intl
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
                <MonthSelector selectedYear={selectedYear} selectedMonth={selectedMonth} dateRange={dateRange} onChange={handleDateChange} />
            </div>

            {/* Loading state */}
            {loading && (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 40 }}>
                    <div style={{ fontSize: 14, color: T.muted }}>Carregando dados...</div>
                </div>
            )}

            {/* Ads Breakdown Cards (always visible) */}
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
                    totalAdsSpend={adsData?.total.spend ?? 0}
                    viewMode={viewMode}
                    onTargetUpdate={async (field, value) => {
                        const updated = await upsertMonthlyTarget(selectedYear, selectedMonth, "wedding", { [field]: value });
                        if (updated) setTarget(updated);
                    }}
                />
            )}

            {/* Ads Detail — collapsible (daily chart + campaigns) */}
            {!loading && adsData && (dailyData.length > 0 || campaignData.length > 0) && (
                <div>
                    <button
                        onClick={() => setAdsDetailOpen((v) => !v)}
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            background: "none",
                            border: `1px solid ${T.border}`,
                            borderRadius: 8,
                            padding: "10px 16px",
                            cursor: "pointer",
                            color: T.cream,
                            fontSize: 13,
                            fontWeight: 600,
                            width: "100%",
                        }}
                    >
                        <span style={{ transform: adsDetailOpen ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.15s" }}>
                            ▶
                        </span>
                        Ads Detail — Spend Diário & Campanhas
                    </button>

                    {adsDetailOpen && (
                        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 12 }}>
                            {dailyData.length > 0 && <AdsDailyChart data={dailyData} />}
                            {campaignData.length > 0 && <AdsCampaignTable data={campaignData} />}
                        </div>
                    )}
                </div>
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
