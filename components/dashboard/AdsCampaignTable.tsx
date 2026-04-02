"use client";

import { T } from "./theme";
import type { AdsCampaignRow } from "@/lib/supabase-api";

interface AdsCampaignTableProps {
    data: AdsCampaignRow[];
}

const fmt = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtInt = (v: number) => v.toLocaleString("pt-BR");

export function AdsCampaignTable({ data }: AdsCampaignTableProps) {
    if (!data.length) return null;

    return (
        <div
            style={{
                background: T.card,
                border: `1px solid ${T.border}`,
                borderRadius: 12,
                padding: "20px 22px",
                overflowX: "auto",
            }}
        >
            <div style={{ fontSize: 13, fontWeight: 700, color: T.cream, marginBottom: 16 }}>
                Campanhas
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                    <tr style={{ borderBottom: `1px solid ${T.border}` }}>
                        <th style={thStyle}>Campanha</th>
                        <th style={thStyle}>Fonte</th>
                        <th style={{ ...thStyle, textAlign: "right" }}>Spend</th>
                        <th style={{ ...thStyle, textAlign: "right" }}>Clicks</th>
                        <th style={{ ...thStyle, textAlign: "right" }}>CPC</th>
                        <th style={{ ...thStyle, textAlign: "right" }}>Impress.</th>
                        <th style={{ ...thStyle, textAlign: "right" }}>CPM</th>
                    </tr>
                </thead>
                <tbody>
                    {data.map((row) => {
                        const cpc = row.clicks > 0 ? row.spend / row.clicks : 0;
                        const cpm = row.impressions > 0 ? (row.spend / row.impressions) * 1000 : 0;
                        const isMeta = row.source === "meta_ads";

                        return (
                            <tr
                                key={`${row.source}-${row.campaign_id}`}
                                style={{ borderBottom: `1px solid ${T.border}` }}
                            >
                                <td style={{ ...tdStyle, maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                    {row.campaign_name}
                                </td>
                                <td style={tdStyle}>
                                    <span
                                        style={{
                                            display: "inline-block",
                                            padding: "2px 8px",
                                            borderRadius: 4,
                                            fontSize: 10,
                                            fontWeight: 600,
                                            color: "#fff",
                                            background: isMeta ? "#1877F2" : "#4285F4",
                                        }}
                                    >
                                        {isMeta ? "Meta" : "Google"}
                                    </span>
                                </td>
                                <td style={{ ...tdStyle, textAlign: "right", fontWeight: 600 }}>
                                    R$ {fmt(row.spend)}
                                </td>
                                <td style={{ ...tdStyle, textAlign: "right" }}>
                                    {fmtInt(row.clicks)}
                                </td>
                                <td style={{ ...tdStyle, textAlign: "right" }}>
                                    R$ {fmt(cpc)}
                                </td>
                                <td style={{ ...tdStyle, textAlign: "right" }}>
                                    {fmtInt(row.impressions)}
                                </td>
                                <td style={{ ...tdStyle, textAlign: "right" }}>
                                    R$ {fmt(cpm)}
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}

const thStyle: React.CSSProperties = {
    padding: "8px 6px",
    textAlign: "left",
    color: T.muted,
    fontWeight: 600,
    whiteSpace: "nowrap",
};

const tdStyle: React.CSSProperties = {
    padding: "8px 6px",
    color: T.cream,
};
