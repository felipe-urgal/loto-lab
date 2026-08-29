# Qualidade e gates de engenharia

Este documento registra os checks que precisam continuar verdes para proteger o baseline técnico do Loto Lab sem misturar regras de qualidade com a lógica estatística ou financeira do produto.

## Gate local recomendado

Antes de abrir ou atualizar um PR:

```bash
npm ci
npm run check
```

`npm run check` executa:

1. baseline de plataforma (`Node.js`, `@types/node`, TypeScript, CI, Docker e documentação);
2. typecheck TypeScript;
3. higiene determinística de arquivos de texto;
4. lint baseado no compilador TypeScript;
5. build;
6. suíte completa com cobertura mínima.

A auditoria de dependências usa acesso ao registry e fica separada:

```bash
npm run audit:prod
```

## Typecheck e lint

O typecheck usa o `tsconfig.json` sem emitir arquivos.

O lint é deliberadamente enxuto e sem dependências adicionais. Ele usa o compilador TypeScript com:

- `noUnusedLocals`;
- `noUnusedParameters`;
- `noFallthroughCasesInSwitch`.

Isso não pretende substituir um linter de estilo completo. O objetivo atual é bloquear problemas estáticos objetivos com o menor custo de manutenção possível.

## Higiene de texto

`npm run format:check` verifica os arquivos de texto versionados e falha em caso de:

- BOM UTF-8;
- CRLF/CR em vez de LF;
- espaços ou tabs no fim de linhas.

Esse gate é uma verificação determinística de formato textual, não um formatter opinativo como Prettier.

O repositório possui alguns arquivos legados sem newline final. O gate não força uma normalização em massa desses arquivos para evitar churn sem relação com comportamento; arquivos tocados podem ser normalizados gradualmente.

## Isolamento da suíte PostgreSQL

A suíte inclui testes unitários, de integração, API e persistência. As suítes que dependem de PostgreSQL não compartilham mais tabelas, sequences ou fixtures globais entre arquivos.

O helper `tests/helpers/postgres.ts` cria um database temporário exclusivo para cada suíte integrada, preservando a configuração base de conexão e executando migrations por padrão. O cleanup encerra o pool antes de remover o database; se uma conexão vazar, o helper força a remoção para não deixar resíduo, mas propaga a falha original para que o leak continue visível no CI.

O isolamento por database foi escolhido em vez de apenas `search_path`/schema porque o Loto Lab também exerce advisory locks reais em migrations, runtime e operações. Isso fornece uma fronteira consistente para dados e locks durante testes concorrentes.

Os arquivos de teste rodam com concorrência deliberadamente limitada:

```text
--test-concurrency=2
```

O valor `2` é intencional. Ele remove a serialização global que existia por causa do banco compartilhado sem assumir que mais paralelismo sempre será melhor para PostgreSQL, worker threads ou o runner de CI. Qualquer aumento futuro deve ser medido no pipeline completo e manter estabilidade antes de ser adotado.

Testes puramente unitários continuam sem depender de PostgreSQL. Suítes integradas devem usar o helper comum em vez de introduzir `TRUNCATE` global, fixtures compartilhadas ou schemas manuais.

## Cobertura

A cobertura usa o runner nativo do Node.js 24 e é executada sobre a suíte completa compilada.

Baseline observado ao introduzir o gate:

| Métrica | Observado | Mínimo |
| --- | ---: | ---: |
| Linhas | 79,50% | 78% |
| Branches | 76,36% | 75% |
| Funções | 86,75% | 85% |

Os mínimos foram definidos logo abaixo do baseline real para detectar regressões sem transformar o primeiro rollout em uma meta arbitrária de cobertura.

O relatório nativo considera os módulos carregados pela suíte. Portanto, o percentual é um guardrail de regressão sobre código exercitado, não uma prova de cobertura de todo arquivo existente no repositório.

Para elevar um threshold, primeiro aumente testes relevantes e depois ajuste o piso em PR dedicado ou junto da mudança que comprovadamente melhorou o baseline.

## Auditoria de dependências

O CI executa:

```bash
npm audit --omit=dev --audit-level=high
```

O gate cobre dependências de produção e falha para vulnerabilidades `high` ou `critical`. Dependências de desenvolvimento continuam visíveis no `npm ci`/Dependabot, mas não bloqueiam produção por esse gate específico.

## CI

Em PRs e pushes para `main`, a ordem principal é:

1. instalar dependências com `npm ci`;
2. executar gates estáticos;
3. build + testes com concorrência limitada e thresholds de cobertura;
4. auditar dependências de produção;
5. validar Compose;
6. construir a imagem de produção;
7. executar smoke tests, autenticação e E2E real em navegador.

A suíte com cobertura roda uma única vez no CI. Isso evita duplicar aproximadamente a mesma execução apenas para gerar o relatório de cobertura.
