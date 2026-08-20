# Persistência PostgreSQL

Este documento descreve a camada de persistência do Loto Lab.

## Objetivo

O PostgreSQL passa a ser a base persistente do aplicativo. O JSON local continua existindo como formato de importação, exportação e desenvolvimento legado, mas novas camadas de API e frontend devem consumir os repositórios PostgreSQL.

## Configuração

A conexão usa a variável de ambiente `DATABASE_URL`.

Exemplo local:

```text
postgresql://loto_lab:loto_lab@localhost:5432/loto_lab
```

Nunca versionar credenciais reais. O repositório contém somente `.env.example`.

## Banco local

Subir o PostgreSQL:

```bash
docker compose up -d postgres
```

Definir a URL no shell:

```bash
export DATABASE_URL=postgresql://loto_lab:loto_lab@localhost:5432/loto_lab
```

Aplicar migrations:

```bash
npm run db:migrate
```

As migrations ficam em `db/migrations/` e são executadas em ordem pelo nome do arquivo.

O runner:

- cria `schema_migrations`;
- usa advisory lock para impedir duas migrações concorrentes;
- executa cada arquivo em transação;
- registra somente migrations concluídas;
- pode ser executado várias vezes com segurança.

## Migrar o JSON atual

Depois das migrations:

```bash
npm run db:import-json -- data/contests.json
```

A operação é idempotente para concursos. A chave natural é:

```text
lottery + contest_number
```

Se um concurso já enriquecido com rateio/arrecadação for atualizado por um objeto sem esses campos, a camada PostgreSQL preserva os dados financeiros existentes.

## Modelo

### `contests`

Um registro por concurso:

- loteria;
- número;
- data;
- dezenas sorteadas;
- Mês da Sorte quando aplicável;
- arrecadação.

Índice principal adicional: `(lottery, draw_date DESC)`.

### `contest_prize_tiers`

Rateio oficial de um concurso:

- descrição da faixa;
- ganhadores;
- valor individual do prêmio.

É dependente de `contests` e removido em cascata quando o concurso é removido.

### `strategies`

Versões executáveis da metodologia:

- `slug` estável;
- loteria;
- nome;
- versão da metodologia;
- configuração em `JSONB`.

Exemplo de configuração:

```json
{
  "fixedCount": 8,
  "repeatTargets": [8, 9, 10]
}
```

### `generated_game_batches`

Representa um lote de jogos gerados juntos:

- loteria;
- estratégia usada;
- concurso alvo;
- opções do gerador;
- data de geração.

### `generated_games`

Jogos individuais de um lote:

- dezenas;
- núcleo fixo;
- variáveis;
- Mês da Sorte;
- metadados estruturais.

A ordem dentro do lote é preservada por `position`.

### `backtest_runs`

Uma execução de backtest:

- estratégia;
- loteria;
- opções;
- resumo completo em `JSONB`;
- métricas principais em colunas próprias: concursos, jogos, custos, prêmios, ROI e cobertura financeira.

As colunas próprias evitam leituras caras de JSON para dashboards e rankings.

### `backtest_rounds`

Detalhamento imutável de cada concurso simulado. O payload da rodada fica em `JSONB`, ligado ao run e ao número do concurso.

## Repositórios

A camada de acesso está em `src/persistence/`:

- `PostgresContestRepository`;
- `PostgresStrategyRepository`;
- `PostgresGameRepository`;
- `PostgresBacktestRepository`.

Queries usam parâmetros (`$1`, `$2`, ...) e nunca concatenam valores vindos da aplicação.

Operações com múltiplas escritas usam uma única conexão e transação.

## Pool de conexões

`createPostgresPool()` usa `pg.Pool` com:

- limite padrão de 10 conexões;
- timeout de conexão de 5 segundos;
- idle timeout de 30 segundos;
- `application_name = loto-lab`.

O pool deve ser criado uma vez por processo na futura API, não uma vez por request.

## Testes

O CI sobe um PostgreSQL real e testa:

1. aplicação idempotente de migrations;
2. upsert e leitura de concursos/rateios;
3. preservação de enriquecimento financeiro;
4. estratégia versionada;
5. persistência de lote de jogos;
6. persistência de backtest e rodadas.

Localmente, o teste de integração PostgreSQL é ignorado quando `DATABASE_URL` não está definida.

## Próxima integração

A futura API HTTP deve depender destes repositórios. O arquivo JSON não deve virar dependência direta dos endpoints de produção.
