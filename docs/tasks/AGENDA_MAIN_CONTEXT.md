# Agenda usando o contrato principal de loteria

Issue: #60

Status: fatia concluída via PR #234.

## Objetivo

Remover da Agenda uma redefinição local de `LotteryId` e consumir o owner tipado já existente em `web/src/core/mainContext.ts`.

## Mudança

`web/src/features/agenda.ts` passa a importar `LotteryId` de `mainContext.ts` e deixa de manter uma union local com os mesmos três IDs.

A renderização, API, filtros, ações de notificação e persistência permanecem inalterados.

## Guardrails

- nenhuma rota ou interação muda;
- labels continuam pertencendo à Agenda, porque são apresentação da feature e não identidade global;
- `mainContext.ts` não ganha responsabilidade de copy/UI;
- o boundary continua TypeScript incremental, sem refactor horizontal de outras features;
- teste arquitetural impede a union local de voltar.

## Próximo passo

Outros consumidores só devem migrar para `mainContext.ts` quando houver duplicação real de identidade/validação. A existência do owner não justifica troca massiva de imports.
