# Laboratório de Estratégias

O Laboratório compara variações da metodologia sobre exatamente o mesmo recorte histórico.

A finalidade é medir hipóteses de composição, não prever sorteios.

## Princípio

> **Algoritmo calcula; IA interpreta.**

Toda comparação é reproduzível pelo core. O resultado do concurso-alvo nunca é entregue ao gerador antes da geração daquele round.

## Experimentos

### 1. Núcleo fixo

Compara o tamanho do núcleo mantendo o restante da execução igual.

#### Mega-Sena

- 0 fixas + 6 variáveis;
- 2 fixas + 4 variáveis;
- 3 fixas + 3 variáveis.

#### Lotofácil

- 8 fixas + 7 variáveis;
- 9 fixas + 6 variáveis;
- 10 fixas + 5 variáveis.

#### Dia de Sorte

- 0 fixas + 7 variáveis;
- 2 fixas + 5 variáveis;
- 3 fixas + 4 variáveis.

Os padrões operacionais continuam 3 fixas na Mega-Sena, 8 na Lotofácil e 3 no Dia de Sorte enquanto não houver evidência robusta para mudar.

### 2. Modelos de score

O experimento `score-model` isola o efeito do ranking mantendo o núcleo operacional de cada loteria.

Variantes:

- `score-v2` — desvio em relação ao esperado ajustado pelo tamanho da amostra;
- `score-v1` — normalização min/max legada;
- `no-score` — controle estrutural com todas as dezenas neutras.

A pergunta é direta:

> **O ranking adiciona valor mensurável além da estrutura do gerador?**

Nenhuma variante é promovida apenas porque ficou em primeiro lugar em um único período.

### 3. Regras externas da Mega-Sena

O experimento `external-rules` permanece separado do tamanho do núcleo e está disponível somente para Mega-Sena.

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

Essas regras não são tratadas como verdade matemática. São hipóteses experimentais.

## Controle aleatório por distribuição

O laboratório não compara mais a melhor estratégia apenas contra uma única amostra aleatória.

Cada execução pode gerar entre 10 e 500 controles aleatórios reproduzíveis; a interface usa 100 por padrão.

Cada controle:

- usa a mesma loteria;
- usa o mesmo período;
- usa a mesma quantidade de jogos por concurso;
- usa o mesmo aquecimento;
- não consulta score, frequência, núcleo ou regras experimentais;
- não recebe o resultado-alvo antes da geração;
- utiliza seed estável;
- passa pelo mesmo checker estatístico e financeiro.

A distribuição expõe:

- `P05` — percentil 5 dos controles;
- `P50` — mediana;
- `P95` — percentil 95;
- percentil da melhor estratégia dentro da distribuição.

O laboratório também mantém uma série temporal concreta de um controle próximo da mediana para permitir comparação no gráfico.

## Status de evidência

A melhor estratégia recebe uma leitura explícita:

### `beats-random`

Percentil maior ou igual a 95%.

Leitura de produto:

> venceu do random neste recorte.

Isso ainda não prova capacidade preditiva. O resultado precisa persistir em períodos futuros.

### `inconclusive`

Percentil entre 90% e 95%.

Leitura:

> sinal interessante, mas ainda perto da borda da distribuição.

### `no-evidence`

Entre os percentis centrais.

Leitura:

> a estratégia está dentro do comportamento compatível com o acaso neste recorte.

Esse resultado é útil. Evita promover complexidade sem benefício mensurável.

### `underperforms-random`

Percentil menor ou igual a 5%.

Leitura:

> a hipótese ficou entre os piores controles e merece revisão ou descarte.

## Métrica principal

Se estratégias e controles possuem cobertura financeira suficiente, o ranking usa:

1. ROI;
2. taxa de premiação;
3. média de acertos por jogo;
4. tamanho do núcleo como último desempate quando aplicável.

Se a cobertura financeira é incompleta:

1. taxa de premiação;
2. média de acertos;
3. melhor número de acertos;
4. tamanho do núcleo como desempate.

A comparação com a distribuição aleatória usa a mesma métrica escolhida para o ranking.

## Série histórica por blocos

Os rounds são agrupados em blocos para mostrar estabilidade ao longo do período.

Para cada bloco são recalculados:

- média de acertos;
- média de acertos do núcleo quando aplicável;
- taxa de premiação;
- ROI;
- cobertura financeira;
- resultado líquido.

O gráfico mostra as estratégias e um controle aleatório próximo da mediana da distribuição.

No experimento de regras externas, somente o Top 3 aparece no gráfico para preservar legibilidade; todas as variantes continuam na tabela.

## API

```http
POST /api/v1/lab/compare
Content-Type: application/json
```

### Núcleo fixo

```json
{
  "lottery": "lotofacil",
  "experiment": "fixed-core",
  "gameCount": 4,
  "warmupContests": 20,
  "lookbackContests": 200,
  "bucketSize": 25,
  "randomSamples": 100
}
```

### Modelos de score

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

### Regras externas

```json
{
  "lottery": "mega-sena",
  "experiment": "external-rules",
  "gameCount": 2,
  "warmupContests": 20,
  "lookbackContests": 200,
  "bucketSize": 25,
  "randomSamples": 100
}
```

Também podem ser informados `startContest` e `endContest`.

## Contrato do benchmark

A resposta inclui, entre outros campos:

```json
{
  "benchmark": {
    "basis": "roi",
    "strategyPercentile": 0.96,
    "status": "beats-random",
    "distribution": {
      "samples": 100,
      "p05": -0.38,
      "p50": -0.02,
      "p95": 0.31
    }
  }
}
```

Os valores acima são apenas exemplo de formato.

## Interface

A tela do Laboratório explica:

- qual hipótese está sendo testada;
- quantos controles aleatórios serão simulados;
- qual métrica está definindo o ranking;
- P05/P50/P95 da distribuição aleatória;
- percentil da melhor estratégia;
- status de evidência;
- evolução por blocos;
- diferença entre “venceu do random”, “inconclusivo”, “sem evidência” e “abaixo do random”.

## Walk-forward

A distribuição aleatória reduz o risco de concluir a partir de uma única seed, mas não substitui validação temporal fora da amostra.

A próxima fronteira metodológica continua sendo **walk-forward** para parâmetros escolhidos por otimização:

```text
janela de treino
      ↓
escolha de parâmetros
      ↓
janela futura intocada
      ↓
avaliação
      ↓
anda a janela e repete
```

Pesos, penalidades e metas não devem ser promovidos porque performaram bem na mesma janela usada para escolhê-los.

## Interpretação correta

O laboratório mede comportamento histórico de regras reproduzíveis.

Ele não demonstra que sorteios futuros deixaram de ser aleatórios e não torna uma combinação individual mais provável.

Quanto mais hipóteses forem testadas, maior o risco de overfitting. Resultados precisam ser avaliados em vários períodos, contra controles e, quando parâmetros forem escolhidos pelos próprios dados, em validação futura separada.
