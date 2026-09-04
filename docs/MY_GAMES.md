# Meus Jogos

A tela **Meus Jogos** é o workspace de acompanhamento dos lotes gerados, apostas efetivamente realizadas, resultados oficiais e comparações históricas.

O princípio da tela é separar claramente três coisas que não devem ser confundidas:

1. **lote gerado** — saída do gerador, que pode nunca ser apostada;
2. **aposta real** — registro explícito do que foi efetivamente jogado e gasto;
3. **comparação histórica** — leitura analítica do mesmo lote contra concursos armazenados, sem alterar o histórico financeiro real.

## Ownership atual da interface

A experiência principal tem implementação canônica em TypeScript. `web/src/features/myGames.ts` concentra state/lifecycle e orquestração; os contratos, apresentação, formulário de aposta, comparação, formatação e auditabilidade ficam decompostos em `web/src/features/myGames/`. `web/my-games-v2.js` permanece apenas como boundary compatível que importa o JavaScript emitido. A base funcional continua em `web/my-games-v2.css` e a apresentação final do Protótipo 1 em `web/my-games-workspace.css`.

O controller consome diretamente o client HTTP, o lifecycle compartilhado, escaping e toast de `web/src`, sem depender de `web/runtime.js`. A tela carrega os lotes e apostas reais em paralelo e mantém o estado de filtro, busca e lote expandido no próprio controller tipado.

Os campos financeiros opcionais são representados explicitamente como ausentes/`null`: custo, prêmio ou resultado desconhecido não são convertidos em zero para apresentação. A comparação também escapa texto derivado da API antes de inseri-lo em markup dinâmico.

**Meus Jogos não possui mais fallback funcional legado.** O `feature-loader` carrega apenas os assets canônicos da feature; se eles falharem, a tela apresenta um estado explícito e retryable em vez de reviver `real-bets.js` ou `my-games-management.js`.

A auditabilidade do concurso alvo também pertence ao owner TypeScript, em `web/src/features/myGames/auditability.ts`. Quando um lote possui `targetContestNumber`, o campo fica somente leitura, com `min`/`max` fixados no alvo, `aria-readonly` e proteção de submit contra alteração do DOM. Não há `MutationObserver` nem listeners globais para manter essa regra.

## Estados visíveis

Um lote pode aparecer como:

- **Gerado** — existe no PostgreSQL, ainda sem aposta real vinculada;
- **Apostado** — possui aposta real registrada, antes da conferência final;
- **Aguardando resultado** — o concurso alvo ainda não está disponível para reconciliação;
- **Conferido** — resultado oficial encontrado e conferência estatística persistida;
- **Oculto** — retirado da lista principal sem apagar lote, jogos, seed, metadata ou aposta real associada.

`archived_at` continua sendo o campo técnico do lifecycle. Na linguagem do produto, a ação é **Ocultar lote** / **Mostrar novamente**. Os aliases HTTP `archive`/`restore` continuam aceitos por compatibilidade.

## Filtros e busca

A primeira camada visual usa quatro filtros simples:

- **Todos** — lotes visíveis;
- **Apostados** — lotes visíveis com aposta real;
- **Gerados** — lotes visíveis sem aposta real;
- **Ocultos** — lotes retirados da lista principal.

A busca aceita número do lote e concurso. A lista usa até 200 lotes da loteria selecionada para manter os filtros coerentes sem carregar um histórico ilimitado no browser.

## Progressive disclosure

Um lote fechado mostra apenas o essencial:

- identificador;
- status;
- quantidade de jogos;
- concurso alvo;
- data de geração;
- valor apostado ou resultado líquido quando houver informação real correspondente.

Ao expandir o lote, aparecem:

- dezenas de cada jogo;
- núcleo fixo e Mês da Sorte quando aplicáveis;
- formulário para registrar aposta real;
- resultado oficial da aposta;
- comparação histórica do lote;
- ações de ocultar/mostrar.

A conferência pertence ao próprio lote expandido; não existe um resultado global solto abaixo da lista.

## Ocultar não apaga

Ocultar um lote apenas preenche `generated_game_batches.archived_at`.

A operação:

- não remove `generated_games`;
- não remove seed, estratégia ou metadata;
- não remove `real_bets` nem `real_bet_games`;
- não altera prêmio, custo, ROI ou conferência já persistidos;
- pode ser revertida por **Mostrar novamente**.

Um lote com aposta real **pode ser ocultado**. A ação é organizacional e não altera a trilha financeira.

## Registrar aposta real

A aposta só é criada por ação explícita do usuário. No formulário é possível selecionar quais jogos do lote foram efetivamente apostados e informar o custo real.

Quando o lote possui `targetContestNumber`, a aposta deve usar exatamente esse concurso. A interface fixa esse alvo e bloqueia tamper no submit; o backend continua sendo a autoridade final e também recusa divergências. O backend ainda recusa registrar como aposta real um concurso cujo resultado oficial já esteja conhecido, protegendo o KPI contra hindsight.

Detalhes em [`REAL_BETS.md`](REAL_BETS.md).

## Resultado oficial

Quando o concurso correspondente existe no banco, a aposta pode ser reconciliada e passa a exibir:

- melhor quantidade de acertos;
- custo real;
- prêmio, quando financeiramente conhecido;
- resultado líquido, quando financeiramente conhecido;
- detalhe jogo a jogo;
- Mês da Sorte quando aplicável.

`Conferido` não significa necessariamente que o financeiro está completo. Se a grade oficial de rateio ainda estiver ausente ou incompleta, prêmio e resultado permanecem `—` até nova reconciliação.

## Comparar concursos

A ação **Comparar concursos** avalia o mesmo lote contra concursos armazenados a partir de um ponto selecionado.

Essa comparação:

- é histórica e exploratória;
- não cria nem altera aposta real;
- não muda o ROI operacional;
- não altera o lote salvo;
- não deve ser confundida com teste histórico formal de estratégia.

A UI mostra quantidade de concursos, melhor resultado, melhor concurso e média do melhor jogo, com detalhe por concurso.

## API de gestão

### Consultar lotes

```http
GET /api/v1/game-batches/manage/mega-sena?scope=all&limit=200
```

`scope` aceita:

- `active`;
- `archived`;
- `all`.

### Ocultar

```http
POST /api/v1/game-batches/123/hide
```

Alias compatível:

```http
POST /api/v1/game-batches/123/archive
```

### Mostrar novamente

```http
POST /api/v1/game-batches/123/show
```

Alias compatível:

```http
POST /api/v1/game-batches/123/restore
```

## Persistência e migration

O lifecycle foi introduzido por `003_game_batch_lifecycle.sql`, que adiciona `archived_at` e índices para listas visíveis/ocultas.

Em uma instalação existente, migrations são aplicadas com:

```bash
npm run db:migrate
```

## Guardrails de UX

- ocultar deve ser reversível;
- nenhuma ação de organização pode apagar histórico financeiro;
- filtros e busca não alteram dados persistidos;
- o lote expandido deve manter conferência e comparação no contexto correto;
- o mobile deve permitir filtrar, buscar, expandir, ocultar e restaurar sem overflow horizontal;
- texto funcional respeita o piso de 16px e os estados seguem a semântica visual oficial: azul para ação/contexto, verde para sucesso/resultado positivo, âmbar para pendência e vermelho para erro/resultado negativo.
