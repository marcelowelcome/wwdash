import { NextRequest, NextResponse } from "next/server";

const AC_BASE = "https://welcometrips.api-us1.com/api/3";
// Allow requests from localhost in dev or the production domain.
// Set NEXT_PUBLIC_SITE_URL in production to your Vercel URL.
const ALLOWED_ORIGIN = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
const AC_KEY = process.env.AC_API_KEY ?? "";

export async function GET(req: NextRequest) {
    const { searchParams } = req.nextUrl;

    // Extract the `path` param (e.g. /deals) and forward the rest as-is
    const path = searchParams.get("path");
    if (!path) {
        return NextResponse.json({ error: "Missing `path` query param" }, { status: 400 });
    }

    // Re-build querystring WITHOUT the `path` param
    const forwarded = new URLSearchParams();
    searchParams.forEach((value, key) => {
        if (key !== "path") forwarded.append(key, value);
    });

    const qs = forwarded.toString();
    const upstream = `${AC_BASE}${path}${qs ? `?${qs}` : ""}`;

    try {
        const res = await fetch(upstream, {
            headers: {
                "Api-Token": AC_KEY,
                "Content-Type": "application/json",
            },
            // Respect Next.js fetch cache — disable for real-time data
            cache: "no-store",
        });

        const body = await res.json();

        return new NextResponse(JSON.stringify(body), {
            status: res.status,
            headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
            },
        });
    } catch (err) {
        console.error("[AC Proxy] upstream error:", err);
        return NextResponse.json(
            { error: "Upstream request failed", detail: String(err) },
            { status: 502 }
        );
    }
}

// Handle pre-flight CORS requests
export async function OPTIONS() {
    return new NextResponse(null, {
        status: 204,
        headers: {
            "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
            "Access-Control-Allow-Methods": "GET, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
        },
    });
}
