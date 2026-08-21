# Interface Web

A interface web do Loto Lab é servida pelo mesmo processo da API HTTP e mantém toda regra estatística no backend.

## Arquitetura atual

O frontend continua leve e sem framework, mas deixou de ser um único bloco global:

```text
web/
├── index.html
├── lab.html
├── agenda.html
├── ai.html
├── shell.js              # navegação e ícones compartilhados
├── feature-loader.js     # lazy loading por view
├── app.js                # fluxo principal
├── ui-foundation.css     # tipografia, foco e responsividade
└── *.js / *.css          # features específicas
```

`npm run web:build` gera `web-dist/` com uma versão de conteúdo usada nos URLs dos assets. O servidor entrega URLs versionadas com cache imutável e HTML com `no-cache`.

## Navegação

Desktop mantém todas as áreas visíveis. No mobile a barra inferior contém:

- Dashboard;
- Análises;
- Gerar jogos;
- Meus jogos;
- Mais.

`Mais` concentra Backtests, Laboratório, Agenda e IA, evitando oito itens comprimidos na barra inferior.

## Carregamento sob demanda

A home não baixa todas as extensões na primeira navegação. `feature-loader.js` carrega sob demanda:

- status operacional no Dashboard;
- refinamentos nas views analíticas;
- auditoria de diversidade em Gerar jogos;
- apostas reais e gestão de lotes em Meus jogos.

## Acessibilidade

A fundação visual inclui:

- foco visível consistente para teclado;
- alvos interativos de tamanho confortável;
- escala tipográfica maior para tabelas, labels e metadados;
- suporte a `prefers-reduced-motion`;
- navegação mobile sem overflow.

## Cálculo pesado

Backtests e Laboratório preservam os mesmos contratos HTTP, mas o trabalho CPU-bound roda em `worker_threads`, mantendo o event loop disponível para health checks, navegação e outras requisições.

## Testes

`npm test` compila backend e testes, gera `web-dist` e valida API, PostgreSQL e assets. O CI também constrói e faz smoke test da imagem Docker de produção.

Detalhes adicionais em [`PERFORMANCE.md`](PERFORMANCE.md).
