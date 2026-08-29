# Interface Web

A interface web do Loto Lab é servida pelo mesmo processo da API HTTP e mantém toda regra estatística no backend. O navegador consulta `/api/v1`; pontuação, geração, conferência, ROI e regras de testes históricos continuam no core.

## Execução local

Suba o PostgreSQL:

```bash
docker compose up -d postgres
```

Configure o ambiente pelo arquivo local:

```bash
cp .env.example .env
```

O template atual usa:

```env
DATABASE_URL=postgresql://loto_lab:loto_lab@localhost:5434/loto_lab
API_HOST=127.0.0.1
API_PORT=5200
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

Abra `http://127.0.0.1:5200`. A API fica disponível no mesmo processo em `http://127.0.0.1:5200/api/v1`.

`npm run api:start` carrega `.env`, aplica migrations pendentes e inicia o scheduler operacional quando `OPS_AUTO_SYNC=true`.

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
├── app.js                # fluxo principal e fallback das views
├── dashboard-scope.js    # escopo comparativo/focado do Painel
├── analysis-v2.js        # workspace avançado e auditável de Análises
├── ui-foundation.css     # tipografia, foco e responsividade
└── *.js / *.css          # features específicas
```

`npm run web:build` gera `web-dist/` e um `build-manifest.json`. O hash do build é aplicado aos URLs dos assets. Somente URLs cujo `?v=` corresponde ao build atual recebem cache imutável; versões inválidas usam `no-store`. HTML permanece com `no-cache`.

A copy visível é mantida diretamente nas fontes canônicas em PT-BR. O frontend não depende mais de um tradutor global em runtime.

## Telas

A aplicação principal mantém as views:

- **Painel**: concursos, estado operacional, desempenho e atalhos com escopo comparativo ou focado;
- **Análises**: classificação auditável, estrutura, dinâmica, combinações e validação fora da amostra;
- **Gerar jogos**: configuração, planejamento e geração auditável;
- **Meus jogos**: lotes persistidos, apostas reais e conferência;
- **Testes históricos**: simulação histórica e execuções salvas.

As áreas dedicadas continuam em rotas próprias:

- `/lab`: comparação controlada de estratégias;
- `/strategies`: catálogo e versões imutáveis de estratégias;
- `/jobs`: fila persistente de testes históricos e Laboratório;
- `/agenda`: próximos concursos e notificações;
- `/ai`: interpretação de evidências já calculadas.

## Análises 2.0

A view `#analysis` mantém a resposta básica da API para compatibilidade e monta o workspace avançado por lazy loading. Os cinco modos compartilham a mesma loteria selecionada:

- **Classificação**: pontuação, posição, movimento, robustez dos pesos, frequência e drill-down por dezena;
- **Estrutura**: repetição, paridade, soma, faixas, sequências e estruturas específicas da Lotofácil, sempre separando histórico observado de referência matemática quando ela existe;
- **Dinâmica**: movimento da classificação, atraso em percentil histórico, ciclos descritivos e mapa binário dos últimos concursos;
- **Combinações**: duques, trincas e similaridade histórica com comparação ao esperado e correção por múltiplas hipóteses;
- **Validação**: avaliação progressiva sem leakage em janelas de 100, 300 e 500 rodadas, além de sensibilidade dos cinco pesos da pontuação em 243 cenários.

A interface nunca transforma atraso, ciclo, frequência ou uma associação histórica em aumento automático de probabilidade. Métricas para as quais não há referência matemática implementada são marcadas como descritivas, em vez de receber um “esperado” arbitrário.

O cálculo avançado permanece no backend. O navegador recebe os resultados prontos em `advanced` dentro de `GET /api/v1/analysis/:lottery` e se limita a explorar/renderizar os dados.

Detalhes matemáticos e de interpretação em [`ANALYSES.md`](ANALYSES.md).

## Escopo do Painel

O seletor superior muda de significado apenas no Painel e passa a se chamar **Escopo**:

