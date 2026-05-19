// Tests for `computeCloserMetrics` (lib/metrics-closer.ts).
//
// Cobre: funil 3 etapas (agendada, realizada, contrato), modos coorte/evento,
// CAC/CPL, tempo até fechamento, cohort de fechamento (3 baldes), comparação
// previousCohortPctFechouSameDay, motivos de perda, missingData.

import { describe, expect, it } from "vitest";
import { computeCloserMetrics, type CloserOptions } from "../metrics-closer";
import type { WonDeal, MonthlyTarget } from "../schemas";

let _idCounter = 0;

function deal(overrides: Partial<WonDeal> = {}): WonDeal {
    const id = overrides.id ?? String(++_idCounter);
    return {
        id,
        cdate: overrides.cdate ?? "2026-04-15T12:00:00Z",
        created_at: overrides.created_at ?? overrides.cdate ?? "2026-04-15T12:00:00Z",
        mdate: overrides.mdate,
        status: overrides.status ?? "1",
        stage: overrides.stage ?? "Default",
        group_id: overrides.group_id ?? "3",
        stage_id: overrides.stage_id ?? null,
        owner_id: overrides.owner_id ?? "owner1",
        data_fechamento: overrides.data_fechamento ?? null,
        destino: overrides.destino ?? null,
        data_reuniao_1: overrides.data_reuniao_1 ?? null,
        como_foi_feita_a_1a_reuniao: overrides.como_foi_feita_a_1a_reuniao ?? null,
        data_horario_agendamento_closer: overrides.data_horario_agendamento_closer ?? null,
        _cf: overrides._cf ?? {},
        pipeline: overrides.pipeline ?? "Closer Weddings",
        pipeline_id: overrides.pipeline_id ?? null,
        title: overrides.title ?? "DW - Casal",
        is_elopement: overrides.is_elopement ?? false,
        data_qualificado: overrides.data_qualificado ?? null,
        tipo_reuniao_closer: overrides.tipo_reuniao_closer ?? null,
        ww_closer_motivo_de_perda: overrides.ww_closer_motivo_de_perda ?? null,
    } as WonDeal;
}

function fieldMap(): Record<string, string> {
    return { SQL: "cf_sql", "Motivo de Perda": "cf_loss" };
}

const period = {
    start: new Date("2026-04-01T03:00:00Z"),
    end: new Date("2026-04-30T02:59:59.999Z"),
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
    closer_realizada: 24,
    vendas: 12,
    cpl: 100,
};

// ─── Funil 3 etapas — Modo Evento (default) ────────────────────────────────

