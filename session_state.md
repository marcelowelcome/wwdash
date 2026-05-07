# Session State — DashWW

**Última atualização:** 2026-05-06 (sessão encerrada)
**Versão em produção (kpi-weddings):** 2.8.1 — iteração na aba SDR (modo calendário, Lead inclui Elopment, tooltips)
**Branch:** `main`
**Último commit kpi-weddings:** `99ff0eb` (push: 2026-05-06 — fetch grupo 12 Elopment) + `78c8337` + `06fe00a` + `adb5f6d`
**Último commit dash-webhook:** `b3d5a22` (push: 2026-04-30 — migration board endpoint)

> Documento vivo — atualize a cada sessão encerrada. Registra o *estado presente* (o que está pronto, em voo, travado).
> A seção **Runbook** abaixo tem diagnóstico passo-a-passo dos problemas operacionais que já enfrentamos. **Consulte-a antes de gastar tempo investigando do zero.**

---

## O que está em produção hoje

### kpi-weddings ✅
- Tudo da v2.6.1 + camada a11y (entregue em 16/abr).
- **v2.7.0 (04/mai):** endpoint `/api/board/weekly` para Cowork + fix detecção reunião closer.
- **v2.8.0 (06/mai):** redesign completo da aba SDR — funil de 6 etapas (Lead → MQL → Agendamento → Reunião → Qualificação → Closer), DealsModal por etapa, modo Coorte/Evento, banner de alertas.
- **v2.8.1 (06/mai, mesma sessão):** iterações sobre o redesign — modo calendário p/ "Este mês" (inclui agendamentos futuros), Lead inclui Elopment (paridade com Funil do Mês), tooltips por etapa com STAGE_DEFINITION, fetch dos 6 grupos WW (1, 3, 4, 12, 17, 31) com buffer 90d.
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

## Histórico da sessão (2026-04-30)

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

## Histórico da sessão atual (2026-05-06)

Iterações sobre o redesign SDR v2 entregue mesmo dia (commit `bc55b6b`). Após
publicação da v2.8.0, o usuário (analista de growth) abriu o dashboard em
produção e encontrou 4 bugs em sequência. Cada um descobriu o próximo —
documentação cronológica abaixo:

1. **Bug 1: Lead == MQL em produção** (`adb5f6d`). Dashboard mostrava ambos com
   245. Causa: `loadFromSupabase` só faz fetch dos grupos 1 e 3, mas o filtro
   MQL-vs-Lead requer também 4 (Planejamento), 17 (Internacional) e 31
   (Desqualificados). Sem esses grupos, o universo Lead == universo MQL. Fix:
   estender `GROUP_TO_PIPELINE` para 5 entries + novo `useEffect` puxando 4/17/31
   em paralelo + novo `wwAllDeals` deduplicado passado ao SDRTab.

2. **Bug 2: AG. CLOSER = 0 em "Este mês"** (`06fe00a`). Print do AC mostrava 7
   reuniões closer agendadas, dashboard zero. Causa dupla descoberta após
   query Supabase: (a) `fetchAllDealsFromDb` filtra `created_at >= start`, então
   deals criados em abril com `data_closer` em maio nem entram no fetch;
   (b) `end = hoje` exclui agendamentos futuros (Tiago 14/05, Camila/Nathalia
   07/05). Fix: nova `resolvePeriodForSdr` que estende `end = endOfMonth` para
   preset "Este mês"; fetch dos 5 grupos com `start − 90 dias`; novo
   `daysElapsedInPeriod` para preservar prorrateio de meta pelo ritmo
   decorrido. Tooltip (i) ao lado de "Este mês" explica o modo.

3. **Bug 3: Lead 260 vs Funil do Mês 340 em abril** (`78c8337`). Inconsistência
   entre abas. Análise: aba Funil do Mês usa `isInWwLeadsPipeline` (5 WW +
   Elopment); SDR usava `isInWwPipeline` + `!is_elopement`. Diferença = 80 deals
   Elopment. Decisão de produto: Lead é entrada bruta (incluindo Elopment),
   MQL é funil de venda (excluindo Elopment). Implementação: `isInLeadScope`
   passa a usar `isInWwLeadsPipeline`; `STAGE_DEFINITION` adiciona tooltip nativo
   por card; subtitle do header ganha glossário inline; teste atualizado para
   "Elopment é Lead, NÃO é MQL"; memória de projeto criada
   (`project_sdr_funnel_definition.md`).

