"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import { X, Download, Search, ExternalLink } from "lucide-react";
import { T } from "./theme";
import { type WonDeal } from "@/lib/schemas";

type StageKey = "leads" | "mql" | "agendamento" | "reunioes" | "qualificado" | "closerAgendada" | "closerRealizada" | "vendas";

const AC_DEAL_URL = "https://welcometrips.activehosted.com/app/deals";

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

export function DealsModal({ isOpen, onClose, title, deals, stageKey }: DealsModalProps) {
    const searchRef = useRef<HTMLInputElement>(null);
    const [search, setSearch] = useState("");

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

    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };

        if (isOpen) {
            document.addEventListener("keydown", handleEscape);
            document.body.style.overflow = "hidden";
            setTimeout(() => searchRef.current?.focus(), 100);
        }

        return () => {
            document.removeEventListener("keydown", handleEscape);
            document.body.style.overflow = "unset";
        };
    }, [isOpen, onClose]);

    useEffect(() => {
        if (!isOpen) setSearch("");
    }, [isOpen]);

    if (!isOpen) return null;

    const getStatusBadge = (status: string | undefined) => {
        const s = status || "1";
        const map: Record<string, { label: string; color: string; bg: string }> = {
            "0": { label: "Won", color: T.green, bg: `${T.green}20` },
            "1": { label: "Open", color: T.gold, bg: `${T.gold}20` },
            "2": { label: "Lost", color: T.red, bg: `${T.red}20` },
        };
        const config = map[s] || map["1"];
        return (
            <span
                style={{
                    padding: "2px 8px",
                    borderRadius: 4,
                    fontSize: 10,
                    fontWeight: 600,
                    color: config.color,
                    background: config.bg,
                }}
            >
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
                    { header: "Como foi Closer", getValue: (d) => d.reuniao_closer || "-" },
                ];
            case "vendas":
                return [{ header: "Data Fechamento", getValue: (d) => formatDateTime(d.data_fechamento) }];
            default:
                return [];
        }
    };

    const extraColumns = getExtraColumns();

    const exportToCSV = () => {
        const baseHeaders = ["ID", "Nome", "Pipeline", "Stage", "Status", "Criado"];
        const extraHeaders = extraColumns.map((c) => c.header);
        const headers = [...baseHeaders, ...extraHeaders, "Destino", "Link AC"];

        const rows = filteredDeals.map((d) => [
            d.id,
            d.title || "",
            d.pipeline || "",
            d.stage || "",
            d.status === "0" ? "Won" : d.status === "2" ? "Lost" : "Open",
            d.cdate ? new Date(d.cdate).toLocaleDateString("pt-BR") : "",
            ...extraColumns.map((c) => c.getValue(d)),
            d.destino || "",
            `${AC_DEAL_URL}/${d.id}`,
        ]);

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
                style={{
                    background: T.surface,
                    borderRadius: 12,
                    border: `1px solid ${T.border}`,
                    width: "100%",
                    maxWidth: 1000,
                    maxHeight: "85vh",
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
                    <h2 style={{ fontSize: 16, fontWeight: 700, color: T.white, margin: 0 }}>
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
                            style={{
                                background: "transparent",
                                border: "none",
                                cursor: "pointer",
                                padding: 4,
                            }}
                        >
                            <X size={20} color={T.muted} />
                        </button>
                    </div>
                </div>

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
                                <th style={{ ...thStyle }}>ID</th>
                                <th style={{ ...thStyle }}>Nome</th>
                                <th style={{ ...thStyle }}>Pipeline</th>
                                <th style={{ ...thStyle }}>Stage</th>
                                <th style={{ ...thStyle }}>Status</th>
                                <th style={{ ...thStyle }}>Criado</th>
                                {extraColumns.map((col, i) => (
                                    <th key={i} style={{ ...thStyle, color: T.gold }}>
                                        {col.header}
                                    </th>
                                ))}
                                <th style={{ ...thStyle }}></th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredDeals.map((deal) => (
                                <tr key={deal.id}>
                                    <td style={{ ...tdStyle, fontFamily: "monospace", fontSize: 10 }}>{deal.id}</td>
                                    <td style={{ ...tdStyle, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={deal.title || "-"}>
                                        {deal.title || "-"}
                                    </td>
                                    <td style={{ ...tdStyle }}>{deal.pipeline || "-"}</td>
                                    <td style={{ ...tdStyle }}>{deal.stage || "-"}</td>
                                    <td style={{ ...tdStyle }}>{getStatusBadge(deal.status)}</td>
                                    <td style={{ ...tdStyle, fontSize: 10 }}>{deal.cdate ? new Date(deal.cdate).toLocaleDateString("pt-BR") : "-"}</td>
                                    {extraColumns.map((col, i) => (
                                        <td key={i} style={{ ...tdStyle, color: T.gold, fontSize: 10 }}>
                                            {col.getValue(deal)}
                                        </td>
                                    ))}
                                    <td style={{ ...tdStyle }}>
                                        <a
                                            href={`${AC_DEAL_URL}/${deal.id}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            style={{
                                                display: "flex",
                                                alignItems: "center",
                                                gap: 4,
                                                color: T.gold,
                                                textDecoration: "none",
                                                fontSize: 10,
                                            }}
                                            title="Abrir no ActiveCampaign"
                                        >
                                            <ExternalLink size={12} />
                                        </a>
                                    </td>
                                </tr>
                            ))}
                            {filteredDeals.length === 0 && (
                                <tr>
                                    <td colSpan={7 + extraColumns.length} style={{ ...tdStyle, textAlign: "center", padding: 32, color: T.muted }}>
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
