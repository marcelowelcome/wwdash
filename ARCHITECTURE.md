# Architecture — DashWW (Welcome Weddings Sales Dashboard)

## Overview

Single-page Next.js 16 application that reads data from **Supabase** (synced from ActiveCampaign), computes sales funnel metrics, and renders them in a tabbed dashboard.

---

## Modules

### Database Layer — `lib/supabase-api.ts`

Async functions (`fetchAllDealsFromDb`, `fetchFieldMetaFromDb`, `fetchStagesFromDb`) that query Supabase tables, map columns to the `Deal` schema, and return typed objects. This replaces the legacy ActiveCampaign API helpers.

### Metrics Engine — `lib/metrics.ts`

Pure function `computeMetrics()` that receives typed deal arrays and returns all KPIs (SDR volume, qualification rate, conversion, velocity, pipeline health, cohorts, loss reasons). Has zero side effects.

### Jornada Engine — `lib/metrics-jornada.ts`

Pure function `computeJornada()` that transforms `WonDeal[]` into stats por 7 etapas do funil (entrada → agendou → realizou → qualificou → agCloser → realizouCloser → vendeu), com modos Coorte e Evento, split passado/futuro para estágios de agendamento, e comparação por período anterior via subtração calendárica. Inclui helpers `computeDropout()`, `bucketTimeSeries()`, `targetRateBetween()`, `previousPeriod()`. Zero side effects.

### Utilities — `lib/utils.ts`

Date helpers (`parseDate`, `weekKey`, `inRange`, `daysAgo`, `daysSince`) and the `cn()` class-merging utility used across components.

### Supabase Client — `lib/supabase.ts`

Initialised Supabase client for all database operations. Validates env vars at startup.

---

### UI — Theme — `components/dashboard/theme.ts`

Centralised colour palette (`T`) and `statusColor()` / `statusIcon()` helpers. Single source of truth for all visual tokens.

### UI — Shared Components

| File | Responsibility |
|---|---|
| `KpiCard.tsx` | Renders a single KPI tile with status colour, value, and delta |
| `SectionTitle.tsx` | Section heading with optional colour-coded status badge |
| `CustomTooltip.tsx` | Recharts tooltip with branded styling |
| `DealsModal.tsx` | Lista filtrável/searchable de deals com export CSV; linhas clicáveis abrem o deal no ActiveCampaign |
| `StageChart.tsx` | Time-series por etapa com picker de métrica, granularidade e overlay do período anterior |
| `StageDeepDive.tsx` | Modal de análise profunda por etapa: respostas do lead e decisões do SDR |

### UI — Tab Views

| File | Responsibility |
|---|---|
| `OverviewTab.tsx` | KPI row + SDR/Conversion charts + consolidated status grid |
| `JornadaTab.tsx` | Jornada do Lead: 4 sub-views (Entrada e Agendamento, Reunião e Qualificação, Fechamento, Visão Completa). Inclui MiniFunnel horizontal com 7 etapas, toggle Coorte/Evento, toggle Narrada/Detalhada, StageChart por sub-view, análise de dropout entre etapas e ClosingBox com diagnóstico e sugestões |
| `FunnelMetaTab.tsx` | Funil mensal com metas, realizado e projeção |
| `FunnelTab.tsx` | Aba SDR: 4 KPIs sincronizados, Gráfico 12 Sem. Volume/Qualificação, Funil da última semana completa, Distribuição de Fontes, Motivos de Perda e Tendência Taxa Mensal |
| `SDRTab.tsx` | Visão operacional SDR por ownerId com métricas semanais e motivos |
| `CloserTab.tsx` | 4-week conversion windows, period breakdown, loss reasons, cohort analysis |
| `PipelineTab.tsx` | Pipeline by stage, by age, and 7-day projection |
| `ContratosTab.tsx` | Lista de contratos ganhos com export CSV |
| `PerfilScoreTab.tsx` | Perfil do lead e score baseado em sinais SDR/Closer |
| `DictionaryTab.tsx` | Dicionário de métricas (do `lib/metrics-definitions.ts`) |
| `ChatTab.tsx` | Chat IA (GPT-4o) com contexto da aba ativa |

### UI — Orchestrator — `components/Dashboard.tsx`

