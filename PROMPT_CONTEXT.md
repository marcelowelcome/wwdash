# PROMPT_CONTEXT — DashWW Modules

> Use este arquivo como contexto de sistema ao usar um LLM para trabalhar em módulos específicos do projeto.
> Cole a seção relevante no prompt junto com o conteúdo do arquivo.

---

## 1. `app/api/ac/route.ts` — Proxy API ActiveCampaign

**Propósito**
Funcionar como um proxy server-side entre o browser e a API do ActiveCampaign, injetando o segredo `AC_API_KEY` sem expô-lo ao cliente.

**Arquivos do módulo**

- `app/api/ac/route.ts`

**Inputs esperados**

- Query param obrigatório: `path` (ex: `/deals`, `/dealStages`, `/dealCustomFieldMeta`)
- Demais query params são repassados diretamente para a API upstream

**Outputs esperados**

- JSON idêntico ao retornado pela API do ActiveCampaign, com status HTTP preservado
- Em erro upstream: `{ error, detail }` com status 502
- Em param faltando: `{ error }` com status 400

**Dependências que usa**

- `next/server` (`NextRequest`, `NextResponse`)
- `process.env.AC_API_KEY` (server only)
- `process.env.NEXT_PUBLIC_SITE_URL` (CORS allowlist)

**O que NÃO deve fazer**

- ❌ Transformar ou validar o shape do JSON retornado (responsabilidade de `schemas.ts`)
- ❌ Implementar lógica de negócio ou cálculo de métricas
- ❌ Expor `AC_API_KEY` em cabeçalhos de resposta ou logs visíveis ao cliente
- ❌ Aceitar métodos além de `GET` e `OPTIONS`

**Decisões técnicas já tomadas**

- `cache: "no-store"` em todas as requisições (dados em tempo real)
- CORS restrito a `NEXT_PUBLIC_SITE_URL` (não wildcard `*`)
- Erros upstream são logados com `console.error` e retornam 502

---

## 2. `lib/schemas.ts` — Schemas Zod

**Propósito**
Definir e exportar os contratos de tipo de todos os dados externos recebidos do ActiveCampaign, validando-os com Zod antes de qualquer uso.

**Arquivos do módulo**

- `lib/schemas.ts`

**Inputs esperados**

- JSON bruto (`unknown`) retornado pelo proxy `/api/ac`

**Outputs esperados**

- Tipos TypeScript inferidos: `Deal`, `CfEntry`, `DealStage`, `FieldMeta`, `Status`
- Schemas para parsing: `DealSchema`, `DealsResponseSchema`, `StagesResponseSchema`, `FieldMetaResponseSchema`

**Dependências que usa**

- `zod`

**O que NÃO deve fazer**

- ❌ Fazer chamadas de rede
- ❌ Importar módulos da aplicação (sem dependências internas)
- ❌ Conter lógica de negócio ou transformações de dados

**Decisões técnicas já tomadas**

- `Deal._cf` usa `.optional().default({})` para evitar `undefined` nos cálculos
- `meta.total` aceita `string | number` porque a API retorna string
- `Status` é uma union literal `"green" | "orange" | "red"` (nunca string genérica)

---

## 3. `lib/supabase-api.ts` — Helpers de Banco de Dados

**Propósito**
Buscar dados de deals diretamente do Supabase, mapeando as colunas do banco para o shape de `Deal` esperado pelo motor de métricas.

**Arquivos do módulo**

- `lib/supabase-api.ts`

**Inputs esperados**

- `fetchAllDealsFromDb(groupId: string, daysBack?: number)` — Filtra por group_id (SDR=1, Closer=3) e data de criação.
- `fetchWonDealsFromDb(groupId: string)` — Busca globalmente deals ganhos (com data de fechamento), ignorando o groupId para garantir completude.
- `fetchFieldMetaFromDb()` — Retorna mapa estático de labels para IDs internos, incluindo novos campos SDR (Fonte, SQL, Taxas).
- `fetchStagesFromDb()` — Retorna mapa de estágios (vazio, pois usa títulos do DB).

**Outputs esperados**

- `fetchAllDealsFromDb` → `Promise<Deal[]>` (mapeado de colunas SQL)
- `fetchWonDealsFromDb` → `Promise<Deal[]>`
- `fetchFieldMetaFromDb` → `Promise<Record<string, string>>`
- `fetchStagesFromDb` → `Promise<Record<string, string>>`

