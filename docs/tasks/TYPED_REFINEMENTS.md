# Refinements globais com ownership TypeScript

Issue: #60

Status: fatia de implementação em revisão.

## Objetivo

Mover a implementação funcional de `web/refinements.js` para `web/src/features/refinements.ts`, mantendo o asset JavaScript apenas como boundary compatível.

## Contratos preservados

- Análises mantém classificação, filtro, ordenação, score explainer e aviso anti-previsão;
- Gerador mantém resumo do núcleo, texto de estratégia e mudança de `Gerar jogos` para `Gerar novamente` após resultado;
- Meus Jogos mantém a indicação de resultado pendente e bloqueia conferência de concurso ainda não disponível;
- cache do último concurso continua invalidado na troca de loteria, refresh e evento de sincronização;
- respostas stale continuam descartadas quando view/loteria deixam de ser as mesmas.

## Ownership

O owner tipado consome diretamente `api`, `currentMainView`/`onViewRendered` e `escapeHtml`. Isso remove `fetch` e parsing de hash próprios desta camada sem alterar os controllers canônicos de Análises, Gerador ou Meus Jogos.

`web/refinements.js` passa a conter somente o import do JavaScript emitido.

## Segurança e metodologia

A migração não altera pesos, score, seleção de dezenas, geração ou conferência. Conteúdo externo que já era escapado continua escapado; a camada preserva o aviso de que frequência histórica não aumenta a probabilidade individual da próxima extração.

## Validação

`tests/refinementsArchitecture.test.ts` protege boundary mínimo, consumo dos owners compartilhados e ausência de `fetch` funcional nesta camada. O gate canônico continua sendo `npm run check`.
