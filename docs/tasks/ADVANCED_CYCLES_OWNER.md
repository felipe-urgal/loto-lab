# Owner de ciclos da análise avançada

Issue: #256

PR: #257.

Status: em review; `src/analysis/cycles.ts` é o owner proposto para ciclos da análise avançada.

## Objetivo

Extrair de `src/analysis/advanced.ts` somente a responsabilidade de ciclos, preservando integralmente o contrato estabilizado em #253/#254 e sem misturar dinâmica/ranking, similaridade ou rolling validation.

## Ownership

- `src/analysis/cycles.ts` possui `buildCycles` e o estado de ciclo completo/parcial;
- `src/analysis/continuity.ts` continua owner de segmentação contínua e gaps;
- `src/analysis/frequency.ts` continua owner do universo válido da loteria via `numberRange`;
- `src/analysis/statistics.ts` continua owner de `summarize`;
- `src/analysis/advanced.ts` permanece composition root e apenas delega `dynamics.cycles` ao owner de ciclos.

## Contratos preservados

A characterization de #253 permanece inalterada:

- histórico contínuo desde o concurso `#1` mantém ciclos completos e o ciclo parcial atual;
- uma lacuna invalida a fronteira atual até o primeiro fechamento observado no novo segmento;
- o primeiro fechamento após gap apenas restabelece uma fronteira conhecida e não entra em `completedCount`/`historicalLength`;
- histórico iniciado depois do concurso `#1` é censurado à esquerda;
- somente durações observadas de uma fronteira conhecida até o fechamento alimentam a distribuição histórica;
- ciclo continua descritivo e não recebe semântica preditiva.

## Dependências permitidas

O owner de ciclos permanece restrito a:

- `Contest`/`LotteryConfig` do domínio;
- `splitContinuousSegments` para fronteiras de continuidade;
- `numberRange` para o universo da loteria;
- `summarize` para a distribuição histórica.

Não depende de scoring, estrutura, associações, ranking/dinâmica, similaridade ou rolling validation.

## Fora de escopo

- ranks, offsets, tiers e robustez;
- score/weights;
- similaridade histórica;
- rolling validation/anti-leakage;
- qualquer mudança de threshold, janela, correção estatística ou evidence level;
- qualquer alteração de expected values da characterization #253.

## Validação

Além de `tests/advancedCyclesCharacterization.test.ts`, a #256 adiciona `tests/advancedCyclesOwnership.test.ts` para garantir que `advanced.ts` delegue ao owner e que `cycles.ts` mantenha dependências focadas.

O gate canônico é `npm run check` no CI do PR #257. O auto code review final deve ser registrado no mesmo SHA verde antes do merge.

## Próximo passo

Após o merge desta fatia, dinâmica/ranking só pode avançar depois de characterization própria de ranks, offsets, tiers e robustez. Rolling validation e similaridade continuam seams posteriores, condicionadas a contratos suficientes e ganho real de ownership.
