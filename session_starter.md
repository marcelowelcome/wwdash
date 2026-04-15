# Session Starter — DashWW

> Leia este arquivo **primeiro** ao começar uma sessão nova. Dá o contexto mínimo para trabalhar sem precisar redescobrir o projeto.
> Depois, confira o `session_state.md` pra ver o que está em voo e o que está travado.

---

## O que é o DashWW

Dois sub-projetos que compartilham o mesmo Supabase (projeto **ActiveDash**, ref `ypzpkdgdbzruagjixwyc`):

- **`kpi-weddings/`** — Dashboard de KPIs comerciais. Next.js 16 + React 19 + Recharts + Vitest. UI em português.
- **`dash-webhook/`** — Backend de ingestão de dados do ActiveCampaign. Next.js 14 + Supabase Edge Functions. Inclui um webhook (por key/nome do campo) e um sync incremental (por ID do campo, via pg_cron a cada 2h).

Ambos os projetos leem/escrevem na tabela `deals`. O dashboard lê; o webhook escreve.

---

## Regras críticas do projeto

1. **NUNCA inventar números.** Todo valor numérico no dashboard tem que vir do banco. Campo nulo → exibir `—`, não estimar.
2. **Supabase autorizado = só ActiveDash.** Nunca tocar em outros projetos da conta.
3. **Interface em português** — labels, mensagens de erro, prose.
4. **Build/test no WSL:** `npm`/`npx` falham; usar node direto: `/home/marcelo/.nvm/versions/node/v24.14.0/bin/node node_modules/...`

---

## Onde olhar primeiro

### kpi-weddings (dashboard)
- **Camada de dados:** `lib/supabase-api.ts` (contém `DEAL_COLUMNS`, `mapRowToWonDeal`, `fetchAllDealsFromDb`, `recoverOrcamento`).
- **Schema:** `lib/schemas.ts` (`WonDeal` é o tipo central).
- **Motores puros (sem I/O):**
  - `lib/metrics.ts` — métricas gerais
  - `lib/metrics-sdr.ts` — recorte SDR
  - `lib/metrics-jornada.ts` — a aba Jornada (mais recente, 7 estágios, coorte/evento, dropouts)
  - `lib/metrics-overview.ts`, `lib/metrics-contracts.ts`, `lib/lead-score.ts`, `lib/funnel-utils.ts`
- **UI:** `components/Dashboard.tsx` (orquestrador) + `components/dashboard/*.tsx`.
- **Tabs:** Visão Geral, Jornada, Funil, SDR, Closer, Pipeline, Contratos, Perfil & Score, Dicionário, Chat IA.
- **Testes:** `lib/__tests__/*.test.ts` (Vitest). 190 testes hoje.

### dash-webhook (ingestão)
- **Fonte única de mapeamentos:** `supabase/functions/_shared/field-maps.ts`.
  ⚠️ Ver `session_state.md` — a pasta `_shared/` tem estado local não commitado.
- Edge Function do sync: `supabase/functions/sync-deals/index.ts`.
- Edge Function do webhook: `supabase/functions/activecampaign-webhook/index.ts`.
- Trigger PostgreSQL `deals_upsert_newer_only` previne race condition webhook × cron.

---

## Documentação de referência

Antes de alterar algo, cheque qual documento é autoritativo:

- **`ARCHITECTURE.md`** — módulos, responsabilidades, fluxo.
- **`PROMPT_CONTEXT.md`** — contratos de cada módulo (inputs, outputs, o que NÃO fazer).
- **`lib/versions.ts`** — changelog vivo. A cada alteração significativa, adicione uma entrada no topo.
- **`lib/metrics-definitions.ts`** — dicionário de métricas (negócio, não técnica).
- **`dash-webhook/docs/DATA_DICTIONARY.md`** — dicionário dos campos do banco.
- **`session_state.md`** — estado presente da sessão em curso.

---

## Comandos típicos

```bash
# Dev local (kpi-weddings)
cd kpi-weddings
/home/marcelo/.nvm/versions/node/v24.14.0/bin/node node_modules/next/dist/bin/next dev

# Type-check
cd kpi-weddings
/home/marcelo/.nvm/versions/node/v24.14.0/bin/node node_modules/typescript/bin/tsc --noEmit

# Testes
cd kpi-weddings
/home/marcelo/.nvm/versions/node/v24.14.0/bin/node node_modules/vitest/vitest.mjs run

# Build de produção
cd kpi-weddings
/home/marcelo/.nvm/versions/node/v24.14.0/bin/node node_modules/next/dist/bin/next build
```

---

## Padrões de trabalho

- **Motores de métrica** = funções puras, sem I/O, sem referenciar UI. Entrada `WonDeal[]` + período → saída tipada.
- **Componentes de UI** = consomem o resultado dos motores, não calculam.
- **Mudanças visuais** = testar no browser local (http://localhost:3000) antes de reportar pronto. Type-check e testes verificam correção de código, não de feature.
- **Sem classes Tailwind nos charts** — usar objeto `T` da paleta centralizada em `components/dashboard/theme.ts`.
- **Nunca criar docs novos sem pedido explícito.** Atualize os existentes.
- **Commits:** específicos por feature, nunca `git add -A` nem `git add .`. Os WIPs antigos (`sdr_dash_v2.jsx`, `sdr_investigation_dash.jsx`, `scripts/`) continuam untracked propositalmente.

---

## Fluxo típico de uma tarefa

1. Ler `session_state.md` para ver o estado atual e pendências.
2. Ler `PROMPT_CONTEXT.md` da área afetada para entender contratos.
3. Escrever código. Se tocar lógica de negócio → testar com Vitest.
4. `tsc --noEmit` + suite de testes verde antes de reportar.
5. Se for mudança UI, subir dev server e conferir no browser.
6. Atualizar `versions.ts` com a entrada do changelog.
7. Atualizar `session_state.md` com o que foi feito e o que ficou aberto.
8. Commitar com mensagem clara; só pushear se o usuário pedir.

---

## Pontos de atenção

- **Período MoM:** comparação justa usa subtração calendárica (Abril 1-15 vs Março 1-15), não janela deslizante. A função `previousPeriod()` em `metrics-jornada.ts` é a referência.
- **Show-up rates** (reuniões realizadas): denominator é `pastCount` da etapa anterior, não o total marcado — evita penalizar reuniões futuras como no-show.
- **Coorte vs Evento:** dois modos com semânticas diferentes. Coorte = "pessoas que entraram no período + onde estão hoje". Evento = "eventos que aconteceram no período, independente de quando o lead entrou". Ambos disponíveis no toggle da aba Jornada.
- **Vercel:** há um histórico recente de deploys não atualizarem. Se acontecer, primeiro passo é abrir o painel e pedir o log de build.
