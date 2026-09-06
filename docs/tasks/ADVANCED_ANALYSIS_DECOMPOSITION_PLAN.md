# Plano de decomposição do hotspot de análise avançada

Issue: #62

Status: execução incremental em andamento; PR A (continuidade/qualidade) já está na `main` e PR B (estatística/combinatória) é a fatia atual.

## Contexto

`src/analysis/advanced.ts` concentra composição e várias responsabilidades estatísticas. Uma extração ampla de estrutura já foi corretamente abortada em uma rodada anterior porque reescrever o hotspot inteiro criaria risco maior que o benefício imediato.

Este documento transforma o código atual em uma sequência de seams pequenas e verificáveis. A regra é preservar byte a byte o contrato lógico de `buildAdvancedAnalysis`: um PR de decomposição não é oportunidade para mudar score, janelas, thresholds, correção estatística, copy metodológica ou schema público.

## Estado atual

- **PR A — continuidade/qualidade: concluído na `main`.** `src/analysis/continuity.ts` é o owner de `isConsecutive`, `splitContinuousSegments`, `latestContinuousSegment` e `buildDataQuality`, protegido por characterization e teste de ownership.
- **PR B — estatística/combinatória: fatia atual.** `src/analysis/statistics.ts` recebe apenas helpers matemáticos puros; `advanced.ts` mantém os exports públicos históricos durante a transição.
- PRs C–G permanecem futuros e só avançam se a extração anterior estiver estável.

## Mapa atual de responsabilidades

### 1. Estatística/combinatória compartilhada

Funções: `round`, `mean`, `quantile`, `summarize`, `percentileRank`, `combination`, `hypergeometricDistribution`, tabela/binomial exata, CDF normal e `evidenceLevel`.

Consumidores: estrutura, associações, delays/dinâmica e validação.

Risco especial: `combination`, `hypergeometricDistribution` e `exactBinomialTwoSidedP` são exports públicos e precisam continuar importáveis pelo caminho `src/analysis/advanced.ts` durante a extração.

### 2. Continuidade e qualidade histórica

Owner atual: `src/analysis/continuity.ts`.

Funções: `isConsecutive`, `splitContinuousSegments`, `latestContinuousSegment`, `buildDataQuality`.

Consumidores: estrutura de repetição, delay/streak, ciclos, similaridade e rolling validation.

Invariant: uma lacuna nunca pode ser atravessada por métrica sequencial; histórico censurado à esquerda continua distinto de histórico contínuo conhecido.

### 3. Estrutura do sorteio e filtros metodológicos

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

Funções: chaves de pares/trincas, `associationStat`, `buildAssociations` e binomial exata/correção.

Dependências: combinatória + estatística compartilhada.

Invariants: teste binomial bilateral exato, Bonferroni, número total de comparações e níveis de evidência permanecem idênticos; associação continua explicitamente exploratória.

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

### PR A — continuidade/qualidade — concluído

Extraído para `src/analysis/continuity.ts` com characterization de histórico contínuo, gaps e ownership. Não repetir esta fatia nem devolver helpers ao hotspot.

### PR B — estatística/combinatória — atual

Separar helpers puros, preservando reexports públicos a partir de `advanced.ts`. Não alterar arredondamento, algoritmo de probabilidade ou thresholds.

Caracterização obrigatória:

- combinações nos limites;
- distribuição hipergeométrica soma ~1;
- binomial bilateral nos casos já cobertos;
- mesmos outputs da análise avançada nas fixtures atuais;
- teste de ownership impede que os helpers retornem silenciosamente ao hotspot.

### PR C — estrutura

Somente depois de A+B. Mover estrutura e filtro metodológico como bloco, importando continuidade/combinatória já estabilizadas. Evita que um único PR mova helpers e todos os consumidores ao mesmo tempo.

Caracterização obrigatória por loteria, incluindo grade 5×5 da Lotofácil, repetidas e cobertura exata/histórica.

### PR D — associações

Mover pares/trincas e inferência associada para owner próprio. Preservar exatamente teste/correção/evidence levels e não aproveitar o refactor para criar nova inferência.

### PR E — dinâmica/ciclos

Separar primeiro ciclos, depois ranking/dinâmica se ainda houver ganho claro. `buildDynamics` tem fan-out alto e só deve sair quando os helpers de continuidade/estatística já estiverem estáveis.

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
| associações | pares/trincas, Bonferroni | p-value/evidência diferente |
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
- invariants de gaps/anti-leakage não conseguem ser caracterizados antes da mudança;
- surge mudança metodológica incidental — ela deve virar issue/PR próprio com justificativa científica.

## Decisão atual

Com continuidade já estabilizada na `main`, a próxima extração segura é **PR B — estatística/combinatória reutilizada**. Estrutura, associações, dinâmica, ciclos, rolling validation e similaridade permanecem fora desta fatia.