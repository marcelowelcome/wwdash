import { describe, it, expect } from "vitest";
import {
    computeJornada,
    daysBackPeriod,
    monthPeriod,
    previousPeriod,
    sliceStages,
    targetRateBetween,
    bucketTimeSeries,
    SUBVIEWS,
    STAGE_DEFS,
    type JornadaPeriod,
} from "../metrics-jornada";
import { type WonDeal } from "../schemas";

let _id = 0;

function dealAt(overrides: Partial<WonDeal> = {}): WonDeal {
    return {
        id: overrides.id ?? String(++_id),
        cdate: overrides.cdate ?? "2026-04-01T12:00:00Z",
        mdate: overrides.mdate,
        status: overrides.status ?? "1",
        stage: overrides.stage ?? "Default",
        group_id: overrides.group_id ?? "1",
        stage_id: overrides.stage_id ?? null,
        owner_id: overrides.owner_id ?? "owner1",
        data_fechamento: overrides.data_fechamento ?? null,
        destino: overrides.destino ?? null,
        data_reuniao_1: overrides.data_reuniao_1 ?? null,
        como_foi_feita_a_1a_reuniao: overrides.como_foi_feita_a_1a_reuniao ?? null,
        data_horario_agendamento_closer: overrides.data_horario_agendamento_closer ?? null,
        data_qualificado: overrides.data_qualificado ?? null,
        reuniao_closer: overrides.reuniao_closer ?? null,
        qualificado_para_sql: overrides.qualificado_para_sql ?? null,
        _cf: {},
    } as WonDeal;
}

const APRIL = monthPeriod(2026, 3); // month index 3 = April
const MARCH = monthPeriod(2026, 2);
const AFTER_ALL = new Date(2026, 11, 31); // used as "today" to force all meetings into past

describe("computeJornada — coorte mode", () => {
    it("counts entrada from cdate within period", () => {
        const deals = [
            dealAt({ cdate: "2026-04-05T10:00:00Z" }),
            dealAt({ cdate: "2026-04-10T10:00:00Z" }),
            dealAt({ cdate: "2026-03-15T10:00:00Z" }), // out of period
        ];
        const j = computeJornada(deals, APRIL, "coorte", AFTER_ALL);
        const entrada = j.stages.find((s) => s.key === "entrada")!;
        expect(entrada.count).toBe(2);
    });

    it("propagates funnel: agendou, realizou, qualificou, vendeu", () => {
        const deals = [
            // entered in April + full journey
            dealAt({
                cdate: "2026-04-05T10:00:00Z",
                data_reuniao_1: "2026-04-08T10:00:00Z",
                como_foi_feita_a_1a_reuniao: "Vídeo",
                qualificado_para_sql: "Sim",
                data_horario_agendamento_closer: "2026-04-12T10:00:00Z",
                reuniao_closer: "Vídeo",
                data_fechamento: "2026-04-13T10:00:00Z",
            }),
            // entered in April + only scheduled
            dealAt({
                cdate: "2026-04-06T10:00:00Z",
                data_reuniao_1: "2026-04-09T10:00:00Z",
            }),
            // entered in March → ignored in coorte mode
            dealAt({
                cdate: "2026-03-20T10:00:00Z",
                data_reuniao_1: "2026-04-01T10:00:00Z",
                data_fechamento: "2026-04-15T10:00:00Z",
            }),
        ];
        const j = computeJornada(deals, APRIL, "coorte", AFTER_ALL);
        const get = (k: string) => j.stages.find((s) => s.key === k)!.count;
        expect(get("entrada")).toBe(2);
        expect(get("agendou")).toBe(2);
        expect(get("realizou")).toBe(1);
        expect(get("qualificou")).toBe(1);
        expect(get("agCloser")).toBe(1);
        expect(get("realizouCloser")).toBe(1);
        expect(get("vendeu")).toBe(1);
    });

    it("computes rateFromPrev as % of previous stage", () => {
        const deals = [
            dealAt({ cdate: "2026-04-01T10:00:00Z", data_reuniao_1: "2026-04-05T10:00:00Z" }),
            dealAt({ cdate: "2026-04-02T10:00:00Z", data_reuniao_1: "2026-04-06T10:00:00Z" }),
            dealAt({ cdate: "2026-04-03T10:00:00Z" }),
            dealAt({ cdate: "2026-04-04T10:00:00Z" }),
        ];
        const j = computeJornada(deals, APRIL, "coorte", AFTER_ALL);
        const agendou = j.stages.find((s) => s.key === "agendou")!;
        expect(agendou.count).toBe(2);
        expect(agendou.rateFromPrev).toBe(50); // 2/4
    });

    it("treats 'Não teve reunião' as not realizou", () => {
        const deals = [
            dealAt({
                cdate: "2026-04-01T10:00:00Z",
                data_reuniao_1: "2026-04-05T10:00:00Z",
                como_foi_feita_a_1a_reuniao: "Não teve reunião",
            }),
        ];
        const j = computeJornada(deals, APRIL, "coorte", AFTER_ALL);
        expect(j.stages.find((s) => s.key === "realizou")!.count).toBe(0);
    });
});

