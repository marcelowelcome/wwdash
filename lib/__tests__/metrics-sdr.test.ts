import { describe, it, expect } from "vitest";
import { computeSDRMetrics, type PeriodFilter } from "../metrics-sdr";
import { type Deal } from "../schemas";

// ─── FACTORY HELPERS ──────────────────────────────────────────────────────────

let _idCounter = 0;

function buildSDRDeal(overrides: Partial<Deal> = {}): Deal {
    return {
        id: overrides.id ?? String(++_idCounter),
        cdate: overrides.cdate ?? new Date().toISOString(),
        mdate: overrides.mdate,
        status: overrides.status ?? "1",
        stage: overrides.stage ?? "Default",
        group_id: overrides.group_id ?? "1",
        stage_id: overrides.stage_id ?? null,
        owner_id: "owner_id" in overrides ? overrides.owner_id : "owner1",
        data_fechamento: overrides.data_fechamento ?? null,
        destino: overrides.destino ?? null,
        data_reuniao_1: overrides.data_reuniao_1 ?? null,
        como_foi_feita_a_1a_reuniao: overrides.como_foi_feita_a_1a_reuniao ?? null,
        data_horario_agendamento_closer: overrides.data_horario_agendamento_closer ?? null,
        _cf: overrides._cf ?? {},
    } as Deal;
}

/** Returns an ISO date string for n days ago (at noon to avoid TZ issues). */
function daysAgoISO(n: number): string {
    const d = new Date();
    d.setDate(d.getDate() - n);
    d.setHours(12, 0, 0, 0);
    return d.toISOString();
}

/** Returns an ISO date string for a specific YYYY-MM-DD date (at noon). */
function dateISO(year: number, month: number, day: number): string {
    return new Date(year, month - 1, day, 12, 0, 0).toISOString();
}

/**
 * Returns a date string for `n` business days ago.
 * Skips weekends (Sat/Sun) going backwards.
 */
function businessDaysAgoISO(n: number): string {
    const d = new Date();
    d.setHours(12, 0, 0, 0);
    let count = 0;
    while (count < n) {
        d.setDate(d.getDate() - 1);
        const dow = d.getDay();
        if (dow !== 0 && dow !== 6) count++;
    }
    return d.toISOString();
}

/** Standard field map for SDR tests. */
function buildFieldMap(): Record<string, string> {
    return {
        "SQL": "cf_sql",
        "Motivo de Perda": "cf_motivo_perda",
    };
}

// ─── TESTS ────────────────────────────────────────────────────────────────────