describe("computeCloserMetrics — funil modo Evento", () => {
    it("Reunião Agendada conta deals com data_closer no período + escopo MQL", () => {
        const deals = [
            deal({ id: "1", pipeline: "Closer Weddings", data_horario_agendamento_closer: "2026-04-15T15:00:00Z" }),
            deal({ id: "2", pipeline: "SDR Weddings", data_horario_agendamento_closer: "2026-04-20T15:00:00Z" }),
            // Fora do período
            deal({ id: "3", pipeline: "Closer Weddings", data_horario_agendamento_closer: "2026-05-01T15:00:00Z" }),
            // Não-MQL (Internacional)
            deal({ id: "4", pipeline: "WW - Internacional", data_horario_agendamento_closer: "2026-04-15T15:00:00Z" }),
            // Sem data_closer
            deal({ id: "5", pipeline: "Closer Weddings" }),
        ];
        const m = computeCloserMetrics(deals, fieldMap(), period);
        expect(m.funnelDetailed.agendada.current).toBe(2);
    });

    it("Reunião Realizada exige realizouCloser (tipo_reuniao_closer não-vazio e ≠ 'Não teve reunião')", () => {
        const deals = [
            // Realizada (Vídeo)
            deal({ id: "1", pipeline: "Closer Weddings", data_horario_agendamento_closer: "2026-04-15T15:00:00Z", tipo_reuniao_closer: "Vídeo" }),
            // Realizada (Presencial)
            deal({ id: "2", pipeline: "Closer Weddings", data_horario_agendamento_closer: "2026-04-15T15:00:00Z", tipo_reuniao_closer: "Presencial" }),
            // NÃO realizada — vazio
            deal({ id: "3", pipeline: "Closer Weddings", data_horario_agendamento_closer: "2026-04-15T15:00:00Z", tipo_reuniao_closer: "" }),
            // NÃO realizada — null
            deal({ id: "4", pipeline: "Closer Weddings", data_horario_agendamento_closer: "2026-04-15T15:00:00Z", tipo_reuniao_closer: null }),
            // NÃO realizada — "Não teve reunião"
            deal({ id: "5", pipeline: "Closer Weddings", data_horario_agendamento_closer: "2026-04-15T15:00:00Z", tipo_reuniao_closer: "Não teve reunião" }),
        ];
        const m = computeCloserMetrics(deals, fieldMap(), period);
        expect(m.funnelDetailed.agendada.current).toBe(5);
        expect(m.funnelDetailed.realizada.current).toBe(2);
    });

    it("Contrato conta deals com data_fechamento no período (regra canônica isClosedWwContract)", () => {
        // Regra: data_fechamento ∈ período + pipeline WW válido + sinal de funil
        // (data_qualificado OR data_horario_agendamento_closer).
        const deals = [
            // OK — Closer Weddings + data_qualificado preenchida
            deal({ id: "1", pipeline: "Closer Weddings", data_qualificado: "2026-04-20T15:00:00Z", data_fechamento: "2026-04-25T15:00:00Z" }),
            // OK — SDR Weddings + data_closer preenchida
            deal({ id: "2", pipeline: "SDR Weddings", data_horario_agendamento_closer: "2026-04-25T15:00:00Z", data_fechamento: "2026-04-29T15:00:00Z" }),
            // Fora do período
            deal({ id: "3", pipeline: "Closer Weddings", data_qualificado: "2026-04-01T15:00:00Z", data_fechamento: "2026-05-01T15:00:00Z" }),
            // Sem data_fechamento
            deal({ id: "4", pipeline: "Closer Weddings", data_qualificado: "2026-04-20T15:00:00Z", data_fechamento: null }),
            // Internacional (não é MQL/post-sales) — rejeitado pela whitelist
            deal({ id: "5", pipeline: "WW - Internacional", data_qualificado: "2026-04-20T15:00:00Z", data_fechamento: "2026-04-25T15:00:00Z" }),
            // SEM sinal de funil → rejeitado (deal criado direto sem passar pelo SDR)
            deal({ id: "6", pipeline: "Closer Weddings", data_fechamento: "2026-04-25T15:00:00Z" }),
        ];
        const m = computeCloserMetrics(deals, fieldMap(), period);
        expect(m.funnelDetailed.contrato.current).toBe(2); // ids 1 e 2
    });

    it("Contrato em pipeline pós-venda WW conta (Convidados, Gestão, Produção)", () => {
        // Regra de 2026-05-06: deal que passou pelo funil e fechou é movido
        // para pós-venda. Pipeline atual = pós-venda + sinal de funil = contrato.
        const deals = [
            deal({ id: "1", pipeline: "Convidados", data_qualificado: "2026-04-10T15:00:00Z", data_fechamento: "2026-04-25T15:00:00Z" }),
            deal({ id: "2", pipeline: "Convidados - Michelly", data_horario_agendamento_closer: "2026-04-15T15:00:00Z", data_fechamento: "2026-04-26T15:00:00Z" }),
            deal({ id: "3", pipeline: "Produção", data_qualificado: "2026-04-12T15:00:00Z", data_fechamento: "2026-04-28T15:00:00Z" }),
            // Sem sinal de funil — rejeitado (deal criado direto em Convidados)
            deal({ id: "4", pipeline: "Convidados", data_fechamento: "2026-04-25T15:00:00Z" }),
            // Trips — fora da whitelist
            deal({ id: "5", pipeline: "Consultoras TRIPS", data_qualificado: "2026-04-10T15:00:00Z", data_fechamento: "2026-04-25T15:00:00Z" }),
        ];
        const m = computeCloserMetrics(deals, fieldMap(), period);
        expect(m.funnelDetailed.contrato.current).toBe(3); // ids 1, 2, 3
    });
});

// ─── Modo Coorte ────────────────────────────────────────────────────────────

