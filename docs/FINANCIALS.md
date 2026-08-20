# Metodologia financeira

Este documento descreve como o Loto Lab calcula custo, premiação e ROI.

## Princípio

O backtest financeiro deve usar as condições disponíveis no concurso histórico:

- preço da aposta simples vigente naquele período;
- valor real do rateio publicado pela CAIXA naquele concurso;
- Mês da Sorte tratado como prêmio independente e cumulativo no Dia de Sorte.

O sistema não deve aplicar o preço atual retroativamente a todos os concursos.

## Preços históricos suportados

### Mega-Sena

| Vigência | Aposta simples |
| --- | ---: |
| concurso 2207 até antes do reajuste de 2023 | R$ 4,50 |
| a partir do concurso 2588 | R$ 5,00 |
| a partir de 09/07/2025 | R$ 6,00 |

Concursos anteriores ao 2207 não têm preço histórico suportado pelo motor e são rejeitados em vez de receber um preço estimado.

### Lotofácil

| Vigência | Aposta simples |
| --- | ---: |
| concurso 1889 até antes do reajuste de 2023 | R$ 2,50 |
| a partir do concurso 2801 | R$ 3,00 |
| a partir de 09/07/2025 | R$ 3,50 |

Concursos anteriores ao 1889 não têm preço histórico suportado pelo motor.

### Dia de Sorte

| Vigência | Aposta simples |
| --- | ---: |
| até 02/05/2023 | R$ 2,00 |
| a partir de 03/05/2023, concurso 753 | R$ 2,50 |

## Premiação real

O adapter da CAIXA armazena, quando disponíveis:

- `listaRateioPremio` como `prizeTiers`;
- quantidade de ganhadores por faixa;
- valor individual pago por faixa;
- `valorArrecadado` como `amountCollected`.

O checker procura a faixa correspondente à quantidade de acertos e usa o valor publicado no próprio concurso.

No Dia de Sorte, quando o Mês da Sorte também é acertado, seu prêmio é somado ao prêmio numérico.

## Dados antigos já sincronizados

Um arquivo `data/contests.json` criado antes do Milestone 5 pode conter resultados sem rateio.

O comando incremental `data:sync` continua buscando apenas concursos ausentes. Para enriquecer concursos já existentes, use:

```bash
npm run data:refresh -- <lottery> <startContest> <endContest> [dataPath]
```

Exemplo:

```bash
npm run data:refresh -- lotofacil 3500 3767 data/contests.json
```

## Métricas

### Custo total

`totalCost` é o custo de todos os jogos simulados, mesmo quando algum concurso não possui rateio armazenado.

### Cobertura financeira

`financialCoverage = financialGames / totalGames`

Ela informa qual proporção dos jogos possui dados suficientes para calcular prêmio real.

### Custo financeiro

`financialCost` contém somente o custo dos jogos para os quais o concurso possui rateio disponível.

Essa é a base usada no ROI, evitando penalizar o resultado por concursos sem dados de premiação.

### Retorno

`returnRate = totalPrizeValue / financialCost`

Exemplo: `1.20` significa retorno bruto equivalente a 120% do valor investido no período coberto.

### ROI

`roi = (totalPrizeValue - financialCost) / financialCost`

Exemplos:

- `0.20` = +20%;
- `0` = empate;
- `-0.50` = perda de 50% do valor investido.

## Regra de comparação

Ao comparar estratégias, priorizar primeiro a maior cobertura financeira e depois o ROI. Uma estratégia com 100% de cobertura não deve ser comparada como equivalente a outra cujo ROI foi calculado sobre uma fração pequena do período.

## Limitação

O ROI histórico mede como a estratégia teria se comportado nos concursos analisados. Ele não prevê retorno futuro e não altera as probabilidades matemáticas das loterias.