describe("computeSDRMetrics — dailyTrend", () => {
    const fieldMap = buildFieldMap();

    it("groups 5 deals across 3 different days into 3 daily entries", () => {
        const deals = [
            buildSDRDeal({ cdate: daysAgoISO(3), owner_id: "sdr1" }),
            buildSDRDeal({ cdate: daysAgoISO(3), owner_id: "sdr1" }),
            buildSDRDeal({ cdate: daysAgoISO(2), owner_id: "sdr2" }),
            buildSDRDeal({ cdate: daysAgoISO(2), owner_id: "sdr2" }),
            buildSDRDeal({ cdate: daysAgoISO(1), owner_id: "sdr1" }),
        ];

        const m = computeSDRMetrics(deals, fieldMap, "4weeks");
        expect(m.dailyTrend.length).toBe(3);
    });

    it("calculates correct mql count per daily entry", () => {
        const deals = [
            buildSDRDeal({ cdate: daysAgoISO(2) }),
            buildSDRDeal({ cdate: daysAgoISO(2) }),
            buildSDRDeal({ cdate: daysAgoISO(2) }),
            buildSDRDeal({ cdate: daysAgoISO(1) }),
            buildSDRDeal({ cdate: daysAgoISO(1) }),
        ];

        const m = computeSDRMetrics(deals, fieldMap, "4weeks");
        // Sort by date to get consistent order
        const sorted = [...m.dailyTrend].sort((a, b) => a.date.localeCompare(b.date));
        expect(sorted[0].mql).toBe(3);
        expect(sorted[1].mql).toBe(2);
    });

    it("calculates taxaAgend correctly per day", () => {
        // 3 deals on same day, 2 with data_reuniao_1 set (agendado)
        const day = daysAgoISO(2);
        const deals = [
            buildSDRDeal({ cdate: day, data_reuniao_1: "2026-03-20" }),
            buildSDRDeal({ cdate: day, data_reuniao_1: "2026-03-21" }),
            buildSDRDeal({ cdate: day }),
        ];

        const m = computeSDRMetrics(deals, fieldMap, "4weeks");
        expect(m.dailyTrend.length).toBe(1);
        // 2 agendados / 3 mql = 66.67%
        expect(m.dailyTrend[0].taxaAgend).toBeCloseTo(66.67, 1);
    });

    it("groups sdrData by owner_id within each daily entry", () => {
        const day = daysAgoISO(2);
        const deals = [
            buildSDRDeal({ cdate: day, owner_id: "sdr1" }),
            buildSDRDeal({ cdate: day, owner_id: "sdr1", data_reuniao_1: "2026-03-20" }),
            buildSDRDeal({ cdate: day, owner_id: "sdr2" }),
        ];

        const m = computeSDRMetrics(deals, fieldMap, "4weeks");
        const entry = m.dailyTrend[0];
        expect(entry.sdrData.length).toBe(2);

        const sdr1 = entry.sdrData.find(s => s.ownerId === "sdr1")!;
        expect(sdr1.mql).toBe(2);
        expect(sdr1.agendamentos).toBe(1);
        expect(sdr1.taxa).toBeCloseTo(50, 0);

        const sdr2 = entry.sdrData.find(s => s.ownerId === "sdr2")!;
        expect(sdr2.mql).toBe(1);
        expect(sdr2.agendamentos).toBe(0);
        expect(sdr2.taxa).toBe(0);
    });

    it("counts loss reasons in motivoBreakdown per day", () => {
        const day = daysAgoISO(2);
        const deals = [
            buildSDRDeal({ cdate: day, status: "2", _cf: { cf_motivo_perda: "Sem orçamento" } }),
            buildSDRDeal({ cdate: day, status: "2", _cf: { cf_motivo_perda: "Sem orçamento" } }),
            buildSDRDeal({ cdate: day, status: "2", _cf: { cf_motivo_perda: "Sem interesse" } }),
            buildSDRDeal({ cdate: day }), // open, no loss reason
        ];

        const m = computeSDRMetrics(deals, fieldMap, "4weeks");
        const entry = m.dailyTrend[0];
        expect(entry.motivoBreakdown.length).toBe(2);
        // sorted desc by count
        expect(entry.motivoBreakdown[0]).toEqual({ motivo: "Sem orçamento", count: 2 });
        expect(entry.motivoBreakdown[1]).toEqual({ motivo: "Sem interesse", count: 1 });
    });

    it("flags weekend deals with isWeekend=true", () => {
        // Find the most recent Saturday
        const now = new Date();
        const daysUntilSat = (now.getDay() + 1) % 7; // days since last Saturday
        const satDaysAgo = daysUntilSat === 0 ? 7 : daysUntilSat;

        const deals = [
            buildSDRDeal({ cdate: daysAgoISO(satDaysAgo) }),
        ];

        const m = computeSDRMetrics(deals, fieldMap, "4weeks");
        // The Saturday entry should be flagged
        const satEntry = m.dailyTrend.find(d => {
            const dt = new Date(d.date + "T12:00:00");
            return dt.getDay() === 6;
        });
        if (satEntry) {
            expect(satEntry.isWeekend).toBe(true);
        }

        // Verify a weekday is NOT flagged as weekend
        // daysAgoISO(1) — if it's a weekday
        const weekdayEntry = m.dailyTrend.find(d => {
            const dt = new Date(d.date + "T12:00:00");
            return dt.getDay() >= 1 && dt.getDay() <= 5;
        });
        if (weekdayEntry) {
            expect(weekdayEntry.isWeekend).toBe(false);
        }
    });
});

