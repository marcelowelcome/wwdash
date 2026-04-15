# Session State — DashWW

**Última atualização:** 2026-04-16
**Versão em produção:** 2.6.1
**Branch:** `main`
**Último commit:** `660120f` (kpi-weddings)

> Documento vivo — atualize a cada sessão encerrada. Registra o *estado presente* (o que está pronto, em voo, travado).

---

## O que está em produção hoje

### kpi-weddings ✅
- Aba **Jornada do Lead** com 4 sub-views (Entrada e Agendamento, Reunião e Qualificação, Fechamento, Visão Completa).
- MiniFunnel horizontal com 7 etapas, metas coloridas e PoP.
- Toggle Coorte/Evento e Narrada/Detalhada.
- StageChart por sub-view (linha/barra/área, granularidade diária/semanal/mensal, overlay do período anterior).
- StageDeepDive por etapa: respostas do lead (destino, cidade, orçamento em faixas, número de convidados em faixas, previsão de casamento, previsão de assessoria, status do relacionamento, costumam viajar, já foi em DW, já tem destino definido, **como conheceu a WW**) + registro do SDR (**como foi feita a 1ª reunião**, **tipo de reunião com Closer**, qualificado para SQL, motivos de qualificação, motivos de desqualificação, motivo de perda).
- Deep Dive esconde blocos e grupos sem contexto automaticamente.
- ClosingBox por sub-view com prosa, diagnóstico e sugestões de ação.
- Dropout analysis entre cada par de etapas (por stage AC e por motivo, com trend PoP).
- DealsModal com linhas clicáveis (abre deal no AC).
- Safety net em `mapRowToWonDeal` que recupera valores de orçamento legados com formatação corrompida (≥ R$ 1M, divisíveis por 100 → divide por 100).

### dash-webhook ⏸️
- **Sem alterações deployadas desde 7fbf5e1.** O parseNumber corrigido (BR-aware) está **apenas local** em `supabase/functions/_shared/field-maps.ts`, `scripts/backfill-deals.mjs` e `scripts/reprocess-raw-data.mjs`. Não commitado.
- Estado local tem ~470 linhas de refatoração nas Edge Functions (`activecampaign-webhook`, `sync-deals`) que movem campos duplicados para `_shared/`. Também não commitado.
- A pasta `supabase/functions/_shared/` inteira é untracked no git apesar de ser referenciada como "fonte única v2.0" na documentação interna (vide memória do projeto).

---

## Pendências abertas

### Dash-webhook — desempatar o estado local
- Decidir: commitar a refatoração local das Edge Functions (~470 linhas) + pasta `_shared/` como está, ou revisar antes? Quem escreveu essa parte não é o Claude.
- Quando a ingestão consertada for deployada, rodar `scripts/reprocess-raw-data.mjs` pra corrigir os valores legados de `orcamento` no banco. Com isso a safety net no kpi-weddings vira dead code (pode ser removida depois).

### Deploy do Vercel
- Último report do usuário: commits novos na `main` do kpi-weddings não estão atualizando no Vercel.
- Meu código não tem erro (type-check + 28 testes verdes + dev local 200).
- Candidatos prováveis: build no Vercel falhando por causa da integração Google Ads (PRs #4 e #5 do colaborador @PaNdassauro) ou hook desconectado.
- **Ação pendente:** usuário precisa abrir o painel do Vercel → Deployments, olhar o último deploy para `660120f` e mandar o log de erro, se houver.

### Dívida técnica conhecida
- Safety net de orçamento é heurística — se um lead legítimo tiver orçamento ≥ R$ 1M com últimos 2 dígitos 00, vai ser silenciosamente dividido por 100. Trade-off aceito enquanto não rola o reprocess.
- WIPs antigos no kpi-weddings (`sdr_dash_v2.jsx`, `sdr_investigation_dash.jsx`, `scripts/` com 5 arquivos de audit/fix de mar/12-13) continuam untracked. Sem plano imediato.
- Testes E2E (Playwright/Cypress) ainda não existem.

---

## Ambiente

- **Servidor dev local:** http://localhost:3000 — rodando em background desde o início da sessão.
- **Build/Test no WSL:** `npm`/`npx` falham, usar node direto (vide `MEMORY.md`).
- **Última rodada de testes:** 190 testes kpi-weddings (28 dos quais do `metrics-jornada`), tudo verde. Há 2 testes pré-existentes falhando em `metrics-sdr.test.ts` (não relacionados à Jornada).
- **Type-check:** limpo.

---

## Histórico da sessão atual (2026-04-16)

Em ordem cronológica, as decisões chave e o que foi entregue:

1. Usuário pediu uma visualização para diagnosticar a queda de volume comercial apontada pelo time (3 reuniões closer em 15 dias). Caminho desenhado: funil em 4 telas (MKT→SDR, SDR→Closer, Closer→Venda, Visão Completa) com tom sério e didático.
2. Implementada aba Jornada completa (7 estágios + modo coorte/evento + comparação calendárica fair MoM).
3. Adicionados: MiniFunnel horizontal, Narrada/Detalhada toggle, StageChart com metric picker e granularidade, DealsModal clicável, ClosingBox com diagnóstico automático, dropout analysis com motivos e trend PoP.
4. StageDeepDive reformulado de "fonte/dono/destino/canal" para "respostas do lead + registro do SDR".
5. Detectado bug no parseNumber da ingestão (formato BR stripado gera orçamentos inflados 100x). Corrigido em dash-webhook (local) + safety net na leitura do kpi-weddings.
6. Expostos `como_conheceu_a_ww`, `como_foi_feita_a_1a_reuniao`, `tipo_reuniao_closer` no deep dive.
7. Blocos e grupos sem contexto são agora escondidos automaticamente.
8. 3 commits no kpi-weddings empurrados pra `main`. dash-webhook mantido local por pendência de revisão do WIP pré-existente.
9. Documentação atualizada: `versions.ts` (2.6.0 e 2.6.1), `ARCHITECTURE.md`, `PROMPT_CONTEXT.md`, novos `session_state.md` e `session_starter.md`.
