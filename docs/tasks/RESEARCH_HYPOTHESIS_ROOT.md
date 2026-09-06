# Raiz persistida de hipótese de pesquisa

Issue: #66

Status: raiz entregue via PR #231 e primeira evidência canônica entregue via PR #238.

## Objetivo

Criar uma trilha auditável de hipótese → evidência sem inventar IDs paralelos para experimento, evidência, aplicação ou interpretação.

A raiz `research_hypotheses` continua respondendo à pergunta **qual hipótese humana está sendo investigada?**. A segunda fatia associa o primeiro artefato canônico: um `backtest_run` persistido.

## Persistência da raiz

`research_hypotheses` possui:

- ID estável;
- título e descrição;
- loteria opcional;
- lifecycle `open | decided`;
- decisão auditável futura (`inconclusive | rejected | continue-testing | applied-experimentally`);
- justificativa e instante da decisão;
- timestamps.

O banco garante que uma hipótese `open` não possua decisão e que uma hipótese `decided` só exista com decisão, justificativa não vazia e `decided_at`.

## Evidência de backtest

`research_hypothesis_backtest_evidence` relaciona diretamente:

- `hypothesis_id` → FK para `research_hypotheses` com cascade quando a raiz é removida;
- `backtest_run_id` → FK para `backtest_runs` com delete restrito;
- `created_at` → instante auditável da associação;
- PK composta `(hypothesis_id, backtest_run_id)` → associação idempotente, sem duplicatas.

Não existe `evidence_id`, discriminator genérico ou cópia JSON do resultado. O backtest continua pertencendo ao seu owner canônico.

## Compatibilidade e lifecycle

Antes de persistir, `ResearchHypothesesUseCase` carrega a hipótese e o backtest canônico.

- somente hipótese `open` aceita nova evidência;
- hipótese `decided` preserva os vínculos já existentes, mas não pode receber artefatos depois da decisão;
- hipótese com loteria específica só aceita backtest da mesma loteria;
- hipótese com `lottery = null` permanece transversal e pode receber um backtest persistido de qualquer loteria;
- hipótese inexistente, hipótese já decidida, backtest inexistente e incompatibilidade de loteria têm erros distintos;
- a validação ocorre antes do insert da relação.

A migration `014` repete os invariantes críticos no PostgreSQL por trigger, evitando que SQL direto associe evidência depois da decisão ou atravesse loterias incompatíveis.

## API

A API autenticada mantém:

- `POST /api/v1/research/hypotheses`;
- `GET /api/v1/research/hypotheses`;
- `GET /api/v1/research/hypotheses/:id`.

E adiciona apenas para o primeiro tipo de evidência:

- `POST /api/v1/research/hypotheses/:id/evidence/backtests` com `{ "backtestRunId": <id> }`;
- `GET /api/v1/research/hypotheses/:id/evidence/backtests` para listar os vínculos persistidos.

A mutação de decisão **continua não exposta**. Ter um artefato associado cria proveniência, mas não autoriza automaticamente uma conclusão metodológica.

## Invariants preservados

- nenhum payload de evidência é copiado para a hipótese;
- nenhum job/preview/lote/aposta/AI insight é aceito como evidência nesta fatia;
- `decision = null` continua significando ausência de decisão;
- IA não cria, associa nem decide hipótese;
- nenhuma mudança em score, geração, anti-leakage ou cálculo estatístico;
- reenvio do mesmo vínculo não cria uma segunda evidência;
- decisão congela a entrada de novas evidências sem apagar a trilha já associada.

## Próxima fatia

Definir o contrato de decisão usando evidência já associada e exigindo justificativa auditável. A implementação deve explicitar quais condições mínimas permitem cada decisão e continuar distinguindo ausência de evidência, evidência inconclusiva e evidência desfavorável.
