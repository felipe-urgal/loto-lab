# Retorno contextual de Execuções

Issue: #64

Status: fatia concluída.

## Objetivo

Reduzir troca de contexto quando uma execução já terminou sem transformar `/jobs` em owner de Testes históricos ou Laboratório.

## Comportamento

Cada card de Execuções passa a oferecer um retorno para a superfície canônica que representa seu tipo de trabalho:

- `backtest` → `/#backtests` com `Abrir Testes históricos`;
- `strategy-lab` → `/lab` com `Abrir Laboratório`.

A ação aparece no próprio card e convive com `Cancelar` enquanto o job ainda está queued/running.

## Guardrails

- nenhum controller/formulário é copiado para Execuções;
- nenhum ranking, winner, p-value ou evidência é transportado como recomendação;
- nenhum `jobId`, query string ou storage cross-surface é inventado nesta fatia;
- as rotas diretas existentes permanecem canônicas;
- `/jobs` continua sendo a superfície de lifecycle operacional da execução.

## Próximo passo

Um futuro retorno por `jobId` só deve existir quando a superfície de destino possuir contrato explícito para consumir esse identificador e reconstruir proveniência de forma auditável. Até lá, o link contextual permanece simples e sem estado implícito.
