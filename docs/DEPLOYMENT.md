# Deploy de produção

O Loto Lab possui uma stack Docker de produção separada do ambiente local de desenvolvimento.

Arquivos principais:

- `Dockerfile` — imagem multi-stage da aplicação;
- `docker-compose.prod.yml` — aplicação + PostgreSQL persistente;
- `.env.production.example` — template de configuração;
- `docker-compose.yml` — compose local de desenvolvimento.

## Princípios

- PostgreSQL não publica porta no host em produção;
- a aplicação roda como usuário não-root;
- o filesystem do container da aplicação é somente leitura;
- capabilities Linux são removidas da aplicação;
- healthchecks existem para aplicação e banco;
- migrations são aplicadas automaticamente no startup;
- o scheduler operacional continua sincronizando concursos e reconciliando apostas;
- toda a UI/API, exceto healthchecks, exige autenticação HTTP Basic em produção;
- endpoints caros possuem limites e rate limiting para reduzir risco de indisponibilidade;
- segredos ficam somente em `.env.production`, que não deve ser commitado.

## Requisitos do host

- Docker Engine;
- Docker Compose v2;
- Git para atualizar o código;
- espaço persistente suficiente para o volume PostgreSQL.

Node/npm no host são opcionais se os comandos Docker Compose forem executados diretamente. Os atalhos `npm run prod:*` exigem npm no host.

## Primeira configuração

```bash
cp .env.production.example .env.production
```

Gere segredos diferentes e longos para PostgreSQL e para o acesso ao Loto Lab, por exemplo:

```bash
openssl rand -hex 32
openssl rand -hex 32
```

Edite `.env.production` e substitua:

```env
APP_AUTH_USER=loto-admin
APP_AUTH_PASSWORD=...
POSTGRES_PASSWORD=...
```

`APP_AUTH_PASSWORD` deve possuir pelo menos 12 caracteres. O Compose de produção não inicia sem usuário/senha da aplicação e senha do PostgreSQL.

Ao abrir o Loto Lab no navegador, o próprio navegador solicitará as credenciais HTTP Basic. Use HTTPS sempre que esse acesso passar por uma rede não confiável.

Se houver um domínio público, configure também:

```env
PUBLIC_ORIGIN=https://loto.exemplo.com
```

A integração da OpenAI é opcional:

```env
OPENAI_API_KEY=
OPENAI_MODEL=gpt-5.6-luna
```

Sem chave ou sem billing da API, somente a geração de interpretações de IA fica indisponível. Chamadas de interpretação possuem timeout e rate limiting no servidor para limitar consumo acidental ou abusivo.

## Portas e exposição de rede

A aplicação escuta internamente em `3000` no container. A porta publicada no host é configurada por `APP_PORT` e o template atual usa:

```env
APP_BIND=127.0.0.1
APP_PORT=5200
PUBLIC_ORIGIN=http://localhost:5200
```

Com esses valores, o mapeamento é:

```text
127.0.0.1:5200 -> app:3000
```

Isso deixa a aplicação acessível apenas no próprio servidor e é o modo recomendado quando Caddy, Nginx, Traefik ou outro reverse proxy termina HTTPS no mesmo host.

O PostgreSQL permanece somente na rede Docker em `postgres:5432` e não publica porta no host em produção.

Para exposição direta, altere deliberadamente para:

```env
APP_BIND=0.0.0.0
```

Nesse caso configure firewall e TLS adequadamente. Se `APP_BIND` não for loopback, `PUBLIC_ORIGIN` deve usar `https://`, salvo a exceção local/emergencial explicitamente habilitada por `ALLOW_INSECURE_PUBLIC_HTTP=true`.

Não exponha PostgreSQL na internet.

## Validar configuração

Com npm:

```bash
npm run prod:config
```

Ou diretamente:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml config
```

Faça essa validação antes de cada primeira subida após mudança de configuração.

## Subir a stack

```bash
npm run prod:up
```

Equivalente a:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
```

A ordem de startup é:

1. PostgreSQL inicia;
2. healthcheck do PostgreSQL fica saudável;
3. aplicação inicia;
4. migrations pendentes são aplicadas;
5. API começa a responder;
6. scheduler operacional inicia e executa a sincronização inicial.

Em uma base vazia, a primeira sincronização pode levar mais tempo porque precisa preencher o histórico faltante.

