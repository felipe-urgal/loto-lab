# Interface Web

A interface web do Loto Lab é servida pelo mesmo processo da API HTTP. O navegador renderiza e orquestra; cálculo estatístico, geração, conferência, financeiro e testes históricos continuam no backend/core.

## Execução local

```bash
cp .env.example .env
docker compose up -d postgres
npm run db:migrate
npm run api:start
```

Abra:

```text
http://127.0.0.1:5200
```

A API fica no mesmo processo em `/api/v1`.

## Arquitetura atual

O frontend continua **vanilla** — HTML, CSS e ES Modules — sem framework.

Estrutura principal:

```text
web/
├── index.html
├── lab.html
├── agenda.html
├── ai.html
├── strategies.html
├── jobs.html
├── shell.js
├── feature-loader.js
├── app.js
├── design-system.css
├── ui-foundation.css
├── *-workspace.css
└── módulos/folhas específicos por feature
```

`feature-loader.js` carrega módulos específicos sob demanda. O build `npm run web:build` gera `web-dist/`, calcula fingerprint SHA-256 do conjunto web e reescreve referências de assets com `?v=<hash>`.

HTML usa política sem cache permanente; assets fingerprintados podem usar cache imutável quando o hash corresponde ao build atual.

## Fonte de verdade visual

A direção oficial é o **Protótipo 1 — Dark Moderno / Workspace científico compacto**.

Referência: [`design/PROTOTYPE_1_DARK_MODERN.md`](design/PROTOTYPE_1_DARK_MODERN.md).

Regras principais:

- fundo azul-preto;
- superfícies azul-grafite;
- azul para ação, seleção e dado principal;
- verde somente para sucesso/resultado positivo;
- texto funcional >=16px;
- contraste/foco/teclado/reduced-motion obrigatórios;
- densidade compacta sem sacrificar leitura;
- gráficos somente quando existe dado real;
- mobile tratado como layout próprio, não desktop apenas empilhado.

## Estado do rollout

O rollout e a consolidação visual estão concluídos pela #121:

- #123 — Design System + shell;
- #124 — Painel;
- #125 — Análises;
- #126 — Gerador;
- #127 — Meus Jogos;
- #128 — Testes históricos;
- #129 — Laboratório;
- #130 — Estratégias;
- #131 — Execuções;
- #132 — Agenda;
- #133 — IA;
- #134–#137 — consolidação inicial de ownership/CSS legado;
- #139 — hardening visual de Análises absorvido no workspace;
- #140 — assets legados de diversidade do Gerador removidos;
- #141 — status visual do Painel absorvido no scope canônico;
- #142 — explainability visual do Gerador absorvida no workspace;
- #143 — auditoria final desktop/mobile de legibilidade, foco, reduced-motion e overflow estrutural.

As folhas adicionais que permanecem têm responsabilidade funcional, estrutural ou de fallback explícita; coexistir com um `*-workspace.css` não torna uma camada automaticamente redundante.

## Cascata visual

Regra geral:

```text
styles.css
  ↓
ui-foundation.css
  ↓
design-system.css
  ↓
CSS funcional da feature, quando necessário
  ↓
stylesheet canônico da superfície
```

Folhas adicionais só permanecem quando ainda possuem responsabilidade funcional/estrutural real.

Não existem mais as camadas globais de correção:

- `readability.css`;
- `readability.js`;
- `localization.js`.

Copy PT-BR e legibilidade pertencem à fonte da própria feature.

## Telas

### Painel — `/#dashboard`

Prioriza:

1. resumo/KPIs reais;
2. estado do concurso/operação;
3. desempenho e conferência financeira;
4. atividade recente.

No escopo **Todas**, agregações financeiras usam custo/resultados corretos em vez de média ingênua de percentuais.

### Análises — `/#analysis`

Workspace técnico com:

- Classificação;
- Estrutura;
- Dinâmica;
- Combinações;
- Validação.

A rota básica continua como fallback e a análise avançada monta quando disponível. Tabelas largas preservam scroll local no mobile sem expandir o documento.

### Gerador — `/#generate`

Organiza análise, seleção, restrições, preview e auditoria. Seed/Preview ID permanecem auditáveis e o mobile usa stepper/layout próprio.

### Meus Jogos — `/#games`

Consolida:

- lifecycle de lotes;
- conferência;
- comparação;
- apostas reais;
- financeiro;
- ocultar/mostrar sem apagar histórico.

