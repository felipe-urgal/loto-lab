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
| `prod:status` | Docker Compose `ps` + `.env.production` | leitura do estado da stack |
| `prod:check` | `.env.production.example` + quality gate estático + build de produção | preflight sem carregar segredos reais nem alterar a stack ativa |
| `prod:backup` | `ops:backup` | cria backup PostgreSQL conforme política existente |
| `prod:deploy` | `prod:up` | build/recreate da stack e aguarda os healthchecks com timeout bounded |
| `prod:verify` | `/health/ready` dentro do container `app` | confirmação adicional de readiness sem depender da porta publicada no host |
| `prod:restore-check` | `ops:restore-check` | valida um backup em restore-check controlado |
| `prod:logs` | Docker Compose logs | acompanha a aplicação ativa |

`prod:up` usa `docker compose up -d --build --wait --wait-timeout 120`. Assim a etapa de deploy só termina quando os healthchecks já declarados para PostgreSQL e aplicação ficarem saudáveis, ou quando o Compose expirar com erro. Não há `sleep` arbitrário e o `prod:verify` continua sendo uma operação separada e somente leitura.

O quality gate estático executa `production:contract:verify`, que protege esse comportamento contra regressão: exige `--wait`, timeout explícito, os healthchecks da stack, garante que `prod:verify` não passe a subir, parar ou reiniciar serviços e impede que `prod:check` volte a depender do `.env.production` real.

## Separação entre check e operação real

Existem duas validações de Compose com papéis diferentes:

```bash
npm run prod:config
npm run prod:config:check
```

`prod:config` lê `.env.production` e serve para validar silenciosamente a configuração operacional real. Ele usa `docker compose config --quiet`, portanto não renderiza no terminal a configuração resolvida com senhas ou outras variáveis sensíveis.

`prod:config:check` lê somente `.env.production.example`, que é versionado e contém valores de exemplo não sensíveis. Esse é o comando usado por `prod:check` antes dos gates estáticos e do build de produção.

Assim, o preflight automatizado continua validando a interpolação e a estrutura de `docker-compose.prod.yml`, mas não precisa de `POSTGRES_PASSWORD`, credenciais HTTP Basic, chave OpenAI ou qualquer outro segredo da instalação real.

Essa separação é intencional: check/CI validam a forma da configuração; deploy, status, verify, backup e restore operam sobre o ambiente real.

## Políticas declaradas

- provider: `docker-compose`;
- branch de produção: `main`;
- backup: obrigatório antes de atualização de produção;
- migrations: executadas no startup da aplicação e permanecem forward-only;
- rollback: recuperação manual a partir de backup validado quando schema/dados impedirem retorno simples de código.

## Segurança

O manifesto contém somente metadados e IDs de scripts npm. Segredos permanecem em `.env.production`, que não é versionado.

`prod:check` não carrega `.env.production`: usa `.env.production.example` e valida o Compose com `--quiet`. A validação operacional `prod:config` continua disponível para o ambiente real, também em modo silencioso.

`prod:deploy`, `prod:backup` e qualquer restore são operações reais. O control plane deve exigir confirmação e nunca tratar o manifesto como autorização para shell arbitrário. Para validação de PR/CI, `prod:check` é a operação apropriada; não rode deploy/backup/restore real apenas para validar o contrato.
