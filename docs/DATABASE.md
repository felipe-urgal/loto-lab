# Persistência PostgreSQL

PostgreSQL é a fonte de verdade operacional do Loto Lab. A API e o frontend usam repositories PostgreSQL; arquivos JSON permanecem apenas como caminho legado de importação/desenvolvimento.

## Configuração local

```env
DATABASE_URL=postgresql://loto_lab:loto_lab@localhost:5434/loto_lab
```

Suba o banco:

```bash
docker compose up -d postgres
npm run db:migrate
```

O container escuta em `5432`, publicado como `5434` no host local.

## Migrations

As migrations ficam em `db/migrations/` e hoje vão de `001_initial.sql` a `012_domain_contract_alignment.sql`.

O runner:

- cria/controla `schema_migrations`;
- registra SHA-256 de cada migration aplicada;
- usa advisory lock com espera limitada;
- executa cada migration em transação;
- é idempotente;
- detecta drift se um arquivo já aplicado for modificado posteriormente.

**Migration aplicada é imutável.** Mudança de schema entra sempre em arquivo novo.

`npm run api:start` aplica migrations pendentes antes de iniciar a API.

## Evolução principal do schema

| Migration | Capacidade principal |
| --- | --- |
| `001_initial.sql` | concursos, estratégias, lotes/jogos e testes históricos |
| `002_real_bets.sql` | apostas reais e snapshot de jogos apostados |
| `003_game_batch_lifecycle.sql` | lifecycle/ocultação de lotes |
| `004_ai_insights.sql` | interpretações de IA auditáveis |
| `005_operation_runs.sql` | histórico de sincronizações operacionais |
| `006_agenda_notifications.sql` | agenda oficial e notificações |
| `007_data_integrity_hardening.sql` | constraints/integridade adicional |
| `008_reliability_async_strategies.sql` | jobs, versões de estratégia e hardening assíncrono |
| `009_generator_previews.sql` | previews auditáveis do Generator 2.0 |
| `010_reliability_hardening.sql` | reforços operacionais adicionais |
| `011_real_bet_financial_revisions.sql` | trilha de revisões financeiras oficiais |
| `012_domain_contract_alignment.sql` | alinhamento final de invariantes TS ↔ PostgreSQL |

## Entidades principais

### Concursos

`contests` armazena:

- loteria;
- número/data;
- dezenas;
- Mês da Sorte quando aplicável;
- arrecadação e metadados oficiais relevantes.

`contest_prize_tiers` armazena as faixas de premiação oficiais por concurso.

### Estratégias

`strategies` mantém identidade estável. O versionamento imutável preserva configuração/metodologia usada por execuções históricas.

A camada de domínio e o PostgreSQL impedem mutações que destruiriam a auditabilidade das versões.

### Geração

`generated_game_batches` representa um lote; `generated_games` preserva os jogos e posição dentro dele.

O lifecycle permite ocultar/restaurar sem apagar histórico. Lotes vinculados a apostas reais mantêm as restrições de integridade necessárias.

Generator 2.0 também persiste previews auditáveis para conferir seed/snapshot antes de salvar um lote.

### Testes históricos

`backtest_runs` armazena opções, resumo e métricas principais. `backtest_rounds` guarda o artefato compacto por concurso.

Estruturas grandes usadas apenas durante cálculo, como jogos gerados/checks completos, não devem ser persistidas desnecessariamente.

### Apostas reais

`real_bets` separa dinheiro efetivamente apostado de geração e backtest. `real_bet_games` preserva snapshot dos jogos apostados.

`real_bet_financial_revisions` registra correções oficiais posteriores que alterem prêmio/resultado líquido, preservando o `checked_at` original.

### Operação e agenda

- `operation_runs`: auditoria do scheduler/sync;
- `lottery_agenda`: próximo concurso/metadados oficiais;
- `notifications`: caixa de entrada deduplicada por `event_key`.

### Jobs

A fila de análises persiste trabalhos `backtest` e `strategy-lab`, incluindo estados, input/result/error e cancelamento.

O runtime single-instance usa advisory lock para tornar o recovery atual seguro.

### IA

`ai_insights` persiste:

- modelo/provedor;
- snapshot de evidências;
- interpretação estruturada;
- uso retornado pelo provedor quando disponível.

## Repositories

A camada concreta fica em `src/persistence/`:

- `PostgresContestRepository`;
- `PostgresGameRepository`;
- `PostgresBacktestRepository`;
- `PostgresStrategyRepository`;
- `PostgresRealBetRepository`;
- `PostgresAnalysisJobRepository`;
- `PostgresOperationRepository`;
- repositories de Agenda/Notificações;
- repository de AI Insights.

Application use cases novos devem depender de **portas mínimas**, não de repositories concretos, quando isso for suficiente. A composição concreta ocorre progressivamente no servidor.

## Integridade

Invariantes importantes são protegidos em profundidade:

- validação TypeScript no domínio/borda;
- constraints/triggers PostgreSQL;
- queries parametrizadas;
- transações em operações multi-write;
- locks explícitos quando concorrência pode gerar revisão/duplicidade;
- versões históricas imutáveis;
- diferença entre `NULL`/desconhecido e zero conhecido preservada.

## Pool

`createPostgresPool()` mantém um único `pg.Pool` por processo, com limites/timeouts controlados e `application_name = loto-lab`.

O pool não deve ser criado por request.

## Importação e bootstrap

Importação JSON legado:

```bash
npm run db:import-json -- data/contests.json
```

Carga histórica recomendada:

```bash
npm run db:bootstrap
npm run db:status
```

Detalhes em [`DATA_OPERATIONS.md`](DATA_OPERATIONS.md).

## Produção

No `docker-compose.prod.yml`, PostgreSQL fica somente na rede Docker:

```text
app -> postgres:5432
```

A porta do banco não é publicada no host de produção.

Backup/restore: [`DEPLOYMENT.md`](DEPLOYMENT.md) e [`RELIABILITY.md`](RELIABILITY.md).

## Testes

As suítes PostgreSQL usam database temporário isolado por arquivo de teste, migrations reais e concorrência controlada.

O baseline cobre:

- instalação limpa e idempotência de migrations;
- checksum drift;
- upgrade de schema anterior para atual;
- contracts TS ↔ PostgreSQL;
- contests/rateios;
- estratégias/versionamento;
- lotes/jogos;
- apostas reais/revisões financeiras;
- jobs/operações;
- testes históricos;
- endpoints usando os mesmos adapters concretos.

Veja [`QUALITY.md`](QUALITY.md).