- `Todas as loterias`: mostra os três últimos concursos e compara o último teste histórico, o desempenho real e os lotes recentes das três modalidades;
- `Mega-Sena`, `Lotofácil` ou `Dia de Sorte`: reduz o estado operacional e o último concurso à modalidade escolhida e mantém desempenho, apostas reais e jogos no mesmo foco.

O escopo do Painel é persistido separadamente da loteria ativa das demais telas. Ao sair do Painel, o controle volta a se chamar **Loteria** e utiliza a última modalidade específica. Atalhos para testes históricos ou jogos transportam explicitamente a modalidade escolhida para a tela de destino.

## Navegação

Desktop mantém todas as áreas visíveis. No mobile a barra inferior contém:

- Painel;
- Análises;
- Gerar jogos;
- Meus jogos;
- Mais.

`Mais` concentra Testes históricos, Laboratório, Estratégias, Execuções, Agenda e IA, evitando itens comprimidos na barra inferior. Os itens icon-only mantêm nomes acessíveis, o disclosure pode ser fechado com `Escape` e o contador da Agenda é preservado no menu compacto.

## Carregamento sob demanda

A home não baixa todas as extensões na primeira navegação. `feature-loader.js` carrega sob demanda:

- escopo e status operacional no Painel;
- workspace completo de Análises 2.0 somente na view `analysis`;
- refinamentos nas demais views da aplicação;
- auditoria de diversidade em Gerar jogos;
- apostas reais e gestão de lotes em Meus jogos.

No Painel o módulo de escopo é carregado antes do status operacional. Isso garante que o primeiro paint dos cards de cobertura use o mesmo escopo exibido no seletor.

Em Análises, o HTML básico do `app.js` continua funcionando como fallback. Depois do render principal, `analysis-v2.js` assume a área de conteúdo se o bloco avançado estiver disponível no contrato da API. A resposta avançada recebe cache curto no serviço para evitar recomputação quando o render básico e o módulo lazy consultam a mesma revisão dos dados em sequência.

O loader reutiliza Promises para evitar downloads duplicados e aguarda a tentativa de carregamento do CSS da feature antes de executar seu módulo, evitando renderização temporariamente sem estilo no caminho normal. Se o stylesheet falhar, o JavaScript ainda é carregado para preservar a funcionalidade.

## Acessibilidade e legibilidade

A fundação visual inclui:

- foco visível consistente para teclado;
- nomes acessíveis mesmo quando labels ficam visualmente ocultos;
- alvos interativos de tamanho confortável;
- piso de 16px para texto funcional;
- suporte a `prefers-reduced-motion`;
- navegação mobile sem overflow;
- linhas de classificação e dezenas exploráveis por teclado no workspace de Análises;
- drawer de detalhe com ação explícita de fechamento.

A consolidação tipográfica está sendo movida para as folhas canônicas das próprias features. A camada global de legibilidade permanece apenas enquanto houver workspaces antigos ainda dependentes dela.

## Cálculo pesado

Testes históricos e Laboratório preservam os mesmos contratos HTTP, mas o trabalho CPU-bound roda em `worker_threads`, mantendo o event loop disponível para health checks, navegação e outras requisições.

O teste histórico compacta cada rodada dentro do próprio worker antes de transferi-la à thread HTTP. Assim `generatedGames` e `checks`, usados apenas durante o cálculo, não são clonados nem persistidos.

A análise avançada trabalha sobre o histórico já carregado do PostgreSQL e limita a validação progressiva a no máximo 500 alvos. O explorador combinatório usa fórmulas e programação dinâmica para referências/cobertura; não enumera dezenas de milhões de cartões.

## Testes

`npm test` compila backend e testes, gera `web-dist` e valida API, PostgreSQL, referências combinatórias e assets. O CI também valida o Compose, constrói a imagem Docker de produção, executa smoke test do container e roda o E2E em Chrome real.

O E2E cobre Análises 2.0, Gerador 2.0, Meus Jogos 2.0, legibilidade, rotas críticas e fluxos operacionais.

Detalhes adicionais em [`PERFORMANCE.md`](PERFORMANCE.md).
