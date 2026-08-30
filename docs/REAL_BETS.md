# Apostas reais

Apostas reais registram **somente o que foi efetivamente apostado**, mantendo esse histórico separado de lotes gerados, comparações históricas e backtests.

Essa separação é essencial para que custo, prêmio, resultado líquido e ROI representem operação real em vez de simulação retrospectiva.

## Três conceitos diferentes

### Lote gerado

Um lote em `generated_game_batches` representa uma saída do algoritmo. Ele pode nunca ser apostado.

### Teste histórico / comparação

Um teste histórico ou comparação de lote usa resultados passados para análise. Custos, prêmios e ROI desse fluxo são métricas de experimento e **não** representam dinheiro efetivamente gasto pelo usuário.

### Aposta real

Uma aposta real é criada explicitamente a partir de um lote gerado e registra:

- lote de origem;
- loteria;
- concurso;
- jogos do lote que realmente foram apostados;
- custo efetivamente gasto;
- data/hora da aposta;
- status;
- resultado oficial após conferência;
- prêmio total, quando conhecido;
- resultado líquido, quando conhecido.

## Persistência

A persistência principal usa:

- `real_bets` — cabeçalho financeiro e lifecycle;
- `real_bet_games` — snapshot dos jogos efetivamente apostados e conferência individual;
- `real_bet_financial_revisions` — trilha de mudanças financeiras causadas por correção oficial posterior.

O snapshot dos jogos evita depender de mudanças futuras no lote de origem para auditar uma aposta já realizada.

As estruturas foram introduzidas/evoluídas por migrations dedicadas, incluindo `002_real_bets.sql` e `011_real_bet_financial_revisions.sql`.

## Status

O domínio suporta:

- `planned` — reservado para planejamento;
- `placed` — aposta registrada em contratos legados;
- `awaiting_result` — aposta real aguardando resultado/financeiro;
- `checked` — resultado estatístico oficial encontrado e persistido.

A interface atual cria a aposta diretamente como `awaiting_result`.

`checked` não implica que todo o financeiro já esteja conhecido. Uma aposta pode estar estatisticamente conferida e ainda possuir `totalPrizeValue`/`netResult` indefinidos enquanto o rateio oficial estiver incompleto.

## Guardrail anti-hindsight

Uma aposta real precisa ser registrada **antes** de o resultado oficial do concurso estar disponível no PostgreSQL.

Ao criar:

1. o lote precisa existir;
2. não pode já existir outra aposta real para o mesmo lote;
3. o concurso precisa ser definido;
4. quando o lote possui `targetContestNumber`, o concurso informado deve ser exatamente o mesmo;
5. se o resultado desse concurso já estiver armazenado, a criação é recusada com `RESULT_ALREADY_KNOWN`;
6. `playedAt`, quando informado, precisa ser uma data/hora ISO completa válida;
7. posições de jogos precisam existir no lote;
8. `actualCost` precisa ser positivo.

Comparações retrospectivas pertencem a Testes históricos/Laboratório/Meus Jogos, nunca ao KPI de apostas reais.

## Ocultar lote não remove aposta

A organização de **Meus Jogos** é independente da trilha financeira.

Ocultar um lote apenas altera `archived_at` no lote gerado. A aposta real, seus jogos, conferência e revisões permanecem persistidos e continuam disponíveis para resumo financeiro.

Detalhes em [`MY_GAMES.md`](MY_GAMES.md).

## Conferência automática

A conferência usa exclusivamente o resultado oficial armazenado em `contests`.

Há vários caminhos para reconciliação:

- operação automática/scheduler;
- sincronização manual;
- abertura/refresh do fluxo de apostas;
- `POST /api/v1/real-bets/:id/check`;
- reparo financeiro de concursos recentes.

Nenhum resultado ou prêmio é digitado manualmente.

## Resultado estatístico x financeiro

O sistema diferencia:

