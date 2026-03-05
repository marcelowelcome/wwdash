"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import {
    BarChart, Bar,
    XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer,
    ComposedChart, Line,
} from "recharts";
import { SectionTitle } from "./SectionTitle";
import { CustomTooltip } from "./CustomTooltip";
import { T } from "./theme";
import { type WonDeal } from "@/lib/schemas";
import {
    buildSimpleScoreProfiles,
    scoreSimpleDeals,
    buildMonthlyProfiles,
    buildSeasonality,
    buildMonthlyLeadPotential,
    assessSimpleFunnelQuality,
    type SimpleScoredDeal,
    type MonthlyProfile,
    type MonthlyLeadPotential,
    type ScoreBands,
    DEFAULT_SCORE_BANDS,
    SCORE_CONFIG_KEY,
} from "@/lib/lead-score";

// ─── Props ────────────────────────────────────────────────────────────────────

interface PerfilScoreTabProps {
    wonDeals: WonDeal[];
    closerDeals: WonDeal[];
    sdrDeals: WonDeal[];
    fieldMap: Record<string, string>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmtBRL = (v: number) => v >= 1000 ? `R$ ${(v / 1000).toFixed(0)}k` : `R$ ${v}`;
const fmtBRLFull = (v: number) => `R$ ${v.toLocaleString("pt-BR")}`;

const BAND_COLOR: Record<string, string> = { A: "#3DBF8A", B: "#D4A35A", C: "#E08C3A", D: "#E05252" };
const BAND_BG: Record<string, string> = { A: "#3DBF8A22", B: "#D4A35A22", C: "#E08C3A22", D: "#E0525222" };

function ScoreBadge({ band, total }: { band: string; total: number }) {
    return (
        <span style={{
            background: BAND_BG[band],
            color: BAND_COLOR[band],
            border: `1px solid ${BAND_COLOR[band]}55`,
            borderRadius: 6,
            padding: "2px 10px",
            fontSize: 11,
            fontWeight: 800,
            letterSpacing: "0.05em",
        }}>
            {band} · {total}
        </span>
    );
}

function AlignmentBar({ pct, color = T.gold }: { pct: number; color?: string }) {
    return (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ flex: 1, height: 6, background: T.border, borderRadius: 3, overflow: "hidden" }}>
                <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 3, transition: "width 0.4s" }} />
            </div>
            <span style={{ fontSize: 10, color: T.white, minWidth: 28, textAlign: "right" }}>{pct}%</span>
        </div>
    );
}

// ─── Sub-Navigation ───────────────────────────────────────────────────────────

type Section = "perfil" | "potencial" | "score" | "funil" | "analise" | "contratos" | "config";

const SECTIONS: { id: Section; label: string }[] = [
    { id: "perfil", label: "Perfil Mensal" },
    { id: "potencial", label: "Potencial por Mês" },
    { id: "score", label: "Score Board" },
    { id: "funil", label: "Qualidade do Funil" },
    { id: "analise", label: "Painel Comparativo" },
    { id: "contratos", label: "Contratos Fechados" },
    { id: "config", label: "Config Score" },
];

// ─── Month helpers ────────────────────────────────────────────────────────────

const PT_MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

function dateToMonthKey(dateStr: string | null | undefined): string | null {
    if (!dateStr) return null;
    const iso = dateStr.length >= 7 ? dateStr.substring(0, 7) : null;
    return iso;
}

function monthKeyToLabel(mk: string): string {
    const [year, month] = mk.split("-");
    return `${PT_MONTHS[parseInt(month) - 1]}/${year.slice(2)}`;
}

type SortState = { col: string; dir: "asc" | "desc" };

function sortDeals(deals: SimpleScoredDeal[], sort: SortState): SimpleScoredDeal[] {
    return [...deals].sort((a, b) => {
        let va: number | string, vb: number | string;
        switch (sort.col) {
            case "score": va = a.score.total; vb = b.score.total; break;
            case "status":
                va = a.data_fechamento ? 0 : a.status === "2" ? 1 : 2;
                vb = b.data_fechamento ? 0 : b.status === "2" ? 1 : 2;
                break;
            case "destino": va = a.destino ?? ""; vb = b.destino ?? ""; break;
            case "convidados": va = a.num_convidados ?? -1; vb = b.num_convidados ?? -1; break;
            case "orcamento": va = a.orcamento ?? -1; vb = b.orcamento ?? -1; break;
            case "fechado": va = a.valor_fechado_em_contrato ?? -1; vb = b.valor_fechado_em_contrato ?? -1; break;
            default: return 0;
        }
        if (va < vb) return sort.dir === "asc" ? -1 : 1;
        if (va > vb) return sort.dir === "asc" ? 1 : -1;
        return 0;
    });
}

// ─── Heatmap pivot helpers ────────────────────────────────────────────────────

const CONV_BUCKETS = ["≤50", "51-100", "101-150", "151-200", "201+", "Sem dados"] as const;
type ConvBucket = typeof CONV_BUCKETS[number];

function getConvBucket(n: number | null | undefined): ConvBucket {
    if (n == null) return "Sem dados";
    if (n <= 50) return "≤50";
    if (n <= 100) return "51-100";
    if (n <= 150) return "101-150";
    if (n <= 200) return "151-200";
    return "201+";
}

const ORC_BUCKETS = ["≤15k", "15-30k", "30-50k", "50-80k", "80-120k", "120k+", "Sem dados"] as const;
type OrcBucket = typeof ORC_BUCKETS[number];

function getOrcBucket(v: number | null | undefined): OrcBucket {
    if (v == null) return "Sem dados";
    if (v <= 15000) return "≤15k";
    if (v <= 30000) return "15-30k";
    if (v <= 50000) return "30-50k";
    if (v <= 80000) return "50-80k";
    if (v <= 120000) return "80-120k";
    return "120k+";
}

interface HeatCell { leads: number; won: number; lost: number; }
interface HeatRow { dest: string; bm: Map<string, HeatCell>; total: HeatCell; }

function buildHeatmapPivot(
    deals: SimpleScoredDeal[],
    months: string[],
    colDim: "convidados" | "orcamento",
    dateField: "cdate" | "data_fechamento" = "cdate",
    maxRows = 12,
): { rows: HeatRow[]; activeBuckets: string[] } {
    const filtered = months.length === 0
        ? deals
        : deals.filter(d => {
            const raw = dateField === "cdate" ? d.cdate : d.data_fechamento;
            const mk = raw ? raw.substring(0, 7) : null;
            return mk !== null && months.includes(mk);
        });

    const getBkt = (d: SimpleScoredDeal): string =>
        colDim === "convidados" ? getConvBucket(d.num_convidados) : getOrcBucket(d.orcamento);
    const allBuckets: readonly string[] = colDim === "convidados" ? CONV_BUCKETS : ORC_BUCKETS;

    const destMap = new Map<string, Map<string, HeatCell>>();
    for (const d of filtered) {
        const dest = d.destino || "Não informado";
        const bucket = getBkt(d);
        if (!destMap.has(dest)) destMap.set(dest, new Map());
        const bm = destMap.get(dest)!;
        if (!bm.has(bucket)) bm.set(bucket, { leads: 0, won: 0, lost: 0 });
        const cell = bm.get(bucket)!;
        cell.leads++;
        if (d.data_fechamento) cell.won++;
        else if (d.status === "2") cell.lost++;
    }

    const rows: HeatRow[] = [...destMap.entries()].map(([dest, bm]) => {
        const allCells = [...bm.values()];
        return {
            dest, bm,
            total: {
                leads: allCells.reduce((s, c) => s + c.leads, 0),
                won: allCells.reduce((s, c) => s + c.won, 0),
                lost: allCells.reduce((s, c) => s + c.lost, 0),
            },
        };
    }).sort((a, b) => b.total.leads - a.total.leads).slice(0, maxRows);

    // Sempre retorna todos os buckets (exceto "Sem dados") para exibição consistente
    const activeBuckets = [...allBuckets].filter(b => b !== "Sem dados");
    return { rows, activeBuckets };
}

// ─── Main Component ────────────────────────────────────────────────────────────