describe("computeJornada — evento mode", () => {
    it("counts agendou by data_reuniao_1 within period regardless of cdate", () => {
        const deals = [
            // entered March, meeting in April → counts as April event
            dealAt({ cdate: "2026-03-01T10:00:00Z", data_reuniao_1: "2026-04-08T10:00:00Z" }),
            // entered April, meeting in April
            dealAt({ cdate: "2026-04-01T10:00:00Z", data_reuniao_1: "2026-04-10T10:00:00Z" }),
            // entered April, meeting in May → out
            dealAt({ cdate: "2026-04-15T10:00:00Z", data_reuniao_1: "2026-05-01T10:00:00Z" }),
        ];
        const j = computeJornada(deals, APRIL, "evento", AFTER_ALL);
        expect(j.stages.find((s) => s.key === "agendou")!.count).toBe(2);
    });

    it("counts vendeu by data_fechamento within period", () => {
        const deals = [
            dealAt({ cdate: "2026-01-01T10:00:00Z", data_fechamento: "2026-04-10T10:00:00Z" }),
            dealAt({ cdate: "2026-03-15T10:00:00Z", data_fechamento: "2026-04-20T10:00:00Z" }),
            dealAt({ cdate: "2026-04-01T10:00:00Z", data_fechamento: "2026-05-05T10:00:00Z" }),
        ];
        const j = computeJornada(deals, APRIL, "evento", AFTER_ALL);
        expect(j.stages.find((s) => s.key === "vendeu")!.count).toBe(2);
    });
});

describe("meta status", () => {
    it("flags above when rate >= meta", () => {
        const deals = Array.from({ length: 10 }, (_, i) =>
            dealAt({
                cdate: "2026-04-01T10:00:00Z",
                data_reuniao_1: i < 5 ? "2026-04-05T10:00:00Z" : null, // 50% = above 45 meta
            }),
        );
        const j = computeJornada(deals, APRIL, "coorte", AFTER_ALL);
        expect(j.stages.find((s) => s.key === "agendou")!.metaStatus).toBe("above");
    });

    it("flags below when rate < 85% of meta", () => {
        const deals = Array.from({ length: 10 }, (_, i) =>
            dealAt({
                cdate: "2026-04-01T10:00:00Z",
                data_reuniao_1: i < 2 ? "2026-04-05T10:00:00Z" : null, // 20% << 45 meta
            }),
        );
        const j = computeJornada(deals, APRIL, "coorte", AFTER_ALL);
        expect(j.stages.find((s) => s.key === "agendou")!.metaStatus).toBe("below");
    });
});

