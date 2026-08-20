# Loto Lab

Motor de análise, backtest e geração estruturada de jogos de loteria.

## Objetivo

O Loto Lab separa responsabilidades:

> **Algoritmo calcula; IA interpreta.**

Frequências, scores, geração de jogos e futuros backtests devem ser reproduzíveis por código. A IA entra para explicar os dados e sugerir hipóteses, não para inventar dezenas.

## Milestone 1

O primeiro milestone contém:

- domínio compartilhado para Mega-Sena, Lotofácil e Dia de Sorte;
- configurações das três loterias;
- cálculo genérico de frequência;
- análise por histórico, ano, mês, últimos 10 e últimos 20 concursos;
- score ponderado e classificação `strong / balanced / cold`;
- gerador inicial da Mega-Sena;
- regra de 3 dezenas fixas + 3 variáveis por jogo;
- testes automatizados;
- GitHub Actions;
- metodologia documentada em [`docs/METHODOLOGY.md`](docs/METHODOLOGY.md).

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

## Estrutura atual

```text
src/
├── analysis/
│   ├── frequency.ts
│   └── scoring.ts
├── domain/
│   └── types.ts
├── generator/
│   └── megaSena.ts
├── lotteries/
│   └── config.ts
└── index.ts

tests/
├── frequency.test.ts
└── megaSena.test.ts

docs/
└── METHODOLOGY.md
```

## Score inicial

O score usa os seguintes pesos iniciais:

| Janela | Peso |
| --- | ---: |
| Ano atual | 30% |
| Últimos 20 | 25% |
| Mês atual | 20% |
| Histórico | 15% |
| Últimos 10 | 10% |

Esses pesos são hipóteses iniciais. O futuro módulo de backtest será responsável por comparar estratégias e validar alterações sem usar informação futura.

## Próximos milestones

1. fonte de dados e importação de resultados;
2. geradores da Lotofácil e Dia de Sorte;
3. conferência automática de jogos;
4. backtest sem vazamento de informação futura;
5. persistência;
6. API;
7. interface web;
8. camada de interpretação por IA.

## Aviso

O projeto organiza e mede estratégias de composição de jogos. Ele não garante prêmio e não altera a probabilidade matemática individual de uma combinação válida.
