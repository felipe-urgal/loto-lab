# Retorno contextual de Execuções

Issue: #64

Status: segunda fatia implementada em branch para validação.

## Objetivo

Reduzir troca de contexto quando uma execução já terminou sem transformar `/jobs` em owner de Testes históricos ou Laboratório.

## Comportamento

Cada card de Execuções oferece retorno para a superfície canônica do seu tipo:

- `strategy-lab` continua retornando para `/lab` sem transportar estado de resultado;
- `backtest` queued/running/failed/cancelled continua retornando para `/#backtests` sem `jobId`;
- `backtest` concluído e com resultado passa a retornar para `/?jobId=<id>&lottery=<lottery>#backtests`.

`jobId` é a identidade canônica do retorno. `lottery` é apenas um hint de roteamento para alinhar o seletor antes da leitura; Testes históricos não confia nele para o resultado.

## Consumo em Testes históricos

A superfície de Testes históricos:

1. lê um `jobId` inteiro positivo da query;
2. busca o registro persistido em `GET /api/v1/analysis-jobs/:id`;
3. valida que o ID corresponde, o tipo é `backtest`, a loteria é a ativa e o status está concluído;
4. exige `job.result` antes de renderizar;
5. mostra o resultado do próprio job no topo e mantém o catálogo persistido normal abaixo.

Se o job não estiver disponível, pertencer a outro tipo/loteria ou ainda não tiver resultado, a tela informa a inconsistência e não fabrica métricas.

## Guardrails

- `/jobs` continua sendo owner apenas do lifecycle;
- nenhum formulário/controller de backtest é copiado para Execuções;
- nenhum ranking, winner, p-value ou evidência é transportado em query;
- não existe `jobId` em localStorage;
- o destino reconstrói o resultado pela API persistida, não pelo HTML/link;
- o contrato começa somente por backtest; Laboratório não recebe deep link nesta fatia;
- resultados incompletos/desconhecidos continuam apresentados como desconhecidos pelos formatters existentes.

## Próximo passo

Depois da validação deste contrato, a #64 pode decidir se Laboratório merece um retorno equivalente. Isso deve ocorrer apenas se `/lab` conseguir reconstruir seu contexto por uma identidade persistida sem criar estado duplicado entre superfícies.