4. **Bug 4: Lead continuou 260 mesmo após 78c8337** (`99ff0eb`). O `isInLeadScope`
   incluía Elopment, mas o fetch do Dashboard ainda não. `GROUP_TO_PIPELINE`
   não tinha grupo 12, e o `useEffect` SDR não puxava esse grupo. Os 80 deals
   Elopment nem chegavam ao motor. Fix: registrar `12 → "Elopment Wedding"` em
   `GROUP_TO_PIPELINE` + adicionar `fetchAllDealsFromDb("12", fetchRange)` ao
   `useEffect` SDR. Validação: Lead em abr/2026 passa para 340.

5. **Documentação consolidada:**
   - JSDoc denso em [lib/metrics-sdr.ts:isInLeadScope/isInMqlScope](lib/metrics-sdr.ts).
   - `STAGE_DEFINITION` em [components/dashboard/SDRTab.tsx](components/dashboard/SDRTab.tsx) — tooltip nativo por card.
   - Subtitle do header com glossário inline.
   - Memória de projeto: [project_sdr_funnel_definition.md](../../.claude/projects/-home-marcelo-DashWW/memory/project_sdr_funnel_definition.md).
   - Bump em `lib/versions.ts` (2.8.0 → 2.8.1) com 13 changes documentadas.
   - Atualização deste `session_state.md`.

**Validações:** `tsc --noEmit` limpo após cada commit. Vitest 305/310 (5 falhas
pré-existentes em `MonthSelector.test.tsx`, fora do escopo). `next build` exit 0.
Validado contra Supabase com queries diretas em abril/2026 e maio/2026 — Lead
e Ag. Closer batem com fonte de verdade (AC + Funil do Mês).

**Lições/feedback registrado:** "valide antes de assumir que funciona". Após o
push do bug 1 reportei como concluído; user precisou empurrar de volta com
outra evidência de que estava quebrado. Resposta correta foi escrever um script
Node com motor real (`scripts/validate-sdr-funnel.mjs`) que mimetiza o que o
Dashboard faz e roda contra Supabase de produção. Padrão a repetir em fixes
não-triviais que dependem de dados reais.

---

## Histórico da sessão (2026-05-04)

Em ordem cronológica:

1. **Briefing técnico do Board** — Marcelo trouxe rascunho v1.0 do briefing para o endpoint `/api/board/weekly` (Cowork como consumer). Lead Tech review identificou 20 gaps em P0/P1/P2/P3; gerou v1.2 com seções 13-19 novas (rollout, ownership, runbook, error examples, roadmap, pendências).
2. **Implementação do endpoint** — `lib/board/*` (12 módulos puros), `app/api/board/weekly/route.ts` (HTTP plumbing), 58 testes Vitest. Migration `20260430_board_endpoint.sql` no dash-webhook (col `sdr_wt_data_fechamento_taxa`, 5 índices, `board_audit_log`, cleanup pg_cron).
3. **Field map AC field 332** — adicionado em `_shared/field-maps.ts` (FIELD_MAP, FIELD_KEY_MAP, DATE_COLS); Edge Functions `sync-deals` + `activecampaign-webhook` re-deployadas via supabase CLI.
4. **Configuração de produção** — `BOARD_API_KEY` + `SUPABASE_SERVICE_ROLE_KEY` setadas no Vercel `weddings-kpi`; redeploy. Aplicada migration via SQL Editor do Supabase.
5. **Smoke test inicial:** primeiro 200 retornou `reunioes_closer: 0` em todas as janelas WW — bandeira vermelha. SQL cross-check no Supabase mostrou que a coluna `reuniao_closer` é dead column (sem FIELD_MAP entry); os campos vivos do AC são `ww_como_foi_feita_reuni_o_closer` (id 299) e `tipo_da_reuni_o_com_a_closer` (id 19).
6. **Fix board (commit `fc3ae66`):** `lib/board/funnel-ww.ts:reuniaoCounts` migrado para detectar via os 2 campos vivos (OR), com trim e exclusão de `'Não teve reunião'` e vazio. Tests atualizados.
7. **Fix dashboard (commit `53a5ebc`):** mesma lógica aplicada em `lib/metrics-jornada.ts`, `lib/metrics.ts`, `lib/funnel-utils.ts`. Paridade restaurada — número de reuniões realizadas no dashboard corrige semanas de subestimação silenciosa.
8. **Smoke test 5 cenários (commits 22c1e53, fc3ae66, 53a5ebc):** WW 200 com `reunioes_closer: 6`, WT 200 com kpi_caveats, 401 sem auth, 400 INVALID_RANGE, 422 INVALID_BRAND. Latência cold-start ~2s, warm ~500ms. Hashes WW=`a0e037…` e WT=`4195e9…` para baseline de drift detection.
9. **Documentação Cowork:** `docs/cowork-instructions.md` (system prompt do Claude Cowork) e `docs/cowork-kickoff-prompt.md` (mensagem para disparar primeiro dry-run + checklist de validação).
10. **Secrets handling:** `BOARD_API_KEY` adicionada ao `.env.local` (gitignored) e doc não-versionado em `/home/marcelo/DashWW/.secrets-cowork.md` com procedimento de rotação. Recomendada rotação antes do cut-over de produção (chave vazou em chat).

