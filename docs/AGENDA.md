# Agenda e notificações

A Agenda consolida próximos concursos oficiais e notificações persistidas. Ela é alimentada pela mesma sincronização operacional que mantém concursos e apostas reais atualizados.

## Fonte da agenda

Para cada loteria, a sincronização lê da CAIXA e persiste em `lottery_agenda`, quando disponíveis:

- concurso atual;
- número/data do próximo concurso;
- prêmio estimado;
- indicador de acumulação.

A atualização acontece via scheduler, `npm run ops:sync` ou `POST /api/v1/operations/sync`.

## Notificações

`notifications.event_key` é única, permitindo atualizar o estado de um evento sem criar alertas duplicados.

Tipos atuais:

- `next-contest`;
- `bet-awaiting`;
- `result-available`;
- `bet-checked`;
- `bet-prize`;
- `operation-warning`.

Quando um evento relevante muda de estado, sua notificação pode ser atualizada e voltar a ficar não lida.

## API

```http
GET  /api/v1/agenda
GET  /api/v1/agenda?unread=true
POST /api/v1/notifications/:id/read
POST /api/v1/notifications/read-all
```

## Interface

Com a aplicação local rodando:

```text
http://127.0.0.1:5200/agenda
```

O workspace segue o Protótipo 1 e usa `agenda-workspace.css` como stylesheet específico canônico. O antigo `agenda.css` foi removido na consolidação visual (#135).

A tela reúne:

- próximos concursos das três loterias;
- estado oficial/selecionado;
- notificações lidas/não lidas;
- filtros;
- ações de leitura individual/global;
- comportamento próprio de mobile, foco e reduced-motion.

## Fluxo operacional

```text
scheduler / Sincronizar agora / ops:sync
  ↓
atualiza concursos e reparos financeiros
  ↓
atualiza agenda oficial
  ↓
reconcilia apostas reais
  ↓
atualiza notificações deduplicadas
  ↓
Agenda apresenta o novo estado
```

Notificações externas como e-mail/push/mensageria não fazem parte do baseline atual.

Veja também [`OPERATIONS.md`](OPERATIONS.md) e [`REAL_BETS.md`](REAL_BETS.md).