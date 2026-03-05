export interface MetricDefinition {
    label: string;
    description: string;
    origin: string;
    calculation: string;
    type: "Automática" | "Manual" | "Cálculo";
    normalRange?: string;
    alertRule?: string;
}

export const METRIC_DEFINITIONS: Record<string, MetricDefinition> = {
    sdrThisWeek: {
        label: "Volume SDR (Semana)",
        description: "Total de leads que entraram no pipeline SDR na última semana completa (Segunda a Domingo).",
        origin: "Supabase (tabela deals_sdr)",
        calculation: "Contagem de leads com cdate dentro do intervalo da semana anterior.",
        type: "Automática",
        normalRange: "Acima de 35 leads/semana",
    },
    sdrAvg4: {
        label: "Média SDR (4 sem)",
        description: "Média semanal de volume de leads nas últimas 4 semanas anteriores à atual.",
        origin: "Supabase (tabela deals_sdr)",
        calculation: "Soma do volume das últimas 4 semanas dividido por 4.",
        type: "Automática",
    },
    sdrVsAvg: {
        label: "% vs Média SDR",
        description: "Comparação percentual entre o volume da semana atual e a média das últimas 4 semanas.",
        origin: "Cálculo interno",
        calculation: "(Volume Atual / Média 4 Semanas) * 100.",
        type: "Cálculo",
    },
    qualRate: {
        label: "Taxa de Qualificação",
        description: "Percentual de leads que passaram do SDR para o Closer na semana atual.",
        origin: "Supabase (Cruzamento de pipelines)",
        calculation: "(Volume Closer Semana / Volume SDR Semana) * 100.",
        type: "Cálculo",
        normalRange: "Acima de 8%",
        alertRule: "🔴 Alerta se < 8% consistente nas últimas 2 semanas",
    },
    sdrFunnelWeekly: {
        label: "Funil SDR (Última Semana)",
        description: "Detalhamento das etapas do funil SDR especificamente para a última semana completa.",
        origin: "Cálculo (metrics.ts)",
        calculation: "Filtro de deals criados na última semana e contagem por marcos (engajado, decidido, passou taxa, qualificado).",
        type: "Cálculo",
    },
    sdrSourceBreakdown: {
        label: "Principais Fontes",
        description: "Distribuição dos leads SDR pelas fontes de origem mais frequentes.",
        origin: "Campo 'WW | Fonte do lead' (AC 279)",
        calculation: "Agrupamento e contagem por valor do campo de fonte.",
        type: "Automática",
    },
    conv_curr: {
        label: "Conversão Closer (MM4)",
        description: "Taxa de conversão de vendas (Ganhos vs Perdidos) nos últimos 28 dias.",
        origin: "Supabase (tabela deals_closer)",
        calculation: "(Ganhos / (Ganhos + Perdidos)) * 100.",
        type: "Automática",
        normalRange: "Acima de 20%",
        alertRule: "🔴 Crítico se < 20%; 🟡 Atenção se < 25%",
    },
    conv_prev: {
        label: "Conversão Anterior",
        description: "Taxa de conversão de vendas no período de 28 dias imediatamente anterior ao atual.",
        origin: "Supabase (tabela deals_closer)",
        calculation: "(Ganhos Prev / (Ganhos Prev + Perdidos Prev)) * 100.",
        type: "Automática",
    },
    histRate: {
        label: "Benchmark Histórico",
        description: "Taxa de conversão vitalícia do pipeline de Closer.",
        origin: "Supabase (Histórico total)",
        calculation: "(Total Ganhos / Total Decididos) * 100.",
        type: "Automática",
    },
    velocity: {
        label: "Velocidade de Decisão",
        description: "Percentual de leads que entraram nos últimos 28 dias e já tiveram uma decisão (Ganho ou Perda).",
        origin: "Supabase / Cálculo",
        calculation: "(Decididos que entraram no MM4 / Total que entrou no MM4) * 100.",
        type: "Cálculo",
        normalRange: "Acima de 80%",
        alertRule: "🔴 Vermelho se < 60%; 🟡 Laranja se < 80%",
    },
    lossReasons: {
        label: "Motivos de Perda",
        description: "Ranking dos principais motivos informados para a perda de negócios.",
        origin: "Campo manual no ActiveCampaign / Sync Supabase",
        calculation: "Agrupamento por frequência do campo '[WW] [Closer] Motivo de Perda'.",
        type: "Manual",
    },
    pipeByAge: {
        label: "Idade do Pipeline",
        description: "Distribuição dos negócios abertos pelo tempo decorrido desde a criação.",
        origin: "Supabase (Data de criação)",
        calculation: "Hoje - Data de Criação, agrupado em faixas (0-14, 15-30, 31-60, 60+).",
        type: "Automática",
    },
    pipeByStage: {
        label: "Volume por Estágio",
        description: "Quantidade de negócios abertos em cada etapa do funil do Closer.",
        origin: "Supabase (Status do Estágio)",
        calculation: "Contagem simples por ID de estágio.",
        type: "Automática",
    },
    cohorts: {
        label: "Análise de Cohorts",
        description: "Acompanhamento do status de leads que entraram em janelas específicas de tempo.",
        origin: "Cálculo temporal",
        calculation: "Filtragem por cdate e agrupamento por status atual.",
        type: "Cálculo",
    },
    pipelineStatus: {
        label: "Saúde do Pipeline",
        description: "Indicador visual da saúde do pipeline baseado no volume de negócios estagnados (60+ dias).",
        origin: "Regra de negócio",
        calculation: "Status fica vermelho se > 30% do pipeline tem 60+ dias.",
        type: "Cálculo",
        normalRange: "Abaixo de 30% estagnado",
        alertRule: "🔴 Vermelho se > 30% estagnado",
    },
    openDeals: {
        label: "Deals em Aberto",
        description: "Total de negócios com status 'Open' no pipeline do Closer, excluindo treinamentos.",
        origin: "Supabase (tabela deals, group_id = Closer)",
        calculation: "Contagem de deals com status Open no pipeline Closer.",
        type: "Automática",
    },
    planActiveCount: {
        label: "Casamentos em Planejamento",
        description: "Negócios ganhos (com data_fechamento) que ainda estão ativos (não cancelados).",
        origin: "Supabase (tabela deals, data_fechamento não nulo)",
        calculation: "Contagem de deals com data_fechamento e status ≠ Lost.",
        type: "Automática",
    },
    planCancelledCount: {
        label: "Cancelamentos Históricos",
        description: "Negócios anteriormente ganhos que foram posteriormente cancelados (Lost).",
        origin: "Supabase (tabela deals, data_fechamento não nulo)",
        calculation: "Contagem de deals com data_fechamento e status = Lost.",
        type: "Automática",
    },
    sentContractsCount: {
        label: "Contratos Enviados",
        description: "Negócios abertos cujo estágio contém a palavra 'contrato', indicando envio de proposta.",
        origin: "Supabase (estágio do deal)",
        calculation: "Filtragem por stage.includes('contrato') entre deals abertos.",
        type: "Automática",
        alertRule: "🟡 Alerta se houver contrato(s) enviado(s) > 14 dias sem andamento",
    },
    activeAlerts: {
        label: "Alertas Ativos",
        description: "Notificações automáticas sobre anomalias detectadas no funil (lead fake, qualificação baixa, contratos parados).",
        origin: "Regras de negócio (metrics.ts)",
        calculation: "Conjunto de regras: Lead Fake ≥ 15%, qualificação < 8%, contratos parados > 14 dias.",
        type: "Cálculo",
        normalRange: "0 alertas críticos"
    },

    // ── Contratos Tab ───────────────────────────────────────────────────────
    totalContratos: {
        label: "Total de Contratos",
        description: "Quantidade total de contratos fechados (deals com data_fechamento preenchida) no período selecionado.",
        origin: "Supabase (deals com data_fechamento)",
        calculation: "Contagem de deals com data_fechamento no período.",
        type: "Automática",
    },
    receitaTotal: {
        label: "Receita Total",
        description: "Soma dos valores fechados em contrato no período selecionado.",
        origin: "Supabase (campo valor_fechado_em_contrato)",
        calculation: "SUM(valor_fechado_em_contrato) dos deals no período.",
        type: "Automática",
    },
    ticketMedio: {
        label: "Ticket Médio",
        description: "Valor médio por contrato fechado no período.",
        origin: "Cálculo interno",
        calculation: "Receita Total / Total de Contratos com valor informado.",
        type: "Cálculo",
    },
    mediaConvidados: {
        label: "Média de Convidados",
        description: "Número médio de convidados por contrato fechado.",
        origin: "Supabase (campo num_convidados)",
        calculation: "AVG(num_convidados) dos deals com valor informado.",
        type: "Automática",
    },
    tempoMedioFechamento: {
        label: "Tempo Médio de Fechamento",
        description: "Média de dias entre a criação do deal e o fechamento do contrato.",
        origin: "Cálculo (data_fechamento - cdate)",
        calculation: "AVG(data_fechamento - cdate) em dias.",
        type: "Cálculo",
        normalRange: "Abaixo de 30 dias",
        alertRule: "🔴 Acima de 60 dias",
    },
    ticketPorConvidado: {
        label: "Ticket por Convidado",
        description: "Valor médio do contrato dividido pelo total de convidados.",
        origin: "Cálculo interno",
        calculation: "Receita Total / SUM(num_convidados).",
        type: "Cálculo",
    },
};
