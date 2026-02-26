import { supabase } from "./supabase";
import { type Deal } from "./schemas";

// ─── CONFIG ────────────────────────────────────────────────────────────────────
export const SDR_GROUP_ID = "1";
export const CLOSER_GROUP_ID = "8";
export const TRAINING_MOTIVE = "Para closer ter mais reuniões";

// Internal IDs for field mapping (since we don't have AC field IDs)
const FQ_ID = "custom_field_qual";
const FL_ID = "custom_field_loss";

/**
 * Fetches deals from Supabase and transforms them into the Deal schema.
 * @param groupId The ID of the group (e.g., '1' for SDR Weddings, '8' for Closer Weddings)
 * @param daysBack How many days back to fetch data
 */
export async function fetchAllDealsFromDb(
    groupId: string,
    daysBack = 180
): Promise<Deal[]> {
    const after = new Date();
    after.setDate(after.getDate() - daysBack);
    const afterStr = after.toISOString();

    const { data, error } = await supabase
        .from("deals")
        .select("*")
        .eq("group_id", groupId)
        .gte("created_at", afterStr)
        .order("created_at", { ascending: false });

    if (error) {
        console.error(`[fetchAllDealsFromDb] Error fetching from group ${groupId}:`, error);
        return [];
    }

    return (data || []).map((row) => {
        // Map status: Won -> "0", Open -> "1", Lost -> "2"
        const statusMap: Record<string, string> = {
            "Won": "0",
            "Open": "1",
            "Lost": "2"
        };

        const deal: Deal = {
            id: String(row.id),
            cdate: row.created_at,
            mdate: row.updated_at || undefined,
            status: statusMap[row.status] || "1",
            stage: row.stage || "Padrão",
            group_id: row.group_id,
            stage_id: row.stage_id,
            owner_id: row.owner_id,
            data_fechamento: row.data_fechamento,
            _cf: {
                [FQ_ID]: row.motivos_qualificacao_sdr || "",
                [FL_ID]: row.motivo_perda || ""
            }
        };

        return deal;
    });
}

/**
 * Provides a mock field map that aligns with our internal Deal transformation.
 */
export async function fetchFieldMetaFromDb(): Promise<Record<string, string>> {
    return {
        "Motivos de qualificação SDR": FQ_ID,
        "Motivo de qualificação SDR": FQ_ID,
        "[WW] [Closer] Motivo de Perda": FL_ID,
        "Motivo de Perda": FL_ID
    };
}

/**
 * Provides a mock stage map. Since Supabase stores stage titles directly,
 * we can just map the title to itself.
 */
export async function fetchStagesFromDb(): Promise<Record<string, string>> {
    // We could potentially fetch all unique stages from the DB if needed,
    // but returning an empty map is also safe since computeMetrics
    // falls back to the ID (which in our case IS the title string from row.stage).
    return {};
}

// Re-export buildWeekLabel since Dashboard.tsx might use it or computeMetrics imports it from ac-api
export function buildWeekLabel(key: string): string {
    const dt = new Date(key);
    const end = new Date(dt);
    end.setDate(dt.getDate() + 6);
    return `${dt.getDate()}/${dt.getMonth() + 1}–${end.getDate()}/${end.getMonth() + 1}`;
}
