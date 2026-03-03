import { type Deal, type DealsResponse } from "./schemas";

/**
 * Fetches all deals from a specific pipeline in ActiveCampaign via the internal proxy.
 * Implements pagination with the mandatory 'offset' loop.
 */
export async function fetchDealsFromAC(pipelineId: string): Promise<Deal[]> {
    let allDeals: any[] = [];
    let offset = 0;
    let total = Infinity;

    while (offset < total) {
        const res = await fetch(`/api/ac?url=/api/1/deals&pipeline_id=${pipelineId}&limit=100&offset=${offset}`);
        const data: any = await res.json();

        if (!data.deals || data.deals.length === 0) break;

        allDeals = [...allDeals, ...data.deals];
        total = parseInt(data.meta?.total || "0");
        offset += 100;

        // Safety break
        if (allDeals.length >= total) break;
    }

    // Transform to our internal Deal schema
    return allDeals.map(d => ({
        id: String(d.id),
        cdate: d.cdate,
        mdate: d.mdate,
        status: String(d.status),
        stage: String(d.stage),
        group_id: String(d.pipeline), // AC calls it pipeline
        stage_id: String(d.stage),
        owner_id: String(d.owner),
        // Custom fields are typically in fieldValues or we fetch separately.
        // For the SDR tab, the requirement mentions they are in deal.fields or deal.fieldValues.
        // We'll normalize them into our _cf record.
        _cf: normalizeCustomFields(d)
    }));
}

function normalizeCustomFields(deal: any): Record<string, string> {
    const cf: Record<string, string> = {};

    // Attempt to normalize from fieldValues if present
    if (deal.fieldValues && Array.isArray(deal.fieldValues)) {
        deal.fieldValues.forEach((f: any) => {
            cf[f.field] = f.value;
        });
    }

    return cf;
}

/**
 * Fetches custom field metadata from AC.
 */
export async function fetchFieldMetaFromAC(): Promise<Record<string, string>> {
    const res = await fetch("/api/ac?url=/api/3/dealCustomFieldMeta?limit=100");
    const data = await res.json();
    const map: Record<string, string> = {};
    (data.dealCustomFieldMeta || []).forEach((f: any) => {
        map[f.fieldLabel] = f.id;
    });
    return map;
}