Root client component. Owns loading/error state, calls the API helpers, triggers `computeMetrics()`, and renders the correct tab view. Also renders the navigation `Header`.

### Entry Point — `app/page.tsx`

Next.js page that simply renders `<Dashboard />`.

---

## Board Executivo Endpoint (server-side, v2.7.0+)

Independente do dashboard. Sirve a fonte de verdade do funil para consumidores externos (hoje: Claude Cowork, gerador automatizado do Board Executivo Marketing semanal). HTTP-only, sem UI.

### Route — `app/api/board/weekly/route.ts`

`GET /api/board/weekly?brand=ww|wt&start=YYYY-MM-DD&end=YYYY-MM-DD`. Auth via `Authorization: Bearer <BOARD_API_KEY>` (constant-time compare). Retorna envelope com `meta` (versão, hash de definições, freshness, caveats), `funnel` (4 janelas: weekly, mtd, rolling_30d, previous_4w_avg) e `targets`.

Casca fina: parse params → auth → rate limit → orchestrator → ETag → audit log → response. Sem lógica de negócio.

### Camada de domínio — `lib/board/`

| File | Responsibility |
|---|---|
| `types.ts` | `Brand`, `BoardDeal`, `BoardResponse` (discriminated union por brand), `FunnelWW`, `FunnelWT`, `Targets*`, `ErrorCode`, `UtcRange` |
| `constants.ts` | `LEADS_PIPELINES`, `TRIPS_PIPELINES`, `REUNIAO_EXCLUDE`, `BRAND_TO_PIPELINE_TYPE`, `WW_DEFINITIONS`/`WT_DEFINITIONS`, hashes SHA-256 (`kpiHashFor`), env helpers (`staleHours`, `failHours`, `rateLimitRpm`) |
| `period.ts` | `periodToUtcRange`, `validateRange`, `mtdRange`, `rolling30dRange`, `previous4WeeksRanges`, `isPartialPeriod`, `isWindowComplete`. BRT↔UTC via `date-fns-tz` |
| `auth.ts` | Bearer parsing + `crypto.timingSafeEqual` |
| `deals-fetcher.ts` | Single OR-query sobre 5 colunas de data (cobre todas as 4 janelas em 1 round-trip) |
| `funnel-ww.ts` | `computeFunnelWw`, `computeRollingWw`, `averageWwWeeks`. Pure: `(deals[], range) → FunnelWW`. Filtros base: `is_elopement=false`, `title NOT ILIKE 'EW%'`, `pipeline IN LEADS_PIPELINES`. Detecta reunião realizada via `ww_como_foi_feita_reuni_o_closer` OR `tipo_da_reuni_o_com_a_closer` (campos vivos AC, não a coluna legacy `reuniao_closer`) |
| `funnel-wt.ts` | `computeFunnelWt`, `computeRollingWt`, `averageWtWeeks`. Pure. Vendas WT computadas com `sdr_wt_data_fechamento_taxa` no período + `pagamento_de_taxa OR pagou_a_taxa` preenchido |
| `data-freshness.ts` | Query em `sync_logs` (Edge Function `sync-deals` insere uma linha por execução bem-sucedida); retorna `ac_last_sync` + `syncs_in_period` + flag `stale` |
| `targets.ts` | Lookup em `monthly_targets` mapeado para shape do board (col `leads/qualificado/closer_realizada/vendas` → `leads_gerados/qualificados_sdr/reunioes_closer/contratos_vol`) |
| `audit.ts` | Insert fire-and-forget em `board_audit_log` (não bloqueia resposta) |
| `rate-limit.ts` | Vercel KV (Redis nativo) com fallback in-memory para dev. 10 req/min/IP por default |
| `orchestrator.ts` | Composição: parse range → freshness → fetch deals (single broad query) → compute 4 windows → fetch targets → assemble `BoardResponse` |
| `supabase-admin.ts` | Service-role client (bypass de RLS para `sync_logs`/`board_audit_log`) com cache lazy |

### Testes — `lib/board/__tests__/`

58 testes Vitest cobrindo BRT/UTC boundaries, filtros base, KPI counters, `is_partial`, conversão por zero, médias com semanas excluídas, auth constant-time. Não dependem de Supabase (puros).

