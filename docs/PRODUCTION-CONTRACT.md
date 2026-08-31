# Contrato operacional de produção

O Loto Lab expõe uma interface `prod:*` padronizada para automação local e integração futura com o Dev Dashboard. O contrato não substitui [`DEPLOYMENT.md`](DEPLOYMENT.md) nem [`RELIABILITY.md`](RELIABILITY.md): Docker Compose, backup, restore-check e migrations no startup continuam sendo as fontes de verdade.

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
| `prod:status` | Docker Compose `ps` | leitura do estado da stack |
| `prod:check` | `prod:config` + quality gate estático + build de produção | preflight sem alterar a stack ativa |
| `prod:backup` | `ops:backup` | cria backup PostgreSQL conforme política existente |
| `prod:deploy` | `prod:up` | build/recreate da stack de produção |
| `prod:verify` | `/health/ready` dentro do container `app` | confirma readiness sem depender da porta publicada no host |
| `prod:restore-check` | `ops:restore-check` | valida um backup em restore-check controlado |
| `prod:logs` | Docker Compose logs | acompanha a aplicação ativa |

## Políticas declaradas

- provider: `docker-compose`;
- branch de produção: `main`;
- backup: obrigatório antes de atualização de produção;
- migrations: executadas no startup da aplicação e permanecem forward-only;
- rollback: recuperação manual a partir de backup validado quando schema/dados impedirem retorno simples de código.

## Segurança

O manifesto contém somente metadados e IDs de scripts npm. Segredos permanecem em `.env.production`, que não é versionado.

`prod:deploy`, `prod:backup` e qualquer restore são operações reais. O futuro control plane deve exigir confirmação e nunca tratar o manifesto como autorização para shell arbitrário. Para validação de PR/CI, `prod:check` é a operação apropriada; não rode deploy/backup/restore real apenas para validar o contrato.
