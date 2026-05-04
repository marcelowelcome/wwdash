# Kickoff prompt — primeiro dry-run do Cowork

> **Para quem:** Marcelo
> **Como usar:** depois de configurar o Claude Cowork com [`cowork-instructions.md`](./cowork-instructions.md) e a `BOARD_API_KEY`, abra um chat novo com o Cowork e cole **a mensagem abaixo**. É o gatilho do primeiro dry-run.

---

## Mensagem para colar no Cowork

```
Olá Cowork. Hoje vamos fazer o primeiro DRY-RUN do board executivo
automatizado.

Modo: dry-run (NÃO publique, NÃO envie para a diretoria).
Objetivo: validar que o endpoint está respondendo corretamente e
que o seu rendering está fiel aos números.

Faça o seguinte:

1. Calcule a semana fechada anterior (Mon–Sun da semana passada).
2. Chame o endpoint /api/board/weekly para brand=ww.
3. Chame o endpoint /api/board/weekly para brand=wt.
4. Para cada chamada, salve o JSON cru em cache/board-<brand>-...json.
5. Gere o .pptx no template padrão do Board Executivo Marketing,
   marcando "DRY-RUN — não distribuir" no slide de título.
6. Persista os hashes em cache/last-hash-<brand>.txt.

Ao final, me envie nesta conversa:
  (a) o JSON cru de WW
  (b) o JSON cru de WT
  (c) os 2 hashes (ww e wt) que você persistiu
  (d) o link/anexo do .pptx gerado
  (e) qualquer warning, retry ou disclaimer que você mostrou

Importante: NÃO calcule métricas você mesmo. Use sempre os valores
exatos que vieram do endpoint. Se algum campo estiver null ou
missing, exiba "—" ou "Meta não definida" conforme as instruções.

Se em qualquer ponto você receber 4xx ou 5xx persistente, PARE e
me avise por email + nesta conversa, com o status code e o body
do erro.

Vamos lá.
```

---

## O que validar quando o Cowork retornar

### 1. JSON de WW

Procure por:
- `meta.version == "v1"` ✅
- `meta.kpi_definitions_hash` é uma string SHA-256 (64 chars hex) ✅
- `meta.data_freshness.stale == false` ✅ (se `true`, sync atrasada — Marcelo investiga)
- `meta.data_freshness.syncs_in_period >= 80` ✅ (84 é o ideal; cron 2h × 7 dias)
- `funnel.weekly` tem 5 campos esperados (leads_gerados, qualificados_sdr, reunioes_closer, contratos_vol, conversao_sdr_closer_pct, is_complete)
- `funnel.weekly.is_complete == true` ✅ (semana fechada)
- `targets` tem números (não `missing: true`)

### 2. JSON de WT

Mesmas validações estruturais, com:
- `meta.kpi_caveats` deve ter **1 entrada** (a aproximação de qualificados WT)
- `funnel.weekly` tem 3 campos: leads_gerados, qualificados, vendas
- `targets.missing` provavelmente `true` (se você ainda não inseriu meta WT na tabela `monthly_targets` — ver pendência #3 da memória `project_board_endpoint_v1`)

### 3. Hashes

Anote os 2 hashes que o Cowork retornar. Eles devem ser estáveis entre semanas. Da próxima vez que rodar, deve voltar **idêntico** — caso contrário, alguém mudou as fórmulas e isso precisa ser intencional.

Para referência, no smoke test feito em 2026-05-04 os hashes eram:
- WW: `a0e0376028164e08970b4a4325b52594f98fc3fea4adc861b4860bdc80b9174d`
- WT: `4195e9334dc16bfb91106ec82b578616ebdace41c26cbe226c4419f83ac2e82b`

### 4. O `.pptx`

Abra o arquivo gerado e confira:
- O título tem "DRY-RUN — não distribuir" (ou marcação equivalente)
- Os números na lâmina batem **exatamente** com o JSON
- Disclaimers aparecem se algum bloco está incompleto ou se há `kpi_caveats`
- Conversão `null` aparece como `—`, não como "0%" ou "NaN"

### 5. Cross-check com o dashboard

Abra https://weddings-kpi.vercel.app/ logado, navegue para a aba **Jornada do Lead** filtrada para a mesma semana. Confira que os 4 números principais (leads, qualificados, reuniões, contratos) batem com o que veio do endpoint.

Pequenas diferenças de ±1 podem acontecer em dias de borda (sync entre o momento da chamada e o momento da consulta visual). Diferenças grandes = bug a investigar.

---

## Critério de cut-over para produção

Depois do primeiro dry-run, repita por **4 segundas-feiras consecutivas** (4 semanas de dry-run). Se em todas as 4 ocorrências:
- não houve 5xx
- hashes não mudaram inesperadamente
- números bateram com cross-check do dashboard
- nenhum disclaimer surpreendente apareceu

→ **Cut-over**: na 5ª segunda, peça ao Cowork para gerar o board em modo **produção** (envia para diretoria) em vez de dry-run.

A cada cut-over, atualize a entrada de memória `project_board_endpoint_v1.md` com o status novo.

## Em caso de regressão

Se em qualquer dry-run aparecer comportamento inesperado, volte para o dry-run na semana seguinte e investigue. Não force cut-over com problemas pendentes — preferível atrasar 1 semana do que enviar diretoria com número errado.