describe("computeCloserMetrics — modo Coorte", () => {
    it("Coorte: contrato conta deals criados no período que JÁ fecharam (mesmo após end)", () => {
        // Fixtures com sinal de funil (data_qualificado) — regra canônica.
        const deals = [
            // Criado em abril, fechou em abril → conta em ambos os modos
            deal({ id: "1", pipeline: "Closer Weddings", created_at: "2026-04-10T15:00:00Z", data_qualificado: "2026-04-12T15:00:00Z", data_fechamento: "2026-04-20T15:00:00Z" }),
            // Criado em abril, fechou em maio (fora do período) → SÓ Coorte conta
            deal({ id: "2", pipeline: "Closer Weddings", created_at: "2026-04-15T15:00:00Z", data_qualificado: "2026-04-18T15:00:00Z", data_fechamento: "2026-05-15T15:00:00Z" }),
            // Criado em março, fechou em abril → SÓ Evento conta (created_at fora)
            deal({ id: "3", pipeline: "Closer Weddings", created_at: "2026-03-15T15:00:00Z", data_qualificado: "2026-03-20T15:00:00Z", data_fechamento: "2026-04-25T15:00:00Z" }),
        ];
        const evento = computeCloserMetrics(deals, fieldMap(), period, { mode: "evento" });
        expect(evento.funnelDetailed.contrato.current).toBe(2); // ids 1 e 3
        const coorte = computeCloserMetrics(deals, fieldMap(), period, { mode: "coorte" });
        expect(coorte.funnelDetailed.contrato.current).toBe(2); // ids 1 e 2
    });
});

// ─── Taxas e CAC/CPL ───────────────────────────────────────────────────────

describe("computeCloserMetrics — taxas e custos", () => {
    it("rates: comparecimento, closeRate, mqlToContract calculados corretamente", () => {
        const deals = [
            // 4 leads MQL — todos created in period
            deal({ id: "1", pipeline: "Closer Weddings", data_horario_agendamento_closer: "2026-04-10T15:00:00Z", tipo_reuniao_closer: "Vídeo", data_fechamento: "2026-04-20T15:00:00Z" }),
            deal({ id: "2", pipeline: "Closer Weddings", data_horario_agendamento_closer: "2026-04-12T15:00:00Z", tipo_reuniao_closer: "Vídeo" }),
            deal({ id: "3", pipeline: "Closer Weddings", data_horario_agendamento_closer: "2026-04-14T15:00:00Z", tipo_reuniao_closer: "Não teve reunião" }),
            deal({ id: "4", pipeline: "Closer Weddings" }),
        ];
        const m = computeCloserMetrics(deals, fieldMap(), period);
        // Agendada=3, Realizada=2, Contrato=1, MQL=4
        expect(m.funnelDetailed.agendada.current).toBe(3);
        expect(m.funnelDetailed.realizada.current).toBe(2);
        expect(m.funnelDetailed.contrato.current).toBe(1);
        expect(m.mqlCount).toBe(4);
        expect(m.rates.comparecimento).toBeCloseTo(66.7, 1); // 2/3
        expect(m.rates.closeRate).toBe(50.0); // 1/2
        expect(m.rates.mqlToContract).toBe(25.0); // 1/4
    });

    it("CAC = spend / contratos; CPL = spend / leads (com Elopment incluso em Lead)", () => {
        const deals = [
            // 1 contrato — pipeline WW + sinal de funil + data_fechamento
            deal({ id: "1", pipeline: "Closer Weddings", data_qualificado: "2026-04-15T15:00:00Z", data_fechamento: "2026-04-20T15:00:00Z" }),
            // 2 leads MQL adicionais
            deal({ id: "2", pipeline: "SDR Weddings" }),
            deal({ id: "3", pipeline: "Closer Weddings" }),
            // 1 lead Elopment (entra como Lead, não MQL)
            deal({ id: "4", pipeline: "Elopment Wedding" }),
        ];
        const opts: CloserOptions = {
            spend: { meta: 800, google: 200 }, // total 1000
        };
        const m = computeCloserMetrics(deals, fieldMap(), period, opts);
        expect(m.leadCount).toBe(4); // todos os WW + Elopment
        expect(m.mqlCount).toBe(3); // sem Elopment
        expect(m.cac?.current).toBe(1000); // 1000 / 1 contrato
        expect(m.cpl?.current).toBe(250); // 1000 / 4 leads
    });

    it("CAC = null quando não há contratos fechados (denominador zero)", () => {
        const deals = [deal({ id: "1", pipeline: "Closer Weddings" })];
        const m = computeCloserMetrics(deals, fieldMap(), period, { spend: { meta: 500, google: 0 } });
        expect(m.cac?.current).toBeNull();
        expect(m.cpl?.current).toBe(500); // 500 / 1
    });
});

