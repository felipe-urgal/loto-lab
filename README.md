# Loto Lab

Motor de análise, backtest e geração estruturada de jogos de loteria.

## Objetivo

O Loto Lab separa responsabilidades:

> **Algoritmo calcula; IA interpreta.**

Frequências, scores, geração, conferência e backtests são reproduzíveis por código. A IA entra para explicar os dados e sugerir hipóteses, não para inventar dezenas.

## Estado atual

### Milestone 1 — core

- domínio compartilhado para Mega-Sena, Lotofácil e Dia de Sorte;
- análise por histórico, ano, mês, últimos 10 e últimos 20 concursos;
- score ponderado e classificação `strong / balanced / cold`;
- gerador da Mega-Sena com 3 fixas + 3 variáveis;
- metodologia em [`docs/METHODOLOGY.md`](docs/METHODOLOGY.md).

### Milestone 2 — dados e backtest

- adapter da API oficial da CAIXA;
- armazenamento local JSON e sincronização incremental;
- backtest da Mega-Sena;
- proteção contra vazamento de informação futura.

### Milestone 3 — geradores completos

- Lotofácil com núcleo compartilhado de 8, 9 ou 10 dezenas;
- preferência por 8–10 repetidas e diversidade estrutural;
- Dia de Sorte com 3 fixas + 4 variáveis;
- preferência por 1–2 repetidas e Mês da Sorte diversificado;
- CLI única para gerar as três loterias.

### Milestone 4 — conferência e comparação

- checker único para as três loterias;
- separação de acertos do núcleo fixo e das variáveis;
- identificação da faixa de acerto/premiação;
- conferência separada do Mês da Sorte;
- backtest da Lotofácil;
- backtest do Dia de Sorte;
- Mega-Sena migrada para o mesmo checker compartilhado;
- resumo comum com média de acertos, desempenho do núcleo e taxa de jogos premiados;
- comparação da Lotofácil entre estratégias com 8, 9 e 10 fixas;
- testes anti-leakage para as três loterias.

> O checker identifica a **faixa de acerto**. Valores monetários, custo e ROI ainda não fazem parte deste milestone.

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

## Sincronizar resultados

Por padrão os dados são salvos em `data/contests.json`. Arquivos JSON nessa pasta são locais e não são versionados.

```bash
npm run data:sync -- mega-sena
npm run data:sync -- lotofacil
npm run data:sync -- dia-de-sorte
```

Para preencher apenas concursos ausentes de um intervalo:

```bash
npm run data:sync -- mega-sena 1 3046
```

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

A saída é JSON e pode ser salva para conferência posterior:

```bash
npm run games:generate -- lotofacil data/contests.json 4 8 > data/games.json
```

## Conferir jogos

```text
npm run games:check -- <games.json> [dataPath] [contestNumber]
```

Exemplo:

```bash
npm run games:check -- data/games.json data/contests.json 3767
```

Se `contestNumber` for omitido, é usado o concurso mais recente da mesma loteria existente no arquivo de dados.

Para cada jogo o checker retorna:

- dezenas acertadas;
- quantidade total de acertos;
- acertos das fixas;
- acertos das variáveis;
- faixa de acerto/premiação quando aplicável;
- acerto do Mês da Sorte no Dia de Sorte.

## Backtests

### Mega-Sena

```bash
npm run backtest:mega -- data/contests.json 2 20 2500 3046
```

Ordem dos argumentos:

```text
arquivo gameCount warmupContests startContest endContest
```

### Lotofácil

```bash
npm run backtest:lotofacil -- data/contests.json 4 8 20 3500 3767
```

Ordem:

```text
arquivo gameCount fixedCount warmupContests startContest endContest
```

`fixedCount` aceita `8`, `9` ou `10`.

### Dia de Sorte

```bash
npm run backtest:dia -- data/contests.json 4 20 1000 1277
```

Ordem:

```text
arquivo gameCount warmupContests startContest endContest
```

Além das dezenas, o resumo informa a taxa de acerto do Mês da Sorte.

## Comparar estratégias da Lotofácil

```bash
npm run backtest:compare -- data/contests.json 4 20 3500 3767
```

O mesmo período e quantidade de jogos são testados com:

- 8 fixas;
- 9 fixas;
- 10 fixas.

O ranking usa, nesta ordem:

1. taxa de jogos em faixa premiada;
2. média de acertos por jogo;
3. maior número de acertos.

Isso permite testar nossa preferência atual por 8 fixas em vez de tratá-la como verdade permanente.

## Regra anti-leakage

Ao testar o concurso `N`, o gerador recebe **somente os concursos anteriores a N**.

O resultado do próprio concurso e todos os concursos futuros ficam invisíveis para o algoritmo. Essa regra é coberta por testes automatizados para Mega-Sena, Lotofácil e Dia de Sorte.

## Métricas comuns dos backtests

- concursos testados;
- total de jogos;
- média de acertos por jogo;
- média de acertos do núcleo fixo por concurso;
- maior número de acertos;
- distribuição do melhor jogo por concurso;
- distribuição de acertos das fixas;
- distribuição das faixas premiadas;
- quantidade e taxa de jogos em faixa premiada.

## Estrutura atual

```text
src/
├── analysis/
├── backtest/
│   ├── compare.ts
│   ├── diaDeSorte.ts
│   ├── lotofacil.ts
│   ├── megaSena.ts
│   └── shared.ts
├── checker/
│   └── evaluate.ts
├── cli/
│   ├── backtestDiaDeSorte.ts
│   ├── backtestLotofacil.ts
│   ├── backtestMega.ts
│   ├── checkGames.ts
│   ├── compareStrategies.ts
│   ├── generateGames.ts
│   └── sync.ts
├── data/
├── domain/
├── generator/
├── lotteries/
└── index.ts
```

## Score inicial

| Janela | Peso |
| --- | ---: |
| Ano atual | 30% |
| Últimos 20 | 25% |
| Mês atual | 20% |
| Histórico | 15% |
| Últimos 10 | 10% |

Esses pesos são hipóteses iniciais. O objetivo dos backtests é justamente validar ou rejeitar hipóteses sem usar informação futura.

## Próximos milestones

1. custo dos jogos, valores de premiação e ROI histórico;
2. persistência em banco de dados;
3. API da aplicação;
4. interface web;
5. dashboards de estratégia e desempenho;
6. camada de interpretação por IA.

## Aviso

O projeto organiza e mede estratégias de composição de jogos. Ele não garante prêmio e não altera a probabilidade matemática individual de uma combinação válida.
