# Prontidão da geração — Lotofácil

Este checklist serve para decidir se o Loto Lab está operacionalmente pronto para montar um lote da Lotofácil. Ele não transforma score, frequência ou estrutura em previsão.

## Antes de gerar

1. Atualize os dados e confirme que o último concurso armazenado é o imediatamente anterior ao concurso alvo.
2. No Gerador 2.0, confira o concurso alvo e o histórico usado pelo plano.
3. Prefira o núcleo padrão de 8 fixas quando o objetivo for manter maior cobertura entre jogos; 9 e 10 continuam disponíveis para experimentos explícitos.
4. Filtros de paridade, repetição e soma continuam sendo escolhas estruturais, não aumento de probabilidade individual.

## Perfil padrão da Lotofácil

- 15 dezenas por jogo;
- núcleo compartilhado entre 8 e 10 dezenas;
- padrão: 8 fixas;
- repetição preferida: 8–10 dezenas do concurso anterior;
- faixa ampliada aceitável: 7–11 repetidas;
- paridade usada como diversificação de composição, sem impor uma distribuição única;
- linhas e colunas não exigem `3-3-3-3-3`;
- sequências consecutivas não são excluídas automaticamente.

Quando não há filtro explícito de repetição, o gerador mantém 7–11 como guardrail padrão e continua usando 8–10 apenas como preferência de ranking. Um filtro explícito informado pelo usuário pode sobrescrever esse guardrail para experimentos auditáveis.

## Antes de salvar

Na prévia auditável, confira:

- quantidade de jogos;
- concurso alvo;
- núcleo compartilhado;
- dezenas variáveis e cobertura do lote;
- repetidas por jogo e o painel `Perfil da Lotofácil`;
- seed e Preview ID.

O lote salvo deve ser exatamente igual à prévia. Se o histórico anterior ao alvo mudar, o save é recusado e uma nova prévia precisa ser gerada.

## Aposta real

Marque o lote como apostado somente antes de o resultado do concurso alvo estar conhecido. O backend recusa registro retrospectivo como aposta real para não contaminar ROI e desempenho auditável.
