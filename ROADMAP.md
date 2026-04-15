# Roadmap — DashWW

> Plano de sprints forward-looking. Vive ao lado de `session_state.md` (estado presente) e `session_starter.md` (primer).
> Revisar ao fim de cada sprint e ajustar prioridades conforme feedback do comercial.

**Contexto:** dashboard já entregou a Jornada do Lead (v2.6.1) com fundamentos de a11y (v2.6.2, 6 commits atômicos). Próximo bloco é tirar débitos e propagar o padrão de qualidade pro resto do produto.

---

## 🔥 Sprint 1 — Desbloqueios críticos  (1 semana)

**Meta:** garantir que tudo que foi commitado chegue em produção e que a ingestão pare de corromper dados novos.

### Stories
- [ ] **INV-01:** Investigar por que deploys do Vercel não atualizam desde `660120f`. Abrir dashboard → Deployments → ler log de build do último commit. Se falha de build, corrigir; se hook desconectado, reconectar; se env var faltando, adicionar.
- [ ] **DW-01:** Decidir estado local do `dash-webhook`. Opções:
  - Revisar as ~470 linhas de modificações locais nas Edge Functions + commitar `supabase/functions/_shared/` + push
  - OU descartar tudo e reimplementar só o fix de `parseNumber` limpo em cima do último commit remoto
- [ ] **DW-02:** Deploy das Edge Functions corrigidas (webhook + sync-deals) via `supabase functions deploy`.
- [ ] **DATA-01:** Executar `scripts/reprocess-raw-data.mjs` (agora com `parseNumber` corrigido) pra limpar valores de `orcamento` legados no banco. Monitorar execução.
- [ ] **CLEAN-01:** Remover safety net `recoverOrcamento` do `kpi-weddings/lib/supabase-api.ts` (vira dead code após DATA-01). Bump versão pra 2.7.0.

### Definition of Done
- Vercel deploy pro commit mais recente de `main` com status Ready.
- `dash-webhook` com trabalho local resolvido, parseNumber em produção.
- Tabela `deals` sem valores de `orcamento ≥ R$ 1.000.000` (exceto leads legítimos >1M verificados).
- Safety net removida e testes ainda verdes.

---

## 🧱 Sprint 2 — Qualidade: testes + a11y global  (1-2 semanas)

**Meta:** elevar as outras abas ao mesmo patamar de a11y da Jornada e restaurar suite de testes 100% verde.

### Stories
- [ ] **TEST-01:** Corrigir 5 testes falhando em `components/dashboard/__tests__/MonthSelector.test.tsx` — foi refatorado pelo PR #5 Google Ads para usar `react-day-picker` e os testes não migraram.
- [ ] **A11Y-01:** Audit das abas Overview, Funil Metas, SDR, Closer, Pipeline, Contratos, Perfil & Score, Dicionário — aplicar os mesmos 6 princípios da Jornada:
  - Contraste adequado (texto secundário ≥ 4.5:1)
  - `:focus-visible` herdado do global já cobre, mas checar se não tem `outline: none` em lugares específicos
  - aria-label em todos os ícones clicáveis
  - `aria-pressed` / `aria-current` em todos os toggles e navs
  - Touch targets ≥ 36px
  - Cor nunca é único signal
- [ ] **A11Y-02:** Skip link "Pular para conteúdo principal" no `Dashboard.tsx` (visível só no `:focus-visible`).
- [ ] **A11Y-03:** Hierarquia de headings: uma `h1` por página, `h2` por seção, sem pular níveis. Auditar todas as abas.
- [ ] **TEST-02:** Testes de componente (React Testing Library) para `JornadaTab`, `StageChart`, `StageDeepDive` — cobrir os casos: open/close modal com Esc, focus trap, toggle de estado, picker de granularidade.
- [ ] **TEST-03:** Smoke test E2E com Playwright: abrir dashboard → navegar para Jornada → mudar período → clicar num deal → voltar.

### Definition of Done
- Suite de testes 100% verde (≥ 220 testes).
- Lighthouse a11y score ≥ 95 em todas as abas.
- Cobertura automática de teclado: usuário consegue navegar o dashboard inteiro sem mouse.
- Playwright rodando em CI (ou pelo menos disponível localmente).

---

## 📱 Sprint 3 — Mobile responsive  (1 semana)

**Meta:** dashboard utilizável em telas < 768px, especialmente a Jornada (hoje assume 980px de largura).

