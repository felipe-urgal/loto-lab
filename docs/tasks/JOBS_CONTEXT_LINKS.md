# Retorno contextual de Execuções

Issue: #64

Status: segunda fatia concluída e pronta para merge após gates finais.

## Objetivo

Reduzir troca de contexto quando uma execução já terminou sem transformar `/jobs` em owner de Testes históricos ou Laboratório.

## Comportamento

Cada card de Execuções oferece retorno para a superfície canônica do seu tipo:

- `strategy-lab` continua retornando para `/lab` sem transportar estado de resultado;
- `backtest` queued/running/failed/cancelled continua retornando para `/#backtests` sem `jobId`;
- `backtest` concluído e com resultado passa a retornar para `/?jobId=<id>&lottery=<lottery>#backtests`.

`jobId` é a identidade operacional do retorno. `lottery` é apenas um hint de roteamento para alinhar o seletor antes da leitura; Testes históricos não confia nele para o resultado e esse hint não altera a preferência persistida de loteria.

## Consumo em Testes históricos

A superfície de Testes históricos:

1. lê um `jobId` inteiro positivo da query;
2. busca o registro persistido em `GET /api/v1/analysis-jobs/:id`;
3. valida que o ID corresponde, o tipo é `backtest`, a loteria é a ativa e o status está concluído;
4. usa somente o `id` de `job.result` para localizar o artefato persistido em `GET /api/v1/backtest-runs/:id`;
5. valida novamente ID e loteria do `backtest_run` canônico antes de renderizar;
6. mostra esse backtest persistido no topo e mantém o catálogo normal abaixo.

Se o job não estiver disponível, pertencer a outro tipo/loteria, ainda não estiver concluído ou apontar para um backtest indisponível/incompatível, a tela informa a inconsistência e não fabrica métricas.

## Guardrails

- `/jobs` continua sendo owner apenas do lifecycle;
- `backtest_runs` continua sendo owner do resultado persistido; `analysis_jobs.result` serve apenas para resolver sua identidade;
- nenhum formulário/controller de backtest é copiado para Execuções;
- nenhum ranking, winner, p-value ou evidência é transportado em query;
- não existe `jobId` em localStorage;
- o hint `lottery` só alinha o seletor para a navegação atual e não sobrescreve a preferência persistida;
- o destino reconstrói o resultado pelas APIs persistidas, não pelo HTML/link nem por uma cópia de métricas na URL;
- o contrato começa somente por backtest; Laboratório não recebe deep link nesta fatia;
- resultados incompletos/desconhecidos continuam apresentados como desconhecidos pelos formatters existentes.

## Próximo passo

Depois da validação deste contrato, a #64 pode decidir se Laboratório merece um retorno equivalente. Isso deve ocorrer apenas se `/lab` conseguir reconstruir seu contexto por uma identidade persistida sem criar estado duplicado entre superfícies.
