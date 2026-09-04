# Feature loader tipado (#194)

Status: **em revisão**.

## Objetivo

Mover o ownership funcional do carregamento lazy das features para TypeScript sem mudar a jornada, o fingerprint dos assets nem o contrato compartilhado de lifecycle da view.

## Alterações

- `web/src/core/featureLoader.ts` passa a ser o owner canônico do carregamento de CSS/módulos, cache e coordenação de render;
- `web/feature-loader.js` fica reduzido a boundary compatível para o JavaScript emitido;
- o owner consome `currentMainView` e `emitViewRendered` diretamente de `viewLifecycle.ts`;
- o comportamento atual de lazy loading, ordem das camadas visuais, retry de Testes históricos e fallback existente de Meus Jogos permanece inalterado nesta fatia;
- `tests/webViewLifecycle.test.ts` protege o novo ownership e impede retorno de lifecycle/carregamento ao boundary.

## Fora de escopo

A remoção do fallback funcional legado de Meus Jogos é acompanhada separadamente pela #195. A migração da camada de auditabilidade de aposta real é acompanhada pela #196.

## Validação esperada

- `npm run check`;
- browser E2E relevante;
- CI/Security verdes;
- auto-review final no SHA exato antes do merge.
