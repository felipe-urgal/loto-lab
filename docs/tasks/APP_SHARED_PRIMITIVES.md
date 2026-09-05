# `web/app.js` consumindo primitives compartilhadas

Issue: #60

## Objetivo da fatia

Reduzir duplicação no entrypoint legado sem fazer uma migração big-bang das views que ainda vivem em `web/app.js`.

`docs/WEB.md` já define ownership TypeScript para client HTTP, escaping, formatters e toast. Esta fatia aplica esse contrato também ao `app.js` legado.

## Ownership após a mudança

`web/app.js` passa a importar diretamente:

- `web/src/core/api.ts` → `api` e contrato de erro HTTP;
- `web/src/shared/escaping.ts` → `escapeHtml`;
- `web/src/shared/formatters.ts` → `formatCurrency`, `formatDateTime`, `formatPercent`;
- `web/src/shared/toast.ts` → `toast`.

O arquivo deixa de manter implementações próprias dessas primitives.

## O que permanece local

Esta fatia não tenta transformar `app.js` em TypeScript nem mover todas as views de uma vez. Permanecem locais apenas responsabilidades ainda ligadas às superfícies legadas, por exemplo:

- estado/hash das views ainda não migradas;
- formatação simples de data de concurso (`YYYY-MM-DD → DD/MM/YYYY`);
- semântica financeira de `sumKnownMoney`, que preserva desconhecido como `undefined`;
- renderização básica de Painel/Análises/Gerar/Meus jogos enquanto seus owners canônicos assumem progressivamente o fluxo.

`safeApi` também permanece como política local de degradação graciosa: ele usa o client canônico e converte falhas não-`AbortError` em ausência de dado onde a UI já espera esse comportamento.

## Compatibilidade preservada

O client compartilhado mantém os contratos usados pelo legado:

- prefixo `/api/v1`;
- JSON para requests com body;
- `error.code` e mensagem da API;
- propagação de `AbortError`/`AbortSignal`;
- retorno `null` para `204`.

Além disso, o client canônico adiciona validação de path e evita que callers formem rotas fora do namespace esperado.

Os formatters compartilhados mantêm `—` para valores financeiros/percentuais ausentes ou inválidos. A migração não transforma valor desconhecido em zero.

## Regressão arquitetural

`tests/appSharedPrimitives.test.ts` garante que `web/app.js`:

- importa os quatro owners canônicos;
- mantém `safeApi` como política local;
- não volta a declarar `API`, `api`, `escapeHtml`, formatters ou `toast` localmente.

O teste protege a direção incremental da #60 sem exigir uma reescrita completa do frontend.

## Fora do escopo

- framework novo;
- mudança de rotas/hash;
- redesign visual;
- migração simultânea de todas as views;
- alteração de contratos financeiros, geração ou análise.
