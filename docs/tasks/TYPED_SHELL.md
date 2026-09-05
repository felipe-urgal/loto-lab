# Shell tipado — #60

## Objetivo

Mover o ownership funcional da navegação global para TypeScript sem alterar a jornada, os hashes ou a apresentação do shell.

## Ownership

- `web/src/core/shell.ts` é o owner canônico da navegação global;
- `web/shell.js` é somente o boundary de asset que importa o JavaScript emitido;
- `web/index.html` continua referenciando `/assets/shell.js`, preservando cache/fingerprint e ordem de carregamento atuais.

## Contratos preservados

- views principais: `dashboard`, `analysis`, `generate`, `games`, `backtests`;
- rotas dedicadas: Laboratório, Estratégias, Execuções, Agenda e IA;
- menu `Mais` com `aria-expanded`, fechamento por `Escape`, clique externo e mudança de breakpoint;
- marcação `aria-current` da navegação ativa;
- fallback de hash inválida para `#dashboard`;
- validação do valor persistido em `loto-lab:lottery`;
- breakpoint mobile existente em `680px`.

## Guardrails

Esta fatia não muda labels, IA/jornada, arquitetura de informação, CSS ou `web/app.js`. Dados usados para construir o menu são constantes locais; nenhum payload externo passa por `innerHTML`.

## Verificação

`tests/webShellArchitecture.test.ts` fixa o contrato de boundary fino e os comportamentos estruturais essenciais. A validação completa continua sendo `npm run check`, acrescida dos E2E browser quando executados pelo fluxo da PR.
