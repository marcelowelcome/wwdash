import { supabase } from "./supabase";
import { type WonDeal, type MonthlyTarget } from "./schemas";

// ─── CONFIG ────────────────────────────────────────────────────────────────────
export const SDR_GROUP_ID = "1";
export const CLOSER_GROUP_ID = "3";

// Global period filter — controls the data window for all deal fetches
export type GlobalPeriod = 30 | 90 | 180 | 365 | 0;
export const DEFAULT_GLOBAL_PERIOD: GlobalPeriod = 180;
export const PERIOD_OPTIONS: { value: GlobalPeriod; label: string }[] = [
    { value: 30, label: "30 dias" },
    { value: 90, label: "90 dias" },
    { value: 180, label: "180 dias" },
    { value: 365, label: "1 ano" },
    { value: 0, label: "Tudo" },
];
export function periodToDaysBack(period: GlobalPeriod): number {
    return period === 0 ? 3650 : period;
}
export const TRAINING_MOTIVE = "Para closer ter mais reuniões";

// Fallback: map group_id → pipeline name for deals missing group_id
const GROUP_TO_PIPELINE: Record<string, string> = {
    "1": "SDR Weddings",
    "3": "Closer Weddings",
};

// Internal IDs for field mapping (since we don't have AC field IDs)
const FQ_ID = "custom_field_qual";
const FL_ID = "custom_field_loss";
const FD_ID = "custom_field_sdr_loss";
const F_SOURCE_ID = "custom_field_source";
const F_SQL_ID = "custom_field_sql";
const F_TAX_SENT_ID = "custom_field_tax_sent";
const F_TAX_PAID_ID = "custom_field_tax_paid";

// Status mapping: CRM text → internal code (module-level, not recreated per row)
const STATUS_MAP: Record<string, string> = {
    "Won": "0",
    "Open": "1",
    "Lost": "2",
};

// Columns used by the row→WonDeal mapping (avoids SELECT *)
const DEAL_COLUMNS = [
    "id", "created_at", "updated_at", "status", "stage", "group_id", "stage_id", "owner_id",
    "ww_closer_data_hora_ganho", "data_fechamento", "destino", "data_reuniao_1", "como_reuniao_1",
    "data_closer", "valor_fechado_em_contrato", "orcamento", "num_convidados", "cidade", "pipeline",
    "is_elopement", "ww_fonte_do_lead", "status_do_relacionamento", "costumam_viajar",
    "motivo_da_escolha_de_um_destination_wedding", "j_foi_em_algum_destination_wedding",
    "j_tem_destino_definido", "previs_o_data_de_casamento", "previs_o_contratar_assessoria",
    "ww_como_foi_feita_reuni_o_closer", "tipo_da_reuni_o_com_a_closer", "ww_fez_segunda_reuni_o",
    "ww_foi_apresentado_detalhamento_de_or_amento", "data_qualificado", "reuniao_closer",
    "pipeline_id", "title", "motivos_qualificacao_sdr", "ww_closer_motivo_de_perda", "motivo_de_perda",
    "motivo_desqualifica_o_sdr", "qualificado_sql", "wt_enviado_pagamento_de_taxa",
    "pagamento_de_taxa", "pagou_a_taxa",
].join(",");

// Wedding Pipeline IDs
const WW_PIPELINE_IDS = [1, 3, 4, 17, 31];
const ELOPEMENT_PIPELINE_ID = 12;

// ─── HELPERS ───────────────────────────────────────────────────────────────────

function mapMeetingType(val: any): string | null {
    if (!val) return null;
    if (Array.isArray(val)) return val[0] || null;
    return String(val);
}

function mapSql(val: any): string {
    if (val === true) return "Sim";
    if (val === false) return "Não";
    return String(val || "");
}

/**
 * Single source of truth: maps a Supabase row to a WonDeal object.
 * @param row Raw row from Supabase
 * @param groupIdFallback Fallback group_id when row.group_id is missing
 * @param includeCf Whether to populate _cf with custom fields (false for funnel-only queries)
 */
