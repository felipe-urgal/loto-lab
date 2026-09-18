# Desenvolvimento

## Preparação

Requisitos:

- Node.js >=24.20.0 <25
- npm
- PostgreSQL 16 para fluxos persistentes

Instalação e execução:

    npm ci
    npm run dev

## Relação com o agent-orchestrator

Quando uma mudança for coordenada pelo `agent-orchestrator`, este documento continua sendo a fonte local para preparação, desenvolvimento e validação do projeto. Ele não substitui a task canônica nem define workflow, handoff ou autorizações.

## Fluxo de alteração

1. Reproduza ou entenda o comportamento atual.
2. Identifique a fonte de verdade e o owner.
3. Para análise estatística, verifique explicitamente risco de leakage.
4. Faça a menor alteração coerente.
5. Adicione testes determinísticos e reprodutíveis.
6. Execute o gate e revise o diff.

## Validação

Gate canônico:

    npm run check

Comandos úteis:

    npm run typecheck
    npm test
    npm run coverage
    npm run test:e2e
    npm run prod:check

## Dados e metodologia

- Nunca use informação futura na construção de uma decisão histórica.
- Preserve seeds, períodos, parâmetros e proveniência necessários para replay.
- Diferencie valor zero de dado ausente.
- Não altere migrations aplicadas; use forward-fix.
- Otimizações exigem evidência mensurável.

## Política de documentação

Mantenha somente documentação viva. Planos encerrados, relatórios e decisões pontuais ficam no histórico Git, issues e PRs.
