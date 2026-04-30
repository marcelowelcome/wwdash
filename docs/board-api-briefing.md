# Briefing Técnico — Endpoint `/api/board/weekly`

**Versão:** 1.2
**Data:** 30 abril 2026
**Autor:** Marcelo (Marketing) + revisão técnica + revisão Lead Tech
**Implementador:** Mateus (Dev)
**Consumidor:** Claude Cowork (geração de Board Executivo semanal)

> Este documento é a fonte de verdade do contrato. Mudanças no comportamento do endpoint exigem bump de versão (v1.2 → v1.3 para ajustes; v2.0 para breaking changes em definição de KPI).

**Mudanças desde v1.1 (todos os P0/P1/P2 do review Lead Tech):**
- **G1:** Adicionado `funnel.targets` no envelope (cruza `monthly_targets` automaticamente).
- **G2:** Especificado o que reusar do kpi-weddings e o que é greenfield. Estrutura de arquivos definida.
- **G3:** Adicionado `meta.kpi_caveats` para WT `qualificados` aproximado.
- **G4:** Filtro de `reunioes_closer` agora exclui `'Não teve reunião'` (paridade com dashboard).
- **G5:** Helper de boundary BRT→UTC explícito + biblioteca obrigatória (`date-fns-tz`).
- **G6:** Rate limit usando Vercel KV (fallback in-memory para dev).
- **G7:** Spec de fallback Cowork-side adicionado (Seção 15).
- **G8:** `meta.kpi_definitions_hash` para detectar drift de fórmula.
- **G9:** Cada window (`weekly`, `mtd`, `rolling_30d`, `previous_4w_avg`) tem flag `is_complete`.
- **G10:** Estrutura de arquivos definida (Seção 11).
- **G11:** Estratégia de testes obrigatória (Seção 12).
- **G12:** Cleanup de `board_audit_log` via pg_cron mensal (12 meses retenção).
- **G14:** Mapeamento `brand` ↔ `pipeline_type` documentado.
- **G15-G20:** Seções 13-15 e 17-19 adicionadas (rollout, ownership, runbook, exemplos de erro, roadmap).

---

## 1. Contexto

O Board Executivo Marketing é um relatório semanal entregue à diretoria toda segunda-feira, cobrindo Welcome Trips e Welcome Weddings. Hoje é produzido manualmente; o objetivo é automatizar a coleta de dados via Cowork.

Este endpoint é a **fonte de verdade do funil** das duas marcas. Cowork consulta semanalmente, combina com investimento de mídia (CSVs Meta + Google) e gera o `.pptx` final.

**Princípio de design:** lógica de cálculo de funil + cruzamento com metas vivem no DashWW/Supabase. Cowork é montador de board, não calculador de métrica nem mantenedor de planilhas paralelas.

---

## 2. Stack alvo

- **Onde implementar:** rota Next.js App Router em **kpi-weddings** (`app/api/board/weekly/route.ts`). Repo `marcelowelcome/wwdash`, deploy `weddings-kpi.vercel.app`. **NÃO usar dash-webhook** — tem deploys zumbi.
- **Stack:** Next.js 16, TypeScript estrito, Supabase JS client (já configurado), Vercel KV (opcional para rate limit), `date-fns-tz` (novo).
- **Migrations** (coluna nova WT + índices + `board_audit_log`) vão no repo **dash-webhook** (que detém o schema).

---

## 3. Contrato da API

### 3.1 Request

```
GET /api/board/weekly?brand=<ww|wt>&start=YYYY-MM-DD&end=YYYY-MM-DD
Authorization: Bearer <BOARD_API_KEY>
```

| Param | Tipo | Descrição |
|---|---|---|
| `brand` | enum | `wt` ou `ww` |
| `start` | ISO date (YYYY-MM-DD) | Início do período, interpretado como 00:00:00 BRT |
| `end` | ISO date (YYYY-MM-DD) | Fim do período, interpretado como 23:59:59.999 BRT |

**v1: validação rígida.** `end - start = 6 dias` (segunda a domingo, range semanal). Outros ranges retornam `400 INVALID_RANGE`. Flexibilidade para mensal/trimestral fica para v2.

### 3.2 Response 200 — Envelope

