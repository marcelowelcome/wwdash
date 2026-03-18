import { describe, it, expect } from "vitest";
import {
    buildSimpleScoreProfiles,
    scoreSimpleDeal,
    scoreSimpleDeals,
    assessSimpleFunnelQuality,
    DEFAULT_SCORE_BANDS,
    type SimpleScoreProfiles,
    type ScoreBands,
} from "../lead-score";
import { type WonDeal } from "../schemas";

// ─── Factory helper ─────────────────────────────────────────────────────────

let _id = 0;
function makeDeal(overrides: Partial<WonDeal> = {}): WonDeal {
    _id++;
    return {
        id: String(_id),
        cdate: "2025-06-01T00:00:00Z",
        status: "1",
        stage: "1",
        _cf: {},
        ...overrides,
    };
}

function makeWonDeal(overrides: Partial<WonDeal> = {}): WonDeal {
    return makeDeal({
        status: "0",
        data_fechamento: "2025-07-01",
        ...overrides,
    });
}

function makeLostDeal(overrides: Partial<WonDeal> = {}): WonDeal {
    return makeDeal({ status: "2", ...overrides });
}

// ─── buildSimpleScoreProfiles ───────────────────────────────────────────────

describe("buildSimpleScoreProfiles", () => {
    it("computes conversion rates per destino from won/lost closer deals", () => {
        const closerDeals: WonDeal[] = [
            makeWonDeal({ destino: "Caribe" }),
            makeWonDeal({ destino: "Caribe" }),
            makeLostDeal({ destino: "Caribe" }),
            makeWonDeal({ destino: "Itália" }),
            makeLostDeal({ destino: "Itália" }),
            makeLostDeal({ destino: "Itália" }),
            makeLostDeal({ destino: "Itália" }),
        ];
        const wonDeals: WonDeal[] = [];

        const profiles = buildSimpleScoreProfiles(closerDeals, wonDeals);

        // Caribe: 2 won, 1 lost → rate = 2/3
        expect(profiles.destino.byValue["Caribe"].won).toBe(2);
        expect(profiles.destino.byValue["Caribe"].lost).toBe(1);
        expect(profiles.destino.byValue["Caribe"].rate).toBeCloseTo(2 / 3, 5);

        // Itália: 1 won, 3 lost → rate = 1/4
        expect(profiles.destino.byValue["Itália"].won).toBe(1);
        expect(profiles.destino.byValue["Itália"].lost).toBe(3);
        expect(profiles.destino.byValue["Itália"].rate).toBeCloseTo(0.25, 5);

        expect(profiles.totalResolvidos).toBe(7);
    });

    it("ignores open deals (status=1) for conversion rate calculation", () => {
        const closerDeals: WonDeal[] = [
            makeDeal({ destino: "Caribe", status: "1" }),
            makeWonDeal({ destino: "Caribe" }),
            makeLostDeal({ destino: "Caribe" }),
        ];
        const profiles = buildSimpleScoreProfiles(closerDeals, []);

        // Only won + lost count as resolved (2 total, not 3)
        expect(profiles.totalResolvidos).toBe(2);
        expect(profiles.destino.byValue["Caribe"].won).toBe(1);
        expect(profiles.destino.byValue["Caribe"].lost).toBe(1);
    });

    it("requires >= 2 resolved deals for a non-zero rate", () => {
        const closerDeals: WonDeal[] = [
            makeWonDeal({ destino: "Bali" }),
        ];
        const profiles = buildSimpleScoreProfiles(closerDeals, []);

        // Only 1 resolved → rate should be 0
        expect(profiles.destino.byValue["Bali"].rate).toBe(0);
    });

    it("computes ticketMedioPorDestino from won deals", () => {
        const wonDeals: WonDeal[] = [
            makeWonDeal({ destino: "Caribe", valor_fechado_em_contrato: 100000 }),
            makeWonDeal({ destino: "Caribe", valor_fechado_em_contrato: 200000 }),
            makeWonDeal({ destino: "Itália", valor_fechado_em_contrato: 300000 }),
        ];

        const profiles = buildSimpleScoreProfiles([], wonDeals);

        expect(profiles.ticketMedioPorDestino["Caribe"]).toBe(150000);
        expect(profiles.ticketMedioPorDestino["Itália"]).toBe(300000);
        // Geral = (100k + 200k + 300k) / 3
        expect(profiles.ticketMedioPorDestino["Geral"]).toBe(200000);
    });

    it("computes medianConvidados from won deals", () => {
        const wonDeals: WonDeal[] = [
            makeWonDeal({ num_convidados: 10 }),
            makeWonDeal({ num_convidados: 30 }),
            makeWonDeal({ num_convidados: 50 }),
        ];

        const profiles = buildSimpleScoreProfiles([], wonDeals);
        expect(profiles.medianConvidados).toBe(30);
    });

    it("returns empty/safe profiles with empty inputs (no crash)", () => {
        const profiles = buildSimpleScoreProfiles([], []);

        expect(profiles.destino.byValue).toEqual({});
        expect(profiles.destino.maxRate).toBe(0);
        expect(profiles.ticketMedioPorDestino).toEqual({});
        expect(profiles.medianConvidados).toBeUndefined();
        expect(profiles.totalResolvidos).toBe(0);
        expect(profiles.totalWon).toBe(0);
    });
});

