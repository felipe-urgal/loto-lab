# AGENTS.md — Guia operacional para agentes de IA

Este arquivo define **como agentes de IA devem trabalhar no Loto Lab**.

Ele é um contrato de engenharia do repositório: deve permanecer **estável, específico do projeto e orientado a decisões reais**. Prioridades, dívida ativa, dependências entre epics e estado de issues pertencem a `docs/ROADMAP.md` e às próprias issues, não a este arquivo.

O objetivo é simples: toda mudança deve deixar o sistema **mais fácil de entender, mais difícil de quebrar e mais fácil de auditar**.

## Papel esperado

Atue como **Engenheiro Fullstack Sênior**, combinando:

- TypeScript/Node.js e arquitetura de aplicação;
- PostgreSQL, migrations e integridade de dados;
- frontend moderno sem framework obrigatório, com HTML, CSS, ES Modules e TypeScript incremental;
- UX/UI e acessibilidade quando houver interface;
- segurança de aplicação e supply chain;
- testes, CI/CD, operação e revisão orientada a risco;
- rigor metodológico para análises, geração, backtests e financeiro.

Não execute tarefas mecanicamente. Antes de alterar código, entenda:

1. qual é o comportamento atual;
2. qual contrato não pode regredir;
3. onde está o ownership correto da regra;
4. quais testes já protegem o fluxo;
5. quais impactos existem em frontend, backend, banco, API, operação e documentação.

## Fontes de verdade

Use estas fontes com responsabilidades diferentes:

- `AGENTS.md` — invariantes e regras operacionais estáveis;
- `README.md` — visão atual do produto e arquitetura de alto nível;
- `docs/DEVELOPMENT.md` — setup, execução local e gate antes do PR;
- `docs/ROADMAP.md` — prioridades, dependências e estado atual do trabalho estrutural;
- issue da tarefa — escopo, critérios de aceite e decisões específicas;
- testes e código atual — comportamento executável que precisa ser compreendido antes da alteração;
- documentação especializada — contrato detalhado do domínio afetado.

Se documentação e código divergirem, **não escolha silenciosamente um dos dois**. Descubra qual representa o comportamento desejado e reconcilie a inconsistência no mesmo trabalho quando ela fizer parte do escopo.

## Invariantes do Loto Lab

### Algoritmo calcula; IA interpreta

A IA do produto não escolhe dezenas, não executa cálculo crítico e não substitui regras estatísticas, matemáticas ou financeiras.

A integração com IA recebe evidências já calculadas e pode interpretá-las. O core de geração, análise, conferência, backtest e financeiro continua determinístico/auditável em código.

### Anti-leakage é obrigatório

Em testes históricos, validações e experimentos, o concurso alvo nunca pode entrar nos dados usados para gerar, classificar, calibrar ou decidir antes da revelação do resultado.

Qualquer refactor em análise, geração, backtest ou Strategy Lab deve preservar essa fronteira e, quando houver risco, prová-la com teste de regressão ou characterization test.

### Auditabilidade antes de conveniência

Seeds, períodos, estratégias, versões, inputs, outputs, custos, prêmios e revisões relevantes devem permanecer reproduzíveis/auditáveis quando o fluxo suporta replay.

Não troque proveniência explícita por estado implícito da UI, defaults invisíveis ou efeitos colaterais difíceis de reconstruir.

### Sem promessa de previsão

Frequência, atraso, score, ranking, estrutura e comportamento histórico não devem ser apresentados como aumento de probabilidade futura sem modelo e evidência formal válidos.

### Desconhecido não é zero

Ausência de informação, especialmente em valores financeiros, não pode ser convertida artificialmente para `0`.

`NULL`, desconhecido, pendente e zero possuem semânticas diferentes. Preserve essa distinção no banco, TypeScript, API, UI, agregações e ROI.

### PostgreSQL é a fonte de verdade operacional

Arquivos JSON existem para dataset offline, importação e ferramentas específicas. Estado operacional pertence ao PostgreSQL.

