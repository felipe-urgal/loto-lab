# Senior Review · Integridade financeira — registro histórico

> **Status: concluído.** Este arquivo preserva o escopo de um review sênior já incorporado ao produto. O contrato atual está em [`../FINANCIALS.md`](../FINANCIALS.md), [`../REAL_BETS.md`](../REAL_BETS.md) e [`../RELIABILITY.md`](../RELIABILITY.md).

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

## Follow-up que existia no review

Na época deste registro, ainda havia semântica financeira duplicada no fallback antigo do frontend. Esse débito foi absorvido pelo trabalho posterior de frontend source-of-truth/redesign:

- o Painel passou a possuir sua composição financeira canônica;
- o refinamento legado de “Desempenho real” deixou de ser injetado tardiamente no dashboard;
- Meus Jogos 2.0 passou a possuir o fluxo de lote/aposta/conferência;
- `RealBetUseCase` e `RealBetService` permanecem donos das regras de criação/reconciliação no backend.

Não reintroduzir uma terceira implementação financeira no frontend.

## Guardrail permanente

Mudanças futuras em custo, prêmio, ROI ou reconciliação devem conferir pelo menos:

1. zero conhecido x dado desconhecido;
2. `actualCost` x `checkedCost`;
3. aposta pendente não vira perda;
4. target contest/anti-hindsight;
5. correção oficial/revision trail;
6. concorrência transacional;
7. agregação de ROI por totais, nunca média simples de percentuais.

Este arquivo não representa backlog aberto. Novos achados devem gerar issue/PR próprios e atualizar os documentos canônicos quando alterarem comportamento.