// ─── Targets prorrateados ──────────────────────────────────────────────────

describe("computeCloserMetrics — targets prorrateados", () => {
    it("targets do funil prorrateados pelos dias do período", () => {
        const deals: WonDeal[] = [];
        const m = computeCloserMetrics(deals, fieldMap(), period, {
            targets: targetsFull,
            daysInTargetMonth: 30,
        });
        // O período tem ~29 dias UTC (1/4 03:00 → 30/4 02:59:59) — fórmula
        // arredonda para 29 dias × monthly / 30.
        expect(m.funnelDetailed.agendada.target).toBe(29); // 30 * 29/30
        expect(m.funnelDetailed.realizada.target).toBe(23); // 24 * 29/30 = 23.2 → 23
        expect(m.funnelDetailed.contrato.target).toBe(12); // 12 * 29/30 = 11.6 → 12
    });

    it("daysElapsedInPeriod sobrescreve cálculo (modo calendário)", () => {
        const deals: WonDeal[] = [];
        const m = computeCloserMetrics(deals, fieldMap(), period, {
            targets: targetsFull,
            daysInTargetMonth: 30,
            daysElapsedInPeriod: 6, // só 6 dias passaram
        });
        // 6/30 = 20% das metas mensais
        expect(m.funnelDetailed.agendada.target).toBe(6); // 30 * 6/30
        expect(m.funnelDetailed.contrato.target).toBe(2); // 12 * 6/30 = 2.4 → 2
    });
});

// ─── Tempo até fechamento ───────────────────────────────────────────────────

describe("computeCloserMetrics — tempo até fechamento", () => {
    it("calcula média de dias entre created_at e data_fechamento dos contratos fechados no período", () => {
        const deals = [
            // 10 dias — contrato válido (sinal de funil)
            deal({ id: "1", pipeline: "Closer Weddings", created_at: "2026-04-01T00:00:00Z", data_qualificado: "2026-04-05T00:00:00Z", data_fechamento: "2026-04-11T00:00:00Z" }),
            // 20 dias — contrato válido (sinal de funil)
            deal({ id: "2", pipeline: "Closer Weddings", created_at: "2026-04-05T00:00:00Z", data_qualificado: "2026-04-10T00:00:00Z", data_fechamento: "2026-04-25T00:00:00Z" }),
            // Não fechou — não conta
            deal({ id: "3", pipeline: "Closer Weddings" }),
        ];
        const m = computeCloserMetrics(deals, fieldMap(), period);
        expect(m.tempoFechamento.dias).toBe(15); // (10+20)/2
        expect(m.tempoFechamento.n).toBe(2);
    });

    it("dias = null quando não há contratos fechados no período", () => {
        const m = computeCloserMetrics([], fieldMap(), period);
        expect(m.tempoFechamento.dias).toBeNull();
        expect(m.tempoFechamento.n).toBe(0);
    });
});

// ─── Cohort de Fechamento ──────────────────────────────────────────────────

