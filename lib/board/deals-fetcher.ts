// Board endpoint — narrow deals fetcher
// Selects only the columns the Board KPIs need; does NOT use mapRowToWonDeal
// (which fans out the full WonDeal shape with custom fields).
//
// For a weekly board (7 days) + 4-week lookback, the relevant date span is
// ~35 days. We over-fetch with `or(date_col_X in [start,end] OR ...)` so a
// single query feeds all 4 windows without multi-trip overhead.

import { getSupabaseAdmin } from "./supabase-admin";
import type { BoardDeal, Brand, UtcRange } from "./types";
import { LEADS_PIPELINES, TRIPS_PIPELINES } from "./constants";

const SELECTED_COLUMNS = [
    "id",
    "created_at",
    "data_qualificado",
    "data_closer",
    "data_fechamento",
    "reuniao_closer",
    "pipeline",
    "is_elopement",
    "title",
    "pagamento_de_taxa",
    "pagou_a_taxa",
    "sdr_wt_data_fechamento_taxa",
].join(", ");

interface RawRow {
    id: string | number;
    created_at: string | null;
    data_qualificado: string | null;
    data_closer: string | null;
    data_fechamento: string | null;
    reuniao_closer: string | null;
    pipeline: string | null;
    is_elopement: boolean | null;
    title: string | null;
    pagamento_de_taxa: string | null;
    pagou_a_taxa: string | null;
    sdr_wt_data_fechamento_taxa: string | null;
}

function rowToBoardDeal(r: RawRow): BoardDeal {
    return {
        id: String(r.id),
        created_at: r.created_at,
        data_qualificado: r.data_qualificado,
        data_closer: r.data_closer,
        data_fechamento: r.data_fechamento,
        reuniao_closer: r.reuniao_closer,
        pipeline: r.pipeline,
        is_elopement: r.is_elopement,
        title: r.title,
        pagamento_de_taxa: r.pagamento_de_taxa,
        pagou_a_taxa: r.pagou_a_taxa,
        sdr_wt_data_fechamento_taxa: r.sdr_wt_data_fechamento_taxa,
    };
}

// Fetch deals whose ANY relevant date column falls within [span.startUtc, span.endUtc].
// Filter further by brand pipelines.
export async function fetchBoardDeals(brand: Brand, span: UtcRange): Promise<BoardDeal[]> {
    const supabase = getSupabaseAdmin();
    const pipelines = brand === "ww" ? LEADS_PIPELINES : TRIPS_PIPELINES;

    const start = span.startUtc.toISOString();
    const end = span.endUtc.toISOString();

    // Build OR clause across the 5 event date columns.
    // PostgREST `or()` syntax: `or=(and(a.gte.X,a.lte.Y),and(b.gte.X,b.lte.Y),...)`
    const dateCols =
        brand === "ww"
            ? ["created_at", "data_qualificado", "data_closer", "data_fechamento"]
            : ["created_at", "sdr_wt_data_fechamento_taxa"];

    const orClause = dateCols
        .map((c) => `and(${c}.gte.${start},${c}.lte.${end})`)
        .join(",");

    const PAGE = 1000;
    let from = 0;
    const all: BoardDeal[] = [];

    for (;;) {
        const { data, error } = await supabase
            .from("deals")
            .select(SELECTED_COLUMNS)
            .in("pipeline", pipelines as unknown as string[])
            .or(orClause)
            .range(from, from + PAGE - 1);

        if (error) {
            throw new Error(`Failed to fetch board deals (${brand}): ${error.message}`);
        }

        const rows = (data ?? []) as unknown as RawRow[];
        all.push(...rows.map(rowToBoardDeal));

        if (rows.length < PAGE) break;
        from += PAGE;
        if (from > 50_000) {
            throw new Error("fetchBoardDeals exceeded 50k rows; investigate query span.");
        }
    }

    return all;
}
