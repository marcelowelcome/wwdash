// Tests for the v2 redesign fields of `computeSDRMetrics`:
// `funnelDetailed`, `spend`, `cpl`, `missingData`, and the `mode` toggle
// (coorte / evento). The legacy 13-block shape is covered by metrics-sdr.test.ts.

import { describe, expect, it } from "vitest";
import { computeSDRMetrics, type SDROptions } from "../metrics-sdr";
import { type WonDeal, type MonthlyTarget } from "../schemas";

// ─── Factory helpers ───────────────────────────────────────────────────────

let _idCounter = 0;

function deal(overrides: Partial<WonDeal> = {}): WonDeal {
    const id = overrides.id ?? String(++_idCounter);
    return {
        id,
        cdate: overrides.cdate ?? new Date("2026-04-15T12:00:00Z").toISOString(),
        created_at: overrides.created_at ?? overrides.cdate ?? new Date("2026-04-15T12:00:00Z").toISOString(),
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
        _cf: overrides._cf ?? {},
        // WonDeal extras
        pipeline: overrides.pipeline ?? "SDR Weddings",
        pipeline_id: overrides.pipeline_id ?? null,
        title: overrides.title ?? "DW - Casal",
        is_elopement: overrides.is_elopement ?? false,
        data_qualificado: overrides.data_qualificado ?? null,
        data_closer: overrides.data_closer ?? null,
        qualificado_para_sql: overrides.qualificado_para_sql ?? null,
    } as WonDeal;
}

function fieldMap(): Record<string, string> {
    return { SQL: "cf_sql", "Motivo de Perda": "cf_loss" };
}

const period = {
    start: new Date("2026-04-20T03:00:00Z"), // 00:00 BRT
    end: new Date("2026-04-27T02:59:59.999Z"), // 23:59:59.999 BRT (Mon-Sun = 7 dias)
};

const targetsFull: MonthlyTarget = {
    month: "2026-04-01",
    pipeline_type: "wedding",
    leads: 300,
    mql: 240,
    agendamento: 80,
    reunioes: 60,
    qualificado: 40,
    closer_agendada: 30,
    closer_realizada: 25,
    vendas: 10,
    cpl: 100,
};

// ─── Lead vs MQL filter ────────────────────────────────────────────────────

describe("v2 — Lead vs MQL pipeline filtering", () => {
    it("desqualificados conta como Lead mas NÃO como MQL", () => {
        const deals = [
            deal({ id: "1", pipeline: "SDR Weddings", created_at: "2026-04-22T15:00:00Z" }),
            deal({ id: "2", pipeline: "Outros Desqualificados | Wedding", created_at: "2026-04-22T15:00:00Z" }),
            deal({ id: "3", pipeline: "WW - Internacional", created_at: "2026-04-22T15:00:00Z" }),
        ];
        const m = computeSDRMetrics(deals, fieldMap(), period);
        expect(m.funnelDetailed.lead.current).toBe(3);
        expect(m.funnelDetailed.mql.current).toBe(1); // só SDR Weddings
    });

    it("elopement (is_elopement=true) é excluído de Lead E MQL", () => {
        const deals = [
            deal({ id: "1", pipeline: "SDR Weddings", is_elopement: true, created_at: "2026-04-22T15:00:00Z" }),
            deal({ id: "2", pipeline: "SDR Weddings", is_elopement: false, created_at: "2026-04-22T15:00:00Z" }),
        ];
        const m = computeSDRMetrics(deals, fieldMap(), period);
        expect(m.funnelDetailed.lead.current).toBe(1);
        expect(m.funnelDetailed.mql.current).toBe(1);
    });

    it("title 'EW%' É incluído (decisão Marketing 06/05/2026)", () => {
        // Antes excluía; agora leads com prefixo EW são leads válidos.
        // Apenas `is_elopement === true` exclui.
        const deals = [
            deal({ id: "1", pipeline: "SDR Weddings", title: "EW - Couple A", created_at: "2026-04-22T15:00:00Z" }),
            deal({ id: "2", pipeline: "SDR Weddings", title: "DW - Couple B", created_at: "2026-04-22T15:00:00Z" }),
        ];
        const m = computeSDRMetrics(deals, fieldMap(), period);
        expect(m.funnelDetailed.lead.current).toBe(2);
    });
});

