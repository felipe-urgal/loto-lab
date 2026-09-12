# Persistência PostgreSQL

PostgreSQL é a fonte de verdade operacional do Loto Lab. A API e o frontend usam repositories PostgreSQL; arquivos JSON permanecem apenas como dataset offline/legado para importação, desenvolvimento e ferramentas específicas.

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

O fluxo canônico de desenvolvimento está em [`DEVELOPMENT.md`](DEVELOPMENT.md).

## Migrations

As migrations ficam em `db/migrations/` e hoje vão de `001_initial.sql` a `015_research_real_bet_application.sql`.

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
| `012_domain_contract_alignment.sql` | alinhamento de invariantes TS ↔ PostgreSQL |
| `013_research_hypotheses.sql` | raiz persistida de hipótese de pesquisa e lifecycle de decisão |
| `014_research_backtest_evidence.sql` | vínculo auditável entre hipótese e `backtest_run`, com invariantes de lifecycle/loteria |
| `015_research_real_bet_application.sql` | vínculo opcional da aplicação/aposta real à hipótese decidida experimentalmente |

## Entidades principais

### Concursos

`contests` armazena loteria, número/data, dezenas, Mês da Sorte quando aplicável, arrecadação e metadados oficiais relevantes. `contest_prize_tiers` armazena as faixas de premiação oficiais por concurso.

### Estratégias

`strategies` mantém identidade estável. O versionamento imutável preserva configuração/metodologia usada por execuções históricas.

### Geração

`generated_game_batches` representa um lote; `generated_games` preserva os jogos e posição dentro dele. O lifecycle permite ocultar/restaurar sem apagar histórico. Generator 2.0 também persiste previews auditáveis para conferir seed/snapshot antes de salvar um lote.

### Testes históricos

`backtest_runs` armazena opções, resumo e métricas principais. `backtest_rounds` guarda o artefato compacto por concurso. Estruturas grandes usadas apenas durante cálculo não devem ser persistidas desnecessariamente.

### Pesquisa e proveniência

`research_hypotheses` é a raiz persistida da hipótese humana investigada. Ela possui ID estável, título/descrição, loteria opcional, lifecycle `open | decided` e campos de decisão protegidos por constraints.

`research_hypothesis_backtest_evidence` liga diretamente uma hipótese a um `backtest_run` canônico:

- PK composta evita vínculo duplicado;
- FKs preservam os owners originais;
- não existe `evidence_id` genérico nem cópia JSON do resultado;
- hipótese decidida preserva vínculos antigos, mas não recebe evidência nova;
- hipótese específica de uma loteria só aceita backtest da mesma loteria;
- a migration `014` repete no PostgreSQL os invariantes críticos usados pelo application use case.

A decisão humana/auditável é persistida na própria hipótese. O application use case exige evidência de backtest previamente ligada, justificativa humana e transição atômica de `open` para `decided`.

A migration `015` completa a cadeia com `real_bets.research_hypothesis_id BIGINT NULL REFERENCES research_hypotheses(id) ON DELETE RESTRICT`. O campo é opcional para preservar apostas normais e histórico existente. Quando usado, o service exige que a hipótese:

- exista;
- esteja `decided`;
- tenha decisão `applied-experimentally`;
- seja transversal ou compatível com a loteria do lote/aposta.

O PostgreSQL preserva a identidade referenciada; o application service preserva o lifecycle e a compatibilidade sem criar tabela intermediária de aplicação.

### Apostas reais

`real_bets` separa dinheiro efetivamente apostado de geração e backtest. `real_bet_games` preserva snapshot dos jogos apostados. `real_bet_financial_revisions` registra correções oficiais posteriores sem apagar o histórico anterior.

Quando `research_hypothesis_id` está presente, a própria `real_bet` é a aplicação experimental canônica. A reconciliação para `checked` atualiza prêmio/resultado no mesmo registro e mantém o FK; portanto a cadeia hipótese → evidência → decisão → aplicação → resultado pode ser percorrida sem copiar financeiro para a hipótese.

