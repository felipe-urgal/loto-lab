# Plano de decomposição do hotspot de análise avançada

Issue: #62

Status: execução incremental em andamento. Continuidade (#236), estatística/combinatória (#243), estrutura (#250) e associações (#252) possuem owners próprios; as characterizations de estrutura (#249), associações (#251) e ciclos (#253) preservam contratos públicos antes de novas extrações.

## Contexto

`src/analysis/advanced.ts` continua sendo a composition root da análise avançada, mas já delega responsabilidades coesas a módulos especializados.

Este plano mantém a decomposição em seams pequenas e verificáveis. Um PR estrutural não é oportunidade para mudar score, janelas, thresholds, correção estatística, copy metodológica ou schema público.

## Estado atual

- **PR A — continuidade/qualidade: concluído em #236.** `src/analysis/continuity.ts` é o owner de `isConsecutive`, `splitContinuousSegments`, `latestContinuousSegment` e `buildDataQuality`.
- **PR B — estatística/combinatória: concluído em #243.** `src/analysis/statistics.ts` é o owner dos helpers matemáticos puros, com reexports públicos históricos preservados por `advanced.ts`.
- **PR C — estrutura: concluído em #250.** `src/analysis/structure.ts` é o owner de estrutura/filtros metodológicos, protegido pela characterization de #249.
- **PR D — associações: concluído em #252.** `src/analysis/associations.ts` é o owner de pares/trincas e inferência associada, protegido pela characterization de #251 e por guard de ownership.
- **Characterization de ciclos: #253.** O boundary público de ciclos cobre histórico contínuo desde `#1`, gaps, recuperação de fronteira e left-censoring antes de qualquer extração.
- **PRs E–G: não iniciados.** Devem ser reavaliados um a um; a ordem abaixo é direção, não obrigação.

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

Ainda em `src/analysis/advanced.ts`.

Funções: `rankRows`, `rankMap`, `tierMap`, `rawFrequencyMap`, delay/streak, cenários de peso, `robustnessByNumber`, `buildDynamics`.

Invariants: `DEFAULT_WEIGHTS`, desempates por número, offsets 1/5/10/20, janelas 10/20, estabilidade de tiers e significado de movimento não mudam.

### Ciclos

Ainda em `src/analysis/advanced.ts`.

Invariants:

- um ciclo iniciado antes de uma lacuna não pode ser tratado como conhecido depois da lacuna;
- quando o histórico começa depois do concurso `#1`, o primeiro fechamento observado apenas restabelece uma fronteira conhecida e não entra na distribuição histórica;
- somente durações observadas de uma fronteira conhecida até o fechamento podem alimentar `completedCount`/`historicalLength`.

### Similaridade histórica

Ainda em `src/analysis/advanced.ts`.

Invariant: similaridade é descritiva e não deve ganhar semântica preditiva durante refactor.

### Validação rolling anti-leakage

Ainda em `src/analysis/advanced.ts`.

Invariants: cada target usa somente prefixo anterior; warmup permanece 20; janelas permanecem 100/300/500; correção continua cobrindo 3 grupos × 3 janelas; só o trecho contínuo mais recente é elegível.

### Composition root

`buildAdvancedAnalysis` filtra/ordena a loteria, monta o ranking base e compõe os owners. O schema agregado e o disclaimer público permanecem sob responsabilidade dessa fronteira.

## Próximas seams candidatas

### PR E — owner de ciclos — reavaliar após #253

#253 estabiliza a menor fronteira do grupo e corrige a divergência de left-censoring antes de qualquer movimentação de código.

Se a characterization ficar verde e a extração continuar pequena, o próximo PR pode mover **somente `buildCycles`** para um owner coeso. Não agrupar ranking/dinâmica por proximidade textual.

Pré-condições para a extração:

- characterization #253 verde sem ajuste de expected values;
- dependências limitadas ao universo da loteria, continuidade e sumarização;
- nenhum schema público novo;
- nenhum ciclo de imports;
- ganho real de ownership em `advanced.ts`.

Dinâmica/ranking continuam com pré-condições próprias: characterization de ranks, offsets, robustez e tiers antes de qualquer movimentação.

### PR F — validação rolling

Mover por último entre os blocos matemáticos porque carrega o invariant anti-leakage mais crítico. O PR deve provar equivalência prefix-only e não apenas compilar.

### PR G — similaridade/composição final

Extrair similaridade somente se reduzir de fato responsabilidade da composition root. Depois revisar `buildAdvancedAnalysis` como compositor; tamanho de arquivo isolado não é métrica de sucesso.

## Matriz de validação

| Seam | Caracterização mínima | Risco bloqueante |
| --- | --- | --- |
| continuidade | gaps, left-censoring, trecho final | atravessar concurso ausente |
| combinatória | combinações, distribuições, p-values | diferença numérica/rounding |
| estrutura | 3 loterias, repetição, Lotofácil grid | regra de loteria alterada |
| associações | pares/trincas, Bonferroni, highlights | p-value/evidência diferente |
| ciclos | segmentos completos/incompletos, gaps, left-censoring | ciclo conhecido após fronteira desconhecida |
| dinâmica | ranks, offsets, robustez | ranking/tier diferente |
| validação | prefix-only + janelas | qualquer leakage futuro |
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

#253 caracteriza ciclos por boundary público e reconcilia a fronteira censurada à esquerda sem extrair ownership. Depois desta fatia verde, a #62 pode reavaliar um owner **somente de ciclos**. Dinâmica/ranking, rolling validation e similaridade continuam posteriores e condicionadas a characterization e ganho real de ownership.