"use client";
import { useState, useEffect, useCallback } from "react";
import { fetchAllDealsFromDb, fetchFieldMetaFromDb, fetchStagesFromDb, fetchWonDealsFromDb, SDR_GROUP_ID, CLOSER_GROUP_ID } from "@/lib/supabase-api";
import { computeMetrics, type Metrics } from "@/lib/metrics";
import { T, statusColor } from "./dashboard/theme";
import { OverviewTab } from "./dashboard/OverviewTab";
import { FunnelTab } from "./dashboard/FunnelTab";
import { SDRTab } from "./dashboard/SDRTab";
import { CloserTab } from "./dashboard/CloserTab";
import { PipelineTab } from "./dashboard/PipelineTab";
import { DictionaryTab } from "./dashboard/DictionaryTab";
import { ChangelogModal } from "./dashboard/ChangelogModal";
import { CURRENT_VERSION } from "@/lib/versions";
import { type Deal } from "@/lib/schemas";

type TabId = "overview" | "funnel" | "sdr" | "closer" | "pipeline" | "dictionary";

const TABS: { id: TabId; label: string }[] = [
    { id: "overview", label: "Visão Geral" },
    { id: "sdr", label: "SDR" },
    { id: "closer", label: "Closer" },
    { id: "pipeline", label: "Pipeline" },
    { id: "dictionary", label: "Dicionário" },
];

// ─── HEADER ───────────────────────────────────────────────────────────────────
interface HeaderProps {
    tab: TabId;
    setTab: (t: TabId) => void;
    metrics: Metrics | null;
    loading: boolean;
    lastUpdate: string | null;
    onRefresh: () => void;
    onVersionClick: () => void;
}