describe("period helpers", () => {
    it("monthPeriod produces a half-open range covering the month", () => {
        const p = monthPeriod(2026, 3); // April
        expect(p.from.toISOString().slice(0, 10)).toBe("2026-04-01");
        expect(p.to.toISOString().slice(0, 10)).toBe("2026-05-01");
    });

    it("previousPeriod subtracts one calendar month (fair comparison)", () => {
        const prev = previousPeriod(APRIL);
        // April 1 - May 1 → March 1 - April 1
        expect(prev.from.toISOString().slice(0, 10)).toBe("2026-03-01");
        expect(prev.to.toISOString().slice(0, 10)).toBe("2026-04-01");
    });

    it("previousPeriod preserves day-of-month for MTD ranges", () => {
        // Custom range: April 1 to April 15 → March 1 to March 15
        const aprilMtd: JornadaPeriod = {
            from: new Date(2026, 3, 1),
            to: new Date(2026, 3, 16),
            label: "01/04/2026 a 15/04/2026",
        };
        const prev = previousPeriod(aprilMtd);
        expect(prev.from.toISOString().slice(0, 10)).toBe("2026-03-01");
        // to was Apr 16 → Mar 16
        expect(prev.to.toISOString().slice(0, 10)).toBe("2026-03-16");
    });

    it("previousPeriod label is regenerated, not suffixed", () => {
        const prev = previousPeriod(APRIL);
        expect(prev.label).toBe("Março de 2026");
    });

    it("daysBackPeriod is anchored to today", () => {
        const today = new Date(2026, 3, 14); // April 14
        const p = daysBackPeriod(30, today);
        expect(p.to.toISOString().slice(0, 10)).toBe("2026-04-15");
        expect(p.from.toISOString().slice(0, 10)).toBe("2026-03-16");
    });
});

describe("sliceStages", () => {
    it("returns stages between two keys inclusive", () => {
        const j = computeJornada([], APRIL, "coorte", AFTER_ALL);
        const slice = sliceStages(j.stages, ["agendou", "qualificou"]);
        expect(slice.map((s) => s.key)).toEqual(["agendou", "realizou", "qualificou"]);
    });
});

describe("past/future split for scheduling stages", () => {
    const TODAY = new Date("2026-04-15T00:00:00Z");

    it("splits agendou into pastCount + futureCount", () => {
        const deals = [
            dealAt({ cdate: "2026-04-01T10:00:00Z", data_reuniao_1: "2026-04-05T10:00:00Z" }), // past
            dealAt({ cdate: "2026-04-01T10:00:00Z", data_reuniao_1: "2026-04-10T10:00:00Z" }), // past
            dealAt({ cdate: "2026-04-01T10:00:00Z", data_reuniao_1: "2026-04-20T10:00:00Z" }), // future
            dealAt({ cdate: "2026-04-01T10:00:00Z", data_reuniao_1: "2026-05-01T10:00:00Z" }), // future
        ];
        const j = computeJornada(deals, APRIL, "coorte", TODAY);
        const agendou = j.stages.find((s) => s.key === "agendou")!;
        expect(agendou.count).toBe(4);
        expect(agendou.pastCount).toBe(2);
        expect(agendou.futureCount).toBe(2);
    });

    it("show-up rate is computed over agendou.pastCount, not total", () => {
        const deals = [
            // 4 scheduled: 2 past (1 showed up), 2 future
            dealAt({
                cdate: "2026-04-01T10:00:00Z",
                data_reuniao_1: "2026-04-05T10:00:00Z",
                como_foi_feita_a_1a_reuniao: "Vídeo",
            }),
            dealAt({
                cdate: "2026-04-01T10:00:00Z",
                data_reuniao_1: "2026-04-10T10:00:00Z",
            }),
            dealAt({ cdate: "2026-04-01T10:00:00Z", data_reuniao_1: "2026-04-20T10:00:00Z" }),
            dealAt({ cdate: "2026-04-01T10:00:00Z", data_reuniao_1: "2026-04-22T10:00:00Z" }),
        ];
        const j = computeJornada(deals, APRIL, "coorte", TODAY);
        const realizou = j.stages.find((s) => s.key === "realizou")!;
        expect(realizou.count).toBe(1);
        // show-up rate = 1 realizou / 2 past = 50% (NOT 1/4 = 25%)
        expect(realizou.rateFromPrev).toBe(50);
        expect(realizou.denominatorLabel).toBe("reuniões já passadas");
    });

    it("same past/future logic applies to agCloser → realizouCloser", () => {
        const deals = [
            dealAt({
                cdate: "2026-04-01T10:00:00Z",
                data_horario_agendamento_closer: "2026-04-05T10:00:00Z",
                reuniao_closer: "Vídeo",
            }),
            dealAt({
                cdate: "2026-04-01T10:00:00Z",
                data_horario_agendamento_closer: "2026-04-10T10:00:00Z",
            }),
            dealAt({
                cdate: "2026-04-01T10:00:00Z",
                data_horario_agendamento_closer: "2026-04-20T10:00:00Z",
            }),
        ];
        const j = computeJornada(deals, APRIL, "coorte", TODAY);
        const agCloser = j.stages.find((s) => s.key === "agCloser")!;
        const realizouCloser = j.stages.find((s) => s.key === "realizouCloser")!;
        expect(agCloser.pastCount).toBe(2);
        expect(agCloser.futureCount).toBe(1);
        expect(realizouCloser.count).toBe(1);
        expect(realizouCloser.rateFromPrev).toBe(50); // 1/2
    });
});

