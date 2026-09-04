# Deploy de produção

O Loto Lab possui uma stack Docker de produção separada do ambiente local de desenvolvimento.

A sequência operacional canônica está em [`PRODUCTION.md`](PRODUCTION.md). Este documento aprofunda topologia, configuração e exposição de rede.

Arquivos principais:

- `Dockerfile` — imagem multi-stage da aplicação;
- `docker-compose.prod.yml` — aplicação + PostgreSQL persistente;
- `.env.production.example` — template de configuração;
- `docker-compose.yml` — Compose local de desenvolvimento.

## Princípios

- PostgreSQL não publica porta no host em produção;
- a aplicação roda como usuário não-root;
- o filesystem do container da aplicação é somente leitura;
- capabilities Linux são removidas da aplicação;
- healthchecks existem para aplicação e banco;
- migrations são aplicadas automaticamente no startup;
- o scheduler operacional continua sincronizando concursos e reconciliando apostas;
- toda a UI/API, exceto healthchecks, exige autenticação HTTP Basic em produção;
- endpoints caros possuem limites e rate limiting;
- secrets ficam somente em `.env.production`, nunca no Git.

## Requisitos do host

- Docker Engine;
- Docker Compose v2;
- Git para atualizar o código;
- espaço persistente suficiente para o volume PostgreSQL.

Node/npm no host são necessários apenas quando os atalhos `npm run prod:*` forem usados.

## Primeira configuração

```bash
cp .env.production.example .env.production
```

Gere secrets diferentes e longos para PostgreSQL e acesso à aplicação, por exemplo:

```bash
openssl rand -hex 32
openssl rand -hex 32
```

Preencha pelo menos:

```env
APP_AUTH_USER=loto-admin
APP_AUTH_PASSWORD=...
POSTGRES_PASSWORD=...
```

`APP_AUTH_PASSWORD` deve possuir pelo menos 12 caracteres.

Se houver domínio público:

```env
PUBLIC_ORIGIN=https://loto.exemplo.com
```

A integração OpenAI é opcional:

```env
OPENAI_API_KEY=
OPENAI_MODEL=gpt-5.6-luna
```

Sem chave/billing, apenas novas interpretações de IA ficam indisponíveis.

## Portas e exposição

A aplicação escuta em `3000` no container. O template atual publica:

```env
APP_BIND=127.0.0.1
APP_PORT=5200
PUBLIC_ORIGIN=http://localhost:5200
```

Mapeamento:

```text
127.0.0.1:5200 -> app:3000
```

Esse é o modo recomendado quando um reverse proxy termina HTTPS no mesmo host.

O PostgreSQL permanece somente na rede Docker em `postgres:5432`.

Para exposição direta, altere deliberadamente para:

```env
APP_BIND=0.0.0.0
```

Nesse caso configure firewall e TLS adequadamente. Se `APP_BIND` não for loopback, `PUBLIC_ORIGIN` deve usar `https://`, salvo exceção local/emergencial explícita por `ALLOW_INSECURE_PUBLIC_HTTP=true`.

## Validar antes do deploy

Preflight seguro, sem secrets reais:

```bash
npm run prod:check
```

Validação da configuração operacional real:

```bash
npm run prod:config
```

`prod:config` usa `docker compose config --quiet` e não imprime a configuração resolvida.

## Backup

Antes de atualizar produção:

```bash
npm run prod:backup
```

O comando cria dump PostgreSQL conforme o contrato de reliability.

Valide backups periodicamente:

```bash
npm run prod:restore-check -- backups/loto-lab-AAAA-MM-DD.dump
```

Não existe mais alias paralelo `ops:backup`/`ops:restore-check`.

## Deploy

```bash
npm run prod:deploy
```

Equivale a:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml \
  up -d --build --wait --wait-timeout 120