describe("computeCloserMetrics — cohort de fechamento", () => {
    it("classifica leads em fechou / aberto / perdeu (sem overlap)", () => {
        const deals = [
            // Fechou — pipeline WW + sinal de funil + data_fechamento (isClosedWwContract OK)
            deal({ id: "1", pipeline: "Closer Weddings", data_qualificado: "2026-04-15T15:00:00Z", data_fechamento: "2026-04-20T15:00:00Z" }),
            deal({ id: "2", pipeline: "SDR Weddings", data_horario_agendamento_closer: "2026-04-15T15:00:00Z", data_fechamento: "2026-04-22T15:00:00Z" }),
            // Perdeu (status="2", sem data_fechamento)
            deal({ id: "3", pipeline: "Closer Weddings", status: "2" }),
            // Em aberto (status="1", sem data_fechamento)
            deal({ id: "4", pipeline: "Closer Weddings", status: "1" }),
            deal({ id: "5", pipeline: "Closer Weddings", status: "1" }),
            deal({ id: "6", pipeline: "Closer Weddings", status: "1" }),
            // Inclui Elopment na coorte (conta como Lead)
            deal({ id: "7", pipeline: "Elopment Wedding", status: "1" }),
        ];
        const m = computeCloserMetrics(deals, fieldMap(), period);
        expect(m.cohortFechamento.total).toBe(7);
        expect(m.cohortFechamento.fechou.count).toBe(2);
        expect(m.cohortFechamento.perdeu.count).toBe(1);
        expect(m.cohortFechamento.aberto.count).toBe(4);
        // total = soma dos 3 baldes
        const sum =
            m.cohortFechamento.fechou.count +
            m.cohortFechamento.perdeu.count +
            m.cohortFechamento.aberto.count;
        expect(sum).toBe(m.cohortFechamento.total);
        // pcts batem
        expect(m.cohortFechamento.fechou.pct).toBeCloseTo(28.6, 1);
    });

    it("previousCohortPctFechouSameDay é null quando o range não estende ao futuro", () => {
        const deals = [
            deal({ id: "1", pipeline: "Closer Weddings", data_fechamento: "2026-04-20T15:00:00Z" }),
        ];
        // Range que termina antes ou em now (sem futuro) → null
        const m = computeCloserMetrics(deals, fieldMap(), period);
        expect(m.cohortFechamento.previousCohortPctFechouSameDay).toBeNull();
    });
});

// ─── Motivos de perda ───────────────────────────────────────────────────────

describe("computeCloserMetrics — lossReasons", () => {
    it("agrega motivos de perda dos deals MQL Lost no período (top 8)", () => {
        const deals = [
            // 3 deals com motivo "Preço"
            deal({ id: "1", pipeline: "Closer Weddings", status: "2", data_fechamento: null, ww_closer_motivo_de_perda: "Preço", created_at: "2026-04-15T00:00:00Z" }),
            deal({ id: "2", pipeline: "Closer Weddings", status: "2", data_fechamento: null, ww_closer_motivo_de_perda: "Preço", created_at: "2026-04-15T00:00:00Z" }),
            deal({ id: "3", pipeline: "Closer Weddings", status: "2", data_fechamento: null, ww_closer_motivo_de_perda: "Preço", created_at: "2026-04-15T00:00:00Z" }),
            // 1 deal com motivo "Data"
            deal({ id: "4", pipeline: "Closer Weddings", status: "2", data_fechamento: null, ww_closer_motivo_de_perda: "Data", created_at: "2026-04-15T00:00:00Z" }),
            // Won — não conta
            deal({ id: "5", pipeline: "Closer Weddings", status: "0", data_fechamento: "2026-04-20T00:00:00Z", ww_closer_motivo_de_perda: "Preço", created_at: "2026-04-15T00:00:00Z" }),
            // Open — não conta
            deal({ id: "6", pipeline: "Closer Weddings", status: "1", ww_closer_motivo_de_perda: "Preço", created_at: "2026-04-15T00:00:00Z" }),
        ];
        const m = computeCloserMetrics(deals, fieldMap(), period);
        expect(m.lossReasons.length).toBe(2);
        expect(m.lossReasons[0]).toEqual({ motivo: "Preço", n: 3, pct: 75 });
        expect(m.lossReasons[1]).toEqual({ motivo: "Data", n: 1, pct: 25 });
    });
});

// ─── missingData ───────────────────────────────────────────────────────────

describe("computeCloserMetrics — missingData", () => {
    it("targets ausentes → missingData.targets lista campos", () => {
        const m = computeCloserMetrics([], fieldMap(), period); // sem options.targets
        expect(m.missingData.targetsMissing).toEqual([
            "closer_agendada",
            "closer_realizada",
            "vendas",
        ]);
    });

    it("spend ausente → cac null + missingData.spendUnavailable true", () => {
        const m = computeCloserMetrics([], fieldMap(), period); // sem spend
        expect(m.cac).toBeNull();
        expect(m.cpl).toBeNull();
        expect(m.missingData.spendUnavailable).toBe(true);
    });

    it("staleSync e spendPartial propagados", () => {
        const m = computeCloserMetrics([], fieldMap(), period, {
            spend: { meta: 100, google: 0 },
            spendPartial: true,
            staleSync: true,
        });
        expect(m.missingData.spendUnavailable).toBe(true); // partial → marca como unavailable
        expect(m.missingData.staleSync).toBe(true);
    });
});