---

## Próximos passos (resumo)

### 🔴 Imediato — validação humana (Marcelo)
1. **Cross-check 1 semana real**: comparar `funnel.weekly` do board endpoint para 2026-04-20/26 contra os números do dashboard visual. Se bater → entrega 100% selada.
2. **INSERT em `monthly_targets` para `pipeline_type='trips'`** — hoje retorna `targets.missing: true` em WT.

### 🟡 Curto prazo — destrava ciclo do Cowork
3. Configurar Cowork com `docs/cowork-instructions.md` + `BOARD_API_KEY` (referência: `/home/marcelo/DashWW/.secrets-cowork.md`).
4. **Primeiro dry-run** com `docs/cowork-kickoff-prompt.md` — Cowork chama endpoint, salva JSON + hashes + .pptx, sem publicar para diretoria.
5. **Rotacionar `BOARD_API_KEY`** antes do cut-over (chave vazou em chat).
6. **4 dry-runs consecutivos limpos** → cut-over para produção.

### 🟢 Backlog
7. Decidir o que fazer com o WIP não-commitado do dash-webhook (`_shared/field-maps.ts` deployada via CLI mas ainda untracked no git).
8. Decidir destino do projeto Vercel zumbi do dash-webhook (deletar ou re-deployar).
9. Limpar `wwelcome` no Vercel (cosmético — só para parar o ❌ no GitHub status).
10. Rodar `reprocess-raw-data.mjs` em prod e remover a safety net `recoverOrcamento` depois (Sprint 1 do ROADMAP).
11. Aplicar `20260416_tighten_rls.sql` em prod (RLS hoje "Allow all access" — dívida de segurança).
12. Continuar Sprint 2: índices Supabase + cobertura de testes (ver [ROADMAP.md](./ROADMAP.md)).
13. Backfill de `sdr_wt_data_fechamento_taxa` se quiser histórico WT pré-30/abr.

---

## Snapshot de testes (fim da sessão 06/mai)

- **kpi-weddings Vitest:** **305/310** verdes (256 anteriores + 27 do `metrics-sdr-v2.test.ts` + 22 doutros). Mantidas as 5 falhas pré-existentes em `MonthSelector.test.tsx` (PR #5 Google Ads, sem relação).
- **dash-webhook Vitest:** 72/72 verdes (não houve mudança de código nesta sessão).
- **Type-check (kpi-weddings):** limpo.
- **Build local kpi-weddings:** exit 0 (cleanup ~28s + static gen ~2s).
- **Produção kpi-weddings:** `99ff0eb` em deploy (push 22:21 BRT, deve estar Ready ~1-2min depois). Versão exibida no header: 2.8.1.
- **Validação contra Supabase em produção** (06/mai):
  - Lead em abr/2026 = 340 (225 SDR + 20 Closer + 2 Planej + 1 Internacional + 12 Desqualif + 80 Elopment) ✅ bate com Funil do Mês.
  - MQL em abr/2026 = 247.
  - AG. CLOSER em mai/2026 (modo calendário) = 6 (Mariana, Ana, Cristiane, Nathalia, Camila, Tiago).