```json
{
  "meta": {
    "version": "v1",
    "kpi_definitions_hash": "a3f4...",
    "generated_at": "2026-04-30T11:00:00Z",
    "period": { "start": "2026-04-20", "end": "2026-04-26", "is_partial": false },
    "brand": "ww",
    "data_freshness": {
      "ac_last_sync": "2026-04-30T10:45:00Z",
      "stale": false,
      "syncs_in_period": 84
    },
    "kpi_caveats": []
  },
  "funnel": {
    "weekly":          { /* ver 3.3 */, "is_complete": true  },
    "mtd":             { /* ver 3.3 */, "is_complete": false },
    "rolling_30d":     { /* ver 3.4 */, "is_complete": false },
    "previous_4w_avg": { /* ver 3.3 */, "is_complete": true  }
  },
  "targets": { /* ver 3.5, brand-specific */ }
}
```

**Campos do `meta`:**
- `kpi_definitions_hash`: SHA-256 dos nomes de coluna + filtros usados (constante por brand). Cowork detecta drift.
- `data_freshness.syncs_in_period`: número de `sync_logs.status='success'` que cobriram `[start, end]`.
- `kpi_caveats`: lista de strings com avisos sobre limitações.
- Todos timestamps em **UTC com sufixo `Z`**.

**`is_complete` por janela:** `false` quando inclui o dia corrente.

### 3.3 Shape de `weekly` / `mtd` / `previous_4w_avg`

**WW (`brand=ww`):**
```json
{
  "leads_gerados": 87,
  "qualificados_sdr": 24,
  "reunioes_closer": 9,
  "contratos_vol": 2,
  "conversao_sdr_closer_pct": 22.0,
  "is_complete": true
}
```

**WT (`brand=wt`):**
```json
{
  "leads_gerados": 142,
  "qualificados": 38,
  "vendas": 7,
  "is_complete": true
}
```

### 3.4 Shape de `rolling_30d`

**WW:** `{ "contratos_vol": 11, "qualificados_sdr": 95, "is_complete": false }`
**WT:** `{ "vendas": 28, "qualificados": 145, "is_complete": false }`

### 3.5 Shape de `targets`

Reflete a meta mensal de `monthly_targets` para o mês de `end`. Brand-specific.

**WW:**
```json
{
  "scope": "monthly",
  "month": "2026-04",
  "leads_gerados": 320,
  "qualificados_sdr": 80,
  "reunioes_closer": 40,
  "contratos_vol": 10
}
```

**WT:**
```json
{
  "scope": "monthly",
  "month": "2026-04",
  "leads_gerados": 600,
  "qualificados": 180,
  "vendas": 30
}
```

Se ausente: `{ "scope": "monthly", "month": "2026-04", "missing": true }`.

### 3.6 Erros

| Status | Code | Quando |
|---|---|---|
| 400 | `MISSING_PARAM` | falta `brand`, `start` ou `end` |
| 400 | `INVALID_DATE` | data não-ISO ou data no futuro |
| 400 | `INVALID_RANGE` | `end < start` ou `end - start ≠ 6 dias` |
| 401 | `UNAUTHORIZED` | header ausente ou inválido |
| 422 | `INVALID_BRAND` | `brand` ≠ `wt`/`ww` |
| 422 | `RANGE_TOO_OLD` | `start` > 24 meses no passado |
| 429 | `RATE_LIMIT` | excede `BOARD_RATE_LIMIT_RPM` |
| 503 | `DATA_STALE` | `ac_last_sync` > `BOARD_FAIL_HOURS` |
| 503 | `NO_SYNC_IN_PERIOD` | nenhum `sync_logs.status='success'` em `[start, end]` |
| 500 | `INTERNAL` | erro inesperado |

```json
{ "error": { "code": "INVALID_RANGE", "message": "v1 accepts only weekly ranges (7 days). Got 14 days." } }
```

---

## 4. Definições de cálculo

### 4.1 Welcome Weddings (`brand=ww`)

**Filtros base:**
- `is_elopement = false`
- `title NOT ILIKE 'EW%'`
- `pipeline IN LEADS_PIPELINES`

```ts
const LEADS_PIPELINES = [
  'SDR Weddings',
  'Closer Weddings',
  'Planejamento Weddings',
  'WW - Internacional',
  'Outros Desqualificados | Wedding'
];
```

