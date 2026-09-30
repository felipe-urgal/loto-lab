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
