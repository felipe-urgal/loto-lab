# Characterization da estrutura da análise avançada

Issue: #62

Branch: `test/62-analysis-structure-characterization`

## Objetivo

Congelar o comportamento público do bloco de estrutura antes do PR C previsto em `ADVANCED_ANALYSIS_DECOMPOSITION_PLAN.md`.

A extração futura deve ser mecânica: mover ownership sem descobrir ou redefinir regra matemática durante o refactor.

## Contratos protegidos

A characterization usa `buildAdvancedAnalysis` como boundary público e cobre as três loterias suportadas:

- estrutura atual: paridade, soma, repetição, faixa baixa/alta e maior sequência;
- grade 5×5 e moldura específicas da Lotofácil;
- baselines matemáticos de repetição, paridade, soma e faixa baixa;
- ranges metodológicos específicos por loteria;
- tamanho exato do universo combinatório;
- cobertura histórica usando somente transições realmente consecutivas;
- ausência de predecessor real preservada como `repeated = null`, nunca como zero.

## Guardrails

- nenhum score, range, threshold, p-value ou expected value foi alterado;
- nenhum helper foi movido nesta fatia;
- o teste não acessa funções internas de `advanced.ts`, evitando acoplamento à implementação que será extraída;
- gaps continuam sendo comportamento de domínio, não detalhe do arquivo atual;
- regras legítimas de Mega-Sena, Lotofácil e Dia de Sorte permanecem explícitas.

## Critério para o próximo PR

O futuro owner de estrutura só deve ser extraído se esta characterization e a suíte existente permanecerem verdes sem atualizar os valores esperados. Qualquer diferença numérica ou mudança de shape deve bloquear o refactor e ser investigada separadamente.