function mapRowToWonDeal(row: any, groupIdFallback?: string, includeCf = false): WonDeal {
    return {
        id: String(row.id),
        cdate: row.created_at,
        mdate: row.updated_at || undefined,
        status: STATUS_MAP[row.status] || "1",
        stage: row.stage || "Padrão",
        group_id: row.group_id || groupIdFallback,
        stage_id: row.stage_id,
        owner_id: row.owner_id,
        data_fechamento: row.ww_closer_data_hora_ganho || row.data_fechamento,
        destino: row.destino || null,
        data_reuniao_1: row.data_reuniao_1 || null,
        como_foi_feita_a_1a_reuniao: mapMeetingType(row.como_reuniao_1),
        data_horario_agendamento_closer: row.data_closer || null,
        valor_fechado_em_contrato: row.valor_fechado_em_contrato ? parseFloat(row.valor_fechado_em_contrato) : null,
        orcamento: row.orcamento ? parseFloat(row.orcamento) : null,
        num_convidados: row.num_convidados ? parseInt(row.num_convidados, 10) : null,
        cidade: row.cidade || null,
        pipeline: row.pipeline || null,
        is_elopement: row.is_elopement ?? null,
        ww_fonte_do_lead: row.ww_fonte_do_lead || null,
        status_do_relacionamento: row.status_do_relacionamento || null,
        costumam_viajar: row.costumam_viajar ?? null,
        motivo_destination_wedding: row.motivo_da_escolha_de_um_destination_wedding ?? null,
        ja_foi_destination_wedding: row.j_foi_em_algum_destination_wedding ?? null,
        ja_tem_destino_definido: row.j_tem_destino_definido ?? null,
        previsao_data_casamento: row.previs_o_data_de_casamento ? String(row.previs_o_data_de_casamento) : null,
        previsao_contratar_assessoria: row.previs_o_contratar_assessoria || null,
        tipo_reuniao_closer: row.ww_como_foi_feita_reuni_o_closer || row.tipo_da_reuni_o_com_a_closer || null,
        fez_segunda_reuniao: row.ww_fez_segunda_reuni_o ?? null,
        apresentado_orcamento: row.ww_foi_apresentado_detalhamento_de_or_amento ?? null,
        data_qualificado: row.data_qualificado || null,
        reuniao_closer: row.reuniao_closer || null,
        pipeline_id: row.pipeline_id != null ? Number(row.pipeline_id) : null,
        title: row.title || null,
        _cf: includeCf ? {
            [FQ_ID]: row.motivos_qualificacao_sdr || "",
            [FL_ID]: row.ww_closer_motivo_de_perda || row.motivo_de_perda || "",
            [FD_ID]: row.motivo_desqualifica_o_sdr || "",
            [F_SOURCE_ID]: row.ww_fonte_do_lead || "",
            [F_SQL_ID]: mapSql(row.qualificado_sql),
            [F_TAX_SENT_ID]: String(row.wt_enviado_pagamento_de_taxa || ""),
            [F_TAX_PAID_ID]: String(row.pagamento_de_taxa || row.pagou_a_taxa || ""),
        } : {},
    };
}

// ─── DEAL FETCHERS ─────────────────────────────────────────────────────────────

/**
 * Fetches deals from Supabase and transforms them into the Deal schema.
 * @param groupId The ID of the group (e.g., '1' for SDR Weddings, '3' for Closer Weddings)
 * @param daysBack How many days back to fetch data
 */
export async function fetchAllDealsFromDb(
    groupId: string,
    daysBack = 180
): Promise<WonDeal[]> {
    const after = new Date();
    after.setDate(after.getDate() - daysBack);
    const afterStr = after.toISOString();

    let allRows: any[] = [];
    let from = 0;
    const limit = 1000;
    const maxPages = 20; // Safety limit: max 20k deals per group

    // Build filter: match group_id OR pipeline name (fallback for deals missing group_id)
    const pipelineName = GROUP_TO_PIPELINE[groupId];
    const groupFilter = pipelineName
        ? `group_id.eq.${groupId},pipeline.eq.${pipelineName}`
        : `group_id.eq.${groupId}`;

    let pages = 0;
    while (pages < maxPages) {
        pages++;
        const { data, error } = await supabase
            .from("deals")
            .select(DEAL_COLUMNS)
            .or(groupFilter)
            .gte("created_at", afterStr)
            .order("created_at", { ascending: false })
            .range(from, from + limit - 1);

        if (error) {
            console.error(`[fetchAllDealsFromDb] Error fetching from group ${groupId}:`, error);
            throw new Error(`Falha ao buscar deals do grupo ${groupId}: ${error.message}`);
        }
        if (!data || data.length === 0) break;

        allRows = allRows.concat(data);
        if (data.length < limit) break;
        from += limit;
    }

    return allRows.map((row) => mapRowToWonDeal(row, groupId, true));
}

/**
 * Fetches all deals that have been won (data_fechamento is not null).
 * These represent the "Casamentos em planning" and past won deals.
 */