describe("computeSDRMetrics — anomaly detection", () => {
    const fieldMap = buildFieldMap();

    it("returns anomaly.alert=true when recent 10 business days have much lower taxa than prev 10", () => {
        const deals: Deal[] = [];

        // 10 earlier business days: high taxa (all agendado → 100%)
        for (let i = 20; i >= 11; i--) {
            const cdate = businessDaysAgoISO(i);
            deals.push(buildSDRDeal({ cdate, data_reuniao_1: "2026-03-20" }));
            deals.push(buildSDRDeal({ cdate, data_reuniao_1: "2026-03-20" }));
        }

        // 10 recent business days: low taxa (none agendado → 0%)
        for (let i = 10; i >= 1; i--) {
            const cdate = businessDaysAgoISO(i);
            deals.push(buildSDRDeal({ cdate }));
            deals.push(buildSDRDeal({ cdate }));
        }

        const m = computeSDRMetrics(deals, fieldMap, "3months");
        expect(m.anomaly).not.toBeNull();
        expect(m.anomaly!.alert).toBe(true);
        expect(m.anomaly!.delta).toBeLessThan(-5);
        expect(m.anomaly!.prevAvg).toBeCloseTo(100, 0);
        expect(m.anomaly!.recentAvg).toBeCloseTo(0, 0);
    });

    it("returns anomaly.alert=false when all business days have similar taxa", () => {
        const deals: Deal[] = [];

        // 20 business days, each with 1 agendado out of 2 → 50%
        for (let i = 20; i >= 1; i--) {
            const cdate = businessDaysAgoISO(i);
            deals.push(buildSDRDeal({ cdate, data_reuniao_1: "2026-03-20" }));
            deals.push(buildSDRDeal({ cdate }));
        }

        const m = computeSDRMetrics(deals, fieldMap, "3months");
        expect(m.anomaly).not.toBeNull();
        expect(m.anomaly!.alert).toBe(false);
        expect(Math.abs(m.anomaly!.delta)).toBeLessThan(5);
    });

    it("returns anomaly=null when fewer than 20 business days of data", () => {
        const deals: Deal[] = [];

        // Only 10 business days
        for (let i = 10; i >= 1; i--) {
            const cdate = businessDaysAgoISO(i);
            deals.push(buildSDRDeal({ cdate }));
        }

        const m = computeSDRMetrics(deals, fieldMap, "3months");
        expect(m.anomaly).toBeNull();
    });
});

