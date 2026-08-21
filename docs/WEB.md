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
├── strategies.html
├── jobs.html
├── shell.js              # navegação e ícones compartilhados
├── feature-loader.js     # lazy loading por view
├── app.js                # fluxo principal
├── dashboard-scope.js    # escopo comparativo/focado do Dashboard
├── ui-foundation.css     # tipografia, foco e responsividade
└── *.js / *.css          # features específicas
```

`npm run web:build` gera `web-dist/` e um `build-manifest.json`. O hash do build é aplicado aos URLs dos assets. Somente URLs cujo `?v=` corresponde ao build atual recebem cache imutável; versões inválidas usam `no-store`. HTML permanece com `no-cache`.

## Telas

A aplicação principal mantém as views:

- Dashboard: concursos, estado operacional, desempenho e atalhos com escopo comparativo ou focado;
- Análises: ranking e componentes do score;
- Gerar jogos: configuração e geração auditável;
- Meus jogos: lotes persistidos, apostas reais e conferência;
- Backtests: simulação histórica e execuções salvas.

As áreas dedicadas continuam em rotas próprias:

- `/lab`: comparação controlada de estratégias;
- `/strategies`: catálogo e versões imutáveis de estratégias;
- `/jobs`: fila persistente de Backtests e Laboratório;
- `/agenda`: próximos concursos e notificações;
- `/ai`: interpretação de evidências já calculadas.

## Escopo do Dashboard

O seletor superior muda de significado apenas no Dashboard e passa a se chamar **Escopo**:

- `Todas as loterias`: mostra os três últimos concursos e compara o último backtest, o desempenho real e os lotes recentes das três modalidades;
- `Mega-Sena`, `Lotofácil` ou `Dia de Sorte`: reduz o estado operacional e o último concurso à modalidade escolhida e mantém desempenho, apostas reais e jogos no mesmo foco.

O escopo do Dashboard é persistido separadamente da loteria ativa das demais telas. Ao sair do Dashboard, o controle volta a se chamar **Loteria** e utiliza a última modalidade específica. Atalhos como `Abrir backtests` ou `Abrir jogos` transportam explicitamente a modalidade escolhida para a tela de destino.

## Navegação

Desktop mantém todas as áreas visíveis. No mobile a barra inferior contém:

- Dashboard;
- Análises;
- Gerar jogos;
- Meus jogos;
- Mais.

`Mais` concentra Backtests, Laboratório, Estratégias, Execuções, Agenda e IA, evitando itens comprimidos na barra inferior. Os itens icon-only mantêm nomes acessíveis, o disclosure pode ser fechado com `Escape` e o contador da Agenda é preservado no menu compacto.

## Carregamento sob demanda

A home não baixa todas as extensões na primeira navegação. `feature-loader.js` carrega sob demanda:

- escopo e status operacional no Dashboard;
- refinamentos nas views analíticas;
- auditoria de diversidade em Gerar jogos;
- apostas reais e gestão de lotes em Meus jogos.

No Dashboard o módulo de escopo é carregado antes do status operacional. Isso garante que o primeiro paint dos cards de cobertura use o mesmo escopo exibido no seletor.

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

`npm test` compila backend e testes, gera `web-dist` e valida API, PostgreSQL e assets. O CI também valida o Compose, constrói a imagem Docker de produção, executa smoke test do container e roda o E2E em Chrome real.

Detalhes adicionais em [`PERFORMANCE.md`](PERFORMANCE.md).