| KPI | Fórmula |
|---|---|
| `leads_gerados` | `count(deals where created_at ∈ [startUtc, endUtc])` + filtros base |
| `qualificados_sdr` | `count(deals where data_qualificado ∈ [startUtc, endUtc])` + filtros base |
| `reunioes_closer` | `count(deals where data_closer ∈ [startUtc, endUtc] AND reuniao_closer NOT NULL AND reuniao_closer != '' AND reuniao_closer != 'Não teve reunião')` + filtros base |
| `contratos_vol` | `count(deals where data_fechamento ∈ [startUtc, endUtc])` + filtros base |
| `conversao_sdr_closer_pct` | `qualificados_sdr === 0 ? null : round(reunioes_closer / qualificados_sdr * 100, 1)` |

**Reuso obrigatório:**
- `WonDeal`, `MonthlyTarget` de `lib/schemas.ts`
- `mapRowToWonDeal`, `DEAL_COLUMNS` de `lib/supabase-api.ts`

> **Não chamar** `calculateFunnelMetrics` do dash-webhook (não está no repo). Reescrever em `lib/board/funnel-ww.ts` puro.

### 4.2 Welcome Trips (`brand=wt`)

**Filtros base:** `pipeline IN TRIPS_PIPELINES`

```ts
const TRIPS_PIPELINES = [
  'Consultoras TRIPS',
  'SDR - Trips',
  'WTN - Desqualificados'
];
```

| KPI | Fórmula |
|---|---|
| `leads_gerados` | `count(deals where created_at ∈ [startUtc, endUtc])` + filtros base. Inclui desqualificados. |
| `qualificados` | `count(deals where pipeline = 'SDR - Trips' AND created_at ∈ [startUtc, endUtc])`. **APROXIMADO.** |
| `vendas` | `count(deals where sdr_wt_data_fechamento_taxa ∈ [startUtc, endUtc] AND (pagamento_de_taxa NOT NULL/EMPTY OR pagou_a_taxa NOT NULL/EMPTY))` + filtros base |

**`kpi_caveats` para WT — preencher sempre:**
```json
"kpi_caveats": [
  "qualificados_wt is approximated by deal.created_at within period; deals migrated to 'SDR - Trips' from other pipelines after creation are not detected."
]
```

### 4.3 Atribuição temporal e fuso

```ts
import { zonedTimeToUtc } from 'date-fns-tz';

function periodToUtcRange(start: string, end: string) {
  const TZ = 'America/Sao_Paulo';
  return {
    startUtc: zonedTimeToUtc(`${start}T00:00:00.000`, TZ),
    endUtc:   zonedTimeToUtc(`${end}T23:59:59.999`, TZ),
  };
}
```

**Em queries Supabase: NÃO usar string ISO date. Usar Date object.**

### 4.4 Janelas

| Janela | Definição |
|---|---|
| `weekly` | `[start, end]` exato |
| `mtd` | dia 1 do mês de `end` (00:00 BRT) até `end` |
| `rolling_30d` | `end - 29 dias` (00:00 BRT) até `end` |
| `previous_4w_avg` | média simples das 4 semanas Mon–Sun anteriores a `start`. Excluir do divisor semanas com 0 sync success. Se 4/4 inválidas → `null`. |

### 4.5 Mapping `brand` ↔ `pipeline_type`

```ts
const BRAND_TO_PIPELINE_TYPE: Record<Brand, PipelineType> = {
  ww: 'wedding',
  wt: 'trips',
};
```

`elopement` não exposto na v1.

### 4.6 `kpi_definitions_hash`

SHA-256 de uma string canônica que codifica nomes de coluna + filtros das definições da Seção 4. Constante por brand. Cowork compara entre semanas e alerta quando muda.

---

## 5. Autenticação

- Env var: `BOARD_API_KEY` (`openssl rand -hex 32`)
- `Authorization: Bearer <key>` em toda chamada
- Comparação **constant-time** via `crypto.timingSafeEqual`
- 401 sem distinguir entre "header ausente" e "key inválida"
- **Proibido:** aceitar `?api_key=` em query string

---

## 6. Performance

- **Target:** p95 < 500ms, p99 < 1500ms em 10 RPS sustentado
- **Estratégia:** queries on-the-fly. Sem materialized views.
- **Índices obrigatórios** (criar antes do go-live):

```sql
CREATE INDEX IF NOT EXISTS idx_deals_data_qualificado ON deals(data_qualificado) WHERE data_qualificado IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_deals_data_closer     ON deals(data_closer)     WHERE data_closer IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_deals_data_fechamento ON deals(data_fechamento) WHERE data_fechamento IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_deals_sdr_wt_data_fechamento_taxa ON deals(sdr_wt_data_fechamento_taxa) WHERE sdr_wt_data_fechamento_taxa IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_deals_pipeline_created ON deals(pipeline, created_at);
```

