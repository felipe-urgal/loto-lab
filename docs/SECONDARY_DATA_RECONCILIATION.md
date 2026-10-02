# Reconciliação com fonte secundária

## Objetivo

A reconciliação compara dados canônicos persistidos pelo Loto Lab com uma fonte pública independente para detectar divergências de conteúdo, atraso ou ausência.

Ela é **somente diagnóstico**. A CAIXA continua sendo a única origem do fluxo operacional normal e PostgreSQL continua sendo a fonte de verdade do produto.

## Fonte inicial

Adapter: `MaickonSecondaryContestSource`

Repositório público observado:

- `maickon/free-apiloterias`
- branch observada: `master`
- acesso via arquivos JSON em `raw.githubusercontent.com`

Modalidades habilitadas inicialmente:

- Mega-Sena
- Lotofácil

A fonte é pública e gratuita, mas não é oficial e não possui contrato de estabilidade assumido pelo Loto Lab.

## Execução

Endpoint manual:

`GET /api/v1/data/reconciliation?lottery=mega-sena&limit=10`

Restrições:

- `limit` entre 1 e 20;
- timeout por chamada externa: 5 segundos;
- somente concursos canônicos recentes são avaliados;
- nenhuma escrita ocorre durante a reconciliação.

## Classificações

- `consistent`: data e dezenas coincidem.
- `secondary-stale`: o concurso canônico é mais recente que o último concurso conhecido pela fonte secundária.
- `contest-missing`: o concurso deveria estar dentro do alcance da fonte secundária, mas o arquivo específico não existe.
- `content-divergence`: data e/ou dezenas divergem; o resultado lista exatamente os campos diferentes.
- `source-unavailable`: a fonte externa falhou, excedeu timeout ou retornou payload inválido.

`secondary-stale` não é tratado como erro do dado canônico.

## Proveniência

Quando um concurso secundário é carregado, o resultado preserva:

- provider;
- repositório;
- ref/branch;
- URL exata;
- timestamp da leitura.

Isso permite reproduzir e auditar a comparação sem incorporar o payload externo ao domínio canônico.

## Isolamento

O adapter secundário não implementa `ContestSource` e não participa de:

- sync operacional;
- geração;
- análises;
- backtests;
- atualização de concursos no PostgreSQL.

Falha da fonte secundária afeta somente a chamada explícita de reconciliação.

## Testes

Fixtures locais em `tests/fixtures/secondary/` e fetches injetáveis mantêm os testes independentes do GitHub e da disponibilidade da fonte externa.
