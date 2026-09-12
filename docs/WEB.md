# Interface Web

A interface web do Loto Lab é servida pelo mesmo processo da API HTTP. O navegador renderiza e orquestra; cálculo estatístico, geração, conferência, financeiro e testes históricos continuam no backend/core.

## Execução local

```bash
cp .env.example .env
docker compose up -d postgres
npm run db:migrate
npm run api:start
```

Abra `http://127.0.0.1:5200`. A API fica no mesmo processo em `/api/v1`.

## Arquitetura atual

O frontend continua **vanilla** — HTML, CSS e ES Modules — sem framework. A fonte tipada vive em `web/src` e `npm run web:build` emite JavaScript nativo para `web-dist/assets/src`.

Estrutura principal:

```text
web/
├── app.js                    # composition root legado/base das views principais
├── shell.js                  # boundary compatível
├── feature-loader.js         # boundary compatível
├── src/
│   ├── core/
│   │   ├── api.ts
│   │   ├── featureLoader.ts
│   │   ├── mainContext.ts
│   │   ├── mainRenderState.ts
│   │   ├── shell.ts
│   │   └── viewLifecycle.ts
│   ├── features/
│   │   ├── agenda.ts
│   │   ├── ai.ts
│   │   ├── analysisV2.ts
│   │   ├── backtests.ts
│   │   ├── dashboardScope.ts
│   │   ├── dataStatus.ts
│   │   ├── generationV2.ts
│   │   ├── jobs.ts
│   │   ├── lab.ts
│   │   ├── myGames.ts
│   │   ├── myGames/
│   │   │   ├── auditability.ts
│   │   │   ├── betForm.ts
│   │   │   ├── comparison.ts
│   │   │   ├── formatting.ts
│   │   │   ├── presentation.ts
│   │   │   ├── state.ts
│   │   │   ├── support.ts
│   │   │   └── types.ts
│   │   └── strategies.ts
│   └── shared/
│       ├── escaping.ts
│       ├── formatters.ts
│       └── toast.ts
└── CSS funcional + workspaces visuais
```

### Core compartilhado

- `core/api.ts` — client HTTP/contrato de erro;
- `core/mainContext.ts` — normalização tipada de view e loteria;
- `core/mainRenderState.ts` — token de render, `AbortController` e stale guard da aplicação principal;
- `core/viewLifecycle.ts` — lifecycle compartilhado entre shell/features;
- `core/featureLoader.ts` — lazy loading, cache/fingerprint, retry e coordenação de assets;
- `core/shell.ts` — navegação/shell sem parser de hash duplicado.

Os boundaries JavaScript já migrados permanecem finos/import-only. Não existe objetivo de rewrite completo: ownership é extraído quando há uma responsabilidade independente e testável.

### Features

As superfícies principais possuem owners TypeScript canônicos. Composition roots continuam responsáveis por coordenação; módulos internos só são criados quando existe uma boundary real de contrato, estado, apresentação ou lifecycle.

Em **Meus Jogos**:

- `myGames.ts` coordena API, render, lifecycle e eventos;
- `myGames/state.ts` concentra filtro, busca, expansão e invalidação de request stale;
- `myGames/betForm.ts` cria apostas reais e aceita `researchHypothesisId` opcional;
- `myGames/presentation.ts` apresenta a proveniência persistida sem inferir recomendação;
- `myGames/auditability.ts` preserva o concurso alvo contra tamper no browser;
- nenhum payload de resultado/proveniência cruza superfícies por query/hash/localStorage.

Em **Gerador**, readiness/explainability permanecem owners internos tipados coordenados pelo lifecycle compartilhado. Em **Testes históricos**, `backtests.ts` é owner funcional único; falha de asset é explícita/retryable em vez de reviver implementação paralela. Painel, Análises, Agenda, IA, Estratégias, Execuções e Laboratório seguem o mesmo princípio de owner canônico + boundaries finos.

## Estado do ownership TypeScript

O escopo estrutural da #60 está concluído. Isso significa:

