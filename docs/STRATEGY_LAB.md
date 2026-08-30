# Laboratório de Estratégias

O Laboratório compara variações da metodologia sobre o mesmo recorte histórico.

A finalidade é medir hipóteses de composição, não prever sorteios.

## Princípio

> **Algoritmo calcula; IA interpreta.**

Toda comparação é reproduzível pelo core. O resultado do concurso-alvo nunca é entregue ao gerador antes da geração daquele round.

Além de proteção contra vazamento futuro, a validação histórica aplica uma regra comum de elegibilidade: um concurso só é usado como alvo quando o seu predecessor imediato existe na base. Uma lacuna não pode transformar um concurso mais antigo em “concurso anterior”.

## Experimentos

### 1. Núcleo fixo

Compara o tamanho do núcleo mantendo o restante da execução igual.

- Mega-Sena: 0, 2 ou 3 fixas;
- Lotofácil: 8, 9 ou 10 fixas;
- Dia de Sorte: 0, 2 ou 3 fixas.

Os padrões operacionais continuam 3 fixas na Mega-Sena, 8 na Lotofácil e 3 no Dia de Sorte enquanto não houver evidência robusta para mudar.

### 2. Modelos de score

O experimento `score-model` compara:

- `score-v2` — desvio em relação ao esperado ajustado pelo tamanho da amostra;
- `score-v1` — normalização min/max legada;
- `no-score` — controle estrutural com score neutro.

A pergunta é:

> **O ranking adiciona valor mensurável além da estrutura do gerador?**

O `no-score` não usa mais o número da dezena como desempate implícito. Quando vários candidatos ficam empatados, uma ordem pseudoaleatória estável e reproduzível é derivada do contexto histórico. Assim o controle não favorece sistematicamente dezenas menores como `01`, `02`, `03`.

### 3. Regras externas da Mega-Sena

O experimento `external-rules` permanece separado e está disponível somente para Mega-Sena.

Ele formaliza como hipóteses reproduzíveis:

- grupo histórico das 26 dezenas;
- mínimo de 2 ou 3 dezenas desse grupo;
- ausência de dezenas consecutivas;
- ausência de repetição de coluna vertical;
- paridade exata 3/3;
- presença dos 4 quadrantes;
- pacotes combinados das regras.

Grupo utilizado:

`04 05 07 12 13 16 17 23 24 29 30 32 33 37 38 41 42 43 47 49 50 51 53 54 58 59`

Todas as variantes usam `fixedCount = 0` para não confundir efeito da regra externa com efeito de núcleo.

Essas regras são hipóteses experimentais, não verdade matemática.

## Controle aleatório por distribuição

Cada execução gera entre 10 e 500 controles aleatórios reproduzíveis.

A interface usa por padrão:

- pelo menos **100 controles** nas famílias de 3 variantes (`fixed-core` e `score-model`);
- pelo menos **250 controles** na família de 9 variantes (`external-rules`).

Cada controle usa:

- a mesma loteria;
- o mesmo período elegível;
- a mesma quantidade de jogos por concurso;
- o mesmo aquecimento;
- seeds reproduzíveis;
- o mesmo checker estatístico e financeiro.

O controle não consulta score, núcleo ou regras experimentais e nunca vê o resultado-alvo antes de gerar os jogos.

A distribuição informa:

- `P05`;
- `P50` — mediana da distribuição;
- `P95`;
- percentil mid-rank da estratégia;
- p-value empírico de cauda;
- p-value ajustado pela quantidade de variantes testadas.

Uma **amostra concreta próxima da mediana** é mantida somente para tabela e gráfico. Ela não é a mediana estatística quando a quantidade de controles é par. O `P50` e toda a evidência são calculados sobre a distribuição inteira.

## Empates são neutros

Métricas como taxa de premiação são discretas e podem produzir muitos empates.

Por isso o percentil visual usa **mid-rank**:

```text
abaixo + 0,5 × empatados
───────────────────────
       amostras
```

Para uma afirmação de superioridade, empate conta contra a hipótese:

```text
p superior = (1 + controles >= estratégia) / (N + 1)
```

O `+1` evita p-value Monte Carlo igual a zero.

Se a estratégia obtiver exatamente o mesmo resultado que todos os controles, seu percentil é `0,500` e a conclusão é `no-evidence`, nunca `beats-random`, desde que a execução tenha resolução e amostra histórica suficientes para inferência.

## Correção por múltiplas comparações

O Laboratório não compara a melhor entre várias estratégias como se ela tivesse sido escolhida antes do experimento.

A melhor variante é selecionada no período, mas sua evidência usa uma correção Bonferroni pela quantidade de variantes da família:

```text
p ajustado = min(1, p empírico × número de variantes)
```

Hoje:

- núcleo fixo: 3 variantes;
- modelos de score: 3 variantes;
- regras externas da Mega-Sena: 9 variantes.

Isso reduz o risco de declarar uma estratégia vencedora apenas porque muitas hipóteses foram tentadas.

