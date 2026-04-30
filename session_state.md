# Session State — DashWW

**Última atualização:** 2026-04-30 (sessão encerrada)
**Versão em produção (kpi-weddings):** 2.6.1 + camada a11y + extensões da Jornada (avg time, executive summary, expandable lead details)
**Branch:** `main`
**Último commit kpi-weddings:** `12e4072`
**Último commit dash-webhook:** `4d09807` (push: 2026-04-30)

> Documento vivo — atualize a cada sessão encerrada. Registra o *estado presente* (o que está pronto, em voo, travado).
> A seção **Runbook** abaixo tem diagnóstico passo-a-passo dos problemas operacionais que já enfrentamos. **Consulte-a antes de gastar tempo investigando do zero.**

---

## O que está em produção hoje

### kpi-weddings ✅
- Tudo da v2.6.1 + camada a11y (entregue em 16/abr).
- **Novo desde 16/abr:** `12e4072` — avg time in stage, executive summary e expandable lead details na aba Jornada.
- Deploy desbloqueado em 30/abr (estava travado em "Pending" por 2 semanas; ver Runbook A).
- URL de produção: https://weddings-kpi.vercel.app/

### dash-webhook ✅ (nova realidade compreendida)
- **Repo separado** (`marcelowelcome/dash-webhook`), não confundir com kpi-weddings (`marcelowelcome/wwdash`).
- O que **roda em produção**: Edge Functions no Supabase (`sync-deals` via pg_cron 2h, `activecampaign-webhook` via webhook AC).
- O que **NÃO roda em produção**: as rotas Next.js (`/api/ads/refresh`, `/api/deals/sync`, `/api/webhook/activecampaign`). O único deploy Vercel encontrado (`ww-dash.vercel.app`) é zumbi — código antigo + middleware redirecionando tudo pra `/login`.
- Commit `4d09807` (30/abr) consertou o build break + uma regressão silenciosa no `fetchGoogleAdsSpend` (lia `.is('pipeline', null)` enquanto dados estão tagueados `'wedding'`). **Conserto válido tecnicamente, sem efeito imediato em prod** — mas pronto pra quando alguém deployar o dash-webhook de forma legítima.

---

## Runbook — Troubleshooting comum

Os três sintomas abaixo já apareceram. Cada um tem uma raiz que **não é a óbvia**. Siga o passo-a-passo antes de investigar do zero.

### A. Build do Vercel "Pending" por horas/dias (kpi-weddings)

**Sintoma:** push novo na `main` mas o site continua servindo versão antiga. Painel Vercel mostra status `● Pending` no último deploy.

**Causa real (caso de 16-30/abr):** plano Hobby tem **1 build concorrente**; se um deploy trava (compilação que não termina, etapa de upload que congela), todos os deploys subsequentes ficam em fila atrás dele indefinidamente.

**Diagnóstico:**
1. https://vercel.com/dashboard → projeto **`weddings-kpi`** → aba **Deployments**.
2. Procure o deploy mais antigo com status `Building` ou `Queued`. Esse é o que travou.
3. Cuidado: pode haver **projetos zumbi** apontando pro mesmo repo (ex: `wwelcome` em 2026, deploy abandonado). Esses NÃO são o problema, mas poluem o status check do GitHub com ❌ "Canceled". Identificar pelo nome.

**Solução:**
1. No deploy travado: menu `⋯` → **Cancel Deployment**. Libera o slot.
2. Os deploys posteriores entram em fila e tentam de novo automaticamente.
3. Validação: aguardar ~2min, atualizar a página de Deployments. O último deploy deve passar para `Building` → `Ready`.
4. Confirmar com curl:
   ```bash
   curl -sI https://weddings-kpi.vercel.app/ | grep -E "age|x-vercel-id"
   ```
   `age` baixo (segundos/minutos) = deploy fresco. Se `age` for de dias, ainda está servindo cache antigo — aguarde mais 1-2 min.

**Limpeza opcional (não-urgente):** `wwelcome` e `ww-dash.vercel.app` (zumbis no Vercel) podem ser desconectados em **Project Settings → Git → Disconnect** para parar de poluir status checks.

### B. Cache de ads parou de atualizar (dashboard mostrando R$ 0 ou dados antigos em Meta/Google Spend)

**Sintoma:** widgets de Meta Ads ou Google Ads exibindo dados antigos ou R$ 0. SQL `SELECT MAX(updated_at) FROM ads_spend_cache` mostra última escrita há dias/semanas.

**Causa real (caso de 09-30/abr):** o sync de ads é **client-triggered**, não cron. `Dashboard.tsx` (linhas ~358-366) e `FunnelMetaTab.tsx` (~158-166) disparam `fetch("/api/sync-meta-ads", ...)` e `fetch("/api/sync-google-ads", ...)` quando o componente monta no browser. Se ninguém abre o dashboard, a cache não atualiza. Se o site está cacheado/inacessível, idem. **Não há cron Vercel ou GitHub Action para isso** — não confie no `vercel.json` do `dash-webhook` (declara crons mas é zumbi).

