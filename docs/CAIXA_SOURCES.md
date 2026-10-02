# Fontes CAIXA por modalidade

Verificação: 2026-09-30.

O Loto Lab trata a API `servicebus2.caixa.gov.br/portaldeloterias/api` como uma interface observada de produção, sem assumir estabilidade contratual pública.

## Endpoints observados

| Produto | Endpoint | Campos estruturais consumidos |
| --- | --- | --- |
| Mega-Sena | `/megasena` | `listaDezenas` |
| Lotofácil | `/lotofacil` | `listaDezenas` |
| Dia de Sorte | `/diadesorte` | `listaDezenas`, `nomeTimeCoracaoMesSorte` |
| Quina | `/quina` | `listaDezenas` |
| Lotomania | `/lotomania` | `listaDezenas` |
| Dupla Sena | `/duplasena` | `listaDezenas`, `listaDezenasSegundoSorteio` |
| +Milionária | `/maismilionaria` | `listaDezenas`, `trevosSorteados` |
| Timemania | `/timemania` | `listaDezenas`, `nomeTimeCoracaoMesSorte` |
| Super Sete | `/supersete` | `listaDezenas` preservando posição por coluna |
| Loteca | `/loteca` | `listaResultadoEquipeEsportiva` |
| Federal | `/federal` | `listaDezenas` como cinco bilhetes/prêmios principais |

Campos comuns consumidos quando presentes: `numero`, `dataApuracao`, `listaRateioPremio`, `valorArrecadado`, `numeroConcursoProximo`, `dataProximoConcurso`, `valorEstimadoProximoConcurso` e `acumulado`.

## Restrições

- Lotogol permanece sem endpoint habilitado até disponibilidade operacional e contrato atual serem confirmados.
- Instantânea é produto de bilhete e não é exposta como concurso numérico.
- Ausência de arrecadação, prêmio estimado, próxima data ou próximo concurso permanece ausente; não é convertida em zero.
- Falha/403 de uma modalidade deve ser tratada por chamada, sem alterar dados já persistidos de outras modalidades.
- O payload persistido é normalizado para `DrawResult`; a aplicação não guarda JSON desconhecido como contrato de domínio.

## Evidências usadas nesta verificação

- Portal Loterias CAIXA e páginas individuais das modalidades.
- Payloads observados da interface CAIXA para Loteca e Federal em 2026-09-30.
- Snapshots públicos de respostas da mesma interface para Quina, Lotomania, Dupla Sena, Timemania, Super Sete e +Milionária, usados apenas para confirmar nomes/formatos de campos antes da implementação.


## Política HTTP operacional

A fronteira HTTP é centralizada em `src/data/caixaHttpClient.ts`. Os adapters de concursos e produtos continuam responsáveis apenas por endpoint e normalização de domínio.

Política atual:

- somente requisições GET entram em retry;
- budget total padrão: 12 segundos por request lógico;
- máximo de 3 tentativas;
- backoff exponencial bounded: 150 ms, 300 ms, limitado a 1 s;
- retry para timeout, falha de rede, HTTP 408, 429 e 5xx;
- HTTP 400/401/403/404 não é repetido automaticamente;
- 404 é exposto como `CaixaNotFoundError`;
- timeout como `CaixaTimeoutError`;
- falha de transporte como `CaixaNetworkError`;
- status HTTP como `CaixaHttpError`;
- JSON ou payload semanticamente inválido como `CaixaInvalidResponseError`.

A política não usa fallback silencioso para fonte alternativa. Falha da CAIXA permanece explícita e não altera dados já persistidos de outras modalidades.

## Observabilidade

As métricas de processo distinguem:

- requests lógicos;
- tentativas;
- retries;
- sucesso direto;
- sucesso após retry;
- timeout;
- falha HTTP/transporte;
- resposta inválida;
- falhas finais.

As categorias são fixas e não incluem modalidade, URL, número de concurso ou payload, evitando cardinalidade não controlada.

## Fixtures de contrato

Payloads representativos das famílias estruturais ficam versionados em `tests/fixtures/caixa/products.json`.

Esses fixtures cobrem Dupla Sena, +Milionária, Timemania, Super Sete, Loteca e Federal e servem para detectar mudanças de normalização sem depender da disponibilidade real da CAIXA durante testes.
