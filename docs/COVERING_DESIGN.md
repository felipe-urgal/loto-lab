# Covering Design / Desdobramento

## Objetivo

A finalidade `coverage` do Gerador 2.0 constrói um conjunto de apostas para maximizar a cobertura de subconjuntos de um pool informado pelo usuário.

O algoritmo não prevê resultados. Ele resolve um problema combinatório: cobrir o maior número possível de subconjuntos-alvo com um limite de apostas e/ou orçamento.

## Contrato

Entradas principais:

- `coveragePoolNumbers`: universo restrito de dezenas.
- `betSize`: quantidade de dezenas por aposta.
- `coverageTargetSize`: tamanho de cada subconjunto que deve ser coberto.
- `gameCount`: quantidade máxima de apostas.
- `coverageBudgetCents`: orçamento máximo opcional.
- filtros estruturais existentes continuam aplicáveis aos candidatos.

O resultado registra:

- algoritmo e versão;
- pool utilizado;
- total de subconjuntos-alvo;
- subconjuntos cobertos;
- razão de cobertura;
- indicador de cobertura completa;
- quantidade de apostas selecionadas;
- custo efetivo.

## Garantia condicional

`isCompleteCoverage=true` significa somente que todos os subconjuntos do tamanho configurado dentro do pool informado estão contidos em pelo menos uma aposta gerada.

Isso é uma garantia combinatória condicionada ao pool e ao modelo configurados. Não significa:

- que o pool contém as dezenas do próximo sorteio;
- que o conjunto encontrado usa o menor número possível de apostas;
- que há aumento comprovado da probabilidade de uma combinação individual.

Quando `coverageRatio < 1`, a interface deve apresentar cobertura parcial e nunca usar linguagem de garantia.

## Algoritmo

A versão inicial usa Greedy Set Cover determinístico:

1. constrói os subconjuntos-alvo do pool;
2. enumera apostas candidatas válidas;
3. escolhe a aposta que cobre mais subconjuntos ainda descobertos;
4. usa a ordem combinatória estável como desempate;
5. encerra por cobertura completa, limite de apostas ou orçamento.

A versão é persistida como `greedy-set-cover-v1`.

## Limites operacionais

Para impedir explosão combinatória, a versão inicial recusa configurações acima de:

- 200.000 apostas candidatas;
- 200.000 subconjuntos-alvo.

Esses limites são de segurança operacional, não limites matemáticos da modalidade.

## Modalidades iniciais

A primeira versão fica habilitada para modalidades numéricas com preço oficial modelado no domínio:

- Mega-Sena
- Lotofácil
- Quina
- Dupla Sena

Modalidades com campos secundários/posicionais permanecem fora até existir modelagem explícita da cobertura desses componentes.