Nenhum índice foi adicionado em `research_hypothesis_id` apenas por antecipação. Se profiling real mostrar necessidade, a otimização deve entrar em migration nova com baseline antes/depois.

### Operação e agenda

- `operation_runs`: auditoria do scheduler/sync;
- `lottery_agenda`: próximo concurso/metadados oficiais;
- `notifications`: caixa de entrada deduplicada por `event_key`.

### Jobs

A fila de análises persiste trabalhos `backtest` e `strategy-lab`, incluindo estados, input/result/error e cancelamento. O runtime single-instance usa advisory lock para tornar o recovery atual seguro.

### IA

`ai_insights` persiste modelo/provedor quando disponível, snapshot de evidências, interpretação estruturada e uso retornado pelo provider quando conhecido.

## Repositories

A camada concreta fica em `src/persistence/` e inclui repositories para concursos, lotes/jogos, backtests, estratégias, apostas reais, Analysis Jobs, operações, Agenda/notificações, AI Insights e hipóteses de pesquisa (`researchHypothesisRepository.ts`).

`PostgresRealBetRepository` é reutilizado tanto pelo fluxo financeiro quanto pela leitura reversa de aplicações de pesquisa; isso evita um owner paralelo para o mesmo fato.

Application use cases dependem de portas mínimas sempre que isso for suficiente. A composição concreta das features HTTP acontece em `src/api/server.ts`.

## Integridade

Invariantes importantes são protegidos em profundidade:

- validação TypeScript no domínio/borda;
- constraints/triggers PostgreSQL;
- queries parametrizadas;
- transações em operações multi-write;
- locks explícitos quando concorrência pode gerar revisão/duplicidade;
- versões históricas imutáveis;
- diferença entre `NULL`/desconhecido e zero conhecido preservada;
- relações explícitas de proveniência em vez de payloads opacos quando existe owner canônico.

## Pool

`createPostgresPool()` mantém um único `pg.Pool` por processo, com limites/timeouts controlados e `application_name = loto-lab`. O pool não deve ser criado por request.

O endpoint operacional autenticado expõe snapshot de pressão do pool (`total`, `idle`, `active`, `waiting`) para observação antes de qualquer tuning.

## Dataset offline e importação

Os comandos que escrevem no JSON offline usam o namespace `dataset:*`:

```bash
npm run dataset:sync -- mega-sena
npm run dataset:refresh -- mega-sena 1 100
```

Por padrão eles operam sobre `data/contests.json`.

Importar esse dataset para PostgreSQL:

```bash
npm run db:import-dataset -- data/contests.json
```

## Bootstrap e sync PostgreSQL

Carga histórica recomendada:

```bash
npm run db:bootstrap
npm run db:status
```

Sincronização direta do banco:

```bash
npm run db:sync -- mega-sena
```

Sincronização operacional das três loterias + reconciliação de apostas:

```bash
npm run ops:sync
```

Detalhes em [`DATA_OPERATIONS.md`](DATA_OPERATIONS.md).

## Produção

No `docker-compose.prod.yml`, PostgreSQL fica somente na rede Docker:

```text
app -> postgres:5432
```

A porta do banco não é publicada no host de produção.

Procedimento operacional: [`PRODUCTION.md`](PRODUCTION.md). Detalhes de topologia/restore: [`DEPLOYMENT.md`](DEPLOYMENT.md) e [`RELIABILITY.md`](RELIABILITY.md).

## Testes

As suítes PostgreSQL usam database temporário isolado por arquivo de teste, migrations reais e concorrência controlada.

O baseline cobre instalação limpa/idempotência, checksum drift, upgrade de schema, contratos TS ↔ PostgreSQL, concursos/rateios, estratégias/versionamento, lotes/jogos, apostas reais/revisões, jobs/operações, backtests e a trilha completa pesquisa hipótese → evidência → decisão → aplicação/aposta real → resultado.

Veja [`QUALITY.md`](QUALITY.md).
