export interface MetricDefinition {
    label: string;
    description: string;
    origin: string;
    calculation: string;
    type: "Automática" | "Manual" | "Cálculo";
}

export const METRIC_DEFINITIONS: Record<string, MetricDefinition> = {
    sdrThisWeek: {
        label: "Volume SDR (Semana)",
        description: "Total de leads que entraram no pipeline SDR na última semana completa (Segunda a Domingo).",
        origin: "Supabase (tabela deals_sdr)",
        calculation: "Contagem de leads com cdate dentro do intervalo da semana anterior.",
        type: "Automática",
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
    },
    conv_curr: {
        label: "Conversão Closer (MM4)",
        description: "Taxa de conversão de vendas (Ganhos vs Perdidos) nos últimos 28 dias.",
        origin: "Supabase (tabela deals_closer)",
        calculation: "(Ganhos / (Ganhos + Perdidos)) * 100.",
        type: "Automática",
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
    },
    activeAlerts: {
        label: "Alertas Ativos",
        description: "Notificações automáticas sobre anomalias detectadas no funil (lead fake, qualificação baixa, contratos parados).",
        origin: "Regras de negócio (metrics.ts)",
        calculation: "Conjunto de regras: Lead Fake ≥ 15%, qualificação < 8%, contratos parados > 14 dias.",
        type: "Cálculo",
    },
};
