# Apostas reais

O Milestone 11 adiciona acompanhamento de apostas efetivamente realizadas sem misturar esse histórico com geração de lotes ou backtests.

## Três conceitos diferentes

### Lote gerado

Um lote em `generated_game_batches` representa uma sugestão produzida pelo algoritmo. Ele pode nunca ser apostado.

### Backtest

Um backtest é uma simulação histórica controlada. Custos, prêmios e ROI de backtest não representam dinheiro efetivamente gasto pelo usuário.

### Aposta real

Uma aposta real é criada explicitamente a partir de um lote gerado e registra:

- lote de origem;
- loteria;
- concurso;
- quais jogos do lote foram realmente apostados;
- valor efetivamente gasto;
- data/hora da aposta;
- status;
- resultado oficial após a conferência;
- prêmio total;
- resultado líquido.

## Persistência

A migration `002_real_bets.sql` cria:

- `real_bets`: cabeçalho financeiro e estado da aposta;
- `real_bet_games`: snapshot dos jogos efetivamente apostados e resultado individual da conferência.

O snapshot evita depender de alterações futuras no lote de origem para auditar uma aposta já realizada.

## Status

Os status suportados são:

- `planned`: reservado para planejamento futuro;
- `placed`: aposta registrada;
- `awaiting_result`: aposta realizada cujo concurso ainda não está no banco;
- `checked`: resultado oficial encontrado e conferência persistida.

Na interface atual, marcar um lote como apostado cria diretamente `awaiting_result`. Se o resultado oficial já estiver armazenado, a aposta é conferida imediatamente e passa para `checked`.

## Conferência automática

A conferência sempre usa o resultado oficial armazenado em `contests`.

Existem três caminhos de reconciliação:

1. ao criar uma aposta para um concurso que já existe no banco;
2. ao abrir/listar as apostas reais na API/interface;
3. após `npm run db:sync -- <loteria>`, que reconcilia apostas pendentes da loteria sincronizada.

Nenhum número de resultado ou valor de prêmio é digitado manualmente.

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

`gamePositions` é opcional. Quando omitido, todos os jogos do lote são considerados apostados.

`contestNumber` também pode ser omitido quando o lote já possui um concurso-alvo.

### Listar e resumir

```http
GET /api/v1/real-bets/mega-sena?limit=50
```

Resposta:

```json
{
  "items": [],
  "summary": {
    "lottery": "mega-sena",
    "totalBets": 0,
    "checkedBets": 0,
    "pendingBets": 0,
    "actualCost": 0,
    "checkedCost": 0,
    "totalPrizeValue": 0,
    "netResult": 0
  }
}
```

### Conferir uma aposta específica

```http
POST /api/v1/real-bets/15/check
```

Se o concurso ainda não estiver armazenado, a API retorna `RESULT_NOT_AVAILABLE` e mantém a aposta pendente.

### Reconciliar pendências

```http
POST /api/v1/real-bets/reconcile
Content-Type: application/json

{
  "lottery": "mega-sena"
}
```

O campo `lottery` é opcional.

## Métricas reais

O Dashboard usa somente apostas reais para o bloco **Desempenho real**.

- `actualCost`: soma de tudo que foi marcado como efetivamente gasto, inclusive apostas aguardando resultado;
- `checkedCost`: custo apenas de apostas já conferidas;
- `totalPrizeValue`: prêmios das apostas conferidas;
- `netResult`: `totalPrizeValue - checkedCost`;
- `roi`: `netResult / checkedCost`.

Apostas ainda aguardando resultado não são tratadas como perda no ROI.

## Fluxo recomendado

```text
gerar lote
   ↓
Meus jogos
   ↓
Marcar como apostado
   ↓
selecionar jogos realmente feitos + informar custo
   ↓
aguardar resultado
   ↓
db:sync
   ↓
conferência automática
   ↓
Dashboard / histórico real
```

## Regra de segurança metodológica

Apostas reais medem desempenho operacional. Elas não alteram automaticamente os pesos, o núcleo ou qualquer regra da metodologia. Mudanças de estratégia continuam sendo avaliadas primeiro por backtest e Laboratório.
