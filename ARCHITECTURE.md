# Architecture — DashWW (Welcome Weddings Sales Dashboard)

## Overview

Single-page Next.js 16 application that reads data from the **ActiveCampaign** CRM through a server-side proxy, computes sales funnel metrics, and renders them in a tabbed dashboard. **Supabase** is available for future persistence.

---

## Modules

### API Layer — `app/api/ac/route.ts`

Server-side proxy that forwards browser requests to the ActiveCampaign REST API, injecting the secret `AC_API_KEY`. The browser never sees the key.

### Data Schemas — `lib/schemas.ts`

Zod schemas that validate every external response from ActiveCampaign (deals, custom fields, stages). Acts as the contract between the API layer and the business logic.

### AC API Helpers — `lib/ac-api.ts`

Async functions (`fetchAllDeals`, `fetchFieldMeta`, `fetchStages`) that call `/api/ac`, paginate results, and validate them against `schemas.ts` before returning typed objects.

### Metrics Engine — `lib/metrics.ts`

Pure function `computeMetrics()` that receives typed deal arrays and returns all KPIs (SDR volume, qualification rate, conversion, velocity, pipeline health, cohorts, loss reasons). Has zero side effects.

### Utilities — `lib/utils.ts`

Date helpers (`parseDate`, `weekKey`, `inRange`, `daysAgo`, `daysSince`) and the `cn()` class-merging utility used across components.

### Supabase Client — `lib/supabase.ts`

Initialised Supabase client for future read/write operations (e.g. caching metrics, auth). Validates env vars at startup.

---

### UI — Theme — `components/dashboard/theme.ts`

Centralised colour palette (`T`) and `statusColor()` / `statusIcon()` helpers. Single source of truth for all visual tokens.

### UI — Shared Components

| File | Responsibility |
|---|---|
| `KpiCard.tsx` | Renders a single KPI tile with status colour, value, and delta |
| `SectionTitle.tsx` | Section heading with optional colour-coded status badge |
| `CustomTooltip.tsx` | Recharts tooltip with branded styling |

### UI — Tab Views

| File | Responsibility |
|---|---|
| `OverviewTab.tsx` | KPI row + SDR/Conversion charts + consolidated status grid |
| `FunnelTab.tsx` | SDR volume trend, qualification rate chart, funnel of current week |
| `CloserTab.tsx` | 4-week conversion windows, period breakdown, loss reasons, cohort analysis |
| `PipelineTab.tsx` | Pipeline by stage, by age, and 7-day projection |

### UI — Orchestrator — `components/Dashboard.tsx`

Root client component. Owns loading/error state, calls the API helpers, triggers `computeMetrics()`, and renders the correct tab view. Also renders the navigation `Header`.

### Entry Point — `app/page.tsx`

Next.js page that simply renders `<Dashboard />`.

---

## Communication Flow

```
Browser
  │
  ├─► GET /api/ac?path=...   (Next.js Route Handler)
  │       │
  │       └─► ActiveCampaign REST API  (server-side, secret key injected)
  │               │
  │               └─► JSON response validated by lib/schemas.ts
  │
  └─► Dashboard.tsx  (Client Component)
          │
          ├── lib/ac-api.ts  ──► /api/ac  (fetch, paginate, validate)
          │
          ├── lib/metrics.ts  ──► computeMetrics()  (pure, synchronous)
          │
          └── Tab Components (OverviewTab / FunnelTab / CloserTab / PipelineTab)
                  │
                  └── Shared UI (KpiCard, SectionTitle, CustomTooltip, theme)
```

**Communication patterns:**

- **Dashboard → API helpers**: direct `async` function calls (no event bus)
- **API helpers → proxy**: HTTP `fetch` to `/api/ac`
- **proxy → ActiveCampaign**: HTTP `fetch` server-side (secrets never reach browser)
- **Dashboard → tab views**: React props (`m: Metrics`)
- **Supabase**: client available in `lib/supabase.ts`, not yet called by any component

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
