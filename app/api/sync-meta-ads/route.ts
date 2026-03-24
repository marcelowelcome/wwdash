import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { fetchMetaAdsInsights } from "@/lib/meta-ads-api";

const SYNC_SECRET = process.env.SYNC_SECRET;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Use service role for writes
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

export async function POST(request: NextRequest) {
    // Auth check (same pattern as /api/sync)
    if (SYNC_SECRET) {
        const authHeader = request.headers.get("authorization");
        const origin = request.headers.get("origin") || "";
        const isFromDashboard =
            origin.includes("localhost") ||
            origin.includes("vercel.app") ||
            origin.includes("welcomeweddings");

        if (authHeader !== `Bearer ${SYNC_SECRET}` && !isFromDashboard) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
    }

    try {
        const body = await request.json();
        const { year, month, pipeline = "wedding" } = body;

        if (!year || !month) {
            return NextResponse.json(
                { error: "year and month are required" },
                { status: 400 }
            );
        }

        // Fetch from Meta Ads API
        const data = await fetchMetaAdsInsights(year, month);

        // Upsert to cache
        const { error } = await supabaseAdmin.from("ads_spend_cache").upsert(
            {
                year,
                month,
                source: "meta_ads",
                pipeline,
                spend: data.spend,
                impressions: data.impressions,
                clicks: data.clicks,
                cpc: data.cpc,
                cpm: data.cpm,
                updated_at: new Date().toISOString(),
            },
            { onConflict: "year,month,source,pipeline" }
        );

        if (error) {
            throw new Error(`Database error: ${error.message}`);
        }

        return NextResponse.json({
            success: true,
            data,
            period: { year, month, pipeline },
        });
    } catch (error) {
        console.error("[sync-meta-ads] Error:", error);
        return NextResponse.json(
            { error: "Sync failed", details: String(error) },
            { status: 500 }
        );
    }
}
