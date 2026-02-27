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

- `fetchAllDealsFromDb(pipeline: string, daysBack?: number)` — Filtra por pipeline ("SDR Weddings" ou "Closer Weddings") e data de criação.
- `fetchFieldMetaFromDb()` — Retorna mapa estático de labels para IDs internos.
- `fetchStagesFromDb()` — Retorna mapa de estágios (vazio, pois usa títulos do DB).

**Outputs esperados**

- `fetchAllDealsFromDb` → `Promise<Deal[]>` (mapeado de colunas SQL)
- `fetchFieldMetaFromDb` → `Promise<Record<string, string>>`
- `fetchStagesFromDb` → `Promise<Record<string, string>>`

**Dependências que usa**

- `lib/supabase.ts` (cliente inicializado)
- `lib/schemas.ts` (tipo `Deal`)
- Constantes: `SDR_PIPELINE`, `CLOSER_PIPELINE`, `TRAINING_MOTIVE`

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
  closerDeals: Deal[],
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

- Deals de treinamento (motivo `TRAINING_MOTIVE`) são filtrados antes de qualquer cálculo do Closer
- "Semana atual" = última segunda a domingo completa (não a semana corrente incompleta)
- Períodos de 28 dias (MM4) são calculados a partir de `daysAgo(28)`
- Todos os valores percentuais são arredondados com `toFixed(1)` e `parseFloat` antes do retorno

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
- `weekKey` normaliza para a segunda-feira da semana para agrupar corretamente

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
- `components/dashboard/OverviewTab`, `FunnelTab`, `CloserTab`, `PipelineTab`

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
| `OverviewTab.tsx` | Visão geral: KPIs, charts de volume e conversão, status grid |
| `FunnelTab.tsx` | Aba SDR: 4 KPIs, Gráfico 12 Sem. Volume/Qualificação, Funil 5 Etapas, 2 Painéis de Perda (Global vs Recente) e Tendência Taxa Mensal |
| `CloserTab.tsx` | Closer: conversão por janela, período atual, motivos de perda, cohorts |
| `PipelineTab.tsx` | Pipeline: por estágio, por idade, projeção 7 dias |

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
