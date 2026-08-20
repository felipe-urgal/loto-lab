# Meus jogos

A tela **Meus jogos** separa organização de lotes gerados do acompanhamento de apostas reais.

## Estados

- **Ativo**: lote gerado e disponível para conferência ou para ser marcado como apostado.
- **Apostado**: lote com registro em `real_bets`. Ele continua ativo e não pode ser arquivado.
- **Arquivado**: lote gerado que foi retirado da lista principal sem apagar histórico.

Arquivar é reversível. Nenhum jogo, seed ou metadata é removido do PostgreSQL.

## Proteção de apostas reais

A API e o repositório recusam arquivamento quando existe uma aposta real vinculada ao lote. A regra não depende do frontend.

## Organização visual

Na tela é possível:

- filtrar Ativos, Apostados, Só gerados e Arquivados;
- pesquisar por número do lote ou concurso-alvo;
- expandir e recolher os jogos de cada lote;
- arquivar um lote não apostado;
- restaurar um lote arquivado;
- arquivar duplicados antigos em lote.

A lista principal continua mostrando somente os lotes recentes para manter a tela rápida. A camada de gestão consulta até 200 lotes para contagens, arquivados e detecção de duplicados.

## Arquivar duplicados

A assinatura de duplicidade considera:

1. concurso-alvo;
2. dezenas de cada jogo;
3. Mês da Sorte quando existir.

Para cada assinatura repetida, o lote mais recente é mantido. Os anteriores entram na lista de candidatos ao arquivamento.

Lotes com aposta real nunca entram nessa lista.

## API

### Consultar gestão

```http
GET /api/v1/game-batches/manage/mega-sena?scope=all&limit=200
```

`scope` aceita `active`, `archived` ou `all`.

### Arquivar

```http
POST /api/v1/game-batches/123/archive
```

### Restaurar

```http
POST /api/v1/game-batches/123/restore
```

Se o lote estiver ligado a uma aposta real, o arquivamento retorna `409 BATCH_HAS_REAL_BET`.

## Migration

Após atualizar uma instalação existente:

```bash
npm run db:migrate
```

A migration `003_game_batch_lifecycle.sql` adiciona `archived_at` e índices parciais para listas ativas e arquivadas.
