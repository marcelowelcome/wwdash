import { NextRequest, NextResponse } from "next/server";

const AC_BASE = "https://welcometrips.api-us1.com/api/3";
// Allow requests from localhost in dev or the production domain.
// Set NEXT_PUBLIC_SITE_URL in production to your Vercel URL.
const ALLOWED_ORIGIN = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
const AC_KEY = process.env.AC_API_KEY ?? "";

export async function GET(req: NextRequest) {
    const { searchParams } = req.nextUrl;

    // Extract the `path` or `url` param
    const path = searchParams.get("path");
    const urlParam = searchParams.get("url");

    if (!path && !urlParam) {
        return NextResponse.json({ error: "Missing `path` or `url` query param" }, { status: 400 });
    }

    // Determine the base URL and the target path
    let upstreamBase = AC_BASE;
    let targetPath = path || urlParam || "";

    // If urlParam starts with /api/1 or /api/3, we adjust the base
    if (targetPath.startsWith("/api/1")) {
        upstreamBase = "https://welcometrips.api-us1.com/api/1";
        targetPath = targetPath.replace("/api/1", "");
    } else if (targetPath.startsWith("/api/3")) {
        upstreamBase = "https://welcometrips.api-us1.com/api/3";
        targetPath = targetPath.replace("/api/3", "");
    }

    // Re-build querystring WITHOUT the internal params
    const forwarded = new URLSearchParams();
    searchParams.forEach((value, key) => {
        if (key !== "path" && key !== "url") forwarded.append(key, value);
    });

    const qs = forwarded.toString();
    const upstream = `${upstreamBase}${targetPath}${qs ? `?${qs}` : ""}`;

    try {
        const res = await fetch(upstream, {
            headers: {
                "Api-Token": AC_KEY,
                "Content-Type": "application/json",
            },
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
