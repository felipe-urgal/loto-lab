# Arquitetura final da análise avançada

Issue: #62

Status: **concluída com a #264/PR #265**. O hotspot `src/analysis/advanced.ts` foi decomposto em owners coesos sem alterar metodologia pública.

## Composition root

`src/analysis/advanced.ts` permanece responsável por:

- filtrar e ordenar concursos da loteria;
- montar o ranking base com `buildNumberAnalysis`;
- compor os owners especializados;
- montar heatmap recente;
- calcular a similaridade histórica usada somente por esta resposta;
- preservar schema agregado, model metadata e reexports públicos históricos.

Ele não deve voltar a absorver implementações matemáticas já extraídas.

## Owners canônicos

| Responsabilidade | Owner |
| --- | --- |
| continuidade, gaps e qualidade | `src/analysis/continuity.ts` |
| estatística/combinatória compartilhada | `src/analysis/statistics.ts` |
| estrutura e filtros metodológicos | `src/analysis/structure.ts` |
| pares/trincas e inferência associada | `src/analysis/associations.ts` |
| ciclos | `src/analysis/cycles.ts` |
| ranking, dinâmica e robustez | `src/analysis/dynamics.ts` |
| rolling validation anti-leakage | `src/analysis/validation.ts` |

## Decisão sobre similaridade

`buildSimilarity` permanece em `advanced.ts` de propósito.

Hoje ela é uma composição pequena e local do próprio payload avançado, usa `structureForContest` e continuidade apenas para comparar o concurso atual com o histórico, não possui consumidores independentes e não representa uma boundary metodológica separada.

Extrair esse bloco agora reduziria linhas, mas não responsabilidade real. Isso violaria o critério da #62 de não mover código apenas por proximidade textual/tamanho de arquivo.

Se surgir reutilização, schema próprio, cálculo independente ou necessidade clara de testes/ownership isolados, a extração deve ser uma nova issue.

## Invariants permanentes

- anti-leakage: target nunca entra no histórico usado para classificá-lo;
- gaps não são atravessados por métricas sequenciais;
- histórico censurado à esquerda não é tratado como completo;
- score, pesos, tiers, thresholds e desempates só mudam em mudança metodológica explícita;
- rolling validation mantém warmup 20, janelas 100/300/500, trecho contínuo mais recente e Bonferroni de 9 testes;
- associações continuam exploratórias e corrigidas por múltiplas comparações;
- similaridade permanece descritiva, sem semântica preditiva;
- `buildAdvancedAnalysis` continua composition root, não um novo engine monolítico.

## Proteção executável

Characterization tests preservam os contratos públicos das seams matemáticas. Ownership tests impedem que implementações extraídas retornem silenciosamente ao compositor ou criem dependências invertidas.

O gate canônico continua:

```bash
npm ci
npm run check
```

Mudança matemática exige teste de regressão/characterization e justificativa explícita; atualizar expected values apenas para facilitar refactor é finding bloqueante.

## Histórico

A decomposição foi executada incrementalmente nas issues/PRs da #62. O histórico detalhado permanece no GitHub e nos testes; documentos temporários de characterization/owner foram removidos para não manter backlog paralelo nem documentação duplicada.