## Resolução Monte Carlo

A correção por múltiplas comparações impõe uma resolução mínima à simulação.

Com a correção `+1`, mesmo uma estratégia melhor que todos os controles tem como menor p-value ajustado possível:

```text
p ajustado mínimo = número de variantes / (N + 1)
```

Para `alpha = 0,05`, a quantidade mínima matemática de controles é:

```text
N mínimo = ceil(número de variantes / 0,05 - 1)
```

Logo:

- família de 3 variantes: mínimo matemático de 59 controles; a UI usa 100 como mínimo prático;
- família de 9 variantes: mínimo matemático de 179 controles; a UI usa 250 como mínimo prático.

Se a execução não tiver resolução suficiente, o status é `insufficient-resolution`. Isso é diferente de `no-evidence`: significa que o experimento sequer tinha granularidade suficiente para alcançar o limiar ajustado de 5%.

## Tamanho mínimo do recorte histórico

O benchmark também separa falta de evidência de falta de amostra.

Com menos de **30 concursos elegíveis**, o status é `insufficient-sample`.

O ranking, as métricas e os gráficos continuam disponíveis para exploração, mas o Laboratório não transforma esse recorte em conclusão inferencial.

Um período com **zero concursos elegíveis** não produz vencedor. Pela API ele retorna `EMPTY_PERIOD`.

## Status de evidência

### `beats-random`

Exige simultaneamente:

- pelo menos 30 concursos elegíveis;
- resolução Monte Carlo suficiente;
- resultado acima da mediana dos controles;
- p-value superior **ajustado** `<= 0,05`.

Leitura:

> há evidência histórica de resultado acima dos controles neste recorte, mesmo após corrigir a quantidade de variantes testadas.

Ainda não é prova de capacidade preditiva futura.

### `inconclusive`

Existe sinal na cauda (`p bruto <= 0,10`), mas ele não sustenta a conclusão após os controles aplicados.

### `insufficient-resolution`

A quantidade de controles é pequena demais para o p-value ajustado atingir `0,05`, mesmo no resultado mais extremo possível.

### `insufficient-sample`

O recorte possui menos de 30 concursos elegíveis. O resultado permanece exploratório.

### `no-evidence`

Com resolução e amostra suficientes, o resultado permanece compatível com o comportamento dos controles aleatórios.

### `underperforms-random`

Exige amostra e resolução suficientes, resultado abaixo da mediana e p-value inferior ajustado `<= 0,05`.

## Compatibilidade da API v1

A resposta atual do Strategy Lab usa `schemaVersion: 2`.

Para evitar quebra silenciosa de consumidores existentes, estes campos mantêm a semântica legada:

- `benchmark.control` — controle aleatório de seed fixa legado;
- `benchmark.delta` — diferença para esse controle legado;
- `benchmark.beatsRandom` — `delta > 0` no contrato legado.

A interface atual **não** usa esses campos para concluir evidência.

Os campos autoritativos v2 incluem:

- `benchmark.medianControl` — por compatibilidade do contrato, o nome permanece; o objeto representa uma amostra concreta próxima da mediana;
- `benchmark.medianDelta`;
- `benchmark.strategyPercentile`;
- `benchmark.status`;
- `benchmark.rawPValue`;
- `benchmark.adjustedPValue`;
- `benchmark.familySize`;
- `benchmark.alpha`;
- `benchmark.minimumAchievableAdjustedPValue`;
- `benchmark.minimumRandomSamples`;
- `benchmark.resolutionSufficient`;
- `benchmark.observationRounds`;
- `benchmark.minimumObservationRounds`;
- `benchmark.sampleSizeSufficient`;
- `benchmark.distribution`.

## Qualidade preditiva do ranking

O experimento `score-model` mede se o ranking colocou os números realmente sorteados acima dos não sorteados **antes de cada concurso**.

A métrica principal é AUC:

- `0,500` — ordenação sem informação;
- acima de `0,500` — sorteados tenderam a ficar acima no ranking;
- abaixo de `0,500` — ranking historicamente invertido.

O cálculo usa somente concursos anteriores ao alvo e ignora alvos cujo predecessor imediato está ausente.

`maxRounds` é aplicado antes do cálculo pesado: limitar a 100 rounds significa processar até 100 alvos elegíveis, e não calcular tudo para depois descartar o excedente.

AUC mede qualidade histórica de ordenação; não altera a probabilidade matemática individual de uma dezena.

## Walk-forward de pesos

O processo é:

```text
histórico anterior
      ↓
janela de treino
      ↓
compara perfis por AUC
      ↓
escolhe perfil
      ↓
congela pesos
      ↓
avalia bloco futuro
      ↓
repete
```

Perfis iniciais:

- padrão;
- longo prazo;
- recência;
- janelas equilibradas.

O walk-forward respeita `startContest` e `endContest` informados para a análise. Concursos posteriores ao `endContest` não entram em fold, métrica ou seleção.

