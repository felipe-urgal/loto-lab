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

### Milestone 3 — geradores completos

- Lotofácil com núcleo compartilhado configurável de **8, 9 ou 10 dezenas**;
- preferência por **8–10 repetidas** do concurso anterior, sem transformar isso em regra absoluta;
- diversificação de pares/ímpares entre os jogos;
- linhas e colunas usadas apenas para evitar extremos, sem forçar simetria;
- Dia de Sorte com **3 fixas + 4 variáveis**;
- preferência por **1–2 repetidas** do concurso anterior;
- diversidade entre 3/4 e 4/3 em pares/ímpares;
- seleção e diversificação do **Mês da Sorte**;
- CLI única para gerar jogos das três loterias.

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

### Buscar somente o concurso mais recente

```bash
npm run data:sync -- mega-sena
npm run data:sync -- lotofacil
npm run data:sync -- dia-de-sorte
```

### Preencher um intervalo

```bash
npm run data:sync -- mega-sena 1 3046
```

Também é possível informar outro arquivo:

```bash
npm run data:sync -- mega-sena 1 3046 data/mega.json
```

## Gerar jogos

Formato:

```text
npm run games:generate -- <lottery> [dataPath] [gameCount] [lotofacilFixedCount]
```

### Mega-Sena

```bash
npm run games:generate -- mega-sena data/contests.json 2
```

Usa 3 dezenas fixas compartilhadas e 3 variáveis por jogo.

### Lotofácil

```bash
npm run games:generate -- lotofacil data/contests.json 4 8
```

O último argumento pode ser `8`, `9` ou `10` e define o tamanho do núcleo fixo compartilhado.

### Dia de Sorte

```bash
npm run games:generate -- dia-de-sorte data/contests.json 4
```

Usa 3 dezenas fixas compartilhadas, 4 variáveis por jogo e seleciona um Mês da Sorte diferente conforme o ranking disponível.

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

### Regra anti-leakage

Ao testar o concurso `N`, o gerador recebe **somente os concursos anteriores a N**.

O resultado do próprio concurso testado e todos os concursos futuros ficam invisíveis para o algoritmo. Essa regra é obrigatória para qualquer módulo de backtest.

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
│   ├── generateGames.ts
│   └── sync.ts
├── data/
│   ├── caixa.ts
│   ├── jsonStore.ts
│   ├── source.ts
│   └── sync.ts
├── domain/
│   └── types.ts
├── generator/
│   ├── diaDeSorte.ts
│   ├── lotofacil.ts
│   ├── megaSena.ts
│   └── shared.ts
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

Esses pesos são hipóteses iniciais. Os backtests existem justamente para medir estratégias sem usar informação futura e comparar pesos e regras diferentes.

## Próximos milestones

1. conferência automática de jogos e faixas de acerto;
2. backtests para Lotofácil e Dia de Sorte;
3. comparação entre estratégias e cálculo de custo/retorno;
4. persistência em banco de dados;
5. API da aplicação;
6. interface web;
7. camada de interpretação por IA.

## Aviso

O projeto organiza e mede estratégias de composição de jogos. Ele não garante prêmio e não altera a probabilidade matemática individual de uma combinação válida.
