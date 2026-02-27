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

// ─── Status type ──────────────────────────────────────────────────────────────
export type Status = "green" | "orange" | "red";
