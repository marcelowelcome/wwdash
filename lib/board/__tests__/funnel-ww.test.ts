import { describe, expect, it } from "vitest";
import { averageWwWeeks, computeFunnelWw, computeRollingWw } from "../funnel-ww";
import type { BoardDeal, FunnelWW } from "../types";
import { periodToUtcRange } from "../period";

const range = periodToUtcRange("2026-04-20", "2026-04-26");

function deal(overrides: Partial<BoardDeal>): BoardDeal {
    return {
        id: "1",
        created_at: null,
        data_qualificado: null,
        data_closer: null,
        data_fechamento: null,
        ww_como_foi_feita_reuni_o_closer: null,
        tipo_da_reuni_o_com_a_closer: null,
        pipeline: "SDR Weddings",
        is_elopement: false,
        title: "Cliente X",
        pagamento_de_taxa: null,
        pagou_a_taxa: null,
        sdr_wt_data_fechamento_taxa: null,
        ...overrides,
    };
}

describe("computeFunnelWw — Lead filter (briefing v1.3)", () => {
    it("inclui Elopment como Lead (aquisição bruta), exclui de MQL/Qualif/Reun", () => {
        // Decisão 06/05/2026: Elopment é linha de produto WW e conta como Lead
        // bruto, mas não infla MQL nem etapas pós-MQL.
        const deals: BoardDeal[] = [
            deal({ id: "1", pipeline: "Elopment Wedding", is_elopement: true, created_at: "2026-04-22T15:00:00.000Z", data_qualificado: "2026-04-23T15:00:00.000Z" }),
            deal({ id: "2", pipeline: "SDR Weddings", is_elopement: false, created_at: "2026-04-22T15:00:00.000Z", data_qualificado: "2026-04-23T15:00:00.000Z" }),
        ];
        const r = computeFunnelWw({ deals, range, isComplete: true });
        expect(r.leads_gerados).toBe(2); // Elopment + WW
        expect(r.qualificados_sdr).toBe(1); // só WW; Elopment não é MQL
    });

    it("inclui leads com prefixo 'EW' no título (decisão Marketing 06/05/2026)", () => {
        // Antes excluía via title NOT ILIKE 'EW%'. Agora bonafide podem usar esse prefixo.
        const deals: BoardDeal[] = [
            deal({ id: "1", title: "EW - Couple", pipeline: "SDR Weddings", created_at: "2026-04-22T15:00:00.000Z" }),
            deal({ id: "2", title: "DW - Couple", pipeline: "SDR Weddings", created_at: "2026-04-22T15:00:00.000Z" }),
        ];
        const r = computeFunnelWw({ deals, range, isComplete: true });
        expect(r.leads_gerados).toBe(2);
    });

    it("exclui pipelines fora de WW (Trips e outros)", () => {
        const deals: BoardDeal[] = [
            deal({ id: "1", pipeline: "SDR - Trips", created_at: "2026-04-22T15:00:00.000Z" }),
            deal({ id: "2", pipeline: "Closer Weddings", created_at: "2026-04-22T15:00:00.000Z" }),
        ];
        const r = computeFunnelWw({ deals, range, isComplete: true });
        expect(r.leads_gerados).toBe(1);
    });
});

