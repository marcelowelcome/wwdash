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

const MetaAdsCampaignInsightSchema = z.object({
    campaign_id: z.string(),
    campaign_name: z.string(),
    spend: z.string(),
    impressions: z.string(),
    clicks: z.string(),
});

export interface MetaAdsData {
    spend: number;
    impressions: number;
    clicks: number;
    cpc: number;
    cpm: number;
}

export interface MetaAdsDailyRow {
    date: string;
    spend: number;
    impressions: number;
    clicks: number;
}

export interface MetaAdsCampaignRow {
    campaign_id: string;
    campaign_name: string;
    spend: number;
    impressions: number;
    clicks: number;
}

/** Returns credentials and date range for Meta Ads API calls. */
function getMetaAdsConfig(year: number, month: number) {
    const accessToken = process.env.META_ADS_ACCESS_TOKEN;
    const accountId = process.env.META_ADS_ACCOUNT_WEDDING;

    if (!accessToken || !accountId) {
        throw new Error("Meta Ads credentials not configured");
    }

    const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const endDate = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

    return { accessToken, accountId, startDate, endDate };
}

/** Fetches a Meta Ads insights URL, following pagination if needed. */
async function fetchAllPages<R>(url: string, parse: (item: unknown) => R): Promise<R[]> {
    const results: R[] = [];
    let nextUrl: string | null = url;

    while (nextUrl) {
        const resp: Response = await fetch(nextUrl, { cache: "no-store" });
        if (!resp.ok) {
            const errBody = await resp.json() as { error?: { message?: string } };
            throw new Error(`Meta Ads API error: ${errBody.error?.message || resp.status}`);
        }
        const body = await resp.json() as { data?: unknown[]; paging?: { next?: string } };
        if (body.data) {
            results.push(...body.data.map(parse));
        }
        nextUrl = body.paging?.next ?? null;
    }

    return results;
}

/**
 * Fetches Meta Ads insights from the Marketing API.
 * Returns aggregated metrics for the given month.
 */
export async function fetchMetaAdsInsights(
    year: number,
    month: number
): Promise<MetaAdsData> {
    const { accessToken, accountId, startDate, endDate } = getMetaAdsConfig(year, month);

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
        throw new Error(`Meta Ads API error: ${error.error?.message || response.status}`);
    }

    const json = await response.json();

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

/**
 * Fetches daily metrics for the given month.
 * Uses time_increment=1 to get one row per day.
 */
export async function fetchMetaAdsDailyInsights(
    year: number,
    month: number
): Promise<MetaAdsDailyRow[]> {
    const { accessToken, accountId, startDate, endDate } = getMetaAdsConfig(year, month);

    const params = new URLSearchParams({
        access_token: accessToken,
        fields: "spend,impressions,clicks",
        time_range: JSON.stringify({ since: startDate, until: endDate }),
        time_increment: "1",
        level: "account",
    });

    const url = `${META_API_BASE}/${accountId}/insights?${params}`;

    return fetchAllPages(url, (item) => {
        const parsed = MetaAdsInsightSchema.parse(item);
        return {
            date: parsed.date_start,
            spend: Number(parsed.spend) || 0,
            impressions: Number(parsed.impressions) || 0,
            clicks: Number(parsed.clicks) || 0,
        };
    });
}

/**
 * Fetches per-campaign metrics for the given month.
 */
export async function fetchMetaAdsCampaignInsights(
    year: number,
    month: number
): Promise<MetaAdsCampaignRow[]> {
    const { accessToken, accountId, startDate, endDate } = getMetaAdsConfig(year, month);

    const params = new URLSearchParams({
        access_token: accessToken,
        fields: "spend,impressions,clicks,campaign_id,campaign_name",
        time_range: JSON.stringify({ since: startDate, until: endDate }),
        level: "campaign",
    });

    const url = `${META_API_BASE}/${accountId}/insights?${params}`;

    return fetchAllPages(url, (item) => {
        const parsed = MetaAdsCampaignInsightSchema.parse(item);
        return {
            campaign_id: parsed.campaign_id,
            campaign_name: parsed.campaign_name,
            spend: Number(parsed.spend) || 0,
            impressions: Number(parsed.impressions) || 0,
            clicks: Number(parsed.clicks) || 0,
        };
    });
}
