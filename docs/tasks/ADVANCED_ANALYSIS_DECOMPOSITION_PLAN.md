# Plano de decomposição do hotspot de análise avançada

Issue: #62

Status: execução incremental em andamento. Continuidade (#236), estatística/combinatória (#243), estrutura (#250), associações (#252), ciclos (#257) e dinâmica/ranking (#260/#261) possuem owners próprios; rolling validation foi caracterizada em #262/#263 e está sendo extraída na #264/PR #265.

## Contexto

`src/analysis/advanced.ts` continua sendo a composition root da análise avançada, mas já delega responsabilidades coesas a módulos especializados.

Este plano mantém a decomposição em seams pequenas e verificáveis. Um PR estrutural não é oportunidade para mudar score, janelas, thresholds, correção estatística, copy metodológica ou schema público.

## Estado atual

- **PR A — continuidade/qualidade: concluído em #236.** `src/analysis/continuity.ts` é o owner de `isConsecutive`, `splitContinuousSegments`, `latestContinuousSegment` e `buildDataQuality`.
- **PR B — estatística/combinatória: concluído em #243.** `src/analysis/statistics.ts` é o owner dos helpers matemáticos puros, com reexports públicos históricos preservados por `advanced.ts`.
- **PR C — estrutura: concluído em #250.** `src/analysis/structure.ts` é o owner de estrutura/filtros metodológicos, protegido pela characterization de #249.
- **PR D — associações: concluído em #252.** `src/analysis/associations.ts` é o owner de pares/trincas e inferência associada, protegido pela characterization de #251 e por guard de ownership.
- **Characterization de ciclos: concluída em #253/#254.** O boundary público cobre histórico contínuo desde `#1`, gaps, recuperação de fronteira e left-censoring.
- **PR E — owner de ciclos: concluído em #257.** `src/analysis/cycles.ts` possui `buildCycles`, com guard de ownership e characterization #253 preservada.
- **Characterization de dinâmica/ranking: concluída em #258/#259.** Congelou ranks, offsets, movimentos, tiers, robustez, delay/streak e comportamento com gaps.
- **PR F — owner de dinâmica/ranking: concluído em #260/PR #261.** `src/analysis/dynamics.ts` possui `buildDynamics` e helpers coesos, preservando a characterization #258.
- **Characterization de rolling validation: concluída em #262/PR #263.** Congelou prefix-only, warmup 20, janelas 100/300/500, trecho contínuo mais recente e metadata anti-leakage.
- **PR G — owner de rolling validation: em execução na #264/PR #265.** `aggregateValidation` e `buildRollingValidation` saem do hotspot sem alterar expected values.
- **Demais seams: não iniciadas.** Similaridade é a única seam candidata relevante restante e continua condicionada a ganho real de ownership.

## Mapa atual de responsabilidades

### Estatística/combinatória compartilhada

Owner: `src/analysis/statistics.ts`.

Funções: `round`, `mean`, `quantile`, `summarize`, `percentileRank`, `combination`, `hypergeometricDistribution`, tabela/binomial exata, CDF normal e `evidenceLevel`.

Exports públicos históricos `combination`, `hypergeometricDistribution` e `exactBinomialTwoSidedP` continuam importáveis pelo caminho `src/analysis/advanced.ts`.

### Continuidade e qualidade histórica

Owner: `src/analysis/continuity.ts`.

Invariant: uma lacuna nunca pode ser atravessada por métrica sequencial; histórico censurado à esquerda continua distinto de histórico contínuo conhecido.

### Estrutura do sorteio e filtros metodológicos

Owner: `src/analysis/structure.ts`.

Invariants: esperado matemático continua uniforme sem reposição; repetição exige concurso imediatamente anterior; regras específicas por loteria permanecem no domínio; cobertura histórica não usa transições com gaps.

### Associações exploratórias

Owner: `src/analysis/associations.ts`.

Responsabilidades: chaves e contagem de pares/trincas, expected values, `AssociationStat`, `buildAssociations`, teste binomial bilateral exato, Bonferroni e highlights.

Dependências: `numberRange` + estatística/combinatória compartilhada.

Invariants: número de comparações, arredondamento, teste, correção, evidence levels e ordenação permanecem idênticos; associação continua explicitamente exploratória e não preditiva.

### Ranking, dinâmica e robustez

Owner: `src/analysis/dynamics.ts`, concluído em #260/PR #261.

Responsabilidades: `rankRows`, `rankMap`, `tierMap`, `rawFrequencyMap`, delay/streak, cenários de peso, `robustnessByNumber` e `buildDynamics`.

Dependências permitidas: continuidade, frequência, scoring, estatística e tipos de domínio.

Invariants:

- `DEFAULT_WEIGHTS` não muda em refactor;
- desempates de rank permanecem por número crescente;
- ranks anteriores usam offsets 1/5/10/20;
- tendência deriva do movimento de 10 concursos com thresholds atuais;
- snapshots recentes preservam janelas atuais;
- robustez usa os 243 cenários de multiplicadores de peso e mantém `rankRange`/shares atuais;
- delay/streak respeitam fronteiras de continuidade e não atravessam gaps;
- tier por evidência do score-v2 continua distinto do tier por rank usado nos cenários de robustez.

A characterization de #258/#259 continua sendo a rede pública de equivalência do owner.

### Ciclos

Owner: `src/analysis/cycles.ts`, concluído em #257.

Dependências permitidas: universo da loteria (`numberRange`), continuidade (`splitContinuousSegments`) e sumarização (`summarize`).

Invariants:

- um ciclo iniciado antes de uma lacuna não pode ser tratado como conhecido depois da lacuna;
- quando o histórico começa depois do concurso `#1`, o primeiro fechamento observado apenas restabelece uma fronteira conhecida e não entra na distribuição histórica;
- somente durações observadas de uma fronteira conhecida até o fechamento podem alimentar `completedCount`/`historicalLength`.

### Similaridade histórica

Ainda em `src/analysis/advanced.ts`.

Invariant: similaridade é descritiva e não deve ganhar semântica preditiva durante refactor.

### Validação rolling anti-leakage

Owner em extração: `src/analysis/validation.ts` na #264/PR #265.

Responsabilidades: warmup e janelas, seleção do trecho contínuo mais recente, classificação prefix-only, hits/tamanhos por tier, observed-vs-expected, z-score, Bonferroni, evidence level e metadata metodológica.

Dependências permitidas: tipos de domínio, continuidade, frequência/universo, scoring e estatística compartilhada. O owner não deve depender de dinâmica/ranking, similaridade, ciclos, estrutura, associações ou da composition root.

Invariants: cada target usa somente prefixo anterior; warmup permanece 20; janelas permanecem 100/300/500; correção continua cobrindo 3 grupos × 3 janelas; só o trecho contínuo mais recente é elegível; schema e copy metodológica permanecem idênticos.

A characterization de #262/PR #263 continua sendo a rede pública de equivalência da extração.

### Composition root

`buildAdvancedAnalysis` filtra/ordena a loteria, monta o ranking base e compõe os owners. O schema agregado e o disclaimer público permanecem sob responsabilidade dessa fronteira.

## Próximas seams candidatas

### Rolling validation — owner em #264/PR #265

A extração só é válida se a characterization de #262 permanecer idêntica e verde. O novo owner não pode depender da composition root nem incorporar similaridade, dinâmica, ciclos, estrutura ou associações.

Anti-leakage é finding bloqueante: qualquer target classificado com informação do próprio concurso invalida a mudança.

### Similaridade/composição final

Extrair similaridade somente se reduzir de fato responsabilidade da composition root. Depois revisar `buildAdvancedAnalysis` como compositor; tamanho de arquivo isolado não é métrica de sucesso.

## Matriz de validação

| Seam | Caracterização mínima | Risco bloqueante |
| --- | --- | --- |
| continuidade | gaps, left-censoring, trecho final | atravessar concurso ausente |
| combinatória | combinações, distribuições, p-values | diferença numérica/rounding |
| estrutura | 3 loterias, repetição, Lotofácil grid | regra de loteria alterada |
| associações | pares/trincas, Bonferroni, highlights | p-value/evidência diferente |
| ciclos | segmentos completos/incompletos, gaps, left-censoring | ciclo conhecido após fronteira desconhecida |
| dinâmica | ranks, offsets, movers, robustez, delay/streak, gaps | ranking/tier ou fronteira sequencial diferente |
| validação | prefix-only + warmup + janelas + gaps | qualquer leakage futuro |
| similaridade | overlap/distância | semântica preditiva nova |

Além dos testes direcionados, cada PR executa `npm run check`. Mudança matemática exige comparação de outputs antes/depois em fixtures representativas; atualizar expected values sem explicar a diferença é finding bloqueante.

## Critérios de abortar um refactor

Pare e reavalie quando qualquer um ocorrer:

- a extração exige editar simultaneamente múltiplos blocos não relacionados;
- o novo módulo cria ciclo de imports ou apenas desloca um arquivo grande para outro;
- é necessário mudar schema público/expected values para a extração passar;
- a motivação virou somente reduzir linhas;
- invariants relevantes não conseguem ser caracterizados antes da mudança;
- surge mudança metodológica incidental — ela deve virar issue/PR próprio com justificativa científica.

## Decisão atual

A #262/PR #263 foi mergeada e congelou o boundary público da rolling validation. A #264/PR #265 aplica a extração mecânica para `src/analysis/validation.ts`, com guard de ownership e sem alterar expected values.

Depois da #265 verde e revisada, reavaliar similaridade como última seam candidata relevante. Ela continua posterior e só deve sair da composition root com ganho claro de ownership e sem semântica preditiva nova.