**Dependências que usa**

- `lib/supabase.ts` (cliente inicializado)
- `lib/schemas.ts` (tipo `Deal`)
- Constantes: `SDR_GROUP_ID`, `CLOSER_GROUP_ID`, `TRAINING_MOTIVE`

**O que NÃO deve fazer**

- ❌ Calcular métricas ou KPIs
- ❌ Chamar a API externa do ActiveCampaign
- ❌ Manter estado global

**Decisões técnicas já tomadas**

- Status "Won", "Open", "Lost" são convertidos para "0", "1", "2" para retrocompatibilidade.
- Campos personalizados (`motivos_qualificacao_sdr`, `motivo_perda`) são mapeados para o objeto `_cf`.
- `buildWeekLabel` é re-exportado aqui para ser usado pelo motor de métricas.

---

## 4. `lib/metrics.ts` — Motor de Métricas

**Propósito**
Função pura `computeMetrics()` que transforma arrays de deals tipados em todos os KPIs exibidos no dashboard, sem efeitos colaterais.

**Arquivos do módulo**

- `lib/metrics.ts`

**Inputs esperados**

```typescript
computeMetrics(
  sdrDeals: Deal[],
  closerDeals: Deal[], // Deals atualmente no Grupo 3
  wonDeals: Deal[],    // Deals ganhos vindos de QUALQUER grupo (visto que movem para Planning)
  fieldMap: Record<string, string>,  // fieldLabel → fieldId
  stageMap: Record<string, string>   // stageId → stageTitle
): Metrics
```

**Outputs esperados**

- Objeto `Metrics` com: `sdrThisWeek`, `sdrAvg4`, `sdrVsAvg`, `sdrStatus`, `qualRate`, `qualStatus`, `sdrWeeklyHistory`, `sdrFunnel`, `sdrQualTrend`, `sdrLossPanels`, `sdrTaxaTrend`, `sdrNoShowRate`, `sdrNoShowCount`, `sdrWithMeetingCount`, `conv_curr`, `conv_prev`, `convStatus`, `convTrend`, `histRate`, `velocity`, `velocityStatus`, `pipeByAge`, `pipeByStage`, `coh1`, `coh2`, `pipelineStatus`, etc.

**Dependências que usa**

- `lib/schemas.ts` — tipos `Deal`, `Status`
- `lib/utils.ts` — `parseDate`, `daysSince`, `weekKey`, `inRange`, `daysAgo`
- `lib/supabase-api.ts` — `TRAINING_MOTIVE`, `buildWeekLabel`

**O que NÃO deve fazer**

- ❌ Fazer chamadas de rede ou acesso ao DOM
- ❌ Modificar os arrays de entrada
- ❌ Depender de estado global ou `Date` injetada externamente (usa `new Date()` internamente como "agora")
- ❌ Renderizar JSX ou importar componentes React

**Decisões técnicas já tomadas**

- "Closer Universe": Para métricas de performance (conversão, velocidade), combinamos deals do Grupo 3 com todos os ganhos globais, garantindo que deals movidos para "Planning" (Grupo 4) continuem sendo contados.
- "Win Detection": Um deal é considerado ganho globalmente se possuir valor no campo `data_fechamento` (mapeado do AC Field 87).
- "SDR Funnel Logic": Utiliza campos específicos (`Qualificado para SQL`, `Pagamento de Taxa`) para determinar pass-through entre etapas.
- "Weekly Synchronization": KPIs e Gráficos compartilham a mesma lógica de janela temporal (semana completa iniciando no Domingo) para garantir consistência.
- Temporalidade: `wonInPeriod` utiliza estritamente `data_fechamento` para agrupar as vitórias nas janelas MM4.
- Deals de treinamento (motivo `TRAINING_MOTIVE`) são filtrados antes de qualquer cálculo do Closer.
- "Semana atual" = última domingo a sábado completa (conforme visual do chart).
- Períodos de 28 dias (MM4) são calculados a partir de `daysAgo(28)`.
- Todos os valores percentuais são arredondados com `toFixed(1)` e `parseFloat` antes do retorno.

---

## 5. `lib/utils.ts` — Utilitários

**Propósito**
Funções genéricas de data math e merging de classes CSS, reutilizáveis em qualquer camada do projeto.

**Arquivos do módulo**

- `lib/utils.ts`

**Inputs esperados**

