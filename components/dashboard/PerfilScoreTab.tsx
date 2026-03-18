"use client";

import { useState, useMemo, useEffect } from "react";
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
    type ScoreBands,
    DEFAULT_SCORE_BANDS,
    SCORE_CONFIG_KEY,
} from "@/lib/lead-score";
import { type Section, SECTIONS, dateToMonthKey } from "./perfil-score/shared";
import {
    PerfilSection,
    PotencialSection,
    ScoreSection,
    FunilSection,
    AnaliseSection,
    ContratosSection,
    ConfigSection,
} from "./perfil-score";

// ─── Props ────────────────────────────────────────────────────────────────────

interface PerfilScoreTabProps {
    wonDeals: WonDeal[];
    closerDeals: WonDeal[];
    sdrDeals: WonDeal[];
    fieldMap: Record<string, string>;
}

// ─── Main Component (thin orchestrator) ──────────────────────────────────────

export function PerfilScoreTab({ wonDeals, closerDeals, sdrDeals, fieldMap }: PerfilScoreTabProps) {
    const [section, setSection] = useState<Section>("perfil");
    const [selectedMonthKey, setSelectedMonthKey] = useState<string | null>(null);
    const [monthA, setMonthA] = useState<string | null>(null);
    const [monthB, setMonthB] = useState<string | null>(null);
    const [monthsLeft, setMonthsLeft] = useState<string[]>([]);
    const [monthsRight, setMonthsRight] = useState<string[]>([]);

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
    const monthlyProfiles = useMemo(
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
    const allPipelineDeals = useMemo(() => {
        const seen = new Set<string>();
        const out: typeof closerDeals = [];
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
    const monthlyPotential = useMemo(
        () => buildMonthlyLeadPotential(closerAndWonDeals, simpleProfiles, bands),
        [closerAndWonDeals, simpleProfiles, bands]
    );

    // ── Score all pipeline deals (pipe 1 + 3) ────────────────────────────
    const scoredAll = useMemo<SimpleScoredDeal[]>(
        () => scoreSimpleDeals(allPipelineDeals, simpleProfiles, bands),
        [allPipelineDeals, simpleProfiles, bands]
    );

    // ── Open deals across ALL pipelines ──────────────────────────────────
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

    // ── Tier conversion stats (pipe 1+3) ─────────────────────────────────
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

            {section === "perfil" && (
                <PerfilSection
                    monthlyProfiles={monthlyProfiles}
                    seasonality={seasonality}
                    selectedMonthKey={selectedMonthKey}
                    onSelectMonth={setSelectedMonthKey}
                />
            )}

            {section === "potencial" && (
                <PotencialSection
                    monthlyPotential={monthlyPotential}
                    closerAndWonDeals={closerAndWonDeals}
                    scoredAll={scoredAll}
                />
            )}

            {section === "score" && (
                <ScoreSection
                    scored={scored}
                    scoreCounts={scoreCounts}
                />
            )}

            {section === "funil" && (
                <FunilSection
                    funnelQuality={funnelQuality}
                    allOpenDeals={allOpenDeals}
                    simpleProfiles={simpleProfiles}
                    scoredAll={scoredAll}
                />
            )}

            {section === "analise" && (
                <AnaliseSection
                    scoredWon={scoredWon}
                    scoredAll={scoredAll}
                    allPipelineDeals={allPipelineDeals}
                    availableCloseDateMonths={availableCloseDateMonths}
                    availableCdateMonths={availableCdateMonths}
                    monthsLeft={monthsLeft}
                    monthsRight={monthsRight}
                    setMonthsLeft={setMonthsLeft}
                    setMonthsRight={setMonthsRight}
                />
            )}

            {section === "contratos" && (
                <ContratosSection
                    tierConvStats={tierConvStats}
                    availableContractMonths={availableContractMonths}
                    allByCreationMonth={allByCreationMonth}
                    monthA={monthA}
                    monthB={monthB}
                    setMonthA={setMonthA}
                    setMonthB={setMonthB}
                />
            )}

            {section === "config" && (
                <ConfigSection
                    bands={bands}
                    onBandChange={handleBandChange}
                    onSave={handleSave}
                    onReset={handleReset}
                />
            )}

        </div>
    );
}
