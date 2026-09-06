# Runbooks operacionais

Este documento reúne respostas curtas para incidentes observáveis no Loto Lab.

Os runbooks partem dos sinais já expostos por `GET /api/v1/ops/metrics` e `GET /api/v1/operations/status`. Eles ajudam a diagnosticar e conter uma falha; **não definem SLOs, thresholds nem autorizam tuning por uma amostra isolada**.

## Regras gerais

Antes de alterar configuração:

1. confirme a release ativa e o horário do incidente;
2. consulte métricas e estado operacional autenticados;
3. diferencie falha transitória de tendência repetida;
4. preserve evidência suficiente para comparar antes/depois;
5. prefira recuperação reversível a tuning durante o incidente;
6. não aumente pool, concorrência, timeout ou retry sem baseline que justifique a mudança.

Quando o problema envolver dado financeiro ou resultado de aposta, preserve `NULL`/desconhecido; não converta ausência em zero para “normalizar” o painel.

## CAIXA indisponível ou instável

### Sinais

- `caixa.errors` ou `caixa.timeouts` crescendo;
- `caixa.errorRate`/`caixa.timeoutRate` acima do comportamento normalmente observado;
- aumento relevante de `caixa.latencyMs.p95/p99`;
- sync terminando como `partial`/`failed` ou ficando stale.

### Diagnóstico

1. confirme se o erro ocorre no boundary da CAIXA e não no PostgreSQL;
2. verifique se timeouts estão separados de outros erros;
3. consulte o último `operation_run` e os detalhes por loteria;
4. confirme se o problema é geral ou aparece apenas durante uma operação específica;
5. preserve a saída observada antes de qualquer mudança de timeout/retry.

### Ação segura

- se a operação falhou, mantenha o estado persistido como falha/partial e tente nova sincronização somente quando a dependência externa estiver respondendo;
- não fabrique concurso, agenda, rateio ou prêmio ausente;
- não altere backoff/timeout durante o incidente sem histórico suficiente para demonstrar que a política atual é a causa do problema.

### Escalar quando

- timeouts/erros persistirem entre várias janelas de observação;
- a dependência estiver saudável externamente, mas o boundary local continuar falhando;
- houver divergência entre dados persistidos e a fonte oficial.

## Analysis Jobs sem progresso

### Sinais

- jobs `queued` antigos sem execução;
- jobs `running` muito além do comportamento normal observado;
- idade da fila mais antiga crescendo;
- ausência de progresso mesmo com HTTP e PostgreSQL saudáveis.

### Diagnóstico

1. confirme a saúde do PostgreSQL e a pressão do pool;
2. verifique se existe trabalho pesado concorrente legítimo;
3. confirme que o processo ativo continua dono do runtime lock;
4. procure jobs abandonados/recuperados após restart;
5. diferencie fila ocupada de worker travado.

### Ação segura

- use os fluxos de cancelamento já existentes quando o job puder ser interrompido com segurança;
- em restart planejado, preserve graceful shutdown para liberar workers/gates e persistir lifecycle corretamente;
- não aumente concorrência de worker como resposta imediata a fila longa.

### Escalar quando

- jobs permanecem parados após recuperação normal do processo;
- cancelamento não libera o recurso esperado;
- o mesmo padrão reaparece sob carga comparável.

## Sync `partial`, `failed` ou stale

### Sinais

- `sync.status` em `partial`, `failed` ou `abandoned`;
- `sync.partial = true`;
- estado operacional stale;
- `operation_run` com falha de bootstrap, rateio, notificação ou loteria específica.

### Diagnóstico

1. leia o último `operation_run` e identifique qual etapa falhou;
2. confirme se existe outra sincronização em andamento;
3. verifique CAIXA e PostgreSQL separadamente;
4. diferencie falha principal de falha secundária de notificações/revisão financeira;
5. confirme que não existe lacuna persistida escondida por uma execução parcialmente bem-sucedida.

### Ação segura

- mantenha o run como `partial`/`failed`; não reclassifique manualmente como sucesso;
- repita `ops:sync` apenas depois de remover a causa observada ou confirmar recuperação da dependência;
- aceite `409 OPERATION_ALREADY_RUNNING` como proteção contra trabalho duplicado.

### Escalar quando

- a mesma etapa falha repetidamente;
- o sync termina como sucesso, mas o estado persistido continua stale/inconsistente;
- existir risco de revisão financeira não auditada.

## Pressão ou indisponibilidade PostgreSQL

### Sinais

- `postgres.waitingRequests` crescendo;
- poucas conexões idle e muitas active durante o incidente;
- requests HTTP, jobs e sync degradando simultaneamente;
- readiness/queries falhando.

### Diagnóstico

1. compare `totalConnections`, `idleConnections`, `activeConnections` e `waitingRequests`;
2. identifique se há job/sync pesado correlacionado no mesmo período;
3. verifique logs do PostgreSQL e da aplicação;
4. quando houver suspeita de query específica, use profiling somente leitura (`npm run db:profile`) com o fluxo apropriado;
5. preserve a baseline antes de propor índice ou mudança no tamanho do pool.

### Ação segura

- priorize restaurar disponibilidade e reduzir trabalho concorrente legítimo antes de aumentar pool;
- não crie índice durante incidente sem plano real demonstrando gargalo;
- preserve shutdown e locks para evitar corrupção de lifecycle.

### Escalar quando

- waiting permanece alto em períodos comparáveis;
- há query recorrente com plano ruim comprovado;
- a indisponibilidade não é explicada por carga conhecida.

## OpenAI indisponível ou lenta

### Sinais

- `openai.errors`/`openai.timeouts` crescendo;
- aumento relevante da latência observada;
- interpretação por IA falhando enquanto cálculo determinístico continua saudável.

### Diagnóstico

1. confirme que o core calculado/análises continuam disponíveis;
2. diferencie timeout de erro não-timeout;
3. compare a latência com a baseline observada da mesma operação;
4. verifique se o uso de tokens está conhecido apenas quando todos os contadores do provider existem;
5. nunca use prompt, evidência ou resposta como label/log operacional para diagnosticar cardinalidade.

### Ação segura

- degrade a camada interpretativa sem substituir cálculo crítico por IA;
- preserve a evidência calculada para nova interpretação posterior quando o fluxo suportar isso;
- não alterar modelo, timeout, retry ou backoff durante o incidente sem dados suficientes.

### Escalar quando

- falhas persistirem com provider saudável;
- houver erro sistemático de contrato/schema;
- a indisponibilidade da IA estiver bloqueando uma superfície que deveria continuar útil sem interpretação.

## Registro pós-incidente

Para incidentes relevantes, registre no mínimo:

- release/SHA;
- período observado;
- sinais usados no diagnóstico;
- impacto real;
- ação executada;
- evidência de recuperação;
- hipótese de causa raiz;
- decisão explícita sobre follow-up.

Se o follow-up envolver tuning, abra uma fatia separada com baseline antes/depois. Não transforme o runbook em autorização permanente para mudar limites.