- `cn(...inputs: ClassValue[])` — qualquer combinação de strings/objetos de classes Tailwind
- `parseDate(s?: string)` — string ISO ou `undefined`
- `daysSince(d, ref?)` — `Date | null`, opcionalmente uma data de referência
- `weekKey(d: string)` — string ISO de data
- `inRange(d, s, e)` — `Date | null` e dois limites `Date`
- `daysAgo(n: number)` — número de dias

**Outputs esperados**

- `cn` → `string` de classes merged sem conflitos Tailwind
- `parseDate` → `Date | null`
- `daysSince` → `number` (999 se null)
- `weekKey` → `string` (data da segunda-feira da semana)
- `inRange` → `boolean`
- `daysAgo` → `Date`

**Dependências que usa**

- `clsx`
- `tailwind-merge`

**O que NÃO deve fazer**

- ❌ Importar módulos da aplicação
- ❌ Ter efeitos colaterais
- ❌ Conter lógica de domínio (regras de negócio de SDR/Closer)

**Decisões técnicas já tomadas**

- `daysSince` retorna `999` para `null` para que deals sem data caiam sempre no bucket "mais velho"
- `weekKey` normaliza para o **Domingo** da semana para agrupar corretamente conforme o calendário visual.

---

## 6. `lib/supabase.ts` — Cliente Supabase

**Propósito**
Inicializar e exportar o cliente Supabase para uso em server actions, API routes e componentes client-side futuros.

**Arquivos do módulo**

- `lib/supabase.ts`

**Inputs esperados**

- `process.env.NEXT_PUBLIC_SUPABASE_URL`
- `process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY`

**Outputs esperados**

- `supabase` — instância de `SupabaseClient` pronta para uso

**Dependências que usa**

- `@supabase/supabase-js`

**O que NÃO deve fazer**

- ❌ Usar `SUPABASE_SERVICE_ROLE_KEY` neste arquivo (chave de serviço só em server actions/API routes)
- ❌ Fazer queries diretamente — apenas inicializa o client
- ❌ Suprimir erros de env ausente (lança `Error` explícito no startup)

**Decisões técnicas já tomadas**

- Usa a `ANON_KEY` (publishable key) — segura para expor no browser
- Valida variáveis de ambiente com `throw new Error` para falha rápida em tempo de build/startup

---

## 7. `components/Dashboard.tsx` — Orquestrador

**Propósito**
Componente React client-side que gerencia estado de loading/erro, coordena as chamadas de dados, executa o cálculo de métricas e renderiza o tab correto.

**Arquivos do módulo**

- `components/Dashboard.tsx`

**Inputs esperados**

- Nenhum prop externo (ponto de entrada da página)

**Outputs esperados**

- UI completa do dashboard com header, tabs de navegação e o tab view ativo

**Dependências que usa**

- `lib/supabase-api.ts` — `fetchAllDealsFromDb`, `fetchFieldMetaFromDb`, `fetchStagesFromDb`
- `lib/metrics.ts` — `computeMetrics`, `Metrics`
- `components/dashboard/theme.ts` — `T`, `statusColor`
- `components/dashboard/OverviewTab`, `JornadaTab`, `FunnelMetaTab`, `FunnelTab`, `SDRTab`, `CloserTab`, `PipelineTab`, `ContratosTab`, `PerfilScoreTab`, `DictionaryTab`, `ChatTab`

**O que NÃO deve fazer**

- ❌ Calcular métricas inline (delegado a `metrics.ts`)
- ❌ Fazer fetch direto à API do ActiveCampaign (delegado agora ao Supabase via `supabase-api.ts`)
- ❌ Conter lógica de renderização de charts (delegado aos tab components)
- ❌ Ultrapassar ~150 linhas

**Decisões técnicas já tomadas**

- `useCallback` em `loadData` para estabilizar a referência e evitar re-renders do `useEffect`
- Auto-refresh a cada 60 minutos via `setInterval`
- Erros de CORS são detectados pela mensagem e exibidos com copy específico
- `TabId` é uma union literal, não string genérica

---

## 8. `components/dashboard/` — Componentes de UI

**Propósito**
Primitivos visuais e views de tab que renderizam os dados do `Metrics` sem conter lógica de negócio.

**Arquivos do módulo**