describe("structural sanity", () => {
    it("STAGE_DEFS has 7 stages in expected order", () => {
        expect(STAGE_DEFS.map((s) => s.key)).toEqual([
            "entrada", "agendou", "realizou", "qualificou",
            "agCloser", "realizouCloser", "vendeu",
        ]);
    });

    it("SUBVIEWS has 4 entries with valid stage ranges", () => {
        expect(SUBVIEWS).toHaveLength(4);
        const stageKeys = new Set(STAGE_DEFS.map((s) => s.key));
        for (const v of SUBVIEWS) {
            expect(stageKeys.has(v.stageRange[0])).toBe(true);
            expect(stageKeys.has(v.stageRange[1])).toBe(true);
        }
    });
});

describe("stage deals attachment", () => {
    it("attaches the deal objects that match each stage's predicate", () => {
        const deals = [
            dealAt({
                id: "A", cdate: "2026-04-05T10:00:00Z",
                data_reuniao_1: "2026-04-08T10:00:00Z",
                como_foi_feita_a_1a_reuniao: "Vídeo",
            }),
            dealAt({ id: "B", cdate: "2026-04-06T10:00:00Z" }),
        ];
        const j = computeJornada(deals, APRIL, "coorte", AFTER_ALL);
        expect(j.stages.find((s) => s.key === "entrada")!.deals.map((d) => d.id).sort()).toEqual(["A", "B"]);
        expect(j.stages.find((s) => s.key === "agendou")!.deals.map((d) => d.id)).toEqual(["A"]);
        expect(j.stages.find((s) => s.key === "realizou")!.deals.map((d) => d.id)).toEqual(["A"]);
    });
});

describe("targetRateBetween", () => {
    it("is the product of intermediate stage metas", () => {
        const j = computeJornada([], APRIL, "coorte", AFTER_ALL);
        // agendou meta = 45 → entrada→agendou target = 45
        expect(targetRateBetween(j.stages, "entrada", "agendou")).toBeCloseTo(45, 5);
        // agendou→agCloser: 65% * 50% * 80% = 26%
        expect(targetRateBetween(j.stages, "agendou", "agCloser")).toBeCloseTo(26, 5);
        // agCloser→vendeu: 70% * 30% = 21%
        expect(targetRateBetween(j.stages, "agCloser", "vendeu")).toBeCloseTo(21, 5);
    });

    it("returns null when range is invalid", () => {
        const j = computeJornada([], APRIL, "coorte", AFTER_ALL);
        expect(targetRateBetween(j.stages, "vendeu", "entrada")).toBeNull();
        expect(targetRateBetween(j.stages, "entrada", "entrada")).toBeNull();
    });
});

