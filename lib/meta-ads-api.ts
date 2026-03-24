import { z } from "zod";

const META_API_VERSION = "v19.0";
const META_API_BASE = `https://graph.facebook.com/${META_API_VERSION}`;

// Schema para validar resposta da API Meta
export const MetaAdsInsightSchema = z.object({
    spend: z.string(),
    impressions: z.string(),
    clicks: z.string(),
    cpc: z.string().optional(),
    cpm: z.string().optional(),
    date_start: z.string(),
    date_stop: z.string(),
});

export const MetaAdsResponseSchema = z.object({
    data: z.array(MetaAdsInsightSchema),
});

export interface MetaAdsData {
    spend: number;
    impressions: number;
    clicks: number;
    cpc: number;
    cpm: number;
}

/**
 * Fetches Meta Ads insights from the Marketing API.
 * Returns aggregated metrics for the given month.
 */
export async function fetchMetaAdsInsights(
    year: number,
    month: number
): Promise<MetaAdsData> {
    const accessToken = process.env.META_ADS_ACCESS_TOKEN;
    const accountId = process.env.META_ADS_ACCOUNT_WEDDING;

    if (!accessToken || !accountId) {
        throw new Error("Meta Ads credentials not configured");
    }

    // Build date range for the month
    const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const endDate = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

    const params = new URLSearchParams({
        access_token: accessToken,
        fields: "spend,impressions,clicks,cpc,cpm",
        time_range: JSON.stringify({ since: startDate, until: endDate }),
        level: "account",
    });

    const url = `${META_API_BASE}/${accountId}/insights?${params}`;

    const response = await fetch(url, { cache: "no-store" });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(
            `Meta Ads API error: ${error.error?.message || response.status}`
        );
    }

    const json = await response.json();

    // Handle empty data (no spend in that period)
    if (!json.data || json.data.length === 0) {
        return { spend: 0, impressions: 0, clicks: 0, cpc: 0, cpm: 0 };
    }

    const parsed = MetaAdsResponseSchema.parse(json);
    const insight = parsed.data[0];

    return {
        spend: Number(insight.spend) || 0,
        impressions: Number(insight.impressions) || 0,
        clicks: Number(insight.clicks) || 0,
        cpc: Number(insight.cpc) || 0,
        cpm: Number(insight.cpm) || 0,
    };
}