function Header({ tab, setTab, metrics, loading, lastUpdate, onRefresh, onVersionClick }: HeaderProps) {
    return (
        <div style={{ background: T.surface, borderBottom: `1px solid ${T.border}`, padding: "0 28px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", maxWidth: 1200, margin: "0 auto", padding: "16px 0" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                    <div style={{ width: 38, height: 38, borderRadius: 10, background: `linear-gradient(135deg, ${T.berry}, ${T.gold})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 900, color: T.white, fontFamily: "Georgia, serif" }}>WW</div>
                    <div>
                        <div style={{ fontSize: 15, fontWeight: 700, color: T.white }}>Welcome Weddings</div>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <div style={{ fontSize: 10, color: T.muted }}>Funil de Vendas · DB Live</div>
                            <span
                                onClick={onVersionClick}
                                style={{
                                    fontSize: 9,
                                    color: T.gold,
                                    background: `${T.gold}15`,
                                    padding: "1px 5px",
                                    borderRadius: 4,
                                    cursor: "pointer",
                                    fontWeight: 700,
                                    border: `1px solid ${T.gold}33`
                                }}
                            >
                                v{CURRENT_VERSION.version}
                            </span>
                        </div>
                    </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    {metrics && (
                        <>
                            <span style={{ background: metrics.convStatus === "red" ? "#3B1515" : "#1A2E1E", border: `1px solid ${statusColor(metrics.convStatus)}`, borderRadius: 20, padding: "4px 12px", fontSize: 10, fontWeight: 700, color: statusColor(metrics.convStatus) }}>
                                {metrics.convStatus === "red" ? "🔴" : metrics.convStatus === "orange" ? "🟡" : "🟢"} CLOSER {metrics.conv_curr}%
                            </span>
                            <span style={{ background: "#1A2E1E", border: `1px solid ${T.green}`, borderRadius: 20, padding: "4px 12px", fontSize: 10, fontWeight: 700, color: T.green }}>
                                🟢 SDR {metrics.sdrThisWeek} leads
                            </span>
                        </>
                    )}
                    <button
                        id="btn-refresh"
                        onClick={onRefresh}
                        disabled={loading}
                        style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 8, padding: "6px 12px", color: T.muted, fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}
                    >
                        {loading ? "⟳" : "↺ Atualizar"}
                    </button>
                    {lastUpdate && <span style={{ fontSize: 10, color: T.muted }}>Atualizado {lastUpdate}</span>}
                </div>
            </div>
            <div style={{ display: "flex", gap: 2, maxWidth: 1200, margin: "0 auto" }}>
                {TABS.map((t) => (
                    <button
                        key={t.id}
                        id={`tab-${t.id}`}
                        onClick={() => setTab(t.id)}
                        style={{ background: "transparent", border: "none", borderBottom: tab === t.id ? `2px solid ${T.gold}` : "2px solid transparent", color: tab === t.id ? T.gold : T.muted, padding: "8px 18px", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}
                    >
                        {t.label}
                    </button>
                ))}
            </div>
        </div>
    );
}

// ─── MAIN DASHBOARD ───────────────────────────────────────────────────────────
export default function Dashboard() {
    const [tab, setTab] = useState<TabId>("overview");
    const [loading, setLoading] = useState(true);
    const [loadStep, setLoadStep] = useState("Conectando ao banco de dados…");
    const [error, setError] = useState<{ type: string; msg: string } | null>(null);
    const [metrics, setMetrics] = useState<any | null>(null);
    const [sdrDeals, setSdrDeals] = useState<Deal[]>([]);
    const [acFieldMap, setAcFieldMap] = useState<Record<string, string>>({});
    const [lastUpdate, setLastUpdate] = useState<string | null>(null);
    const [isChangelogOpen, setIsChangelogOpen] = useState(false);

    const loadData = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            setLoadStep("Configurando mapeamento de campos…");
            const [fieldMap, stageMap] = await Promise.all([
                fetchFieldMetaFromDb(),
                fetchStagesFromDb(),
            ]);
            setAcFieldMap(fieldMap);

            setLoadStep("Carregando leads SDR (últimos 180 dias)…");
            const sdrP1 = await fetchAllDealsFromDb("1", 180);
            const sdrP3 = await fetchAllDealsFromDb("3", 180);
            const combinedSdr = [...sdrP1, ...sdrP3];
            setSdrDeals(combinedSdr);

            setLoadStep("Carregando pipeline Closer (últimos 365 dias)…");
            const closerDeals = await fetchAllDealsFromDb(CLOSER_GROUP_ID, 365);
            setLoadStep("Carregando casamentos ganhos / planejamento…");
            const wonDeals = await fetchWonDealsFromDb(CLOSER_GROUP_ID);

            setLoadStep("Calculando métricas…");
            setMetrics(computeMetrics(sdrP1, closerDeals, wonDeals, fieldMap, stageMap));

            setLastUpdate(new Date().toLocaleTimeString("pt-BR"));
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            console.error("[Dashboard] loadData error:", msg);
            setError({
                type: "db",
                msg,
            });
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadData();
        const timer = setInterval(loadData, 60 * 60 * 1000); // auto-refresh every 60 min
        return () => clearInterval(timer);
    }, [loadData]);

    const headerProps: HeaderProps = {
        tab,
        setTab,
        metrics,
        loading,
        lastUpdate,
        onRefresh: loadData,
        onVersionClick: () => setIsChangelogOpen(true),
    };

    if (loading) {
        return (
            <div style={{ background: T.bg, minHeight: "100vh", color: T.white, fontFamily: "'Trebuchet MS', sans-serif", display: "flex", flexDirection: "column" }}>
                <Header {...headerProps} />
                <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 20 }}>
                    <div className="animate-spin-slow" style={{ fontSize: 36 }}>⟳</div>
                    <div style={{ fontSize: 14, color: T.muted }}>{loadStep}</div>
                    <div style={{ fontSize: 11, color: T.border }}>Lendo do Supabase (deals)…</div>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div style={{ background: T.bg, minHeight: "100vh", color: T.white, fontFamily: "'Trebuchet MS', sans-serif", display: "flex", flexDirection: "column" }}>
                <Header {...headerProps} />
                <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, padding: 32 }}>
                    <div style={{ fontSize: 32 }}>⚠️</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: T.red }}>
                        {error.type === "cors"
                            ? "Erro de CORS — API bloqueou a requisição do browser"
                            : "Erro ao conectar à API"}
                    </div>
                    <div style={{ fontSize: 12, color: T.muted, maxWidth: 480, textAlign: "center", lineHeight: 1.7 }}>{error.msg}</div>
                    <button
                        onClick={loadData}
                        style={{ background: T.berry, border: "none", borderRadius: 8, padding: "10px 24px", color: T.white, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}
                    >
                        Tentar novamente
                    </button>
                </div>
            </div>
        );
    }

    if (!metrics) return null;

    return (
        <div style={{ background: T.bg, minHeight: "100vh", color: T.white, fontFamily: "'Trebuchet MS', 'Lucida Grande', sans-serif" }}>
            <Header {...headerProps} />
            <div style={{ maxWidth: 1200, margin: "0 auto", padding: "24px 28px 48px" }}>
                {tab === "overview" && <OverviewTab m={metrics} />}
                {tab === "sdr" && <SDRTab deals={sdrDeals} fieldMap={acFieldMap} />}
                {tab === "funnel" && <FunnelTab m={metrics} />}
                {tab === "closer" && <CloserTab m={metrics} />}
                {tab === "pipeline" && <PipelineTab m={metrics} />}
                {tab === "dictionary" && <DictionaryTab />}
            </div>
            <ChangelogModal
                isOpen={isChangelogOpen}
                onClose={() => setIsChangelogOpen(false)}
            />
        </div>
    );
}
