import { describe, expect, it } from "vitest";
import { averageWtWeeks, computeFunnelWt, computeRollingWt } from "../funnel-wt";
import type { BoardDeal, FunnelWT } from "../types";
import { periodToUtcRange } from "../period";

const range = periodToUtcRange("2026-04-20", "2026-04-26");

function deal(overrides: Partial<BoardDeal>): BoardDeal {
    return {
        id: "1",
        created_at: null,
        data_qualificado: null,
        data_closer: null,
        data_fechamento: null,
        reuniao_closer: null,
        pipeline: "SDR - Trips",
        is_elopement: null,
        title: null,
        pagamento_de_taxa: null,
        pagou_a_taxa: null,
        sdr_wt_data_fechamento_taxa: null,
        ...overrides,
    };
}

describe("computeFunnelWt — pipeline filter", () => {
    it("excludes pipelines outside TRIPS_PIPELINES", () => {
        const deals: BoardDeal[] = [
            deal({ id: "1", pipeline: "SDR Weddings", created_at: "2026-04-22T15:00:00Z" }),
            deal({ id: "2", pipeline: "SDR - Trips", created_at: "2026-04-22T15:00:00Z" }),
            deal({ id: "3", pipeline: "Consultoras TRIPS", created_at: "2026-04-22T15:00:00Z" }),
            deal({ id: "4", pipeline: "WTN - Desqualificados", created_at: "2026-04-22T15:00:00Z" }),
        ];
        expect(computeFunnelWt({ deals, range, isComplete: true }).leads_gerados).toBe(3);
    });

    it("includes desqualificados in leads_gerados (decisão Marketing)", () => {
        const deals: BoardDeal[] = [
            deal({ id: "1", pipeline: "WTN - Desqualificados", created_at: "2026-04-22T15:00:00Z" }),
        ];
        expect(computeFunnelWt({ deals, range, isComplete: true }).leads_gerados).toBe(1);
    });
});

describe("computeFunnelWt — qualificados (SDR-Trips approximation)", () => {
    it("counts only deals in 'SDR - Trips' pipeline created in range", () => {
        const deals: BoardDeal[] = [
            deal({ id: "1", pipeline: "SDR - Trips", created_at: "2026-04-22T15:00:00Z" }),
            deal({ id: "2", pipeline: "Consultoras TRIPS", created_at: "2026-04-22T15:00:00Z" }),
            deal({ id: "3", pipeline: "WTN - Desqualificados", created_at: "2026-04-22T15:00:00Z" }),
        ];
        expect(computeFunnelWt({ deals, range, isComplete: true }).qualificados).toBe(1);
    });

    it("excludes SDR-Trips deal created outside range", () => {
        const deals: BoardDeal[] = [
            deal({ id: "1", pipeline: "SDR - Trips", created_at: "2026-04-19T15:00:00Z" }),
        ];
        expect(computeFunnelWt({ deals, range, isComplete: true }).qualificados).toBe(0);
    });
});

describe("computeFunnelWt — vendas", () => {
    it("counts when sdr_wt_data_fechamento_taxa is in range AND any taxa field is filled", () => {
        const deals: BoardDeal[] = [
            deal({
                id: "1",
                pipeline: "Consultoras TRIPS",
                sdr_wt_data_fechamento_taxa: "2026-04-22T15:00:00Z",
                pagou_a_taxa: "Sim",
            }),
            deal({
                id: "2",
                pipeline: "Consultoras TRIPS",
                sdr_wt_data_fechamento_taxa: "2026-04-22T15:00:00Z",
                pagamento_de_taxa: "Confirmado",
            }),
            deal({
                id: "3",
                pipeline: "Consultoras TRIPS",
                sdr_wt_data_fechamento_taxa: "2026-04-22T15:00:00Z",
                // taxa fields empty
            }),
            deal({
                id: "4",
                pipeline: "Consultoras TRIPS",
                sdr_wt_data_fechamento_taxa: null,
                pagou_a_taxa: "Sim",
            }),
        ];
        expect(computeFunnelWt({ deals, range, isComplete: true }).vendas).toBe(2);
    });

    it("treats whitespace-only taxa as empty", () => {
        const deals: BoardDeal[] = [
            deal({
                id: "1",
                pipeline: "Consultoras TRIPS",
                sdr_wt_data_fechamento_taxa: "2026-04-22T15:00:00Z",
                pagou_a_taxa: "   ",
                pagamento_de_taxa: "  ",
            }),
        ];
        expect(computeFunnelWt({ deals, range, isComplete: true }).vendas).toBe(0);
    });
});

describe("computeFunnelWt — boundary timestamps", () => {
    it("includes lead at startUtc exactly", () => {
        const deals: BoardDeal[] = [deal({ id: "1", created_at: "2026-04-20T03:00:00.000Z" })];
        expect(computeFunnelWt({ deals, range, isComplete: true }).leads_gerados).toBe(1);
    });
    it("excludes lead 1ms before startUtc", () => {
        const deals: BoardDeal[] = [deal({ id: "1", created_at: "2026-04-20T02:59:59.999Z" })];
        expect(computeFunnelWt({ deals, range, isComplete: true }).leads_gerados).toBe(0);
    });
});

describe("computeRollingWt", () => {
    it("returns subset", () => {
        const deals: BoardDeal[] = [
            deal({ id: "1", pipeline: "SDR - Trips", created_at: "2026-04-22T10:00Z" }),
            deal({
                id: "2",
                pipeline: "Consultoras TRIPS",
                sdr_wt_data_fechamento_taxa: "2026-04-23T10:00Z",
                pagou_a_taxa: "Sim",
            }),
        ];
        expect(computeRollingWt({ deals, range, isComplete: false })).toEqual({
            qualificados: 1,
            vendas: 1,
            is_complete: false,
        });
    });
});

describe("averageWtWeeks", () => {
    const wk = (o: Partial<FunnelWT>): FunnelWT => ({
        leads_gerados: 0,
        qualificados: 0,
        vendas: 0,
        is_complete: true,
        ...o,
    });

    it("nulls when all weeks are null", () => {
        const r = averageWtWeeks([null, null, null, null]);
        expect(r.leads_gerados).toBeNull();
        expect(r.qualificados).toBeNull();
        expect(r.vendas).toBeNull();
    });

    it("averages over valid", () => {
        const r = averageWtWeeks([
            wk({ leads_gerados: 100, qualificados: 30, vendas: 5 }),
            wk({ leads_gerados: 150, qualificados: 50, vendas: 7 }),
            null,
            wk({ leads_gerados: 110, qualificados: 32, vendas: 6 }),
        ]);
        expect(r.leads_gerados).toBe(120); // (100+150+110)/3
        expect(r.qualificados).toBe(37); // round(112/3) = 37
        expect(r.vendas).toBe(6); // round(18/3) = 6
    });
});
