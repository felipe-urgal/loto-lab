# Owner de apresentação de Execuções

Issue: #60

Status: concluída na `main` via #242 em 2026-09-06.

## Objetivo

Reduzir a responsabilidade de `web/src/features/jobs.ts` sem alterar a jornada de Execuções.

## Ownership

- `web/src/features/jobs.ts` permanece owner de DOM, lifecycle, polling, API, submissão/cancelamento e seleção de contexto;
- `web/src/features/jobs/presentation.ts` passa a ser owner puro dos contratos de exibição e da renderização dos cards;
- `web/src/core/mainContext.ts` continua sendo o owner canônico de `LotteryId`/`isLotteryId`.

## Contratos preservados

- polling e cancelamento continuam inalterados;
- backtest concluído continua retornando por `jobId` para Testes históricos;
- backtest não concluído continua abrindo `/#backtests` sem carregar resultado na URL;
- Strategy Lab continua abrindo `/lab` sem estado cruzado;
- nenhuma preferência nova é persistida;
- métricas/resultados continuam escapados antes da interpolação em HTML;
- apresentação não ganha acesso a API, `document`, `window` ou storage.

## Validação

`tests/jobsContextLinks.test.ts` continua protegendo a navegação contextual da #64 no owner correto. `tests/jobsPresentationOwnership.test.ts` protege a separação entre lifecycle e apresentação e impede a reintrodução da union local de loteria. `npm run check` passou no CI do SHA final de #242 e o auto-review não encontrou achado bloqueante.

## Próximo passo

Outros módulos grandes devem ser decompostos apenas quando houver responsabilidade coesa semelhante. Esta fatia não autoriza reorganização horizontal nem mudança de arquitetura de informação.
