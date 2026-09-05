# Raiz persistida de hipótese de pesquisa

Issue: #66

Status: primeira fatia vertical de persistência implementada.

## Objetivo

Criar a identidade ausente da jornada de pesquisa sem inventar IDs paralelos para experimento, evidência, aplicação ou interpretação.

A raiz responde apenas à pergunta: **qual hipótese humana está sendo investigada?**

## Persistência

`research_hypotheses` possui:

- ID estável;
- título e descrição;
- loteria opcional;
- lifecycle `open | decided`;
- decisão auditável futura (`inconclusive | rejected | continue-testing | applied-experimentally`);
- justificativa e instante da decisão;
- timestamps.

O banco garante que uma hipótese `open` não possua decisão e que uma hipótese `decided` só exista com decisão, justificativa não vazia e `decided_at`.

## API desta fatia

A API autenticada expõe somente:

- `POST /api/v1/research/hypotheses` — cria hipótese aberta;
- `GET /api/v1/research/hypotheses` — lista, com filtro opcional de loteria e limite;
- `GET /api/v1/research/hypotheses/:id` — lê uma hipótese.

A mutação de decisão **não é exposta ainda**. O contrato de proveniência definiu que decisão deve vir depois de evidência associada; permitir decidir uma hipótese sem essa etapa criaria uma trilha incompleta por construção.

## Invariants preservados

- não existe `experiment_id` ou `evidence_id` genérico;
- não existem FKs antecipadas para backtest/job/preview/lote/aposta/AI insight;
- nenhuma evidência é copiada como JSON dentro da hipótese;
- `decision = null` significa ausência de decisão, nunca resultado zero/negativo;
- IA não cria nem decide hipótese nesta fatia;
- nenhuma mudança em score, geração, anti-leakage ou cálculo estatístico.

## Próxima fatia

Associar **um único tipo de evidência persistida** com FK explícita — backtest run ou Strategy Lab job concluído — validando loteria/compatibilidade. Somente depois disso a API de decisão deve ser implementada.
