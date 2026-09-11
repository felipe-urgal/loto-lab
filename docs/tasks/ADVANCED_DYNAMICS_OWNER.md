# Owner de dinâmica e ranking da análise avançada

Issue: #260

Refs: #62, #258

Status: implementação no PR #261, preservando a characterization pública entregue em #258/#259.

## Objetivo

Retirar de `src/analysis/advanced.ts` a responsabilidade de montar `result.ranking.dynamics` sem alterar metodologia, schema público ou expected values.

`src/analysis/dynamics.ts` passa a ser o owner de:

- rank atual e desempate determinístico por número;
- ranks históricos nos offsets 1/5/10/20;
- movimentos, tendência e movers;
- snapshots recentes de tier;
- cenários de peso e robustez;
- delay, histórico de delays e streak;
- frequências contextualizadas por histórico/ano/mês/recent10/recent20;
- contribuições dos componentes do score para apresentação da dinâmica.

## Dependências permitidas

O owner depende somente de:

- `continuity.ts` para fronteiras sequenciais;
- `frequency.ts` para frequência bruta;
- `scoring.ts` para score-v2 e `DEFAULT_WEIGHTS`;
- `statistics.ts` para sumarização, percentil e arredondamento;
- tipos de domínio.

Não depende da composition root nem de associações, ciclos, estrutura, similaridade ou rolling validation.

`tierMap` permanece exportado pelo owner porque o rolling validation já consome a mesma classificação produzida por `buildNumberAnalysis`; mover a validação está explicitamente fora desta fatia.

## Contratos preservados

A characterization de #258 permanece a fonte de verdade para:

- desempate de rank por número crescente;
- offsets 1/5/10/20;
- thresholds atuais de `rising | falling | stable | unknown`;
- ordenação dos movers;
- diferença entre tier por evidência do score-v2 e tier por rank usado nos cenários de robustez;
- 243 cenários de robustez;
- delay/streak sem atravessar gaps;
- desconhecido distinto de zero;
- comportamento em histórico vazio e insuficiente.

Nenhum expected value da characterization deve mudar para acomodar a extração.

## Guard de ownership

`tests/advancedDynamicsOwnership.test.ts` exige que:

- `advanced.ts` importe/delegue `buildDynamics`;
- helpers de dinâmica/ranking não retornem ao hotspot;
- o novo owner não dependa de `advanced.ts`, associações, ciclos ou estrutura.

## Fora de escopo

- rolling validation/anti-leakage;
- similaridade histórica;
- mudanças de score, pesos, tiers, offsets, janelas ou thresholds;
- mudanças metodológicas ou semântica preditiva;
- reorganização final da composition root.

## Próximo passo

Depois do PR #261 verde e revisado, reavaliar a próxima menor seam da #62. Rolling validation continua com prioridade de segurança por causa do invariant anti-leakage; similaridade só deve ser extraída se houver ganho real de ownership.