// ─── scoreSimpleDeal ────────────────────────────────────────────────────────

describe("scoreSimpleDeal", () => {
    // Minimal profiles (the simple scoring uses fixed tables, not profiles data)
    const emptyProfiles: SimpleScoreProfiles = {
        destino: { byValue: {}, maxRate: 0, discriminatingPower: 0 },
        ticketMedioPorDestino: {},
        medianConvidados: undefined,
        totalResolvidos: 0,
        totalWon: 0,
    };
    const bands = DEFAULT_SCORE_BANDS;

    it("gives high destino score for Caribe (30/30)", () => {
        const deal = makeDeal({ destino: "Caribe" });
        const result = scoreSimpleDeal(deal, emptyProfiles, bands);

        expect(result.destino.score).toBe(30);
        expect(result.destino.hasData).toBe(true);
        expect(result.destino.label).toBe("Caribe");
    });

    it("gives lower destino score for Maldivas (5/30)", () => {
        const deal = makeDeal({ destino: "Maldivas" });
        const result = scoreSimpleDeal(deal, emptyProfiles, bands);

        expect(result.destino.score).toBe(5);
    });

    it("gives default destino score (5) for unknown destination", () => {
        const deal = makeDeal({ destino: "Havaí" });
        const result = scoreSimpleDeal(deal, emptyProfiles, bands);

        expect(result.destino.score).toBe(5);
    });

    it("gives destino score 0 when destino is null", () => {
        const deal = makeDeal({ destino: null });
        const result = scoreSimpleDeal(deal, emptyProfiles, bands);

        expect(result.destino.score).toBe(0);
        expect(result.destino.hasData).toBe(false);
    });

    it("scores convidados by destination group (Caribe → caribe_nordeste_outros table)", () => {
        // 65 guests in Caribe group → tier index 3 (51-80) → score 20
        const deal = makeDeal({ destino: "Caribe", num_convidados: 65 });
        const result = scoreSimpleDeal(deal, emptyProfiles, bands);

        expect(result.convidados.score).toBe(20);
        expect(result.convidados.hasData).toBe(true);
    });

    it("scores convidados by europa group differently", () => {
        // 15 guests in Europa group → tier index 1 (≤20) → score 25
        const deal = makeDeal({ destino: "Itália", num_convidados: 15 });
        const result = scoreSimpleDeal(deal, emptyProfiles, bands);

        expect(result.convidados.score).toBe(25);
    });

    it("gives convidados score 0 when num_convidados is null", () => {
        const deal = makeDeal({ destino: "Caribe", num_convidados: null });
        const result = scoreSimpleDeal(deal, emptyProfiles, bands);

        expect(result.convidados.score).toBe(0);
        expect(result.convidados.hasData).toBe(false);
    });

    it("scores orcamento in tiers (e.g., 150k → R$ 101-200 mil → 20)", () => {
        const deal = makeDeal({ orcamento: 150000 });
        const result = scoreSimpleDeal(deal, emptyProfiles, bands);

        expect(result.orcamento.score).toBe(20);
        expect(result.orcamento.hasData).toBe(true);
    });

    it("scores orcamento <= 50k as 5", () => {
        const deal = makeDeal({ orcamento: 40000 });
        const result = scoreSimpleDeal(deal, emptyProfiles, bands);

        expect(result.orcamento.score).toBe(5);
    });

    it("scores orcamento > 500k as 30", () => {
        const deal = makeDeal({ orcamento: 600000 });
        const result = scoreSimpleDeal(deal, emptyProfiles, bands);

        expect(result.orcamento.score).toBe(30);
    });

    it("gives orcamento score 0 when orcamento is null", () => {
        const deal = makeDeal({ orcamento: null });
        const result = scoreSimpleDeal(deal, emptyProfiles, bands);

        expect(result.orcamento.score).toBe(0);
        expect(result.orcamento.hasData).toBe(false);
    });

    it("total = sum of all 3 dimension scores", () => {
        // Caribe (30) + 65 guests in Caribe (20) + 150k orc (20) = 70
        const deal = makeDeal({ destino: "Caribe", num_convidados: 65, orcamento: 150000 });
        const result = scoreSimpleDeal(deal, emptyProfiles, bands);

        expect(result.total).toBe(30 + 20 + 20);
        expect(result.total).toBe(
            result.destino.score + result.convidados.score + result.orcamento.score
        );
    });

    it("assigns band A when total >= 65 (default bands)", () => {
        // Caribe (30) + 100+ guests (30) + >500k (30) = 90
        const deal = makeDeal({ destino: "Caribe", num_convidados: 150, orcamento: 600000 });
        const result = scoreSimpleDeal(deal, emptyProfiles, bands);

        expect(result.total).toBe(90);
        expect(result.band).toBe("A");
    });

    it("assigns band B when total >= 50 but < 65", () => {
        // Caribe (30) + 35 guests (15) + 60k orc (10) = 55
        const deal = makeDeal({ destino: "Caribe", num_convidados: 35, orcamento: 60000 });
        const result = scoreSimpleDeal(deal, emptyProfiles, bands);

        expect(result.total).toBe(55);
        expect(result.band).toBe("B");
    });

    it("assigns band C when total >= 30 but < 50", () => {
        // Caribe (30) + no convidados (0) + no orcamento (0) = 30
        const deal = makeDeal({ destino: "Caribe" });
        const result = scoreSimpleDeal(deal, emptyProfiles, bands);

        expect(result.total).toBe(30);
        expect(result.band).toBe("C");
    });

    it("assigns band D when total < 30", () => {
        // Maldivas (5) + no convidados (0) + no orcamento (0) = 5
        const deal = makeDeal({ destino: "Maldivas" });
        const result = scoreSimpleDeal(deal, emptyProfiles, bands);

        expect(result.total).toBe(5);
        expect(result.band).toBe("D");
    });

    it("deal missing all 3 fields → total = 0, band D", () => {
        const deal = makeDeal({ destino: null, num_convidados: null, orcamento: null });
        const result = scoreSimpleDeal(deal, emptyProfiles, bands);

        expect(result.total).toBe(0);
        expect(result.band).toBe("D");
        expect(result.destino.hasData).toBe(false);
        expect(result.convidados.hasData).toBe(false);
        expect(result.orcamento.hasData).toBe(false);
    });

    it("respects custom bands", () => {
        const customBands: ScoreBands = { A: 80, B: 60, C: 40 };
        // Caribe (30) + 65 guests (20) + 150k (20) = 70 → B with custom bands
        const deal = makeDeal({ destino: "Caribe", num_convidados: 65, orcamento: 150000 });
        const result = scoreSimpleDeal(deal, emptyProfiles, customBands);

        expect(result.total).toBe(70);
        expect(result.band).toBe("B");
    });
});

