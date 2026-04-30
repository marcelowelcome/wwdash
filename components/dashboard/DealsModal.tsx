"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import { X, Download, Search, ChevronDown, ChevronRight } from "lucide-react";
import { T } from "./theme";
import { type WonDeal } from "@/lib/schemas";
import { useDialog } from "@/lib/useDialog";
import { leadLifetimeDays, formatDaysDuration } from "@/lib/metrics-jornada";

type StageKey = "leads" | "mql" | "agendamento" | "reunioes" | "qualificado" | "closerAgendada" | "closerRealizada" | "vendas";

interface DealsModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    deals: WonDeal[];
    stageKey?: StageKey;
}

const formatDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return "-";
    return new Date(dateStr).toLocaleDateString("pt-BR");
};

const formatDateTime = (dateStr: string | null | undefined) => {
    if (!dateStr) return "-";
    const date = new Date(dateStr);
    return `${date.toLocaleDateString("pt-BR")} ${date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
};

const fmtNumber = (n: number) => new Intl.NumberFormat("pt-BR").format(n);

function formatOrcamento(v: number | string | null | undefined): string {
    if (v == null || v === "") return "—";
    if (typeof v === "string") return v;
    return `R$ ${fmtNumber(v)}`;
}

function formatConvidados(v: number | string | null | undefined): string {
    if (v == null || v === "") return "—";
    return String(v);
}

// ─── EXECUTIVE SUMMARY ──────────────────────────────────────────────────────

interface SummaryData {
    total: number;
    won: number;
    open: number;
    lost: number;
    avgLifetimeDays: number | null;
    topDestinos: { label: string; count: number }[];
    topOrcamentos: { label: string; count: number }[];
    topConvidados: { label: string; count: number }[];
}

function computeSummary(deals: WonDeal[]): SummaryData {
    let won = 0, open = 0, lost = 0;
    let lifeSum = 0, lifeN = 0;
    const destMap = new Map<string, number>();
    const orcMap = new Map<string, number>();
    const convMap = new Map<string, number>();

    for (const d of deals) {
        if (d.data_fechamento) won++;
        else if (d.status === "2") lost++;
        else open++;

        const life = leadLifetimeDays(d);
        if (life != null) { lifeSum += life; lifeN++; }

        if (d.destino) destMap.set(d.destino, (destMap.get(d.destino) ?? 0) + 1);

        const orc = d.orcamento != null ? String(d.orcamento) : null;
        if (orc) orcMap.set(orc, (orcMap.get(orc) ?? 0) + 1);

        const conv = d.num_convidados != null ? String(d.num_convidados) : null;
        if (conv) convMap.set(conv, (convMap.get(conv) ?? 0) + 1);
    }

    const toTop = (m: Map<string, number>, max = 5) =>
        [...m.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count).slice(0, max);

    return {
        total: deals.length,
        won, open, lost,
        avgLifetimeDays: lifeN > 0 ? lifeSum / lifeN : null,
        topDestinos: toTop(destMap),
        topOrcamentos: toTop(orcMap),
        topConvidados: toTop(convMap),
    };
}

function MiniBar({ items, total, color }: { items: { label: string; count: number }[]; total: number; color: string }) {
    if (items.length === 0) return <span style={{ color: T.muted, fontSize: 10, fontStyle: "italic" }}>sem dados</span>;
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {items.map((it) => {
                const pct = total > 0 ? (it.count / total) * 100 : 0;
                return (
                    <div key={it.label} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{
                                height: 6,
                                borderRadius: 3,
                                background: T.border,
                                overflow: "hidden",
                            }}>
                                <div style={{
                                    height: "100%",
                                    width: `${Math.max(pct, 2)}%`,
                                    background: color,
                                    borderRadius: 3,
                                    transition: "width 0.3s ease",
                                }} />
                            </div>
                        </div>
                        <span style={{ color: T.cream, fontFamily: "monospace", minWidth: 24, textAlign: "right" }}>{it.count}</span>
                        <span style={{ color: T.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 120 }}>{it.label}</span>
                    </div>
                );
            })}
        </div>
    );
}

function ExecutiveSummary({ deals }: { deals: WonDeal[] }) {
    const s = useMemo(() => computeSummary(deals), [deals]);
    if (s.total === 0) return null;

    const statusItems = [
        { label: "Won", count: s.won, color: T.green },
        { label: "Open", count: s.open, color: T.gold },
        { label: "Lost", count: s.lost, color: T.red },
    ];

    return (
        <div style={{
            padding: "16px 20px",
            borderBottom: `1px solid ${T.border}`,
        }}>
            <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                gap: 16,
            }}>
                {/* Status distribution */}
                <div style={{ background: T.card, borderRadius: 10, padding: "14px 16px" }}>
                    <div style={{ fontSize: 10, color: T.muted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10, fontWeight: 600 }}>
                        Status
                    </div>
                    {/* Stacked bar */}
                    <div style={{ display: "flex", height: 8, borderRadius: 4, overflow: "hidden", marginBottom: 10, background: T.border }}>
                        {statusItems.map((si) => {
                            const pct = s.total > 0 ? (si.count / s.total) * 100 : 0;
                            if (pct === 0) return null;
                            return <div key={si.label} style={{ width: `${pct}%`, background: si.color, transition: "width 0.3s ease" }} />;
                        })}
                    </div>
                    <div style={{ display: "flex", gap: 12 }}>
                        {statusItems.map((si) => (
                            <div key={si.label} style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 4 }}>
                                <span style={{ width: 6, height: 6, borderRadius: 2, background: si.color, display: "inline-block" }} />
                                <span style={{ color: T.cream, fontFamily: "monospace", fontWeight: 600 }}>{si.count}</span>
                                <span style={{ color: T.muted }}>{si.label}</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Avg Lifetime */}
                <div style={{ background: T.card, borderRadius: 10, padding: "14px 16px" }}>
                    <div style={{ fontSize: 10, color: T.muted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10, fontWeight: 600 }}>
                        Tempo médio de vida
                    </div>
                    <div style={{ fontSize: 22, color: T.white, fontWeight: 700, fontFamily: "monospace" }}>
                        {s.avgLifetimeDays != null ? formatDaysDuration(s.avgLifetimeDays) : "—"}
                    </div>
                </div>

                {/* Top Destinos */}
                <div style={{ background: T.card, borderRadius: 10, padding: "14px 16px" }}>
                    <div style={{ fontSize: 10, color: T.muted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10, fontWeight: 600 }}>
                        Top destinos
                    </div>
                    <MiniBar items={s.topDestinos} total={s.total} color={T.berry} />
                </div>

                {/* Top Orcamento */}
                <div style={{ background: T.card, borderRadius: 10, padding: "14px 16px" }}>
                    <div style={{ fontSize: 10, color: T.muted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10, fontWeight: 600 }}>
                        Faixa de orçamento
                    </div>
                    <MiniBar items={s.topOrcamentos} total={s.total} color={T.gold} />
                </div>
            </div>
        </div>
    );
}

// ─── EXPANDED ROW ────────────────────────────────────────────────────────────

function DealExpandedRow({ deal }: { deal: WonDeal }) {
    const lifetime = leadLifetimeDays(deal);
    const fields: { label: string; value: string }[] = [
        { label: "ID", value: deal.id },
        { label: "Pipeline", value: deal.pipeline || "—" },
        { label: "Stage", value: deal.stage || "—" },
        { label: "Status", value: deal.data_fechamento ? "Won" : deal.status === "2" ? "Lost" : "Open" },
        { label: "Tempo de vida", value: lifetime != null ? formatDaysDuration(lifetime) : "—" },
        { label: "Destino desejado", value: deal.destino || "—" },
        { label: "Orçamento", value: formatOrcamento(deal.orcamento) },
        { label: "Nº convidados", value: formatConvidados(deal.num_convidados) },
    ];

    return (
        <tr>
            <td colSpan={100} style={{ padding: 0, borderBottom: `1px solid ${T.border}` }}>
                <div style={{
                    background: `${T.card}80`,
                    padding: "12px 16px 12px 40px",
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
                    gap: "8px 24px",
                }}>
                    {fields.map((f) => (
                        <div key={f.label}>
                            <div style={{ fontSize: 9, color: T.muted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 2 }}>
                                {f.label}
                            </div>
                            <div style={{ fontSize: 12, color: T.cream, fontWeight: 500 }}>
                                {f.value}
                            </div>
                        </div>
                    ))}
                </div>
            </td>
        </tr>
    );
}

// ─── MAIN MODAL ──────────────────────────────────────────────────────────────

export function DealsModal({ isOpen, onClose, title, deals, stageKey }: DealsModalProps) {
    const searchRef = useRef<HTMLInputElement>(null);
    const [search, setSearch] = useState("");
    const [expandedId, setExpandedId] = useState<string | null>(null);

    // Deduplicate deals by ID
    const uniqueDeals = useMemo(() => {
        const seen = new Set<string>();
        return deals.filter((d) => {
            if (seen.has(d.id)) return false;
            seen.add(d.id);
            return true;
        });
    }, [deals]);

    const filteredDeals = useMemo(() => {
        if (!search.trim()) return uniqueDeals;
        const term = search.toLowerCase();
        return uniqueDeals.filter(
            (d) =>
                d.id.toString().includes(term) ||
                d.title?.toLowerCase().includes(term) ||
                d.pipeline?.toLowerCase().includes(term) ||
                d.stage?.toLowerCase().includes(term) ||
                d.destino?.toLowerCase().includes(term)
        );
    }, [uniqueDeals, search]);

    const dialogRef = useDialog({ isOpen, onClose });

    useEffect(() => {
        if (isOpen) {
            setTimeout(() => searchRef.current?.focus(), 100);
        } else {
            setSearch("");
            setExpandedId(null);
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const titleId = "deals-modal-title";

    const getStatusBadge = (deal: WonDeal) => {
        const isWon = !!deal.data_fechamento;
        const isLost = !isWon && deal.status === "2";
        const config = isWon
            ? { label: "Won", color: T.green, bg: `${T.green}20` }
            : isLost
                ? { label: "Lost", color: T.red, bg: `${T.red}20` }
                : { label: "Open", color: T.gold, bg: `${T.gold}20` };
        return (
            <span style={{
                padding: "2px 8px",
                borderRadius: 4,
                fontSize: 10,
                fontWeight: 600,
                color: config.color,
                background: config.bg,
            }}>
                {config.label}
            </span>
        );
    };

    const getExtraColumns = (): { header: string; getValue: (d: WonDeal) => string }[] => {
        switch (stageKey) {
            case "agendamento":
            case "reunioes":
                return [
                    { header: "Data Reuniao", getValue: (d) => formatDateTime(d.data_reuniao_1) },
                    { header: "Como foi", getValue: (d) => d.como_foi_feita_a_1a_reuniao || "-" },
                ];
            case "qualificado":
                return [{ header: "Data Qualificacao", getValue: (d) => formatDate(d.data_qualificado) }];
            case "closerAgendada":
            case "closerRealizada":
                return [
                    { header: "Data Closer", getValue: (d) => formatDateTime(d.data_horario_agendamento_closer) },
                    { header: "Como foi Closer", getValue: (d) => d.reuniao_closer || d.tipo_reuniao_closer || "-" },
                ];
            case "vendas":
                return [{ header: "Data Fechamento", getValue: (d) => formatDateTime(d.data_fechamento) }];
            default:
                return [];
        }
    };

    const extraColumns = getExtraColumns();

    const exportToCSV = () => {
        const baseHeaders = ["ID", "Pipeline", "Stage", "Status", "Criado", "Tempo de Vida (dias)", "Destino", "Orcamento", "Convidados"];
        const extraHeaders = extraColumns.map((c) => c.header);
        const headers = [...baseHeaders, ...extraHeaders];

        const rows = filteredDeals.map((d) => {
            const life = leadLifetimeDays(d);
            return [
                d.id,
                d.pipeline || "",
                d.stage || "",
                d.data_fechamento ? "Won" : d.status === "2" ? "Lost" : "Open",
                d.cdate ? new Date(d.cdate).toLocaleDateString("pt-BR") : "",
                life != null ? Math.round(life).toString() : "",
                d.destino || "",
                d.orcamento != null ? String(d.orcamento) : "",
                d.num_convidados != null ? String(d.num_convidados) : "",
                ...extraColumns.map((c) => c.getValue(d)),
            ];
        });

        const csvContent = [headers.join(";"), ...rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(";"))].join("\n");

        const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `${title.replace(/\s+/g, "_")}_${new Date().toISOString().split("T")[0]}.csv`;
        link.click();
        URL.revokeObjectURL(url);
    };

    return (
        <div
            onClick={(e) => e.target === e.currentTarget && onClose()}
            style={{
                position: "fixed",
                inset: 0,
                background: "rgba(0, 0, 0, 0.8)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 1000,
                padding: 24,
            }}
        >
            <div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                tabIndex={-1}
                style={{
                    background: T.surface,
                    borderRadius: 12,
                    border: `1px solid ${T.border}`,
                    width: "100%",
                    maxWidth: 1100,
                    maxHeight: "90vh",
                    display: "flex",
                    flexDirection: "column",
                    overflow: "hidden",
                }}
            >
                {/* Header */}
                <div
                    style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "16px 20px",
                        borderBottom: `1px solid ${T.border}`,
                    }}
                >
                    <h2 id={titleId} style={{ fontSize: 16, fontWeight: 700, color: T.white, margin: 0 }}>
                        {title} ({filteredDeals.length}
                        {search ? ` de ${uniqueDeals.length}` : ""})
                    </h2>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <button
                            onClick={exportToCSV}
                            style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 6,
                                padding: "6px 12px",
                                background: T.gold,
                                color: T.bg,
                                border: "none",
                                borderRadius: 6,
                                fontSize: 12,
                                fontWeight: 600,
                                cursor: "pointer",
                            }}
                        >
                            <Download size={14} />
                            CSV
                        </button>
                        <button
                            onClick={onClose}
                            aria-label="Fechar"
                            style={{
                                background: "transparent",
                                border: "none",
                                cursor: "pointer",
                                padding: 4,
                            }}
                        >
                            <X size={20} color={T.muted} aria-hidden="true" />
                        </button>
                    </div>
                </div>

                {/* Executive Summary */}
                <ExecutiveSummary deals={uniqueDeals} />

                {/* Search */}
                <div style={{ padding: "12px 20px" }}>
                    <div
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            background: T.card,
                            border: `1px solid ${T.border}`,
                            borderRadius: 8,
                            padding: "8px 12px",
                        }}
                    >
                        <Search size={16} color={T.muted} />
                        <input
                            ref={searchRef}
                            type="text"
                            placeholder="Buscar por ID, pipeline, stage ou destino..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            style={{
                                flex: 1,
                                background: "transparent",
                                border: "none",
                                outline: "none",
                                color: T.white,
                                fontSize: 13,
                            }}
                        />
                    </div>
                </div>

                {/* Table */}
                <div style={{ flex: 1, overflowY: "auto", padding: "0 20px 20px" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                        <thead>
                            <tr>
                                <th scope="col" style={{ ...thStyle, width: 28 }} />
                                <th scope="col" style={{ ...thStyle }}>ID</th>
                                <th scope="col" style={{ ...thStyle }}>Pipeline</th>
                                <th scope="col" style={{ ...thStyle }}>Stage</th>
                                <th scope="col" style={{ ...thStyle }}>Status</th>
                                <th scope="col" style={{ ...thStyle }}>Criado</th>
                                {extraColumns.map((col, i) => (
                                    <th key={i} scope="col" style={{ ...thStyle, color: T.gold }}>
                                        {col.header}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {filteredDeals.map((deal) => {
                                const isExpanded = expandedId === deal.id;
                                return (
                                    <DealRow
                                        key={deal.id}
                                        deal={deal}
                                        isExpanded={isExpanded}
                                        onToggle={() => setExpandedId(isExpanded ? null : deal.id)}
                                        getStatusBadge={getStatusBadge}
                                        extraColumns={extraColumns}
                                    />
                                );
                            })}
                            {filteredDeals.length === 0 && (
                                <tr>
                                    <td colSpan={6 + extraColumns.length} style={{ ...tdStyle, textAlign: "center", padding: 32, color: T.muted }}>
                                        {search ? "Nenhum resultado encontrado" : "Nenhum deal encontrado"}
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

function DealRow({
    deal,
    isExpanded,
    onToggle,
    getStatusBadge,
    extraColumns,
}: {
    deal: WonDeal;
    isExpanded: boolean;
    onToggle: () => void;
    getStatusBadge: (d: WonDeal) => React.ReactNode;
    extraColumns: { header: string; getValue: (d: WonDeal) => string }[];
}) {
    const [hover, setHover] = useState(false);
    return (
        <>
            <tr
                style={{ cursor: "pointer", background: hover || isExpanded ? T.card : "transparent", transition: "background 0.1s ease" }}
                onMouseEnter={() => setHover(true)}
                onMouseLeave={() => setHover(false)}
                onClick={onToggle}
                title="Clique para expandir detalhes"
            >
                <td style={{ ...tdStyle, padding: "10px 4px", width: 28 }}>
                    {isExpanded
                        ? <ChevronDown size={14} color={T.gold} />
                        : <ChevronRight size={14} color={T.muted} />
                    }
                </td>
                <td style={{ ...tdStyle, fontFamily: "monospace", fontSize: 10, color: T.gold }}>
                    <a
                        href={`https://welcometrips.activehosted.com/app/deals/${deal.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        style={{ color: T.gold, textDecoration: "none" }}
                    >
                        {deal.id} ↗
                    </a>
                </td>
                <td style={{ ...tdStyle }}>{deal.pipeline || "-"}</td>
                <td style={{ ...tdStyle }}>{deal.stage || "-"}</td>
                <td style={{ ...tdStyle }}>{getStatusBadge(deal)}</td>
                <td style={{ ...tdStyle, fontSize: 10 }}>{deal.cdate ? new Date(deal.cdate).toLocaleDateString("pt-BR") : "-"}</td>
                {extraColumns.map((col, i) => (
                    <td key={i} style={{ ...tdStyle, color: T.gold, fontSize: 10 }}>
                        {col.getValue(deal)}
                    </td>
                ))}
            </tr>
            {isExpanded && <DealExpandedRow deal={deal} />}
        </>
    );
}

const thStyle: React.CSSProperties = {
    padding: "10px 8px",
    textAlign: "left",
    color: T.muted,
    fontWeight: 600,
    borderBottom: `1px solid ${T.border}`,
    position: "sticky",
    top: 0,
    background: T.surface,
};

const tdStyle: React.CSSProperties = {
    padding: "10px 8px",
    color: T.white,
    borderBottom: `1px solid ${T.border}`,
};