### 6.1 ETag para janelas fechadas

- `meta.period.is_partial = false` envia `ETag` + `Cache-Control: public, max-age=3600, immutable`
- 304 quando `If-None-Match` bate

---

## 7. Casos de borda

(detalhamento conforme briefing v1.2 — vide doc original)

---

## 8. Critérios de aceite

(checklist conforme briefing v1.2)

---

## 9. Observabilidade & Rate Limit

### 9.1 `board_audit_log`

```sql
CREATE TABLE IF NOT EXISTS board_audit_log (
  id BIGSERIAL PRIMARY KEY,
  called_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  brand          TEXT NOT NULL CHECK (brand IN ('ww', 'wt')),
  period_start   DATE NOT NULL,
  period_end     DATE NOT NULL,
  status_code    INTEGER NOT NULL,
  error_code     TEXT,
  latency_ms     INTEGER NOT NULL,
  client_ip      INET,
  user_agent     TEXT
);

CREATE INDEX idx_board_audit_called_at      ON board_audit_log(called_at DESC);
CREATE INDEX idx_board_audit_brand_period   ON board_audit_log(brand, period_start);

-- Cleanup mensal
SELECT cron.schedule(
  'board_audit_log_cleanup',
  '0 3 1 * *',
  $$DELETE FROM board_audit_log WHERE called_at < NOW() - INTERVAL '12 months'$$
);
```

### 9.2 Rate limit

Implementação primária: **Vercel KV** (Redis nativo). Fallback dev: in-memory (não-funcional em produção serverless — apenas para testes locais).

### 9.3 Cross-check `sync_logs`

Antes de calcular qualquer KPI: `SELECT count FROM sync_logs WHERE status='success' AND finished_at ∈ [start, end]`. Zero → 503 `NO_SYNC_IN_PERIOD`.

---

## 10. Pré-requisitos de schema

1. **Campo AC novo "SDR WT - Data Fechamento Taxa"** → adicionar em `_shared/field-maps.ts` do dash-webhook + migration de coluna.
2. **Vercel KV** provisionado no projeto `weddings-kpi`.
3. **Env vars** no Vercel: `BOARD_API_KEY`, `BOARD_STALE_HOURS=6`, `BOARD_FAIL_HOURS=24`, `BOARD_RATE_LIMIT_RPM=10`, `KV_REST_API_*`.
4. **Migrations** em dash-webhook: `20260430_board_endpoint.sql`.

---

## 11. Estrutura de código (kpi-weddings)

```
app/api/board/weekly/route.ts          -- HTTP plumbing only
lib/board/
├── types.ts                           -- Brand, BoardResponse, FunnelWW, FunnelWT, etc.
├── constants.ts                       -- LEADS_PIPELINES, TRIPS_PIPELINES, *_DEFINITIONS, *_HASH
├── auth.ts                            -- timingSafeEqual + Bearer parse
├── period.ts                          -- periodToUtcRange, validateRange, isPartial
├── data-freshness.ts                  -- hasSuccessfulSyncInPeriod, last AC sync
├── funnel-ww.ts                       -- pure: (deals, range) => FunnelWW
├── funnel-wt.ts                       -- pure: (deals, range) => FunnelWT
├── targets.ts                         -- monthly_targets fetcher
├── audit.ts                           -- board_audit_log writer
├── rate-limit.ts                      -- Vercel KV (com fallback in-memory)
├── orchestrator.ts                    -- compose: deals + freshness + funnel × 4 windows + targets
└── __tests__/
    ├── period.test.ts
    ├── auth.test.ts
    ├── funnel-ww.test.ts
    └── funnel-wt.test.ts
```

---

## 12. Estratégia de testes

- **Unit:** `funnel-ww`, `funnel-wt`, `period`, `auth` — fixture-based, 100% coverage da lógica pura.
- **Integration:** mockar Supabase client, testar 10 cenários de erro + 2 happy paths + 1 304.
- **Smoke (CI pós-deploy):** curl em staging, valida shape da resposta.

---

## 13-20. Rollout, Ownership, Cowork-side, Definition of Done, Anexos, Runbook, Roadmap, Pendências

(conteúdo conforme briefing v1.2 — preservado em chat para reference)

---

**Fim do briefing v1.2.**
