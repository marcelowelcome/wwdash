import { GoogleAdsApi } from "google-ads-api";

export interface GoogleAdsData {
    spend: number;
    impressions: number;
    clicks: number;
    cpc: number;
    cpm: number;
}

/**
 * Fetches Google Ads insights via the google-ads-api package (gRPC).
 * Returns aggregated metrics for the given month.
 */
export async function fetchGoogleAdsInsights(
    year: number,
    month: number
): Promise<GoogleAdsData> {
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

    const customer = client.Customer({
        customer_id: customerId,
        login_customer_id: loginCustomerId,
        refresh_token: refreshToken,
    });

    const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const endDate = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

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

    // Google Ads returns cost values in micros (1/1,000,000 of the currency)
    return {
        spend: Number(metrics.cost_micros ?? 0) / 1_000_000 || 0,
        impressions: Number(metrics.impressions ?? 0) || 0,
        clicks: Number(metrics.clicks ?? 0) || 0,
        cpc: Number(metrics.average_cpc ?? 0) / 1_000_000 || 0,
        cpm: Number(metrics.average_cpm ?? 0) / 1_000_000 || 0,
    };
}
