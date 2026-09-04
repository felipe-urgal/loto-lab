# Contrato operacional de produção

O Loto Lab expõe uma interface `prod:*` padronizada para automação local e integração com o Dev Dashboard.

A receita operacional canônica está em [`PRODUCTION.md`](PRODUCTION.md). Este documento registra os detalhes do contrato consumido pelo control plane; [`DEPLOYMENT.md`](DEPLOYMENT.md) e [`RELIABILITY.md`](RELIABILITY.md) aprofundam Docker Compose, rede, backup e recovery.

O manifesto versionado fica em:

```text
.dev-dashboard/production.json
```

## Comandos canônicos

```bash
npm run prod:status
npm run prod:check
npm run prod:backup
npm run prod:deploy
npm run prod:verify
npm run prod:restore-check -- <backup.dump>
npm run prod:logs
```

| Comando | Fonte de verdade | Efeito |
| --- | --- | --- |
| `prod:status` | Docker Compose `ps` + `.env.production` | leitura do estado da stack |
| `prod:check` | `.env.production.example` + gates estáticos + build de produção | preflight sem secrets reais nem alteração da stack |
| `prod:backup` | `scripts/backupPostgres.mjs` | cria backup PostgreSQL |
| `prod:deploy` | Docker Compose `up -d --build --wait` | build/recreate da stack e espera healthchecks |
| `prod:verify` | `/health/ready` dentro do container `app` | readiness somente leitura |
| `prod:restore-check` | `scripts/verifyBackup.mjs` | restaura/valida backup em banco temporário |
| `prod:logs` | Docker Compose logs | acompanha a aplicação ativa |

Não existem aliases paralelos `prod:up`, `ops:backup` ou `ops:restore-check`. Cada operação de produção possui um único nome público.

`ops:sync` permanece porque é uma operação de domínio real — sincronização das três loterias e reconciliação de apostas — e não um alias de infraestrutura.

## Deploy bounded

`prod:deploy` executa diretamente:

```text
docker compose --env-file .env.production -f docker-compose.prod.yml
  up -d --build --wait --wait-timeout 120
```

O deploy só termina quando os healthchecks declarados para PostgreSQL/aplicação ficam saudáveis ou quando o timeout expira.

Não há `sleep` arbitrário. `prod:verify` continua separado e somente leitura.

`production:contract:verify` protege esse comportamento contra regressão e também garante que os aliases removidos não voltem a duplicar a interface pública.

## Separação entre check e operação real

Existem duas validações de Compose com papéis diferentes:

```bash
npm run prod:config
npm run prod:config:check
```

`prod:config` lê `.env.production` e serve para validar silenciosamente a configuração operacional real. Usa `docker compose config --quiet`, portanto não renderiza a configuração resolvida com secrets.

`prod:config:check` lê somente `.env.production.example`, versionado e não sensível. É o comando usado pelo `prod:check`.

O preflight canônico é:

```bash
npm run prod:check
```

Ele executa:

```text
prod:config:check
-> quality:static
-> build:prod
```

Assim check/CI validam a forma do contrato sem carregar `.env.production` real; deploy/status/verify/backup/restore usam o ambiente operacional.

## Políticas declaradas

- provider: `docker-compose`;
- branch de produção: `main`;
- backup: obrigatório antes de atualização/deploy;
- migrations: executadas no startup da aplicação e forward-only;
- rollback: recuperação manual/forward-fix quando schema/dados impedirem retorno simples de código.

## Segurança

O manifesto contém somente metadados e IDs de scripts npm. Secrets permanecem em `.env.production`, fora do Git.

`prod:check` não carrega `.env.production`.

`prod:deploy`, `prod:backup` e qualquer restore real são operações reais. O control plane deve exigir confirmação e nunca tratar o manifesto como autorização para shell arbitrário.

Para validação de PR/CI, use o gate normal `npm run check`; para preflight de release/produção, use `npm run prod:check`.
