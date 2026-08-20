# Loto Lab

Motor de análise, backtest e geração estruturada de jogos de loteria.

## Objetivo

O Loto Lab separa responsabilidades:

> **Algoritmo calcula; IA interpreta.**

Frequências, scores, geração de jogos e backtests são reproduzíveis por código. A IA entra para explicar dados e sugerir hipóteses, não para inventar dezenas.

## Estado atual

### Milestone 1 — core

- domínio compartilhado para Mega-Sena, Lotofácil e Dia de Sorte;
- configurações das três loterias;
- cálculo genérico de frequência;
- análise por histórico, ano, mês, últimos 10 e últimos 20 concursos;
- score ponderado e classificação `strong / balanced / cold`;
- gerador da Mega-Sena;
- regra de 3 dezenas fixas + 3 variáveis;
- metodologia em [`docs/METHODOLOGY.md`](docs/METHODOLOGY.md).

### Milestone 2 — dados e backtest

- adapter da API oficial da CAIXA;
- fonte de dados desacoplada por interface `ContestSource`;
- normalização dos resultados para o domínio do Loto Lab;
- armazenamento local JSON;
- sincronização do último concurso ou de intervalos ausentes;
- backtest da Mega-Sena;
- proteção contra vazamento de informação futura;
- comandos CLI para sincronização e backtest;
- testes automatizados e GitHub Actions.

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

O comando compila o TypeScript e executa os testes com o runner nativo do Node.js.

## Build

```bash
npm run build
```

## Sincronizar resultados

Por padrão os dados são salvos em `data/contests.json`. Arquivos JSON nessa pasta são locais e não são versionados.

### Buscar somente o concurso mais recente

```bash
npm run data:sync -- mega-sena
npm run data:sync -- lotofacil
npm run data:sync -- dia-de-sorte
```

### Preencher um intervalo

O sincronizador consulta apenas os concursos que ainda não existem no arquivo local.

```bash
npm run data:sync -- mega-sena 1 3046
```

Também é possível informar outro arquivo como quarto argumento:

```bash
npm run data:sync -- mega-sena 1 3046 data/mega.json
```

## Rodar backtest da Mega-Sena

```bash
npm run backtest:mega
```

Argumentos opcionais, na ordem:

```text
arquivo gameCount warmupContests startContest endContest
```

Exemplo:

```bash
npm run backtest:mega -- data/contests.json 2 20 2500 3046
```

O relatório mostra:

- quantidade de concursos testados;
- quantidade total de jogos gerados;
- média de acertos por jogo;
- maior quantidade de acertos;
- distribuição do melhor jogo de cada concurso;
- desempenho das 3 dezenas fixas;
- últimas rodadas detalhadas.

### Regra anti-leakage

Ao testar o concurso `N`, o gerador recebe **somente os concursos anteriores a N**.

O resultado do próprio concurso testado e todos os concursos futuros ficam invisíveis para o algoritmo. Essa regra é testada automaticamente e é obrigatória para qualquer futuro módulo de backtest.

## Estrutura atual

```text
src/
├── analysis/
│   ├── frequency.ts
│   └── scoring.ts
├── backtest/
│   └── megaSena.ts
├── cli/
│   ├── backtestMega.ts
│   └── sync.ts
├── data/
│   ├── caixa.ts
│   ├── jsonStore.ts
│   ├── source.ts
│   └── sync.ts
├── domain/
│   └── types.ts
├── generator/
│   └── megaSena.ts
├── lotteries/
│   └── config.ts
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

Esses pesos são hipóteses iniciais. O backtest existe justamente para medir estratégias sem usar informação futura e, posteriormente, comparar pesos e regras diferentes.

## Próximos milestones

1. gerador da Lotofácil com núcleo de 8–10 dezenas;
2. gerador do Dia de Sorte com 3 fixas + 4 variáveis e Mês da Sorte;
3. conferência automática de jogos e faixas de acerto;
4. backtests para as três loterias e comparação entre estratégias;
5. persistência em banco de dados;
6. API da aplicação;
7. interface web;
8. camada de interpretação por IA.

## Aviso

O projeto organiza e mede estratégias de composição de jogos. Ele não garante prêmio e não altera a probabilidade matemática individual de uma combinação válida.