// ─── Mode = evento (default) ──────────────────────────────────────────────

describe("v2 — modo Evento (default)", () => {
    it("Agendamento conta deals com data_reuniao_1 no período (mesmo se created_at fora)", () => {
        const deals = [
            // Lead criado em março, agendou na semana 20-26/abr
            deal({
                id: "1",
                pipeline: "SDR Weddings",
                created_at: "2026-03-15T10:00:00Z",
                data_reuniao_1: "2026-04-22T15:00:00Z",
            }),
            // Lead criado na semana, mas agendou em maio
            deal({
                id: "2",
                pipeline: "SDR Weddings",
                created_at: "2026-04-22T10:00:00Z",
                data_reuniao_1: "2026-05-10T15:00:00Z",
            }),
        ];
        const m = computeSDRMetrics(deals, fieldMap(), period);
        expect(m.funnelDetailed.agendamento.current).toBe(1); // só o id=1
        expect(m.funnelDetailed.lead.current).toBe(1); // só o id=2 entrou no período
    });

    it("Reunião realizada exige como_foi_feita preenchido != 'Não teve reunião'", () => {
        const deals = [
            deal({ id: "1", pipeline: "SDR Weddings", data_reuniao_1: "2026-04-22T10:00Z", como_foi_feita_a_1a_reuniao: "Online" }),
            deal({ id: "2", pipeline: "SDR Weddings", data_reuniao_1: "2026-04-23T10:00Z", como_foi_feita_a_1a_reuniao: "Não teve reunião" }),
            deal({ id: "3", pipeline: "SDR Weddings", data_reuniao_1: "2026-04-24T10:00Z", como_foi_feita_a_1a_reuniao: "" }),
            deal({ id: "4", pipeline: "SDR Weddings", data_reuniao_1: "2026-04-25T10:00Z" }),
        ];
        const m = computeSDRMetrics(deals, fieldMap(), period);
        expect(m.funnelDetailed.agendamento.current).toBe(4);
        expect(m.funnelDetailed.realizada.current).toBe(1);
    });

    it("Qualificação conta data_qualificado no período (não SQL field)", () => {
        const deals = [
            deal({ id: "1", pipeline: "SDR Weddings", data_qualificado: "2026-04-22T10:00Z" }),
            deal({ id: "2", pipeline: "SDR Weddings", data_qualificado: "2026-05-15T10:00Z" }),
        ];
        const m = computeSDRMetrics(deals, fieldMap(), period);
        expect(m.funnelDetailed.qualificacao.current).toBe(1);
    });

    it("Agendamento Closer conta data_horario_agendamento_closer no período", () => {
        const deals = [
            deal({ id: "1", pipeline: "SDR Weddings", data_horario_agendamento_closer: "2026-04-22T15:00Z" }),
            deal({ id: "2", pipeline: "SDR Weddings", data_horario_agendamento_closer: "2026-05-10T15:00Z" }),
        ];
        const m = computeSDRMetrics(deals, fieldMap(), period);
        expect(m.funnelDetailed.agCloser.current).toBe(1);
    });
});

// ─── Mode = coorte ────────────────────────────────────────────────────────

