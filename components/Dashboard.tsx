"use client";
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { fetchAllDealsFromDb, fetchFieldMetaFromDb, fetchStagesFromDb, fetchWonDealsFromDb, CLOSER_GROUP_ID } from "@/lib/supabase-api";
import { supabase } from "@/lib/supabase";
import { computeMetrics, type Metrics } from "@/lib/metrics";
import { T, statusColor } from "./dashboard/theme";
import { OverviewTab } from "./dashboard/OverviewTab";
import { FunnelTab } from "./dashboard/FunnelTab";
import { SDRTab } from "./dashboard/SDRTab";
import { CloserTab } from "./dashboard/CloserTab";
import { PipelineTab } from "./dashboard/PipelineTab";
import { DictionaryTab } from "./dashboard/DictionaryTab";
import { ContratosTab } from "./dashboard/ContratosTab";
import { PerfilScoreTab } from "./dashboard/PerfilScoreTab";
import { FunnelMetaTab } from "./dashboard/FunnelMetaTab";
import { ChatTab } from "./dashboard/ChatTab";
import { ChatPopup } from "./dashboard/ChatPopup";
import { ChangelogModal } from "./dashboard/ChangelogModal";
import { TabErrorBoundary } from "./dashboard/ErrorBoundary";
import { CURRENT_VERSION } from "@/lib/versions";
import { type WonDeal } from "@/lib/schemas";
import { useChat } from "@/lib/use-chat";
import { buildTabContext } from "@/lib/chat-context";

// Deduplicate deals by ID
function deduplicateDeals(deals: WonDeal[]): WonDeal[] {
    const seen = new Set<string>();
    return deals.filter((d) => {
        if (seen.has(d.id)) return false;
        seen.add(d.id);
        return true;
    });
}

type TabId = "overview" | "funnel" | "sdr" | "closer" | "pipeline" | "contratos" | "perfil-score" | "dictionary" | "funnel-metas" | "chat";

const TABS: { id: TabId; label: string }[] = [
    { id: "overview", label: "Visão Geral" },
    { id: "funnel-metas", label: "Funil" },
    { id: "sdr", label: "SDR" },
    { id: "closer", label: "Closer" },
    { id: "pipeline", label: "Pipeline" },
    { id: "contratos", label: "Contratos" },
    { id: "perfil-score", label: "Perfil & Score" },
    { id: "dictionary", label: "Dicionário" },
    { id: "chat", label: "Chat IA" },
];

// ─── HEADER ───────────────────────────────────────────────────────────────────
interface SyncLog {
    id: number;
    started_at: string;
    finished_at: string;
    hours_back: number;
    synced: number;
    pages: number;
    errors: string[] | null;
    trigger_source: string;
}

interface HeaderProps {
    tab: TabId;
    setTab: (t: TabId) => void;
    metrics: Metrics | null;
    loading: boolean;
    lastUpdate: string | null;
    onRefresh: () => void;
    onVersionClick: () => void;
    onSync: () => void;
    syncing: boolean;
    syncResult: { synced?: number; error?: string } | null;
    lastSyncLog: SyncLog | null;
}

function formatSyncAge(iso: string): string {
    const ms = Date.now() - new Date(iso).getTime();
    const min = Math.floor(ms / 60000);
    if (min < 1) return "agora";
    if (min < 60) return `${min}min atrás`;
    const h = Math.floor(min / 60);
    if (h < 24) return `${h}h atrás`;
    return `${Math.floor(h / 24)}d atrás`;
}