### Stories
- [ ] **RESP-01:** JornadaTab MiniFunnel — reorganizar em 2 colunas verticais no mobile (ou scroll horizontal com hint).
- [ ] **RESP-02:** StageCard — layout single-column no mobile (número grande em cima, metadados embaixo).
- [ ] **RESP-03:** StageChart — simplificar labels no mobile (menos ticks, legenda acima em vez de ao lado).
- [ ] **RESP-04:** StageDeepDive modal — full-screen no mobile (≥100% height/width).
- [ ] **RESP-05:** DealsModal — table vira card list no mobile, cada deal é um card scrollável.
- [ ] **RESP-06:** Header e tabs — bottom-nav pattern no mobile ou menu hamburger.
- [ ] **TEST-04:** Testar em 375px (iPhone SE), 390px (iPhone 14), 412px (Android), 768px (tablet portrait).

### Definition of Done
- Jornada funcional e legível em 375px+.
- Nenhum scroll horizontal acidental.
- Touch targets preservados ≥ 36px em todas as resoluções.

---

## ⚡ Sprint 4 — Performance e infraestrutura  (1 semana)

**Meta:** dashboard rápido para qualquer usuário, cache persistente, bundle enxuto.

### Stories
- [ ] **PERF-01:** Cache persistente para `/api/metrics` — migrar de in-memory para Redis (Upstash) ou Supabase com TTL.
- [ ] **PERF-02:** Bundle analysis: `next build --profile`, identificar módulos > 50KB, lazy-load o que for secundário (StageDeepDive, ChatTab).
- [ ] **PERF-03:** Server components where possible — Dashboard orquestrador pode virar server component com client islands só nos controles.
- [ ] **PERF-04:** `loading.tsx` + skeleton nos pontos que hoje mostram spinner.
- [ ] **PERF-05:** Image optimization audit — logos e ícones em WebP/SVG, `next/image` com sizes.
- [ ] **PERF-06:** Core Web Vitals: LCP < 2.5s, CLS < 0.1, INP < 200ms.

### Definition of Done
- Lighthouse Performance ≥ 90 em todas as abas.
- Cache sobrevive a restart do Vercel.
- First Contentful Paint < 1.5s na rede 4G.

---

## 🎯 Sprint 5 — Validação com o comercial  (1 semana + loop contínuo)

**Meta:** confirmar que os dados que o dashboard mostra batem com a realidade operacional; coletar pedidos de ajuste.

### Stories
- [ ] **VAL-01:** Sessão de walkthrough com o time comercial — mostrar a Jornada aba por aba, explicar cada número, anotar questionamentos.
- [ ] **VAL-02:** Cruzar os números do dashboard com a planilha que o comercial usa hoje para o período mais recente. Investigar divergências.
- [ ] **VAL-03:** Validar se os motivos de desqualificação estão bem categorizados ou se precisam de novos valores padronizados.
- [ ] **VAL-04:** Coletar as 3 perguntas que eles mais fazem na semana e ver se o dashboard já responde ou precisa de novo widget.
- [ ] **VAL-05:** Documentar os insights descobertos na sessão em `session_state.md`.

### Definition of Done
- Time comercial concorda que os números batem com a realidade.
- Lista de 3-5 pedidos de ajuste priorizada e adicionada ao Roadmap.

---

## 🧪 Sprint 6+ — Backlog futuro (não priorizado)

Candidatos para futuras sprints, dependem do feedback do Sprint 5:

- **Alertas automáticos**: Slack/email quando uma conversão cai abaixo de um threshold por X dias.
- **Coorte de aquisição**: ver como leads de cada fonte (Leadster, Formulário, Instagram…) convertem ao longo de 3-6 meses.
- **Forecast de vendas**: projeção estatística baseada nos últimos N meses de funil.
- **Comparação entre SDRs**: quem performa melhor em qual fase do funil.
- **Timeline do lead**: ver a jornada completa de um deal específico, hora a hora.
- **Export PDF do ClosingBox**: executive summary para compartilhar por email.
- **Dark mode light** — toggle claro/escuro (usuário adiou em sessão anterior, pode voltar).
- **Chat IA contextual**: o Chat IA existe (`ChatTab.tsx`) mas pode virar mais relevante com prompts específicos por aba.
- **Eventos personalizados**: marcação manual (ex: feriado, campanha lançada) que aparecem como bandas cinza nos gráficos.

---

## Princípios para priorização

Quando bater dúvida sobre o que fazer primeiro:

1. **Dados antes de UI.** Um número errado propagado por semanas é pior que uma UI feia.
2. **A11y antes de feature.** Dashboards usados no diário por várias pessoas merecem baseline de acessibilidade.
3. **Feedback do comercial pesa mais que intuição.** Eles usam, a gente supõe.
4. **Prefira refatoração atômica.** 6 commits pequenos > 1 PR gigante. Rollback vira cirúrgico.
5. **Cada sprint termina com atualização em `session_state.md`.** Próxima sessão começa com contexto.