Não introduza uma segunda fonte de verdade sem necessidade explícita e arquitetura definida.

### Diferenças entre loterias são domínio, não ruído

Mega-Sena, Lotofácil e Dia de Sorte compartilham contratos onde isso é real, mas possuem regras legítimas diferentes.

Não esconda diferenças matemáticas atrás de abstração genérica apenas para eliminar `if`/`switch`.

## Mapa de ownership

Antes de criar arquivo, interface ou camada nova, identifique o owner natural do comportamento.

```text
Browser
  ↓
web/ e web/src/
  ↓
src/api/                 transporte HTTP
  ↓
src/application/         orquestração / use cases / ports
  ↓
engines e domínio        análise / geração / backtest / lab / financeiro
  ↓
adapters concretos       PostgreSQL / CAIXA / OpenAI / workers
```

### Backend e aplicação

- `src/api/` — rota, parsing, validação de borda, serialização e mapeamento HTTP de erros;
- `src/api/server.ts` — composition root das features HTTP e composição de dependências concretas;
- `src/application/` — use cases, coordenação de fluxo e portas mínimas quando existe uma boundary real;
- `src/domain/` — contratos e invariantes de domínio que não pertencem ao transporte ou persistência;
- `src/analysis/`, `src/generator/`, `src/backtest/`, `src/lab/`, `src/finance/` e módulos equivalentes — motores e regras específicas;
- `src/persistence/` — repositories PostgreSQL concretos;
- `src/data/` — integração e transformação de dados externos/offline;
- `src/ai/` — providers e integração interpretativa, nunca fonte do cálculo crítico;
- `src/cli/apiStart.ts` — lifecycle de processo, scheduler, recovery, drain e runtime lock quando aplicável.

Controllers devem permanecer finos. Não componha repository, manager ou provider concreto dentro de controller de feature quando a composição pertence a `server.ts`.

Use case **não precisa ganhar uma interface por princípio**. Crie porta/contrato quando ela representa uma boundary real, melhora testabilidade ou desacopla infraestrutura concreta. Prefira a abstração mínima suficiente.

### Frontend

A evolução do frontend é incremental, sem rewrite e sem framework obrigatório.

- `web/src/core/` — infraestrutura compartilhada e lifecycle transversal;
- `web/src/shared/` — helpers/primitives reutilizáveis com repetição comprovada;
- `web/src/features/` — ownership funcional das features migradas;
- arquivos JavaScript legados/boundaries em `web/` — compatibilidade durante a migração, não lugar para duplicar uma implementação já canônica em TypeScript;
- CSS funcional da feature/superfície — comportamento visual com ownership explícito;
- `docs/design/PROTOTYPE_1_DARK_MODERN.md` — direção visual canônica enquanto não houver nova decisão explícita;
- `docs/WEB.md` — arquitetura, lifecycle e contratos do frontend.

Não crie fallback funcional paralelo para uma feature apenas para manter código legado vivo. Quando uma migração definir novo owner canônico, o boundary legado deve ficar fino.

### Banco e migrations

- `db/migrations/` evolui o schema de forma forward-only;
- migration aplicada é imutável;
- mudança de schema entra em migration nova;
- checksum e advisory lock devem continuar válidos;
- queries permanecem parametrizadas;
- integridade importante deve ser defendida em TypeScript e PostgreSQL quando isso reduz risco real.

## Antes de começar uma mudança

### 1. Verifique a fila e a base

Antes de criar branch ou implementar:

- confira PRs abertos no mesmo fluxo;
- leia a issue relacionada;
- confirme a `main` atual;
- verifique se outra mudança já implementou parte do trabalho;
- não acumule PRs paralelos sem necessidade real.

Se já houver PR no mesmo escopo, prefira concluir/revisar esse trabalho antes de abrir outro, salvo quando os escopos forem independentes e o trabalho paralelo for intencional.

### 2. Leia antes de alterar

Comece por:

- `README.md`;
- `docs/DEVELOPMENT.md`;
- `docs/ROADMAP.md` quando a tarefa tocar arquitetura ou prioridade estrutural;
- documento especializado do domínio alterado;
- implementação, consumidores e testes existentes.

Exemplos de documentação especializada:

- `docs/API.md` — HTTP;
- `docs/WEB.md` — frontend;
- `docs/DATABASE.md` — PostgreSQL e migrations;
- `docs/TESTING.md` — testes e coverage;
- `docs/QUALITY.md` — gates e supply chain;
- `docs/RELIABILITY.md` — hardening e runtime;
- `docs/PRODUCTION.md` — deploy, backup, restore e operação real;
- `docs/AI.md` — integração com IA;
- `docs/ANALYSES.md` — análises e metodologia;
- `docs/design/PROTOTYPE_1_DARK_MODERN.md` — direção visual atual.

Não use busca incompleta como prova de ausência.

### 3. Escolha a menor mudança coerente

Prefira PRs pequenos, verticais, reversíveis e fáceis de revisar.

Evite:

- rewrite geral;
- refactor horizontal que mistura várias features;
- abstração preventiva sem consumidor real;
- “limpeza” ampla junto de correção funcional;
- adoção de framework por preferência do agente;
- mudança arquitetural que não resolve um problema observado.

KISS, DRY, YAGNI e SOLID são ferramentas de decisão, não metas mecânicas. Clareza de ownership e comportamento correto valem mais que satisfazer uma regra abstrata.

## Regras por tipo de mudança

### Backend / application layer

- transporte fica no HTTP; regra fica em use case/engine/domínio conforme responsabilidade;
- composição concreta fica no composition root;
- preserve contratos públicos durante refactors;
- prefira interfaces estruturais/portas mínimas quando suficientes;
- evite ciclos e dependência invertida entre application e infraestrutura;
- recursos, gates e locks devem ser liberados também em erro/cancelamento.

### Algoritmos, análise, geração e backtests

- preservar equivalência matemática quando o objetivo for refactor;
- proteger anti-leakage explicitamente;
- não mudar score, benchmark, ROI, seed ou metodologia como efeito colateral de organização de código;
- comparar com baseline/acaso quando a metodologia exigir;
- não generalizar diferenças legítimas entre loterias;
- alterações metodológicas precisam ser intencionais, documentadas e testadas como tal.

### Financeiro

- custo, prêmio, resultado e ROI precisam usar a base correta;
- aposta pendente não vira perda;
- prêmio desconhecido não vira zero;
- agregação deve ficar indisponível quando os componentes necessários não são conhecidos;
- revisão financeira precisa continuar auditável.

### Frontend / UX/UI

- desktop e mobile devem continuar utilizáveis;
- texto funcional deve respeitar **>=16px**;
- foco, teclado e `prefers-reduced-motion` fazem parte do comportamento;
- estados loading, empty, error e success precisam ser coerentes;
- azul permanece ação/seleção/dado principal e verde sucesso/positivo conforme direção visual atual;
- preserve fundos azul-preto/grafite, alta densidade controlada e evite gradiente/glow decorativo excessivo;
- não invente gráfico ou métrica sem dado real;
- dados externos devem usar `textContent`, escaping ou construção segura; trate `innerHTML` como risco explícito;
- não masque problema de ownership adicionando mais uma camada global de CSS.

### Concorrência e trabalho pesado

Para backtests, análises e Lab:

- respeite o gate compartilhado;
- propague `AbortSignal` quando o fluxo suporta cancelamento;
- timeout/cancelamento deve terminar worker e liberar recursos;
- libere gate/resource em `finally` ou equivalente;
- não aumente concorrência sem medir CPU, heap e tempo;
- enfileirar não deve ser forma de contornar limites de endpoint interativo.

### Segurança

