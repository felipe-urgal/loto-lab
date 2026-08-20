# Operação automática do Loto Lab

O Milestone 15 transforma a manutenção diária da base em uma operação única e auditável.

## O que acontece em uma sincronização operacional

Para cada loteria (`mega-sena`, `lotofacil`, `dia-de-sorte`), o Loto Lab:

1. consulta o último concurso oficial da CAIXA;
2. compara a numeração oficial com o que já existe no PostgreSQL;
3. preenche concursos ausentes usando o mesmo bootstrap idempotente da carga histórica;
4. atualiza novamente o último concurso para capturar rateios publicados depois do sorteio;
5. reconcilia apostas reais pendentes daquela loteria;
6. grava o resultado da operação em `operation_runs`.

Nenhuma dezena, prêmio ou custo é inventado. A CAIXA continua sendo a fonte oficial dos concursos e rateios.

## Execução manual

```bash
npm run ops:sync
```

O comando processa as três loterias e retorna um JSON com o resultado por loteria.

## Execução automática junto da API

`npm run api:start` agora aplica migrations pendentes automaticamente e inicia o scheduler operacional por padrão.

Configuração no `.env`:

```env
OPS_AUTO_SYNC=true
OPS_INTERVAL_MINUTES=30
OPS_STALE_AFTER_MINUTES=180
```

- `OPS_AUTO_SYNC`: use `false` para desativar o scheduler;
- `OPS_INTERVAL_MINUTES`: intervalo entre 5 e 1440 minutos;
- `OPS_STALE_AFTER_MINUTES`: tempo sem uma execução recente antes do Dashboard sinalizar atenção.

O scheduler roda uma sincronização logo após o processo iniciar e depois respeita o intervalo configurado.

## Concorrência

A sincronização usa um advisory lock do PostgreSQL. Se outra execução já estiver ativa, uma segunda chamada não inicia trabalho duplicado.

Isso protege contra sobreposição entre:

- scheduler automático;
- `npm run ops:sync`;
- botão **Sincronizar agora** do Dashboard;
- chamada HTTP manual.

## API

### Estado operacional

```http
GET /api/v1/operations/status
```

Retorna:

- scheduler configurado;
- intervalo;
- limite de desatualização;
- idade da última execução;
- último `operation_run`;
- indicador `stale`.

### Sincronizar agora

```http
POST /api/v1/operations/sync
```

Executa a mesma rotina das três loterias usada pelo scheduler e pelo CLI.

Se já existir uma sincronização em andamento, retorna HTTP `409` com `OPERATION_ALREADY_RUNNING`.

## Dashboard

A barra superior do Dashboard passa a mostrar:

- estado operacional atualizado/atrasado;
- idade da última sincronização;
- frequência do scheduler;
- botão **Sincronizar agora**;
- cobertura histórica e financeira das três loterias.

## Auditoria

Cada execução é persistida em `operation_runs` com:

- status `running`, `success`, `partial` ou `failed`;
- horário de início/fim;
- resultado por loteria;
- quantidade de concursos buscados;
- falhas individuais do bootstrap;
- quantidade de apostas reais reconciliadas.
