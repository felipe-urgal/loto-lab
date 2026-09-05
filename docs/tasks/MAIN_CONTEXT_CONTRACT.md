# Contrato compartilhado de contexto principal

Issue: #60

Status: fatia concluída.

## Objetivo

Centralizar em TypeScript a identidade das views principais e das loterias usadas transversalmente pelo shell/lifecycle, removendo duplicação de contrato sem transformar esta fatia em migração ampla de `web/app.js`.

## Owner

`web/src/core/mainContext.ts` passa a definir:

- `MAIN_VIEWS` e `MainView`;
- `LOTTERY_IDS` e `LotteryId`;
- `isMainView`;
- `mainViewFromHash`, preservando a semântica histórica de remover `#` e usar `dashboard` somente quando o hash está vazio;
- `isLotteryId`.

`web/src/core/shell.ts` consome o owner para validar hash e storage. O shell continua responsável por normalizar uma view desconhecida para `dashboard`. `web/src/core/viewLifecycle.ts` consome o mesmo owner e mantém `mainViewFromHash` reexportado para compatibilidade de imports existentes.

## Guardrails

- não muda rotas ou ordem de navegação;
- hash desconhecido continua normalizado pelo shell para `dashboard`;
- o helper público `mainViewFromHash` não ganha validação nova incidentalmente;
- lottery ID inválido continua removido do storage pelo shell;
- nenhuma renderização de feature é movida nesta fatia;
- `web/app.js` permanece no escopo incremental da #60, sem big-bang.

## Próximo passo

Consumidores legados restantes podem migrar para este contrato quando isso reduzir duplicação real. A existência do owner não justifica refactor horizontal apenas para trocar imports.