describe("v2 — modo Coorte", () => {
    it("Lead criado no período + agendou DEPOIS do end ainda conta no Coorte", () => {
        const deals = [
            // Lead criado dentro do período, agendou em maio (depois do end)
            deal({
                id: "1",
                pipeline: "SDR Weddings",
                created_at: "2026-04-22T10:00Z",
                data_reuniao_1: "2026-05-10T15:00Z",
            }),
        ];
        const eventoM = computeSDRMetrics(deals, fieldMap(), period, { mode: "evento" });
        const coorteM = computeSDRMetrics(deals, fieldMap(), period, { mode: "coorte" });
        expect(eventoM.funnelDetailed.agendamento.current).toBe(0); // evento exige data_reuniao_1 ∈ período
        expect(coorteM.funnelDetailed.agendamento.current).toBe(1); // coorte só exige que aconteceu
    });

    it("Lead fora do período NÃO conta em Coorte mesmo que tenha agendado dentro", () => {
        const deals = [
            deal({
                id: "1",
                pipeline: "SDR Weddings",
                created_at: "2026-03-15T10:00Z", // antes do período
                data_reuniao_1: "2026-04-22T15:00Z",
            }),
        ];
        const m = computeSDRMetrics(deals, fieldMap(), period, { mode: "coorte" });
        expect(m.funnelDetailed.lead.current).toBe(0);
        expect(m.funnelDetailed.agendamento.current).toBe(0);
    });

    it("Coorte conta qualificação via data_qualificado OU SQL='Sim'", () => {
        const deals = [
            // Created in período + SQL = Sim (sem data_qualificado)
            deal({
                id: "1",
                pipeline: "SDR Weddings",
                created_at: "2026-04-22T10:00Z",
                _cf: { cf_sql: "Sim" },
            }),
            // Created in período + data_qualificado depois do end (mas presente)
            deal({
                id: "2",
                pipeline: "SDR Weddings",
                created_at: "2026-04-22T10:00Z",
                data_qualificado: "2026-05-12T10:00Z",
            }),
        ];
        const m = computeSDRMetrics(deals, fieldMap(), period, { mode: "coorte" });
        expect(m.funnelDetailed.qualificacao.current).toBe(2);
    });
});

// ─── Período anterior (mesma duração antes) ──────────────────────────────

describe("v2 — período anterior usa mesma duração antes", () => {
    it("Para período de 7 dias, anterior é os 7 dias antes do start", () => {
        const deals = [
            // Atual: 22/abr (dentro do período 20-26/abr)
            deal({ id: "1", pipeline: "SDR Weddings", created_at: "2026-04-22T10:00Z" }),
            // Anterior: 16/abr (entre 13/abr e 19/abr)
            deal({ id: "2", pipeline: "SDR Weddings", created_at: "2026-04-16T10:00Z" }),
            // Fora de qualquer um dos dois (12/abr — antes do anterior)
            deal({ id: "3", pipeline: "SDR Weddings", created_at: "2026-04-12T10:00Z" }),
        ];
        const m = computeSDRMetrics(deals, fieldMap(), period);
        expect(m.funnelDetailed.lead.current).toBe(1);
        expect(m.funnelDetailed.lead.previous).toBe(1);
    });
});

// ─── Targets prorrateados ────────────────────────────────────────────────

describe("v2 — targets prorrateados linearmente", () => {
    it("janela 7 dias em mês de 30: target = monthly × 7/30 (arredondado)", () => {
        const m = computeSDRMetrics([], fieldMap(), period, {
            targets: targetsFull,
            daysInTargetMonth: 30,
        });
        expect(m.funnelDetailed.lead.target).toBe(Math.round((300 * 7) / 30)); // 70
        expect(m.funnelDetailed.mql.target).toBe(Math.round((240 * 7) / 30)); // 56
        expect(m.funnelDetailed.agendamento.target).toBe(Math.round((80 * 7) / 30)); // 19
    });

    it("targets = null → todos os campos do funil têm target null", () => {
        const m = computeSDRMetrics([], fieldMap(), period, { targets: null });
        expect(m.funnelDetailed.lead.target).toBeNull();
        expect(m.funnelDetailed.mql.target).toBeNull();
        expect(m.funnelDetailed.agendamento.target).toBeNull();
        expect(m.funnelDetailed.realizada.target).toBeNull();
        expect(m.funnelDetailed.qualificacao.target).toBeNull();
        expect(m.funnelDetailed.agCloser.target).toBeNull();
    });
});