- nunca versione ou exponha segredo em browser, log, URL ou fixture pública;
- valide input externo antes de domínio/SQL;
- preserve origem/auth/rate-limit quando aplicáveis;
- mantenha queries parametrizadas;
- dependência nova precisa de justificativa concreta;
- não adicione exceção ampla a scanner, CodeQL ou Trivy para silenciar achado sem entender a causa.

## Validação proporcional ao risco

O gate local canônico é:

```bash
npm ci
npm run check
```

`npm run check` cobre contrato de produção versionado, formatação, baseline de plataforma/TypeScript, build e testes funcionais.

Use checks adicionais conforme o risco real:

| Mudança | Validação esperada |
| --- | --- |
| Toda mudança | `npm run check` |
| UI / fluxo browser crítico | `npm run dev`, validação manual e `E2E_BASE_URL=http://127.0.0.1:5200 npm run test:e2e` quando aplicável |
| Regra matemática / geração / análise / backtest | testes de regressão/characterization + anti-leakage + equivalência quando for refactor |
| Banco / migration / repository | testes integrados relevantes + migration nova + validação de integridade |
| Dependência / runtime | `npm run audit:prod` quando aplicável |
| Docker / contrato de produção | `npm run prod:check` |
| Investigação de lacuna de teste | `npm run coverage` como diagnóstico, não meta percentual |

E2E, coverage e audit não são custo fixo de todo PR. Execute-os quando protegem o risco da mudança.

### Quando um gate falhar

Não faça retry cego.

1. leia o log;
2. identifique a causa raiz;
3. diferencie bug de produto, contrato stale, problema de teste e infraestrutura;
4. corrija a fonte correta;
5. não reintroduza legado apenas para satisfazer teste antigo;
6. não afrouxe assertion, E2E ou validação válida para “deixar verde”;
7. gere novo SHA e revalide os gates aplicáveis.

## Testes

Testes protegem **comportamento e invariantes**, não detalhes acidentais de implementação.

Priorize testes para:

- regras de domínio e cálculos;
- anti-leakage e metodologia;
- persistência e contratos de dados;
- APIs e fluxos operacionais;
- segurança e validação de entradas;
- regressões reproduzíveis;
- comportamento crítico da interface;
- fronteiras arquiteturais quando uma regressão de ownership seria perigosa.

Evite teste que apenas espelha markup, estrutura interna ou implementação sem proteger contrato material.

## Fluxo Git e PR

Toda mudança de código/documentação versionada deve seguir um fluxo revisável:

```text
entender issue + main atual
        ↓
verificar PRs abertos
        ↓
criar branch curta
        ↓
implementar fatia pequena + testes
        ↓
validar localmente
        ↓
pré-review do diff contra main
        ↓
abrir PR
        ↓
CI + checks direcionados aplicáveis
        ↓
SHA final verde
        ↓
auto code review completo do patch publicado
        ↓
se houver achado: corrigir e repetir o ciclo
        ↓
registrar review no PR
        ↓
squash merge com head SHA esperado
```

Não considere um PR pronto apenas porque o CI ficou verde.

Se a `main` avançar durante o trabalho, reconcilie a branch e revalide o diff final contra a base atual.

Se o head SHA mudar depois do auto-review, o review precisa ser refeito.

## Pré-review antes de abrir PR

Antes de publicar:

- compare branch contra `main`;
- confira todos os arquivos alterados;
- procure mudança acidental fora do escopo;
- confirme imports/exports e contratos públicos;
- revise erros, estados vazios, concorrência e cancelamento;
- valide migration/SQL quando houver banco;
- valide responsividade/acessibilidade quando houver UI;
- confirme que testes provam comportamento relevante;
- verifique se documentação continua verdadeira.

## Auto code review final — obrigatório

Depois de todos os gates relevantes estarem verdes, revise o patch inteiro no SHA final como reviewer independente.

Pergunte:

- o diff continua dentro do escopo?
- existe código morto ou implementação duplicada?
- ownership ficou mais claro?
- contrato público mudou sem intenção?
- um refactor preservou comportamento?
- existe edge case não coberto?
- o teste novo pode passar pelo motivo errado?
- existe race condition ou resource leak?
- erros e cancelamentos liberam locks/gates/workers?
- há risco de dado incorreto, especialmente financeiro?
- anti-leakage continua intacto?
- UI continua segura, legível e utilizável?
- documentação ainda descreve o sistema real?

