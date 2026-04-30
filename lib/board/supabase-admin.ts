// Board endpoint — service-role Supabase client
// Used to bypass RLS for board reads/writes (audit log, etc.).
// The board has its own auth (BOARD_API_KEY) so we don't rely on row-level security.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
    if (cached) return cached;

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !serviceKey) {
        throw new Error(
            "Supabase admin client not configured: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing"
        );
    }

    cached = createClient(url, serviceKey, {
        auth: { persistSession: false, autoRefreshToken: false },
    });
    return cached;
}