describe("computeSDRMetrics — investigation", () => {
    const fieldMap = buildFieldMap();

    it("computes volEffect and rateEffect for 7d vs prev 7d", () => {
        const deals: Deal[] = [];

        // Investigation uses last7 = [today-6 .. today] and prev7 = [today-13 .. today-7]
        // Prev 7 days (days 7-13 ago): 4 MQL/day, 2 agendado/day → taxa 50%
        for (let i = 13; i >= 7; i--) {
            for (let j = 0; j < 4; j++) {
                const agendado = j < 2;
                deals.push(buildSDRDeal({
                    cdate: daysAgoISO(i),
                    data_reuniao_1: agendado ? "2026-03-20" : null,
                    owner_id: "sdr1",
                }));
            }
        }

        // Last 7 days (days 0-6 ago): 6 MQL/day, 1 agendado/day → taxa 16.67%
        for (let i = 6; i >= 0; i--) {
            for (let j = 0; j < 6; j++) {
                const agendado = j < 1;
                deals.push(buildSDRDeal({
                    cdate: daysAgoISO(i),
                    data_reuniao_1: agendado ? "2026-03-20" : null,
                    owner_id: "sdr1",
                }));
            }
        }

        const m = computeSDRMetrics(deals, fieldMap, "4weeks");
        expect(m.investigation).not.toBeNull();
        const inv = m.investigation!;

        // last: 7 days * 6 MQL = 42, 7 agend → taxa ~16.67%
        expect(inv.last.mql).toBe(42);
        expect(inv.last.agend).toBe(7);
        expect(inv.last.taxa).toBeCloseTo(16.67, 0);

        // prev: 7 days * 4 MQL = 28, 14 agend → taxa 50%
        expect(inv.prev.mql).toBe(28);
        expect(inv.prev.agend).toBe(14);
        expect(inv.prev.taxa).toBeCloseTo(50, 0);

        // volEffect = (42 - 28) * (50 / 100) = 7
        expect(inv.volEffect).toBeCloseTo(7, 0);

        // rateEffect = 42 * ((16.67 - 50) / 100) ≈ -14
        expect(inv.rateEffect).toBeCloseTo(-14, 0);
    });

    it("sdrComp shows per-owner delta between periods", () => {
        const deals: Deal[] = [];

        // Prev 7 days (days 7-13 ago): sdr1 has 50% taxa, sdr2 has 100% taxa
        for (let i = 13; i >= 7; i--) {
            deals.push(buildSDRDeal({ cdate: daysAgoISO(i), owner_id: "sdr1", data_reuniao_1: "2026-03-20" }));
            deals.push(buildSDRDeal({ cdate: daysAgoISO(i), owner_id: "sdr1" }));
            deals.push(buildSDRDeal({ cdate: daysAgoISO(i), owner_id: "sdr2", data_reuniao_1: "2026-03-20" }));
        }

        // Last 7 days (days 0-6 ago): sdr1 has 0% taxa, sdr2 has 100% taxa
        for (let i = 6; i >= 0; i--) {
            deals.push(buildSDRDeal({ cdate: daysAgoISO(i), owner_id: "sdr1" }));
            deals.push(buildSDRDeal({ cdate: daysAgoISO(i), owner_id: "sdr2", data_reuniao_1: "2026-03-20" }));
        }

        const m = computeSDRMetrics(deals, fieldMap, "4weeks");
        expect(m.investigation).not.toBeNull();

        const sdr1 = m.investigation!.sdrComp.find(s => s.ownerId === "sdr1")!;
        expect(sdr1.taxaLast).toBeCloseTo(0, 0);
        expect(sdr1.taxaPrev).toBeCloseTo(50, 0);
        expect(sdr1.delta).toBeCloseTo(-50, 0);

        const sdr2 = m.investigation!.sdrComp.find(s => s.ownerId === "sdr2")!;
        expect(sdr2.taxaLast).toBeCloseTo(100, 0);
        expect(sdr2.taxaPrev).toBeCloseTo(100, 0);
        expect(sdr2.delta).toBeCloseTo(0, 0);
    });

    it("motivosComp shows percentage changes between periods", () => {
        const deals: Deal[] = [];

        // Prev 7 days (days 7-13): 3 lost with "Sem orçamento", 1 lost with "Sem interesse"
        deals.push(buildSDRDeal({ cdate: daysAgoISO(13), status: "2", _cf: { cf_motivo_perda: "Sem orçamento" } }));
        deals.push(buildSDRDeal({ cdate: daysAgoISO(12), status: "2", _cf: { cf_motivo_perda: "Sem orçamento" } }));
        deals.push(buildSDRDeal({ cdate: daysAgoISO(11), status: "2", _cf: { cf_motivo_perda: "Sem orçamento" } }));
        deals.push(buildSDRDeal({ cdate: daysAgoISO(10), status: "2", _cf: { cf_motivo_perda: "Sem interesse" } }));

        // Last 7 days (days 0-6): 1 lost with "Sem orçamento", 3 lost with "Sem interesse"
        deals.push(buildSDRDeal({ cdate: daysAgoISO(3), status: "2", _cf: { cf_motivo_perda: "Sem orçamento" } }));
        deals.push(buildSDRDeal({ cdate: daysAgoISO(2), status: "2", _cf: { cf_motivo_perda: "Sem interesse" } }));
        deals.push(buildSDRDeal({ cdate: daysAgoISO(1), status: "2", _cf: { cf_motivo_perda: "Sem interesse" } }));
        deals.push(buildSDRDeal({ cdate: daysAgoISO(0), status: "2", _cf: { cf_motivo_perda: "Sem interesse" } }));

        const m = computeSDRMetrics(deals, fieldMap, "4weeks");
        expect(m.investigation).not.toBeNull();

        const orcMotivo = m.investigation!.motivosComp.find(mc => mc.motivo === "Sem orçamento")!;
        // Last: 1/4 = 25%, Prev: 3/4 = 75% → delta = -50
        expect(orcMotivo.pctLast).toBeCloseTo(25, 0);
        expect(orcMotivo.pctPrev).toBeCloseTo(75, 0);
        expect(orcMotivo.delta).toBeCloseTo(-50, 0);
    });
});