// ─── Spend block + CPL (Custo por Lead) + cpMql (Custo por MQL) ──────────

describe("v2 — spend, CPL (Lead) e cpMql", () => {
    it("spend.total = meta + google", () => {
        const m = computeSDRMetrics([], fieldMap(), period, {
            spend: { meta: 5200, google: 3250 },
        });
        expect(m.spend?.meta).toBe(5200);
        expect(m.spend?.google).toBe(3250);
        expect(m.spend?.total).toBe(8450);
    });

    it("CPL (Lead) e cpMql calculam corretamente quando Lead==MQL", () => {
        const deals = [
            deal({ id: "1", pipeline: "SDR Weddings", created_at: "2026-04-22T10:00Z" }),
            deal({ id: "2", pipeline: "SDR Weddings", created_at: "2026-04-23T10:00Z" }),
            deal({ id: "3", pipeline: "SDR Weddings", created_at: "2026-04-24T10:00Z" }),
            deal({ id: "4", pipeline: "SDR Weddings", created_at: "2026-04-25T10:00Z" }),
        ];
        const m = computeSDRMetrics(deals, fieldMap(), period, {
            spend: { meta: 300, google: 200 },
        });
        expect(m.funnelDetailed.lead.current).toBe(4);
        expect(m.funnelDetailed.mql.current).toBe(4);
        expect(m.cpl?.current).toBe(125); // 500 / 4 leads
        expect(m.cpMql?.current).toBe(125); // 500 / 4 mqls
    });

    it("CPL e cpMql divergem quando alguns leads NÃO viram MQL (Internacional/Desqualif)", () => {
        const deals = [
            // 4 leads válidos no SDR (também viram MQL)
            deal({ id: "1", pipeline: "SDR Weddings", created_at: "2026-04-22T10:00Z" }),
            deal({ id: "2", pipeline: "SDR Weddings", created_at: "2026-04-23T10:00Z" }),
            // 2 leads em Internacional (contam Lead, não MQL)
            deal({ id: "3", pipeline: "WW - Internacional", created_at: "2026-04-22T10:00Z" }),
            deal({ id: "4", pipeline: "Outros Desqualificados | Wedding", created_at: "2026-04-23T10:00Z" }),
        ];
        const m = computeSDRMetrics(deals, fieldMap(), period, {
            spend: { meta: 300, google: 100 },
        });
        expect(m.funnelDetailed.lead.current).toBe(4);
        expect(m.funnelDetailed.mql.current).toBe(2);
        expect(m.cpl?.current).toBe(100); // 400 / 4 leads
        expect(m.cpMql?.current).toBe(200); // 400 / 2 mqls
    });

    it("CPL e cpMql = null quando spend ausente", () => {
        const m = computeSDRMetrics([], fieldMap(), period, { spend: null });
        expect(m.cpl).toBeNull();
        expect(m.cpMql).toBeNull();
        expect(m.spend).toBeNull();
    });

    it("CPL atual = null quando Lead=0; cpMql = null quando MQL=0", () => {
        const m = computeSDRMetrics([], fieldMap(), period, {
            spend: { meta: 100, google: 100 },
        });
        expect(m.spend?.total).toBe(200);
        expect(m.cpl?.current).toBeNull(); // sem leads → cpl null
        expect(m.cpMql?.current).toBeNull(); // sem mqls → cpMql null
    });

    it("target CPL (Lead) vem de monthly_targets.cpl; cpMql sem coluna → target null", () => {
        const m = computeSDRMetrics([], fieldMap(), period, {
            spend: { meta: 100, google: 100 },
            targets: targetsFull,
        });
        expect(m.cpl?.target).toBe(100); // monthly_targets.cpl
        expect(m.cpMql?.target).toBeNull(); // sem coluna em monthly_targets
    });
});