export function PerfilScoreTab({ wonDeals, closerDeals, sdrDeals, fieldMap }: PerfilScoreTabProps) {
    const [section, setSection] = useState<Section>("perfil");
    const [selectedMonthKey, setSelectedMonthKey] = useState<string | null>(null);
    const [monthA, setMonthA] = useState<string | null>(null);
    const [monthB, setMonthB] = useState<string | null>(null);
    const [sortA, setSortA] = useState<SortState>({ col: "score", dir: "desc" });
    const [sortB, setSortB] = useState<SortState>({ col: "score", dir: "desc" });
    const [monthsLeft, setMonthsLeft] = useState<string[]>([]);
    const [monthsRight, setMonthsRight] = useState<string[]>([]);
    const [dimCol, setDimCol] = useState<"convidados" | "orcamento">("convidados");
    const [drillCell, setDrillCell] = useState<{ side: "left" | "right"; dest: string; bucket: string | null } | null>(null);
    const [hoveredDeal, setHoveredDeal] = useState<{ deal: SimpleScoredDeal; x: number; y: number } | null>(null);
    const [hoveredMonth, setHoveredMonth] = useState<{ monthKey: string; x: number; y: number } | null>(null);
    const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const hideMonthRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    function showTooltip(deal: SimpleScoredDeal, x: number, y: number) {
        if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
        setHoveredDeal({ deal, x, y });
    }
    function scheduleHide() {
        hideTimeoutRef.current = setTimeout(() => setHoveredDeal(null), 200);
    }
    function cancelHide() {
        if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
    }
    function showMonthTooltip(monthKey: string, x: number, y: number) {
        if (hideMonthRef.current) clearTimeout(hideMonthRef.current);
        setHoveredMonth({ monthKey, x, y });
    }
    function scheduleHideMonth() {
        hideMonthRef.current = setTimeout(() => setHoveredMonth(null), 200);
    }
    function cancelHideMonth() {
        if (hideMonthRef.current) clearTimeout(hideMonthRef.current);
    }

    // Bands stored in localStorage; weights are fixed (equal 1/3 each)
    const [bands, setBands] = useState<ScoreBands>(() => {
        try {
            const saved = typeof window !== "undefined" ? localStorage.getItem(SCORE_CONFIG_KEY) : null;
            if (saved) {
                const parsed = JSON.parse(saved);
                if (parsed.bands) return parsed.bands;
            }
        } catch { /* ignore */ }
        return DEFAULT_SCORE_BANDS;
    });

    // ── Simple score profiles from closer deals (won + lost) ──────────────
    const simpleProfiles = useMemo(() => buildSimpleScoreProfiles(closerDeals, wonDeals), [closerDeals, wonDeals]);

    // ── Open deals for scoring ────────────────────────────────────────────
    const openDeals = useMemo(() => closerDeals.filter(d => d.status === "1"), [closerDeals]);

    // ── Score open deals with 3 marketing fields ──────────────────────────
    const scored = useMemo<SimpleScoredDeal[]>(
        () => scoreSimpleDeals(openDeals, simpleProfiles, bands),
        [openDeals, simpleProfiles, bands]
    );

    // ── Monthly profiles from won deals (by close date) ───────────────────
    const monthlyProfiles = useMemo<MonthlyProfile[]>(
        () => buildMonthlyProfiles(wonDeals, fieldMap),
        [wonDeals, fieldMap]
    );

    // ── Seasonality ───────────────────────────────────────────────────────
    const seasonality = useMemo(() => buildSeasonality(wonDeals), [wonDeals]);

    // ── Score counts (open deals) ─────────────────────────────────────────
    const scoreCounts = useMemo(() => {
        const c = { A: 0, B: 0, C: 0, D: 0 };
        for (const d of scored) c[d.score.band]++;
        return c;
    }, [scored]);

    // ── Score all historical won deals ────────────────────────────────────
    const scoredWon = useMemo<SimpleScoredDeal[]>(
        () => scoreSimpleDeals(wonDeals, simpleProfiles, bands),
        [wonDeals, simpleProfiles, bands]
    );

    // ── All pipeline deals: pipe 1 + pipe 3 + wonDeals (outros pipes), deduped
    // wonDeals vêm de qualquer pipeline (sem filtro de grupo), necessário para
    // capturar contratos ganhos que migraram para fora dos pipes 1 e 3.
    const allPipelineDeals = useMemo(() => {
        const seen = new Set<string>();
        const out: typeof closerDeals = [];
        // wonDeals primeiro para que data_fechamento real prevaleça sobre
        // versões Open/Lost do mesmo deal em sdrDeals/closerDeals
        for (const d of [...wonDeals, ...sdrDeals, ...closerDeals]) {
            if (!seen.has(d.id)) { seen.add(d.id); out.push(d); }
        }
        return out;
    }, [sdrDeals, closerDeals, wonDeals]);

    // ── Monthly lead potential: closer deals + won deals that migrated ────
    const closerAndWonDeals = useMemo(() =>
        allPipelineDeals.filter(d => d.group_id === "3" || !!d.data_fechamento),
        [allPipelineDeals]
    );
    const monthlyPotential = useMemo<MonthlyLeadPotential[]>(
        () => buildMonthlyLeadPotential(closerAndWonDeals, simpleProfiles, bands),
        [closerAndWonDeals, simpleProfiles, bands]
    );

    // Last 12 months for the chart
    const potentialLast12 = useMemo(() => monthlyPotential.slice(-12), [monthlyPotential]);

    // ── Score all pipeline deals (pipe 1 + 3) ────────────────────────────
    const scoredAll = useMemo<SimpleScoredDeal[]>(
        () => scoreSimpleDeals(allPipelineDeals, simpleProfiles, bands),
        [allPipelineDeals, simpleProfiles, bands]
    );

    // ── Open deals across ALL pipelines (mesmas premissas do comparativo) ─
    // Aberto = sem data_fechamento E não perdido (status !== "2")
    const allOpenDeals = useMemo(
        () => allPipelineDeals.filter(d => !d.data_fechamento && d.status !== "2"),
        [allPipelineDeals]
    );
    const scoredAllOpen = useMemo<SimpleScoredDeal[]>(
        () => scoreSimpleDeals(allOpenDeals, simpleProfiles, bands),
        [allOpenDeals, simpleProfiles, bands]
    );
    const funnelQuality = useMemo(
        () => assessSimpleFunnelQuality(allOpenDeals, simpleProfiles, scoredAllOpen),
        [allOpenDeals, simpleProfiles, scoredAllOpen]
    );

    // ── Tier conversion stats (pipe 1+3): ganho = data_fechamento preenchida
    const tierConvStats = useMemo(() => {
        const stats: Record<string, { total: number; won: number; lost: number; open: number }> = {
            A: { total: 0, won: 0, lost: 0, open: 0 },
            B: { total: 0, won: 0, lost: 0, open: 0 },
            C: { total: 0, won: 0, lost: 0, open: 0 },
            D: { total: 0, won: 0, lost: 0, open: 0 },
        };
        for (const d of scoredAll) {
            const b = d.score.band;
            stats[b].total++;
            if (d.data_fechamento) stats[b].won++;
            else if (d.status === "2") stats[b].lost++;
            else stats[b].open++;
        }
        return (["A", "B", "C", "D"] as const).map(band => {
            const s = stats[band];
            const resolved = s.won + s.lost;
            return { band, ...s, convRate: resolved > 0 ? Math.round(s.won / resolved * 100) : null };
        });
    }, [scoredAll]);

    // ── Group ALL pipeline deals by creation month (cdate) ───────────────
    const allByCreationMonth = useMemo(() => {
        const map = new Map<string, SimpleScoredDeal[]>();
        for (const d of scoredAll) {
            const mk = dateToMonthKey(d.cdate);
            if (!mk) continue;
            if (!map.has(mk)) map.set(mk, []);
            map.get(mk)!.push(d);
        }
        return map;
    }, [scoredAll]);

    // ── Won deals by close month (for the existing comparison panel table) ─
    const wonByCloseMonth = useMemo(() => {
        const map = new Map<string, SimpleScoredDeal[]>();
        for (const d of scoredWon) {
            const mk = dateToMonthKey(d.data_fechamento);
            if (!mk) continue;
            if (!map.has(mk)) map.set(mk, []);
            map.get(mk)!.push(d);
        }
        return map;
    }, [scoredWon]);

    const availableContractMonths = useMemo(
        () => [...allByCreationMonth.keys()].sort().reverse(),
        [allByCreationMonth]
    );

    // ── Available cdate months from pipelines 1 e 3 (Painel Comparativo — direita)
    const availableCdateMonths = useMemo(() => {
        const months = new Set<string>();
        for (const d of allPipelineDeals) {
            if (d.group_id !== "1" && d.group_id !== "3") continue;
            const mk = d.cdate ? d.cdate.substring(0, 7) : null;
            if (mk) months.add(mk);
        }
        return [...months].sort().reverse();
    }, [allPipelineDeals]);

    // ── Available close-date months from won deals (Painel Comparativo — esquerda)
    const availableCloseDateMonths = useMemo(() => {
        const months = new Set<string>();
        for (const d of scoredWon) {
            const mk = d.data_fechamento ? d.data_fechamento.substring(0, 7) : null;
            if (mk) months.add(mk);
        }
        return [...months].sort().reverse();
    }, [scoredWon]);

    // Auto-select most recent month in Perfil Mensal
    useEffect(() => {
        if (monthlyProfiles.length > 0 && !selectedMonthKey) {
            setSelectedMonthKey(monthlyProfiles[monthlyProfiles.length - 1].monthKey);
        }
    }, [monthlyProfiles, selectedMonthKey]);

    // Auto-select two most recent months for comparison
    useEffect(() => {
        if (availableContractMonths.length > 0 && !monthA) {
            setMonthA(availableContractMonths[0]);
        }
        if (availableContractMonths.length > 1 && !monthB) {
            setMonthB(availableContractMonths[1]);
        }
    }, [availableContractMonths, monthA, monthB]);

    // Auto-init Painel Comparativo: left = 6 meses de fechamento, right = mês atual de captação
    useEffect(() => {
        if (availableCloseDateMonths.length > 0 && availableCdateMonths.length > 0
            && monthsLeft.length === 0 && monthsRight.length === 0) {
            setMonthsLeft(availableCloseDateMonths.slice(0, 6));
            setMonthsRight([availableCdateMonths[0]]);
        }
    }, [availableCloseDateMonths, availableCdateMonths]);  // eslint-disable-line react-hooks/exhaustive-deps

    const selectedProfile = useMemo(
        () => monthlyProfiles.find(p => p.monthKey === selectedMonthKey) ?? null,
        [monthlyProfiles, selectedMonthKey]
    );

    // ─── HANDLERS ────────────────────────────────────────────────────────────

    function handleBandChange(key: "A" | "B" | "C", val: number) {
        setBands(prev => ({ ...prev, [key]: val }));
    }
    function handleSave() { localStorage.setItem(SCORE_CONFIG_KEY, JSON.stringify({ bands })); }
    function handleReset() { setBands(DEFAULT_SCORE_BANDS); localStorage.removeItem(SCORE_CONFIG_KEY); }

    // ─── RENDER ───────────────────────────────────────────────────────────────

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>

            {/* Sub-navigation */}
            <div style={{ display: "flex", gap: 4, borderBottom: `1px solid ${T.border}`, paddingBottom: 0 }}>
                {SECTIONS.map(s => (
                    <button key={s.id} onClick={() => setSection(s.id)} style={{
                        background: "transparent", border: "none",
                        borderBottom: section === s.id ? `2px solid ${T.rose}` : "2px solid transparent",
                        color: section === s.id ? T.rose : T.muted,
                        padding: "8px 16px", fontSize: 12, fontWeight: 600,
                        cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s",
                    }}>
                        {s.label}
                    </button>
                ))}
                {simpleProfiles.totalResolvidos < 10 && (
                    <span style={{ marginLeft: "auto", fontSize: 10, color: T.orange, alignSelf: "center", paddingRight: 4 }}>
                        ⚠ Poucos dados resolvidos ({simpleProfiles.totalResolvidos}) — score com confiabilidade baixa
                    </span>
                )}
            </div>

            {/* ════════════════════════════════════════════════════════════
                SEÇÃO 1 — PERFIL MENSAL
            ═══════════════════════════════════════════════════════════════ */}
            {section === "perfil" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
                    {monthlyProfiles.length === 0 ? (
                        <div style={{ padding: 40, textAlign: "center", color: T.muted, fontSize: 13 }}>
                            Sem contratos fechados com data de fechamento registrada.
                        </div>
                    ) : (
                        <>
                            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                                {monthlyProfiles.slice(-18).map(p => (
                                    <button key={p.monthKey} onClick={() => setSelectedMonthKey(p.monthKey)} style={{
                                        background: selectedMonthKey === p.monthKey ? T.rose : T.card,
                                        color: selectedMonthKey === p.monthKey ? T.bg : T.muted,
                                        border: `1px solid ${selectedMonthKey === p.monthKey ? T.rose : T.border}`,
                                        borderRadius: 20, padding: "4px 12px", fontSize: 11, fontWeight: 600, cursor: "pointer", transition: "all 0.15s",
                                    }}>
                                        {p.month}<span style={{ marginLeft: 4, opacity: 0.7 }}>({p.contratos})</span>
                                    </button>
                                ))}
                            </div>

                            {selectedProfile && (
                                <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16 }}>
                                    <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: "20px 22px" }}>
                                        <SectionTitle>Perfil de {selectedProfile.month}</SectionTitle>
                                        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginTop: 14 }}>
                                            {[
                                                { label: "Contratos", value: String(selectedProfile.contratos) },
                                                { label: "Convidados (médio)", value: selectedProfile.mediaConvidados ? String(selectedProfile.mediaConvidados) : "—" },
                                                { label: "Orçamento Médio", value: selectedProfile.avgOrcamento ? fmtBRLFull(selectedProfile.avgOrcamento) : "—" },
                                                { label: "Tempo Médio Fechamento", value: selectedProfile.tempoMedio ? `${selectedProfile.tempoMedio}d` : "—" },
                                                { label: "Elopement", value: `${selectedProfile.pctElopement}%` },
                                                { label: "Top Tipo Reunião", value: selectedProfile.topReuniao ?? "—" },
                                            ].map(kpi => (
                                                <div key={kpi.label} style={{ background: T.surface, borderRadius: 8, padding: "12px 14px", border: `1px solid ${T.border}` }}>
                                                    <div style={{ fontSize: 9, color: T.muted, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600, marginBottom: 6 }}>{kpi.label}</div>
                                                    <div style={{ fontSize: 20, fontWeight: 800, color: T.white, fontFamily: "Georgia, serif" }}>{kpi.value}</div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                    <div style={{ background: `linear-gradient(135deg, ${T.berry}22, ${T.gold}11)`, border: `1px solid ${T.border}`, borderRadius: 12, padding: "20px 22px" }}>
                                        <div style={{ fontSize: 10, color: T.gold, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 14 }}>Perfil Dominante</div>
                                        {[
                                            { icon: "📍", label: "Top Destino", value: selectedProfile.topDestinos[0]?.name ?? "—" },
                                            { icon: "📣", label: "Top Origem", value: selectedProfile.topFontes[0]?.name ?? "—" },
                                            { icon: "🤝", label: "Tipo Reunião", value: selectedProfile.topReuniao ?? "—" },
                                            { icon: "💸", label: "Orçamento Médio", value: selectedProfile.avgOrcamento ? fmtBRLFull(selectedProfile.avgOrcamento) : "—" },
                                        ].map(row => (
                                            <div key={row.label} style={{ marginBottom: 12 }}>
                                                <div style={{ fontSize: 9, color: T.muted, textTransform: "uppercase", letterSpacing: "0.08em" }}>{row.icon} {row.label}</div>
                                                <div style={{ fontSize: 13, fontWeight: 700, color: T.cream, marginTop: 2 }}>{row.value}</div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {selectedProfile && (
                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                                    {[
                                        { title: `Top Destinos — ${selectedProfile.month}`, data: selectedProfile.topDestinos, color: T.rose },
                                        { title: `Top Origens — ${selectedProfile.month}`, data: selectedProfile.topFontes, color: T.gold },
                                    ].map(({ title, data, color }) => (
                                        <div key={title} style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: "20px 22px" }}>
                                            <SectionTitle>{title}</SectionTitle>
                                            {data.length > 0 ? (
                                                <ResponsiveContainer width="100%" height={200}>
                                                    <BarChart data={data} layout="vertical" margin={{ top: 6, right: 16, bottom: 0, left: 8 }}>
                                                        <CartesianGrid strokeDasharray="3 3" stroke={T.border} horizontal={false} />
                                                        <XAxis type="number" tick={{ fontSize: 9, fill: T.muted }} tickLine={false} axisLine={false} />
                                                        <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 9, fill: T.muted }} tickLine={false} axisLine={false} />
                                                        <Tooltip content={<CustomTooltip />} />
                                                        <Bar dataKey="count" name="Contratos" fill={color} radius={[0, 4, 4, 0]} barSize={14} />
                                                    </BarChart>
                                                </ResponsiveContainer>
                                            ) : <div style={{ height: 200, display: "flex", alignItems: "center", justifyContent: "center", color: T.muted, fontSize: 12 }}>Sem dados</div>}
                                        </div>
                                    ))}
                                </div>
                            )}

                            {seasonality.length > 0 && (
                                <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: "20px 22px" }}>
                                    <SectionTitle>Sazonalidade — Últimos 24 Meses</SectionTitle>
                                    <ResponsiveContainer width="100%" height={200}>
                                        <BarChart data={seasonality} margin={{ top: 10, right: 20, bottom: 0, left: -10 }}>
                                            <CartesianGrid strokeDasharray="3 3" stroke={T.border} vertical={false} />
                                            <XAxis dataKey="month" tick={{ fontSize: 8, fill: T.muted }} tickLine={false} axisLine={false} angle={-25} textAnchor="end" height={36} />
                                            <YAxis tick={{ fontSize: 9, fill: T.muted }} tickLine={false} axisLine={false} />
                                            <Tooltip content={<CustomTooltip />} />
                                            <Bar dataKey="contratos" name="Contratos" fill={T.berry} radius={[4, 4, 0, 0]} maxBarSize={28} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                    <div style={{ overflowX: "auto", marginTop: 16 }}>
                                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                                            <thead>
                                                <tr style={{ borderBottom: `1px solid ${T.border}` }}>
                                                    {["Mês", "Contratos", "Top Destino"].map(h => (
                                                        <th key={h} style={{ padding: "6px 10px", textAlign: "left", color: T.muted, fontWeight: 600, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {[...seasonality].reverse().map((s, i) => (
                                                    <tr key={s.monthKey} style={{ borderBottom: i < seasonality.length - 1 ? `1px solid ${T.border}33` : "none", background: s.monthKey === selectedMonthKey ? `${T.rose}11` : "transparent" }}>
                                                        <td style={{ padding: "6px 10px", color: T.cream, fontWeight: 600 }}>{s.month}</td>
                                                        <td style={{ padding: "6px 10px", color: T.white }}>{s.contratos}</td>
                                                        <td style={{ padding: "6px 10px", color: T.muted }}>{s.topDestino ?? "—"}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>
            )}

            {/* ════════════════════════════════════════════════════════════
                SEÇÃO 2 — POTENCIAL POR MÊS
            ═══════════════════════════════════════════════════════════════ */}
            {section === "potencial" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                    {monthlyPotential.length === 0 ? (
                        <div style={{ padding: 40, textAlign: "center", color: T.muted, fontSize: 13, background: T.card, borderRadius: 12, border: `1px solid ${T.border}` }}>
                            Sem dados de leads no pipeline do closer para análise.
                        </div>
                    ) : (
                        <>
                            <div style={{ fontSize: 10, color: T.muted, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, padding: "8px 14px" }}>
                                📅 Leads agrupados pela <strong style={{ color: T.cream }}>data de criação do deal</strong> no pipeline do closer.
                                Score calculado com base em <strong style={{ color: T.cream }}>destino, convidados e orçamento</strong> — campos preenchidos pelo marketing.
                                A taxa de conversão mostra ganhos sobre resolvidos (ganhos + perdidos).
                            </div>

                            {/* Chart: stacked bars + conversion rate line */}
                            <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: "20px 22px" }}>
                                <SectionTitle>Qualidade dos Leads por Mês de Entrada</SectionTitle>
                                <div style={{ fontSize: 10, color: T.muted, marginBottom: 16 }}>
                                    Barras empilhadas = distribuição de score (A/B/C/D) · Linha = taxa de conversão (ganhos/resolvidos)
                                </div>
                                <ResponsiveContainer width="100%" height={260}>
                                    <ComposedChart data={potentialLast12} margin={{ top: 10, right: 44, bottom: 0, left: -10 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke={T.border} vertical={false} />
                                        <XAxis dataKey="month" tick={{ fontSize: 9, fill: T.muted }} tickLine={false} axisLine={false} />
                                        <YAxis yAxisId="left" tick={{ fontSize: 9, fill: T.muted }} tickLine={false} axisLine={false} allowDecimals={false} />
                                        <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 9, fill: T.muted }} tickLine={false} axisLine={false} unit="%" domain={[0, 100]} />
                                        <Tooltip
                                            contentStyle={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 8, fontSize: 11 }}
                                            labelStyle={{ color: T.cream, fontWeight: 700 }}
                                            formatter={(value: number | undefined, name: string | undefined) => (name ?? "") === "Conv. %" ? [`${value ?? 0}%`, name ?? ""] as [string, string] : [value ?? 0, name ?? ""] as [number, string]}
                                        />
                                        <Bar yAxisId="left" dataKey="bandA" name="Tier A" stackId="s" fill={BAND_COLOR.A} maxBarSize={36} />
                                        <Bar yAxisId="left" dataKey="bandB" name="Tier B" stackId="s" fill={BAND_COLOR.B} maxBarSize={36} />
                                        <Bar yAxisId="left" dataKey="bandC" name="Tier C" stackId="s" fill={BAND_COLOR.C} maxBarSize={36} />
                                        <Bar yAxisId="left" dataKey="bandD" name="Tier D" stackId="s" fill={BAND_COLOR.D} maxBarSize={36} radius={[4, 4, 0, 0]} />
                                        <Line yAxisId="right" type="monotone" dataKey="convResolved" name="Conv. %" stroke={T.white} strokeWidth={2} dot={{ r: 3, fill: T.white }} />
                                    </ComposedChart>
                                </ResponsiveContainer>
                            </div>

                            {/* Table */}
                            <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: "20px 22px" }}>
                                <SectionTitle>Detalhe por Mês</SectionTitle>
                                <div style={{ fontSize: 10, color: T.muted, marginTop: 4, marginBottom: 12 }}>
                                    Últimos 12 meses · Colunas A/B/C/D: leads (conv%)
                                </div>
                                <div style={{ overflowX: "auto" }}>
                                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                                        <thead>
                                            <tr style={{ borderBottom: `1px solid ${T.border}` }}>
                                                {["Mês", "Leads", "Score", "A", "B", "C", "D", "Ganhos", "Conv."].map(h => (
                                                    <th key={h} style={{ padding: "8px 10px", textAlign: h === "Mês" ? "left" : "center", color: T.muted, fontWeight: 600, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.05em", whiteSpace: "nowrap" }}>{h}</th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {[...potentialLast12].reverse().map((row, i) => {
                                                const scoreColor = row.avgScore >= 65 ? T.green : row.avgScore >= 50 ? T.gold : row.avgScore >= 30 ? T.orange : T.red;
                                                const convColor = row.convResolved >= 30 ? T.green : row.convResolved >= 15 ? T.gold : T.red;
                                                return (
                                                    <tr key={row.monthKey} style={{ borderBottom: i < potentialLast12.length - 1 ? `1px solid ${T.border}33` : "none" }}>
                                                        <td style={{ padding: "8px 10px", color: T.cream, fontWeight: 600 }}>{row.month}</td>
                                                        <td style={{ padding: "8px 10px", color: T.white, textAlign: "center" }}>{row.total}</td>
                                                        <td style={{ padding: "8px 10px", textAlign: "center" }}>
                                                            <span style={{ fontWeight: 700, color: scoreColor }}>{row.avgScore}</span>
                                                        </td>
                                                        {(["A", "B", "C", "D"] as const).map(band => {
                                                            const tc = row.tierConv[band];
                                                            const bandCount = band === "A" ? row.bandA : band === "B" ? row.bandB : band === "C" ? row.bandC : row.bandD;
                                                            return (
                                                                <td key={band} style={{ padding: "8px 8px", textAlign: "center", whiteSpace: "nowrap" }}>
                                                                    <span style={{ color: BAND_COLOR[band], fontWeight: 700 }}>{bandCount}</span>
                                                                    {tc.total > 0 && (
                                                                        <span style={{ fontSize: 9, color: tc.conv > 0 ? T.green : T.muted, marginLeft: 3 }}>({tc.conv}%)</span>
                                                                    )}
                                                                </td>
                                                            );
                                                        })}
                                                        <td
                                                            style={{ padding: "8px 10px", color: row.won > 0 ? T.green : T.white, fontWeight: row.won > 0 ? 700 : 400, textAlign: "center", cursor: row.won > 0 ? "pointer" : "default" }}
                                                            onMouseEnter={row.won > 0 ? (e) => showMonthTooltip(row.monthKey, e.clientX, e.clientY) : undefined}
                                                            onMouseLeave={row.won > 0 ? scheduleHideMonth : undefined}
                                                        >{row.won}</td>
                                                        <td style={{ padding: "8px 10px", textAlign: "center" }}>
                                                            <span style={{ fontWeight: 700, color: convColor }}>{row.convResolved}%</span>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            {/* Tooltip for won deals in a month */}
                            {hoveredMonth && (() => {
                                const row = monthlyPotential.find(r => r.monthKey === hoveredMonth.monthKey);
                                if (!row || row.wonDealIds.length === 0) return null;
                                const wonDealsInMonth = closerAndWonDeals.filter(d => row.wonDealIds.includes(d.id));
                                const tooltipW = 280;
                                const left = hoveredMonth.x + 14 + tooltipW > (typeof window !== "undefined" ? window.innerWidth : 1200)
                                    ? hoveredMonth.x - tooltipW - 14
                                    : hoveredMonth.x + 14;
                                const top = hoveredMonth.y - 8;
                                return (
                                    <div
                                        onMouseEnter={cancelHideMonth}
                                        onMouseLeave={() => setHoveredMonth(null)}
                                        style={{
                                            position: "fixed", left, top, width: tooltipW, maxHeight: 340, overflowY: "auto",
                                            background: "#1a1a2e", border: `1px solid ${T.green}55`,
                                            borderRadius: 10, padding: "12px 14px", zIndex: 9999,
                                            boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
                                        }}
                                    >
                                        <div style={{ fontSize: 11, fontWeight: 700, color: T.green, marginBottom: 10, borderBottom: `1px solid ${T.border}`, paddingBottom: 6 }}>
                                            {row.month} — {row.won} ganho{row.won !== 1 ? "s" : ""}
                                        </div>
                                        {wonDealsInMonth.map(d => {
                                            const scored = scoredAll.find(s => s.id === d.id);
                                            return (
                                                <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, paddingBottom: 6, borderBottom: `1px solid ${T.border}22` }}>
                                                    {scored && <ScoreBadge band={scored.score.band} total={scored.score.total} />}
                                                    <div style={{ flex: 1, minWidth: 0 }}>
                                                        <div style={{ fontSize: 10, color: T.cream, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                                            {d.destino || "Sem destino"}
                                                        </div>
                                                        <div style={{ fontSize: 9, color: T.muted }}>
                                                            {d.valor_fechado_em_contrato ? fmtBRLFull(d.valor_fechado_em_contrato) : "—"}
                                                            {d.num_convidados ? ` · ${d.num_convidados} conv.` : ""}
                                                        </div>
                                                    </div>
                                                    <a
                                                        href={`https://welcometrips.activehosted.com/app/deals/${d.id}`}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        style={{ fontSize: 9, color: T.gold, fontWeight: 700, textDecoration: "none", border: `1px solid ${T.gold}55`, borderRadius: 4, padding: "1px 5px", whiteSpace: "nowrap" }}
                                                    >
                                                        AC ↗
                                                    </a>
                                                </div>
                                            );
                                        })}
                                    </div>
                                );
                            })()}
                        </>
                    )}
                </div>
            )}

            {/* ════════════════════════════════════════════════════════════
                SEÇÃO 3 — SCORE BOARD
            ═══════════════════════════════════════════════════════════════ */}
            {section === "score" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

                    {/* Band summary cards */}
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
                        {(["A", "B", "C", "D"] as const).map(band => (
                            <div key={band} style={{ background: BAND_BG[band], border: `1px solid ${BAND_COLOR[band]}44`, borderRadius: 12, padding: "18px 20px", position: "relative", overflow: "hidden" }}>
                                <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: BAND_COLOR[band] }} />
                                <div style={{ fontSize: 10, color: BAND_COLOR[band], fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>
                                    Tier {band}{band === "A" ? " · Alta prioridade" : band === "B" ? " · Bom potencial" : band === "C" ? " · Potencial médio" : " · Revisar fit"}
                                </div>
                                <div style={{ fontSize: 36, fontWeight: 900, color: BAND_COLOR[band], fontFamily: "Georgia, serif", lineHeight: 1 }}>{scoreCounts[band]}</div>
                                <div style={{ fontSize: 10, color: T.muted, marginTop: 4 }}>
                                    {scored.length > 0 ? `${Math.round(scoreCounts[band] / scored.length * 100)}% dos leads` : "—"}
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Score board table */}
                    {scored.length === 0 ? (
                        <div style={{ padding: 32, textAlign: "center", color: T.muted, fontSize: 13, background: T.card, borderRadius: 12, border: `1px solid ${T.border}` }}>
                            Sem leads abertos no pipeline da closer (grupo 3) para pontuar.
                        </div>
                    ) : (
                        <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: "20px 22px" }}>
                            <SectionTitle>Leads em Aberto — Pontuados</SectionTitle>
                            <div style={{ fontSize: 10, color: T.muted, marginBottom: 12 }}>
                                {scored.length} leads · ordenados por score · baseado em destino, convidados e orçamento (campos do marketing)
                            </div>
                            <div style={{ overflowX: "auto" }}>
                                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                                    <thead>
                                        <tr style={{ borderBottom: `1px solid ${T.border}` }}>
                                            {["Score", "Destino", "Convidados", "Orçamento", "Stage", "Dias no Funil"].map(h => (
                                                <th key={h} style={{ padding: "8px 10px", textAlign: "left", color: T.muted, fontWeight: 600, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.05em", whiteSpace: "nowrap" }}>{h}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {[...scored].sort((a, b) => b.score.total - a.score.total).map((d, i) => (
                                            <tr key={d.id} style={{ borderBottom: i < scored.length - 1 ? `1px solid ${T.border}33` : "none", background: i % 2 === 0 ? "transparent" : `${T.surface}88` }}>
                                                <td style={{ padding: "8px 10px" }}>
                                                    <ScoreBadge band={d.score.band} total={d.score.total} />
                                                </td>
                                                <td style={{ padding: "8px 10px" }}>
                                                    <div style={{ color: T.cream }}>{d.destino || "—"}</div>
                                                    <div style={{ fontSize: 9, color: d.score.destino.hasData ? T.muted : T.orange, marginTop: 1 }}>{d.score.destino.detail}</div>
                                                </td>
                                                <td style={{ padding: "8px 10px" }}>
                                                    <div style={{ color: T.white }}>{d.num_convidados ?? "—"}</div>
                                                    <div style={{ fontSize: 9, color: d.score.convidados.hasData ? T.muted : T.orange, marginTop: 1 }}>{d.score.convidados.detail}</div>
                                                </td>
                                                <td style={{ padding: "8px 10px" }}>
                                                    <div style={{ color: T.white }}>{d.orcamento ? fmtBRL(d.orcamento) : "—"}</div>
                                                    <div style={{ fontSize: 9, color: d.score.orcamento.hasData ? T.muted : T.orange, marginTop: 1 }}>{d.score.orcamento.detail}</div>
                                                </td>
                                                <td style={{ padding: "8px 10px", color: T.muted, maxWidth: 130, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.stage}</td>
                                                <td style={{ padding: "8px 10px", color: T.white }}>{d.diasNoFunil}d</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* ════════════════════════════════════════════════════════════
                SEÇÃO 4 — QUALIDADE DO FUNIL
            ═══════════════════════════════════════════════════════════════ */}
            {section === "funil" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                    <div style={{
                        background: funnelQuality.status === "green" ? `${T.green}15` : funnelQuality.status === "red" ? `${T.red}15` : `${T.orange}15`,
                        border: `1px solid ${funnelQuality.status === "green" ? T.green : funnelQuality.status === "red" ? T.red : T.orange}`,
                        borderRadius: 12, padding: "16px 22px", display: "flex", alignItems: "center", gap: 12,
                    }}>
                        <span style={{ fontSize: 22 }}>{funnelQuality.status === "green" ? "🟢" : funnelQuality.status === "red" ? "🔴" : "🟡"}</span>
                        <div>
                            <div style={{ fontSize: 13, fontWeight: 700, color: T.white }}>{funnelQuality.message}</div>
                            <div style={{ fontSize: 10, color: T.muted, marginTop: 2 }}>
                                {simpleProfiles.totalResolvidos} deals resolvidos como referência · {allOpenDeals.length} leads abertos (pipelines SDR + Closer)
                            </div>
                        </div>
                        <div style={{ marginLeft: "auto", textAlign: "right" }}>
                            <div style={{ fontSize: 28, fontWeight: 900, color: T.white, fontFamily: "Georgia, serif" }}>{funnelQuality.avgScore}</div>
                            <div style={{ fontSize: 9, color: T.muted }}>Score médio</div>
                        </div>
                    </div>

                    {funnelQuality.scoreSummary.length > 0 && (
                        <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: "20px 22px" }}>
                            <SectionTitle>Distribuição de Score dos Leads Abertos</SectionTitle>
                            <div style={{ display: "flex", gap: 10, marginTop: 14, height: 120 }}>
                                {funnelQuality.scoreSummary.map(s => (
                                    <div key={s.band} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                                        <div style={{ flex: 1, width: "100%", display: "flex", alignItems: "flex-end" }}>
                                            <div style={{ width: "100%", height: `${Math.max(4, s.pct)}%`, background: s.color, borderRadius: "4px 4px 0 0", opacity: 0.85 }} />
                                        </div>
                                        <span style={{ fontSize: 16, fontWeight: 800, color: s.color }}>{s.count}</span>
                                        <span style={{ fontSize: 10, color: T.muted }}>Tier {s.band} · {s.pct}%</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {funnelQuality.dimensionAlignment.map(dim => (
                        <div key={dim.key} style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: "18px 20px" }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: T.cream, marginBottom: 4 }}>{dim.name}</div>
                            <div style={{ fontSize: 10, color: T.muted, marginBottom: 8 }}>Alinhamento com perfil vencedor (top 3 destinos dos contratos fechados)</div>
                            <AlignmentBar pct={dim.alignment} color={dim.alignment >= 60 ? T.green : dim.alignment >= 35 ? T.orange : T.red} />
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 14 }}>
                                {[
                                    { title: "Funil Atual", data: dim.openDist, color: T.white },
                                    { title: "Vencedores", data: dim.winnerDist, color: T.gold },
                                ].map(({ title, data, color }) => (
                                    <div key={title}>
                                        <div style={{ fontSize: 9, color: color === T.gold ? T.gold : T.muted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6, fontWeight: 600 }}>{title}</div>
                                        {data.slice(0, 5).map(v => (
                                            <div key={v.label} style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                                                <span style={{ fontSize: 9, color: T.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "70%" }}>{v.label}</span>
                                                <span style={{ fontSize: 9, color, fontWeight: 600 }}>{v.pct}%</span>
                                            </div>
                                        ))}
                                        {data.length === 0 && <div style={{ fontSize: 9, color: T.muted }}>Sem dados</div>}
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}

                    {scoredAll.length > 0 && (() => {
                        // ── Tabela cruzada: Destino × Faixa de Convidados ────────
                        const BUCKETS = ["≤50", "51-100", "101-150", "151-200", "201+", "Sem dados"] as const;
                        type BucketLabel = typeof BUCKETS[number];

                        function getBucket(n: number | null | undefined): BucketLabel {
                            if (n == null) return "Sem dados";
                            if (n <= 50) return "≤50";
                            if (n <= 100) return "51-100";
                            if (n <= 150) return "101-150";
                            if (n <= 200) return "151-200";
                            return "201+";
                        }

                        type Cell = { leads: number; won: number; lost: number };
                        const destMap = new Map<string, Map<BucketLabel, Cell>>();

                        for (const d of scoredAll) {
                            const dest = d.destino || "Não informado";
                            const bucket = getBucket(d.num_convidados);
                            if (!destMap.has(dest)) destMap.set(dest, new Map());
                            const bm = destMap.get(dest)!;
                            if (!bm.has(bucket)) bm.set(bucket, { leads: 0, won: 0, lost: 0 });
                            const cell = bm.get(bucket)!;
                            cell.leads++;
                            if (d.data_fechamento) cell.won++;
                            else if (d.status === "2") cell.lost++;
                        }

                        const rows = [...destMap.entries()]
                            .map(([dest, bm]) => {
                                const allCells = [...bm.values()];
                                return {
                                    dest, bm,
                                    totalLeads: allCells.reduce((s, c) => s + c.leads, 0),
                                    totalWon: allCells.reduce((s, c) => s + c.won, 0),
                                    totalLost: allCells.reduce((s, c) => s + c.lost, 0),
                                };
                            })
                            .sort((a, b) => b.totalLeads - a.totalLeads)
                            .slice(0, 12);

                        const activeBuckets = BUCKETS.filter(b => rows.some(r => (r.bm.get(b)?.leads ?? 0) > 0));

                        if (rows.length === 0) return null;

                        return (
                            <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: "20px 22px" }}>
                                <SectionTitle>Conversão por Destino × Convidados</SectionTitle>
                                <div style={{ fontSize: 10, color: T.muted, marginBottom: 14 }}>
                                    Cada célula: <strong style={{ color: T.cream }}>taxa conv.</strong> (ganhos/resolvidos) · <span style={{ opacity: 0.7 }}>ganhos / total leads</span> abaixo
                                </div>
                                <div style={{ overflowX: "auto" }}>
                                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}>
                                        <thead>
                                            <tr style={{ borderBottom: `1px solid ${T.border}` }}>
                                                <th style={{ padding: "6px 10px", textAlign: "left", color: T.muted, fontWeight: 700, fontSize: 9, textTransform: "uppercase", whiteSpace: "nowrap" }}>Destino</th>
                                                {activeBuckets.map(b => (
                                                    <th key={b} style={{ padding: "6px 10px", textAlign: "center", color: T.muted, fontWeight: 600, fontSize: 9, textTransform: "uppercase", whiteSpace: "nowrap" }}>{b}</th>
                                                ))}
                                                <th style={{ padding: "6px 10px", textAlign: "center", color: T.gold, fontWeight: 700, fontSize: 9, textTransform: "uppercase", whiteSpace: "nowrap" }}>Total</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {rows.map((row, i) => {
                                                const totalResolved = row.totalWon + row.totalLost;
                                                const totalRate = totalResolved > 0 ? Math.round(row.totalWon / totalResolved * 100) : null;
                                                const totalRateColor = totalRate === null ? T.muted : totalRate >= 30 ? T.green : totalRate >= 15 ? T.gold : T.red;
                                                return (
                                                    <tr key={row.dest} style={{ borderBottom: i < rows.length - 1 ? `1px solid ${T.border}33` : "none", background: i % 2 === 0 ? "transparent" : `${T.surface}44` }}>
                                                        <td style={{ padding: "7px 10px", color: T.cream, fontWeight: 600, whiteSpace: "nowrap" }}>{row.dest}</td>
                                                        {activeBuckets.map(b => {
                                                            const cell = row.bm.get(b);
                                                            if (!cell || cell.leads === 0) {
                                                                return <td key={b} style={{ padding: "7px 10px", textAlign: "center", color: T.border, fontSize: 10 }}>—</td>;
                                                            }
                                                            const resolved = cell.won + cell.lost;
                                                            const rate = resolved > 0 ? Math.round(cell.won / resolved * 100) : null;
                                                            const rateColor = rate === null ? T.muted : rate >= 30 ? T.green : rate >= 15 ? T.gold : T.red;
                                                            return (
                                                                <td key={b} style={{ padding: "7px 10px", textAlign: "center" }}>
                                                                    <div style={{ fontSize: 12, fontWeight: 800, color: rateColor }}>{rate !== null ? `${rate}%` : "—"}</div>
                                                                    <div style={{ fontSize: 8, color: T.muted, marginTop: 2 }}>{cell.won}/{cell.leads}</div>
                                                                </td>
                                                            );
                                                        })}
                                                        <td style={{ padding: "7px 10px", textAlign: "center", borderLeft: `1px solid ${T.border}33` }}>
                                                            <div style={{ fontSize: 12, fontWeight: 800, color: totalRateColor }}>{totalRate !== null ? `${totalRate}%` : "—"}</div>
                                                            <div style={{ fontSize: 8, color: T.muted, marginTop: 2 }}>{row.totalWon}/{row.totalLeads}</div>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                                <div style={{ fontSize: 9, color: T.muted, marginTop: 10 }}>
                                    Taxa = ganhos / (ganhos + perdidos). Leads abertos não entram no denominador da taxa.
                                </div>
                            </div>
                        );
                    })()}
                </div>
            )}

            {/* ════════════════════════════════════════════════════════════
                SEÇÃO 5 — CONTRATOS FECHADOS (COMPARATIVO)
            ═══════════════════════════════════════════════════════════════ */}
            {section === "contratos" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                    {availableContractMonths.length === 0 ? (
                        <div style={{ padding: 40, textAlign: "center", color: T.muted, fontSize: 13, background: T.card, borderRadius: 12, border: `1px solid ${T.border}` }}>
                            Sem contratos fechados com data de fechamento registrada.
                        </div>
                    ) : (
                        <>
                            {/* Tier conversion summary */}
                            <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: "18px 20px" }}>
                                <div style={{ fontSize: 10, color: T.gold, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 14 }}>
                                    Volume e Conversão por Tier — últimos 365 dias (pipelines SDR + Closer)
                                </div>
                                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
                                    {tierConvStats.map(t => {
                                        const convColor = t.convRate === null ? T.muted : t.convRate >= 40 ? T.green : t.convRate >= 20 ? T.gold : T.red;
                                        return (
                                            <div key={t.band} style={{ background: BAND_BG[t.band], border: `1px solid ${BAND_COLOR[t.band]}44`, borderRadius: 10, padding: "14px 16px", position: "relative", overflow: "hidden" }}>
                                                <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: BAND_COLOR[t.band] }} />
                                                <div style={{ fontSize: 10, color: BAND_COLOR[t.band], fontWeight: 700, marginBottom: 8 }}>Tier {t.band}</div>
                                                <div style={{ fontSize: 30, fontWeight: 900, color: BAND_COLOR[t.band], fontFamily: "Georgia, serif", lineHeight: 1 }}>{t.total}</div>
                                                <div style={{ fontSize: 9, color: T.muted, marginTop: 4 }}>leads totais</div>
                                                <div style={{ marginTop: 12, borderTop: `1px solid ${BAND_COLOR[t.band]}33`, paddingTop: 10, display: "flex", flexDirection: "column", gap: 3 }}>
                                                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10 }}>
                                                        <span style={{ color: T.muted }}>Ganhos</span>
                                                        <span style={{ color: T.green, fontWeight: 700 }}>{t.won}</span>
                                                    </div>
                                                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10 }}>
                                                        <span style={{ color: T.muted }}>Perdidos</span>
                                                        <span style={{ color: T.red, fontWeight: 700 }}>{t.lost}</span>
                                                    </div>
                                                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10 }}>
                                                        <span style={{ color: T.muted }}>Abertos</span>
                                                        <span style={{ color: T.white }}>{t.open}</span>
                                                    </div>
                                                </div>
                                                <div style={{ marginTop: 10 }}>
                                                    <div style={{ fontSize: 9, color: T.muted, marginBottom: 4 }}>Taxa conv. (resolvidos)</div>
                                                    <div style={{ fontSize: 18, fontWeight: 900, color: convColor, fontFamily: "Georgia, serif" }}>
                                                        {t.convRate !== null ? `${t.convRate}%` : "—"}
                                                    </div>
                                                    {t.convRate !== null && (
                                                        <div style={{ marginTop: 4, height: 4, background: T.border, borderRadius: 2 }}>
                                                            <div style={{ width: `${t.convRate}%`, height: "100%", background: convColor, borderRadius: 2, transition: "width 0.4s" }} />
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                                <div style={{ fontSize: 9, color: T.muted, marginTop: 10 }}>
                                    Taxa de conversão = ganhos / (ganhos + perdidos). Leads abertos ainda não resolvidos.
                                </div>
                            </div>

                            {/* Month selectors */}
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                                {([
                                    { label: "Mês A", value: monthA, set: setMonthA, color: T.rose },
                                    { label: "Mês B", value: monthB, set: setMonthB, color: T.gold },
                                ] as const).map(({ label, value, set, color }) => (
                                    <div key={label} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                                        <span style={{ fontSize: 9, color: T.muted, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</span>
                                        <select
                                            value={value ?? ""}
                                            onChange={e => set(e.target.value || null)}
                                            style={{ background: T.card, border: `1px solid ${color}66`, borderRadius: 8, padding: "8px 12px", color: T.cream, fontSize: 12, fontWeight: 600, fontFamily: "inherit", outline: "none", cursor: "pointer" }}
                                        >
                                            <option value="">— Selecionar mês —</option>
                                            {availableContractMonths.map(mk => (
                                                <option key={mk} value={mk}>{monthKeyToLabel(mk)}</option>
                                            ))}
                                        </select>
                                    </div>
                                ))}
                            </div>

                            {/* Side-by-side comparison panels — grouped by creation month, pipe 1+3 */}
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                                {([
                                    { mk: monthA, color: T.rose, sort: sortA, setSort: setSortA },
                                    { mk: monthB, color: T.gold, sort: sortB, setSort: setSortB },
                                ] as const).map(({ mk, color, sort, setSort }) => {
                                    if (!mk) {
                                        return (
                                            <div key={color} style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: 32, display: "flex", alignItems: "center", justifyContent: "center", color: T.muted, fontSize: 12 }}>
                                                Selecione um mês acima
                                            </div>
                                        );
                                    }
                                    const deals = allByCreationMonth.get(mk) ?? [];
                                    const label = monthKeyToLabel(mk);
                                    const avgScore = deals.length > 0 ? Math.round(deals.reduce((s, d) => s + d.score.total, 0) / deals.length) : 0;
                                    const scoreColor = avgScore >= 75 ? T.green : avgScore >= 50 ? T.gold : avgScore >= 25 ? T.orange : T.red;

                                    const tierRows = (["A", "B", "C", "D"] as const).map(band => {
                                        const t = deals.filter(d => d.score.band === band);
                                        const won = t.filter(d => !!d.data_fechamento).length;
                                        const lost = t.filter(d => !d.data_fechamento && d.status === "2").length;
                                        const open = t.length - won - lost;
                                        const resolved = won + lost;
                                        return { band, total: t.length, won, lost, open, convRate: resolved > 0 ? Math.round(won / resolved * 100) : null };
                                    });

                                    const totalWon = deals.filter(d => !!d.data_fechamento).length;
                                    const totalLost = deals.filter(d => !d.data_fechamento && d.status === "2").length;
                                    const sorted = sortDeals(deals, sort);

                                    const COLS: { label: string; key: string }[] = [
                                        { label: "Tier", key: "score" },
                                        { label: "Status", key: "status" },
                                        { label: "Destino", key: "destino" },
                                        { label: "Convidados", key: "convidados" },
                                        { label: "Orçamento", key: "orcamento" },
                                        { label: "Fechado", key: "fechado" },
                                    ];

                                    function toggleSort(key: string) {
                                        setSort(prev => prev.col === key
                                            ? { col: key, dir: prev.dir === "desc" ? "asc" : "desc" }
                                            : { col: key, dir: "desc" }
                                        );
                                    }

                                    return (
                                        <div key={color} style={{ background: T.card, border: `1px solid ${color}44`, borderRadius: 12, overflow: "hidden" }}>
                                            {/* Panel header */}
                                            <div style={{ background: `${color}15`, borderBottom: `1px solid ${color}33`, padding: "14px 18px", display: "flex", alignItems: "center", gap: 12 }}>
                                                <div style={{ flex: 1 }}>
                                                    <div style={{ fontSize: 16, fontWeight: 800, color: T.white, fontFamily: "Georgia, serif" }}>{label}</div>
                                                    <div style={{ fontSize: 10, color: T.muted, marginTop: 3, display: "flex", gap: 12 }}>
                                                        <span>{deals.length} leads</span>
                                                        <span style={{ color: T.green }}>✓ {totalWon} ganhos</span>
                                                        <span style={{ color: T.red }}>✗ {totalLost} perdidos</span>
                                                    </div>
                                                </div>
                                                <div style={{ textAlign: "right" }}>
                                                    <div style={{ fontSize: 26, fontWeight: 900, color: scoreColor, fontFamily: "Georgia, serif", lineHeight: 1 }}>{avgScore}</div>
                                                    <div style={{ fontSize: 9, color: T.muted }}>Score médio</div>
                                                </div>
                                            </div>

                                            {/* Per-tier conversion table */}
                                            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10, borderBottom: `1px solid ${T.border}` }}>
                                                <thead>
                                                    <tr style={{ borderBottom: `1px solid ${T.border}` }}>
                                                        {["Tier", "Leads", "Ganhos", "Perdidos", "Abertos", "Taxa"].map(h => (
                                                            <th key={h} style={{ padding: "6px 10px", textAlign: h === "Tier" ? "left" : "center", color: T.muted, fontWeight: 600, fontSize: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</th>
                                                        ))}
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {tierRows.map(t => {
                                                        const convColor = t.convRate === null ? T.muted : t.convRate >= 40 ? T.green : t.convRate >= 20 ? T.gold : T.red;
                                                        return (
                                                            <tr key={t.band} style={{ borderBottom: `1px solid ${T.border}22` }}>
                                                                <td style={{ padding: "5px 10px" }}>
                                                                    <span style={{ color: BAND_COLOR[t.band], fontWeight: 800, fontSize: 11 }}>Tier {t.band}</span>
                                                                </td>
                                                                <td style={{ padding: "5px 10px", color: T.white, textAlign: "center", fontWeight: 700 }}>{t.total}</td>
                                                                <td style={{ padding: "5px 10px", color: T.green, textAlign: "center", fontWeight: 700 }}>{t.won}</td>
                                                                <td style={{ padding: "5px 10px", color: T.red, textAlign: "center" }}>{t.lost}</td>
                                                                <td style={{ padding: "5px 10px", color: T.muted, textAlign: "center" }}>{t.open}</td>
                                                                <td style={{ padding: "5px 10px", textAlign: "center" }}>
                                                                    <span style={{ fontWeight: 700, color: convColor }}>{t.convRate !== null ? `${t.convRate}%` : "—"}</span>
                                                                </td>
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>

                                            {/* Individual deals table */}
                                            {deals.length === 0 ? (
                                                <div style={{ padding: 24, textAlign: "center", color: T.muted, fontSize: 12 }}>Sem leads</div>
                                            ) : (
                                                <div style={{ overflowX: "auto", maxHeight: 360, overflowY: "auto" }}>
                                                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}>
                                                        <thead style={{ position: "sticky", top: 0, background: T.card, zIndex: 1 }}>
                                                            <tr style={{ borderBottom: `1px solid ${T.border}` }}>
                                                                {COLS.map(col => {
                                                                    const active = sort.col === col.key;
                                                                    const icon = active ? (sort.dir === "desc" ? " ▼" : " ▲") : " ⇅";
                                                                    return (
                                                                        <th
                                                                            key={col.key}
                                                                            onClick={() => toggleSort(col.key)}
                                                                            style={{
                                                                                padding: "6px 10px", textAlign: "left",
                                                                                color: active ? color : T.muted,
                                                                                fontWeight: 600, fontSize: 8,
                                                                                textTransform: "uppercase", letterSpacing: "0.05em",
                                                                                whiteSpace: "nowrap", cursor: "pointer",
                                                                                userSelect: "none",
                                                                            }}
                                                                        >
                                                                            {col.label}<span style={{ opacity: active ? 1 : 0.4 }}>{icon}</span>
                                                                        </th>
                                                                    );
                                                                })}
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {sorted.map((d, i) => {
                                                                const isWon = !!d.data_fechamento;
                                                                const isLost = !isWon && d.status === "2";
                                                                const statusLabel = isWon ? "Ganho" : isLost ? "Perdido" : "Aberto";
                                                                const statusColor = isWon ? T.green : isLost ? T.red : T.muted;
                                                                return (
                                                                    <tr
                                                                        key={d.id}
                                                                        onMouseEnter={isWon ? (e) => showTooltip(d, e.clientX, e.clientY) : undefined}
                                                                        onMouseMove={isWon ? (e) => setHoveredDeal(prev => prev ? { ...prev, x: e.clientX, y: e.clientY } : null) : undefined}
                                                                        onMouseLeave={isWon ? scheduleHide : undefined}
                                                                        style={{
                                                                            borderBottom: i < sorted.length - 1 ? `1px solid ${T.border}22` : "none",
                                                                            background: i % 2 === 0 ? "transparent" : `${T.surface}66`,
                                                                            cursor: isWon ? "default" : undefined,
                                                                        }}
                                                                    >
                                                                        <td style={{ padding: "5px 10px", whiteSpace: "nowrap" }}>
                                                                            <ScoreBadge band={d.score.band} total={d.score.total} />
                                                                        </td>
                                                                        <td style={{ padding: "5px 10px", whiteSpace: "nowrap" }}>
                                                                            <span style={{ color: statusColor, fontWeight: 600, fontSize: 9 }}>{statusLabel}</span>
                                                                        </td>
                                                                        <td style={{ padding: "5px 10px", color: T.cream, whiteSpace: "nowrap" }}>{d.destino || "—"}</td>
                                                                        <td style={{ padding: "5px 10px", color: T.white, textAlign: "center" }}>{d.num_convidados ?? "—"}</td>
                                                                        <td style={{ padding: "5px 10px", color: T.white, whiteSpace: "nowrap" }}>{d.orcamento ? fmtBRL(d.orcamento) : "—"}</td>
                                                                        <td style={{ padding: "5px 10px", color: T.white, whiteSpace: "nowrap" }}>{d.valor_fechado_em_contrato ? fmtBRL(d.valor_fechado_em_contrato) : "—"}</td>
                                                                    </tr>
                                                                );
                                                            })}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Tooltip overlay for won deals */}
                            {hoveredDeal && (() => {
                                const d = hoveredDeal.deal;
                                const tooltipW = 220;
                                const left = hoveredDeal.x + 14 + tooltipW > window.innerWidth
                                    ? hoveredDeal.x - tooltipW - 14
                                    : hoveredDeal.x + 14;
                                const top = hoveredDeal.y - 8;
                                return (
                                    <div
                                        onMouseEnter={cancelHide}
                                        onMouseLeave={() => setHoveredDeal(null)}
                                        style={{
                                            position: "fixed", left, top, width: tooltipW,
                                            background: "#1a1a2e", border: `1px solid ${T.green}55`,
                                            borderRadius: 10, padding: "12px 14px", zIndex: 9999,
                                            boxShadow: `0 8px 32px rgba(0,0,0,0.6)`,
                                        }}
                                    >
                                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, borderBottom: `1px solid ${T.border}`, paddingBottom: 8 }}>
                                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                                <ScoreBadge band={d.score.band} total={d.score.total} />
                                                <span style={{ fontSize: 10, color: T.green, fontWeight: 700 }}>✓ Ganho</span>
                                            </div>
                                            <a
                                                href={`https://welcometrips.activehosted.com/app/deals/${d.id}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                style={{ fontSize: 10, color: T.gold, fontWeight: 700, textDecoration: "none", border: `1px solid ${T.gold}55`, borderRadius: 5, padding: "2px 7px", whiteSpace: "nowrap" }}
                                            >
                                                AC ↗
                                            </a>
                                        </div>
                                        {[
                                            ["Destino", d.destino],
                                            ["Convidados", d.num_convidados],
                                            ["Orçamento est.", d.orcamento ? fmtBRLFull(d.orcamento) : null],
                                            ["Valor fechado", d.valor_fechado_em_contrato ? fmtBRLFull(d.valor_fechado_em_contrato) : null],
                                            ["Fechamento", d.data_fechamento ? d.data_fechamento.substring(0, 10) : null],
                                            ["Entrada CRM", d.cdate ? d.cdate.substring(0, 10) : null],
                                            ["Fonte", d.ww_fonte_do_lead],
                                            ["Cidade", d.cidade],
                                        ].map(([label, val]) => val != null && val !== "" ? (
                                            <div key={String(label)} style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 4 }}>
                                                <span style={{ fontSize: 9, color: T.muted, whiteSpace: "nowrap" }}>{label}</span>
                                                <span style={{ fontSize: 9, color: T.cream, fontWeight: 600, textAlign: "right" }}>{String(val)}</span>
                                            </div>
                                        ) : null)}
                                    </div>
                                );
                            })()}
                        </>
                    )}
                </div>
            )}

            {/* ════════════════════════════════════════════════════════════
                SEÇÃO 6 — CONFIG SCORE
            ═══════════════════════════════════════════════════════════════ */}
            {section === "config" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                    <div style={{ background: `${T.gold}11`, border: `1px solid ${T.gold}33`, borderRadius: 10, padding: "12px 18px", fontSize: 11, color: T.muted, lineHeight: 1.6 }}>
                        <span style={{ color: T.gold, fontWeight: 700 }}>Como funciona o score: </span>
                        Soma direta de 3 dimensões com pontuação fixa:
                        <strong style={{ color: T.cream }}> Destino</strong> (0-30 pts),
                        <strong style={{ color: T.cream }}> Investimento</strong> (0-30 pts),
                        <strong style={{ color: T.cream }}> Convidados</strong> (0-30 pts — varia por grupo de destino).
                        Score máximo: <strong style={{ color: T.cream }}>90 pontos</strong>. Configure os limiares abaixo para classificar leads em tiers A/B/C/D.
                    </div>

                    {/* Score bands */}
                    <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: "20px 22px" }}>
                        <SectionTitle>Faixas de Score (A / B / C / D)</SectionTitle>
                        <div style={{ fontSize: 10, color: T.muted, marginBottom: 16 }}>
                            Define o score mínimo para cada faixa. Scores abaixo de C caem em D automaticamente.
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
                            {(["A", "B", "C"] as const).map(band => (
                                <div key={band} style={{ background: BAND_BG[band], border: `1px solid ${BAND_COLOR[band]}44`, borderRadius: 10, padding: "14px 16px" }}>
                                    <div style={{ fontSize: 11, fontWeight: 700, color: BAND_COLOR[band], marginBottom: 8 }}>Tier {band} — mínimo</div>
                                    <input
                                        type="number" min={0} max={90}
                                        value={bands[band]}
                                        onChange={e => handleBandChange(band, Math.min(90, Math.max(0, Number(e.target.value))))}
                                        style={{ width: "100%", background: T.surface, border: `1px solid ${T.border}`, borderRadius: 6, padding: "6px 10px", color: T.white, fontSize: 16, fontWeight: 700, fontFamily: "Georgia, serif", outline: "none" }}
                                    />
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Scoring reference tables — 3 cards */}
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>

                        {/* Card 1 — Destino */}
                        <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: "18px 20px" }}>
                            <SectionTitle>Destino (0-30)</SectionTitle>
                            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, marginTop: 10 }}>
                                <thead>
                                    <tr style={{ borderBottom: `1px solid ${T.border}` }}>
                                        {["Destino", "Pts"].map(h => (
                                            <th key={h} style={{ padding: "5px 8px", textAlign: "left", color: T.muted, fontWeight: 600, fontSize: 9, textTransform: "uppercase" }}>{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {[
                                        { dest: "Caribe", pts: 30 },
                                        { dest: "Nordeste", pts: 20 },
                                        { dest: "Europa / Itália / Grécia / Portugal / Toscana / Sicília / Santorini / Amsterdam / Paris", pts: 10 },
                                        { dest: "Mendoza / Patagônia", pts: 10 },
                                        { dest: "Maldivas / Bali", pts: 5 },
                                        { dest: "Outros", pts: 5 },
                                    ].map((row, i, arr) => (
                                        <tr key={row.dest} style={{ borderBottom: i < arr.length - 1 ? `1px solid ${T.border}33` : "none" }}>
                                            <td style={{ padding: "6px 8px", color: T.cream, fontWeight: 600 }}>{row.dest}</td>
                                            <td style={{ padding: "6px 8px", fontWeight: 700, color: row.pts >= 20 ? T.green : row.pts >= 10 ? T.gold : T.muted }}>{row.pts}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* Card 2 — Investimento */}
                        <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: "18px 20px" }}>
                            <SectionTitle>Investimento (0-30)</SectionTitle>
                            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, marginTop: 10 }}>
                                <thead>
                                    <tr style={{ borderBottom: `1px solid ${T.border}` }}>
                                        {["Faixa", "Pts"].map(h => (
                                            <th key={h} style={{ padding: "5px 8px", textAlign: "left", color: T.muted, fontWeight: 600, fontSize: 9, textTransform: "uppercase" }}>{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {[
                                        { faixa: "Até R$ 50 mil", pts: 5 },
                                        { faixa: "R$ 51-80 mil", pts: 10 },
                                        { faixa: "R$ 81-100 mil", pts: 15 },
                                        { faixa: "R$ 101-200 mil", pts: 20 },
                                        { faixa: "R$ 201-500 mil", pts: 25 },
                                        { faixa: "Mais de R$ 500 mil", pts: 30 },
                                    ].map((row, i, arr) => (
                                        <tr key={row.faixa} style={{ borderBottom: i < arr.length - 1 ? `1px solid ${T.border}33` : "none" }}>
                                            <td style={{ padding: "6px 8px", color: T.cream, fontWeight: 600 }}>{row.faixa}</td>
                                            <td style={{ padding: "6px 8px", fontWeight: 700, color: row.pts >= 20 ? T.green : row.pts >= 10 ? T.gold : T.muted }}>{row.pts}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* Card 3 — Convidados */}
                        <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: "18px 20px" }}>
                            <SectionTitle>Convidados (0-30)</SectionTitle>
                            <div style={{ fontSize: 9, color: T.muted, marginTop: 4, marginBottom: 6 }}>Pontuação varia por grupo de destino</div>
                            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                                <thead>
                                    <tr style={{ borderBottom: `1px solid ${T.border}` }}>
                                        {["Faixa", "Caribe/NE/Outros", "Europa", "Mendoza"].map(h => (
                                            <th key={h} style={{ padding: "5px 6px", textAlign: h === "Faixa" ? "left" : "center", color: T.muted, fontWeight: 600, fontSize: 9, textTransform: "uppercase" }}>{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {[
                                        { faixa: "Apenas casal", cno: 5, eur: 5, mza: 5 },
                                        { faixa: "Até 20", cno: 10, eur: 25, mza: 10 },
                                        { faixa: "20-50", cno: 15, eur: 30, mza: 25 },
                                        { faixa: "51-80", cno: 20, eur: 20, mza: 30 },
                                        { faixa: "81-100", cno: 25, eur: 15, mza: 20 },
                                        { faixa: "100+", cno: 30, eur: 10, mza: 15 },
                                    ].map((row, i, arr) => (
                                        <tr key={row.faixa} style={{ borderBottom: i < arr.length - 1 ? `1px solid ${T.border}33` : "none" }}>
                                            <td style={{ padding: "6px 6px", color: T.cream, fontWeight: 600 }}>{row.faixa}</td>
                                            {[row.cno, row.eur, row.mza].map((v, j) => (
                                                <td key={j} style={{ padding: "6px 6px", textAlign: "center", fontWeight: 700, color: v >= 25 ? T.green : v >= 15 ? T.gold : T.muted }}>{v}</td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
                        <button onClick={handleReset} style={{ background: "transparent", border: `1px solid ${T.border}`, borderRadius: 8, padding: "8px 20px", color: T.muted, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
                            Restaurar Padrão
                        </button>
                        <button onClick={handleSave} style={{ background: T.gold, border: "none", borderRadius: 8, padding: "8px 24px", color: T.bg, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                            Salvar Configuração
                        </button>
                    </div>
                </div>
            )}

            {/* ════════════════════════════════════════════════════════════
                SEÇÃO — PAINEL COMPARATIVO
            ═══════════════════════════════════════════════════════════════ */}
            {section === "analise" && (() => {
                // ── Pivots:
                //   Esquerda — TODOS os contratos com data_fechamento, fonte: scoredWon (qualquer pipeline)
                //   Direita  — leads CAPTADOS das pipelines 1 e 3, fonte: scoredAll filtrado
                const leadsP13 = scoredAll.filter(d => d.group_id === "1" || d.group_id === "3");

                // ── Drill-down: deals que compõem uma célula ─────────────────
                const getDrillDeals = (side: "left" | "right", dest: string, bucket: string | null) => {
                    const source = side === "left" ? scoredWon : leadsP13;
                    const months = side === "left" ? monthsLeft : monthsRight;
                    return source.filter(d => {
                        if (months.length > 0) {
                            const raw = side === "left" ? d.data_fechamento : d.cdate;
                            const mk = raw ? raw.substring(0, 7) : null;
                            if (!mk || !months.includes(mk)) return false;
                        }
                        if ((d.destino || "Não informado") !== dest) return false;
                        if (bucket !== null) {
                            const bkt = dimCol === "convidados"
                                ? getConvBucket(d.num_convidados)
                                : getOrcBucket(d.orcamento);
                            if (bkt !== bucket) return false;
                        }
                        return true;
                    });
                };
                const leftConv  = buildHeatmapPivot(scoredWon, monthsLeft,  "convidados", "data_fechamento");
                const leftOrc   = buildHeatmapPivot(scoredWon, monthsLeft,  "orcamento",  "data_fechamento");
                const rightConv = buildHeatmapPivot(leadsP13, monthsRight, "convidados", "cdate");
                const rightOrc  = buildHeatmapPivot(leadsP13, monthsRight, "orcamento",  "cdate");

                // ── Total fechado no período (denominador da taxa — esquerda) ─
                const totalClosedInMonths = monthsLeft.length === 0
                    ? scoredWon.length
                    : scoredWon.filter(d => {
                        const mk = d.data_fechamento ? d.data_fechamento.substring(0, 7) : null;
                        return mk !== null && monthsLeft.includes(mk);
                    }).length;

                // ── Aligned destinos: union sorted by combined leads, top 12 ─
                const destTotals = new Map<string, number>();
                for (const p of [leftConv, leftOrc, rightConv, rightOrc]) {
                    for (const r of p.rows) destTotals.set(r.dest, (destTotals.get(r.dest) ?? 0) + r.total.leads);
                }
                const alignedDests = [...destTotals.entries()]
                    .sort((a, b) => {
                        if (a[0] === "Não informado") return 1;
                        if (b[0] === "Não informado") return -1;
                        return b[1] - a[1];
                    })
                    .slice(0, 12).map(([d]) => d);

                // ── Active buckets: sempre todos (exceto "Sem dados") ────────
                const activeBucketsConv = [...CONV_BUCKETS].filter(b => b !== "Sem dados");
                const activeBucketsOrc  = [...ORC_BUCKETS].filter(b => b !== "Sem dados");
                const activeBucketsDim  = dimCol === "convidados" ? activeBucketsConv : activeBucketsOrc;

                // ── Total leads direita no período (denominador % direita) ───
                const totalRightLeads = monthsRight.length === 0
                    ? leadsP13.length
                    : leadsP13.filter(d => {
                        const mk = d.cdate ? d.cdate.substring(0, 7) : null;
                        return mk !== null && monthsRight.includes(mk);
                    }).length;

                // ── Row lookup maps ───────────────────────────────────────────
                const lConvMap = new Map(leftConv.rows.map(r => [r.dest, r]));
                const lOrcMap  = new Map(leftOrc.rows.map(r => [r.dest, r]));
                const rConvMap = new Map(rightConv.rows.map(r => [r.dest, r]));
                const rOrcMap  = new Map(rightOrc.rows.map(r => [r.dest, r]));

                // ── Month chip toggle handlers ────────────────────────────────
                const toggleLeft  = (m: string) => setMonthsLeft(prev  => prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m]);
                const toggleRight = (m: string) => setMonthsRight(prev => prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m]);

                // ── Cell renderers — estrutura idêntica para esquerda e direita ──
                const emptyTd = (key: string) => (
                    <td key={key} style={{ padding: "6px 8px", textAlign: "center", color: T.border, fontSize: 9 }}>—</td>
                );

                // Célula de bucket: pct = valor principal (%), sub = linha secundária, rgb = cor do heatmap
                const renderHeatTd = (pct: number | null, sub: string, maxPct: number, rgb: string, key: string, onClick?: () => void) => {
                    if (pct === null || pct === 0) return emptyTd(key);
                    const intensity = Math.min(0.85, (pct / Math.max(0.01, maxPct)) * 0.85);
                    const bg = `rgba(${rgb},${intensity.toFixed(2)})`;
                    return (
                        <td key={key} onClick={onClick} style={{ padding: "6px 8px", textAlign: "center", background: bg, cursor: onClick ? "pointer" : "default" }}>
                            <div style={{ fontSize: 11, fontWeight: 800, color: "#fff" }}>{pct.toFixed(1)}%</div>
                            <div style={{ fontSize: 8, color: "rgba(255,255,255,0.5)", marginTop: 1 }}>{sub}</div>
                        </td>
                    );
                };

                // Célula total: mesma estrutura, com separador esquerdo
                const renderHeatTotalTd = (pct: number | null, sub: string, maxPct: number, rgb: string, onClick?: () => void) => {
                    const intensity = pct !== null && pct > 0 ? Math.min(0.85, (pct / Math.max(0.01, maxPct)) * 0.85) : 0;
                    const bg = intensity > 0 ? `rgba(${rgb},${intensity.toFixed(2)})` : "transparent";
                    return (
                        <td onClick={onClick} style={{ padding: "6px 8px", textAlign: "center", background: bg, borderLeft: `1px solid ${T.border}33`, cursor: onClick ? "pointer" : "default" }}>
                            <div style={{ fontSize: 11, fontWeight: 800, color: "#fff" }}>{pct !== null ? `${pct.toFixed(1)}%` : "—"}</div>
                            <div style={{ fontSize: 8, color: "rgba(255,255,255,0.5)", marginTop: 1 }}>{sub}</div>
                        </td>
                    );
                };

                // Match: √(convNorm × leadNorm) × 100 — usa os mesmos renderHeat* para estrutura idêntica
                const matchScore = (lCell: HeatCell | undefined, rCell: HeatCell | undefined, maxCR: number, maxVR: number) => {
                    const lRate = lCell && totalClosedInMonths > 0 ? lCell.won / totalClosedInMonths * 100 : 0;
                    const rPct  = rCell && totalRightLeads > 0 ? rCell.leads / totalRightLeads * 100 : 0;
                    const lNorm = lRate / Math.max(0.01, maxCR);
                    const rNorm = rPct  / Math.max(0.01, maxVR);
                    const score = Math.sqrt(lNorm * rNorm) * 100;
                    const sub   = `${lRate.toFixed(1)}% conv · ${rPct.toFixed(1)}% leads`;
                    return { score, sub };
                };

                const thS = { padding: "5px 8px", textAlign: "center" as const, color: T.muted, fontWeight: 600, fontSize: 9, textTransform: "uppercase" as const, whiteSpace: "nowrap" as const };
                const thDestS = { ...thS, textAlign: "left" as const, color: T.gold, fontWeight: 700 };
                const tdDestS = { padding: "6px 8px", color: T.cream, fontWeight: 600, fontSize: 10, whiteSpace: "nowrap" as const };
                const panelLabel = (title: string, color = T.gold) => (
                    <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.08em", color, marginBottom: 6 }}>{title}</div>
                );

                return (
                    <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>

                        {/* Seletor de meses compartilhado */}
                        <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: "18px 22px" }}>
                            <SectionTitle>Seletor de Meses</SectionTitle>
                            <div style={{ fontSize: 10, color: T.muted, marginBottom: 12 }}>
                                Selecione meses para cada painel. Nenhum selecionado = todos os dados.
                            </div>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
                                {([
                                    { label: "Fechamentos (esquerda)", subLabel: "por data de fechamento de contrato", months: availableCloseDateMonths, selected: monthsLeft, toggle: toggleLeft, color: "#3DBF8A" },
                                    { label: "Captação de leads (direita)", subLabel: "por data de criação do lead · pipelines SDR + Closer", months: availableCdateMonths, selected: monthsRight, toggle: toggleRight, color: "#D4A35A" },
                                ] as const).map(({ label, subLabel, months, selected, toggle, color }) => (
                                    <div key={label}>
                                        <div style={{ fontSize: 10, color, fontWeight: 700, textTransform: "uppercase" as const, marginBottom: 2 }}>{label}</div>
                                        <div style={{ fontSize: 9, color: T.muted, marginBottom: 6 }}>{subLabel}</div>
                                        <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                                            {months.slice(0, 18).map(m => {
                                                const active = selected.includes(m);
                                                return (
                                                    <button key={m} onClick={() => toggle(m)} style={{
                                                        background: active ? color : "transparent",
                                                        border: `1px solid ${active ? color : T.border}`,
                                                        borderRadius: 6, padding: "3px 9px", fontSize: 10,
                                                        fontWeight: active ? 700 : 400,
                                                        color: active ? T.bg : T.muted,
                                                        cursor: "pointer", fontFamily: "inherit",
                                                    }}>
                                                        {monthKeyToLabel(m)}
                                                    </button>
                                                );
                                            })}
                                            {selected.length === 0 && (
                                                <span style={{ fontSize: 10, color: T.muted, alignSelf: "center" }}>Todos os meses</span>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* ═══ Heat map: Destino × Dimensão ═══════════════════════ */}
                        <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: "18px 22px" }}>
                            <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 16 }}>
                                <span style={{ fontSize: 10, color: T.muted }}>Dimensão:</span>
                                {(["convidados", "orcamento"] as const).map(d => (
                                    <button key={d} onClick={() => setDimCol(d)} style={{
                                        background: dimCol === d ? T.gold : "transparent",
                                        border: `1px solid ${dimCol === d ? T.gold : T.border}`,
                                        borderRadius: 6, padding: "4px 14px", fontSize: 11,
                                        color: dimCol === d ? T.bg : T.muted,
                                        cursor: "pointer", fontFamily: "inherit", fontWeight: dimCol === d ? 700 : 400,
                                    }}>
                                        {d === "convidados" ? "Nº Convidados" : "Orçamento"}
                                    </button>
                                ))}
                            </div>
                            {(() => {
                                const lMap = dimCol === "convidados" ? lConvMap : lOrcMap;
                                const rMap = dimCol === "convidados" ? rConvMap : rOrcMap;

                                // normalização dinâmica para cada painel
                                let maxConvRate = 0.01;
                                let maxVolRate  = 0.01;
                                for (const dest of alignedDests) {
                                    const lRow = lMap.get(dest);
                                    const rRow = rMap.get(dest);
                                    for (const b of activeBucketsDim) {
                                        const lc = lRow?.bm.get(b);
                                        const rc = rRow?.bm.get(b);
                                        if (lc && totalClosedInMonths > 0) maxConvRate = Math.max(maxConvRate, lc.won / totalClosedInMonths * 100);
                                        if (rc && totalRightLeads > 0)     maxVolRate  = Math.max(maxVolRate,  rc.leads / totalRightLeads * 100);
                                    }
                                    if (lRow && totalClosedInMonths > 0) maxConvRate = Math.max(maxConvRate, lRow.total.won / totalClosedInMonths * 100);
                                    if (rRow && totalRightLeads > 0)     maxVolRate  = Math.max(maxVolRate,  rRow.total.leads / totalRightLeads * 100);
                                }

                                // getCellPct / getTotalPct / getSub / getTotalSub: funções que extraem
                                // os valores corretos de cada painel — sem ramificação no JSX
                                const makeTable = (
                                    side: "left" | "right",
                                    id: string,
                                    title: string,
                                    subTitle: string,
                                    color: string,
                                    rgb: string,
                                    rowMap: Map<string, HeatRow>,
                                    getCellPct:  (cell: HeatCell) => number,
                                    getCellSub:  (cell: HeatCell) => string,
                                    getTotalPct: (total: HeatCell) => number,
                                    getTotalSub: (total: HeatCell) => string,
                                    maxPct: number,
                                ) => (
                                    <div key={id}>
                                        {panelLabel(title, color)}
                                        <div style={{ fontSize: 9, color: T.muted, marginBottom: 8 }}>{subTitle}</div>
                                        <div style={{ overflowX: "auto" }}>
                                            <table style={{ borderCollapse: "collapse", fontSize: 10, minWidth: "100%" }}>
                                                <thead>
                                                    <tr style={{ borderBottom: `1px solid ${T.border}` }}>
                                                        <th style={thDestS}>Destino</th>
                                                        {activeBucketsDim.map(b => <th key={b} style={thS}>{b}</th>)}
                                                        <th style={{ ...thS, color, borderLeft: `1px solid ${T.border}33` }}>Total</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {alignedDests.map((dest, i) => {
                                                        const row = rowMap.get(dest);
                                                        return (
                                                            <tr key={dest} style={{ borderBottom: `1px solid ${T.border}22`, background: i % 2 ? `${T.surface}33` : "transparent" }}>
                                                                <td style={tdDestS}>{dest}</td>
                                                                {activeBucketsDim.map(b => {
                                                                    const cell = row?.bm.get(b);
                                                                    const pct = cell ? getCellPct(cell) : 0;
                                                                    return pct > 0
                                                                        ? renderHeatTd(pct, getCellSub(cell!), maxPct, rgb, b,
                                                                            () => setDrillCell({ side, dest, bucket: b }))
                                                                        : emptyTd(b);
                                                                })}
                                                                {row && getTotalPct(row.total) > 0
                                                                    ? renderHeatTotalTd(getTotalPct(row.total), getTotalSub(row.total), maxPct, rgb,
                                                                        () => setDrillCell({ side, dest, bucket: null }))
                                                                    : emptyTd("total")}
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                );

                                // ── Tabela Match (mesma estrutura via renderHeat*) ───────
                                // maxMatch = maior score possível (para normalizar intensidade)
                                let maxMatch = 0.01;
                                for (const dest of alignedDests) {
                                    for (const b of activeBucketsDim) {
                                        const { score } = matchScore(lMap.get(dest)?.bm.get(b), rMap.get(dest)?.bm.get(b), maxConvRate, maxVolRate);
                                        maxMatch = Math.max(maxMatch, score);
                                    }
                                    const { score: ts } = matchScore(lMap.get(dest)?.total, rMap.get(dest)?.total, maxConvRate, maxVolRate);
                                    maxMatch = Math.max(maxMatch, ts);
                                }

                                const matchTable = (
                                    <div style={{ gridColumn: "1 / -1" }}>
                                        {panelLabel("Match — Potencial × Captação", "#6366F1")}
                                        <div style={{ fontSize: 9, color: T.muted, marginBottom: 8 }}>
                                            Score 0–100 = √(taxa_conv_norm × share_leads_norm) · 100.
                                            Alto score = segmento que tanto converte quanto recebe leads.
                                            Baixo score = oportunidade perdida (alta conversão, poucos leads) ou ruído (muitos leads, baixa conversão).
                                        </div>
                                        <div style={{ overflowX: "auto" }}>
                                            <table style={{ borderCollapse: "collapse", fontSize: 10, minWidth: "100%" }}>
                                                <thead>
                                                    <tr style={{ borderBottom: `1px solid ${T.border}` }}>
                                                        <th style={{ ...thDestS, color: "#6366F1" }}>Destino</th>
                                                        {activeBucketsDim.map(b => <th key={b} style={thS}>{b}</th>)}
                                                        <th style={{ ...thS, color: "#6366F1", borderLeft: `1px solid ${T.border}33` }}>Total</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {alignedDests.map((dest, i) => {
                                                        const lRow = lMap.get(dest);
                                                        const rRow = rMap.get(dest);
                                                        const { score: ts, sub: tsub } = matchScore(lRow?.total, rRow?.total, maxConvRate, maxVolRate);
                                                        return (
                                                            <tr key={dest} style={{ borderBottom: `1px solid ${T.border}22`, background: i % 2 ? `${T.surface}33` : "transparent" }}>
                                                                <td style={tdDestS}>{dest}</td>
                                                                {activeBucketsDim.map(b => {
                                                                    const { score, sub } = matchScore(lRow?.bm.get(b), rRow?.bm.get(b), maxConvRate, maxVolRate);
                                                                    return score > 0
                                                                        ? renderHeatTd(score, sub, maxMatch, "99,102,241", b)
                                                                        : emptyTd(b);
                                                                })}
                                                                {ts > 0
                                                                    ? renderHeatTotalTd(ts, tsub, maxMatch, "99,102,241")
                                                                    : emptyTd("total")}
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                );

                                const leftTable = makeTable(
                                    "left",
                                    "left",
                                    `Fechamentos (${totalClosedInMonths} no período)`,
                                    "% = contratos da célula / total fechamentos do período",
                                    "#3DBF8A", "61,191,138",
                                    lMap,
                                    c => totalClosedInMonths > 0 ? c.won / totalClosedInMonths * 100 : 0,
                                    c => `${c.won} gan.`,
                                    c => totalClosedInMonths > 0 ? c.won / totalClosedInMonths * 100 : 0,
                                    c => `${c.won}/${totalClosedInMonths}`,
                                    maxConvRate,
                                );
                                const rightTable = makeTable(
                                    "right",
                                    "right",
                                    `Captação de Leads (${totalRightLeads} no período)`,
                                    "% = leads da célula / total leads captados no período",
                                    "#D4A35A", "212,163,90",
                                    rMap,
                                    c => totalRightLeads > 0 ? c.leads / totalRightLeads * 100 : 0,
                                    c => `${c.leads} leads`,
                                    c => totalRightLeads > 0 ? c.leads / totalRightLeads * 100 : 0,
                                    c => `${c.leads}/${totalRightLeads}`,
                                    maxVolRate,
                                );

                                // ── Painel drill-down ────────────────────────────────────
                                const drillPanel = drillCell && (() => {
                                    const deals = getDrillDeals(drillCell.side, drillCell.dest, drillCell.bucket);
                                    const sideLabel = drillCell.side === "left" ? "Fechamentos" : "Captação de Leads";
                                    const bucketLabel = drillCell.bucket ?? "Total";
                                    const sideColor = drillCell.side === "left" ? "#3DBF8A" : "#D4A35A";
                                    return (
                                        <div style={{ gridColumn: "1 / -1", background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, padding: "14px 18px" }}>
                                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                                                <div style={{ fontSize: 11, color: T.cream }}>
                                                    <span style={{ color: sideColor, fontWeight: 700 }}>{sideLabel}</span>
                                                    {" · "}{drillCell.dest}{" · "}{bucketLabel}
                                                    <span style={{ color: T.muted, marginLeft: 8 }}>({deals.length} deals)</span>
                                                </div>
                                                <button onClick={() => setDrillCell(null)} style={{
                                                    background: "transparent", border: `1px solid ${T.border}`,
                                                    borderRadius: 4, color: T.muted, cursor: "pointer",
                                                    padding: "2px 8px", fontFamily: "inherit", fontSize: 11,
                                                }}>✕ fechar</button>
                                            </div>
                                            <div style={{ overflowX: "auto", maxHeight: 320, overflowY: "auto" }}>
                                                <table style={{ borderCollapse: "collapse", fontSize: 10, width: "100%" }}>
                                                    <thead>
                                                        <tr style={{ borderBottom: `1px solid ${T.border}` }}>
                                                            <th style={{ ...thS, textAlign: "left" as const }}>ID</th>
                                                            <th style={{ ...thS, textAlign: "left" as const }}>Destino</th>
                                                            <th style={thS}>Convidados</th>
                                                            <th style={thS}>Orçamento</th>
                                                            <th style={thS}>Data</th>
                                                            <th style={{ ...thS, textAlign: "left" as const }}>Pipeline</th>
                                                            <th style={{ ...thS, textAlign: "left" as const }}>Etapa</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {deals.map((d, i) => {
                                                            const date = drillCell.side === "left"
                                                                ? d.data_fechamento?.substring(0, 10)
                                                                : d.cdate?.substring(0, 10);
                                                            return (
                                                                <tr key={d.id} style={{ borderBottom: `1px solid ${T.border}22`, background: i % 2 ? T.card : "transparent" }}>
                                                                    <td style={{ padding: "5px 8px" }}>
                                                                        <a href={`https://welcometrips.activehosted.com/app/deals/${d.id}`}
                                                                           target="_blank" rel="noreferrer"
                                                                           style={{ color: T.gold, textDecoration: "none", fontWeight: 700 }}>
                                                                            {d.id}
                                                                        </a>
                                                                    </td>
                                                                    <td style={{ padding: "5px 8px", color: T.cream }}>{d.destino || "—"}</td>
                                                                    <td style={{ padding: "5px 8px", textAlign: "center", color: T.white }}>{d.num_convidados ?? "—"}</td>
                                                                    <td style={{ padding: "5px 8px", textAlign: "center", color: T.white }}>
                                                                        {d.orcamento ? `${(d.orcamento / 1000).toFixed(0)}k` : "—"}
                                                                    </td>
                                                                    <td style={{ padding: "5px 8px", textAlign: "center", color: T.muted }}>{date ?? "—"}</td>
                                                                    <td style={{ padding: "5px 8px", color: T.muted, fontSize: 9 }}>{d.pipeline ?? "—"}</td>
                                                                    <td style={{ padding: "5px 8px", color: T.muted, fontSize: 9 }}>{d.stage}</td>
                                                                </tr>
                                                            );
                                                        })}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                    );
                                })();

                                return (
                                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                                        {leftTable}
                                        {rightTable}
                                        {matchTable}
                                        {drillPanel}
                                    </div>
                                );
                            })()}
                        </div>

                        <div style={{ fontSize: 9, color: T.muted, textAlign: "center" }}>
                            Esquerda: todos os contratos com data de fechamento, qualquer pipeline · Direita: leads das pipelines SDR + Closer Weddings.
                            Destino = "Onde você quer casar?" · Convidados = "Quantas pessoas?" · Investimento = "Quanto pensa em investir?".
                            Match = √(conv_norm × lead_norm) × 100 — identifica segmentos com alto alinhamento entre conversão e captação.
                        </div>
                    </div>
                );
            })()}

        </div>
    );
}