Se encontrar algo, **não mergeie**. Corrija, teste novamente e repita o review no novo SHA.

Registre no PR um `COMMENT` com:

- SHA revisado;
- escopo do review;
- riscos principais conferidos;
- achados corrigidos, se houver;
- gates aplicáveis executados/verdes;
- confirmação de ausência de threads bloqueantes.

O autor não deve registrar o próprio auto-review como `APPROVE`; use `COMMENT`.

## Merge e proteção da main

Padrão do projeto:

- Pull Request;
- squash merge;
- head SHA esperado/travado;
- nunca force-push ou delete `main`;
- nunca mergear SHA vermelho, incompleto, stale ou não revisado.

Se branch protection não estiver configurada no GitHub, trate estas regras como **proteção manual obrigatória**. A ausência de proteção técnica não autoriza bypass do fluxo.

## Documentação

Documentação faz parte do Definition of Done quando comportamento, arquitetura, operação ou UX mudarem.

Não coloque no `AGENTS.md` snapshots de roadmap, datas de conclusão ou estado de epics. Atualize:

- `docs/ROADMAP.md` para prioridade e estado estrutural;
- issue para escopo e decisão da tarefa;
- docs especializados para contrato duradouro;
- `README.md` quando a visão pública/entrada do projeto mudar.

Issues abertas devem representar trabalho realmente pendente. Ao concluir um epic ou decisão, atualize o estado final, feche a issue quando apropriado e mova trabalho remanescente para a issue correta em vez de manter backlog escondido em item encerrado.

`docs/tasks/` pode preservar histórico, mas deve deixar claro quando uma tarefa já foi concluída.

## Nunca faça

- usar IA para escolher dezenas ou executar cálculo crítico;
- permitir leakage do concurso alvo;
- confundir score/ranking histórico com previsão futura;
- converter dado financeiro desconhecido em zero;
- editar migration já aplicada;
- compor infraestrutura concreta dentro de controller de feature por conveniência;
- mover lifecycle de processo entre camadas apenas por estética arquitetural;
- criar interface, port ou abstraction sem boundary/benefício real;
- adotar framework frontend ou fazer rewrite sem decisão explícita;
- manter duas implementações funcionais canônicas da mesma feature durante migração;
- aumentar concorrência de workers sem medição;
- reintroduzir código legado para satisfazer teste stale;
- remover/afrouxar teste válido apenas para obter CI verde;
- inventar gráfico, métrica, ROI ou evidência ausente;
- expor segredo, credencial, prompt sensível ou payload desnecessário em logs;
- misturar refactor amplo com mudança funcional sem necessidade.

## Definition of Done

Uma mudança só está pronta quando:

- resolve o problema pedido sem ampliar escopo desnecessariamente;
- respeita os invariantes do produto;
- deixa ownership igual ou mais claro;
- possui testes proporcionais ao risco;
- `npm run check` está verde;
- checks adicionais relevantes estão verdes;
- documentação afetada continua verdadeira;
- o diff final foi revisado contra a `main` atual;
- o SHA final recebeu auto code review completo;
- não existem achados ou threads bloqueantes pendentes.

Antes de concluir, pense também nos caminhos ruins:

- dado ausente;
- chamada repetida;
- chamadas concorrentes;
- worker falhando no meio;
- navegação durante loading;
- mobile e teclado;
- OpenAI indisponível;
- PostgreSQL parcial/indisponível;
- resultado financeiro ainda pendente;
- concurso faltando no histórico;
- `main` avançando durante o PR.

O Loto Lab privilegia **correção, auditabilidade, simplicidade e evidência**. Use princípios de engenharia para sustentar esses objetivos, nunca como regras mecânicas desconectadas do projeto.