```

Não existe `prod:up` como segundo nome para a mesma operação.

O comando só retorna sucesso depois que os healthchecks ficam saudáveis ou o timeout expira.

Ordem de startup:

1. PostgreSQL inicia;
2. healthcheck do PostgreSQL fica saudável;
3. aplicação inicia;
4. migrations pendentes são aplicadas;
5. API começa a responder;
6. scheduler operacional inicia e executa a sincronização inicial.

Em base vazia, a primeira sincronização pode levar mais tempo devido ao histórico faltante.

## Verificar saúde

```bash
npm run prod:status
npm run prod:verify
```

`prod:verify` executa readiness dentro do container da aplicação.

Com bind/porta padrão, também é possível verificar externamente:

```bash
curl -f http://127.0.0.1:5200/health/ready
```

Resposta esperada:

```json
{"status":"ok","database":"ready"}
```

Os endpoints `/health`, `/health/live` e `/health/ready` não exigem autenticação. O restante exige credenciais quando configuradas.

Para uma rota protegida:

```bash
curl -u "$APP_AUTH_USER:$APP_AUTH_PASSWORD" http://127.0.0.1:5200/api/v1/lotteries
```

## Limites operacionais HTTP

Para evitar monopolização de CPU/memória:

- geração aceita no máximo 10 jogos por chamada;
- testes históricos via HTTP aceitam no máximo 10 jogos por concurso e 500 concursos;
- Laboratório aceita no máximo 10 jogos, 500 concursos e bloco máximo de 100;
- geração, backtests, Laboratório, IA e sync manual possuem rate limiting em memória;
- backtests persistidos guardam apenas o artefato compacto de cada rodada.

Testes maiores devem ser segmentados por intervalo.

## Logs

```bash
npm run prod:logs
```

Todos os serviços:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml logs -f
```

## Atualização de versão

Fluxo recomendado:

```text
backup
-> atualizar checkout para a revisão desejada
-> prod:check
-> prod:config
-> prod:deploy
-> prod:verify
```

Migrations são forward-only. Por isso backup antes de mudanças de schema faz parte do procedimento.

## Restore real

Restore real é destrutivo para o estado atual do banco. Pare a aplicação primeiro:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml stop app
```

Restaure o dump selecionado conforme o procedimento em [`RELIABILITY.md`](RELIABILITY.md). Depois suba a aplicação e confirme readiness/smoke.

`prod:restore-check` **não** executa esse restore destrutivo: ele restaura em banco temporário para validar o backup.

## Parar a stack

```bash
npm run prod:down
```

Esse comando remove containers/rede, mas não o volume PostgreSQL.

Não use `docker compose down -v` em produção salvo quando a intenção for apagar os dados persistidos.

## Scheduler operacional

Valores padrão:

```env
OPS_AUTO_SYNC=true
OPS_INTERVAL_MINUTES=30
OPS_STALE_AFTER_MINUTES=180
```

A aplicação usa advisory lock PostgreSQL para impedir sincronizações simultâneas. Painel, scheduler e `npm run ops:sync` compartilham a mesma trava.

No `SIGINT`/`SIGTERM`, a aplicação deixa de aceitar novas conexões, drena trabalhos e encerra o pool de forma controlada.

## Reverse proxy e HTTPS

O Compose não escolhe provider TLS. Em produção pública, use reverse proxy na frente de `127.0.0.1:5200` e HTTPS.

Depois ajuste:

```env
PUBLIC_ORIGIN=https://seu-dominio
```

O Loto Lab envia CSP, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy` e políticas same-origin. O proxy deve adicionar HSTS quando HTTPS estiver estabilizado.

Secrets nunca entram no frontend ou repositório.

## CI e Security

O CI funcional atual valida:

```text
npm ci
-> PostgreSQL efêmero
-> npm run check
```

`npm run check` cobre contrato de produção versionado, formatação/higiene, plataforma/TypeScript, build e testes funcionais.

E2E, coverage, auditoria de dependências e verificações operacionais são direcionados por risco/escopo.

O workflow de Security atual roda semanalmente/manualmente e cobre audit, CodeQL, build da imagem, SBOM e Trivy.

Detalhes em [`QUALITY.md`](QUALITY.md).
