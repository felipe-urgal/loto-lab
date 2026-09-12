# Meus Jogos

A tela **Meus Jogos** é o workspace de acompanhamento dos lotes gerados, apostas efetivamente realizadas, resultados oficiais, proveniência experimental opcional e comparações históricas.

O princípio da tela é separar claramente três coisas que não devem ser confundidas:

1. **lote gerado** — saída do gerador, que pode nunca ser apostada;
2. **aposta real** — registro explícito do que foi efetivamente jogado e gasto;
3. **comparação histórica** — leitura analítica do mesmo lote contra concursos armazenados, sem alterar o histórico financeiro real.

## Ownership atual da interface

A experiência principal tem implementação canônica em TypeScript.

- `web/src/features/myGames.ts` é o composition root da feature: coordena API, lifecycle compartilhado, render e eventos;
- `web/src/features/myGames/state.ts` é o owner de filtro, busca, lote expandido e invalidação de requests stale;
- `web/src/features/myGames/presentation.ts` monta a apresentação dos lotes/apostas e a proveniência persistida;
- `web/src/features/myGames/betForm.ts` monta e envia o formulário de aposta real;
- `web/src/features/myGames/auditability.ts` protege o concurso alvo contra alteração no browser;
- `comparison.ts`, `formatting.ts`, `support.ts` e `types.ts` mantêm responsabilidades focadas;
- `web/my-games-v2.js` permanece somente como boundary compatível que importa o JavaScript emitido.

O estado do workspace não é transportado por query/hash/localStorage. Troca de loteria reseta filtro/busca/expansão e invalida requests anteriores por meio do owner `state.ts`.

Os campos financeiros opcionais são representados explicitamente como ausentes/`null`: custo, prêmio ou resultado desconhecido não são convertidos em zero para apresentação. A comparação também escapa texto derivado da API antes de inseri-lo em markup dinâmico.

**Meus Jogos não possui fallback funcional legado.** O feature loader carrega os assets canônicos da feature; se eles falharem, a tela apresenta estado explícito/retryable em vez de reviver implementações paralelas.

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

A busca aceita número do lote e concurso. A lista usa até 200 lotes da loteria selecionada para manter os filtros coerentes sem carregar histórico ilimitado no browser.

Filtro, query, expansão e token de request pertencem a `myGames/state.ts`; o controller não mantém uma segunda cópia desses valores.

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
- proveniência da hipótese quando a aposta estiver vinculada;
- resultado oficial da aposta;
- comparação histórica do lote;
- ações de ocultar/mostrar.

A conferência pertence ao próprio lote expandido; não existe um resultado global solto abaixo da lista.

## Ocultar não apaga

Ocultar um lote apenas preenche `generated_game_batches.archived_at`.

A operação:

- não remove `generated_games`;
- não remove seed, estratégia ou metadata;
- não remove `real_bets`, `real_bet_games` ou `research_hypothesis_id`;
- não altera prêmio, custo, ROI ou conferência já persistidos;
- pode ser revertida por **Mostrar novamente**.

Um lote com aposta real **pode ser ocultado**. A ação é organizacional e não altera a trilha financeira/proveniência.

## Registrar aposta real

A aposta só é criada por ação explícita do usuário. No formulário é possível selecionar quais jogos do lote foram efetivamente apostados, informar o custo real e, opcionalmente, informar o ID de uma hipótese de pesquisa aplicada experimentalmente.

Quando o lote possui `targetContestNumber`, a aposta deve usar exatamente esse concurso. A interface fixa esse alvo e bloqueia tamper no submit; o backend continua sendo a autoridade final e também recusa divergências. O backend ainda recusa registrar como aposta real um concurso cujo resultado oficial já esteja conhecido, protegendo o KPI contra hindsight.

`researchHypothesisId`, quando informado, é persistido na própria aposta real. O backend aceita somente hipótese existente, `decided` como `applied-experimentally` e compatível com a loteria. O campo não muda probabilidade, geração, custo ou conferência.

A UI não mantém esse ID em localStorage/hash/query. A fonte de verdade depois do POST é a `real_bet` persistida retornada pela API.

Detalhes em [`REAL_BETS.md`](REAL_BETS.md) e [`FINANCIALS.md`](FINANCIALS.md).

## Resultado oficial

Quando o concurso correspondente existe no banco, a aposta pode ser reconciliada e passa a exibir:

- melhor quantidade de acertos;
- custo real;
- prêmio, quando financeiramente conhecido;
- resultado líquido, quando financeiramente conhecido;
- hipótese de origem, quando vinculada;
- detalhe jogo a jogo;
- Mês da Sorte quando aplicável.

`Conferido` não significa necessariamente que o financeiro está completo. Se a grade oficial de rateio ainda estiver ausente ou incompleta, prêmio e resultado permanecem `—` até nova reconciliação.

O vínculo da hipótese permanece no mesmo registro durante a reconciliação e em correções oficiais posteriores.

## Comparar concursos

A ação **Comparar concursos** avalia o mesmo lote contra concursos armazenados a partir de um ponto selecionado.

Essa comparação:

- é histórica e exploratória;
- não cria nem altera aposta real;
- não muda o ROI operacional;
- não altera o lote salvo;
- não altera o vínculo de pesquisa;
- não deve ser confundida com teste histórico formal de estratégia.

A UI mostra quantidade de concursos, melhor resultado, melhor concurso e média do melhor jogo, com detalhe por concurso.

## API de gestão

### Consultar lotes

```http
GET /api/v1/game-batches/manage/mega-sena?scope=all&limit=200
```

`scope` aceita `active`, `archived` e `all`.

### Ocultar

```http
POST /api/v1/game-batches/123/hide
```

Alias compatível: `POST /api/v1/game-batches/123/archive`.

### Mostrar novamente

```http
POST /api/v1/game-batches/123/show
```

Alias compatível: `POST /api/v1/game-batches/123/restore`.

## Persistência e migrations

O lifecycle de lotes foi introduzido por `003_game_batch_lifecycle.sql`. A proveniência opcional entre hipótese e aposta real é adicionada por `015_research_real_bet_application.sql`.

Em uma instalação existente:

```bash
npm run db:migrate
```

## Guardrails de UX

- ocultar deve ser reversível;
- nenhuma ação de organização pode apagar histórico financeiro ou proveniência;
- filtros e busca não alteram dados persistidos;
- o lote expandido deve manter conferência, proveniência e comparação no contexto correto;
- nenhuma navegação transporta payload de resultado por query/hash/localStorage;
- o mobile deve permitir filtrar, buscar, expandir, ocultar e restaurar sem overflow horizontal;
- texto funcional respeita o piso de 16px e os estados seguem a semântica visual oficial: azul para ação/contexto, verde para sucesso/resultado positivo, âmbar para pendência e vermelho para erro/resultado negativo.
