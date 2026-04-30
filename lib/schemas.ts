import { z } from "zod";

// ─── ActiveCampaign Deal Schema ────────────────────────────────────────────────
export const DealSchema = z.object({
    id: z.string(),
    cdate: z.string(),
    mdate: z.string().optional(),
    status: z.string(),
    stage: z.string(),
    group_id: z.string().optional().nullable(),
    stage_id: z.string().optional().nullable(),
    owner_id: z.string().optional().nullable(),
    data_fechamento: z.string().optional().nullable(),
    destino: z.string().optional().nullable(),
    data_reuniao_1: z.string().optional().nullable(),
    como_foi_feita_a_1a_reuniao: z.string().optional().nullable(),
    data_horario_agendamento_closer: z.string().optional().nullable(),
    _cf: z.record(z.string(), z.string()).optional().default({}),
});

export type Deal = z.infer<typeof DealSchema>;

// ─── Custom Field Entry Schema ─────────────────────────────────────────────────
export const CfEntrySchema = z.object({
    dealId: z.string(),
    customFieldId: z.string(),
    fieldValue: z.string(),
});

export type CfEntry = z.infer<typeof CfEntrySchema>;

// ─── Deal Stage Schema ─────────────────────────────────────────────────────────
export const DealStageSchema = z.object({
    id: z.string(),
    title: z.string(),
});

export type DealStage = z.infer<typeof DealStageSchema>;

// ─── Custom Field Meta Schema ──────────────────────────────────────────────────
export const FieldMetaSchema = z.object({
    id: z.string(),
    fieldLabel: z.string(),
});

export type FieldMeta = z.infer<typeof FieldMetaSchema>;

// ─── AC Deals API Response Schema ─────────────────────────────────────────────
export const DealsResponseSchema = z.object({
    deals: z.array(DealSchema).optional().default([]),
    dealCustomFieldData: z.array(CfEntrySchema).optional().default([]),
    meta: z.object({ total: z.union([z.string(), z.number()]) }).optional(),
});

export type DealsResponse = z.infer<typeof DealsResponseSchema>;

// ─── AC Stages Response Schema ─────────────────────────────────────────────────
export const StagesResponseSchema = z.object({
    dealStages: z.array(DealStageSchema).optional().default([]),
});

// ─── AC Field Meta Response Schema ────────────────────────────────────────────
export const FieldMetaResponseSchema = z.object({
    dealCustomFieldMeta: z.array(FieldMetaSchema).optional().default([]),
});

// ─── Won Deal Schema (extends Deal with contract-analysis fields) ────────────
export const WonDealSchema = DealSchema.extend({
    // Contract / revenue fields
    valor_fechado_em_contrato: z.number().nullable().optional(),
    orcamento: z.number().nullable().optional(),
    num_convidados: z.number().nullable().optional(),
    cidade: z.string().nullable().optional(),
    pipeline: z.string().nullable().optional(),
    is_elopement: z.boolean().nullable().optional(),
    ww_fonte_do_lead: z.string().nullable().optional(),
    // SDR-gathered scoring fields
    status_do_relacionamento: z.string().nullable().optional(),
    costumam_viajar: z.boolean().nullable().optional(),
    motivo_destination_wedding: z.boolean().nullable().optional(),
    ja_foi_destination_wedding: z.boolean().nullable().optional(),
    ja_tem_destino_definido: z.boolean().nullable().optional(),
    previsao_data_casamento: z.string().nullable().optional(),
    previsao_contratar_assessoria: z.string().nullable().optional(),
    // Closer-gathered scoring fields
    tipo_reuniao_closer: z.string().nullable().optional(),
    fez_segunda_reuniao: z.boolean().nullable().optional(),
    apresentado_orcamento: z.boolean().nullable().optional(),
    // Funnel Metas fields
    data_qualificado: z.string().nullable().optional(),
    reuniao_closer: z.string().nullable().optional(),
    pipeline_id: z.number().nullable().optional(),
    title: z.string().nullable().optional(),
    // Funil Jornada fields
    qualificado_para_sql: z.string().nullable().optional(),
    motivos_qualificacao_sdr: z.string().nullable().optional(),
    motivo_desqualificacao_sdr: z.string().nullable().optional(),
    motivo_de_perda: z.string().nullable().optional(),
    ww_closer_motivo_de_perda: z.string().nullable().optional(),
    como_conheceu_a_ww: z.string().nullable().optional(),
    // WT taxa fields (Welcome Trips funnel)
    pagamento_de_taxa: z.string().nullable().optional(),
    pagou_a_taxa: z.string().nullable().optional(),
    sdr_wt_data_fechamento_taxa: z.string().nullable().optional(),
    // Common columns used by Board endpoint
    created_at: z.string().nullable().optional(),
    data_closer: z.string().nullable().optional(),
});

export type WonDeal = z.infer<typeof WonDealSchema>;

// ─── Monthly Target Schema ───────────────────────────────────────────────────
export const MonthlyTargetSchema = z.object({
    month: z.string(),
    pipeline_type: z.enum(["elopement", "wedding", "trips"]),
    leads: z.number(),
    mql: z.number(),
    agendamento: z.number(),
    reunioes: z.number(),
    qualificado: z.number(),
    closer_agendada: z.number(),
    closer_realizada: z.number(),
    vendas: z.number(),
    cpl: z.number(),
});

export type MonthlyTarget = z.infer<typeof MonthlyTargetSchema>;

// ─── Funnel Metrics Interface ────────────────────────────────────────────────
export interface FunnelMetrics {
    leads: number;
    mql: number;
    agendamento: number;
    reunioes: number;
    qualificado: number;
    closerAgendada: number;
    closerRealizada: number;
    vendas: number;
}

// ─── Status type ──────────────────────────────────────────────────────────────
export type Status = "green" | "orange" | "red";
