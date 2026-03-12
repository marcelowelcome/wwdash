import { type Metrics } from "./metrics";
import { type WonDeal } from "./schemas";

export interface ChatContextData {
    metrics: Metrics | null;
    sdrDeals: WonDeal[];
    closerDeals: WonDeal[];
    wonDeals: WonDeal[];
    fieldMap: Record<string, string>;
    stageMap: Record<string, string>;
}

function fmt(n: number | undefined | null, decimals = 1): string {
    if (n == null) return "—";
    return n.toFixed(decimals);
}

function fmtBRL(n: number | undefined | null): string {
    if (n == null) return "—";
    return `R$ ${n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function buildOverviewContext(data: ChatContextData): string {
    const { metrics: m, sdrDeals, closerDeals, wonDeals } = data;
    if (!m) return "Métricas não carregadas.";

    const lines = [
        "# Visão Geral — Dados Atuais",
        "",
        "## SDR (últimos 180 dias)",
        `- Leads esta semana: ${m.sdrThisWeek}`,
        `- Média 4 semanas anteriores: ${fmt(m.sdrAvg4)}`,
        `- Variação vs média: ${fmt(m.sdrVsAvg)}%`,
        `- Status SDR: ${m.sdrStatus}`,
        `- Taxa qualificação: ${fmt(m.qualRate)}%`,
        `- Total deals SDR no período: ${sdrDeals.length}`,
        "",
        "## Closer (últimos 365 dias)",
        `- Conversão atual (28d): ${fmt(m.conv_curr)}%`,
        `- Conversão anterior (28d): ${fmt(m.conv_prev)}%`,
        `- Status conversão: ${m.convStatus}`,
        `- Taxa histórica: ${fmt(m.histRate)}%`,
        `- Velocidade média (dias): ${fmt(m.velocity)}`,
        `- Ganhos período atual: ${m.won_curr}`,
        `- Perdidos período atual: ${m.lost_curr}`,
        `- Abertos: ${m.open_curr}`,
        `- Total deals Closer no período: ${closerDeals.length}`,
        "",
        "## Pipeline Ativo",
        `- Deals abertos no Closer: ${m.openDeals}`,
        `- Contratos enviados: ${m.sentContractsCount}`,
        `- Planejamento ativo: ${m.planActiveCount}`,
        `- Planejamento cancelado: ${m.planCancelledCount}`,
        "",
        "## Deals por idade no pipeline:",
        ...m.pipeByAge.map((p) => `  - ${p.label}: ${p.n}`),
        "",
        "## Deals por estágio:",
        ...m.pipeByStage.map((p) => `  - ${p.stage}: ${p.n}`),
        "",
        "## Motivos de perda (top):",
        ...m.lossReasons.map((r) => `  - ${r.motivo}: ${r.n} (${r.pct}%)`),
        "",
        `- Total deals ganhos (histórico): ${wonDeals.length}`,
        "",
        "## Alertas ativos:",
        ...m.activeAlerts.map((a) => `  - ${a.message}`),
    ];
    return lines.join("\n");
}

function buildSDRContext(data: ChatContextData): string {
    const { metrics: m, sdrDeals } = data;
    if (!m) return "Métricas não carregadas.";

    const lines = [
        "# SDR — Dados Atuais",
        "",
        `Total de leads (180d): ${sdrDeals.length}`,
        `Leads esta semana: ${m.sdrThisWeek}`,
        `Média 4 semanas: ${fmt(m.sdrAvg4)}`,
        `Variação: ${fmt(m.sdrVsAvg)}%`,
        `Taxa qualificação: ${fmt(m.qualRate)}% (status: ${m.qualStatus})`,
        "",
        "## Funil SDR (período completo):",
        `  Recebidos: ${m.sdrFunnel.received}`,
        `  Engajados: ${m.sdrFunnel.engaged} (${fmt(m.sdrFunnel.engagedPct)}%)`,
        `  Decididos: ${m.sdrFunnel.decided} (${fmt(m.sdrFunnel.decidedPct)}%)`,
        `  Passaram da taxa: ${m.sdrFunnel.passedTaxa} (${fmt(m.sdrFunnel.passedTaxaPct)}%)`,
        `  Qualificados: ${m.sdrFunnel.qualified} (${fmt(m.sdrFunnel.qualifiedPctFromReceived)}% do total)`,
        "",
        "## Funil SDR (última semana):",
        `  Recebidos: ${m.sdrFunnelWeekly.received}`,
        `  Engajados: ${m.sdrFunnelWeekly.engaged} (${fmt(m.sdrFunnelWeekly.engagedPct)}%)`,
        `  Decididos: ${m.sdrFunnelWeekly.decided} (${fmt(m.sdrFunnelWeekly.decidedPct)}%)`,
        `  Passaram da taxa: ${m.sdrFunnelWeekly.passedTaxa} (${fmt(m.sdrFunnelWeekly.passedTaxaPct)}%)`,
        `  Qualificados: ${m.sdrFunnelWeekly.qualified} (${fmt(m.sdrFunnelWeekly.qualifiedPctFromReceived)}%)`,
        "",
        "## No-show em reuniões:",
        `  Taxa: ${fmt(m.sdrNoShowRate)}%`,
        `  Count: ${m.sdrNoShowCount} de ${m.sdrWithMeetingCount}`,
        "",
        "## Fontes de leads (top 5):",
        ...m.sdrSourceBreakdown.map((s) => `  - ${s.fonte}: ${s.n} (${s.pct}%)`),
        "",
        "## Histórico semanal (últimas semanas):",
        ...m.sdrWeeklyHistory.slice(-8).map((w) => `  ${w.week}: ${w.leads} leads, ${w.qualified} qualificados, qualRate ${w.qualRate}%`),
    ];
    return lines.join("\n");
}

function buildCloserContext(data: ChatContextData): string {
    const { metrics: m } = data;
    if (!m) return "Métricas não carregadas.";

    const lines = [
        "# Closer — Dados Atuais",
        "",
        "## KPIs principais (janela de 28 dias = MM4)",
        `- Conversão MM4 atual: ${fmt(m.conv_curr)}%`,
        `- Conversão MM4 anterior: ${fmt(m.conv_prev)}%`,
        `- Taxa histórica (todos os períodos): ${fmt(m.histRate)}%`,
        `- Status conversão: ${m.convStatus}`,
        `- Velocidade de decisão: ${fmt(m.velocity)}% dos deals decididos no MM4 (status: ${m.velocityStatus})`,
        `- Entraram no Closer (MM4): ${m.enteredMM4}`,
        "",
        "## Período atual (últimos 28 dias)",
        `- Ganhos (Won): ${m.won_curr}`,
        `- Perdidos (Lost): ${m.lost_curr}`,
        `- Abertos (Open): ${m.open_curr}`,
        "",
        "## Tendência de conversão (janelas rolantes de 4 semanas):",
        ...m.convTrend.map((t) => `  ${t.periodo}: ${t.taxa}% (${t.won} won / ${t.lost} lost)`),
        "",
        "## Motivos de perda (últimas 4 semanas):",
        ...m.lossReasons.map((r) => `  - ${r.motivo}: ${r.n} deals (${r.pct}%)`),
        "",
        "## Análise por destino:",
        ...m.dealsByDestination.map((d) =>
            `  - ${d.destino}: ${d.total} total, ${d.won} won, ${d.lost} lost, ${d.open} open, conv ${fmt(d.rate)}%`
        ),
        "",
        "## Análise de Cohort:",
        `  Cohort Atual (14–28 dias atrás): ${m.coh1.total} total, ${m.coh1.won} won, ${m.coh1.lost} lost, ${m.coh1.open} open, taxa ${fmt(m.coh1.rate)}%`,
        `  Cohort Anterior (29–45 dias atrás): ${m.coh2.total} total, ${m.coh2.won} won, ${m.coh2.lost} lost, ${m.coh2.open} open, taxa ${fmt(m.coh2.rate)}%`,
    ];
    return lines.join("\n");
}

function buildPipelineContext(data: ChatContextData): string {
    const { metrics: m } = data;
    if (!m) return "Métricas não carregadas.";

    const lines = [
        "# Pipeline — Dados Atuais",
        "",
        `Deals abertos: ${m.openDeals}`,
        `Contratos enviados: ${m.sentContractsCount}`,
        `Planejamento ativo: ${m.planActiveCount}`,
        `Planejamento cancelado: ${m.planCancelledCount}`,
        `Status pipeline: ${m.pipelineStatus}`,
        "",
        "## Por idade:",
        ...m.pipeByAge.map((p) => `  ${p.label}: ${p.n} (${p.status})`),
        "",
        "## Por estágio:",
        ...m.pipeByStage.map((p) => `  ${p.stage}: ${p.n}`),
        "",
        "## Deals por destino:",
        ...m.dealsByDestination.slice(0, 10).map((d) => `  ${d.destino}: ${d.total}`),
    ];
    return lines.join("\n");
}

function buildContratosContext(data: ChatContextData): string {
    const { wonDeals } = data;
    const lines = [
        "# Contratos Fechados — Dados Atuais",
        "",
        `Total de contratos ganhos: ${wonDeals.length}`,
    ];

    // Destinos
    const destMap: Record<string, { count: number; totalValor: number; totalConv: number }> = {};
    wonDeals.forEach((d) => {
        const dest = d.destino || "Não informado";
        if (!destMap[dest]) destMap[dest] = { count: 0, totalValor: 0, totalConv: 0 };
        destMap[dest].count++;
        if (d.valor_fechado_em_contrato) destMap[dest].totalValor += d.valor_fechado_em_contrato;
        if (d.num_convidados) destMap[dest].totalConv += d.num_convidados;
    });

    const destEntries = Object.entries(destMap).sort(([, a], [, b]) => b.count - a.count);
    lines.push("", "## Destinos (contratos ganhos):");
    destEntries.slice(0, 10).forEach(([dest, d]) => {
        const avgValor = d.count > 0 ? d.totalValor / d.count : 0;
        const avgConv = d.count > 0 ? d.totalConv / d.count : 0;
        lines.push(`  - ${dest}: ${d.count} contratos, ticket médio ${fmtBRL(avgValor)}, média ${Math.round(avgConv)} convidados`);
    });

    // Resumo financeiro
    const totalValor = wonDeals.reduce((s, d) => s + (d.valor_fechado_em_contrato || 0), 0);
    const withValor = wonDeals.filter((d) => d.valor_fechado_em_contrato);
    const avgTicket = withValor.length > 0 ? totalValor / withValor.length : 0;
    lines.push(
        "",
        "## Resumo financeiro:",
        `  Receita total (contratos com valor): ${fmtBRL(totalValor)}`,
        `  Ticket médio: ${fmtBRL(avgTicket)}`,
        `  Contratos com valor informado: ${withValor.length} de ${wonDeals.length}`
    );

    return lines.join("\n");
}

function buildPerfilScoreContext(data: ChatContextData): string {
    const { wonDeals, closerDeals } = data;
    const lines = [
        "# Perfil & Score — Dados Atuais",
        "",
        `Deals ganhos (histórico): ${wonDeals.length}`,
        `Deals closer (365d): ${closerDeals.length}`,
    ];

    // Resumo por mês (últimos 6 meses de fechamento)
    const byMonth: Record<string, number> = {};
    wonDeals.forEach((d) => {
        if (d.data_fechamento) {
            const m = d.data_fechamento.slice(0, 7);
            byMonth[m] = (byMonth[m] || 0) + 1;
        }
    });
    const sortedMonths = Object.entries(byMonth).sort(([a], [b]) => b.localeCompare(a)).slice(0, 6);
    if (sortedMonths.length > 0) {
        lines.push("", "## Fechamentos por mês (últimos 6):");
        sortedMonths.forEach(([m, n]) => lines.push(`  ${m}: ${n} contratos`));
    }

    return lines.join("\n");
}

function buildGeneralContext(data: ChatContextData): string {
    // Contexto geral para a aba Chat — combina overview resumido
    return buildOverviewContext(data);
}

export function buildTabContext(tabId: string, data: ChatContextData): string {
    switch (tabId) {
        case "overview":
            return buildOverviewContext(data);
        case "sdr":
            return buildSDRContext(data);
        case "closer":
            return buildCloserContext(data);
        case "pipeline":
            return buildPipelineContext(data);
        case "contratos":
            return buildContratosContext(data);
        case "perfil-score":
            return buildPerfilScoreContext(data);
        case "funnel-metas":
            return buildOverviewContext(data); // Funil usa overview como base
        case "dictionary":
            return "Aba Dicionário: contém definições dos campos e métricas do dashboard. Não há dados numéricos dinâmicos nesta aba.";
        case "chat":
            return buildGeneralContext(data);
        default:
            return buildGeneralContext(data);
    }
}