function Header({ tab, setTab, metrics, loading, lastUpdate, onRefresh, onVersionClick, onSync, syncing, syncResult, lastSyncLog }: HeaderProps) {
    return (
        <div style={{ background: T.surface, borderBottom: `1px solid ${T.border}`, padding: "0 28px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", maxWidth: 1200, margin: "0 auto", padding: "16px 0" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                    <img src="/logo-ww.png" alt="Welcome Weddings" style={{ height: 90, width: "auto", objectFit: "contain" }} />
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
                        id="btn-sync"
                        onClick={onSync}
                        disabled={syncing}
                        title="Sincronizar deals do ActiveCampaign"
                        style={{ background: syncing ? T.card : "#1a2636", border: `1px solid ${syncing ? T.border : "#2a6"}`, borderRadius: 8, padding: "6px 12px", color: syncing ? T.muted : "#4aea8b", fontSize: 11, cursor: syncing ? "wait" : "pointer", fontFamily: "inherit", fontWeight: 600 }}
                    >
                        {syncing ? "⟳ Sincronizando…" : "⇅ Sync AC"}
                    </button>
                    {syncResult && (
                        <span style={{ fontSize: 10, color: syncResult.error ? "#f66" : "#4aea8b" }}>
                            {syncResult.error ? `Erro: ${syncResult.error}` : `${syncResult.synced} deals sincronizados`}
                        </span>
                    )}
                    {!syncResult && lastSyncLog && (() => {
                        const ageMin = Math.floor((Date.now() - new Date(lastSyncLog.finished_at).getTime()) / 60000);
                        const hasErrors = lastSyncLog.errors && lastSyncLog.errors.length > 0;
                        const healthColor = hasErrors ? "#f66" : ageMin > 240 ? "#f66" : ageMin > 150 ? "#fa0" : "#4aea8b";
                        const healthDot = hasErrors ? "🔴" : ageMin > 240 ? "🔴" : ageMin > 150 ? "🟡" : "🟢";
                        return (
                            <span style={{ fontSize: 10, color: healthColor }} title={`Último sync: ${new Date(lastSyncLog.finished_at).toLocaleString("pt-BR")} · ${lastSyncLog.synced} deals · ${lastSyncLog.trigger_source}${hasErrors ? ` · ${lastSyncLog.errors!.length} erros` : ""}`}>
                                {healthDot} Sync: {formatSyncAge(lastSyncLog.finished_at)} · {lastSyncLog.synced} deals
                            </span>
                        );
                    })()}
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
    const [metrics, setMetrics] = useState<Metrics | null>(null);
    const [sdrDeals, setSdrDeals] = useState<WonDeal[]>([]);
    const [wonDeals, setWonDeals] = useState<WonDeal[]>([]);
    const [closerDeals, setCloserDeals] = useState<WonDeal[]>([]);
    const [acFieldMap, setAcFieldMap] = useState<Record<string, string>>({});
    const [acStageMap, setAcStageMap] = useState<Record<string, string>>({});
    const [lastUpdate, setLastUpdate] = useState<string | null>(null);
    const [isChangelogOpen, setIsChangelogOpen] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [syncResult, setSyncResult] = useState<{ synced?: number; error?: string } | null>(null);
    const [lastSyncLog, setLastSyncLog] = useState<SyncLog | null>(null);
    const chat = useChat();

    const loadData = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            setLoadStep("Carregando dados…");

            // Fetch all data sources in parallel — use allSettled so partial failures
            // don't discard all data (e.g. sync_logs failing shouldn't block the dashboard)
            const results = await Promise.allSettled([
                fetchFieldMetaFromDb(),                             // 0
                fetchStagesFromDb(),                                // 1
                fetchAllDealsFromDb("1", 180),                      // 2 SDR P1
                fetchAllDealsFromDb("3", 180),                      // 3 SDR P3
                fetchAllDealsFromDb(CLOSER_GROUP_ID, 365),          // 4 Closer
                fetchWonDealsFromDb(CLOSER_GROUP_ID),               // 5 Won
                supabase.from("sync_logs").select("*").order("id", { ascending: false }).limit(1), // 6
            ]);

            const get = <T,>(idx: number, fallback: T): T =>
                results[idx].status === "fulfilled" ? (results[idx] as PromiseFulfilledResult<T>).value : fallback;

            // Critical sources — if these fail, we can't render
            const fieldMap = get<Record<string, string>>(0, {});
            const stageMap = get<Record<string, string>>(1, {});
            const sdrP1 = get<WonDeal[]>(2, []);
            const sdrP3 = get<WonDeal[]>(3, []);
            const closerData = get<WonDeal[]>(4, []);
            const wonData = get<WonDeal[]>(5, []);

            // If all deal fetches returned empty AND at least one failed, it's a real error
            const dealsFailed = [2, 3, 4, 5].filter(i => results[i].status === "rejected");
            if (dealsFailed.length === 4) {
                const firstErr = (results[2] as PromiseRejectedResult).reason;
                throw new Error(`Falha ao buscar deals: ${firstErr}`);
            }

            setAcFieldMap(fieldMap);
            setAcStageMap(stageMap);
            const combinedSdr = [...sdrP1, ...sdrP3];
            setSdrDeals(combinedSdr);
            setCloserDeals(closerData);
            setWonDeals(wonData);

            setLoadStep("Calculando métricas…");
            setMetrics(computeMetrics(sdrP1, closerData, wonData, fieldMap, stageMap));

            // Non-critical: sync logs (OK to fail silently)
            const syncResult = get<{ data: SyncLog[] | null }>(6, { data: null });
            if (syncResult.data && syncResult.data.length > 0) setLastSyncLog(syncResult.data[0]);

            // Log partial failures for debugging
            const failures = results
                .map((r, i) => r.status === "rejected" ? i : null)
                .filter(i => i !== null);
            if (failures.length > 0) {
                console.warn(`[Dashboard] Partial load failures at indices: ${failures.join(", ")}`);
            }

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

    const handleSync = useCallback(async () => {
        setSyncing(true);
        setSyncResult(null);
        try {
            const resp = await fetch("/api/sync", { method: "POST" });
            const data = await resp.json();
            if (!resp.ok) {
                setSyncResult({ error: data.error || `HTTP ${resp.status}` });
            } else {
                setSyncResult({ synced: data.synced ?? 0 });
                // Auto-refresh dashboard data after sync
                loadData();
            }
        } catch (e) {
            setSyncResult({ error: e instanceof Error ? e.message : "Falha na conexão" });
        } finally {
            setSyncing(false);
            // Clear result after 8 seconds
            setTimeout(() => setSyncResult(null), 8000);
        }
    }, [loadData]);

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
        onSync: handleSync,
        syncing,
        syncResult,
        lastSyncLog,
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

    // Memoize derived data to avoid recalculating on every render
    const allDeals = useMemo(
        () => deduplicateDeals([...wonDeals, ...sdrDeals, ...closerDeals]),
        [wonDeals, sdrDeals, closerDeals]
    );

    const chatContext = useMemo(
        () => metrics ? buildTabContext(tab, { metrics, sdrDeals, closerDeals, wonDeals, fieldMap: acFieldMap, stageMap: acStageMap }) : "",
        [tab, metrics, sdrDeals, closerDeals, wonDeals, acFieldMap, acStageMap]
    );

    if (!metrics) return null;

    return (
        <div style={{ background: T.bg, minHeight: "100vh", color: T.white, fontFamily: "'Trebuchet MS', 'Lucida Grande', sans-serif" }}>
            <Header {...headerProps} />
            <div style={{ maxWidth: 1200, margin: "0 auto", padding: "24px 28px 48px" }}>
                <TabErrorBoundary key={tab} tabLabel={TABS.find(t => t.id === tab)?.label}>
                {tab === "overview" && <OverviewTab sdrDeals={sdrDeals} closerDeals={closerDeals} wonDeals={wonDeals} fieldMap={acFieldMap} stageMap={acStageMap} allDeals={allDeals} />}
                {tab === "sdr" && <SDRTab deals={sdrDeals} fieldMap={acFieldMap} />}
                {tab === "funnel" && <FunnelTab m={metrics} />}
                {tab === "closer" && <CloserTab m={metrics} />}
                {tab === "pipeline" && <PipelineTab m={metrics} />}
                {tab === "contratos" && <ContratosTab deals={wonDeals} fieldMap={acFieldMap} />}
                {tab === "perfil-score" && <PerfilScoreTab wonDeals={wonDeals} closerDeals={closerDeals} sdrDeals={sdrDeals} fieldMap={acFieldMap} />}
                {tab === "dictionary" && <DictionaryTab />}
                {tab === "funnel-metas" && <FunnelMetaTab allDeals={allDeals} />}
                {tab === "chat" && (
                    <ChatTab
                        messages={chat.messages}
                        sendMessage={chat.sendMessage}
                        isStreaming={chat.isStreaming}
                        clearHistory={chat.clearHistory}
                        stopStreaming={chat.stopStreaming}
                        context={chatContext}
                    />
                )}
                </TabErrorBoundary>
            </div>
            {tab !== "chat" && (
                <ChatPopup
                    messages={chat.messages}
                    sendMessage={chat.sendMessage}
                    isStreaming={chat.isStreaming}
                    clearHistory={chat.clearHistory}
                    stopStreaming={chat.stopStreaming}
                    context={chatContext}
                    currentTab={tab}
                    onOpenFullChat={() => setTab("chat")}
                />
            )}
            <ChangelogModal
                isOpen={isChangelogOpen}
                onClose={() => setIsChangelogOpen(false)}
            />
        </div>
    );
}