### Documentação canônica

- [`docs/board-api-briefing.md`](./docs/board-api-briefing.md) (v1.2) — contrato HTTP completo, definições por KPI, runbook, ownership.
- [`docs/cowork-instructions.md`](./docs/cowork-instructions.md) — system prompt do Claude Cowork.
- [`docs/cowork-kickoff-prompt.md`](./docs/cowork-kickoff-prompt.md) — mensagem inicial para disparar o primeiro dry-run.

### Schema externo necessário

- Coluna `deals.sdr_wt_data_fechamento_taxa` (TIMESTAMPTZ) — populada via field 332 do AC.
- Tabela `board_audit_log` — RLS service-role-only, cleanup mensal via pg_cron.
- 5 índices em `deals` para performance das queries.
- Migration: `dash-webhook/supabase/migrations/20260430_board_endpoint.sql`.

---

## Communication Flow

```
Browser
  │
  └─► Dashboard.tsx  (Client Component)
          │
          ├── lib/supabase-api.ts  ──► Supabase (PostgreSQL)
          │
          ├── lib/metrics.ts  ──► computeMetrics()  (pure, synchronous)
          ├── lib/metrics-jornada.ts  ──► computeJornada()  (pure — 7-stage funnel, dropouts, time series)
          │
          └── Tab Components (OverviewTab / JornadaTab / FunnelMetaTab / FunnelTab / SDRTab / CloserTab / PipelineTab / ContratosTab / PerfilScoreTab / DictionaryTab / ChatTab)
                  │
                  └── Shared UI (KpiCard, SectionTitle, CustomTooltip, DealsModal, StageChart, StageDeepDive, theme)
```

**Communication patterns:**

- **Dashboard → Database helpers**: direct `async` function calls using the Supabase client.
- **Database → Dashboard**: Typed data mapped to the legacy `Deal` schema for compatibility.
- **Supabase**: Primary data source, queried directly from the client (or server actions in the future).

---

## Responsibility Map

| Layer | Owns | Does NOT own |
|---|---|---|
| `route.ts` | Secret injection, upstream HTTP, CORS | Business logic, data shape |
| `schemas.ts` | Data contracts (Zod) | Fetching, transforming |
| `ac-api.ts` | Fetching, pagination, validation | Metrics computation, rendering |
| `metrics.ts` | All KPI logic | State, side effects, rendering |
| `utils.ts` | Generic date math, CSS utilities | Domain logic |
| `supabase.ts` | DB client init | Queries (delegated to callers) |
| `Dashboard.tsx` | App state, data orchestration, routing | Metric math, API secrets |
| Tab components | Rendering a specific tab's charts/tables | Data loading, state |
| Shared UI | Visual primitives | Business logic |

---

## Environment Variables

| Variable | Scope | Used by |
|---|---|---|
| `AC_API_KEY` | Server only | `app/api/ac/route.ts` |
| `NEXT_PUBLIC_SUPABASE_URL` | Public | `lib/supabase.ts`, `lib/board/supabase-admin.ts` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public | `lib/supabase.ts` |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only | `lib/board/supabase-admin.ts`, sync routes |
| `NEXT_PUBLIC_SITE_URL` | Public | CORS allow-list in `route.ts` |
| `DASH_PASSWORD` | Server only | future auth middleware |
| `META_ADS_*` / `GOOGLE_ADS_*` | Server only | sync routes (`/api/sync-meta-ads`, `/api/sync-google-ads`) |
| `BOARD_API_KEY` | Server only | `lib/board/auth.ts` (Board endpoint Bearer) |
| `BOARD_STALE_HOURS` | Server only | `lib/board/constants.ts` (default 6) |
| `BOARD_FAIL_HOURS` | Server only | `lib/board/constants.ts` (default 24) |
| `BOARD_RATE_LIMIT_RPM` | Server only | `lib/board/constants.ts` (default 10) |
| `KV_REST_API_URL` / `KV_REST_API_TOKEN` | Server only | `lib/board/rate-limit.ts` (Vercel KV; opcional, fallback in-memory) |
| `OPENAI_API_KEY` | Server only | `app/api/chat/route.ts` (Chat IA) |
| `SYNC_SECRET` | Server only | `app/api/sync/route.ts` |