describe("computeFunnelWw — KPI counters", () => {
    it("counts leads_gerados only by created_at in range", () => {
        const deals: BoardDeal[] = [
            deal({ id: "1", created_at: "2026-04-22T15:00:00.000Z" }), // in
            deal({ id: "2", created_at: "2026-04-19T15:00:00.000Z" }), // out (before)
            deal({ id: "3", created_at: "2026-04-27T15:00:00.000Z" }), // out (after)
        ];
        const r = computeFunnelWw({ deals, range, isComplete: true });
        expect(r.leads_gerados).toBe(1);
    });

    it("counts qualificados_sdr by data_qualificado", () => {
        const deals: BoardDeal[] = [
            deal({ id: "1", data_qualificado: "2026-04-22T10:00:00.000Z" }),
            deal({ id: "2", data_qualificado: "2026-04-19T10:00:00.000Z" }),
        ];
        expect(computeFunnelWw({ deals, range, isComplete: true }).qualificados_sdr).toBe(1);
    });

    it("counts reunioes_closer when AC live fields are filled (≠ 'Não teve reunião')", () => {
        const deals: BoardDeal[] = [
            // tipo_da_reuni_o_com_a_closer preenchido com "Online" → conta
            deal({ id: "1", data_closer: "2026-04-22T10:00:00.000Z", tipo_da_reuni_o_com_a_closer: "Online" }),
            // ww_como_foi_feita_reuni_o_closer preenchido → conta
            deal({ id: "2", data_closer: "2026-04-23T10:00:00.000Z", ww_como_foi_feita_reuni_o_closer: "Presencial" }),
            // ambos vazios → não conta
            deal({ id: "3", data_closer: "2026-04-24T10:00:00.000Z" }),
            // valor "Não teve reunião" → não conta
            deal({ id: "4", data_closer: "2026-04-25T10:00:00.000Z", ww_como_foi_feita_reuni_o_closer: "Não teve reunião" }),
            // só whitespace → não conta
            deal({ id: "5", data_closer: "2026-04-26T10:00:00.000Z", tipo_da_reuni_o_com_a_closer: "   " }),
            // ambos preenchidos: 1º válido → conta uma vez
            deal({ id: "6", data_closer: "2026-04-22T11:00:00.000Z", ww_como_foi_feita_reuni_o_closer: "Online", tipo_da_reuni_o_com_a_closer: "Presencial" }),
        ];
        expect(computeFunnelWw({ deals, range, isComplete: true }).reunioes_closer).toBe(3);
    });

    it("counts contratos_vol pela regra canônica (pipeline whitelist + sinal de funil)", () => {
        const deals: BoardDeal[] = [
            // OK — aquisição + sinal de funil
            deal({ id: "1", pipeline: "Closer Weddings", data_qualificado: "2026-04-20T10:00:00.000Z", data_fechamento: "2026-04-23T10:00:00.000Z" }),
            // Sem data_fechamento
            deal({ id: "2", pipeline: "Closer Weddings", data_qualificado: "2026-04-20T10:00:00.000Z", data_fechamento: null }),
            // SEM sinal de funil — rejeitado
            deal({ id: "3", pipeline: "Closer Weddings", data_fechamento: "2026-04-23T10:00:00.000Z" }),
        ];
        expect(computeFunnelWw({ deals, range, isComplete: true }).contratos_vol).toBe(1);
    });

    it("conta contratos em pipelines de pós-venda WW (Convidados, Gestão, Produção)", () => {
        // Fix de 2026-05-07: deals migram para pós-venda APÓS data_fechamento.
        // Antes (v1.2) eram perdidos pelo filtro só de LEADS_PIPELINES (5).
        const deals: BoardDeal[] = [
            deal({ id: "1", pipeline: "Convidados", data_qualificado: "2026-04-15T10:00:00.000Z", data_fechamento: "2026-04-23T10:00:00.000Z" }),
            deal({ id: "2", pipeline: "Convidados - Michelly", data_closer: "2026-04-18T10:00:00.000Z", data_fechamento: "2026-04-24T10:00:00.000Z" }),
            deal({ id: "3", pipeline: "Produção", data_qualificado: "2026-04-12T10:00:00.000Z", data_fechamento: "2026-04-25T10:00:00.000Z" }),
            deal({ id: "4", pipeline: "WW - Gestão Convidados", data_qualificado: "2026-04-14T10:00:00.000Z", data_fechamento: "2026-04-26T10:00:00.000Z" }),
            // Sem sinal de funil — rejeitado (deal criado direto sem origem no funil)
            deal({ id: "5", pipeline: "Convidados", data_fechamento: "2026-04-23T10:00:00.000Z" }),
            // Trips — fora da whitelist
            deal({ id: "6", pipeline: "Consultoras TRIPS", data_qualificado: "2026-04-15T10:00:00.000Z", data_fechamento: "2026-04-23T10:00:00.000Z" }),
        ];
        expect(computeFunnelWw({ deals, range, isComplete: true }).contratos_vol).toBe(4);
    });

    it("conta qualif/reun em pipelines de pós-venda WW (MQL histórico)", () => {
        // MQL "histórico": deal já migrou pra pós-venda mas teve qualif/reun no
        // período. Antes (v1.2) era perdido pelo filtro só de LEADS_PIPELINES.
        // Nota: o filtro `isWwMql` em pipelines pós-venda exige `hasFunnelSignal`,
        // mas para qualif/reun esse sinal é o próprio data_qualificado/data_closer,
        // então a condição é satisfeita automaticamente.
        const deals: BoardDeal[] = [
            deal({ id: "1", pipeline: "Convidados", data_qualificado: "2026-04-22T10:00:00.000Z" }),
            deal({ id: "2", pipeline: "Convidados - Michelly", data_closer: "2026-04-23T10:00:00.000Z", tipo_da_reuni_o_com_a_closer: "Online" }),
            // Pipeline pós-venda + Elopment é true → rejeitado (sempre exclui Elopment)
            deal({ id: "3", pipeline: "Convidados", is_elopement: true, data_qualificado: "2026-04-22T11:00:00.000Z" }),
            // Pipeline Trips — rejeitado
            deal({ id: "4", pipeline: "Consultoras TRIPS", data_qualificado: "2026-04-22T12:00:00.000Z" }),
        ];
        const r = computeFunnelWw({ deals, range, isComplete: true });
        expect(r.qualificados_sdr).toBe(1); // só id 1
        expect(r.reunioes_closer).toBe(1); // só id 2
    });
});

