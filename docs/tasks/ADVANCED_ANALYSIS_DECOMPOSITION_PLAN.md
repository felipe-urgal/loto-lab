# Plano de decomposição do hotspot de análise avançada

Issue: #62

Status: execução incremental em andamento. Continuidade (#236), estatística/combinatória (#243), estrutura (#250) e associações (#252) possuem owners próprios; as characterizations de estrutura (#249) e associações (#251) preservam os contratos públicos antes/depois das extrações.

## Contexto

`src/analysis/advanced.ts` continua sendo a composition root da análise avançada, mas já delega responsabilidades coesas a módulos especializados.

Este plano mantém a decomposição em seams pequenas e verificáveis. Um PR estrutural não é oportunidade para mudar score, janelas, thresholds, correção estatística, copy metodológica ou schema público.

## Estado atual

- **PR A — continuidade/qualidade: concluído em #236.** `src/analysis/continuity.ts` é o owner de `isConsecutive`, `splitContinuousSegments`, `latestContinuousSegment` e `buildDataQuality`.
- **PR B — estatística/combinatória: concluído em #243.** `src/analysis/statistics.ts` é o owner dos helpers matemáticos puros, com reexports públicos históricos preservados por `advanced.ts`.
- **PR C — estrutura: concluído em #250.** `src/analysis/structure.ts` é o owner de estrutura/filtros metodológicos, protegido pela characterization de #249.
- **PR D — associações: concluído em #252.** `src/analysis/associations.ts` é o owner de pares/trincas e inferência associada, protegido pela characterization de #251 e por guard de ownership.
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

Invariant: um ciclo iniciado antes de uma lacuna não pode ser tratado como conhecido depois da lacuna.

### Similaridade histórica

Ainda em `src/analysis/advanced.ts`.

Invariant: similaridade é descritiva e não deve ganhar semântica preditiva durante refactor.

### Validação rolling anti-leakage

Ainda em `src/analysis/advanced.ts`.

Invariants: cada target usa somente prefixo anterior; warmup permanece 20; janelas permanecem 100/300/500; correção continua cobrindo 3 grupos × 3 janelas; só o trecho contínuo mais recente é elegível.

### Composition root

`buildAdvancedAnalysis` filtra/ordena a loteria, monta o ranking base e compõe os owners. O schema agregado e o disclaimer público permanecem sob responsabilidade dessa fronteira.

## Próximas seams candidatas

### PR E — ciclos/dinâmica — reavaliar antes de iniciar

Ciclos são a menor candidata dentro deste grupo; ranking/dinâmica têm fan-out maior. Não iniciar apenas porque são os próximos blocos no arquivo.

Pré-condições:

- characterization suficiente de ciclos, incluindo segmentos contínuos, gaps e estado conhecido/desconhecido;
- para dinâmica, characterization de ranks, offsets, robustez e tiers;
- ganho real de ownership sem criar abstração genérica artificial.

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
| ciclos | segmentos completos/incompletos | ciclo conhecido após gap |
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

#252 conclui a seam de associações preservando a characterization de #251. O próximo trabalho da #62 é **reavaliar ciclos/dinâmica antes de codificar**, começando pela menor fronteira que possua characterization suficiente. Rolling validation e similaridade continuam posteriores e condicionadas a ganho real de ownership.