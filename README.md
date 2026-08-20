# Loto Lab

Motor de análise, geração, conferência e backtest estruturado para Mega-Sena, Lotofácil e Dia de Sorte.

> **Algoritmo calcula; IA interpreta.**

Frequências, scores, geração, conferência, custos, premiações e backtests precisam ser reproduzíveis por código. A IA entra para explicar resultados e sugerir hipóteses, não para inventar dezenas.

## Estado atual

### Milestone 1 — core

- domínio compartilhado das três loterias;
- análise por histórico, ano, mês, últimos 10 e últimos 20 concursos;
- score `strong / balanced / cold`;
- gerador da Mega-Sena com 3 fixas + 3 variáveis;
- metodologia em [`docs/METHODOLOGY.md`](docs/METHODOLOGY.md).

### Milestone 2 — dados

- adapter da API oficial da CAIXA;
- armazenamento local JSON;
- sincronização incremental;
- primeiro backtest com proteção anti-leakage.

### Milestone 3 — geradores completos

- Lotofácil com núcleo de 8, 9 ou 10 fixas;
- Dia de Sorte com 3 fixas + 4 variáveis e Mês da Sorte;
- diversificação de repetição, pares/ímpares e estrutura.

### Milestone 4 — conferência e backtests

- checker único para as três loterias;
- separação dos acertos entre fixas e variáveis;
- faixas premiadas;
- backtests da Mega-Sena, Lotofácil e Dia de Sorte;
- comparação da Lotofácil entre 8, 9 e 10 fixas.

### Milestone 5 — financeiro

- ingestão do rateio real de cada concurso da CAIXA;
- ingestão da arrecadação do concurso;
- custo da aposta simples conforme a vigência histórica;
- prêmio numérico real por jogo;
- prêmio cumulativo do Mês da Sorte;
- resultado líquido por jogo;
- custo total e custo com cobertura financeira;
- retorno bruto e ROI;
- cobertura financeira do backtest;
- comparação de estratégias considerando cobertura + ROI;
- comando para atualizar concursos antigos com os dados financeiros.

A metodologia financeira e as vigências de preço estão documentadas em [`docs/FINANCIALS.md`](docs/FINANCIALS.md).

## Requisitos

- Node.js 22+
- npm

## Instalação

```bash
npm install
```

## Testes

```bash
npm test
```

## Build

```bash
npm run build
```

## Dados

Por padrão os resultados ficam em `data/contests.json`. Os arquivos JSON da pasta `data/` são locais e não são versionados.

### Buscar concurso mais recente

```bash
npm run data:sync -- mega-sena
npm run data:sync -- lotofacil
npm run data:sync -- dia-de-sorte
```

### Preencher apenas concursos ausentes

```bash
npm run data:sync -- mega-sena 2500 3047
```

### Atualizar concursos já existentes

Use `data:refresh` quando precisar enriquecer resultados antigos com rateio e arrecadação:

```bash
npm run data:refresh -- mega-sena 2500 3047
npm run data:refresh -- lotofacil 3500 3767
npm run data:refresh -- dia-de-sorte 1000 1277
```

Também é possível passar outro arquivo no último argumento.

## Gerar jogos

```text
npm run games:generate -- <lottery> [dataPath] [gameCount] [lotofacilFixedCount]
```

Exemplos:

```bash
npm run games:generate -- mega-sena data/contests.json 2
npm run games:generate -- lotofacil data/contests.json 4 8
npm run games:generate -- dia-de-sorte data/contests.json 4
```

Salvar para conferência posterior:

```bash
npm run games:generate -- lotofacil data/contests.json 4 8 > data/games.json
```

## Conferir jogos

```bash
npm run games:check -- data/games.json data/contests.json 3767
```

Para cada jogo, a saída pode incluir:

- dezenas acertadas;
- acertos das fixas e das variáveis;
- faixa premiada;
- Mês da Sorte;
- custo da aposta;
- prêmio numérico real;
- prêmio do Mês da Sorte;
- prêmio total;
- resultado líquido.

Os valores monetários só aparecem quando o concurso armazenado contém o rateio da CAIXA.

## Backtests

### Mega-Sena

```bash
npm run backtest:mega -- data/contests.json 2 20 2500 3047
```

### Lotofácil

```bash
npm run backtest:lotofacil -- data/contests.json 4 8 20 3500 3767
```

`fixedCount` aceita `8`, `9` ou `10`.

### Dia de Sorte

```bash
npm run backtest:dia -- data/contests.json 4 20 1000 1277
```

## Comparar estratégias da Lotofácil

```bash
npm run backtest:compare -- data/contests.json 4 20 3500 3767
```

As estratégias com 8, 9 e 10 fixas são comparadas usando o mesmo período e quantidade de jogos. Com dados financeiros disponíveis, o ranking prioriza:

1. cobertura financeira;
2. ROI;
3. taxa de jogos premiados;
4. média de acertos;
5. melhor resultado.

## Métricas financeiras

Os resumos de backtest incluem:

- `totalCost`: custo de todos os jogos simulados;
- `financialCost`: custo dos jogos com rateio disponível;
- `totalPrizeValue`: soma dos prêmios reais conhecidos;
- `financialCoverage`: proporção de jogos com dados financeiros;
- `netResult`: prêmio menos custo coberto;
- `returnRate`: prêmio / custo coberto;
- `roi`: `(prêmio - custo coberto) / custo coberto`.

Exemplo: `roi = -0.40` significa perda de 40% no período analisado; `roi = 0.20` significa ganho de 20%.

## Preços atualmente modelados

O motor conhece os reajustes oficiais necessários para o histórico moderno usado pelo projeto:

- Mega-Sena: R$ 4,50 → R$ 5,00 → R$ 6,00;
- Lotofácil: R$ 2,50 → R$ 3,00 → R$ 3,50;
- Dia de Sorte: R$ 2,00 → R$ 2,50.

Concursos da Mega-Sena anteriores ao 2207 e da Lotofácil anteriores ao 1889 são rejeitados no cálculo financeiro em vez de receber um preço estimado incorreto.

## Regra anti-leakage

Ao testar o concurso `N`, o gerador recebe **somente os concursos anteriores a N**.

O resultado do próprio concurso e todos os concursos futuros ficam invisíveis para o algoritmo. A regra é coberta por testes para as três loterias.

## Estrutura

```text
src/
├── analysis/
├── backtest/
├── checker/
├── cli/
├── data/
├── domain/
├── finance/
│   ├── pricing.ts
│   └── prizes.ts
├── generator/
├── lotteries/
└── index.ts

docs/
├── FINANCIALS.md
└── METHODOLOGY.md
```

## Próximos milestones

1. persistência em banco de dados;
2. API da aplicação;
3. interface web;
4. dashboards de estratégia, jogos e desempenho;
5. camada de interpretação por IA.

## Aviso

O projeto organiza e mede estratégias de composição de jogos. Ele não garante prêmio, não prevê sorteios e não altera a probabilidade matemática individual de uma combinação válida.
