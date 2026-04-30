// Board endpoint — monthly_targets fetcher mapped to brand shape
// See: docs/board-api-briefing.md (v1.2) section 3.5 + 4.5

import { getSupabaseAdmin } from "./supabase-admin";
import { BRAND_TO_PIPELINE_TYPE } from "./constants";
import type { Brand, TargetsWW, TargetsWT } from "./types";

// Mapping `monthly_targets` columns → board KPI names, per brand.
// monthly_targets schema (from lib/schemas.ts):
//   leads, mql, agendamento, reunioes, qualificado, closer_agendada,
//   closer_realizada, vendas, cpl
//
// Board WW expects: leads_gerados, qualificados_sdr, reunioes_closer, contratos_vol
// Board WT expects: leads_gerados, qualificados, vendas

export async function fetchTargets(brand: Brand, monthYYYYMM: string): Promise<TargetsWW | TargetsWT> {
    const supabase = getSupabaseAdmin();
    const pipelineType = BRAND_TO_PIPELINE_TYPE[brand];
    const monthStr = `${monthYYYYMM}-01`;

    const { data, error } = await supabase
        .from("monthly_targets")
        .select("leads, mql, agendamento, reunioes, qualificado, closer_realizada, vendas")
        .eq("month", monthStr)
        .eq("pipeline_type", pipelineType)
        .maybeSingle();

    if (error) {
        throw new Error(`Failed to query monthly_targets: ${error.message}`);
    }

    if (!data) {
        if (brand === "ww") {
            return { scope: "monthly", month: monthYYYYMM, missing: true };
        }
        return { scope: "monthly", month: monthYYYYMM, missing: true };
    }

    if (brand === "ww") {
        return {
            scope: "monthly",
            month: monthYYYYMM,
            leads_gerados: data.leads as number,
            qualificados_sdr: data.qualificado as number,
            reunioes_closer: data.closer_realizada as number,
            contratos_vol: data.vendas as number,
        };
    }

    // brand === "wt"
    return {
        scope: "monthly",
        month: monthYYYYMM,
        leads_gerados: data.leads as number,
        qualificados: data.qualificado as number,
        vendas: data.vendas as number,
    };
}
