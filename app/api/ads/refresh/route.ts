import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const GOOGLE_ADS_API_VERSION = "v20";

interface GoogleAdsResponse {
    results?: Array<{
        metrics: {
            costMicros: string;
            impressions: string;
            clicks: string;
        };
    }>;
    error?: { message: string; code?: number };
}

interface TokenResponse {
    access_token: string;
    error?: string;
}

async function getGoogleAccessToken(): Promise<string | null> {
    const clientId = process.env.GOOGLE_ADS_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET;
    const refreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN;

    if (!clientId || !clientSecret || !refreshToken) {
        console.log("[Google Ads] Missing OAuth credentials");
        return null;
    }

    const response = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            refresh_token: refreshToken,
            grant_type: "refresh_token",
        }),
    });

    const data: TokenResponse = await response.json();
    if (data.error) {
        console.error("[Google Ads] Token error:", data.error);
        return null;
    }
    return data.access_token;
}

async function fetchGoogleAdsData(year: number, month: number) {
    const customerId = process.env.GOOGLE_ADS_CUSTOMER_ID;
    const loginCustomerId = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID;
    const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;

    if (!customerId || !developerToken) {
        console.log("[Google Ads] Missing customerId or developerToken");
        return { spend: 0, impressions: 0, clicks: 0, cpc: 0, cpm: 0 };
    }

    const accessToken = await getGoogleAccessToken();
    if (!accessToken) {
        return { spend: 0, impressions: 0, clicks: 0, cpc: 0, cpm: 0 };
    }

    const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const endDate = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

    const query = `
        SELECT metrics.cost_micros, metrics.impressions, metrics.clicks
        FROM customer
        WHERE segments.date BETWEEN '${startDate}' AND '${endDate}'
    `;

    const headers: Record<string, string> = {
        Authorization: `Bearer ${accessToken}`,
        "developer-token": developerToken,
        "Content-Type": "application/json",
    };

    if (loginCustomerId) {
        headers["login-customer-id"] = loginCustomerId;
    }

    try {
        const response = await fetch(
            `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers/${customerId}/googleAds:search`,
            { method: "POST", headers, body: JSON.stringify({ query }) }
        );

        const data: GoogleAdsResponse = await response.json();

        if (data.error || !data.results) {
            console.error("[Google Ads] API error:", data.error);
            return { spend: 0, impressions: 0, clicks: 0, cpc: 0, cpm: 0 };
        }

        let totalCostMicros = 0;
        let totalImpressions = 0;
        let totalClicks = 0;

        for (const result of data.results) {
            totalCostMicros += parseInt(result.metrics.costMicros || "0");
            totalImpressions += parseInt(result.metrics.impressions || "0");
            totalClicks += parseInt(result.metrics.clicks || "0");
        }

        const spend = totalCostMicros / 1_000_000;

        return {
            spend,
            impressions: totalImpressions,
            clicks: totalClicks,
            cpc: totalClicks > 0 ? spend / totalClicks : 0,
            cpm: totalImpressions > 0 ? (spend / totalImpressions) * 1000 : 0,
        };
    } catch (error) {
        console.error("[Google Ads] Fetch error:", error);
        return { spend: 0, impressions: 0, clicks: 0, cpc: 0, cpm: 0 };
    }
}

export async function GET(request: NextRequest) {
    // Optional: verify cron secret
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
        // Allow without auth for manual testing
        console.log("[Ads Refresh] No auth header, proceeding anyway");
    }

    try {
        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        );

        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth() + 1;

        // Refresh current month and previous month
        const monthsToRefresh = [
            { year: currentYear, month: currentMonth },
            {
                year: currentMonth === 1 ? currentYear - 1 : currentYear,
                month: currentMonth === 1 ? 12 : currentMonth - 1,
            },
        ];

        const results: Array<{
            year: number;
            month: number;
            source: string;
            pipeline: string | null;
            success: boolean;
            data?: { spend: number; clicks: number; impressions: number };
        }> = [];

        for (const { year, month } of monthsToRefresh) {
            // Google Ads
            const googleAds = await fetchGoogleAdsData(year, month);
            const { error: googleError } = await supabase.from("ads_spend_cache").upsert(
                {
                    year,
                    month,
                    source: "google_ads",
                    pipeline: "wedding",
                    spend: googleAds.spend,
                    impressions: googleAds.impressions,
                    clicks: googleAds.clicks,
                    cpc: googleAds.cpc,
                    cpm: googleAds.cpm,
                    updated_at: new Date().toISOString(),
                },
                { onConflict: "year,month,source,pipeline" }
            );

            results.push({
                year,
                month,
                source: "google_ads",
                pipeline: "wedding",
                success: !googleError,
                data: { spend: googleAds.spend, clicks: googleAds.clicks, impressions: googleAds.impressions },
            });

            if (googleError) {
                console.error(`[Ads Refresh] Error saving Google Ads ${year}/${month}:`, googleError);
            }
        }

        return NextResponse.json({
            success: true,
            refreshedAt: new Date().toISOString(),
            results,
        });
    } catch (error) {
        console.error("[Ads Refresh] Error:", error);
        return NextResponse.json({ error: "Failed to refresh ads cache" }, { status: 500 });
    }
}

// POST also works for manual triggers
export { GET as POST };
