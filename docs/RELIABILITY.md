# Reliability e hardening operacional

Este documento descreve os guardrails compartilhados pelo Loto Lab para evitar divergência entre interfaces, resultados financeiros incorretos, hindsight acidental e falhas operacionais silenciosas.

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

A UI não trata a primeira colocada como evidência de superioridade por si só. A interpretação considera status de evidência, p-value ajustado, percentil, resolução Monte Carlo e quantidade de concursos elegíveis.

## Workers e cancelamento

Backtests e Strategy Lab passam pelo mesmo runner protegido:

- `AbortSignal` para cancelamento;
- timeout obrigatório;
- término do worker após timeout/cancelamento;
- limite de heap do worker;
- gate global para impedir análises caras simultâneas.

O backtest síncrono e o Laboratório também abortam o worker quando o cliente HTTP desconecta. A fila assíncrona respeita o mesmo limite seguro de rounds; enfileirar não é uma forma de contornar os guardrails da API interativa.

## Modelo de execução: uma instância ativa por banco

O runtime mantém um PostgreSQL advisory lock dedicado durante toda a vida do processo. Uma segunda instância apontando para o mesmo banco falha no startup em vez de executar recoveries concorrentes.

Essa regra torna seguros os recoveries atuais:

- `analysis_jobs` em `running` pertencem à única instância que caiu;
- `operation_runs` em `running` podem ser marcados como abandonados somente depois que a instância anterior deixou de manter o lock.

O deployment atual é deliberadamente **single-instance por banco**. Escala horizontal futura deve substituir este contrato por ownership/lease/heartbeat antes de permitir múltiplos runtimes ativos.

## Recuperação de jobs

Após restart seguro da instância única:

- `running + cancel_requested=false` volta para `queued`;
- `running + cancel_requested=true` vira `cancelled` imediatamente.

Assim nenhum job cancelado fica preso para sempre em `queued` sem poder ser reivindicado pelo worker.

## Auditabilidade de apostas reais

`Desempenho real` aceita somente apostas registradas **antes** de o resultado oficial do concurso estar armazenado.

Se o resultado já existe na base, a API responde `RESULT_ALREADY_KNOWN`. Comparações retroativas continuam pertencendo a backtests e análises históricas; elas não podem alimentar o KPI de apostas reais.

Quando um lote possui `targetContestNumber`, a aposta real deve usar exatamente esse concurso. A regra existe no serviço/API e também na integridade do PostgreSQL.

Esse contrato impede:

- hindsight acidental;
- transformar uma geração histórica em aposta real depois do sorteio;
- reconciliar um lote preparado para um concurso contra outro resultado.

## Resultado estatístico x financeiro

Um resultado pode ser estatisticamente conhecido antes de toda a grade de rateio estar disponível.

Por isso:

- o jogo pode ficar `checked` com `totalPrizeValue` indefinido;
- `checked + totalPrizeValue IS NULL` continua elegível para reconciliação;
- quando a grade financeira completa chega, prêmio e resultado líquido são recalculados;
- prêmio zero e dado financeiro desconhecido permanecem estados diferentes.

Um concurso só entra na cobertura financeira completa quando possui todas as faixas esperadas:

- Mega-Sena: 4, 5 e 6 acertos;
- Lotofácil: 11, 12, 13, 14 e 15 acertos;
- Dia de Sorte: 4, 5, 6, 7 acertos e Mês da Sorte.

## Reparação e revisão de rateios oficiais

A sincronização operacional revisita uma janela dos últimos 20 concursos armazenados.

Dentro dessa janela são atualizados:

- concursos cuja grade financeira ainda está incompleta;
- concursos com grade completa que possuem apostas reais auditáveis associadas.

O segundo caso existe para capturar correções oficiais publicadas depois que um rateio já havia sido considerado completo, sem multiplicar requisições para concursos sem impacto no KPI real.

A persistência continua monotônica quanto à completude:

- grade incompleta existente + grade completa nova → promove para completa;
- grade completa existente + snapshot incompleto novo → preserva a completa;
- grade completa existente + grade completa nova → substitui, permitindo correções oficiais de valores.

Quando uma nova grade completa altera prêmio ou resultado líquido de uma aposta já financeiramente conferida:

- a aposta e o ROI são recalculados;
- o `checked_at` original é preservado;
- a mudança é gravada atomicamente em `real_bet_financial_revisions` com valores anterior/novo e motivo `official-prize-refresh`;
- `GET /api/v1/real-bets/:id/revisions` expõe a trilha de revisão.

Assim uma resposta transitória parcial não destrói informação já conhecida e uma correção oficial posterior não fica invisível.

## IA como camada interpretativa

A rota de IA não executa Strategy Lab no event loop HTTP.

O contexto usa o último job `strategy-lab` concluído e persistido para a loteria. A IA recebe, quando disponível:

