# Métricas de requisição da OpenAI

Issue: #63

Status: fatia implementada em branch para validação.

## Objetivo

Observar o boundary da OpenAI antes de definir SLO, tuning de timeout ou política de resiliência.

## Contrato

`src/observability/openAiMetrics.ts` mantém um snapshot process-local de cardinalidade fixa com:

- requests totais;
- sucessos;
- erros não-timeout;
- timeouts;
- taxas de erro e timeout;
- amostra limitada de latência com p50/p95/p99;
- soma de `input_tokens`, `output_tokens` e `total_tokens` somente quando os três campos são conhecidos na resposta.

A instrumentação acontece dentro de `OpenAiInterpretationProvider.interpret`, boundary real da chamada ao provider. Uma chamada externa é registrada exatamente uma vez como `success`, `error` ou `timeout`.

## Privacidade e desconhecido

As métricas não armazenam prompt, evidência, texto de resposta, credencial, loteria, request ID ou provider response ID.

Quando `usage` está ausente/incompleto, os agregados de tokens permanecem `null` com `samples = 0`; não existe inferência ou preenchimento artificial.

## Fora de escopo

Esta fatia não muda:

- `OPENAI_MODEL`;
- timeout de provider;
- retry/backoff;
- conteúdo do prompt/instructions;
- schema de resposta;
- rate limit;
- SLO/alerta.

Essas decisões dependem da baseline observada.
