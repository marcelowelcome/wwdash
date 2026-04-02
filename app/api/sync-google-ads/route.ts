import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
    fetchGoogleAdsInsights,
    fetchGoogleAdsDailyInsights,
    fetchGoogleAdsCampaignInsights,
} from "@/lib/google-ads-api";

export async function POST(request: NextRequest) {
    const supabaseAdmin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Auth check (same pattern as /api/sync)
    const syncSecret = process.env.SYNC_SECRET;
    if (syncSecret) {
        const authHeader = request.headers.get("authorization");
        const origin = request.headers.get("origin") || "";
        const isFromDashboard =
            origin.includes("localhost") ||
            origin.includes("vercel.app") ||
            origin.includes("welcomeweddings");

        if (authHeader !== `Bearer ${syncSecret}` && !isFromDashboard) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
    }

    try {
        const body = await request.json();
        const { year, month, pipeline = "wedding", type = "monthly" } = body;

        if (!year || !month) {
            return NextResponse.json(
                { error: "year and month are required" },
                { status: 400 }
            );
        }

        const now = new Date().toISOString();

        if (type === "daily") {
            const rows = await fetchGoogleAdsDailyInsights(year, month);
            if (rows.length > 0) {
                const { error } = await supabaseAdmin.from("ads_daily_cache").upsert(
                    rows.map((r) => ({
                        date: r.date,
                        source: "google_ads",
                        pipeline,
                        spend: r.spend,
                        impressions: r.impressions,
                        clicks: r.clicks,
                        updated_at: now,
                    })),
                    { onConflict: "date,source,pipeline" }
                );
                if (error) throw new Error(`Database error: ${error.message}`);
            }
            return NextResponse.json({ success: true, data: rows, period: { year, month, pipeline, type } });
        }

        if (type === "campaign") {
            const rows = await fetchGoogleAdsCampaignInsights(year, month);
            if (rows.length > 0) {
                const { error } = await supabaseAdmin.from("ads_campaign_cache").upsert(
                    rows.map((r) => ({
                        year,
                        month,
                        source: "google_ads",
                        pipeline,
                        campaign_id: r.campaign_id,
                        campaign_name: r.campaign_name,
                        spend: r.spend,
                        impressions: r.impressions,
                        clicks: r.clicks,
                        updated_at: now,
                    })),
                    { onConflict: "year,month,source,pipeline,campaign_id" }
                );
                if (error) throw new Error(`Database error: ${error.message}`);
            }
            return NextResponse.json({ success: true, data: rows, period: { year, month, pipeline, type } });
        }

        // Default: monthly
        const data = await fetchGoogleAdsInsights(year, month);
        const { error } = await supabaseAdmin.from("ads_spend_cache").upsert(
            {
                year,
                month,
                source: "google_ads",
                pipeline,
                spend: data.spend,
                impressions: data.impressions,
                clicks: data.clicks,
                cpc: data.cpc,
                cpm: data.cpm,
                updated_at: now,
            },
            { onConflict: "year,month,source,pipeline" }
        );
        if (error) throw new Error(`Database error: ${error.message}`);

        return NextResponse.json({ success: true, data, period: { year, month, pipeline, type } });
    } catch (error) {
        console.error("[sync-google-ads] Error:", error);
        return NextResponse.json(
            { error: "Sync failed", details: String(error) },
            { status: 500 }
        );
    }
}
