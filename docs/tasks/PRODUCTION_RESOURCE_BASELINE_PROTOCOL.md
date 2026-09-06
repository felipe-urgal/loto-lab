# Protocolo de baseline de recursos

Issue: #65

Status: fatia implementada em branch para validação.

## Objetivo

Dar um método reproduzível para transformar `npm run prod:resources` em evidência comparável antes/depois, sem transformar uma amostra de Docker stats em limite ou SLO.

## Entrega

`docs/PRODUCTION_RESOURCE_BASELINE.md` define:

- contexto mínimo da coleta;
- classes explícitas de workload;
- necessidade de múltiplas observações preservando os dados brutos;
- condições para comparar antes/depois;
- separação de CPU/memória entre `app` e `postgres`;
- critérios para declarar a evidência inconclusiva;
- registro necessário para aceitar/rejeitar tuning.

## Guardrails

- nenhum limite de CPU/memória entra no Compose;
- concorrência, pool, timeout/retry e índices permanecem inalterados;
- `prod:resources` continua read-only e bounded;
- Web Vitals e providers externos usam seus próprios sinais, não inferência a partir de Docker stats;
- uma série não comparável não é usada como prova de ganho.

## Validação esperada

Mudança documental: `npm run check` continua sendo o gate canônico. O auto-review deve confirmar que nenhum threshold arbitrário foi introduzido e que o protocolo não descreve comandos destrutivos.

## Próximo passo

Coletar séries reais sob workloads comparáveis. Qualquer tuning posterior deve entrar em PR próprio com baseline anterior/posterior registrada.