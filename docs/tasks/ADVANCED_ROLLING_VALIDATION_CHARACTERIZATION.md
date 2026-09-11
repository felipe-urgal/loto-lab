# Characterization da rolling validation anti-leakage

Issue: #262

Refs: #62 #260

Status: em characterization antes de qualquer extração de ownership da validação rolling.

## Objetivo

Congelar o comportamento público de `result.validation` em `buildAdvancedAnalysis` antes de mover `buildRollingValidation` ou `aggregateValidation` para outro owner.

A validação rolling é a seam matemática restante de maior risco porque seu contrato central é anti-leakage: cada concurso alvo deve ser classificado usando somente o prefixo histórico anterior.

## Contratos caracterizados

### Warmup

- os primeiros 20 concursos são apenas histórico de aquecimento;
- com 20 concursos contínuos, `availableRounds = 0`;
- com 21 concursos contínuos, surge exatamente 1 round validável;
- o contrato vale para Mega-Sena, Lotofácil e Dia de Sorte.

### Prefix-only

A fixture Mega-Sena cria 20 concursos nos quais `55..60` pertencem ao tier `cold` no prefixo, mas mudariam para `balanced` se o próprio concurso alvo fosse incluído no cálculo.

O resultado público deve registrar os 6 hits do alvo em `cold`. Isso demonstra diretamente que o target não contamina sua própria classificação.

### Janelas

Com 520 concursos contínuos:

- `availableRounds = 500`;
- janela 100 reporta 100 rounds;
- janela 300 reporta 300 rounds;
- janela 500 reporta 500 rounds.

As janelas permanecem exatamente `100 / 300 / 500`.

### Gaps

A validação usa somente o trecho contínuo mais recente. Uma base `1..30` com ausência do concurso `5` deve produzir o mesmo `result.validation` que analisar isoladamente o sufixo contínuo `6..30`.

Isso impede que informação anterior ao gap atravesse silenciosamente a fronteira sequencial.

### Metadata metodológica

Permanecem públicos e caracterizados:

- `warmupContests = 20`;
- `leakageProtection = true`;
- `requiresContinuousHistory = true`;
- `correction = bonferroni-9-tests`;
- nota explícita de que cada concurso usa apenas concursos anteriores.

## Guardrails

- characterization apenas; nenhum runtime é movido nesta issue;
- nenhum score, tier, threshold, janela, correção ou evidence level muda;
- não alterar expected values para facilitar um refactor posterior;
- não misturar similaridade ou outras seams;
- qualquer regressão de prefix-only é finding bloqueante.

## Próxima decisão

Somente depois da #262 ficar verde e revisada, reavaliar se `aggregateValidation` + `buildRollingValidation` formam owner coeso sem ciclo de imports e sem mudar o schema público.

Se a extração exigir alterar qualquer expected value desta characterization, abortar e investigar a diferença antes de seguir.