describe("computeSDRMetrics — sdrRanking", () => {
    const fieldMap = buildFieldMap();

    it("ranks 3 different owners sorted by taxa desc", () => {
        const deals: Deal[] = [];
        const day = daysAgoISO(2);

        // owner1: 1 MQL, 1 agend → 100%
        deals.push(buildSDRDeal({ cdate: day, owner_id: "owner1", data_reuniao_1: "2026-03-20" }));

        // owner2: 2 MQL, 1 agend → 50%
        deals.push(buildSDRDeal({ cdate: day, owner_id: "owner2", data_reuniao_1: "2026-03-20" }));
        deals.push(buildSDRDeal({ cdate: day, owner_id: "owner2" }));

        // owner3: 3 MQL, 0 agend → 0%
        deals.push(buildSDRDeal({ cdate: day, owner_id: "owner3" }));
        deals.push(buildSDRDeal({ cdate: day, owner_id: "owner3" }));
        deals.push(buildSDRDeal({ cdate: day, owner_id: "owner3" }));

        const m = computeSDRMetrics(deals, fieldMap, "4weeks");
        expect(m.sdrRanking.length).toBe(3);
        expect(m.sdrRanking[0].ownerId).toBe("owner1");
        expect(m.sdrRanking[0].taxa).toBeCloseTo(100, 0);
        expect(m.sdrRanking[1].ownerId).toBe("owner2");
        expect(m.sdrRanking[1].taxa).toBeCloseTo(50, 0);
        expect(m.sdrRanking[2].ownerId).toBe("owner3");
        expect(m.sdrRanking[2].taxa).toBe(0);
    });

    it("groups deals with null owner_id under 'unknown'", () => {
        const day = daysAgoISO(2);
        const deals = [
            buildSDRDeal({ cdate: day, owner_id: null }),
            buildSDRDeal({ cdate: day, owner_id: null, data_reuniao_1: "2026-03-20" }),
            buildSDRDeal({ cdate: day, owner_id: "owner1" }),
        ];

        const m = computeSDRMetrics(deals, fieldMap, "4weeks");
        const unknown = m.sdrRanking.find(r => r.ownerId === "unknown");
        expect(unknown).toBeDefined();
        expect(unknown!.mql).toBe(2);
        expect(unknown!.agendamentos).toBe(1);
    });
});

describe("computeSDRMetrics — dowPattern", () => {
    const fieldMap = buildFieldMap();

    it("computes avgTaxa and avgMql per DOW for business days only", () => {
        const deals: Deal[] = [];

        // Generate deals across 4 weeks of weekdays to have multiple entries per DOW
        for (let week = 0; week < 4; week++) {
            for (let dow = 1; dow <= 5; dow++) { // Mon=1 to Fri=5
                // Find a date that falls on this DOW within the period
                const d = new Date();
                d.setHours(12, 0, 0, 0);
                const currentDow = d.getDay();
                const daysBack = (week * 7) + ((currentDow - dow + 7) % 7);
                if (daysBack === 0 && week > 0) continue;
                d.setDate(d.getDate() - daysBack);
                const cdate = d.toISOString();

                // Monday gets 2 agendados out of 4, others get 1 out of 2
                if (dow === 1) {
                    deals.push(buildSDRDeal({ cdate, data_reuniao_1: "2026-03-20" }));
                    deals.push(buildSDRDeal({ cdate, data_reuniao_1: "2026-03-20" }));
                    deals.push(buildSDRDeal({ cdate }));
                    deals.push(buildSDRDeal({ cdate }));
                } else {
                    deals.push(buildSDRDeal({ cdate, data_reuniao_1: "2026-03-20" }));
                    deals.push(buildSDRDeal({ cdate }));
                }
            }
        }

        const m = computeSDRMetrics(deals, fieldMap, "3months");

        // Should only have Mon-Fri entries
        for (const entry of m.dowPattern) {
            expect(["Seg", "Ter", "Qua", "Qui", "Sex"]).toContain(entry.dow);
        }

        // Weekend days should NOT appear
        const weekendEntries = m.dowPattern.filter(d => d.dow === "Dom" || d.dow === "Sáb");
        expect(weekendEntries.length).toBe(0);
    });

    it("excludes weekend days from dowPattern", () => {
        // Find the most recent Saturday and Sunday
        const now = new Date();
        const daysToSat = (now.getDay() + 1) % 7;
        const satDaysAgo = daysToSat === 0 ? 7 : daysToSat;
        const sunDaysAgo = satDaysAgo + 1;

        const deals = [
            buildSDRDeal({ cdate: daysAgoISO(satDaysAgo) }), // Saturday
            buildSDRDeal({ cdate: daysAgoISO(sunDaysAgo) }), // Sunday
            buildSDRDeal({ cdate: daysAgoISO(2) }),           // Weekday (probably)
        ];

        const m = computeSDRMetrics(deals, fieldMap, "4weeks");
        // No "Dom" or "Sáb" in dowPattern
        const weekendDow = m.dowPattern.filter(d => d.dow === "Dom" || d.dow === "Sáb");
        expect(weekendDow.length).toBe(0);
    });
});

