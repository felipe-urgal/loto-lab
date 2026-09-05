# Produção

Este é o ponto de entrada canônico para validar, proteger, atualizar e verificar a produção do Loto Lab.

A topologia ativa usa **Docker Compose** com aplicação Node.js + PostgreSQL persistente. Migrations são aplicadas no startup da aplicação e permanecem forward-only.

Documentos especializados:

- [`DEPLOYMENT.md`](DEPLOYMENT.md): topologia, configuração, exposição de rede e detalhes de deploy;
- [`RELIABILITY.md`](RELIABILITY.md): backup, restore e hardening operacional;
- [`PRODUCTION-CONTRACT.md`](PRODUCTION-CONTRACT.md): detalhes do contrato consumido pelo Dev Dashboard;
- [`DATABASE.md`](DATABASE.md): schema, migrations e invariantes de persistência.

## Fluxo canônico

```text
npm run prod:check
-> npm run prod:config
-> npm run prod:backup
-> npm run prod:deploy
-> npm run prod:verify
-> observar status/logs
```

O backup é obrigatório antes de atualização de produção conforme o Production Contract atual.

## 1. Preflight seguro

```bash
npm run prod:check
```

Esse comando **não carrega `.env.production` real**. Ele valida:

1. `docker-compose.prod.yml` usando `.env.production.example`;
2. contrato de produção versionado;
3. formatação/higiene textual;
4. baseline de plataforma + TypeScript/lint;
5. build de produção.

Ele não sobe, reinicia ou altera a stack ativa.

## 2. Validar a configuração real

Antes do deploy:

```bash
npm run prod:config
```

Esse comando lê `.env.production` e usa `docker compose config --quiet`, evitando imprimir a configuração resolvida no terminal.

Se `.env.production` ainda não existir:

```bash
cp .env.production.example .env.production
```

Preencha secrets localmente. Nunca versione esse arquivo.

## 3. Backup

```bash
npm run prod:backup
```

`prod:backup` é a operação canônica. Não existe alias `ops:backup` paralelo.

Valide periodicamente os backups com:

```bash
npm run prod:restore-check -- <backup.dump>
```

O restore-check deve usar ambiente controlado e não substituir a base ativa.

## 4. Deploy

```bash
npm run prod:deploy
```

O comando executa diretamente:

```text
docker compose --env-file .env.production -f docker-compose.prod.yml
  up -d --build --wait --wait-timeout 120
```

Não existe `prod:up` como segundo nome para a mesma operação.

O deploy somente retorna sucesso quando os healthchecks de PostgreSQL e aplicação ficam saudáveis dentro do timeout.

Ordem de startup:

```text
PostgreSQL
-> healthcheck do banco
-> aplicação
-> migrations pendentes
-> API/readiness
-> scheduler operacional
```

### Graceful shutdown do container

A aplicação possui um deadline interno configurável por `OPS_SHUTDOWN_TIMEOUT_SECONDS`. O valor padrão é `25s` e o parser aceita no máximo `120s` para drenar HTTP, scheduler e analysis jobs antes de liberar lock e pool do PostgreSQL.

O serviço `app` em `docker-compose.prod.yml` declara `stop_grace_period: 130s`. Essa margem é proposital: o Docker precisa manter o processo vivo por **mais tempo que o maior deadline aceito pela aplicação**, evitando enviar `SIGKILL` enquanto o próprio shutdown ainda está dentro do contrato.

Não existe uma segunda variável de ambiente para esse grace period. Manter o limite do container fixo acima do máximo aceito pela aplicação evita duas configurações acopladas que poderiam divergir em produção. Se o limite máximo de `OPS_SHUTDOWN_TIMEOUT_SECONDS` mudar no código, o `production:contract:verify` falha até que a relação seja revisada explicitamente.

## 5. Verify

Depois do deploy:

```bash
npm run prod:verify
```

`prod:verify` é somente leitura e verifica `/health/ready` dentro do container da aplicação, sem depender da porta publicada no host.

Também confira:

```bash
npm run prod:status
```

Para acompanhamento:

```bash
npm run prod:logs
```

### Retenção de logs dos containers

O compose de produção usa o driver Docker `local` para `app` e `postgres`, com rotação explícita:

```text
max-size: 10m
max-file: 5
```

Isso limita o crescimento local de logs por container sem introduzir uma stack externa de logging. A política é um guardrail de disco, não um sistema de retenção histórica ou auditoria de longo prazo; eventos que precisam sobreviver ao ciclo de vida do container devem continuar persistidos nas fontes de verdade próprias do domínio (por exemplo, `operation_runs`, jobs e revisões financeiras).

`npm run production:contract:verify` valida a presença dessa política para impedir remoção acidental em mudanças futuras do compose.

## Operações adicionais

Parar a stack sem remover o volume PostgreSQL:

```bash
npm run prod:down
```

Não use `docker compose down -v` em produção salvo quando a intenção for apagar os dados persistidos.

A sincronização operacional de concursos/apostas continua separada:

```bash
npm run ops:sync
```

`ops:sync` não é alias de deploy/backup; é uma operação real de domínio e por isso permanece no namespace `ops:*`.

## Rede e autenticação

Por padrão:

```text
127.0.0.1:5200 -> app:3000
```

O PostgreSQL não publica porta no host de produção.

Para exposição fora do loopback, siga [`DEPLOYMENT.md`](DEPLOYMENT.md): autenticação, `PUBLIC_ORIGIN`, HTTPS, firewall/reverse proxy e demais guardrails continuam obrigatórios.

## Migrations e rollback

Migrations são forward-only e aplicadas no startup. Arquivos já aplicados são imutáveis por checksum.

Por isso:

- backup vem antes do deploy;
- schema incompatível não deve ser corrigido reescrevendo migration antiga;
- rollback de código não implica rollback automático de dados;
- quando schema/dados impedirem retorno simples, a recuperação é manual a partir de backup validado ou forward-fix.

## Production Contract / Dev Dashboard

O manifesto fica em:

```text
.dev-dashboard/production.json
```

Interface allowlisted:

```bash
npm run prod:status
npm run prod:check
npm run prod:backup
npm run prod:deploy
npm run prod:verify
npm run prod:restore-check -- <backup.dump>
npm run prod:logs
```

A documentação apontada pelo manifesto é este arquivo.

## Release checklist

Antes de considerar a atualização concluída:

- `prod:check` passou;
- configuração real passou por `prod:config`;
- backup foi criado;
- `prod:deploy` concluiu com healthchecks verdes;
- `prod:verify` passou;
- status/logs não mostram regressão;
- smoke funcional proporcional ao risco foi executado;
- plano de recuperação continua conhecido.