export async function fetchWonDealsFromDb(_groupId: string): Promise<WonDeal[]> {
    let allRows: any[] = [];
    let from = 0;
    const limit = 1000;
    const maxPages = 20;

    let pages = 0;
    while (pages < maxPages) {
        pages++;
        const { data, error } = await supabase
            .from("deals")
            .select(DEAL_COLUMNS)
            .or("data_fechamento.not.is.null,ww_closer_data_hora_ganho.not.is.null")
            .order("created_at", { ascending: false })
            .range(from, from + limit - 1);

        if (error) {
            console.error(`[fetchWonDealsFromDb] Error fetching won deals:`, error);
            throw new Error(`Falha ao buscar deals ganhos: ${error.message}`);
        }

        if (!data || data.length === 0) break;
        allRows = allRows.concat(data);
        if (data.length < limit) break;
        from += limit;
    }

    return allRows.map((row) => mapRowToWonDeal(row, undefined, true));
}

/**
 * Fetches monthly target for a specific month and pipeline type.
 */
export async function fetchMonthlyTarget(
    year: number,
    month: number,
    pipelineType: "wedding" | "elopement" | "trips" = "wedding"
): Promise<MonthlyTarget | null> {
    const monthStr = `${year}-${String(month).padStart(2, "0")}-01`;

    const { data, error } = await supabase
        .from("monthly_targets")
        .select("*")
        .eq("month", monthStr)
        .eq("pipeline_type", pipelineType)
        .maybeSingle();

    if (error) {
        console.error("[fetchMonthlyTarget] Error:", error);
        return null;
    }

    return data as MonthlyTarget | null;
}

export async function upsertMonthlyTarget(
    year: number,
    month: number,
    pipelineType: "wedding" | "elopement" | "trips",
    values: Partial<Omit<MonthlyTarget, "month" | "pipeline_type">>
): Promise<MonthlyTarget | null> {
    const monthStr = `${year}-${String(month).padStart(2, "0")}-01`;

    const { data, error } = await supabase
        .from("monthly_targets")
        .upsert(
            { month: monthStr, pipeline_type: pipelineType, ...values, updated_at: new Date().toISOString() },
            { onConflict: "month,pipeline_type" }
        )
        .select("*")
        .single();

    if (error) {
        console.error("[upsertMonthlyTarget] Error:", error);
        return null;
    }
    return data as MonthlyTarget;
}

/**
 * Fetches all deals for a specific month (by created_at).
 */
export async function fetchDealsForMonth(
    year: number,
    month: number
): Promise<WonDeal[]> {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);

    let allRows: any[] = [];
    let from = 0;
    const limit = 1000;

    while (true) {
        const { data, error } = await supabase
            .from("deals")
            .select(DEAL_COLUMNS)
            .gte("created_at", startDate.toISOString())
            .lte("created_at", endDate.toISOString())
            .order("created_at", { ascending: false })
            .range(from, from + limit - 1);

        if (error) {
            console.error("[fetchDealsForMonth] Error:", error);
            break;
        }
        if (!data || data.length === 0) break;

        allRows = allRows.concat(data);
        if (data.length < limit) break;
        from += limit;
    }

    return allRows.map((row) => mapRowToWonDeal(row));
}

/**
 * Provides a mock field map that aligns with our internal Deal transformation.
 */
export async function fetchFieldMetaFromDb(): Promise<Record<string, string>> {
    return {
        "Motivos de qualificação SDR": FQ_ID,
        "Motivo de qualificação SDR": FQ_ID,
        "[WW] [Closer] Motivo de Perda": FL_ID,
        "Motivo de Perda": FL_ID,
        "Motivo Desqualificação SDR": FD_ID,
        "SQL": F_SQL_ID,
        "Taxa Enviada": F_TAX_SENT_ID,
        "Taxa Paga": F_TAX_PAID_ID,
        "Fonte": F_SOURCE_ID,
    };
}

/**
 * Fetches unique stage titles from the deals table and builds
 * a mapping of stage → stage (identity map for Supabase data).
 */
export async function fetchStagesFromDb(): Promise<Record<string, string>> {
    const { data, error } = await supabase
        .from("deals")
        .select("stage")
        .eq("status", "Open")
        .not("stage", "is", null)
        .limit(500);

    if (error) {
        console.error("[fetchStagesFromDb] Error:", error);
        return {};
    }

    const map: Record<string, string> = {};
    (data || []).forEach((row) => {
        if (row.stage) {
            map[row.stage] = row.stage;
        }
    });
    return map;
}

