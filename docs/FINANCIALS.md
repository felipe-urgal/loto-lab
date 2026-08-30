# Metodologia financeira

Este documento descreve como o Loto Lab calcula custo, premiação, cobertura financeira, resultado e ROI sem confundir dado desconhecido com zero.

Há duas famílias de métricas que usam bases diferentes:

- **experimentos históricos** — backtests/Laboratório usam preços e rateios do concurso histórico;
- **apostas reais** — usam o custo efetivamente informado pelo usuário e apenas apostas financeiramente conferidas no denominador do ROI.

## Princípios

- usar condições conhecidas no próprio concurso histórico;
- não aplicar preço atual retroativamente;
- não inventar preço para períodos sem baseline suportada;
- usar o rateio oficial do concurso quando disponível;
- diferenciar prêmio zero de prêmio desconhecido;
- não tratar aposta real pendente como perda;
- preservar correções oficiais posteriores em trilha auditável.

## Preços históricos suportados

Os períodos são definidos em `src/finance/pricing.ts`.

### Mega-Sena

| Vigência | Aposta simples |
| --- | ---: |
| a partir do concurso 2207 | R$ 4,50 |
| a partir do concurso 2588 | R$ 5,00 |
| a partir de 09/07/2025 | R$ 6,00 |

Concursos anteriores ao 2207 continuam válidos para análise estatística, mas não recebem preço financeiro inventado.

### Lotofácil

| Vigência | Aposta simples |
| --- | ---: |
| a partir do concurso 1889 | R$ 2,50 |
| a partir do concurso 2801 | R$ 3,00 |
| a partir de 09/07/2025 | R$ 3,50 |

Concursos anteriores ao 1889 continuam válidos estatisticamente, mas ficam fora de métricas que exigem preço suportado.

### Dia de Sorte

| Vigência | Aposta simples |
| --- | ---: |
| concursos 1–752 | R$ 2,00 |
| a partir de 03/05/2023 / concurso 753 | R$ 2,50 |

## Premiação oficial

O adapter da CAIXA persiste, quando disponível:

- faixas de prêmio (`prizeTiers`);
- quantidade de ganhadores por faixa;
- valor individual da faixa;
- arrecadação (`amountCollected`);
- Mês da Sorte no Dia de Sorte.

O checker procura a faixa correspondente à quantidade de acertos e usa o valor publicado no próprio concurso.

No Dia de Sorte, o prêmio do Mês da Sorte é independente e cumulativo com o prêmio numérico quando ambos forem conhecidos.

## Zero conhecido x dado desconhecido

Esses estados são diferentes e não podem ser colapsados:

- jogo abaixo da faixa mínima premiada → prêmio conhecido `0`;
- jogo que atingiu faixa premiada sem tier persistido → prêmio desconhecido;
- Mês da Sorte acertado sem tier correspondente → total desconhecido;
- concurso estatisticamente conferido com grade financeira incompleta → resultado financeiro ainda indefinido.

O sistema não substitui informação ausente por `0` só para conseguir calcular ROI.

## Cobertura financeira completa

Um concurso é considerado financeiramente completo somente quando possui todas as faixas esperadas:

- Mega-Sena: 4, 5 e 6 acertos;
- Lotofácil: 11, 12, 13, 14 e 15 acertos;
- Dia de Sorte: 4, 5, 6 e 7 acertos + Mês da Sorte.

Uma grade parcial não é suficiente para declarar cobertura financeira completa.

## Backtests e Laboratório

### Custo total

`totalCost` representa o custo de todos os jogos simulados para os quais existe preço histórico suportado pelo contrato da execução.

### Cobertura financeira

```text
financialCoverage = financialGames / totalGames
```

Ela informa qual proporção dos jogos possui informação suficiente para calcular prêmio real sem imputação.

### Custo financeiro

`financialCost` contém somente o custo dos jogos cujo resultado financeiro é conhecido.

Essa é a base usada no ROI histórico.

### Retorno bruto

```text
returnRate = totalPrizeValue / financialCost
```

`1.20` significa retorno bruto de 120% do custo financeiramente coberto.

### ROI histórico

```text
roi = (totalPrizeValue - financialCost) / financialCost
```

Exemplos:

- `0.20` = +20%;
- `0` = empate financeiro;
- `-0.50` = perda de 50% da base financeiramente coberta.

Ao comparar estratégias, a cobertura financeira precisa ser considerada junto do ROI. Um ROI calculado sobre poucos concursos não deve ser lido como equivalente a outro com cobertura substancialmente maior.

## Apostas reais

Apostas reais não usam tabela histórica de preço para substituir o valor efetivamente pago.

O usuário informa `actualCost` ao registrar a aposta. O resumo separa:

- `actualCost` — gasto registrado, incluindo apostas pendentes;
- `checkedCost` — custo somente das apostas financeiramente resolvidas;
- `totalPrizeValue` — prêmio das apostas financeiramente resolvidas;
- `netResult` — `totalPrizeValue - checkedCost`;
- `roi` — `netResult / checkedCost`.

Apostas aguardando resultado ou rateio completo não entram no `checkedCost`; portanto não viram perda artificial.

Ao agregar loterias no Painel, o ROI deve ser recalculado sobre os totais:

```text
ROI agregado = soma(netResult) / soma(checkedCost)
```

Nunca fazer média simples de percentuais individuais.

Detalhes em [`REAL_BETS.md`](REAL_BETS.md).

## Correções oficiais posteriores

A sincronização operacional revisita rateios recentes relevantes.

Quando uma grade completa nova altera prêmio ou resultado líquido de uma aposta real já conferida:

- o valor é recalculado;
- o timestamp original de conferência é preservado;
- a mudança é registrada em `real_bet_financial_revisions`;
- o KPI passa a refletir o dado oficial revisado.

Uma resposta oficial parcial posterior não deve apagar uma grade completa já conhecida.

## Dados JSON legados

O projeto ainda mantém comandos `data:sync` e `data:refresh` para o store JSON legado/compatibilidade.

Se um arquivo local `data/contests.json` foi produzido antes de existir cobertura financeira suficiente, ele pode conter concursos sem rateio. Para enriquecer um intervalo já existente no arquivo, use:

```bash
npm run data:refresh -- <lottery> <startContest> <endContest> [dataPath]
```

Exemplo:

```bash
npm run data:refresh -- lotofacil 3500 3767 data/contests.json
```

A operação principal atual, porém, usa PostgreSQL. Para uma instalação PostgreSQL, prefira `db:bootstrap`, `db:sync` e `ops:sync` conforme [`DATA_OPERATIONS.md`](DATA_OPERATIONS.md).

## Limitações

ROI histórico ou real é uma medida de desempenho financeiro observado. Ele:

- não prevê retorno futuro;
- não altera a probabilidade matemática dos sorteios;
- não valida sozinho uma estratégia;
- deve ser interpretado junto de cobertura, período, tamanho da amostra e controles metodológicos.
