"use client";

import { T } from "../theme";
import type { SimpleScoredDeal } from "@/lib/lead-score";

// ─── Formatters ──────────────────────────────────────────────────────────────

export const fmtBRL = (v: number) => v >= 1000 ? `R$ ${(v / 1000).toFixed(0)}k` : `R$ ${v}`;
export const fmtBRLFull = (v: number) => `R$ ${v.toLocaleString("pt-BR")}`;

// ─── Band colors ─────────────────────────────────────────────────────────────

export const BAND_COLOR: Record<string, string> = { A: "#3DBF8A", B: "#D4A35A", C: "#E08C3A", D: "#E05252" };
export const BAND_BG: Record<string, string> = { A: "#3DBF8A22", B: "#D4A35A22", C: "#E08C3A22", D: "#E0525222" };

// ─── Section type ────────────────────────────────────────────────────────────

export type Section = "perfil" | "potencial" | "score" | "funil" | "analise" | "contratos" | "config";

export const SECTIONS: { id: Section; label: string }[] = [
    { id: "perfil", label: "Perfil Mensal" },
    { id: "potencial", label: "Potencial por Mês" },
    { id: "score", label: "Score Board" },
    { id: "funil", label: "Qualidade do Funil" },
    { id: "analise", label: "Painel Comparativo" },
    { id: "contratos", label: "Contratos Fechados" },
    { id: "config", label: "Config Score" },
];

// ─── Month helpers ───────────────────────────────────────────────────────────

export const PT_MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

export function dateToMonthKey(dateStr: string | null | undefined): string | null {
    if (!dateStr) return null;
    return dateStr.length >= 7 ? dateStr.substring(0, 7) : null;
}

export function monthKeyToLabel(mk: string): string {
    const [year, month] = mk.split("-");
    return `${PT_MONTHS[parseInt(month) - 1]}/${year.slice(2)}`;
}

// ─── Sort helpers ────────────────────────────────────────────────────────────

export type SortState = { col: string; dir: "asc" | "desc" };

export function sortDeals(deals: SimpleScoredDeal[], sort: SortState): SimpleScoredDeal[] {
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

// ─── Heatmap helpers ─────────────────────────────────────────────────────────

export const CONV_BUCKETS = ["≤50", "51-100", "101-150", "151-200", "201+", "Sem dados"] as const;
export type ConvBucket = typeof CONV_BUCKETS[number];

export function getConvBucket(n: number | null | undefined): ConvBucket {
    if (n == null) return "Sem dados";
    if (n <= 50) return "≤50";
    if (n <= 100) return "51-100";
    if (n <= 150) return "101-150";
    if (n <= 200) return "151-200";
    return "201+";
}

export const ORC_BUCKETS = ["≤15k", "15-30k", "30-50k", "50-80k", "80-120k", "120k+", "Sem dados"] as const;
export type OrcBucket = typeof ORC_BUCKETS[number];

export function getOrcBucket(v: number | null | undefined): OrcBucket {
    if (v == null) return "Sem dados";
    if (v <= 15000) return "≤15k";
    if (v <= 30000) return "15-30k";
    if (v <= 50000) return "30-50k";
    if (v <= 80000) return "50-80k";
    if (v <= 120000) return "80-120k";
    return "120k+";
}

export interface HeatCell { leads: number; won: number; lost: number; }
export interface HeatRow { dest: string; bm: Map<string, HeatCell>; total: HeatCell; }

export function buildHeatmapPivot(
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

// ─── Shared small components ─────────────────────────────────────────────────

export function ScoreBadge({ band, total }: { band: string; total: number }) {
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

export function AlignmentBar({ pct, color = T.gold }: { pct: number; color?: string }) {
    return (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ flex: 1, height: 6, background: T.border, borderRadius: 3, overflow: "hidden" }}>
                <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 3, transition: "width 0.4s" }} />
            </div>
            <span style={{ fontSize: 10, color: T.white, minWidth: 28, textAlign: "right" }}>{pct}%</span>
        </div>
    );
}
