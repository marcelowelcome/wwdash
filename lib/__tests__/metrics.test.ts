import { describe, it, expect } from "vitest";
import { getCloserStatus, computeMetrics, type Metrics } from "../metrics";
import { type Deal } from "../schemas";
import { TRAINING_MOTIVE, CLOSER_GROUP_ID } from "../supabase-api";

// ─── FACTORY HELPERS ──────────────────────────────────────────────────────────

/** Creates a minimal Deal with sensible defaults. Override any field via `overrides`. */
function buildDeal(overrides: Partial<Deal> = {}): Deal {
    return {
        id: overrides.id ?? "1",
        cdate: overrides.cdate ?? new Date().toISOString(),
        mdate: overrides.mdate,
        status: overrides.status ?? "1",
        stage: overrides.stage ?? "Default",
        group_id: overrides.group_id ?? CLOSER_GROUP_ID,
        stage_id: overrides.stage_id ?? null,
        owner_id: overrides.owner_id ?? null,
        data_fechamento: overrides.data_fechamento ?? null,
        destino: overrides.destino ?? null,
        data_reuniao_1: overrides.data_reuniao_1 ?? null,
        como_foi_feita_a_1a_reuniao: overrides.como_foi_feita_a_1a_reuniao ?? null,
        data_horario_agendamento_closer: overrides.data_horario_agendamento_closer ?? null,
        _cf: overrides._cf ?? {},
    };
}

/** Returns the standard field map matching fetchFieldMetaFromDb. */
function buildFieldMap(): Record<string, string> {
    return {
        "Motivos de qualificação SDR": "custom_field_qual",
        "Motivo de qualificação SDR": "custom_field_qual",
        "[WW] [Closer] Motivo de Perda": "custom_field_loss",
        "Motivo de Perda": "custom_field_loss",
        "Motivo Desqualificação SDR": "custom_field_sdr_loss",
        "SQL": "custom_field_sql",
        "Taxa Enviada": "custom_field_tax_sent",
        "Taxa Paga": "custom_field_tax_paid",
        "Fonte": "custom_field_source",
    };
}

/** Returns a simple identity stage map. */
function buildStageMap(stages: string[] = ["Default", "Contato", "Reunião"]): Record<string, string> {
    const map: Record<string, string> = {};
    stages.forEach((s) => (map[s] = s));
    return map;
}

/** Returns an ISO date string for n days ago. */
function daysAgoISO(n: number): string {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d.toISOString();
}

// ─── TESTS ────────────────────────────────────────────────────────────────────

describe("getCloserStatus", () => {
    it("returns '0' (Won) when data_fechamento is set", () => {
        const deal = buildDeal({ data_fechamento: "2025-06-01", status: "1" });
        expect(getCloserStatus(deal)).toBe("0");
    });

    it("returns '2' (Lost) when status is '2' and no data_fechamento", () => {
        const deal = buildDeal({ status: "2", data_fechamento: null });
        expect(getCloserStatus(deal)).toBe("2");
    });

    it("returns '1' (Open) when status is '1' and no data_fechamento", () => {
        const deal = buildDeal({ status: "1", data_fechamento: null });
        expect(getCloserStatus(deal)).toBe("1");
    });

    it("returns '0' (Won) when status is '1' but data_fechamento is set — data_fechamento overrides", () => {
        const deal = buildDeal({ status: "1", data_fechamento: "2025-07-15" });
        expect(getCloserStatus(deal)).toBe("0");
    });

    it("returns '0' (Won) even when status is '2' but data_fechamento is set", () => {
        const deal = buildDeal({ status: "2", data_fechamento: "2025-03-01" });
        expect(getCloserStatus(deal)).toBe("0");
    });
});