- contratos compartilhados e lifecycle crítico possuem owners TypeScript;
- boundaries migrados não redefinem comportamento funcional;
- state/lifecycle que justificam ownership independente estão extraídos e testáveis;
- não há rewrite/framework como meta arquitetural;
- arquivos grandes podem continuar composition roots quando não existe seam independente que melhore ownership/testabilidade.

Novo refactor deve nascer de hotspot concreto de estado, acoplamento, duplicação, segurança ou testabilidade — não de contagem de linhas.

## Build e cache

`tsconfig.web.json` cobre `web/src/**/*.ts`. `npm run web:build`:

1. prepara `web-dist/`;
2. copia assets públicos sem expor fontes `.ts` como assets brutos;
3. executa `tsc` para `web-dist/assets/src`;
4. calcula fingerprint SHA-256 do build;
5. reescreve referências de assets com `?v=<hash>`.

HTML não usa cache permanente. Assets fingerprintados podem usar cache imutável quando o hash corresponde ao build atual. `typecheck` e `lint` cobrem a fonte web com ambiente DOM/browser separado do servidor.

## Fonte de verdade visual

A direção oficial é o **Protótipo 1 — Dark Moderno / Workspace científico compacto**.

Referência: [`design/PROTOTYPE_1_DARK_MODERN.md`](design/PROTOTYPE_1_DARK_MODERN.md).

Regras principais:

- fundo azul-preto e superfícies azul-grafite;
- azul para ação/seleção/dado principal;
- verde somente para sucesso/resultado positivo;
- texto funcional >=16px;
- contraste, foco, teclado e reduced-motion obrigatórios;
- densidade compacta sem sacrificar leitura;
- gráficos somente quando existe dado real;
- mobile tratado como layout próprio e sem overflow horizontal estrutural.

O rollout visual da #121 permanece concluído. Mudança futura de direção visual exige nova decisão explícita; o fechamento do ownership TypeScript não reabre redesign.

## Superfícies

### Painel — `/#dashboard`

KPIs, estado operacional, financeiro e atividade recente. O owner tipado preserva `desconhecido != zero` e aborta leituras stale ao perder a view.

### Análises — `/#analysis`

Classificação, estrutura, dinâmica, combinações e validação. `analysisV2.ts` é o owner funcional da camada avançada; tabelas largas mantêm scroll local no mobile.

### Gerador — `/#generate`

Plano → prévia congelada → save exato, com seed/Preview ID auditáveis. `generationV2.ts` coordena a feature e os owners internos de readiness/explainability.

### Meus Jogos — `/#games`

Lotes, apostas reais, proveniência experimental opcional, conferência, financeiro, comparação e ocultar/mostrar sem apagar histórico. Detalhes: [`MY_GAMES.md`](MY_GAMES.md).

### Testes históricos — `/#backtests`

Formulário, execução e histórico persistido sob owner TypeScript único. A feature cancela requests quando perde ownership e rejeita resposta stale quando view/loteria mudam.

### Laboratório — `/lab`

Comparação de hipóteses sob condições equivalentes. Contexto para backtests usa identidades/deep links existentes e não copia resultado por estado de navegação.

### Estratégias, Execuções, Agenda e IA

Possuem owners TypeScript dedicados e boundaries compatíveis mínimos. IA interpreta evidências; não assume cálculo crítico nem decisão automática.

## Segurança e acessibilidade

- escaping/textContent são padrão para dados externos;
- DOM dinâmico deve evitar `innerHTML` com payload não escapado;
- foco visível, teclado, contraste e `prefers-reduced-motion` são requisitos;
- browser E2E protege overflow estrutural e estados de loading/falha;
- requests assíncronos devem possuir cancelamento ou stale guard proporcional ao lifecycle;
- estado persistente deve ter owner explícito; estado de navegação não deve duplicar entidades já persistidas no backend.

## Política para evolução

O frontend não possui backlog permanente de migração. Nova fatia nasce apenas quando um problema concreto demonstra benefício em ownership, acoplamento, duplicação, segurança, performance ou testabilidade.

O gate canônico continua:

```bash
npm run check
```
