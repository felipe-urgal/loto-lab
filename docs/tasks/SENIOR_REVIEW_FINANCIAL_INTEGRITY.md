# Senior Review · Integridade financeira

Este lote do super code review cobre invariantes de auditabilidade de apostas reais.

- `playedAt` só aceita data/hora ISO completa com timezone e calendário civil válido; datas impossíveis não podem ser normalizadas silenciosamente pelo JavaScript.
- a validação é aplicada na API e novamente no serviço para proteger callers internos.
- atualização financeira de uma aposta é serializada na própria transação PostgreSQL com `SELECT ... FOR UPDATE` antes de decidir se uma revisão oficial deve ser registrada.
- duas reconciliações simultâneas do mesmo rateio não podem criar revisões duplicadas.
- ausência de rateio financeiro continua significando dado desconhecido, nunca prêmio zero.

O fallback legado de `web/app.js` ainda possui semântica financeira duplicada e será tratado junto ao trabalho de frontend source-of-truth, para remover a divergência em vez de criar uma terceira implementação do mesmo contrato.
