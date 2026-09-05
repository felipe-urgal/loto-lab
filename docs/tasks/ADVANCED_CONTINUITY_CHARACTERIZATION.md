# Caracterização da continuidade da análise avançada

Issue: #62

Status: characterization tests adicionados antes da extração do owner de continuidade/qualidade.

## Objetivo

Congelar o comportamento observável de continuidade histórica antes de mover helpers de `src/analysis/advanced.ts` para um módulo próprio.

Esta fatia não altera algoritmo, score, ranges, p-values, validação ou schema público. Ela cria a rede de segurança exigida pelo plano `ADVANCED_ANALYSIS_DECOMPOSITION_PLAN.md` para o primeiro refactor de código.

## Contratos protegidos

`tests/advancedContinuityCharacterization.test.ts` fixa que:

- rolling validation usa somente o sufixo contínuo mais recente depois de uma lacuna;
- uma lacuna antiga não torna a repetição do concurso atual desconhecida quando o par atual é contínuo;
- múltiplas lacunas permanecem distintas e `missingContestCount` soma concursos ausentes, não apenas quantidade de gaps;
- uma lacuna imediatamente antes do último concurso reduz o trecho contínuo a um concurso e torna repetição atual indisponível;
- filtragem por loteria e ordenação acontecem antes da avaliação de continuidade;
- concursos de outra loteria não criam gaps artificiais;
- o warmup de 20 concursos da validação permanece aplicado somente dentro do trecho contínuo elegível.

## Próximo passo

Com esses contratos verdes, a próxima fatia da #62 pode extrair `isConsecutive`, `splitContinuousSegments`, `latestContinuousSegment` e `buildDataQuality` para um owner interno de continuidade, preservando os mesmos outputs.

A extração deve ser abortada se exigir mudança de schema público, expected values metodológicos ou alteração simultânea de blocos não relacionados.
