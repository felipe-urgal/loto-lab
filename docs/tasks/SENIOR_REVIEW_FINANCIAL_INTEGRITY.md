# Senior Review · Integridade financeira — registro histórico

> **Status do review original: concluído.** Este arquivo preserva o escopo do review sênior incorporado ao produto. O contrato atual está em [`../FINANCIALS.md`](../FINANCIALS.md), [`../REAL_BETS.md`](../REAL_BETS.md) e [`../RELIABILITY.md`](../RELIABILITY.md).

## Invariantes revisados

- `playedAt` aceita somente data/hora ISO completa válida; datas impossíveis não podem ser normalizadas silenciosamente pelo JavaScript;
- validação existe na fronteira HTTP/application e novamente no serviço quando necessário para proteger callers internos;
- uma aposta real só pode ser registrada antes de o resultado oficial do concurso estar conhecido;
- quando o lote possui concurso alvo, a aposta real deve usar exatamente esse concurso;
- atualização financeira de uma aposta é serializada na própria transação PostgreSQL antes de decidir se uma revisão oficial precisa ser registrada;
- reconciliações concorrentes do mesmo rateio não podem gerar revisões financeiras duplicadas;
- ausência de rateio continua significando **dado desconhecido**, nunca prêmio zero;
- `checked` estatístico pode existir antes de prêmio/resultado líquido financeiramente conhecidos;
- ROI de apostas reais usa `checkedCost`, não o custo total que inclui pendências;
- correções oficiais posteriores preservam o `checked_at` original e entram em `real_bet_financial_revisions`.

## Follow-up residual absorvido

O follow-up financeiro que ainda existia no fallback legado `web/real-bets.js` foi concluído em #147. Valores `totalPrizeValue`/`netResult` ausentes ou inválidos passam pelos formatters compartilhados e são exibidos como `—`, preservando **desconhecido != zero** em vez de fabricar `R$ 0,00`.

O que está consolidado:

- o Painel possui sua composição financeira canônica;
- o refinamento legado de “Desempenho real” deixou de ser injetado tardiamente no dashboard;
- Meus Jogos 2.0 possui o fluxo principal de lote/aposta/conferência;
- o fallback `web/real-bets.js` respeita a semântica financeira de dado desconhecido desde #147;
- `RealBetUseCase` e `RealBetService` permanecem donos das regras de criação/reconciliação no backend.

A #60 continua podendo evoluir ou remover esse fallback por razões de arquitetura frontend, ownership e TypeScript, mas **não há follow-up financeiro aberto deste review**.

## Guardrail permanente

Mudanças futuras em custo, prêmio, ROI ou reconciliação devem conferir pelo menos:

1. zero conhecido x dado desconhecido;
2. `actualCost` x `checkedCost`;
3. aposta pendente não vira perda;
4. target contest/anti-hindsight;
5. correção oficial/revision trail;
6. concorrência transacional;
7. agregação de ROI por totais, nunca média simples de percentuais.

Este arquivo é um registro histórico, não uma lista geral de backlog. Novas dívidas devem ser registradas na issue que realmente possui o trabalho, sem reabrir artificialmente o review concluído.
