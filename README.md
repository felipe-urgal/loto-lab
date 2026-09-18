# Loto Lab

Motor auditável para análise, geração, conferência, backtests e experimentação com Mega-Sena, Lotofácil e Dia de Sorte.

> Algoritmo calcula; IA interpreta.

## Stack

- Node.js 24.20.0 LTS + TypeScript
- PostgreSQL 16
- Frontend HTML/CSS/ES Modules com módulos TypeScript
- Testes nativos do Node e E2E próprios

## Desenvolvimento

    npm ci
    npm run dev

Gate principal:

    npm run check

E2E quando necessário:

    npm run test:e2e

## Princípios

- Reprodutibilidade e proveniência são obrigatórias.
- Um concurso alvo nunca entra nos dados usados antes de seu resultado: preserve anti-leakage.
- Histórico não implica aumento de probabilidade futura sem evidência formal.
- IA interpreta resultados; matemática crítica permanece determinística no código.
- Ausência de dado não é equivalente a zero.
- PostgreSQL é a fonte de verdade operacional.

## Documentação

- [Desenvolvimento](docs/DEVELOPMENT.md)
- [Template de tarefa](docs/TASK_TEMPLATE.md)
- [Guia de code review](docs/CODE_REVIEW.md)

Regras para agentes estão em [AGENTS.md](AGENTS.md).
