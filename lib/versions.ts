export interface VersionEntry {
    version: string;
    date: string;
    description: string;
    changes: string[];
}

export const VERSION_HISTORY: VersionEntry[] = [
    {
        version: "2.2.0",
        date: "13/03/2026",
        description: "Sync automático AC → Supabase via Edge Function e botão de sincronização manual.",
        changes: [
            "Supabase Edge Function 'sync-deals' para sync incremental AC → Supabase (janela de 3h).",
            "pg_cron agendado a cada 2h para disparar a Edge Function automaticamente.",
            "Botão 'Sync AC' no header do dashboard para sincronização manual sob demanda.",
            "Sync route simplificada: chama Edge Function via Supabase (zero env vars extras no Vercel).",
            "Auto-refresh do dashboard após sync bem-sucedido.",
        ],
    },
    {
        version: "2.1.0",
        date: "12/03/2026",
        description: "Chat IA, correção de webhook e auditoria de dados.",
        changes: [
            "Nova aba 'Chat IA' com assistente inteligente (GPT-4o) para perguntas em linguagem natural.",
            "Chat popup flutuante em todas as abas com contexto automático da tela atual.",
            "Histórico de chat persistido em localStorage.",
            "Correção crítica no webhook: mapeamento de campos por nome (key) em vez de ID numérico.",
            "Auditoria e correção de todos os 23.578 deals no banco — ~185 campos corrigidos.",
            "Correção do getCloserStatus: deals com data_fechamento agora são sempre classificados como Won.",
        ],
    },
    {
        version: "2.0.0",
        date: "09/03/2026",
        description: "Motor de Lead Scoring, abas Perfil & Score e Contratos.",
        changes: [
            "Novo motor de lead scoring simplificado baseado em destino, convidados e orçamento.",
            "Aba 'Perfil & Score' com Score Board, Potencial por Mês e Qualidade do Funil.",
            "Aba 'Contratos' com tabela detalhada de deals fechados e tooltip interativo.",
            "Configuração de bandas A/B/C persistida em localStorage.",
        ],
    },
    {
        version: "1.6.0",
        date: "06/03/2026",
        description: "Funil de Metas com separação Wedding/Elopement e integração Ads.",
        changes: [
            "Nova aba 'Funil Metas' com tabela completa de métricas do funil de vendas.",
            "Toggle de 3 visões: Wedding (apenas casamentos), Elopement (apenas elopements), Total (combinado).",
            "Separação completa de dados Wedding e Elopement em todas as métricas.",
            "Integração de dados de Meta Ads e Google Ads com cards de spend, clicks e CPM (em progresso).",
            "Cálculo automático de CPL baseado no investimento total e leads gerados.",
            "Cards de taxas de conversão (CVR) entre cada etapa do funil.",
            "Comparação com período anterior e metas planejadas.",
            "Modal de drill-down para visualizar deals de cada etapa.",
            "Nova logo Welcome Weddings no header do dashboard.",
        ],
    },
    {
        version: "1.5.0",
        date: "02/03/2026",
        description: "Refinamento SDR: Funil Semanal e métricas sincronizadas.",
        changes: [
            "Funil SDR agora exibe a última semana completa por padrão.",
            "Sincronização total entre cards de KPI e baldes do gráfico (início no domingo).",
            "Incorporação de novos campos: Fonte do Lead, Qualificação SQL e Status de Taxa.",
            "Anotação de picos históricos (Ago/24 e Jan/25) no gráfico de taxa de serviço.",
            "Aumento da janela histórica de deals SDR para 180 dias.",
        ],
    },
    {
        version: "1.4.0",
        date: "27/02/2026",
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
        date: "27/02/2026",
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
        date: "26/02/2026",
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
        date: "25/02/2026",
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
        date: "19/02/2026",
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
