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
| `NEXT_PUBLIC_SUPABASE_URL` | Public | `lib/supabase.ts` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public | `lib/supabase.ts` |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only | future server actions |
| `NEXT_PUBLIC_SITE_URL` | Public | CORS allow-list in `route.ts` |
| `DASH_PASSWORD` | Server only | future auth middleware |
| `META_ADS_*` / `GOOGLE_ADS_*` | Server only | future API integrations |