`my-games-v2.css` permanece como base funcional do módulo principal e `my-games-workspace.css` como apresentação final. `real-bets`/`my-games-management` permanecem apenas no fallback deliberado quando o módulo principal não monta.

### Testes históricos — `/#backtests`

Formulário e histórico persistido em workspace próprio, sem alterar a execução/worker.

### Laboratório — `/lab`

Compara hipóteses e estratégias com evidência, benchmark e progressive disclosure. `lab-workspace.css` é a folha canônica desde a consolidação #136.

### Estratégias — `/strategies`

Catálogo/versionamento com workspace próprio. Após #137 não depende mais do antigo `experiments.css`.

### Execuções — `/jobs`

Fila persistente, estados e ações operacionais. Também não depende mais de `experiments.css` após #137.

### Agenda — `/agenda`

Próximos concursos + notificações. `agenda-workspace.css` é canônico; `agenda.css` foi removido.

### IA — `/ai`

Interpretação de evidências. `ai-workspace.css` é canônico; `ai.css` foi removido.

## Navegação

Desktop mantém sidebar persistente.

Mobile mantém destinos primários:

- Painel;
- Análises;
- Gerar jogos;
- Meus Jogos;
- Mais.

`Mais` concentra Testes históricos, Laboratório, Estratégias, Execuções, Agenda e IA.

Controles icon-only mantêm nome acessível; disclosures suportam fechamento por teclado quando aplicável.

## Lazy loading e lifecycle

O shell e o app base carregam primeiro. Features são montadas por view.

Guardrails:

- Promises de asset são reutilizadas para evitar downloads/imports duplicados;
- a tentativa de CSS ocorre antes do módulo funcional;
- falha de stylesheet não deve impedir o JS funcional;
- cada feature precisa ser idempotente e tolerar navegação repetida;
- listeners/observers/timers precisam de cleanup quando a feature deixa de ser dona da view;
- não usar montagem eager redundante quando o lifecycle já fornece evento de montagem;
- `loto-lab:view-rendered` só é emitido depois que o render principal deixa o loading, reduzindo FOUC/layout shift e races de montagem.

## Acessibilidade

Baseline:

- texto funcional >=16px;
- `focus-visible` consistente;
- controles com nome acessível;
- teclado em tabs/dialogs/drawers;
- `prefers-reduced-motion`;
- sem overflow horizontal estrutural no mobile;
- contraste coerente com tokens do Design System;
- loading/empty/error/success distinguíveis semanticamente e visualmente.

O browser E2E transversal do #143 repete a auditoria de legibilidade em desktop/mobile, usa `Tab` real para confirmar foco visível, emula `prefers-reduced-motion: reduce` e falha quando o documento mobile cria overflow horizontal.

## Segurança no frontend

- segredo nunca entra em asset web;
- dados externos devem preferir `textContent`/escaping seguro;
- `innerHTML` com conteúdo dinâmico precisa ser tratado como superfície de risco;
- o frontend não deve replicar validação crítica como única defesa — invariantes continuam no backend/PostgreSQL.

A evolução para TypeScript/primitives compartilhadas é rastreada pela #60. Mudanças de jornada pertencem à #64.

## Trabalho pesado

Backtests, Strategy Lab e análise avançada usam workers/gates no backend. O frontend trata busy/timeout/erro como estados de produto, sem bloquear a navegação inteira.

## Performance percebida

O lifecycle, lazy loading e E2E atual protegem qualitativamente contra loading infinito, montagem duplicada, FOUC/layout inutilizável, navegação quebrada e overflow estrutural.

Medições quantitativas de LCP, INP e CLS e otimizações guiadas por baseline pertencem à #65. Fechar #121 não converte metas de Web Vitals em promessa sem medição representativa.

## Testes

`npm test` cobre build e contracts. O CI também executa:

- Compose;
- imagem/smoke;
- autenticação;
- E2E em Chrome real;
- Security.

E2E local contra a aplicação em `5200`:

```bash
E2E_BASE_URL=http://127.0.0.1:5200 npm run e2e:browser
```

O E2E cobre superfícies principais, rotas críticas, legibilidade, desktop/mobile e fluxos operacionais.

Veja também [`PERFORMANCE.md`](PERFORMANCE.md), [`QUALITY.md`](QUALITY.md) e [`../AGENTS.md`](../AGENTS.md).
