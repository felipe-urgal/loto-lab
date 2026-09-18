# AGENTS.md

## Objetivo

Trabalhe de forma autônoma, incremental e verificável. Prefira a menor solução completa e de menor manutenção.

## Workflow central

- O workflow, os papéis globais e as tasks operacionais canônicas ficam em `felipe-urgal/agent-workflow-browser`.
- Este repositório não mantém cópias locais dos papéis; regras específicas do Loto Lab vivem neste `AGENTS.md`.
- A task central registra estado/handoff da execução; backlog e dependências de produto continuam nas fontes vivas do projeto.
- Preserve o fluxo `Browser -> web -> src/api -> src/application -> engines/domínio -> adapters concretos`.
- Em análise, geração e backtest, preserve explicitamente anti-leakage, seed, período, estratégia, versão, inputs e outputs necessários para replay.
- Desconhecido/`NULL` não vira zero; IA interpreta evidências calculadas e não substitui cálculo crítico.
- Capacidade local de edição/teste não concede push, PR, merge, deploy, migration operacional ou release.

## Fluxo

1. Inspecione estado, dados e comportamento atuais.
2. Identifique o owner da responsabilidade.
3. Considere leakage, reprodutibilidade e regressões.
4. Preserve comportamento fora do escopo.
5. Implemente com KISS/YAGNI.
6. Valide proporcionalmente ao risco.
7. Revise o diff final.

## Engenharia

- SOLID orienta decisões, sem justificar camadas prematuras.
- Cálculo e regras determinísticas devem permanecer no código.
- Não use IA como fonte de verdade matemática.
- Não silencie ausência de dado convertendo desconhecido em zero.
- Migrations aplicadas são forward-only.
- Performance deve ser guiada por baseline e medição.

## Invariantes

- Preserve anti-leakage em análise, geração e backtests.
- Seeds, inputs e parâmetros relevantes devem permitir reprodução.
- PostgreSQL é a fonte de verdade operacional.
- Hipóteses e evidências devem manter proveniência auditável.
- IA interpreta; não substitui cálculo crítico.

## Validação

    npm run check

Quando aplicável:

    npm run test:e2e
    npm run coverage
    npm run prod:check

## Documentação

- docs/DEVELOPMENT.md
- docs/TASK_TEMPLATE.md
- docs/CODE_REVIEW.md

Histórico pertence a Git, issues e PRs. Documente somente contratos e procedimentos vivos.
