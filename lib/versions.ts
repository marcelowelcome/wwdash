export interface VersionEntry {
    version: string;
    date: string;
    description: string;
    changes: string[];
}

export const VERSION_HISTORY: VersionEntry[] = [
    {
        version: "1.4.0",
        date: "2026-02-27",
        description: "Correção da Lógica de Casamentos Ganhos e Pipeline Closer.",
        changes: [
            "Alteração do ID do pipeline Closer de 8 para 3.",
            "Correção da inversão de status (Ganho vs Aberto) no script de sincronização.",
            "Implementação da regra global de identificação de ganho via campo '[WW] [Closer] Data-Hora Ganho'.",
            "Mapeamento direto do campo customizado 87 para persistência de data de fechamento.",
            "Recarga total de 22.000+ deals para garantir integridade histórica.",
        ],
    },
    {
        version: "1.3.0",
        date: "2026-02-27",
        description: "Revamp estrutural Aba SDR (Topo do Funil).",
        changes: [
            "Renomeação oficial da tab para 'SDR'.",
            "Módulo 2.1: Cards de KPI otimizados com MM4 visível, no-show rate e qualificação com ruleset de alertas.",
            "Módulo 2.2: Novo gráfico Híbrido exibindo Leads vs Engajados + Curva de Qualificação.",
            "Módulo 2.3: Funil visual de 5 etapas com lógica estrita de pass-through.",
            "Módulo 2.4: Painéis duplo de Motivos de Perda (Global vs Últimos 4 Meses com detecção de tendências).",
            "Módulo 2.5: Acompanhamento mensal isolado de rejeição por Taxa de Serviço.",
        ],
    },
    {
        version: "1.2.0",
        date: "2026-02-26",
        description: "Dicionário de Métricas e Auxiliares Visuais.",
        changes: [
            "Criação da página 'Dicionário' com definições detalhadas de cada métrica.",
            "Implementação de hover helpers (tooltips) em todos os KPIs e títulos de seção.",
            "Centralização das regras de cálculo e origens de dados em `metrics-definitions.ts`.",
            "Melhoria na transparência dos dados para os usuários finais.",
        ],
    },
    {
        version: "1.1.0",
        date: "2026-02-25",
        description: "Migração de infraestrutura de dados e sistema de versionamento.",
        changes: [
            "Migração da origem de dados: API do ActiveCampaign -> Supabase Database.",
            "Eliminação de problemas de CORS e dependência de proxy server-side.",
            "Implementação de sistema de versionamento e log de alterações (este log).",
            "Mapeamento automático de campos personalizados do DB para o dashboard.",
            "Melhoria na performance de carregamento inicial.",
        ],
    },
    {
        version: "1.0.0",
        date: "2026-02-19",
        description: "Lançamento inicial do Dashboard de Vendas Welcome Weddings.",
        changes: [
            "Visualização de KPIs (SDR Volume, Taxa de Qualificação, Conversão Closer).",
            "Gráficos de tendência semanal e mensal (Area e Bar charts).",
            "Análise de motivos de perda e pipeline por idade/estágio.",
            "Tema escuro personalizado (Berry/Gold/Surface).",
            "Consumo direto da API ActiveCampaign via Proxy Next.js.",
        ],
    },
];

export const CURRENT_VERSION = VERSION_HISTORY[0];
