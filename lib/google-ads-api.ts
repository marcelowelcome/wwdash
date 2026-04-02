import { GoogleAdsApi, type Customer } from "google-ads-api";

export interface GoogleAdsData {
    spend: number;
    impressions: number;
    clicks: number;
    cpc: number;
    cpm: number;
}

export interface GoogleAdsDailyRow {
    date: string;
    spend: number;
    impressions: number;
    clicks: number;
}

export interface GoogleAdsCampaignRow {
    campaign_id: string;
    campaign_name: string;
    spend: number;
    impressions: number;
    clicks: number;
}

/** Builds date range strings for a given month. */
function buildDateRange(year: number, month: number) {
    const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const endDate = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
    return { startDate, endDate };
}

/** Creates an authenticated Google Ads customer instance. */
function getCustomer(): Customer {
    const clientId = process.env.GOOGLE_ADS_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET;
    const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
    const refreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN;
    const customerId = process.env.GOOGLE_ADS_CUSTOMER_ID?.replace(/-/g, "");
    const loginCustomerId = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID?.replace(/-/g, "");

    if (!clientId || !clientSecret || !developerToken || !refreshToken || !customerId) {
        throw new Error("Google Ads credentials not configured");
    }

    const client = new GoogleAdsApi({
        client_id: clientId,
        client_secret: clientSecret,
        developer_token: developerToken,
    });

    return client.Customer({
        customer_id: customerId,
        login_customer_id: loginCustomerId,
        refresh_token: refreshToken,
    });
}

/**
 * Fetches aggregated monthly metrics.
 */
export async function fetchGoogleAdsInsights(
    year: number,
    month: number
): Promise<GoogleAdsData> {
    const customer = getCustomer();
    const { startDate, endDate } = buildDateRange(year, month);

    const results = await customer.query(`
        SELECT
            metrics.cost_micros,
            metrics.impressions,
            metrics.clicks,
            metrics.average_cpc,
            metrics.average_cpm
        FROM customer
        WHERE segments.date BETWEEN '${startDate}' AND '${endDate}'
    `);

    if (!results || results.length === 0) {
        return { spend: 0, impressions: 0, clicks: 0, cpc: 0, cpm: 0 };
    }

    const metrics = results[0].metrics ?? {};

    return {
        spend: Number(metrics.cost_micros ?? 0) / 1_000_000 || 0,
        impressions: Number(metrics.impressions ?? 0) || 0,
        clicks: Number(metrics.clicks ?? 0) || 0,
        cpc: Number(metrics.average_cpc ?? 0) / 1_000_000 || 0,
        cpm: Number(metrics.average_cpm ?? 0) / 1_000_000 || 0,
    };
}

/**
 * Fetches daily metrics for the given month.
 * Adding segments.date to SELECT automatically groups by date.
 */
export async function fetchGoogleAdsDailyInsights(
    year: number,
    month: number
): Promise<GoogleAdsDailyRow[]> {
    const customer = getCustomer();
    const { startDate, endDate } = buildDateRange(year, month);

    const results = await customer.query(`
        SELECT
            segments.date,
            metrics.cost_micros,
            metrics.impressions,
            metrics.clicks
        FROM customer
        WHERE segments.date BETWEEN '${startDate}' AND '${endDate}'
    `);

    if (!results || results.length === 0) return [];

    return results.map((row) => ({
        date: String(row.segments?.date ?? ""),
        spend: Number(row.metrics?.cost_micros ?? 0) / 1_000_000 || 0,
        impressions: Number(row.metrics?.impressions ?? 0) || 0,
        clicks: Number(row.metrics?.clicks ?? 0) || 0,
    }));
}

/**
 * Fetches per-campaign metrics for the given month.
 */
export async function fetchGoogleAdsCampaignInsights(
    year: number,
    month: number
): Promise<GoogleAdsCampaignRow[]> {
    const customer = getCustomer();
    const { startDate, endDate } = buildDateRange(year, month);

    const results = await customer.query(`
        SELECT
            campaign.id,
            campaign.name,
            metrics.cost_micros,
            metrics.impressions,
            metrics.clicks
        FROM campaign
        WHERE segments.date BETWEEN '${startDate}' AND '${endDate}'
    `);

    if (!results || results.length === 0) return [];

    return results.map((row) => ({
        campaign_id: String(row.campaign?.id ?? ""),
        campaign_name: String(row.campaign?.name ?? ""),
        spend: Number(row.metrics?.cost_micros ?? 0) / 1_000_000 || 0,
        impressions: Number(row.metrics?.impressions ?? 0) || 0,
        clicks: Number(row.metrics?.clicks ?? 0) || 0,
    }));
}