| Arquivo | Propósito em uma frase |
|---|---|
| `theme.ts` | Paleta de cores e funções `statusColor()` / `statusIcon()` |
| `KpiCard.tsx` | Card de KPI com barra de status, valor, subtítulo e delta |
| `SectionTitle.tsx` | Cabeçalho de seção com badge de status colorido |
| `CustomTooltip.tsx` | Tooltip de recharts com estilo da marca |
| `DealsModal.tsx` | Modal de lista de deals com busca, export CSV e linhas clicáveis (abrem deal no AC) |
| `StageChart.tsx` | Time-series por etapa: picker de métricas, granularidade (diária/semanal/mensal), tipos linha/barra/área, overlay do período anterior |
| `StageDeepDive.tsx` | Modal de análise profunda por etapa: distribuição das respostas do lead (orçamento, destino, convidados, etc.) e decisões do SDR (qualificação, motivos) |
| `OverviewTab.tsx` | Visão geral: KPIs, charts de volume e conversão, status grid |
| `JornadaTab.tsx` | Jornada do Lead: 4 sub-views (Entrada e Agendamento, Reunião e Qualificação, Fechamento, Visão Completa) com MiniFunnel, toggle Coorte/Evento e Narrada/Detalhada, análise de dropout, ClosingBox com diagnóstico e sugestões |
| `FunnelMetaTab.tsx` | Funil mensal com metas, realizado e projeção |
| `FunnelTab.tsx` | Aba SDR: 4 KPIs, Gráfico 12 Sem. Volume/Qualificação, Funil 5 Etapas, 2 Painéis de Perda (Global vs Recente) e Tendência Taxa Mensal |
| `SDRTab.tsx` | Visão operacional SDR por owner com métricas semanais e motivos |
| `CloserTab.tsx` | Closer: conversão por janela, período atual, motivos de perda, cohorts |
| `PipelineTab.tsx` | Pipeline: por estágio, por idade, projeção 7 dias |
| `ContratosTab.tsx` | Lista de contratos ganhos com export CSV |
| `PerfilScoreTab.tsx` | Perfil e score do lead baseado em sinais SDR/Closer |
| `DictionaryTab.tsx` | Dicionário de métricas (consome `lib/metrics-definitions.ts`) |
| `ChatTab.tsx` | Chat IA (GPT-4o via `/api/chat`) com contexto da aba ativa |

**Inputs esperados**

- Tab views recebem `{ m: Metrics }` como único prop
- `KpiCard` recebe `{ label, value, sub?, status, delta? }`
- `SectionTitle` recebe `{ children, tag? }`
- `CustomTooltip` recebe props do recharts `{ active?, payload?, label? }`

**Outputs esperados**

- JSX renderizável, sem side effects

**Dependências que usa**

- `recharts` (AreaChart, BarChart, Bar, Cell, etc.)
- `components/dashboard/theme.ts`
- `lib/metrics.ts` (apenas o tipo `Metrics`)
- `lib/schemas.ts` (apenas o tipo `Status`)

**O que NÃO deve fazer**

- ❌ Chamar `fetch` ou qualquer função assíncrona
- ❌ Gerenciar estado próprio além de interações puramente visuais
- ❌ Importar diretamente de `lib/ac-api.ts` ou `lib/supabase.ts`
- ❌ Ultrapassar 200 linhas por arquivo

**Decisões técnicas já tomadas**