// ─── scoreSimpleDeals ───────────────────────────────────────────────────────

describe("scoreSimpleDeals", () => {
    const emptyProfiles: SimpleScoreProfiles = {
        destino: { byValue: {}, maxRate: 0, discriminatingPower: 0 },
        ticketMedioPorDestino: {},
        medianConvidados: undefined,
        totalResolvidos: 0,
        totalWon: 0,
    };
    const bands = DEFAULT_SCORE_BANDS;

    it("scores all deals and preserves deal fields", () => {
        const deals: WonDeal[] = [
            makeDeal({ destino: "Caribe", num_convidados: 150, orcamento: 600000 }),
            makeDeal({ destino: "Maldivas" }),
        ];
        const scored = scoreSimpleDeals(deals, emptyProfiles, bands);

        expect(scored).toHaveLength(2);
        expect(scored[0].score.total).toBe(90);
        expect(scored[1].score.total).toBe(5);
    });

    it("each result has a tier (band) based on score", () => {
        const deals: WonDeal[] = [
            makeDeal({ destino: "Caribe", num_convidados: 150, orcamento: 600000 }),  // 90 → A
            makeDeal({ destino: "Caribe", num_convidados: 35, orcamento: 60000 }),    // 55 → B
            makeDeal({ destino: "Caribe" }),                                           // 30 → C
            makeDeal({ destino: null }),                                                // 0 → D
        ];
        const scored = scoreSimpleDeals(deals, emptyProfiles, bands);

        expect(scored[0].score.band).toBe("A");
        expect(scored[1].score.band).toBe("B");
        expect(scored[2].score.band).toBe("C");
        expect(scored[3].score.band).toBe("D");
    });

    it("computes diasNoFunil from cdate", () => {
        const deal = makeDeal({ cdate: new Date().toISOString(), destino: "Caribe" });
        const scored = scoreSimpleDeals([deal], emptyProfiles, bands);

        expect(scored[0].diasNoFunil).toBeGreaterThanOrEqual(0);
        expect(scored[0].diasNoFunil).toBeLessThanOrEqual(1);
    });

    it("returns empty array for empty input", () => {
        const scored = scoreSimpleDeals([], emptyProfiles, bands);
        expect(scored).toEqual([]);
    });
});

