# Characterization de dinâmica e ranking da análise avançada

Issue: #258

Refs: #62

Status: em execução antes de qualquer extração de ownership de dinâmica/ranking.

## Objetivo

Congelar o comportamento público de `result.ranking.dynamics` em `buildAdvancedAnalysis` antes de mover `rankRows`, `rankMap`, `tierMap`, delay/streak, cenários de peso, robustez ou `buildDynamics` para outro owner.

Esta fatia é somente characterization. Nenhuma regra de score, tier, offset, tendência, janela ou robustez muda.

## Fixtures

### Histórico vazio nas três loterias

Protege:

- quantidade de itens igual ao universo da loteria;
- desempate determinístico por número quando todos os scores são iguais;
- ausência explícita de ranks anteriores, movimentos, estabilidade recente, delay e streak;
- robustez desabilitada com `scenarioCount = 0` e `rankRange` igual ao rank atual.

### Mega-Sena com movimento controlado no concurso final

A fixture usa 20 concursos com `[1,2,3,4,5,6]` e um concurso final com `[55,56,57,58,59,60]`.

Ela congela simultaneamente:

- rank atual e desempates;
- `previousRanks` nos offsets 1/5/10/20;
- movimentos e thresholds atuais de `rising`/`falling`/`stable`;
- ordenação de `movers.rising` e `movers.falling` em empates;
- tier de evidência atual separado do tier por rank usado nos cenários de robustez;
- `scenarioCount = 243`, `tierStability`, `strongShare` e `rankRange`;
- delay, percentil/histórico e streak para número recorrente, número recém-observado e número nunca observado.

Um contrato deliberadamente importante é que o número 55 termina com `tier = cold`, mas rank 7 e `weightRobustness.strongShare = 1`. Isso registra a diferença atual entre classificação por evidência do score-v2 e tiers por rank usados exclusivamente nos cenários de robustez; não deve ser “corrigido” incidentalmente durante um refactor.

### Gap explícito

A fixture com concursos `1, 2, 4, 5` protege que métricas sequenciais não atravessem a lacuna:

- um número presente no trecho contínuo final pode ter delay atual conhecido, mas streak permanece desconhecido quando ele poderia ter começado antes do gap;
- um número ausente em todo o trecho final mantém delay desconhecido;
- streak zero continua conhecido quando o último concurso não contém o número;
- histórico de delays só usa intervalos dentro de segmentos contínuos.

## Guardrails

- observar somente o boundary público de `buildAdvancedAnalysis`;
- não mover helpers nesta issue;
- não alterar expected values para preparar uma arquitetura desejada;
- não mudar `DEFAULT_WEIGHTS`, offsets 1/5/10/20, janelas 10/20 ou thresholds de tendência;
- não misturar ciclos, estrutura, associações, rolling validation ou similaridade;
- manter gaps e desconhecido distintos de zero;
- dinâmica/ranking continuam descritivos, sem semântica preditiva.

## Próxima decisão

Somente depois desta characterization ficar verde e revisada, reavaliar se `buildDynamics` e seus helpers formam uma seam coesa com ganho real de ownership. Se a extração exigir misturar scoring, rolling validation, similaridade ou alterar expected values, abortar/redividir a seam.