describe("computeSDRMetrics — deltaVsPrev", () => {
    const fieldMap = buildFieldMap();

    it("computes dMql=100 when period has 10 MQL and previous has 5", () => {
        const deals: Deal[] = [];

        // Previous period (4weeks filter → prev 28 days is days 29-56 ago)
        for (let i = 0; i < 5; i++) {
            deals.push(buildSDRDeal({ cdate: daysAgoISO(35 + i) }));
        }
        // Current period (days 0-28 ago)
        for (let i = 0; i < 10; i++) {
            deals.push(buildSDRDeal({ cdate: daysAgoISO(5 + i) }));
        }

        const m = computeSDRMetrics(deals, fieldMap, "4weeks");
        expect(m.deltaVsPrev.dMql).toBeCloseTo(100, 0);
    });

    it("returns dMql=null when previous period has 0 MQL", () => {
        const deals: Deal[] = [];

        // Only current period deals, nothing in previous period
        for (let i = 0; i < 10; i++) {
            deals.push(buildSDRDeal({ cdate: daysAgoISO(5 + i) }));
        }

        const m = computeSDRMetrics(deals, fieldMap, "4weeks");
        expect(m.deltaVsPrev.dMql).toBeNull();
    });

    it("returns dAgend=null when previous period has 0 agendamentos", () => {
        const deals: Deal[] = [];

        // Previous period: deals without agendamento
        for (let i = 0; i < 5; i++) {
            deals.push(buildSDRDeal({ cdate: daysAgoISO(35 + i) }));
        }
        // Current period: deals with agendamento
        for (let i = 0; i < 5; i++) {
            deals.push(buildSDRDeal({ cdate: daysAgoISO(5 + i), data_reuniao_1: "2026-03-20" }));
        }

        const m = computeSDRMetrics(deals, fieldMap, "4weeks");
        expect(m.deltaVsPrev.dAgend).toBeNull();
    });

    it("computes dAgend correctly when both periods have agendamentos", () => {
        const deals: Deal[] = [];

        // Previous period: 2 agendados
        for (let i = 0; i < 2; i++) {
            deals.push(buildSDRDeal({ cdate: daysAgoISO(35 + i), data_reuniao_1: "2026-03-20" }));
        }
        // Current period: 4 agendados → +100%
        for (let i = 0; i < 4; i++) {
            deals.push(buildSDRDeal({ cdate: daysAgoISO(5 + i), data_reuniao_1: "2026-03-20" }));
        }

        const m = computeSDRMetrics(deals, fieldMap, "4weeks");
        expect(m.deltaVsPrev.dAgend).toBeCloseTo(100, 0);
    });
});

