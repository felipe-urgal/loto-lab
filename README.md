# Loto Lab

Motor auditável para análise, geração, conferência e experimentação com modalidades das Loterias CAIXA.

> Algoritmo calcula; IA interpreta.

## Produto

A navegação principal possui três destinos:

1. **Painel** — resultados recentes, jogos salvos, conferência, pendências e estado dos dados.
2. **Análises** — dezenas e indicadores descritivos compatíveis com a família da modalidade.
3. **Gerar jogos** — configurar → gerar prévia → revisar → salvar.

O catálogo de domínio cobre Mega-Sena, Lotofácil, Dia de Sorte, Quina, Lotomania, Dupla Sena, +Milionária, Timemania, Super Sete, Loteca, Loteria Federal, Instantânea e Lotogol. Lotogol permanece conhecido porém desabilitado até existir fonte operacional confirmada; cada superfície respeita as capabilities da modalidade em vez de forçar uma experiência numérica genérica.

## Stack

- Node.js 24.20.0 LTS + TypeScript
- PostgreSQL 16
- Frontend HTML/CSS/ES Modules com módulos TypeScript
- Testes nativos do Node e E2E de navegador

## Desenvolvimento

    npm ci
    npm run dev

Gate principal:

    npm run check

Gate de navegador para mudanças de UI/fluxos:

    npm run test:e2e:redesign

O CI executa os dois níveis: qualidade/build/testes e o E2E canônico do Redesign V2.

## Princípios

- Reprodutibilidade e proveniência são obrigatórias.
- Um concurso alvo nunca entra nos dados usados antes de seu resultado: preserve anti-leakage.
- Histórico não implica aumento de probabilidade futura sem evidência formal.
- IA interpreta resultados; matemática crítica permanece determinística no código.
- Ausência de dado não é equivalente a zero.
- PostgreSQL é a fonte de verdade operacional.
- Regras e capabilities de modalidade pertencem ao domínio/API; a UI deve consumi-las sem duplicar regras oficiais.

## Documentação

- [Desenvolvimento](docs/DEVELOPMENT.md)
- [Redesign V2](docs/design/REDESIGN_V2.md)
- [Template de tarefa](docs/TASK_TEMPLATE.md)
- [Guia de code review](docs/CODE_REVIEW.md)

Regras para agentes estão em [AGENTS.md](AGENTS.md).