- **não premiou e isso é conhecido** → prêmio `0`;
- **atingiu faixa premiada, mas o rateio necessário não está armazenado** → prêmio desconhecido;
- **Mês da Sorte acertado sem tier financeiro disponível** → total desconhecido.

Por isso dado ausente não vira `R$ 0,00` e não entra artificialmente no ROI.

## Reparação de rateios

A sincronização operacional revisita os 20 concursos recentes relevantes.

Quando uma grade oficial completa é atualizada e altera uma aposta já financeiramente conferida:

- prêmio e resultado líquido são recalculados;
- `checked_at` original é preservado;
- uma revisão é registrada atomicamente em `real_bet_financial_revisions`;
- o motivo atual para correção oficial é `official-prize-refresh`;
- o histórico de revisão permanece consultável pela API.

Duas reconciliações simultâneas não devem criar revisões duplicadas do mesmo estado financeiro; a atualização usa serialização transacional da aposta.

## API

### Criar aposta real

```http
POST /api/v1/real-bets
Content-Type: application/json
```

Exemplo:

```json
{
  "batchId": 12,
  "contestNumber": 3047,
  "gamePositions": [1, 2],
  "actualCost": 12.00
}
```

`gamePositions` é opcional. Quando omitido, todos os jogos do lote são registrados.

`contestNumber` pode ser omitido somente quando o lote já possui concurso alvo.

`playedAt` também é opcional; quando enviado, precisa ser um ISO datetime válido com timezone.

### Listar e resumir

```http
GET /api/v1/real-bets/mega-sena?limit=50
```

O resumo contém:

```json
{
  "lottery": "mega-sena",
  "totalBets": 0,
  "checkedBets": 0,
  "financiallyCheckedBets": 0,
  "pendingBets": 0,
  "actualCost": 0,
  "checkedCost": 0,
  "totalPrizeValue": 0,
  "netResult": 0,
  "roi": null
}
```

`roi` é opcional/indisponível quando não existe base financeira conferida suficiente.

### Conferir uma aposta

```http
POST /api/v1/real-bets/15/check
```

Se o concurso ainda não estiver armazenado, retorna `RESULT_NOT_AVAILABLE` e a aposta permanece pendente.

### Reconciliar pendências

```http
POST /api/v1/real-bets/reconcile
Content-Type: application/json

{
  "lottery": "mega-sena"
}
```

`lottery` é opcional.

### Revisões financeiras

```http
GET /api/v1/real-bets/15/revisions
```

Retorna a trilha de correções financeiras persistidas para a aposta.

## Métricas reais

### Custo efetivamente registrado

`actualCost` soma tudo que foi marcado como gasto, inclusive apostas ainda aguardando resultado.

### Custo conferido financeiramente

`checkedCost` soma apenas apostas com resultado financeiro conhecido.

### Prêmio total

`totalPrizeValue` soma prêmios financeiramente resolvidos.

### Resultado líquido

```text
netResult = totalPrizeValue - checkedCost
```

### ROI

```text
roi = netResult / checkedCost
```

Apostas pendentes **não** entram no denominador do ROI como se fossem perda.

O Painel usa essa base financeira conferida para métricas agregadas. Ao agregar loterias, o ROI deve ser recalculado a partir de `netResult` total e `checkedCost` total; não é correto fazer média simples dos percentuais individuais.

## Fluxo recomendado

```text
gerar lote
   ↓
Meus Jogos
   ↓
Marcar como apostado antes do resultado
   ↓
selecionar jogos realmente feitos + informar custo
   ↓
aguardar resultado oficial
   ↓
sync operacional
   ↓
conferência estatística
   ↓
rateio financeiro completo
   ↓
resultado/ROI auditável
   ↓
eventual correção oficial → revisão financeira persistida
```

## Regra metodológica

Apostas reais medem desempenho operacional. Elas não alteram automaticamente pesos, núcleo, filtros ou estratégia.

Mudanças metodológicas continuam sendo avaliadas por Análises, Testes históricos e Laboratório antes de virar decisão de geração.