describe("computeSDRMetrics — motivosCards", () => {
    const fieldMap = buildFieldMap();

    it("returns cards sorted by count desc", () => {
        const day = daysAgoISO(2);
        const deals = [
            buildSDRDeal({ cdate: day, status: "2", _cf: { cf_motivo_perda: "Sem orçamento" } }),
            buildSDRDeal({ cdate: day, status: "2", _cf: { cf_motivo_perda: "Sem orçamento" } }),
            buildSDRDeal({ cdate: day, status: "2", _cf: { cf_motivo_perda: "Sem orçamento" } }),
            buildSDRDeal({ cdate: day, status: "2", _cf: { cf_motivo_perda: "Sem interesse" } }),
            buildSDRDeal({ cdate: day, status: "2", _cf: { cf_motivo_perda: "Sem interesse" } }),
            buildSDRDeal({ cdate: day, status: "2", _cf: { cf_motivo_perda: "Desistiu" } }),
        ];

        const m = computeSDRMetrics(deals, fieldMap, "4weeks");
        expect(m.motivosCards.length).toBe(3);
        expect(m.motivosCards[0].motivo).toBe("Sem orçamento");
        expect(m.motivosCards[0].count).toBe(3);
        expect(m.motivosCards[1].motivo).toBe("Sem interesse");
        expect(m.motivosCards[1].count).toBe(2);
        expect(m.motivosCards[2].motivo).toBe("Desistiu");
        expect(m.motivosCards[2].count).toBe(1);
    });

    it("computes pct from period total and histPct from full dataset", () => {
        // Historical deals (old, outside current period)
        const oldDeals = [
            buildSDRDeal({ cdate: daysAgoISO(100), status: "2", _cf: { cf_motivo_perda: "Sem orçamento" } }),
            buildSDRDeal({ cdate: daysAgoISO(100), status: "2", _cf: { cf_motivo_perda: "Sem orçamento" } }),
            buildSDRDeal({ cdate: daysAgoISO(100), status: "2", _cf: { cf_motivo_perda: "Sem orçamento" } }),
            buildSDRDeal({ cdate: daysAgoISO(100), status: "2", _cf: { cf_motivo_perda: "Sem interesse" } }),
        ];

        // Period deals (recent)
        const recentDeals = [
            buildSDRDeal({ cdate: daysAgoISO(2), status: "2", _cf: { cf_motivo_perda: "Sem orçamento" } }),
            buildSDRDeal({ cdate: daysAgoISO(2), status: "2", _cf: { cf_motivo_perda: "Sem interesse" } }),
            buildSDRDeal({ cdate: daysAgoISO(2), status: "2", _cf: { cf_motivo_perda: "Sem interesse" } }),
        ];

        const m = computeSDRMetrics([...oldDeals, ...recentDeals], fieldMap, "4weeks");

        const orcCard = m.motivosCards.find(c => c.motivo === "Sem orçamento")!;
        // Period: 1 out of 3 → pct ≈ 33.3%
        expect(orcCard.pct).toBeCloseTo(33.3, 0);
        // Historical: 4 out of 7 (3 old + 1 recent) → histPct ≈ 57.1%
        expect(orcCard.histPct).toBeCloseTo(57.1, 0);
        // delta = pct - histPct ≈ -23.8
        expect(orcCard.delta).toBeCloseTo(orcCard.pct - orcCard.histPct, 1);

        const intCard = m.motivosCards.find(c => c.motivo === "Sem interesse")!;
        // Period: 2 out of 3 → pct ≈ 66.7%
        expect(intCard.pct).toBeCloseTo(66.7, 0);
    });

    it("excludes 'Nao fez reuniao com a SDR' from motivosCards", () => {
        const day = daysAgoISO(2);
        const deals = [
            buildSDRDeal({ cdate: day, status: "2", _cf: { cf_motivo_perda: "Não fez reunião com a SDR" } }),
            buildSDRDeal({ cdate: day, status: "2", _cf: { cf_motivo_perda: "Sem orçamento" } }),
        ];

        const m = computeSDRMetrics(deals, fieldMap, "4weeks");
        // Only "Sem orçamento" should appear; non-engaged motive is excluded
        const nonEngaged = m.motivosCards.find(c => c.motivo === "Não fez reunião com a SDR");
        expect(nonEngaged).toBeUndefined();
        expect(m.motivosCards.length).toBe(1);
        expect(m.motivosCards[0].motivo).toBe("Sem orçamento");
    });
});

describe("computeSDRMetrics — empty inputs", () => {
    const fieldMap = buildFieldMap();

    it("returns safe defaults for all new fields when no deals provided", () => {
        const m = computeSDRMetrics([], fieldMap, "4weeks");

        expect(m.dailyTrend).toEqual([]);
        expect(m.anomaly).toBeNull();
        // investigation is always computed (may have zeros)
        expect(m.sdrRanking).toEqual([]);
        expect(m.dowPattern).toEqual([]);
        expect(m.deltaVsPrev.dMql).toBeNull();
        expect(m.deltaVsPrev.dAgend).toBeNull();
        expect(m.motivosCards).toEqual([]);
    });
});
