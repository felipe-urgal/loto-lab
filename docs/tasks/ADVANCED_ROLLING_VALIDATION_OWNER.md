# Owner da rolling validation anti-leakage

Issue: #264

Refs: #62 #262 #263

Status: em implementação após a characterization pública da #262/PR #263.

## Objetivo

Extrair `aggregateValidation` e `buildRollingValidation` de `src/analysis/advanced.ts` para um owner focado, sem alterar qualquer contrato metodológico ou público de `result.validation`.

## Owner

`src/analysis/validation.ts` passa a concentrar:

- warmup e janelas de validação;
- seleção do trecho contínuo mais recente;
- classificação prefix-only de cada target;
- contagem de hits e tamanhos por tier;
- agregação observed-vs-expected;
- z-score, p-value bilateral, Bonferroni e evidence level;
- metadata metodológica pública da rolling validation.

`src/analysis/advanced.ts` permanece composition root e apenas delega `validation: buildRollingValidation(scoped, config)`.

## Dependências permitidas

O owner depende somente de:

- tipos de domínio;
- continuidade para `latestContinuousSegment`;
- universo da loteria via `numberRange`;
- scoring via `buildNumberAnalysis`;
- estatística compartilhada (`round`, `twoSidedNormalP`, `evidenceLevel`).

Ele não depende de `advanced.ts`, dinâmica/ranking, similaridade, ciclos, estrutura ou associações.

## Invariants preservados

- cada target usa apenas o prefixo histórico anterior;
- warmup permanece em 20 concursos;
- janelas permanecem 100 / 300 / 500;
- no máximo 500 rounds são avaliados;
- somente o trecho contínuo mais recente é elegível;
- correção permanece Bonferroni de 9 testes (3 tiers × 3 janelas);
- expected hits/rates, z-score, adjusted p-value, evidence level e rounding permanecem idênticos;
- schema e copy metodológica pública não mudam.

A characterization de #262/PR #263 é a rede de equivalência obrigatória desta extração.

## Guard de ownership

`tests/advancedValidationOwnership.test.ts` impede que:

- constantes e helpers da rolling validation voltem para `advanced.ts`;
- o novo owner passe a importar a composition root;
- o owner adquira dependências de outros blocos matemáticos não relacionados.

## Fora do escopo

- qualquer mudança de score/tier/threshold;
- novas janelas ou correções estatísticas;
- alteração de evidence level;
- similaridade histórica;
- mudança de schema público;
- mudança metodológica.

## Próxima decisão

Depois da #264 verde e revisada, a seam matemática relevante restante em `advanced.ts` é similaridade. Ela só deve ganhar owner próprio se a extração reduzir responsabilidade real da composition root sem introduzir semântica preditiva.
