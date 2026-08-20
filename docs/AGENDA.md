# Agenda e notificações

O Loto Lab mantém uma agenda interna baseada nos metadados oficiais retornados pela CAIXA e uma caixa de entrada persistida no PostgreSQL.

## Fonte da agenda

A sincronização operacional lê, para cada loteria:

- concurso atual;
- número do próximo concurso;
- data informada para o próximo concurso;
- prêmio estimado;
- indicador de acumulação.

Esses dados são armazenados em `lottery_agenda` e atualizados junto com `ops:sync` e com o scheduler do `api:start`.

## Notificações

A tabela `notifications` usa uma `event_key` única. Isso permite rodar a sincronização repetidamente sem criar alertas duplicados.

Tipos atuais:

- `next-contest`: próximo concurso oficial;
- `bet-awaiting`: aposta real aguardando o concurso;
- `result-available`: resultado já existe, mas a aposta ainda aguarda reconciliação;
- `bet-checked`: aposta conferida sem prêmio registrado;
- `bet-prize`: aposta conferida com prêmio;
- `operation-warning`: sincronização parcial ou com falha.

Quando o estado de um mesmo evento muda, a notificação é atualizada e volta a ficar não lida.

## API

### Agenda completa

```http
GET /api/v1/agenda
```

Somente não lidas:

```http
GET /api/v1/agenda?unread=true
```

### Marcar uma notificação como lida

```http
POST /api/v1/notifications/:id/read
```

### Marcar todas como lidas

```http
POST /api/v1/notifications/read-all
```

## Interface

Abra:

```text
http://127.0.0.1:3000/agenda
```

A tela reúne os próximos concursos das três loterias e a caixa de entrada de alertas.

## Fluxo operacional

```text
scheduler / Sincronizar agora / ops:sync
  → atualiza concursos
  → atualiza agenda oficial
  → reconcilia apostas reais
  → atualiza notificações deduplicadas
  → Agenda mostra o novo estado
```

O Milestone 16 mantém as notificações dentro do Loto Lab. Canais externos como e-mail, push ou mensageria ficam fora deste escopo.
