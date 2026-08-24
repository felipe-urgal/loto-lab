# Reliability e hardening operacional

Este documento descreve os guardrails compartilhados pelo Loto Lab para evitar divergência entre interfaces, resultados financeiros incorretos e falhas operacionais silenciosas.

## Contrato único de análises

O Laboratório interativo e a fila de `Execuções` usam o mesmo parser e o mesmo orçamento de `StrategyLabOptions`.

Experimentos suportados:

- `fixed-core`;
- `score-model`;
- `external-rules` somente para Mega-Sena.

Limites atuais:

- `gameCount`: 1–10;
- `warmupContests`: 1–500;
- `lookbackContests`: 10–500;
- `bucketSize`: 5–100;
- `randomSamples`: 10–500;
- timeout do worker: 60 segundos;
- orçamento estimado máximo: 750.000 unidades de trabalho.

`external-rules` usa 250 controles aleatórios por padrão porque a família possui nove variantes. `fixed-core` e `score-model` usam 100 por padrão.

A UI de Execuções não chama a primeira colocada de “vencedora”. Ela mostra **melhor no período** junto com o status de evidência, p-value ajustado e quantidade de controles.

## Workers

Backtests e Strategy Lab passam pelo mesmo runner protegido:

- `AbortSignal` para cancelamento;
- timeout obrigatório;
- término do worker após timeout/cancelamento;
- limite de heap do worker;
- gate global para impedir análises caras simultâneas.

A fila assíncrona também respeita o limite seguro de 500 rounds de backtest. Enfileirar não é uma forma de contornar os guardrails da API interativa.

## Recuperação de jobs

Após restart:

- `running + cancel_requested=false` volta para `queued`;
- `running + cancel_requested=true` vira `cancelled` imediatamente.

Assim nenhum job cancelado fica preso para sempre em `queued` sem poder ser reivindicado pelo worker.

## Integridade de apostas reais

Quando um lote gerado possui `targetContestNumber`, uma aposta real criada a partir desse lote deve usar o mesmo concurso.

A regra existe em dois níveis:

1. serviço/API, para devolver erro de domínio legível;
2. trigger PostgreSQL, para impedir inconsistência mesmo fora da API.

Isso evita reconciliar um jogo preparado para um concurso contra o resultado financeiro de outro.

## Cobertura financeira

Prêmio zero e dado financeiro desconhecido são estados diferentes.

- jogo que não alcança nenhuma faixa premiada conhecida: `totalPrizeValue = 0`;
- jogo que alcança faixa premiada mas o tier necessário está ausente: `totalPrizeValue` fica indefinido;
- Dia de Sorte com acerto do Mês da Sorte e tier mensal ausente também fica financeiramente indefinido.

Um concurso só entra na cobertura financeira completa quando possui todas as faixas esperadas:

- Mega-Sena: 4, 5 e 6 acertos;
- Lotofácil: 11, 12, 13, 14 e 15 acertos;
- Dia de Sorte: 4, 5, 6, 7 acertos e Mês da Sorte.

Isso impede ROI calculado sobre rateio parcial como se o valor ausente fosse zero.

## Qualidade da série histórica

O status da base separa:

- `internalMissingContestCount`: lacunas entre o primeiro e o último concurso armazenado;
- `historyBeforeFirstContestCount`: quantidade de concursos anteriores ao início da série armazenada;
- `missingContestCount`: alias compatível de `internalMissingContestCount`.

Exemplo: uma base contínua de #100 a #200 possui zero lacunas internas e 99 concursos anteriores ao início da série.

## Segurança HTTP

Toda mutação (`POST`, `PUT`, `PATCH`, `DELETE`) passa por proteção de origem no servidor principal.

O servidor bloqueia a requisição quando:

- `Sec-Fetch-Site` indica `cross-site`; ou
- o header `Origin` está presente e não corresponde ao `PUBLIC_ORIGIN`/origem configurada.

Clientes não-browser sem header `Origin` continuam suportados para automação local.

Payloads HTTP com corpo precisam usar `Content-Type: application/json`.

Cada resposta recebe `X-Request-Id`, permitindo correlacionar falhas HTTP com logs estruturados.

## Autenticação e HTTPS

HTTP Basic só deve trafegar por HTTPS fora de loopback.

No Compose de produção, se `APP_BIND` não for loopback, o runtime exige `PUBLIC_ORIGIN=https://...`.

Exceção deliberada para laboratório/rede confiável:

```env
ALLOW_INSECURE_PUBLIC_HTTP=true
```

Não use essa exceção em uma rede não confiável.

## Migrations

O lock de migrations usa tentativa não bloqueante com espera limitada.

Se outra instância mantiver a trava por mais de aproximadamente 15 segundos, o startup falha de forma explícita em vez de aguardar indefinidamente.

## Shutdown

O shutdown por `SIGINT`/`SIGTERM`:

1. fecha a aceitação de novas conexões HTTP;
2. interrompe timers e aborta análises em andamento;
3. drena servidor, scheduler e fila;
4. respeita `OPS_SHUTDOWN_TIMEOUT_SECONDS` (25s por padrão);
5. fecha conexões HTTP restantes ao exceder o deadline;
6. encerra o pool PostgreSQL.

## Sincronização operacional

Falha ao atualizar notificações não é mais silenciosa.

`SyncAllDetails` registra:

- `notificationRefresh: success | failed`;
- `notificationError`, quando aplicável.

Se concursos/agenda sincronizarem mas a atualização de notificações falhar, o run termina como `partial`.

## Logs estruturados

Eventos operacionais são emitidos como JSON, incluindo quando aplicável:

- `requestId`;
- `jobId`;
- `operationRunId`;
- loteria;
- duração;
- código e mensagem de erro.

Isso permite pesquisar um incidente por requisição, job ou sincronização sem depender apenas de texto livre.

## Backup

O volume Docker é persistência local, não backup.

Crie um dump PostgreSQL em formato custom:

```bash
npm run ops:backup
```

Ou escolha o caminho:

```bash
npm run ops:backup -- /caminho/seguro/loto-lab.dump
```

Os dumps locais em `backups/` e arquivos `*.dump` são ignorados pelo Git.

Copie backups importantes para armazenamento fora do host da aplicação.

## Teste de restore

Um backup não deve ser considerado confiável sem restore testado.

Com a stack de produção ativa:

```bash
npm run ops:restore-check -- backups/loto-lab-AAAA-MM-DD.dump
```

O comando:

1. cria um banco temporário;
2. restaura o dump com `pg_restore`;
3. verifica migrations, concursos, estratégias e apostas reais;
4. remove o banco temporário.

Ele não altera o banco principal.

## CI

Além da suíte TypeScript/PostgreSQL existente, o CI cobre:

- configuração do Compose;
- build e smoke da imagem de produção;
- autenticação HTTP Basic real na imagem;
- browser real para fluxos principais;
- smoke adicional de Laboratório, Execuções, Estratégias e IA.

O objetivo é detectar drift entre subsistemas antes do merge, especialmente quando um contrato evolui em uma tela e deixa outra para trás.