## Verificar saúde

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml ps
```

Com o bind/porta padrão:

```bash
curl -f http://127.0.0.1:5200/health/ready
```

Resposta esperada:

```json
{"status":"ok","database":"ready"}
```

Os endpoints `/health`, `/health/live` e `/health/ready` não exigem autenticação para permitir healthchecks do Docker/reverse proxy. Todo o restante exige credenciais quando `APP_AUTH_USER` e `APP_AUTH_PASSWORD` estão configurados.

Para validar uma rota protegida via terminal:

```bash
curl -u "$APP_AUTH_USER:$APP_AUTH_PASSWORD" http://127.0.0.1:5200/api/v1/lotteries
```

## Limites operacionais HTTP

Para evitar que uma chamada web monopolize CPU/memória:

- geração de jogos aceita no máximo 10 jogos por chamada;
- testes históricos via HTTP aceitam no máximo 10 jogos por concurso e 500 concursos por execução;
- Laboratório aceita no máximo 10 jogos, 500 concursos de aquecimento/janela histórica e bloco máximo de 100;
- geração, testes históricos, Laboratório, IA e sincronização manual possuem rate limiting em memória;
- testes históricos persistidos guardam apenas o artefato compacto de cada rodada; o resumo completo continua preservado.

Testes históricos maiores devem ser segmentados por intervalo de concursos. O limite web não altera os cálculos determinísticos do core.

## Logs

```bash
npm run prod:logs
```

Todos os serviços:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml logs -f
```

## Atualização de versão

Antes de atualizar, faça backup do banco.

Depois:

```bash
git pull
npm run prod:config
npm run prod:up
```

`up -d --build` reconstrói a imagem e recria a aplicação quando necessário. O volume PostgreSQL é preservado.

As migrations são forward-only. Por isso o backup antes de mudanças de schema é parte do procedimento de atualização.

## Backup do PostgreSQL

Crie um diretório fora do repositório para backups e execute:

```bash
mkdir -p backups

docker compose --env-file .env.production -f docker-compose.prod.yml \
  exec -T postgres sh -lc 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' \
  > "backups/loto-lab-$(date +%Y%m%d-%H%M%S).dump"
```

Valide que o arquivo foi criado e possui tamanho maior que zero.

Backups devem ser copiados para armazenamento fora do servidor quando o Loto Lab for usado como serviço contínuo.

## Restore

Restore é destrutivo para o estado atual do banco. Pare a aplicação primeiro:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml stop app
```

Restaure o dump desejado:

```bash
cat backups/loto-lab-YYYYMMDD-HHMMSS.dump | \
  docker compose --env-file .env.production -f docker-compose.prod.yml \
  exec -T postgres sh -lc 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists'
```

Suba a aplicação novamente:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml up -d app
```

Confirme `/health/ready` e o Painel antes de considerar o restore concluído.

## Parar a stack

```bash
npm run prod:down
```

Esse comando remove os containers e a rede, mas **não remove o volume do PostgreSQL**.

Não use `docker compose down -v` em produção salvo quando a intenção for realmente apagar os dados persistidos.

## Scheduler operacional

Valores padrão:

```env
OPS_AUTO_SYNC=true
OPS_INTERVAL_MINUTES=30
OPS_STALE_AFTER_MINUTES=180
```

A aplicação usa advisory lock no PostgreSQL para impedir duas sincronizações simultâneas. O botão do Painel, scheduler e comandos manuais compartilham a mesma trava.

No encerramento por `SIGINT`/`SIGTERM`, a aplicação para de aceitar novas conexões, aguarda uma sincronização operacional já iniciada terminar e só então encerra o pool do PostgreSQL.

## Reverse proxy e HTTPS

O compose não escolhe um provedor de TLS. Em produção pública, coloque um reverse proxy na frente de `127.0.0.1:5200` e use HTTPS.

Depois ajuste:

```env
PUBLIC_ORIGIN=https://seu-dominio
```

O Loto Lab envia CSP, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy` e políticas same-origin nos assets web. O reverse proxy deve adicionar HSTS quando HTTPS estiver estabilizado.

Não coloque `OPENAI_API_KEY`, senha do PostgreSQL ou qualquer outro segredo no frontend ou repositório. As credenciais HTTP Basic podem ficar no `.env.production` ou ser substituídas posteriormente por um provedor de autenticação mais completo.

## CI

O CI valida produção em múltiplos níveis:

1. quality gates estáticos e suíte TypeScript/PostgreSQL;
2. `docker compose config` da stack de produção;
3. build da imagem e smoke test real do container contra PostgreSQL;
4. autenticação da imagem de produção;
5. E2E em navegador real;
6. checks de Security, incluindo dependency review, CodeQL, SBOM e vulnerabilidades da imagem.

A imagem de runtime é construída com `tsconfig.build.json`, contendo somente o código necessário para execução.

Assim uma alteração só fica verde quando o artefato que será executado em produção também consegue iniciar e responder pelos fluxos protegidos esperados.
