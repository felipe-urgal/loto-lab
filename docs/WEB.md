# Interface Web

A interface web do Loto Lab é servida pelo mesmo processo da API HTTP e mantém toda regra estatística no backend. O navegador consulta `/api/v1`; score, geração, conferência, ROI e regras de backtest continuam no core.

## Execução local

Suba o PostgreSQL:

```bash
docker compose up -d postgres
```

Configure a conexão:

```bash
export DATABASE_URL=postgresql://loto_lab:loto_lab@localhost:5433/loto_lab
```

Aplique migrations e, se necessário, sincronize concursos:

```bash
npm run db:migrate
npm run db:sync -- mega-sena
npm run db:sync -- lotofacil
npm run db:sync -- dia-de-sorte
```

Inicie a aplicação:

```bash
npm run api:start
```

Abra `http://127.0.0.1:3000`. A API continua disponível no mesmo processo em `/api/v1`.

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

`npm run web:build` gera `web-dist/` e um `build-manifest.json`. O hash do build é aplicado aos URLs dos assets. Somente URLs cujo `?v=` corresponde ao build atual recebem cache imutável; versões inválidas usam `no-store`. HTML permanece com `no-cache`.

## Telas

A aplicação principal mantém as views:

- Dashboard: concursos, estado operacional e atalhos;
- Análises: ranking e componentes do score;
- Gerar jogos: configuração e geração auditável;
- Meus jogos: lotes persistidos, apostas reais e conferência;
- Backtests: simulação histórica e execuções salvas.

As áreas dedicadas continuam em rotas próprias:

- `/lab`: comparação controlada de estratégias;
- `/agenda`: próximos concursos e notificações;
- `/ai`: interpretação de evidências já calculadas.

## Navegação

Desktop mantém todas as áreas visíveis. No mobile a barra inferior contém:

- Dashboard;
- Análises;
- Gerar jogos;
- Meus jogos;
- Mais.

`Mais` concentra Backtests, Laboratório, Agenda e IA, evitando oito itens comprimidos na barra inferior. Os itens icon-only mantêm nomes acessíveis, o disclosure pode ser fechado com `Escape` e o contador da Agenda é preservado no menu compacto.

## Carregamento sob demanda

A home não baixa todas as extensões na primeira navegação. `feature-loader.js` carrega sob demanda:

- status operacional no Dashboard;
- refinamentos nas views analíticas;
- auditoria de diversidade em Gerar jogos;
- apostas reais e gestão de lotes em Meus jogos.

O loader reutiliza Promises para evitar downloads duplicados e aguarda a tentativa de carregamento do CSS da feature antes de executar seu módulo, evitando renderização temporariamente sem estilo no caminho normal. Se o stylesheet falhar, o JavaScript ainda é carregado para preservar a funcionalidade.

## Acessibilidade

A fundação visual inclui:

- foco visível consistente para teclado;
- nomes acessíveis mesmo quando labels ficam visualmente ocultos;
- alvos interativos de tamanho confortável;
- escala tipográfica maior para tabelas, labels e metadados;
- suporte a `prefers-reduced-motion`;
- navegação mobile sem overflow.

## Cálculo pesado

Backtests e Laboratório preservam os mesmos contratos HTTP, mas o trabalho CPU-bound roda em `worker_threads`, mantendo o event loop disponível para health checks, navegação e outras requisições.

O backtest compacta cada rodada dentro do próprio worker antes de transferi-la à thread HTTP. Assim `generatedGames` e `checks`, usados apenas durante o cálculo, não são clonados nem persistidos.

## Testes

`npm test` compila backend e testes, gera `web-dist` e valida API, PostgreSQL e assets. O CI também valida o Compose, constrói a imagem Docker de produção e executa smoke test do container.

Detalhes adicionais em [`PERFORMANCE.md`](PERFORMANCE.md).