- melhor configuração no período;
- `benchmark.status`;
- p-values ajustados superior e inferior;
- percentil contra controles aleatórios;
- suficiência de resolução Monte Carlo;
- suficiência da amostra histórica;
- rounds observados, quantidade de controles e tamanho da família comparada.

A chamada à Responses API usa Structured Outputs com JSON Schema estrito e `store: false`. O parser local continua validando defensivamente a resposta.

A regra permanece: **o algoritmo calcula; a IA interpreta**. A IA não escolhe dezenas e não transforma resultado histórico em probabilidade futura.

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

Payloads HTTP com corpo precisam usar `Content-Type: application/json`. Cada resposta recebe `X-Request-Id` para correlação com logs estruturados.

## Autenticação e exposição pública

Qualquer bind não-loopback, inclusive o `API_HOST` efetivo da imagem Docker, exige `APP_AUTH_USER` e `APP_AUTH_PASSWORD`.

Sem a exceção explícita `ALLOW_INSECURE_PUBLIC_HTTP=true`, bind não-loopback também exige `PUBLIC_ORIGIN=https://...`, porque credenciais HTTP Basic não devem trafegar em texto claro.

Falhas repetidas de autenticação recebem um guardrail local de 20 tentativas por endereço de socket a cada 5 minutos, com `429` e `Retry-After`. Um reverse proxy público ainda deve aplicar seus próprios controles de abuso.

## Migrations imutáveis

`schema_migrations` registra SHA-256 do conteúdo de cada migration.

Na primeira execução após a adoção do checksum, migrations antigas recebem o checksum atual como baseline. Depois disso, qualquer alteração retroativa de arquivo já aplicado gera `Migration drift detected` e interrompe o startup.

Mudança de schema deve sempre ser uma migration nova; migrations aplicadas são imutáveis.

O lock de migrations usa tentativa não bloqueante com espera limitada. Se outra execução mantiver a trava por mais de aproximadamente 15 segundos, o startup falha explicitamente.

## Startup e shutdown

Scheduler e fila de análises só iniciam depois que o listener HTTP está ativo. Falha de `listen()` executa cleanup de startup parcial: fecha servidor, drena jobs quando necessário, libera o runtime lock e encerra o pool.

No shutdown por `SIGINT`/`SIGTERM`:

1. fecha a aceitação de novas conexões HTTP;
2. interrompe timers e aborta análises em andamento;
3. drena servidor, scheduler e fila;
4. respeita `OPS_SHUTDOWN_TIMEOUT_SECONDS`;
5. libera o lock de instância;
6. encerra o pool PostgreSQL.

## Sincronização operacional

O sync usa advisory lock próprio para impedir duas sincronizações concorrentes. Falha ao atualizar notificações não é silenciosa e transforma uma execução que seria `success` em `partial`.

`SyncAllDetails` registra reparos financeiros, quantas apostas tiveram o financeiro finalmente resolvido e quantas apostas já conferidas tiveram ROI revisado por correção oficial.

## Logs estruturados

Eventos operacionais são emitidos como JSON, incluindo quando aplicável:

- `requestId`;
- `jobId`;
- `operationRunId`;
- loteria;
- duração;
- código e mensagem de erro.

Correções oficiais que alteram apostas reais também emitem `real_bet_financial_revision_applied` com loteria e quantidade de apostas revisadas.

## Backup e restore

O volume Docker é persistência local, não backup.

`npm run ops:backup` grava primeiro um arquivo `.partial-<pid>`. Somente depois de `pg_dump` terminar com sucesso o arquivo é publicado atomicamente no nome final `.dump`. Falhas removem o parcial, evitando que um dump truncado pareça válido.

Backups importantes devem ser copiados para armazenamento fora do host da aplicação e ter retenção periódica definida pelo ambiente de operação.

Um backup só deve ser considerado confiável depois do restore check:

```bash
npm run ops:restore-check -- backups/loto-lab-AAAA-MM-DD.dump
```

O comando restaura em banco temporário, verifica tabelas essenciais e remove o banco de teste sem alterar o principal.

## Supply chain e builds reproduzíveis

Imagens Node/PostgreSQL de produção e CI usam versão exata + digest. GitHub Actions usam commit SHA explícito. Dependabot abre atualizações semanais para npm, Actions e Docker, mantendo a atualização deliberada e revisável.

Deploys devem preferir `LOTO_LAB_IMAGE_TAG` derivado do commit/release em vez de reutilizar `latest` como identidade operacional.

## CI e proteção do `main`

O CI cobre:

- TypeScript e testes PostgreSQL;
- configuração do Compose;
- build e smoke da imagem de produção;
- autenticação HTTP Basic real na imagem;
- browser real para fluxos principais e páginas operacionais.

O repositório deve configurar `main` com proteção/ruleset para exigir PR e o check `CI / test`, bloquear force-push e remoção da branch. Esse controle é configuração administrativa do GitHub e não é substituído pelo arquivo de workflow.
