// Board endpoint — types
// See: docs/board-api-briefing.md (v1.2) section 3 + 11

export type Brand = "ww" | "wt";
export type PipelineType = "wedding" | "elopement" | "trips";

// Subset of `deals` columns the Board needs.
// Kept narrow on purpose to make queries cheap and tests easy.
export interface BoardDeal {
    id: string;
    created_at: string | null;
    data_qualificado: string | null;
    data_closer: string | null;
    data_fechamento: string | null;
    reuniao_closer: string | null;
    pipeline: string | null;
    is_elopement: boolean | null;
    title: string | null;
    // WT-specific
    pagamento_de_taxa: string | null;
    pagou_a_taxa: string | null;
    sdr_wt_data_fechamento_taxa: string | null;
}

export interface PeriodMeta {
    start: string; // YYYY-MM-DD (BRT calendar day)
    end: string;
    is_partial: boolean;
}

export interface DataFreshness {
    ac_last_sync: string | null; // ISO UTC `Z`
    stale: boolean;
    syncs_in_period: number;
}

export interface BoardMeta {
    version: "v1";
    kpi_definitions_hash: string;
    generated_at: string; // ISO UTC `Z`
    period: PeriodMeta;
    brand: Brand;
    data_freshness: DataFreshness;
    kpi_caveats: string[];
}

// ─── WW shapes ──────────────────────────────────────────────────────────────
export interface FunnelWW {
    leads_gerados: number;
    qualificados_sdr: number;
    reunioes_closer: number;
    contratos_vol: number;
    conversao_sdr_closer_pct: number | null;
    is_complete: boolean;
}

export interface RollingWW {
    contratos_vol: number;
    qualificados_sdr: number;
    is_complete: boolean;
}

export interface TargetsWW {
    scope: "monthly";
    month: string; // YYYY-MM
    leads_gerados?: number;
    qualificados_sdr?: number;
    reunioes_closer?: number;
    contratos_vol?: number;
    missing?: true;
}

// ─── WT shapes ──────────────────────────────────────────────────────────────
export interface FunnelWT {
    leads_gerados: number;
    qualificados: number;
    vendas: number;
    is_complete: boolean;
}

export interface RollingWT {
    vendas: number;
    qualificados: number;
    is_complete: boolean;
}

export interface TargetsWT {
    scope: "monthly";
    month: string;
    leads_gerados?: number;
    qualificados?: number;
    vendas?: number;
    missing?: true;
}

// ─── Discriminated union ─────────────────────────────────────────────────────
export type BoardResponse =
    | {
          meta: BoardMeta & { brand: "ww" };
          funnel: {
              weekly: FunnelWW;
              mtd: FunnelWW;
              rolling_30d: RollingWW;
              previous_4w_avg: FunnelWW | NullFunnelWW;
          };
          targets: TargetsWW;
      }
    | {
          meta: BoardMeta & { brand: "wt" };
          funnel: {
              weekly: FunnelWT;
              mtd: FunnelWT;
              rolling_30d: RollingWT;
              previous_4w_avg: FunnelWT | NullFunnelWT;
          };
          targets: TargetsWT;
      };

// `previous_4w_avg` may have all-null fields when 4 weeks were excluded.
export interface NullFunnelWW {
    leads_gerados: null;
    qualificados_sdr: null;
    reunioes_closer: null;
    contratos_vol: null;
    conversao_sdr_closer_pct: null;
    is_complete: true;
}
export interface NullFunnelWT {
    leads_gerados: null;
    qualificados: null;
    vendas: null;
    is_complete: true;
}

// ─── Errors ─────────────────────────────────────────────────────────────────
export type ErrorCode =
    | "MISSING_PARAM"
    | "INVALID_DATE"
    | "INVALID_RANGE"
    | "UNAUTHORIZED"
    | "INVALID_BRAND"
    | "RANGE_TOO_OLD"
    | "RATE_LIMIT"
    | "DATA_STALE"
    | "NO_SYNC_IN_PERIOD"
    | "INTERNAL";

export interface ErrorBody {
    error: { code: ErrorCode; message: string };
}

// ─── Period range (UTC Date objects) ────────────────────────────────────────
export interface UtcRange {
    startUtc: Date;
    endUtc: Date;
}
