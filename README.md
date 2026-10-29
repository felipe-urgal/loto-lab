# Loto Lab

Motor auditável para análise, geração, conferência e experimentação com modalidades das Loterias CAIXA.

> Algoritmo calcula; IA interpreta.

## Produto

Página única, sem login, focada em gerar combinações:

1. Escolher modalidade, modo, quantidade e dezenas por jogo.
2. Opcionalmente fixar/excluir dezenas e ajustar filtros.
3. Gerar e copiar os jogos diretamente, sem salvamento ou estimativa de custo.

Os três concursos mais recentes da modalidade ficam na mesma página, com atualização pelo botão **Sincronizar resultados**. As engines e APIs internas de análise, conferência e experimentação permanecem disponíveis ao projeto, fora da interface principal.

O catálogo de domínio cobre Mega-Sena, Lotofácil, Dia de Sorte, Quina, Lotomania, Dupla Sena, +Milionária, Timemania, Super Sete, Loteca, Loteria Federal, Instantânea e Lotogol. Lotogol permanece conhecido porém desabilitado até existir fonte operacional confirmada; cada superfície respeita as capabilities da modalidade em vez de forçar uma experiência numérica genérica.

## Stack

- Node.js 24.22.1 LTS + TypeScript
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

O CI executa os dois níveis: qualidade/build/testes e o E2E canônico do gerador.

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
- [Design do gerador](docs/design/REDESIGN_V2.md)
- [Template de tarefa](docs/TASK_TEMPLATE.md)
- [Guia de code review](docs/CODE_REVIEW.md)

Regras para agentes estão em [AGENTS.md](AGENTS.md).