// ─── missingData sinaliza UI ─────────────────────────────────────────────

describe("v2 — missingData sinaliza dados ausentes ao UI", () => {
    it("targets ausente → todas as etapas em targetsMissing", () => {
        const m = computeSDRMetrics([], fieldMap(), period, { targets: null });
        expect(m.missingData.targetsMissing).toEqual([
            "leads",
            "mql",
            "agendamento",
            "reunioes",
            "qualificado",
            "closer_agendada",
        ]);
    });

    it("targets parcial: lista só os campos null", () => {
        const partial: MonthlyTarget = { ...targetsFull, agendamento: 0, reunioes: 0 } as MonthlyTarget;
        // O motor trata 0 como meta válida (>= 0). Para simular ausência usaremos null cast.
        const partialNull: MonthlyTarget = { ...targetsFull, agendamento: null as unknown as number, reunioes: null as unknown as number };
        void partial; // silencia
        const m = computeSDRMetrics([], fieldMap(), period, {
            targets: partialNull,
            daysInTargetMonth: 30,
        });
        expect(m.missingData.targetsMissing).toContain("agendamento");
        expect(m.missingData.targetsMissing).toContain("reunioes");
        expect(m.missingData.targetsMissing).not.toContain("leads");
    });

    it("spend ausente → spendUnavailable=true", () => {
        const m = computeSDRMetrics([], fieldMap(), period, { spend: null });
        expect(m.missingData.spendUnavailable).toBe(true);
    });

    it("staleSync option → propagado", () => {
        const m = computeSDRMetrics([], fieldMap(), period, {
            staleSync: true,
            spend: { meta: 0, google: 0 },
        });
        expect(m.missingData.staleSync).toBe(true);
    });
});

// ─── Cada etapa retorna a lista de deals ─────────────────────────────────

describe("v2 — funnelDetailed.<stage>.deals alimenta o DealsModal", () => {
    it("lista de Lead bate com a contagem", () => {
        const deals = [
            deal({ id: "1", pipeline: "SDR Weddings", created_at: "2026-04-22T10:00Z" }),
            deal({ id: "2", pipeline: "SDR Weddings", created_at: "2026-04-23T10:00Z" }),
            deal({ id: "3", pipeline: "SDR Weddings", created_at: "2026-05-01T10:00Z" }), // fora
        ];
        const m = computeSDRMetrics(deals, fieldMap(), period);
        expect(m.funnelDetailed.lead.current).toBe(2);
        expect(m.funnelDetailed.lead.deals.map((d) => d.id).sort()).toEqual(["1", "2"]);
    });

    it("lista de Reunião realizada inclui só os com sinal válido", () => {
        const deals = [
            deal({ id: "1", pipeline: "SDR Weddings", data_reuniao_1: "2026-04-22T10:00Z", como_foi_feita_a_1a_reuniao: "Online" }),
            deal({ id: "2", pipeline: "SDR Weddings", data_reuniao_1: "2026-04-23T10:00Z", como_foi_feita_a_1a_reuniao: "Não teve reunião" }),
        ];
        const m = computeSDRMetrics(deals, fieldMap(), period);
        expect(m.funnelDetailed.realizada.deals.map((d) => d.id)).toEqual(["1"]);
    });
});

// ─── mode é eco do input ─────────────────────────────────────────────────

describe("v2 — mode é eco do input", () => {
    it("default = 'evento'", () => {
        const m = computeSDRMetrics([], fieldMap(), period);
        expect(m.mode).toBe("evento");
    });

    it("mode='coorte' propaga", () => {
        const m = computeSDRMetrics([], fieldMap(), period, { mode: "coorte" });
        expect(m.mode).toBe("coorte");
    });
});

// silencia warning de import não-usado em alguns ambientes
void ([] as SDROptions[]);
