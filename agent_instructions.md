# AGENT INSTRUCTIONS — REGRAS DE DESENVOLVIMENTO

Você é um assistente de desenvolvimento trabalhando neste projeto.
Antes de qualquer ação, leia e siga rigorosamente estas instruções.

---

## 1. LEIA O CONTEXTO ANTES DE AGIR

Antes de criar ou modificar qualquer coisa:
1. Leia o `PROMPT_CONTEXT.md` na raiz do projeto
2. Identifique qual módulo será afetado
3. Leia a seção correspondente a esse módulo
4. Só então proponha ou execute mudanças

Se o PROMPT_CONTEXT.md não existir, pergunte antes de continuar.

---

## 2. RESPEITE AS FRONTEIRAS DOS MÓDULOS

Cada módulo tem responsabilidades definidas. Nunca:
- Adicione lógica de negócio em componentes de UI
- Acesse o banco de dados fora da camada de serviços
- Faça fetch de dados dentro de funções puras
- Cruze responsabilidades entre módulos para "simplificar"

Se a tarefa exige cruzar fronteiras, sinalize isso explicitamente
e proponha a solução correta antes de implementar.

---

## 3. ESCOPO MÍNIMO DE MUDANÇA

Modifique apenas o necessário para cumprir a tarefa.
- Não refatore código que não foi pedido
- Não renomeie variáveis por preferência estética
- Não mova arquivos sem solicitação explícita
- Não adicione dependências sem avisar e justificar

---

## 4. CONTRATOS NÃO MUDAM SEM AVISO

Interfaces, tipos, props e assinaturas de função são contratos.
Se a tarefa exige mudar um contrato:
- Avise explicitamente antes de fazer
- Informe quais outros módulos serão impactados
- Aguarde confirmação antes de prosseguir

---

## 5. ARQUIVO NOVO = REGRAS OBRIGATÓRIAS

Ao criar qualquer novo arquivo:
- Nome deve descrever exatamente o que o arquivo faz
- Um arquivo = uma responsabilidade
- Máximo de 150 linhas (se passar, é sinal de que deve ser dividido)
- Adicione um comentário de 1 linha no topo descrevendo o propósito

---

## 6. ATUALIZE O PROMPT_CONTEXT.md SEMPRE

Ao finalizar qualquer tarefa que modifique um módulo:
1. Revise a seção correspondente no PROMPT_CONTEXT.md
2. Atualize o que mudou (inputs, outputs, dependências, decisões)
3. Informe o que foi atualizado no resumo final da tarefa

---

## 7. FORMATO DO RESUMO FINAL

Ao concluir qualquer tarefa, responda com este formato:

### O que foi feito
[descrição objetiva]

### Arquivos modificados
- arquivo.ts → motivo da mudança

### Arquivos criados
- arquivo.ts → propósito

### Contratos alterados
- [nenhum] ou [lista com impacto]

### PROMPT_CONTEXT.md atualizado?
- [sim, seção X] ou [não foi necessário]

### Próximo passo sugerido
[opcional — só se houver algo relevante]

---

## 8. EM CASO DE DÚVIDA, PERGUNTE

Se a tarefa for ambígua ou exigir decisões arquiteturais,
não assuma. Apresente as opções com os trade-offs e aguarde
uma decisão antes de implementar.