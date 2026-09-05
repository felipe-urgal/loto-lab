# Contrato dos boundaries JavaScript tipados

Issue: #60

Status: concluída nesta fatia.

## Objetivo

Impedir que features já migradas para `web/src` recuperem uma segunda implementação funcional em seus arquivos JavaScript públicos.

## Contrato

Os boundaries listados em `tests/webTypedBoundaries.test.ts` existem somente para carregar um ou mais módulos JavaScript emitidos a partir dos owners TypeScript.

Um boundary pode ter mais de um `import` quando a feature possui owners internos legítimos — por exemplo, controller + enhancements — mas não pode declarar função, classe, variável, listener, acesso ao DOM ou `fetch` próprio.

O guard cobre as superfícies que `docs/WEB.md` já declara como migradas, além do shell/feature loader tipados.

## Exceções deliberadas

- `web/runtime.js`: boundary de compatibilidade que também reexporta primitives para módulos JavaScript ainda existentes;
- `web/app.js`: handoff legado do shell/main view que ainda não é um boundary import-only.

Essas exceções não são motivo para enfraquecer o contrato dos módulos já migrados.

## Por que este teste existe

Testes específicos de feature protegem comportamento local. Este teste protege o invariant arquitetural transversal da #60: uma feature migrada não deve ganhar silenciosamente um fallback funcional paralelo durante manutenção futura.

Ele não valida tamanho de arquivo, número exato de imports ou estrutura interna do owner TypeScript.