**Diagnóstico:**
1. SQL no Supabase ActiveDash:
   ```sql
   SELECT
     source,
     pipeline,
     MAX(updated_at) AS ultima_atualizacao,
     NOW() - MAX(updated_at) AS frescor
   FROM ads_spend_cache
   GROUP BY source, pipeline
   ORDER BY source;
   ```
2. Se `frescor > 24h`, há sintoma confirmado.

**Solução:**
1. Abrir https://weddings-kpi.vercel.app/ logado.
2. Esperar 30-60s para o `Dashboard.tsx` disparar os syncs em background.
3. Re-rodar o SQL acima. `frescor` deve voltar a segundos/minutos.

**Se o sync não disparar mesmo com dashboard aberto:** verificar env vars no Vercel `weddings-kpi`:
- `META_ADS_ACCESS_TOKEN`, `META_ADS_ACCOUNT_ID`
- `GOOGLE_ADS_CLIENT_ID`, `GOOGLE_ADS_CLIENT_SECRET`, `GOOGLE_ADS_REFRESH_TOKEN`, `GOOGLE_ADS_DEVELOPER_TOKEN`, `GOOGLE_ADS_CUSTOMER_ID`

Tokens podem ter vencido. Console do browser na aba Network vai mostrar a chamada falhando com 401/403.

### C. ❌ "Canceled" ou "Failing" em commit no GitHub

**Sintoma:** página do commit no GitHub mostra ❌ vermelho ao lado do hash, com texto "Canceled from the Vercel Dashboard" ou similar.

**Causa real:** projetos Vercel zumbi (`wwelcome` para o repo wwdash, `ww-dash` para o repo dash-webhook) recebem trigger a cada push e são auto-cancelados ou falham. **Cosmético** — não significa que o deploy de produção falhou. O projeto Vercel ativo (`weddings-kpi`) pode ter passado normalmente.

**Diagnóstico:**
1. Clicar no ❌ no GitHub → ver lista de checks.
2. Se houver MÚLTIPLOS checks Vercel (ex: "Vercel — wwelcome ❌" e "Vercel — weddings-kpi ●"), o ❌ provavelmente é do zumbi e o `●` é o real.
3. Confirmar pelo painel Vercel qual projeto é o "real" (o que tem domain de produção). Os zumbis costumam ter datas de last deploy de meses atrás.

**Solução:** ignorar o ❌ do zumbi, ou desconectá-lo (Settings → Git → Disconnect) para limpar o ruído. Não há ação de código necessária.

---

## Pendências abertas

### dash-webhook — estado local não-commitado
- ~470 linhas de WIP de terceiros (refator das Edge Functions movendo código duplicado para `_shared/`) continua não commitado. Pasta `supabase/functions/_shared/` é untracked apesar de ser referenciada como "fonte única v2.0" na arquitetura.
- 2 migrations de 16/abr (`20260416_create_sync_logs.sql`, `20260416_tighten_rls.sql`) untracked, não aplicadas em prod.
- 3 scripts utilitários (`backfill-deals.mjs`, `generate-key-map.mjs`, `reprocess-raw-data.mjs`) untracked.
- 2 arquivos suspeitos (`query.js`, `test-won.js`) — provavelmente ad-hoc, descartar?
- Sem dono claro para revisar. Recomendação: o autor original (PaNdassauro?) consolida ou descarta.

### dash-webhook — decisão de produto pendente
- O Vercel deploy do dash-webhook (`ww-dash.vercel.app`) está zumbi com middleware bloqueando tudo. Duas opções:
  1. **Deletar o projeto Vercel** e aceitar que o dash-webhook é só repo de Edge Functions (Supabase) + scripts. As rotas Next dele são vestígio aspiracional.
  2. **Re-deployar corretamente** com as env vars certas (META_ADS_*, GOOGLE_ADS_*, CRON_SECRET, etc.) e migrar o sync de ads para cron Vercel agendado, eliminando a dependência do client-trigger. Mais robusto, mas exige convergir o WIP local primeiro.

### Dívida técnica conhecida (não mudou desde 16/abr)
- Safety net de orçamento em `mapRowToWonDeal` (heurística — divide por 100 valores ≥ R$ 1M com últimos 2 dígitos 00). Vira dead code depois que o reprocess-raw-data for rodado em prod.
- WIPs antigos no kpi-weddings (`sdr_dash_v2.jsx`, `sdr_investigation_dash.jsx`, `sdr_investigation_dash (1).jsx`, scripts de audit/fix de mar/12-13) seguem untracked. Sem plano imediato.
- Testes E2E (Playwright/Cypress) ainda não existem.

