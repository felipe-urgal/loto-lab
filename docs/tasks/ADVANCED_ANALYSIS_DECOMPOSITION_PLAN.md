# Plano de decomposição do hotspot de análise avançada

Issue: #62

Status: execução incremental em andamento; continuidade (#236), estatística/combinatória (#243) e estrutura (#250) já estão na `main`. A próxima seam reavaliada é associações, precedida por characterization pública em `test/62-analysis-associations-characterization`.

## Contexto

`src/analysis/advanced.ts` ainda concentra composição e responsabilidades estatísticas relevantes, mas já delega continuidade/qualidade, estatística/combinatória e estrutura a owners próprios.

Este documento mantém a decomposição em seams pequenas e verificáveis. A regra é preservar o contrato lógico de `buildAdvancedAnalysis`: um PR de decomposição não é oportunidade para mudar score, janelas, thresholds, correção estatística, copy metodológica ou schema público.

Depois da extração estrutural em #250, o hotspot foi reavaliado antes de puxar outra seam. Associações de pares/trincas continuam sendo uma fronteira coesa: dependem do universo da loteria e dos helpers estatísticos já estabilizados, sem tocar continuidade, ranking, ciclos ou rolling validation.

## Estado atual

- **PR A — continuidade/qualidade: concluído em #236.** `src/analysis/continuity.ts` é o owner de `isConsecutive`, `splitContinuousSegments`, `latestContinuousSegment` e `buildDataQuality`.
- **PR B — estatística/combinatória: concluído em #243.** `src/analysis/statistics.ts` é o owner dos helpers matemáticos puros, com reexports públicos históricos preservados por `advanced.ts`.
- **PR C — estrutura: concluído em #250.** `src/analysis/structure.ts` é o owner de estrutura/filtros metodológicos, protegido pela characterization de #249.
- **PR D — associações: próxima seam candidata.** Antes da extração, `tests/advancedAssociationsCharacterization.test.ts` congela o boundary público de pares/trincas, inferência e Bonferroni.
- PRs E–G só avançam se a seam anterior estiver estável e ainda houver ganho claro de ownership.

## Mapa atual de responsabilidades

### 1. Estatística/combinatória compartilhada

Owner atual: `src/analysis/statistics.ts`.

Funções: `round`, `mean`, `quantile`, `summarize`, `percentileRank`, `combination`, `hypergeometricDistribution`, tabela/binomial exata, CDF normal e `evidenceLevel`.

Consumidores: estrutura, associações, delays/dinâmica e validação.

Exports públicos históricos `combination`, `hypergeometricDistribution` e `exactBinomialTwoSidedP` continuam importáveis pelo caminho `src/analysis/advanced.ts`.

### 2. Continuidade e qualidade histórica

Owner atual: `src/analysis/continuity.ts`.

Funções: `isConsecutive`, `splitContinuousSegments`, `latestContinuousSegment`, `buildDataQuality`.

Consumidores: delay/streak, ciclos, similaridade e rolling validation.

Invariant: uma lacuna nunca pode ser atravessada por métrica sequencial; histórico censurado à esquerda continua distinto de histórico contínuo conhecido.

### 3. Estrutura do sorteio e filtros metodológicos

Owner atual: `src/analysis/structure.ts`.

Funções: `longestConsecutiveRun`, `lotofacilGrid`, `structureForContest`, `structuralMetric`, `methodologyRanges`, `exactFilterCoverage`, `buildStructure`.

Dependências: continuidade + combinatória.

Invariants: esperado matemático continua uniforme sem reposição; repetição exige concurso imediatamente anterior; regras específicas por loteria permanecem no domínio; cobertura histórica não usa transições com gaps.

### 4. Ranking, dinâmica e robustez

Funções: `rankRows`, `rankMap`, `tierMap`, `rawFrequencyMap`, delay/streak, cenários de peso, `robustnessByNumber`, `buildDynamics`.

Dependências: `buildNumberAnalysis`, frequência, continuidade e sumarização.

Invariants: `DEFAULT_WEIGHTS`, desempates por número, offsets 1/5/10/20, janelas 10/20, estabilidade de tiers e significado de movimento não mudam.

### 5. Ciclos

Função: `buildCycles`.

Dependência principal: continuidade + universo da loteria + sumarização.

Invariant: um ciclo iniciado antes de uma lacuna não pode ser tratado como conhecido depois da lacuna.

### 6. Associações exploratórias

Funções: chaves de pares/trincas, `associationStat`, `buildAssociations` e inferência associada.

Dependências: `numberRange` + combinatória/estatística compartilhada.

Invariants: teste binomial bilateral exato, Bonferroni, número total de comparações, arredondamento e níveis de evidência permanecem idênticos; associação continua explicitamente exploratória.

### 7. Similaridade histórica

Função: `buildSimilarity`.

Dependências: estrutura do sorteio + continuidade.

Invariant: similaridade é descritiva e não deve ganhar semântica preditiva durante refactor.

### 8. Validação rolling anti-leakage

Funções: `aggregateValidation`, `buildRollingValidation`.

Dependências: continuidade, `buildNumberAnalysis`, tiers e estatística compartilhada.

Invariants: cada target usa somente prefixo anterior; warmup permanece 20; janelas permanecem 100/300/500; correção continua cobrindo 3 grupos × 3 janelas; só o trecho contínuo mais recente é elegível.

### 9. Composition root

`buildAdvancedAnalysis` deve terminar como um compositor legível: filtra/ordena a loteria, monta o ranking base e delega os blocos acima. Ele continua dono do schema agregado e do disclaimer público.

## Ordem dos PRs

### PR A — continuidade/qualidade — concluído em #236

Extraído para `src/analysis/continuity.ts` com characterization de histórico contínuo, gaps e ownership.

### PR B — estatística/combinatória — concluído em #243

Helpers puros extraídos para `src/analysis/statistics.ts`, preservando reexports públicos a partir de `advanced.ts` e os valores matemáticos existentes.

### PR C — estrutura — concluído em #250

Estrutura e filtros metodológicos extraídos para `src/analysis/structure.ts` depois da characterization de #249, sem alterar ranges, baselines, gaps ou expected values.

### PR D — associações — próxima seam candidata

Antes de mover código, estabilizar characterization pública para as três loterias cobrindo pares, trincas, Bonferroni, highlights e evidence levels.

Se a characterization ficar verde, mover pares/trincas e inferência associada para owner próprio. Preservar exatamente teste/correção/evidence levels e não aproveitar o refactor para criar nova inferência.

### PR E — dinâmica/ciclos

Separar primeiro ciclos, depois ranking/dinâmica se ainda houver ganho claro. `buildDynamics` tem fan-out alto e só deve sair com rede de characterization suficiente.

### PR F — validação rolling

Mover a validação por último entre os blocos matemáticos porque ela carrega o invariant anti-leakage mais importante. O PR deve provar equivalência em targets reais, não apenas compilar.

### PR G — similaridade/composição final

Extrair similaridade somente se reduzir de fato o hotspot. Depois revisar `buildAdvancedAnalysis` como composition root; não perseguir tamanho de arquivo como métrica isolada.

## Matriz de validação

| Seam | Caracterização mínima | Risco bloqueante |
| --- | --- | --- |
| continuidade | gaps, left-censoring, trecho final | atravessar concurso ausente |
| combinatória | combinações, distribuições, p-values | diferença numérica/rounding |
| estrutura | 3 loterias, repetição, Lotofácil grid | regra de loteria alterada |
| associações | pares/trincas, Bonferroni, highlights | p-value/evidência diferente |
| dinâmica | ranks, offsets, robustez | ranking/tier diferente |
| ciclos | segmentos completos/incompletos | ciclo conhecido após gap |
| validação | prefix-only + janelas | qualquer leakage futuro |
| similaridade | overlap/distância | semântica preditiva nova |

Além dos testes direcionados, cada PR executa `npm run check`. Mudança matemática exige comparação de outputs antes/depois em fixtures representativas; atualizar expected values sem explicar a diferença é finding bloqueante.

## Critérios de abortar um refactor

Pare e não abra PR quando qualquer um ocorrer:

- a extração exige editar simultaneamente múltiplos blocos não relacionados;
- o novo módulo cria ciclo de imports ou apenas desloca um arquivo grande para outro;
- é necessário mudar schema público/expected values para a extração passar;
- a motivação virou somente reduzir linhas;
- invariants relevantes não conseguem ser caracterizados antes da mudança;
- surge mudança metodológica incidental — ela deve virar issue/PR próprio com justificativa científica.

## Decisão atual

Depois de #250, a seam de associações foi reavaliada e continua pequena/coesa o suficiente para ser a próxima candidata. A branch `test/62-analysis-associations-characterization` deve primeiro provar o comportamento público atual. Só então a extração do owner de associações pode começar, sem alterar expected values, inferência ou schema.