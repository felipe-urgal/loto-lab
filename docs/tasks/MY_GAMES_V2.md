# Meus Jogos 2.0 — registro histórico

> **Status: concluído.** Este arquivo preserva as decisões da tarefa original. O contrato atual da feature está em [`../MY_GAMES.md`](../MY_GAMES.md) e [`../REAL_BETS.md`](../REAL_BETS.md).

## Objetivo original

Transformar **Meus Jogos** em uma tela de gestão com hierarquia progressiva: a lista principal mostra apenas o estado essencial de cada lote; jogos, conferência e ações ficam sob demanda.

## Decisões de UX implementadas

- a experiência principal não depende mais do painel intermediário legado “Organizar lotes”;
- filtros de produto: **Todos**, **Apostados**, **Gerados** e **Ocultos**;
- busca por lote/concurso no próprio workspace;
- um lote fechado ocupa uma linha/bloco compacto;
- estado, quantidade de jogos, concurso alvo e data formam a leitura principal;
- números, conferência, comparação e ações aparecem após expandir;
- a conferência oficial fica no contexto do lote expandido;
- **Ocultar** nunca apaga lote, jogos, seed, metadata ou histórico financeiro;
- lote com aposta real pode ser ocultado porque ocultação é apenas organização visual;
- **Mostrar novamente** reverte a ocultação;
- `archive`/`restore` continuam como aliases técnicos/HTTP de compatibilidade, mas o fluxo 2.0 usa `hide`/`show` e a linguagem “ocultar/mostrar”;
- controles e texto funcional respeitam o piso global de 16px na fonte;
- a apresentação final segue o Protótipo 1.

## Implementação atual

Principais owners:

- `web/my-games-v2.js` — lifecycle, filtros, busca, expansão, aposta real, resultado e comparação;
- `web/my-games-v2.css` — estrutura funcional;
- `web/my-games-workspace.css` — apresentação final do Protótipo 1;
- `web/real-bet-auditability.js` — guardrails de concurso alvo no browser;
- `src/api/gameBatchManagement.ts` — endpoints de gestão/lifecycle;
- `src/application/realBets.ts` + `src/realBets/service.ts` — regras de aposta real;
- repositories PostgreSQL — persistência dos lotes e apostas.

## Validação consolidada

O fluxo protegido pela suíte/E2E cobre a navegação da feature em desktop/mobile e os contratos de auditabilidade.

A regressão de lifecycle descoberta posteriormente — montagem inicial duplicada do módulo — também foi eliminada: a montagem inicial é disparada pelo evento oficial `loto-lab:view-rendered`, evitando substituir uma tela pronta por novo loading devido a duas montagens concorrentes.

## Não usar como backlog

Novas mudanças de Meus Jogos devem ser registradas em issue atual e atualizar [`../MY_GAMES.md`](../MY_GAMES.md) quando alterarem o contrato de produto. Este arquivo não deve voltar a acumular tarefas futuras.
