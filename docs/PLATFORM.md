# Platform baseline

A baseline operacional do Loto Lab usa Node.js 24 LTS.

## Versões alinhadas

- runtime local recomendado: Node.js 24.19.0;
- CI: Node.js 24.19.0;
- imagem de build/runtime: `node:24.19.0-alpine3.24` pinada por digest;
- tipos do Node: linha `@types/node` 24.x;
- compilador TypeScript: permanece em 5.9.x neste ciclo.

## Política de atualização

Atualizações patch/minor dentro da linha Node 24 podem ser tratadas pelo Dependabot. Mudanças para uma nova major de Node devem ser feitas de forma coordenada entre CI, Docker, `engines`, `.nvmrc` e tipos, com o pipeline completo verde antes do merge.

O TypeScript é tratado como toolchain independente do runtime Node. Mudanças major do compilador devem passar por PR dedicado.