---

## Ambiente

- **Servidor dev local:** http://localhost:3000 (subir com `node node_modules/next/dist/bin/next dev` quando necessário).
- **Build/Test no WSL:** `npm`/`npx` falham, usar node direto: `/home/marcelo/.nvm/versions/node/v24.14.0/bin/node node_modules/...`
- **Última rodada de testes (16/abr):** kpi-weddings 198/203 verdes (5 falhas pré-existentes em `MonthSelector.test.tsx` por causa do PR #5 Google Ads, não relacionadas).
- **Última rodada de testes (30/abr, dash-webhook):** 72/72 verdes.
- **Type-check (30/abr, ambos os projetos):** limpo.

---

## Histórico da sessão atual (2026-04-30)

Em ordem cronológica:

1. **Diagnóstico inicial:** identificado bloqueador da Sprint 1 — build do dash-webhook com `fetchMetaAdsSpend(year, month, pipeline: ViewType)` chamado com 2 args em `/total`, `/trips`, `/wedding`.
2. **Fix v1 (errado):** alteração temporária de `fetchMetaAdsSpend` para 2 args + `.is('pipeline', null)` baseada na migration `006_fix_ads_cache_pipeline.sql`. Type-check, vitest e build passaram local. **Quase commitei sem validar dados.**
3. **Validação SQL** (a pedido do usuário): `ads_spend_cache` em prod tem **38 rows meta com `pipeline='wedding'` + 3 órfãs com `pipeline=NULL` (R$ 0)** + 29 rows google com `pipeline='wedding'`. **Convenção viva é `'wedding'`, não `null`** — o fix v1 zeraria o dashboard.
4. **Fix v2 (Opção Y, correto):** revert do v1; `fetchGoogleAdsSpend` ganha `pipeline: ViewType` e usa `.eq` (estava lendo `.is(null)` e mostrando R$ 0 silencioso há ≥20 dias); call sites passam `'wedding'` em /total e /wedding, `'trips'` em /trips; `refresh/route.ts` cron writer passa a gravar `pipeline='wedding'` via constante `ANCHOR_PIPELINE`. Validado tsc/vitest/build, commit `4d09807`.
5. **SQL de limpeza** das 3 órfãs `pipeline=NULL` em meta_ads — rodado pelo usuário com sucesso.
6. **Vercel kpi-weddings desbloqueado:** deploy de `12e4072` que estava em "Pending" há 2 semanas foi destravado pelo usuário (provavelmente cancelando o deploy mais antigo da fila para liberar o slot do plano Hobby). `weddings-kpi.vercel.app` voltou a servir conteúdo fresco (`age: 105s` pós-fix).
7. **Push do `4d09807`** no dash-webhook efetivado em origin/main.
8. **Investigação do dash-webhook em prod (becos sem saída):** sondagem de URLs Vercel (`dash-webhook.vercel.app`, `ww-dash.vercel.app`, etc.) mostrou que o único deploy ativo (`ww-dash.vercel.app`) é zumbi — middleware redireciona tudo para `/login`, `/api/auth` retorna 404 (rota recente que não existe na build deployada). **Conclusão: dash-webhook não roda como Next.js em prod.**
9. **Descoberta da arquitetura real:** kpi-weddings tem suas próprias rotas `/api/sync-meta-ads` e `/api/sync-google-ads`, disparadas client-side por `Dashboard.tsx` e `FunnelMetaTab.tsx` ao montar. **Não há cron**. A "última atualização em 09/abr" coincide com a última vez que alguém abriu o dashboard antes do build travar.
10. **Validação final:** usuário abriu https://weddings-kpi.vercel.app/, sync rodou, `ads_spend_cache` voltou a atualizar. Sprint 1 fechada.

---

## Próximos passos (resumo)

1. Decidir o que fazer com o WIP não-commitado do dash-webhook (consolidar ou descartar — precisa do autor original).
2. Decidir destino do projeto Vercel zumbi do dash-webhook (deletar ou re-deployar).
3. Limpar `wwelcome` no Vercel (cosmético — só para parar o ❌ no GitHub status).
4. Rodar `reprocess-raw-data.mjs` em prod assim que o WIP do dash-webhook for consolidado, e remover a safety net `recoverOrcamento` depois.
5. Continuar Sprint 2: índices Supabase + cobertura de testes (ver [ROADMAP.md](./ROADMAP.md)).

---

## Snapshot de testes (fim da sessão 30/abr)

- **kpi-weddings Vitest:** sem alteração desde 16/abr (198/203 passando, 5 falhas pré-existentes em `MonthSelector.test.tsx`).
- **dash-webhook Vitest:** 72/72 verdes.
- **Type-check (ambos):** limpos.
- **Builds locais:** ambos exit 0.
- **Produção kpi-weddings:** `12e4072` Ready, idade ~minutos.