Dados anteriores ao início podem ser usados como treino, pois já estariam disponíveis naquele momento histórico.

## Null do ganho walk-forward

O ganho entre pesos otimizados e padrão usa null pareado por sign-flip.

Cada fold mantém sua magnitude e recebe sinal aleatório sob a hipótese nula.

A estatística simulada usa os **mesmos pesos por número de concursos** usados no delta mostrado na interface. Assim `nullBenchmark.observed` corresponde à mesma estimativa agregada exibida como `deltaVsDefault`.

São apresentados:

- P05;
- P50;
- P95;
- percentil mid-rank;
- p-value bilateral empírico.

## Lacunas históricas

Estratégias, controles aleatórios e AUC usam a mesma regra de elegibilidade:

```text
#100
#101
#103
```

Nesse caso `#103` não é alvo elegível, porque `#102` está ausente. O sistema não trata `#101` como seu concurso anterior.

Quando a continuidade é retomada:

```text
#103
#104
```

`#104` volta a ser elegível, porque seu predecessor imediato existe.

As janelas `recent10` e `recent20` também não atravessam lacunas internas. Elas usam apenas o sufixo contínuo mais recente. Se houver somente 7 concursos consecutivos após uma lacuna, ambas trabalham temporariamente com uma amostra de 7; o Score v2 já ajusta a intensidade pelo tamanho efetivo dessa amostra.

## Janelas sobrepostas do Score v2

As cinco janelas não são observações independentes:

```text
recent10 ⊂ recent20
mês pode conter recent10/recent20
ano contém o mês
histórico contém todas as anteriores
```

Por isso, `strong` e `cold` representam **consistência descritiva em múltiplas janelas sobrepostas**. Duas janelas positivas não são duas confirmações estatisticamente independentes.

A validação que decide se o ranking acrescenta informação continua sendo feita separadamente por AUC, controles aleatórios e walk-forward.

## Métrica principal do backtest de jogos

Se todas as variantes e todos os controles possuem cobertura financeira suficiente, o ranking usa ROI.

Caso contrário, usa taxa de premiação.

Os critérios secundários continuam apenas como desempate de ordenação. A comparação contra random usa a mesma métrica principal escolhida.

A AUC fica separada porque responde a outra pergunta: qualidade da ordenação das dezenas.

## Limites operacionais

O endpoint roda em worker thread e possui:

- rate limit;
- gate para uma análise cara por vez;
- limite estimado de trabalho antes de iniciar;
- timeout de 60 segundos;
- cancelamento quando a requisição é abortada ou a conexão fecha.

O orçamento é calculado **depois de resolver o período efetivo e contar os alvos elegíveis reais**. Quando `startContest/endContest` são enviados, eles determinam o intervalo usado no orçamento; `lookbackContests` não pode ser usado para mascarar um recorte explícito maior.

O experimento `score-model` adiciona ao orçamento uma margem para AUC e walk-forward, além dos backtests e controles aleatórios.

Uma solicitação excessiva retorna `ANALYSIS_TOO_LARGE`. Um período sem alvos elegíveis retorna `EMPTY_PERIOD`. Uma análise que excede o tempo retorna `ANALYSIS_TIMEOUT`.

## API

```http
POST /api/v1/lab/compare
Content-Type: application/json
```

Exemplo:

```json
{
  "lottery": "mega-sena",
  "experiment": "score-model",
  "gameCount": 2,
  "warmupContests": 20,
  "lookbackContests": 200,
  "bucketSize": 25,
  "randomSamples": 100
}
```

Também podem ser informados `startContest` e `endContest`.

Exemplo resumido de resposta v2:

```json
{
  "schemaVersion": 2,
  "benchmark": {
    "basis": "roi",
    "strategyPercentile": 0.96,
    "rawPValue": 0.03,
    "adjustedPValue": 0.09,
    "familySize": 3,
    "alpha": 0.05,
    "minimumRandomSamples": 59,
    "resolutionSufficient": true,
    "observationRounds": 100,
    "minimumObservationRounds": 30,
    "sampleSizeSufficient": true,
    "status": "inconclusive",
    "medianDelta": 0.04,
    "distribution": {
      "samples": 100,
      "p05": -0.38,
      "p50": -0.02,
      "p95": 0.31
    }
  }
}
```

Os valores são apenas exemplo de formato. O exemplo mostra por que “percentil alto”, “resolução suficiente” e “evidência ajustada” são conceitos diferentes.

## Interpretação correta

O Laboratório mede comportamento histórico de regras reproduzíveis.

Ele não demonstra que sorteios futuros deixaram de ser aleatórios e não torna uma combinação individual mais provável.

Quanto mais hipóteses forem testadas, maior o risco de data snooping. Por isso a conclusão usa controles aleatórios, correção por múltiplas comparações, verificação de resolução, tamanho mínimo de amostra e validação temporal fora da amostra quando parâmetros são escolhidos pelos próprios dados.