describe("computeFunnelWw — boundary timestamps", () => {
    // Range is 2026-04-20 03:00 UTC → 2026-04-27 02:59:59.999 UTC
    it("includes deal at startUtc exactly", () => {
        const deals: BoardDeal[] = [
            deal({ id: "1", created_at: "2026-04-20T03:00:00.000Z" }),
        ];
        expect(computeFunnelWw({ deals, range, isComplete: true }).leads_gerados).toBe(1);
    });

    it("includes deal at endUtc exactly", () => {
        const deals: BoardDeal[] = [
            deal({ id: "1", created_at: "2026-04-27T02:59:59.999Z" }),
        ];
        expect(computeFunnelWw({ deals, range, isComplete: true }).leads_gerados).toBe(1);
    });

    it("excludes deal 1ms before startUtc", () => {
        const deals: BoardDeal[] = [
            deal({ id: "1", created_at: "2026-04-20T02:59:59.999Z" }),
        ];
        expect(computeFunnelWw({ deals, range, isComplete: true }).leads_gerados).toBe(0);
    });

    it("excludes deal 1ms after endUtc", () => {
        const deals: BoardDeal[] = [
            deal({ id: "1", created_at: "2026-04-27T03:00:00.000Z" }),
        ];
        expect(computeFunnelWw({ deals, range, isComplete: true }).leads_gerados).toBe(0);
    });
});

describe("computeFunnelWw — conversao_sdr_closer_pct", () => {
    it("returns null when qualificados_sdr is 0", () => {
        const r = computeFunnelWw({ deals: [], range, isComplete: true });
        expect(r.qualificados_sdr).toBe(0);
        expect(r.conversao_sdr_closer_pct).toBeNull();
    });

    it("rounds to 1 decimal", () => {
        const deals: BoardDeal[] = [
            // 1 qualificado, 1 reunião → 100%
            deal({ id: "1", data_qualificado: "2026-04-22T10:00Z", data_closer: "2026-04-23T10:00Z", tipo_da_reuni_o_com_a_closer: "Online" }),
            // 2 qualificados, 1 reunião → 50%
            deal({ id: "2", data_qualificado: "2026-04-22T11:00Z" }),
            deal({ id: "3", data_qualificado: "2026-04-22T12:00Z" }),
        ];
        const r = computeFunnelWw({ deals, range, isComplete: true });
        expect(r.qualificados_sdr).toBe(3);
        expect(r.reunioes_closer).toBe(1);
        // 1/3 * 100 = 33.333... → 33.3
        expect(r.conversao_sdr_closer_pct).toBe(33.3);
    });
});

describe("computeRollingWw", () => {
    it("returns the subset shape", () => {
        const deals: BoardDeal[] = [
            deal({ id: "1", data_qualificado: "2026-04-22T10:00Z" }),
            // Contrato precisa de sinal de funil — adiciono data_qualificado.
            deal({ id: "2", data_qualificado: "2026-04-20T10:00Z", data_fechamento: "2026-04-23T10:00Z" }),
        ];
        const r = computeRollingWw({ deals, range, isComplete: false });
        expect(r).toEqual({ qualificados_sdr: 2, contratos_vol: 1, is_complete: false });
    });
});

describe("averageWwWeeks", () => {
    function makeWeek(o: Partial<FunnelWW>): FunnelWW {
        return {
            leads_gerados: 0,
            qualificados_sdr: 0,
            reunioes_closer: 0,
            contratos_vol: 0,
            conversao_sdr_closer_pct: null,
            is_complete: true,
            ...o,
        };
    }

    it("returns NullFunnelWW when all 4 are null", () => {
        const result = averageWwWeeks([null, null, null, null]);
        expect(result.leads_gerados).toBeNull();
        expect(result.qualificados_sdr).toBeNull();
        expect(result.is_complete).toBe(true);
    });

    it("averages over valid weeks only", () => {
        const result = averageWwWeeks([
            makeWeek({ leads_gerados: 80, qualificados_sdr: 20, reunioes_closer: 10, contratos_vol: 4 }),
            null, // excluded week (e.g., sync down)
            makeWeek({ leads_gerados: 100, qualificados_sdr: 30, reunioes_closer: 12, contratos_vol: 6 }),
            makeWeek({ leads_gerados: 90, qualificados_sdr: 25, reunioes_closer: 11, contratos_vol: 5 }),
        ]);
        // n=3 valid: leads_avg = (80+100+90)/3 = 90
        expect(result.leads_gerados).toBe(90);
        expect(result.qualificados_sdr).toBe(25); // (20+30+25)/3 = 25
        expect(result.reunioes_closer).toBe(11);
        expect(result.contratos_vol).toBe(5);
        expect(result.conversao_sdr_closer_pct).toBe(44); // 11/25*100 = 44
    });
});