describe("computeMetrics", () => {
    const fieldMap = buildFieldMap();
    const stageMap = buildStageMap();

    describe("empty inputs", () => {
        it("returns zero metrics when no deals are provided", () => {
            const m = computeMetrics([], [], [], fieldMap, stageMap);

            expect(m.sdrThisWeek).toBe(0);
            expect(m.conv_curr).toBe(0);
            expect(m.openDeals).toBe(0);
            expect(m.won_curr).toBe(0);
            expect(m.lost_curr).toBe(0);
            expect(m.histRate).toBe(0);
            expect(m.velocity).toBe(0);
            expect(m.sdrFunnel.received).toBe(0);
        });
    });

    describe("SDR counting", () => {
        it("counts SDR deals (group_id '1') into sdrFunnel.received", () => {
            const sdrDeals = Array.from({ length: 5 }, (_, i) =>
                buildDeal({
                    id: `sdr-${i}`,
                    group_id: "1",
                    cdate: daysAgoISO(10),
                    stage: "Contato",
                })
            );

            const m = computeMetrics(sdrDeals, [], [], fieldMap, stageMap);
            expect(m.sdrFunnel.received).toBe(5);
        });

        it("ignores non-SDR deals in rawSdrDeals (wrong group_id)", () => {
            const deals = [
                buildDeal({ id: "1", group_id: "1", cdate: daysAgoISO(5) }),
                buildDeal({ id: "2", group_id: "3", cdate: daysAgoISO(5) }),
                buildDeal({ id: "3", group_id: "99", cdate: daysAgoISO(5) }),
            ];

            const m = computeMetrics(deals, [], [], fieldMap, stageMap);
            expect(m.sdrFunnel.received).toBe(1);
        });
    });

    describe("Closer conversion", () => {
        it("computes conversion from won and lost deals in the last 28 days", () => {
            // 3 won + 2 lost in last 28 days → 60%
            const wonDeals = Array.from({ length: 3 }, (_, i) =>
                buildDeal({
                    id: `won-${i}`,
                    group_id: CLOSER_GROUP_ID,
                    cdate: daysAgoISO(15),
                    data_fechamento: daysAgoISO(10),
                    status: "1",
                })
            );
            const lostDeals = Array.from({ length: 2 }, (_, i) =>
                buildDeal({
                    id: `lost-${i}`,
                    group_id: CLOSER_GROUP_ID,
                    cdate: daysAgoISO(20),
                    mdate: daysAgoISO(8),
                    status: "2",
                })
            );

            const closerDeals = [...wonDeals, ...lostDeals];
            const m = computeMetrics([], closerDeals, wonDeals, fieldMap, stageMap);

            expect(m.conv_curr).toBeCloseTo(60, 0);
            expect(m.won_curr).toBe(3);
            expect(m.lost_curr).toBe(2);
        });

        it("returns histRate based on all-time won vs decided", () => {
            // 2 won, 3 lost → histRate ~40%
            const wonDeals = Array.from({ length: 2 }, (_, i) =>
                buildDeal({
                    id: `hw-${i}`,
                    group_id: CLOSER_GROUP_ID,
                    cdate: daysAgoISO(100),
                    data_fechamento: daysAgoISO(90),
                })
            );
            const lostDeals = Array.from({ length: 3 }, (_, i) =>
                buildDeal({
                    id: `hl-${i}`,
                    group_id: CLOSER_GROUP_ID,
                    cdate: daysAgoISO(100),
                    mdate: daysAgoISO(90),
                    status: "2",
                })
            );

            const m = computeMetrics([], [...wonDeals, ...lostDeals], wonDeals, fieldMap, stageMap);
            expect(m.histRate).toBeCloseTo(40, 0);
        });
    });

    describe("training deal filtering", () => {
        it("excludes deals with TRAINING_MOTIVE from closer metrics", () => {
            const qualFieldId = fieldMap["Motivos de qualificação SDR"];

            const trainingDeal = buildDeal({
                id: "training-1",
                group_id: CLOSER_GROUP_ID,
                cdate: daysAgoISO(10),
                status: "2",
                mdate: daysAgoISO(5),
                _cf: { [qualFieldId]: TRAINING_MOTIVE },
            });
            const normalDeal = buildDeal({
                id: "normal-1",
                group_id: CLOSER_GROUP_ID,
                cdate: daysAgoISO(10),
                status: "1",
            });

            const m = computeMetrics([], [trainingDeal, normalDeal], [], fieldMap, stageMap);

            // Only the normal deal should remain in the pipeline
            expect(m.openDeals).toBe(1);
        });
    });

    describe("won deals from other groups", () => {
        it("includes won deals from group_id '4' in closer performance universe", () => {
            const wonFromGroup4 = buildDeal({
                id: "won-g4",
                group_id: "4",
                cdate: daysAgoISO(20),
                data_fechamento: daysAgoISO(10),
                status: "1",
            });

            // Pass as rawWonDeals — should be merged into closer performance
            const m = computeMetrics([], [], [wonFromGroup4], fieldMap, stageMap);

            // The deal should appear in historical won count
            expect(m.histRate).toBeGreaterThan(0);
        });
    });

    describe("pipeline age buckets", () => {
        it("distributes open deals into correct age buckets", () => {
            const deals = [
                buildDeal({ id: "a1", cdate: daysAgoISO(5), status: "1" }),   // 0–14
                buildDeal({ id: "a2", cdate: daysAgoISO(10), status: "1" }),  // 0–14
                buildDeal({ id: "a3", cdate: daysAgoISO(20), status: "1" }),  // 15–30
                buildDeal({ id: "a4", cdate: daysAgoISO(45), status: "1" }),  // 31–60
                buildDeal({ id: "a5", cdate: daysAgoISO(90), status: "1" }),  // 60+
            ];

            const m = computeMetrics([], deals, [], fieldMap, stageMap);

            expect(m.pipeByAge[0]).toMatchObject({ label: "0–14 dias", n: 2 });
            expect(m.pipeByAge[1]).toMatchObject({ label: "15–30 dias", n: 1 });
            expect(m.pipeByAge[2]).toMatchObject({ label: "31–60 dias", n: 1 });
            expect(m.pipeByAge[3]).toMatchObject({ label: "60+ dias", n: 1 });
            expect(m.openDeals).toBe(5);
        });

        it("does not count won or lost deals in age buckets", () => {
            const deals = [
                buildDeal({ id: "o1", cdate: daysAgoISO(5), status: "1" }),
                buildDeal({ id: "w1", cdate: daysAgoISO(5), data_fechamento: daysAgoISO(2) }), // won
                buildDeal({ id: "l1", cdate: daysAgoISO(5), status: "2" }),                     // lost
            ];

            const m = computeMetrics([], deals, [], fieldMap, stageMap);
            expect(m.openDeals).toBe(1);
            expect(m.pipeByAge[0].n).toBe(1);
        });
    });

    describe("return type structure", () => {
        it("contains all expected top-level keys", () => {
            const m = computeMetrics([], [], [], fieldMap, stageMap);

            const expectedKeys: (keyof Metrics)[] = [
                "sdrThisWeek",
                "sdrAvg4",
                "sdrVsAvg",
                "sdrStatus",
                "sdrWeeklyHistory",
                "sdrFunnel",
                "sdrFunnelWeekly",
                "qualRate",
                "qualStatus",
                "sdrQualTrend",
                "sdrLossReasons",
                "sdrLossPanels",
                "sdrTaxaTrend",
                "sdrSourceBreakdown",
                "sdrNoShowRate",
                "sdrNoShowCount",
                "sdrWithMeetingCount",
                "closerThisWeek",
                "conv_curr",
                "conv_prev",
                "convStatus",
                "convTrend",
                "histRate",
                "velocity",
                "velocityStatus",
                "won_curr",
                "lost_curr",
                "open_curr",
                "enteredMM4",
                "lossReasons",
                "openDeals",
                "sentContractsCount",
                "planActiveCount",
                "planCancelledCount",
                "pipeByAge",
                "pipeByStage",
                "coh1",
                "coh2",
                "pipelineStatus",
                "activeAlerts",
                "dealsByDestination",
            ];

            for (const key of expectedKeys) {
                expect(m).toHaveProperty(key);
            }
        });

        it("sdrFunnel has the expected shape", () => {
            const m = computeMetrics([], [], [], fieldMap, stageMap);
            expect(m.sdrFunnel).toEqual(
                expect.objectContaining({
                    received: expect.any(Number),
                    engaged: expect.any(Number),
                    decided: expect.any(Number),
                    passedTaxa: expect.any(Number),
                    qualified: expect.any(Number),
                    engagedPct: expect.any(Number),
                    decidedPct: expect.any(Number),
                    passedTaxaPct: expect.any(Number),
                    qualifiedPctFromReceived: expect.any(Number),
                })
            );
        });

        it("pipeByAge always has exactly 4 buckets", () => {
            const m = computeMetrics([], [], [], fieldMap, stageMap);
            expect(m.pipeByAge).toHaveLength(4);
        });

        it("activeAlerts is never empty (default green alert)", () => {
            const m = computeMetrics([], [], [], fieldMap, stageMap);
            expect(m.activeAlerts.length).toBeGreaterThanOrEqual(1);
        });
    });
});