- Estilos inline com o objeto `T` da paleta centralizada (sem classes Tailwind nos charts)
- `formatter: (v: unknown) => string` no label do recharts (tipo exigido pelo recharts v3)
- Componentes declarados com `"use client"` pois usam hooks do recharts
 
 ---
 
 ## 9. Versioning System — `lib/versions.ts`
 
 **Propósito**
 Manter o histórico de evolução do projeto (Changelog) e a versão atual exibida na interface.
 
 **Arquivos do módulo**
 
 - `lib/versions.ts`
 - `components/dashboard/ChangelogModal.tsx`
 
 **Boas práticas**
 
 - Ao realizar qualquer alteração significativa, adicione uma nova entrada no topo do array `VERSION_HISTORY`.
 - Incrementar a versão seguindo `MAJOR.MINOR.PATCH`.
 - Listar alterações de forma clara em `changes`.
 
 **O que NÃO deve fazer**
 
 - ❌ Alterar versões passadas (exceto correções ortográficas).
 - ❌ Esquecer de atualizar `CURRENT_VERSION` (que aponta para `VERSION_HISTORY[0]`).
 
 ---
  ---
  
  ## 11. Jornada Engine — `lib/metrics-jornada.ts`
 
 **Propósito**
 Motor puro para a aba Jornada do Lead. Transforma `WonDeal[]` em estatísticas por 7 etapas
 do funil (entrada → agendou → realizou → qualificou → agCloser → realizouCloser → vendeu),
 com modos Coorte e Evento, split passado/futuro para agendamentos, e comparação fair (mês
 calendário, não janela deslizante) com o período anterior.
 
 **Arquivos do módulo**
 
 - `lib/metrics-jornada.ts`
 - `lib/__tests__/metrics-jornada.test.ts` (28 testes)
 - `components/dashboard/JornadaTab.tsx` (consumer)
 - `components/dashboard/StageChart.tsx` (consumer — usa `bucketTimeSeries()`)
 - `components/dashboard/StageDeepDive.tsx` (consumer)
 
 **Funções públicas principais**
 
 - `computeJornada(deals, periodo, mode, today?) → JornadaResult` — roda o funil completo
 - `computeDropout(fromStage, toStage) → DropoutAnalysis` — leads que não avançaram, por stage/status/motivo
 - `bucketTimeSeries(deals, periodo, granularity) → TimeSeries` — série temporal por etapa
 - `previousPeriod(periodo) → JornadaPeriod` — subtração calendárica de 1 mês, preservando o dia
 - `targetRateBetween(stages, from, to) → number | null` — produto das metas entre etapas
 - `sliceStages(stages, range) → StageStats[]` — recorta estágios por sub-view
 
 **Inputs esperados**
 
 - `deals: WonDeal[]` (já filtrado por pipeline WW e Elopement excluído pelo consumer)
 - `periodo: { from: Date, to: Date, label: string }` (half-open [from, to))
 - `mode: "coorte" | "evento"` — coorte conta leads criados no período; evento conta eventos que aconteceram no período
 - `today?: Date` — ponto de referência para split passado/futuro; útil para testes determinísticos
 
 **Outputs esperados**
 
 - `JornadaResult` com `periodo`, `mode`, `stages: StageStats[]`
 - Cada `StageStats` tem `count`, `rateFromPrev`, `meta`, `metaStatus`, `deals`, e opcionalmente `pastCount`/`futureCount` (apenas para estágios com timing — agendou, agCloser)
 
 **Decisões técnicas já tomadas**
 
 - Show-up rates (realizou, realizouCloser) são calculadas sobre `pastCount` da etapa anterior, não sobre o total — evita penalizar reuniões futuras agendadas como se fossem no-show
 - Modo Evento usa a data específica de cada etapa (`data_reuniao_1`, `data_qualificado`, etc.), definida em `STAGE_EVENT_DATE`
 - `previousPeriod()` subtrai 1 mês calendário, não o span em dias (01-15 abril → 01-15 março)
 - `computeDropout()` lê motivos em ordem: `motivo_desqualificacao_sdr` → `motivo_de_perda` → `ww_closer_motivo_de_perda`
 - `bucketTimeSeries()` usa ISO week (segunda) para granularidade semanal; primeiro dia do mês para mensal
 
 **O que NÃO deve fazer**
 
 - ❌ Fetch ou side effects — puro
 - ❌ Conhecer conceitos de UI (cores, componentes)
 - ❌ Usar `new Date()` sem parâmetro em código de cálculo (passar `today` explicitamente)
 
 ---
 
 ## 10. Metrics Dictionary — `lib/metrics-definitions.ts`
  
  **Propósito**
  Centralizar o conhecimento de negócio sobre o que cada métrica representa, qual sua origem técnica e como é calculada.
  
  **Arquivos do módulo**
  
  - `lib/metrics-definitions.ts`
  - `components/dashboard/MetricHelper.tsx`
  - `components/dashboard/DictionaryTab.tsx`
  
  **Inputs esperados**
  
  - Constante `METRIC_DEFINITIONS` que mapeia as keys retornadas por `computeMetrics()` para objetos de metadados.
  
  **Uso dos componentes**
  
  - `KpiCard` e `SectionTitle` aceitam opcionalmente `metricKey` para renderizar o `MetricHelper`.
  - O `MetricHelper` é um componente client-side que exibe um tooltip com as informações da métrica ao passar o mouse.
  
  **O que NÃO deve fazer**
  
  - ❌ Adicionar lógica de cálculo aqui (deve permanecer em `metrics.ts`).
  - ❌ Referenciar dados mutáveis (é uma definição estática).
