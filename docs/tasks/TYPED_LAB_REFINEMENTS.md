# Refinements do Laboratório com ownership TypeScript

Issue: #60

Status: fatia de implementação em revisão.

## Objetivo

Retirar implementação funcional de `web/lab-refinements.js` sem fazer refactor do controller principal do Laboratório.

## Contrato preservado

- desempates continuam explicitados quando a métrica primária é igual;
- ROI/taxa de premiação empatados continuam abrindo o gráfico em média de acertos;
- labels inicial/final do eixo continuam alinhadas para evitar corte visual;
- a mensagem inicial continua respeitando o atributo `hidden`;
- nenhuma regra estatística, benchmark, inferência ou texto metodológico do owner principal é alterado.

## Ownership

`web/src/features/labRefinements.ts` passa a ser a fonte funcional tipada. `web/lab-refinements.js` fica somente como boundary compatível de asset e importa o JavaScript emitido pelo build.

A fatia não funde este refinement em `lab.ts`: o objetivo aqui é eliminar JavaScript funcional legado com baixo risco. Uma fusão futura só deve ocorrer se houver ganho real de ownership/lifecycle e teste que justifique o acoplamento.

## Validação

`tests/labRefinementsArchitecture.test.ts` protege o boundary mínimo e os três comportamentos funcionais que permanecem no owner TypeScript. O gate canônico continua sendo `npm run check`.
