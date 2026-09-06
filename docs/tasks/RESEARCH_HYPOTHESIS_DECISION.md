# Decisão auditável de hipótese

Issue: #66

Status: concluída na `main` via #246 em 2026-09-06.

## Objetivo

Completar a fatia C do contrato de proveniência sem criar novo owner de evidência ou migration especulativa.

A decisão pertence a `research_hypotheses`, que já possui no schema os campos `status`, `decision`, `decision_reason` e `decided_at`.

## Contrato entregue

Endpoint:

```text
POST /api/v1/research/hypotheses/:id/decision
```

Body:

```json
{
  "decision": "inconclusive | rejected | continue-testing | applied-experimentally",
  "reason": "justificativa humana auditável"
}
```

Regras:

- a hipótese precisa existir e estar `open`;
- precisa existir pelo menos uma evidência de backtest já persistida e vinculada;
- `reason` é obrigatória, normalizada e limitada a 4000 caracteres;
- a decisão é humana: nenhum ranking, p-value ou texto de IA promove estado automaticamente;
- a transição PostgreSQL usa `WHERE id = $1 AND status = 'open'`, então duas decisões concorrentes não sobrescrevem silenciosamente uma à outra;
- depois de `decided`, a hipótese não recebe nova evidência pelo use case atual;
- a evidência continua no owner `backtest_runs` + relação `research_hypothesis_backtest_evidence`; não há snapshot duplicado.

## Semântica das decisões

- `inconclusive`: existe evidência, mas ela não sustenta conclusão suficiente;
- `rejected`: a evidência analisada levou à rejeição humana da hipótese;
- `continue-testing`: a rodada atual foi encerrada com decisão explícita de continuar investigando em trabalho posterior;
- `applied-experimentally`: a hipótese foi aceita apenas para aplicação experimental auditável, não como comprovação matemática.

Esses estados não equivalem entre si e nenhum deles deve ser inferido da ausência de evidência.

## Concorrência

A checagem de `open` no use case melhora a mensagem de domínio, mas a garantia de escrita única está no update condicional do repositório. Se outro ator decidir a hipótese entre a leitura e o update, a segunda escrita retorna zero linhas e o use case responde conflito em vez de substituir a decisão vencedora.

## Erros de domínio/API

- hipótese ausente: `404 RESEARCH_HYPOTHESIS_NOT_FOUND`;
- hipótese já decidida/fechada: `409 RESEARCH_HYPOTHESIS_NOT_OPEN`;
- ausência de evidência vinculada: `409 RESEARCH_HYPOTHESIS_EVIDENCE_REQUIRED`;
- justificativa inválida: `400 RESEARCH_HYPOTHESIS_DECISION_REASON_INVALID` no domínio ou `400 INVALID_ARGUMENT` quando rejeitada no boundary HTTP;
- decisão fora do vocabulário: `400 INVALID_ARGUMENT`.

## Testes

A fatia cobre:

- decisão com evidência persistida;
- normalização da justificativa;
- rejeição sem evidência;
- rejeição de justificativa vazia;
- hipótese já fechada;
- corrida entre duas decisões;
- persistência atômica e impossibilidade de sobrescrever a primeira decisão;
- ownership arquitetural da rota, use case e SQL.

`npm run check` passou no CI do SHA final de #246 e o auto-review final foi repetido depois da correção de `docs/API.md`.

## Próximo passo

A #66 ainda pode evoluir para aplicação/resultado real usando IDs canônicos já existentes. Essa próxima vertical não deve ser misturada com esta decisão nem criar cópia de evidência.