// Re-export buildWeekLabel for use by computeMetrics
export function buildWeekLabel(key: string): string {
    const dt = new Date(key);
    const end = new Date(dt);
    end.setDate(dt.getDate() + 6);
    return `${dt.getDate()}/${dt.getMonth() + 1}–${end.getDate()}/${end.getMonth() + 1}`;
}

// ─── FUNNEL METAS QUERIES ──────────────────────────────────────────────────────

/**
 * Fetches Wedding deals for a specific month (by created_at).
 * Filters by pipeline_id IN (1, 3, 4, 17, 31) AND title NOT starts with 'EW'
 */
export async function fetchWeddingDealsForMonth(
    year: number,
    month: number
): Promise<WonDeal[]> {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);

    let allRows: any[] = [];
    let from = 0;
    const limit = 1000;

    while (true) {
        const { data, error } = await supabase
            .from("deals")
            .select(DEAL_COLUMNS)
            .gte("created_at", startDate.toISOString())
            .lte("created_at", endDate.toISOString())
            .in("pipeline_id", WW_PIPELINE_IDS)
            .not("title", "ilike", "EW%")
            .order("created_at", { ascending: false })
            .range(from, from + limit - 1);

        if (error) {
            console.error("[fetchWeddingDealsForMonth] Error:", error);
            break;
        }
        if (!data || data.length === 0) break;

        allRows = allRows.concat(data);
        if (data.length < limit) break;
        from += limit;
    }

    return allRows.map((row) => mapRowToWonDeal(row));
}

/**
 * Fetches deals with data_fechamento in the selected month.
 * These are vendas that may have been created in previous months.
 */
export async function fetchVendasForMonth(
    year: number,
    month: number
): Promise<{ count: number; deals: WonDeal[] }> {
    const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
    const endMonth = month === 12 ? 1 : month + 1;
    const endYear = month === 12 ? year + 1 : year;
    const endDate = `${endYear}-${String(endMonth).padStart(2, "0")}-01`;

    let allRows: any[] = [];
    let from = 0;
    const limit = 1000;

    while (true) {
        const { data, error } = await supabase
            .from("deals")
            .select(DEAL_COLUMNS)
            .gte("data_fechamento", startDate)
            .lt("data_fechamento", endDate)
            .not("pipeline_id", "eq", ELOPEMENT_PIPELINE_ID)
            .not("title", "ilike", "EW%")
            .order("data_fechamento", { ascending: false })
            .range(from, from + limit - 1);

        if (error) {
            console.error("[fetchVendasForMonth] Error:", error);
            break;
        }
        if (!data || data.length === 0) break;

        allRows = allRows.concat(data);
        if (data.length < limit) break;
        from += limit;
    }

    return {
        count: allRows.length,
        deals: allRows.map((row) => mapRowToWonDeal(row)),
    };
}

/**
 * Fetches deals with data_closer in the selected month.
 * These are closer meetings that may have been created in previous months.
 */
export async function fetchClosersForMonth(
    year: number,
    month: number
): Promise<{ count: number; deals: WonDeal[] }> {
    const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
    const endMonth = month === 12 ? 1 : month + 1;
    const endYear = month === 12 ? year + 1 : year;
    const endDate = `${endYear}-${String(endMonth).padStart(2, "0")}-01`;

    let allRows: any[] = [];
    let from = 0;
    const limit = 1000;

    while (true) {
        const { data, error } = await supabase
            .from("deals")
            .select(DEAL_COLUMNS)
            .gte("data_closer", startDate)
            .lt("data_closer", endDate)
            .not("pipeline_id", "eq", ELOPEMENT_PIPELINE_ID)
            .not("title", "ilike", "EW%")
            .order("data_closer", { ascending: false })
            .range(from, from + limit - 1);

        if (error) {
            console.error("[fetchClosersForMonth] Error:", error);
            break;
        }
        if (!data || data.length === 0) break;

        allRows = allRows.concat(data);
        if (data.length < limit) break;
        from += limit;
    }

    return {
        count: allRows.length,
        deals: allRows.map((row) => mapRowToWonDeal(row)),
    };
}

/**
 * Fetches Elopement deals for a specific month (by created_at).
 * Pipeline "Elopment Wedding" OR title starts with 'EW' - for Leads count only.
 */