describe("bucketTimeSeries", () => {
    it("creates one daily bucket per day in the period", () => {
        const ts = bucketTimeSeries([], APRIL, "diaria");
        expect(ts.buckets).toHaveLength(30);
        expect(ts.buckets[0].start.toISOString().slice(0, 10)).toBe("2026-04-01");
        expect(ts.buckets[29].start.toISOString().slice(0, 10)).toBe("2026-04-30");
    });

    it("counts entrada by cdate per day", () => {
        const deals = [
            dealAt({ cdate: "2026-04-01T10:00:00Z" }),
            dealAt({ cdate: "2026-04-01T15:00:00Z" }),
            dealAt({ cdate: "2026-04-03T10:00:00Z" }),
        ];
        const ts = bucketTimeSeries(deals, APRIL, "diaria");
        expect(ts.buckets[0].counts.entrada).toBe(2);
        expect(ts.buckets[1].counts.entrada).toBe(0);
        expect(ts.buckets[2].counts.entrada).toBe(1);
    });

    it("counts realizou only when como_foi_feita_a_1a_reuniao is filled", () => {
        const deals = [
            dealAt({ data_reuniao_1: "2026-04-05T10:00:00Z", como_foi_feita_a_1a_reuniao: "Vídeo" }),
            dealAt({ data_reuniao_1: "2026-04-05T10:00:00Z", como_foi_feita_a_1a_reuniao: "Não teve reunião" }),
            dealAt({ data_reuniao_1: "2026-04-05T10:00:00Z" }),
        ];
        const ts = bucketTimeSeries(deals, APRIL, "diaria");
        const day5 = ts.buckets.find((b) => b.start.getDate() === 5 && b.start.getMonth() === 3)!;
        expect(day5.counts.agendou).toBe(3);
        expect(day5.counts.realizou).toBe(1);
    });

    it("weekly granularity aggregates 7-day buckets aligned to Monday", () => {
        const deals = [
            dealAt({ cdate: "2026-04-01T10:00:00Z" }), // Wed
            dealAt({ cdate: "2026-04-03T10:00:00Z" }), // Fri — same ISO week
            dealAt({ cdate: "2026-04-07T10:00:00Z" }), // Tue next week
        ];
        const ts = bucketTimeSeries(deals, APRIL, "semanal");
        // Mar 30 (Mon) — contains Apr 1 and Apr 3
        const wkA = ts.buckets.find((b) => b.counts.entrada === 2);
        const wkB = ts.buckets.find((b) => b.counts.entrada === 1);
        expect(wkA).toBeDefined();
        expect(wkB).toBeDefined();
    });

    it("monthly granularity produces one bucket for a single-month period", () => {
        const ts = bucketTimeSeries(
            [dealAt({ cdate: "2026-04-15T10:00:00Z" })],
            APRIL, "mensal",
        );
        expect(ts.buckets).toHaveLength(1);
        expect(ts.buckets[0].counts.entrada).toBe(1);
    });
});

describe("uses March period correctly", () => {
    it("isolates March from April", () => {
        const deals = [
            dealAt({ cdate: "2026-03-10T10:00:00Z" }),
            dealAt({ cdate: "2026-04-01T10:00:00Z" }),
        ];
        const m = computeJornada(deals, MARCH, "coorte", AFTER_ALL);
        const a = computeJornada(deals, APRIL, "coorte", AFTER_ALL);
        expect(m.stages[0].count).toBe(1);
        expect(a.stages[0].count).toBe(1);
    });
});
