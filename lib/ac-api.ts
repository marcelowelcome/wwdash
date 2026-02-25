import {
    DealsResponseSchema,
    FieldMetaResponseSchema,
    StagesResponseSchema,
    type Deal,
} from "./schemas";
import { weekKey } from "./utils";

// ─── CONFIG ────────────────────────────────────────────────────────────────────
export const SDR_GROUP = "1";
export const CLOSER_GROUP = "3";
export const TRAINING_MOTIVE = "Para closer ter mais reuniões";

// ─── API FETCH HELPER ──────────────────────────────────────────────────────────
/**
 * Fetches data from the /api/ac Next.js proxy route.
 * The proxy itself holds secrets server-side; the browser never sees them.
 */
async function apiFetch(path: string): Promise<unknown> {
    const [pathname, qs] = path.split("?");
    const params = new URLSearchParams(qs || "");
    const proxyParams = new URLSearchParams({ path: pathname });
    params.forEach((v, k) => proxyParams.append(k, v));
    const url = `/api/ac?${proxyParams.toString()}`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    return res.json();
}

// ─── FETCH ALL DEALS ───────────────────────────────────────────────────────────
/**
 * Paginates through the AC deals endpoint for a given group, going back daysBack days.
 * Attaches custom field data to each deal's `_cf` property.
 */
export async function fetchAllDeals(
    group: string,
    daysBack = 180
): Promise<Deal[]> {
    const after = new Date();
    after.setDate(after.getDate() - daysBack);
    const afterStr = after.toISOString().split("T")[0];

    const all: Deal[] = [];
    let offset = 0;
    let total = Infinity;

    while (all.length < total) {
        const raw = await apiFetch(
            `/deals?filters[group]=${group}&filters[created_after]=${afterStr}&limit=100&offset=${offset}&include=dealCustomFieldData`
        );

        const parsed = DealsResponseSchema.safeParse(raw);
        if (!parsed.success) {
            console.error("[fetchAllDeals] Validation error:", parsed.error.flatten());
            break;
        }

        const { deals, dealCustomFieldData, meta } = parsed.data;

        // Build custom-field map: dealId -> { fieldId -> value }
        const cfMap: Record<string, Record<string, string>> = {};
        dealCustomFieldData.forEach((cf) => {
            if (!cfMap[cf.dealId]) cfMap[cf.dealId] = {};
            cfMap[cf.dealId][cf.customFieldId] = cf.fieldValue;
        });

        deals.forEach((d) => {
            d._cf = cfMap[d.id] ?? {};
        });

        all.push(...deals);
        total = parseInt(String(meta?.total ?? all.length));
        if (deals.length < 100) break;
        offset += 100;
    }

    return all;
}

// ─── FETCH FIELD META ──────────────────────────────────────────────────────────
/**
 * Returns a map of { fieldLabel -> fieldId } from the AC custom field meta endpoint.
 */
export async function fetchFieldMeta(): Promise<Record<string, string>> {
    const raw = await apiFetch("/dealCustomFieldMeta?limit=100");
    const parsed = FieldMetaResponseSchema.safeParse(raw);

    if (!parsed.success) {
        console.error("[fetchFieldMeta] Validation error:", parsed.error.flatten());
        return {};
    }

    const map: Record<string, string> = {};
    parsed.data.dealCustomFieldMeta.forEach((f) => {
        map[f.fieldLabel] = f.id;
    });
    return map;
}

// ─── FETCH STAGES ──────────────────────────────────────────────────────────────
/**
 * Returns a map of { stageId -> stageTitle } from the AC deal stages endpoint.
 */
export async function fetchStages(): Promise<Record<string, string>> {
    const raw = await apiFetch("/dealStages?limit=100");
    const parsed = StagesResponseSchema.safeParse(raw);

    if (!parsed.success) {
        console.error("[fetchStages] Validation error:", parsed.error.flatten());
        return {};
    }

    const map: Record<string, string> = {};
    parsed.data.dealStages.forEach((s) => {
        map[s.id] = s.title;
    });
    return map;
}

// ─── WEEK LABEL HELPER ─────────────────────────────────────────────────────────
export function buildWeekLabel(key: string): string {
    const dt = new Date(key);
    const end = new Date(dt);
    end.setDate(dt.getDate() + 6);
    return `${dt.getDate()}/${dt.getMonth() + 1}–${end.getDate()}/${end.getMonth() + 1}`;
}

export { weekKey };