export async function fetchElopementDealsForMonth(
    year: number,
    month: number
): Promise<WonDeal[]> {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);

    let allRows: any[] = [];
    let from = 0;
    const limit = 1000;

    // Query by pipeline name "Elopment Wedding" (note: typo in original data)
    while (true) {
        const { data, error } = await supabase
            .from("deals")
            .select(DEAL_COLUMNS)
            .gte("created_at", startDate.toISOString())
            .lte("created_at", endDate.toISOString())
            .eq("pipeline", "Elopment Wedding")
            .order("created_at", { ascending: false })
            .range(from, from + limit - 1);

        if (error) {
            console.error("[fetchElopementDealsForMonth] Error:", error);
            break;
        }
        if (!data || data.length === 0) break;

        allRows = allRows.concat(data);
        if (data.length < limit) break;
        from += limit;
    }

    return allRows.map((row) => mapRowToWonDeal(row));
}

/**
 * Fetches all deals needed for funnel calculation in a specific month.
 * Combines created_at, data_fechamento, data_closer, and Elopement queries (deduplicated).
 */
export async function fetchAllFunnelDealsForMonth(
    year: number,
    month: number
): Promise<WonDeal[]> {
    const [createdDeals, vendasData, closersData, elopementDeals] = await Promise.all([
        fetchWeddingDealsForMonth(year, month),
        fetchVendasForMonth(year, month),
        fetchClosersForMonth(year, month),
        fetchElopementDealsForMonth(year, month),
    ]);

    // Single-pass dedup (createdDeals take priority)
    const seen = new Set<string>();
    const result: WonDeal[] = [];
    for (const deal of [...createdDeals, ...vendasData.deals, ...closersData.deals, ...elopementDeals]) {
        if (!seen.has(deal.id)) {
            seen.add(deal.id);
            result.push(deal);
        }
    }
    return result;
}

// ─── ADS SPEND ─────────────────────────────────────────────────────────────────

export interface AdsSpendData {
    spend: number;
    impressions: number;
    clicks: number;
    cpc: number;
    cpm: number;
}

/**
 * Fetches ads spend data for a given source (meta_ads or google_ads).
 * Single query using .or() for pipeline="wedding" OR pipeline IS NULL.
 */
async function fetchAdsSpendBySource(
    year: number,
    month: number,
    source: "meta_ads" | "google_ads"
): Promise<AdsSpendData> {
    try {
        const { data, error } = await supabase
            .from("ads_spend_cache")
            .select("spend, impressions, clicks, cpc, cpm, pipeline")
            .eq("year", year)
            .eq("month", month)
            .eq("source", source)
            .or("pipeline.eq.wedding,pipeline.is.null")
            .order("pipeline", { ascending: false, nullsFirst: false })
            .limit(1)
            .maybeSingle();

        if (error || !data) {
            return { spend: 0, impressions: 0, clicks: 0, cpc: 0, cpm: 0 };
        }

        return {
            spend: Number(data.spend) || 0,
            impressions: data.impressions || 0,
            clicks: data.clicks || 0,
            cpc: Number(data.cpc) || 0,
            cpm: Number(data.cpm) || 0,
        };
    } catch (error) {
        console.error(`[fetchAdsSpend/${source}] Error:`, error);
        return { spend: 0, impressions: 0, clicks: 0, cpc: 0, cpm: 0 };
    }
}

/**
 * Fetches Meta Ads spend data from cache.
 */
export async function fetchMetaAdsSpend(year: number, month: number): Promise<AdsSpendData> {
    return fetchAdsSpendBySource(year, month, "meta_ads");
}

/**
 * Fetches Google Ads spend data from cache.
 */
export async function fetchGoogleAdsSpend(year: number, month: number): Promise<AdsSpendData> {
    return fetchAdsSpendBySource(year, month, "google_ads");
}

/**
 * Fetches combined Ads spend (Meta + Google) from cache.
 */
export async function fetchAllAdsSpend(
    year: number,
    month: number
): Promise<{ meta: AdsSpendData; google: AdsSpendData; total: AdsSpendData }> {
    const [meta, google] = await Promise.all([
        fetchMetaAdsSpend(year, month),
        fetchGoogleAdsSpend(year, month),
    ]);

    return {
        meta,
        google,
        total: {
            spend: meta.spend + google.spend,
            impressions: meta.impressions + google.impressions,
            clicks: meta.clicks + google.clicks,
            cpc: (meta.clicks + google.clicks) > 0
                ? (meta.spend + google.spend) / (meta.clicks + google.clicks)
                : 0,
            cpm: (meta.impressions + google.impressions) > 0
                ? ((meta.spend + google.spend) / (meta.impressions + google.impressions)) * 1000
                : 0,
        },
    };
}