// ─── assessSimpleFunnelQuality ──────────────────────────────────────────────

describe("assessSimpleFunnelQuality", () => {
    const emptyProfiles: SimpleScoreProfiles = {
        destino: { byValue: {}, maxRate: 0, discriminatingPower: 0 },
        ticketMedioPorDestino: {},
        medianConvidados: undefined,
        totalResolvidos: 0,
        totalWon: 0,
    };
    const bands = DEFAULT_SCORE_BANDS;

    it("returns orange status with message when no open deals", () => {
        const result = assessSimpleFunnelQuality([], emptyProfiles, []);

        expect(result.status).toBe("orange");
        expect(result.message).toContain("Sem leads abertos");
        expect(result.avgScore).toBe(0);
    });

    it("returns green status when >= 30% A-tier and < 30% D-tier", () => {
        // Build 10 deals: 4 A-tier, 3 B-tier, 2 C-tier, 1 D-tier
        const openDeals: WonDeal[] = [];
        const scored = [];

        // 4 A-tier deals (score 90)
        for (let i = 0; i < 4; i++) {
            const d = makeDeal({ destino: "Caribe", num_convidados: 150, orcamento: 600000 });
            openDeals.push(d);
            scored.push({ ...d, score: scoreSimpleDeal(d, emptyProfiles, bands), diasNoFunil: 10 });
        }
        // 3 B-tier deals (score 55)
        for (let i = 0; i < 3; i++) {
            const d = makeDeal({ destino: "Caribe", num_convidados: 35, orcamento: 60000 });
            openDeals.push(d);
            scored.push({ ...d, score: scoreSimpleDeal(d, emptyProfiles, bands), diasNoFunil: 10 });
        }
        // 2 C-tier deals (score 30)
        for (let i = 0; i < 2; i++) {
            const d = makeDeal({ destino: "Caribe" });
            openDeals.push(d);
            scored.push({ ...d, score: scoreSimpleDeal(d, emptyProfiles, bands), diasNoFunil: 10 });
        }
        // 1 D-tier deal (score 5)
        {
            const d = makeDeal({ destino: "Maldivas" });
            openDeals.push(d);
            scored.push({ ...d, score: scoreSimpleDeal(d, emptyProfiles, bands), diasNoFunil: 10 });
        }

        const result = assessSimpleFunnelQuality(openDeals, emptyProfiles, scored);

        expect(result.status).toBe("green");
        expect(result.message).toContain("saudável");
    });

    it("returns red status when >= 50% D-tier", () => {
        const openDeals: WonDeal[] = [];
        const scored = [];

        // 6 D-tier deals out of 10
        for (let i = 0; i < 6; i++) {
            const d = makeDeal({ destino: null });
            openDeals.push(d);
            scored.push({ ...d, score: scoreSimpleDeal(d, emptyProfiles, bands), diasNoFunil: 10 });
        }
        // 4 A-tier deals
        for (let i = 0; i < 4; i++) {
            const d = makeDeal({ destino: "Caribe", num_convidados: 150, orcamento: 600000 });
            openDeals.push(d);
            scored.push({ ...d, score: scoreSimpleDeal(d, emptyProfiles, bands), diasNoFunil: 10 });
        }

        const result = assessSimpleFunnelQuality(openDeals, emptyProfiles, scored);

        expect(result.status).toBe("red");
        expect(result.message).toContain("crítica");
    });

    it("returns orange status for mixed funnel", () => {
        const openDeals: WonDeal[] = [];
        const scored = [];

        // 2 A-tier, 3 B-tier, 2 C-tier, 3 D-tier (20% A, 30% D → neither green nor red)
        for (let i = 0; i < 2; i++) {
            const d = makeDeal({ destino: "Caribe", num_convidados: 150, orcamento: 600000 });
            openDeals.push(d);
            scored.push({ ...d, score: scoreSimpleDeal(d, emptyProfiles, bands), diasNoFunil: 10 });
        }
        for (let i = 0; i < 3; i++) {
            const d = makeDeal({ destino: "Caribe", num_convidados: 35, orcamento: 60000 });
            openDeals.push(d);
            scored.push({ ...d, score: scoreSimpleDeal(d, emptyProfiles, bands), diasNoFunil: 10 });
        }
        for (let i = 0; i < 2; i++) {
            const d = makeDeal({ destino: "Caribe" });
            openDeals.push(d);
            scored.push({ ...d, score: scoreSimpleDeal(d, emptyProfiles, bands), diasNoFunil: 10 });
        }
        for (let i = 0; i < 3; i++) {
            const d = makeDeal({ destino: null });
            openDeals.push(d);
            scored.push({ ...d, score: scoreSimpleDeal(d, emptyProfiles, bands), diasNoFunil: 10 });
        }

        const result = assessSimpleFunnelQuality(openDeals, emptyProfiles, scored);

        expect(result.status).toBe("orange");
        expect(result.message).toContain("misto");
    });

    it("scoreSummary has 4 bands with counts and percentages", () => {
        const openDeals: WonDeal[] = [];
        const scored = [];

        for (let i = 0; i < 4; i++) {
            const d = makeDeal({ destino: "Caribe", num_convidados: 150, orcamento: 600000 });
            openDeals.push(d);
            scored.push({ ...d, score: scoreSimpleDeal(d, emptyProfiles, bands), diasNoFunil: 10 });
        }

        const result = assessSimpleFunnelQuality(openDeals, emptyProfiles, scored);

        expect(result.scoreSummary).toHaveLength(4);
        expect(result.scoreSummary[0].band).toBe("A");
        expect(result.scoreSummary[0].count).toBe(4);
        expect(result.scoreSummary[0].pct).toBe(100);
    });

    it("avgScore is the mean of all scored deals", () => {
        const openDeals: WonDeal[] = [];
        const scored = [];

        // 1 deal at 90 + 1 deal at 0 → avg 45
        const d1 = makeDeal({ destino: "Caribe", num_convidados: 150, orcamento: 600000 });
        openDeals.push(d1);
        scored.push({ ...d1, score: scoreSimpleDeal(d1, emptyProfiles, bands), diasNoFunil: 10 });

        const d2 = makeDeal({ destino: null });
        openDeals.push(d2);
        scored.push({ ...d2, score: scoreSimpleDeal(d2, emptyProfiles, bands), diasNoFunil: 10 });

        const result = assessSimpleFunnelQuality(openDeals, emptyProfiles, scored);

        expect(result.avgScore).toBe(45);
    });
});
